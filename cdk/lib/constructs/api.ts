import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Auth } from './auth';
import { WebAclForApi } from './webacl-for-api';

export interface ApiProps {
  auth: Auth;
  apiWaf: WebAclForApi;
  vtoImageBucket: s3.Bucket;
}

export class Api extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly vtoApiFunction: lambda.DockerImageFunction;
  public readonly vtoGenImageFunction: PythonFunction;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const { auth, apiWaf, vtoImageBucket } = props;

    // API Lambda関数用のログループを作成
    const vtoApiLogGroup = new logs.LogGroup(this, 'VtoApiLogGroup', {
      logGroupName: `/aws/lambda/VtoApiFunction`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // API Lambda関数の作成（Docker イメージを使用）
    this.vtoApiFunction = new lambda.DockerImageFunction(this, 'VtoApiFunction', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.resolve(process.cwd(), '../lambda/api'),
        {
          buildArgs: {
            // ビルド時の引数（必要に応じて）
          },
          platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64, // Lambda用にx86_64を明示的に指定
        }
      ),
      architecture: lambda.Architecture.X86_64, // Lambda関数のアーキテクチャも指定
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        LOG_LEVEL: 'INFO',
        PYTHONPATH: '/var/task',
        VTO_BUCKET: vtoImageBucket.bucketName,
        // Authentication environment variables
        USER_POOL_ID: auth.userPool.userPoolId,
        USER_POOL_CLIENT_ID: auth.userPoolClient.userPoolClientId,
        REGION: cdk.Stack.of(this).region,
      },
      logGroup: vtoApiLogGroup,
      description: 'VTO API Lambda function with FastAPI',
    });

    // VTO画像生成Lambda関数の作成
    this.vtoGenImageFunction = new PythonFunction(
      this, "GenImageFunction", 
      {
        // functionName: `GenImageFunction`,
        memorySize: 1024,
        timeout: Duration.minutes(15),
        runtime: lambda.Runtime.PYTHON_3_13,
        entry: path.resolve(process.cwd(), '../lambda/gen_vto_image'),
        environment: {
          ACCOUNT: cdk.Stack.of(this).account,
          REGION: cdk.Stack.of(this).region,
          LOG_LEVEL: 'INFO',
          VTO_BUCKET: vtoImageBucket.bucketName,
        }
    });

    // API LambdaにVTO生成Lambda関数の情報を環境変数として追加
    this.vtoApiFunction.addEnvironment('VTO_GEN_FUNCTION_NAME', this.vtoGenImageFunction.functionName);

    // REST API Gatewayの作成
    this.api = new apigateway.RestApi(this, 'VtoApi', {
      description: 'Virtual Try-On REST API',
      deployOptions: {
        stageName: 'prod',
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
      // CloudWatch Logsロールを自動作成しない
      cloudWatchRole: false,
    });

    // Cognito Authorizer for REST API
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [auth.userPool],
      identitySource: 'method.request.header.Authorization',
    });

    // Lambda統合の作成
    const lambdaIntegration = new apigateway.LambdaIntegration(this.vtoApiFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    // プロキシ統合の設定（FastAPIのすべてのルートをLambdaに転送）
    const proxyResource = this.api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: authorizer,
      },
    });

    // WAF Web ACLをAPI Gatewayに関連付け（デプロイメント完了後）
    const wafAssociation = new wafv2.CfnWebACLAssociation(this, 'ApiWafAssociation', {
      resourceArn: `arn:aws:apigateway:${cdk.Stack.of(this).region}::/restapis/${this.api.restApiId}/stages/prod`,
      webAclArn: apiWaf.webAcl.attrArn,
    });

    // API Gatewayのデプロイメントが完了してからWAFを関連付ける
    wafAssociation.node.addDependency(this.api.deploymentStage);

    // S3バケットへの読み書き権限をLambda関数に付与
    vtoImageBucket.grantReadWrite(this.vtoApiFunction);
    vtoImageBucket.grantReadWrite(this.vtoGenImageFunction);

    // API LambdaにVTO生成Lambda関数を呼び出す権限とBedrock権限を付与
    this.vtoApiFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction',
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        this.vtoGenImageFunction.functionArn,
        '*' // Bedrock models
      ],
    }));

    // Bedrock権限をVTO生成Lambda関数に付与
    // Nova Canvas, Titan, Nova 2 Omni, Nova Lite, Nova Microをサポート
    this.vtoGenImageFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.nova-canvas-v1:0`,
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-image-generator-v2:0`,
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/us.amazon.nova-2-omni-v1:0`,
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/us.amazon.nova-lite-v1:0`,
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/us.amazon.nova-micro-v1:0`,
      ],
    }));
  }
}

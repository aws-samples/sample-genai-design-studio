import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnOutput, RemovalPolicy, StackProps } from "aws-cdk-lib";
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Auth } from './constructs/auth';
import { WebAclForApi } from './constructs/webacl-for-api';
import { Frontend } from './constructs/frontend';
import { Api } from './constructs/api';

export interface VtoAppStackProps extends StackProps {
  wafWebAclArn?: string; // CloudFront用WAF Web ACL ARN
  ipV6Enabled?: boolean; // IPv6サポートを有効にするかどうか
}


export class VtoAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: VtoAppStackProps) {
    super(scope, id, {
      description:
        "Genai Design Studio Stack for Virtual Try-On (uksb-0qdenu9bhz)",
      ...props,
    });

    // Get configuration from context
    const allowedIpV4AddressRanges = this.node.tryGetContext('allowedIpV4AddressRanges') || [];
    const allowedIpV6AddressRanges = this.node.tryGetContext('allowedIpV6AddressRanges') || [];
    const allowedSignUpEmailDomains = this.node.tryGetContext('allowedSignUpEmailDomains') || [];
    const selfSignUpEnabled = this.node.tryGetContext('selfSignUpEnabled') ?? true;

    // Create authentication construct
    const auth = new Auth(this, 'Auth', {
      allowedSignUpEmailDomains,
      selfSignUpEnabled,
    });

    // Create WAF for API Gateway - testing step by step
    const apiWaf = new WebAclForApi(this, 'ApiWaf', {
      allowedIpV4AddressRanges,
      allowedIpV6AddressRanges,
    });


    // WAF ARNはFrontendWafStackから取得
    const wafWebAclArn = props?.wafWebAclArn;
    const ipV6Enabled = props?.ipV6Enabled ?? true;

    // S3バケットの作成（生成画像保存用）
    const vtoImageBucket = new s3.Bucket(this, 'VtoImageBucket', {
      bucketName: `vto-images-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY, // 開発環境用設定
      autoDeleteObjects: true, // 開発環境用設定
      cors: [{
        allowedMethods: [
          s3.HttpMethods.GET,
          s3.HttpMethods.PUT,
          s3.HttpMethods.POST,
          s3.HttpMethods.DELETE,
        ],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000,
      }],
    });

    // Create API construct (Lambda functions and API Gateway)
    const api = new Api(this, 'Api', {
      auth,
      apiWaf,
      vtoImageBucket,
    });

    // Create Frontend construct with new NodejsBuild pattern
    const frontend = new Frontend(this, 'Frontend', {
      webAclId: wafWebAclArn, // WAF ARNをFrontendWafStackから取得
      enableIpV6: ipV6Enabled,
    });
    
    // Build frontend using the NodejsBuild construct
    frontend.buildViteApp({
      backendApiEndpoint: api.api.url,
      auth: auth,
      vtoBucket: vtoImageBucket.bucketName,
      vtoGenFunctionName: api.vtoGenImageFunction.functionName,
    });

    // 出力
    new CfnOutput(this, 'ApiUrl', {
      value: api.api.url,
      description: 'API Gateway URL',
    });

    new CfnOutput(this, 'LambdaFunctionName', {
      value: api.vtoApiFunction.functionName,
      description: 'Lambda function name',
    });

    new CfnOutput(this, 'GenImageFunctionName', {
      value: api.vtoGenImageFunction.functionName,
      description: 'Gen VTO Image Lambda function name',
    });

    new CfnOutput(this, 'VtoImageBucketName', {
      value: vtoImageBucket.bucketName,
      description: 'S3 bucket name for VTO images',
    });
  }
}

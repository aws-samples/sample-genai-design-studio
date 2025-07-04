import { Construct } from "constructs";
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import {
  CachePolicy,
  Distribution,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { NodejsBuild } from "deploy-time-build";
import * as path from 'path';

export interface FrontendProps {
  readonly webAclId?: string; // WAF Web ACL ID or ARN
  readonly enableIpV6?: boolean;
  readonly vtoBucket?: string;
  readonly vtoGenFunctionName?: string;
  readonly alternateDomainName?: string;
  readonly hostedZoneId?: string;
}

export class Frontend extends Construct {
  readonly cloudFrontWebDistribution: Distribution;
  readonly assetBucket: Bucket;
  private readonly alternateDomainName?: string;

  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);

    this.alternateDomainName = props.alternateDomainName;

    this.assetBucket = new Bucket(this, "AssetBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.cloudFrontWebDistribution = new Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.assetBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      // Required to pass AwsSolutions-CFR4 check
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses: [
        {
          httpStatus: 404,
          ttl: Duration.seconds(0),
          responseHttpStatus: 200,
          responsePagePath: "/",
        },
        {
          httpStatus: 403,
          ttl: Duration.seconds(0),
          responseHttpStatus: 200,
          responsePagePath: "/",
        },
      ],
      webAclId: props.webAclId,
      enableIpv6: props.enableIpV6 ?? true,
    });

    // ReactBuild is created later in buildViteApp, so we'll add suppressions there

    // Outputs
    new CfnOutput(this, 'AssetBucketName', {
      value: this.assetBucket.bucketName,
      description: 'S3 bucket name for frontend assets',
    });

    new CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.cloudFrontWebDistribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: this.cloudFrontWebDistribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.cloudFrontWebDistribution.distributionDomainName}`,
      description: 'Frontend URL',
    });
  }

  getOrigin(): string {
    if (this.alternateDomainName) {
      return `https://${this.alternateDomainName}`;
    }
    return `https://${this.cloudFrontWebDistribution.distributionDomainName}`;
  }

  buildViteApp({
    backendApiEndpoint,
    auth,
    vtoBucket,
    vtoGenFunctionName,
  }: {
    backendApiEndpoint: string;
    auth: any;
    vtoBucket: string;
    vtoGenFunctionName: string;
  }) {
    const region = Stack.of(this).region;
    const buildEnvProps = (() => {
      const defaultProps = {
        VITE_APP_API_ENDPOINT: backendApiEndpoint,
        VITE_APP_USER_POOL_ID: auth.userPool.userPoolId,
        VITE_APP_USER_POOL_CLIENT_ID: auth.userPoolClient.userPoolClientId,
        VITE_APP_REGION: region,
        VITE_API_BASE_URL: backendApiEndpoint,
        VITE_VTO_BUCKET: vtoBucket,
        VITE_GEN_IMAGE_FUNCTION_NAME: vtoGenFunctionName,
      };

      return defaultProps;
    })();

    const reactBuild = new NodejsBuild(this, "ReactBuild", {
      assets: [
        {
          path: path.join(__dirname, "../../../frontend/"),
          exclude: [
            "node_modules",
            "dist",
            "dev-dist",
            ".env",
            ".env.local",
            "../cdk/**/*",
            "../lambda/**/*",
            "../docs/**/*",
            "../.github/**/*",
          ],
          commands: ["npm ci"],
        },
      ],
      buildCommands: ["npm run build"],
      buildEnvironment: buildEnvProps,
      destinationBucket: this.assetBucket,
      distribution: this.cloudFrontWebDistribution,
      outputSourceDirectory: "dist",
    });

    // This is a workaround for the issue where the BucketDeployment construct
    // does not have permissions to create CloudFront invalidations
    const bucketDeploy = reactBuild.node
      .findAll()
      .find(
        (c) => c instanceof s3deploy.BucketDeployment
      ) as s3deploy.BucketDeployment;

    bucketDeploy?.handlerRole?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
        ],
        resources: [
          `arn:aws:cloudfront::${Stack.of(this).account}:distribution/${
            this.cloudFrontWebDistribution.distributionId
          }`,
        ],
      })
    );

    // Output build environment variables for reference
    new CfnOutput(this, 'FrontendBuildEnvVars', {
      value: JSON.stringify(buildEnvProps, null, 2),
      description: 'Environment variables needed for frontend build',
    });
  }

}

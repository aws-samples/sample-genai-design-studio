# Deployment Guide

## Prerequisites
### Bedrock
Enable Nova models and Claude Haiku 3 in one of the following regions: us-east-1, ap-northeast-1, or eu-west-1. This sample uses Nova Canvas image generation models (only available in us-east-1, ap-northeast-1, and eu-west-1), Nova Micro/Lite text models, and Claude Haiku 3.
Go to [Bedrock Model access](https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess) > `Manage model access`, check the entire Nova model family and Claude Haiku 3, and click `Save changes`.

### CDK Execution Environment
To deploy CDK projects, the following environment is required. Please set up the environment in advance.

- Docker: Set up the environment to execute docker commands. Note that business use of Docker Desktop often requires [subscription contracts](https://www.docker.com/legal/docker-subscription-service-agreement/).
- Node.js (v18 or higher): Set up the environment to execute npx commands.
- Python 3.12 or higher
- AWS CLI configured
- AWS Credentials Configuration: Can be configured with `aws configure`. Please refer to [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html) for details.

## Setup

### 1. Install Project Dependencies

```bash
# Install CDK dependencies
cd cdk
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. CDK Bootstrap (First time only)

```bash
cd cdk
npx cdk bootstrap
```

### 3. Verify Optional Parameters in cdk.json

By modifying [cdk.json](../../cdk/cdk.json) during deployment, security enhancements and other configurations are possible.
- selfSignUpEnabled: Disables self-registration (default: enabled). When this flag is set, all users must be created on Cognito, and users cannot register accounts themselves.
- allowedIpV4AddressRanges: Comma-separated list of allowed IPv4 ranges. (Default: allows all IPv4 addresses)
- allowedIpV6AddressRanges: Comma-separated list of allowed IPv6 ranges. (Default: allows all IPv6 addresses)
- allowedSignUpEmailDomains: Comma-separated list of email domains allowed during sign-up (specify domains without the "@" symbol). (Default: no domain restrictions)
- autoJoinUserGroups: Comma-separated list of Cognito user groups that new users automatically join. (Default: admin)
- deploymentRegion: Deployment region. Specify a region where Nova Canvas is available (us-east-1, ap-northeast-1, eu-west-1). (Default: us-east-1)

```json
{
  "context": {
    "allowedIpV4AddressRanges": ["0.0.0.0/1", "128.0.0.0/1"],
    "allowedIpV6AddressRanges": ["0000:0000:0000:0000:0000:0000:0000:0000/1", "8000:0000:0000:0000:0000:0000:0000:0000/1"],
    "identityProviders": [],
    "userPoolDomainPrefix": "",
    "allowedSignUpEmailDomains": ["example.co.jp", "company.com"],
    "autoJoinUserGroups": ["admin"],
    "selfSignUpEnabled": true,
    "deploymentRegion": "us-east-1"
  }
}
```

## Deployment
### Full Deployment (Recommended)

```bash
cd cdk
npx cdk deploy --all --require-approval never --outputs-file ./.cdk-outputs.json
```
Upon completion of deployment, the following outputs will be displayed:
- CloudFront Distribution URL (frontend)
- API Gateway URL (backend API)
- Cognito User Pool ID
- S3 Bucket names

### Post-deployment Verification

   After deployment is complete, the frontend URL and API URL will be displayed.
   You can access the displayed URL to start using the application.

> [!Important]
> With this deployment method, if optional parameters are not configured, anyone who knows the URL can sign up.
For production use, we strongly recommend adding IP address restrictions or disabling self sign-up by setting `selfSignUpEnabled: false` in cdk.json.

## Cleanup

To delete resources:

```bash
cd cdk
npx cdk destroy --all

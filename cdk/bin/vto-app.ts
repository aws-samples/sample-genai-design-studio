#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VtoAppStack } from '../lib/vto-app-stack';
import { FrontendWafStack } from '../lib/frontend-waf-stack';
// import { Aspects } from 'aws-cdk-lib';
// import { AwsSolutionsChecks } from 'cdk-nag';

const app = new cdk.App();
// // Simple rule informational messages using the AWS Solutions Rule pack
// Aspects.of(app).add(new AwsSolutionsChecks());

// CloudFrontのWAFはus-east-1リージョンでのみ作成可能
// そのためWAF用のスタックを別途作成し、クロスリージョン参照を有効にする
const wafStack = new FrontendWafStack(app, 'VtoAppFrontendWafStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1' // CloudFront WAF用スタックは必ずus-east-1に作成
  },
  allowedIpV4AddressRanges: app.node.tryGetContext('allowedIpV4AddressRanges') || [],
  allowedIpV6AddressRanges: app.node.tryGetContext('allowedIpV6AddressRanges') || []
});

// メインのアプリケーションスタック
const deploymentRegion = app.node.tryGetContext('deploymentRegion') || process.env.CDK_DEFAULT_REGION;
new VtoAppStack(app, 'VtoAppStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: deploymentRegion
  },
  crossRegionReferences: true, // クロスリージョン参照を有効化
  wafWebAclArn: wafStack.webAclArn.value, // us-east-1のWAF ARNを参照
  ipV6Enabled: wafStack.ipV6Enabled
});

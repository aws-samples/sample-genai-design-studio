import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Duration } from 'aws-cdk-lib';

import { Construct } from 'constructs';

export interface AuthProps {
  allowedSignUpEmailDomains?: string[];
  selfSignUpEnabled?: boolean;
}

// Cognito related resources
export class Auth extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: AuthProps) {
    super(scope, id);

    // Get configuration from context or props
    const selfSignUpEnabled = props?.selfSignUpEnabled ?? this.node.tryGetContext('selfSignUpEnabled') ?? true;
    const allowedSignUpEmailDomains = props?.allowedSignUpEmailDomains ?? [];

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      userVerification: {
        emailSubject: 'VTO App - Verify your email',
        emailBody: 'Hello, Thank you for signing up for VTO App! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      selfSignUpEnabled: selfSignUpEnabled
    });

    // メールドメイン制限が設定されている場合のみLambda関数を作成
    if (allowedSignUpEmailDomains.length >= 1) {
      const checkEmailDomainFunction = new PythonFunction(
        this,
        'CheckEmailDomain',
        {
          runtime: lambda.Runtime.PYTHON_3_12,
          index: 'app.py',
          entry: path.join(
            __dirname,
            '../../../lambda/cognito_triggers/pre_sign_up'
          ),
          timeout: Duration.minutes(1),
          environment: {
            // 許可ドメインリストをJSON文字列として環境変数に設定
            ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR: JSON.stringify(allowedSignUpEmailDomains),
          },
        }
      );

      // Cognito UserPool の Pre Sign-up トリガーとして登録
      this.userPool.addTrigger(
        cognito.UserPoolOperation.PRE_SIGN_UP,
        checkEmailDomainFunction
      );
    }

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: {
        userPassword: true,
        userSrp: true
      }
    });

    // 出力値の設定
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}

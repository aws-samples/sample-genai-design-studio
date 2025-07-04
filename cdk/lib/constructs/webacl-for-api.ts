import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface WebAclForApiProps {
  allowedIpV4AddressRanges: string[];
  allowedIpV6AddressRanges: string[];
}

export class WebAclForApi extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WebAclForApiProps) {
    super(scope, id);

    // Create IP sets for IPv4 addresses
    const ipV4Set = new wafv2.CfnIPSet(this, 'AllowedIPv4Set', {
      name: `${cdk.Stack.of(this).stackName}-allowed-ipv4`,
      scope: 'REGIONAL', // For API Gateway
      ipAddressVersion: 'IPV4',
      addresses: props.allowedIpV4AddressRanges,
      description: 'Allowed IPv4 addresses for API access',
    });

    // Create IP sets for IPv6 addresses
    const ipV6Set = new wafv2.CfnIPSet(this, 'AllowedIPv6Set', {
      name: `${cdk.Stack.of(this).stackName}-allowed-ipv6`,
      scope: 'REGIONAL', // For API Gateway
      ipAddressVersion: 'IPV6',
      addresses: props.allowedIpV6AddressRanges,
      description: 'Allowed IPv6 addresses for API access',
    });

    // Create CloudWatch Log Group for WAF logs (must start with aws-waf-logs-)
    const logGroup = new logs.LogGroup(this, 'WAFLogGroup', {
      logGroupName: `aws-waf-logs-${cdk.Stack.of(this).stackName}-api`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create WAF Web ACL
    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `${cdk.Stack.of(this).stackName}-api-waf`,
      scope: 'REGIONAL', // For API Gateway
      defaultAction: {
        block: {}, // Default action: BLOCK (whitelist approach)
      },
      description: 'WAF for API Gateway with IP restrictions',
      rules: [
        {
          name: 'AllowedIPv4Rule',
          priority: 1,
          statement: {
            ipSetReferenceStatement: {
              arn: ipV4Set.attrArn,
            },
          },
          action: {
            allow: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AllowedIPv4Rule',
          },
        },
        {
          name: 'AllowedIPv6Rule',
          priority: 2,
          statement: {
            ipSetReferenceStatement: {
              arn: ipV6Set.attrArn,
            },
          },
          action: {
            allow: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AllowedIPv6Rule',
          },
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 10,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              excludedRules: [],
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric',
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 20,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
              excludedRules: [],
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsRuleSetMetric',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${cdk.Stack.of(this).stackName}ApiWebAcl`,
      },
    });

    // Configure logging for WAF (simplified without loggingFilter for now)
    new wafv2.CfnLoggingConfiguration(this, 'WAFLoggingConfig', {
      resourceArn: this.webAcl.attrArn,
      logDestinationConfigs: [logGroup.logGroupArn],
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAcl.attrArn,
      description: 'WAF Web ACL ARN for API Gateway',
    });

    new cdk.CfnOutput(this, 'WebAclId', {
      value: this.webAcl.attrId,
      description: 'WAF Web ACL ID for API Gateway',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface FrontendWafStackProps extends cdk.StackProps {
  allowedIpV4AddressRanges: string[];
  allowedIpV6AddressRanges: string[];
}

/**
 * CloudFront用のWAFスタック
 * 注意: CloudFront用WAFはus-east-1リージョンにのみ作成可能
 */
export class FrontendWafStack extends cdk.Stack {
  public readonly webAclArn: cdk.CfnOutput;
  public readonly ipV6Enabled: boolean;

  constructor(scope: Construct, id: string, props: FrontendWafStackProps) {
    super(scope, id, props);

    this.ipV6Enabled = props.allowedIpV6AddressRanges && props.allowedIpV6AddressRanges.length > 0;

    // Create IP sets for IPv4 addresses
    const ipV4Set = new wafv2.CfnIPSet(this, 'AllowedIPv4Set', {
      name: `${this.stackName}-frontend-allowed-ipv4`,
      scope: 'CLOUDFRONT', // For CloudFront distribution - must be CLOUDFRONT
      ipAddressVersion: 'IPV4',
      addresses: props.allowedIpV4AddressRanges,
      description: 'Allowed IPv4 addresses for frontend access',
    });

    // WebACL rules array
    const rules: wafv2.CfnWebACL.RuleProperty[] = [
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
    ];

    // Create IP sets for IPv6 addresses if provided
    if (this.ipV6Enabled) {
      const ipV6Set = new wafv2.CfnIPSet(this, 'AllowedIPv6Set', {
        name: `${this.stackName}-frontend-allowed-ipv6`,
        scope: 'CLOUDFRONT', // For CloudFront distribution
        ipAddressVersion: 'IPV6',
        addresses: props.allowedIpV6AddressRanges,
        description: 'Allowed IPv6 addresses for frontend access',
      });

      rules.push({
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
      });
    }

    // Create CloudWatch Log Group for WAF logs (must start with aws-waf-logs-)
    const logGroup = new logs.LogGroup(this, 'WAFLogGroup', {
      logGroupName: `aws-waf-logs-${this.stackName}-frontend`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create WAF Web ACL for CloudFront
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `${this.stackName}-frontend-waf`,
      scope: 'CLOUDFRONT', // For CloudFront distribution - must be CLOUDFRONT
      defaultAction: {
        block: {}, // Default action: BLOCK (whitelist approach)
      },
      description: 'WAF for CloudFront distribution with IP restrictions',
      rules: [
        ...rules,
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
              excludedRules: [
                // Exclude rules that might block legitimate traffic
                {
                  name: 'SizeRestrictions_BODY',
                },
                {
                  name: 'GenericRFI_BODY',
                },
              ],
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
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 30,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
              excludedRules: [],
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AmazonIpReputationListMetric',
          },
        },
        {
          name: 'RateLimitRule',
          priority: 40,
          statement: {
            rateBasedStatement: {
              limit: 2000, // Requests per 5-minute window
              aggregateKeyType: 'IP',
            },
          },
          action: {
            block: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${this.stackName}FrontendWebAcl`,
      },
    });

    // Configure logging for WAF
    new wafv2.CfnLoggingConfiguration(this, 'WAFLoggingConfig', {
      resourceArn: webAcl.attrArn,
      logDestinationConfigs: [logGroup.logGroupArn],
    });

    // Outputs
    this.webAclArn = new cdk.CfnOutput(this, 'WebAclArn', {
      value: webAcl.attrArn,
      description: 'WAF Web ACL ARN for CloudFront',
      exportName: `${this.stackName}-WebAclArn`,
    });

    new cdk.CfnOutput(this, 'WebAclId', {
      value: webAcl.attrId,
      description: 'WAF Web ACL ID for CloudFront',
    });
  }
}

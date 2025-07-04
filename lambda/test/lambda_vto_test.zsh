#!/bin/bash

# Remote Lambda test script for gen_vto_image function
# This script tests the deployed Lambda function using boto3

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

echo "=== Remote Lambda Test for gen_vto_image ==="

# Check if boto3 is installed
python3 -c "import boto3" 2>/dev/null || {
    echo "Error: boto3 is not installed"
    echo "Install with: pip install boto3"
    exit 1
}

# Check AWS credentials
aws sts get-caller-identity >/dev/null || {
    echo "Error: AWS credentials not configured"
    echo "Configure with: aws configure"
    exit 1
}

echo "AWS credentials verified"

# CDK outputs file path
CDK_OUTPUTS_FILE="${PROJECT_ROOT}/vto-app/cdk/.cdk-outputs.json"

# Check if CDK outputs file exists
if [ ! -f "${CDK_OUTPUTS_FILE}" ]; then
    echo "Error: CDK outputs file not found: ${CDK_OUTPUTS_FILE}"
    echo "Make sure the Lambda function is deployed"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed."
    echo "Please install jq: brew install jq (on macOS) or apt-get install jq (on Ubuntu)"
    exit 1
fi

# Extract parameters from CDK outputs
echo "Reading parameters from CDK outputs..."
LAMBDA_FUNCTION_NAME=$(jq -r '.VtoAppStack.GenImageFunctionName' "${CDK_OUTPUTS_FILE}")
VTO_BUCKET=$(jq -r '.VtoAppStack.VtoImageBucketName' "${CDK_OUTPUTS_FILE}")

# Validate Lambda function name
if [ -z "$LAMBDA_FUNCTION_NAME" ] || [ "$LAMBDA_FUNCTION_NAME" = "null" ]; then
    # フォールバック値を設定
    LAMBDA_FUNCTION_NAME="VtoAppStack-GenImageFunction12D690F1-AvX6yJvVr1B4"
    echo "Using fallback Lambda function name: $LAMBDA_FUNCTION_NAME"
else
    echo "Lambda function name: $LAMBDA_FUNCTION_NAME"
fi

# Validate S3 bucket name
if [ "${VTO_BUCKET}" = "null" ] || [ -z "${VTO_BUCKET}" ]; then
    echo "Error: Could not extract VtoImageBucketName from CDK outputs"
    exit 1
fi

echo "S3 Bucket: ${VTO_BUCKET}"

# Check if Lambda function exists
aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" >/dev/null || {
    echo "Error: Lambda function not found: $LAMBDA_FUNCTION_NAME"
    echo "Make sure the Lambda function is deployed"
    exit 1
}

echo "Lambda function verified"

# Change to test directory
cd "${SCRIPT_DIR}"

# Set environment variable for VTO bucket
export VTO_BUCKET="${VTO_BUCKET}"

# Run the Python test script in remote mode
echo "Running remote Lambda tests..."
echo "Using VTO_BUCKET: ${VTO_BUCKET}"
python3 test_gen_vto_image.py --mode remote --region us-east-1

echo "=== Remote Lambda Test Completed ==="

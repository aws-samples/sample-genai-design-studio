#!/bin/bash

# Nova VTO API test runner script with Cognito authentication
# This script reads parameters from CDK outputs and runs the test

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
CDK_OUTPUTS_FILE="${SCRIPT_DIR}/../../cdk/.cdk-outputs.json"
USERNAME=""
PASSWORD=""
AUTH_CONFIG_FILE="${SCRIPT_DIR}/.apiconfig.json"
FIRST_RUN="false"

# Function to show help
function show_help {
    echo "Usage: $0 --username <username> --password <password> [options] [test_method]"
    echo ""
    echo "Required arguments:"
    echo "  --username <username>   Cognito username for authentication (will be used as email)"
    echo "  --password <password>   Cognito password for authentication"
    echo ""
    echo "Optional arguments:"
    echo "  --cdk-outputs <file>    Path to CDK outputs file (default: ${CDK_OUTPUTS_FILE})"
    echo "  --first-run             First run - create new user (default: false)"
    echo "  --no-remote             Disable remote mode"
    echo "  --help                  Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --username testuser --password Password123!"
    echo "  $0 --username testuser --password Password123! test_health_check"
    echo "  $0 --username testuser --password Password123! --first-run"
    exit 1
}

# Parse command line arguments
REMAINING_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --username)
            USERNAME="$2"
            shift 2
            ;;
        --password)
            PASSWORD="$2"
            shift 2
            ;;
        --cdk-outputs)
            CDK_OUTPUTS_FILE="$2"
            shift 2
            ;;
        --first-run)
            FIRST_RUN="true"
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            # Collect remaining arguments
            REMAINING_ARGS+=("$1")
            shift
            ;;
    esac
done

# Check required parameters
if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
    echo -e "${RED}Error: Username and password are required parameters${NC}"
    show_help
fi

# Check if CDK outputs file exists
if [ ! -f "${CDK_OUTPUTS_FILE}" ]; then
    echo -e "${RED}Error: CDK outputs file not found: ${CDK_OUTPUTS_FILE}${NC}"
    echo "Please run 'cdk deploy' first to generate the outputs file."
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed.${NC}"
    echo "Please install jq: brew install jq (on macOS) or apt-get install jq (on Ubuntu)"
    exit 1
fi

# Extract parameters from CDK outputs
echo -e "${YELLOW}Reading parameters from CDK outputs...${NC}"

# VtoAppStack is the stack containing all our resources
STACK_NAME="VtoAppStack"

# Check if stack exists in CDK outputs
if ! jq -e ".${STACK_NAME}" "${CDK_OUTPUTS_FILE}" > /dev/null 2>&1; then
    echo -e "${RED}Error: Stack '${STACK_NAME}' not found in CDK outputs${NC}"
    exit 1
fi

echo "Using stack: ${STACK_NAME}"

# Extract all parameters
API_URL=$(jq -r ".${STACK_NAME}.ApiUrl" "${CDK_OUTPUTS_FILE}")
BUCKET_NAME=$(jq -r ".${STACK_NAME}.VtoImageBucketName" "${CDK_OUTPUTS_FILE}")
USER_POOL_ID=$(jq -r ".${STACK_NAME}.AuthUserPoolIdC0605E59" "${CDK_OUTPUTS_FILE}")
CLIENT_ID=$(jq -r ".${STACK_NAME}.AuthUserPoolClientId8216BF9A" "${CDK_OUTPUTS_FILE}")

# Extract region from UserPoolId (format: region_xxxxx)
REGION=$(echo "${USER_POOL_ID}" | cut -d'_' -f1)

# Validate extracted parameters
if [ "${API_URL}" = "null" ] || [ -z "${API_URL}" ]; then
    echo -e "${RED}Error: Could not extract ApiUrl from CDK outputs${NC}"
    exit 1
fi

if [ "${BUCKET_NAME}" = "null" ] || [ -z "${BUCKET_NAME}" ]; then
    echo -e "${RED}Error: Could not extract VtoImageBucketName from CDK outputs${NC}"
    exit 1
fi

if [ "${USER_POOL_ID}" = "null" ] || [ -z "${USER_POOL_ID}" ]; then
    echo -e "${RED}Error: Could not extract UserPoolId from CDK outputs${NC}"
    exit 1
fi

if [ "${CLIENT_ID}" = "null" ] || [ -z "${CLIENT_ID}" ]; then
    echo -e "${RED}Error: Could not extract UserPoolClientId from CDK outputs${NC}"
    exit 1
fi

echo -e "${GREEN}Parameters extracted successfully:${NC}"
echo "  API URL: ${API_URL}"
echo "  S3 Bucket: ${BUCKET_NAME}"
echo "  User Pool ID: ${USER_POOL_ID}"
echo "  Client ID: ${CLIENT_ID}"
echo "  Region: ${REGION}"
echo ""

# Change to test directory
cd "${SCRIPT_DIR}"

# Check if test script exists
TEST_SCRIPT="test_nova_vto_api.py"
if [ ! -f "${TEST_SCRIPT}" ]; then
    echo -e "${RED}Error: Test script not found: ${TEST_SCRIPT}${NC}"
    exit 1
fi

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 is required but not installed.${NC}"
    exit 1
fi

# Set authentication environment variables
echo -e "${YELLOW}Setting up authentication...${NC}"
export AUTH_USERNAME="${USERNAME}"
export AUTH_PASSWORD="${PASSWORD}"
export USER_POOL_ID="${USER_POOL_ID}"
export USER_POOL_CLIENT_ID="${CLIENT_ID}"
export AWS_REGION="${REGION}"
export AUTH_CONFIG_FILE="${AUTH_CONFIG_FILE}"
export AUTH_FIRST_RUN="${FIRST_RUN}"

# Check if first run is needed (if not explicitly set and config file doesn't exist)
if [ "${FIRST_RUN}" = "false" ] && [ ! -f "${AUTH_CONFIG_FILE}" ]; then
    echo -e "${YELLOW}Authentication config file not found. Setting first run mode.${NC}"
    export AUTH_FIRST_RUN="true"
fi

# Run the test with extracted parameters
echo -e "${GREEN}Running Nova VTO API tests...${NC}"

# Check if --no-remote is in the remaining arguments
NO_REMOTE=false
NEW_ARGS=()
for arg in "${REMAINING_ARGS[@]}"; do
    if [ "$arg" = "--no-remote" ]; then
        NO_REMOTE=true
    else
        NEW_ARGS+=("$arg")
    fi
done

# Execute the test
if [ "$NO_REMOTE" = true ]; then
    echo "Remote mode disabled by user argument --no-remote"
    python3 "${TEST_SCRIPT}" --base-url "${API_URL}" --bucket-name "${BUCKET_NAME}" "${NEW_ARGS[@]}"
else
    # Default to remote mode
    python3 "${TEST_SCRIPT}" --base-url "${API_URL}" --bucket-name "${BUCKET_NAME}" --remote "${NEW_ARGS[@]}"
fi

echo ""
echo -e "${GREEN}Test execution completed.${NC}"

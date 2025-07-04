#!/bin/zsh

# gen_vto_image Lambda function local test script
# Builds Docker image and runs tests using Lambda Runtime Interface Emulator
# Usage: ./local_vto_test.zsh [test_name]
# Example: ./local_vto_test.zsh test_text_to_image_generation_japanese

set -e  # Exit immediately if a command exits with a non-zero status

# Color definitions for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory and navigate to lambda directory (parent of test)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LAMBDA_DIR="$(dirname "$SCRIPT_DIR")"
cd "$LAMBDA_DIR"

# Variables
IMAGE_NAME="gen-vto-image-test"
CONTAINER_NAME="gen-vto-image-rie"
PORT=9000
MAX_WAIT_TIME=30  # Maximum time to wait for container startup (seconds)

echo -e "${GREEN}=== gen_vto_image Lambda Function Local Test ===${NC}"

# AWS credentialの確認
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_SESSION_TOKEN" ]; then
    echo -e "${YELLOW}AWS credentialが設定されていません。${NC}"
    exit 1
fi

# Set environment variables for testing
# aws account id 取得
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
# s3 bucket name
export VTO_BUCKET="vto-app-$ACCOUNT_ID"
# create bucket if not exists
aws s3 mb s3://$VTO_BUCKET || true

export LOG_LEVEL="INFO"

echo -e "${YELLOW}Environment variables:${NC}"
echo "  AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}"
echo "  AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:0:10}..."
echo "  VTO_BUCKET: ${VTO_BUCKET}"
echo "  LOG_LEVEL: ${LOG_LEVEL}"

# 1. Clean up existing containers
echo -e "\n${YELLOW}Cleaning up existing containers...${NC}"
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 2. Build Docker image
echo -e "\n${YELLOW}Building Docker image...${NC}"
docker build -f test/Dockerfile.gen_vto_image -t $IMAGE_NAME .

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to build Docker image${NC}"
    exit 1
fi

# 3. Start Docker container with Lambda RIE
echo -e "\n${YELLOW}Starting Docker container with Lambda RIE...${NC}"
cd test
docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT:8080 \
    -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
    -e AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN" \
    -e AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}" \
    -e VTO_BUCKET="$VTO_BUCKET" \
    -e LOG_LEVEL="$LOG_LEVEL" \
    $IMAGE_NAME

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to start Docker container${NC}"
    exit 1
fi

# 4. Wait for container to be ready
echo -e "\n${YELLOW}Waiting for Lambda RIE to be ready...${NC}"
WAIT_TIME=0
while [ $WAIT_TIME -lt $MAX_WAIT_TIME ]; do
    # Try to invoke a simple test event
    if curl -s -X POST "http://localhost:$PORT/2015-03-31/functions/function/invocations" \
        -d '{"test": "health_check"}' > /dev/null 2>&1; then
        echo -e "${GREEN}Lambda RIE is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 1
    WAIT_TIME=$((WAIT_TIME + 1))
done

if [ $WAIT_TIME -ge $MAX_WAIT_TIME ]; then
    echo -e "\n${RED}Error: Lambda RIE startup timeout${NC}"
    echo -e "${YELLOW}Container logs:${NC}"
    docker logs $CONTAINER_NAME
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
    exit 1
fi

# 5. Install Python dependencies for test script if needed
echo -e "\n${YELLOW}Checking Python dependencies...${NC}"
if ! python3 -c "import requests, PIL" 2>/dev/null; then
    echo -e "${YELLOW}Installing required Python packages...${NC}"
    pip3 install requests pillow
fi

# 6. Run the test script
echo -e "\n${YELLOW}Running gen_vto_image tests...${NC}"

# Check if test name is provided as argument
if [ $# -gt 0 ]; then
    # Run specific test
    TEST_NAME="$1"
    echo -e "${YELLOW}Running specific test: ${TEST_NAME}${NC}"
    python3 test_gen_vto_image.py --mode local GenVTOImageTest.${TEST_NAME}
else
    # Run all tests
    echo -e "${YELLOW}Running all tests...${NC}"
    python3 test_gen_vto_image.py --mode local
fi

TEST_RESULT=$?

# 7. Display test results
echo -e "\n${YELLOW}=== Test Results ===${NC}"
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed successfully!${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    echo -e "\n${YELLOW}Container logs:${NC}"
    docker logs $CONTAINER_NAME
fi

# 8. Clean up
echo -e "\n${YELLOW}Cleaning up...${NC}"
docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME

echo -e "\n${GREEN}=== Test Complete ===${NC}"

# Return test result exit code
exit $TEST_RESULT

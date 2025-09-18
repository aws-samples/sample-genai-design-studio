#!/bin/zsh

# VTO API ローカルテストスクリプト
# Dockerfile.devをビルドし、コンテナを起動してtest_api.pyでテストを実行します
# Usage: ./local_api_test.zsh [test_name]
# Example: ./local_api_test.zsh test_health_check

set -e  # エラーが発生したら即座に終了

# 色付き出力用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# スクリプトのディレクトリに移動（testディレクトリ）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# apiディレクトリに移動
API_DIR="$(dirname "$SCRIPT_DIR")/api"
cd "$API_DIR"

# 変数定義
IMAGE_NAME="vto-api-dev"
CONTAINER_NAME="vto-api-test"
PORT=8000
MAX_WAIT_TIME=30  # APIの起動を待つ最大時間（秒）

echo -e "${GREEN}=== VTO API ローカルテスト開始 ===${NC}"

# AWS credentialの確認
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo -e "${YELLOW}AWS credentialが設定されていません。${NC}"
    exit 1
fi

# aws account id 取得
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
# s3 bucket name
BUCKET_NAME="vto-app-$ACCOUNT_ID"
# create bucket if not exists
aws s3 mb s3://$BUCKET_NAME || true

# CDK設定ファイルとCDK出力ファイルのパス
CDK_JSON_FILE="../../cdk/cdk.json"
CDK_OUTPUTS_FILE="../../cdk/.cdk-outputs.json"
VTO_GEN_FUNCTION_NAME=""
DEPLOYMENT_REGION=""

echo -e "\n${YELLOW}CDK設定からリージョンとVTO_GEN_FUNCTION_NAMEを取得中...${NC}"

# jqコマンドの存在確認
if ! command -v jq &> /dev/null; then
    echo -e "${RED}エラー: jqコマンドが見つかりません。jqをインストールしてください。${NC}"
    echo -e "${YELLOW}macOS: brew install jq${NC}"
    echo -e "${YELLOW}Ubuntu: sudo apt-get install jq${NC}"
    exit 1
fi

# cdk.jsonからdeploymentRegionを取得
if [ ! -f "$CDK_JSON_FILE" ]; then
    echo -e "${RED}エラー: CDK設定ファイルが見つかりません: $CDK_JSON_FILE${NC}"
    exit 1
fi

DEPLOYMENT_REGION=$(jq -r '.context.deploymentRegion // empty' "$CDK_JSON_FILE")

if [ -z "$DEPLOYMENT_REGION" ]; then
    echo -e "${YELLOW}警告: cdk.jsonからdeploymentRegionを取得できませんでした。デフォルト値を使用します。${NC}"
    DEPLOYMENT_REGION="us-east-1"  # フォールバック
fi

echo -e "${GREEN}Deployment Region: $DEPLOYMENT_REGION${NC}"

# CDK出力ファイルの存在確認
if [ ! -f "$CDK_OUTPUTS_FILE" ]; then
    echo -e "${RED}エラー: CDK出力ファイルが見つかりません: $CDK_OUTPUTS_FILE${NC}"
    echo -e "${YELLOW}CDKをデプロイしてから再実行してください: cd ../../cdk && npx cdk deploy --all --outputs-file ./.cdk-outputs.json${NC}"
    exit 1
fi

# GenImageFunctionNameを取得
VTO_GEN_FUNCTION_NAME=$(jq -r '.VtoAppStack.GenImageFunctionName // empty' "$CDK_OUTPUTS_FILE")

if [ -z "$VTO_GEN_FUNCTION_NAME" ]; then
    echo -e "${RED}エラー: VTO_GEN_FUNCTION_NAMEを取得できませんでした${NC}"
    echo -e "${YELLOW}CDK出力ファイルの内容を確認してください: $CDK_OUTPUTS_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}VTO_GEN_FUNCTION_NAME: $VTO_GEN_FUNCTION_NAME${NC}"

# CORS設定を追加
echo "S3バケットにCORS設定を追加中..."
cat > /tmp/cors-config.json << EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": []
    }
  ]
}
EOF

aws s3api put-bucket-cors --bucket $BUCKET_NAME --cors-configuration file:///tmp/cors-config.json
rm /tmp/cors-config.json


# 1. 既存のコンテナが実行中の場合は停止・削除
echo -e "\n${YELLOW}既存のコンテナをクリーンアップ中...${NC}"
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 2. Dockerイメージをビルド
echo -e "\n${YELLOW}Dockerイメージをビルド中...${NC}"
docker build -f Dockerfile.dev -t $IMAGE_NAME .

if [ $? -ne 0 ]; then
    echo -e "${RED}エラー: Dockerイメージのビルドに失敗しました${NC}"
    exit 1
fi

# 3. Dockerコンテナを起動
echo -e "\n${YELLOW}Dockerコンテナを起動中...${NC}"
echo -e "${GREEN}使用するリージョン: ${AWS_DEFAULT_REGION:-$DEPLOYMENT_REGION}${NC}"
# AWS credentialを環境変数として渡す
docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT:$PORT \
    -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
    -e AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN" \
    -e AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$DEPLOYMENT_REGION}" \
    -e VTO_BUCKET="$BUCKET_NAME" \
    -e VTO_GEN_FUNCTION_NAME="$VTO_GEN_FUNCTION_NAME" \
    -e LOG_LEVEL="INFO" \
    $IMAGE_NAME

if [ $? -ne 0 ]; then
    echo -e "${RED}エラー: Dockerコンテナの起動に失敗しました${NC}"
    exit 1
fi

# 4. APIが起動するまで待機
echo -e "\n${YELLOW}APIの起動を待機中...${NC}"
WAIT_TIME=0
while [ $WAIT_TIME -lt $MAX_WAIT_TIME ]; do
    if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
        echo -e "${GREEN}APIが起動しました！${NC}"
        break
    fi
    echo -n "."
    sleep 1
    WAIT_TIME=$((WAIT_TIME + 1))
done

if [ $WAIT_TIME -ge $MAX_WAIT_TIME ]; then
    echo -e "\n${RED}エラー: APIの起動がタイムアウトしました${NC}"
    echo -e "${YELLOW}コンテナのログ:${NC}"
    docker logs $CONTAINER_NAME
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
    exit 1
fi

# 5. テストを実行
echo -e "\n${YELLOW}APIテストを実行中...${NC}"
cd ../test

# Check if test name is provided as argument
if [ $# -gt 0 ]; then
    # Run specific test
    TEST_NAME="$1"
    echo -e "${YELLOW}特定のテストを実行中: ${TEST_NAME}${NC}"
    python3 test_nova_vto_api.py --base-url http://localhost:$PORT --bucket-name $BUCKET_NAME NovaVTOAPITest.${TEST_NAME}
else
    # Run all tests in local mode
    echo -e "${YELLOW}全テストを実行中（ローカルモード）...${NC}"
    python3 test_nova_vto_api.py --base-url http://localhost:$PORT --bucket-name $BUCKET_NAME
fi

TEST_RESULT=$?

# 6. テスト結果の表示
echo -e "\n${YELLOW}=== テスト結果 ===${NC}"
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ すべてのテストが成功しました！${NC}"
else
    echo -e "${RED}❌ テストが失敗しました${NC}"
    echo -e "\n${YELLOW}コンテナのログ:${NC}"
    docker logs $CONTAINER_NAME
fi

# 7. クリーンアップ
echo -e "\n${YELLOW}クリーンアップ中...${NC}"
docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME

echo -e "\n${GREEN}=== テスト完了 ===${NC}"

# テスト結果に基づいて終了コードを返す
exit $TEST_RESULT

#!/bin/zsh

# デプロイ済みのAPIを使用するためのスクリプト

# 色付き出力用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== デプロイ済みのAPIを使用する設定 ===${NC}"

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# プロジェクトのルートディレクトリに移動
cd "${SCRIPT_DIR}/../.."
PROJECT_ROOT="$(pwd)"
echo -e "${YELLOW}プロジェクトルート: ${PROJECT_ROOT}${NC}"

# CDK出力ファイルのパス
CDK_OUTPUTS_FILE="${PROJECT_ROOT}/cdk/.cdk-outputs.json"

# CDK出力ファイルが存在するか確認
if [ ! -f "${CDK_OUTPUTS_FILE}" ]; then
    echo -e "${RED}エラー: CDK出力ファイルが見つかりません: ${CDK_OUTPUTS_FILE}${NC}"
    echo -e "${YELLOW}先に 'cdk deploy' を実行して出力ファイルを生成してください。${NC}"
    exit 1
fi

# jqがインストールされているか確認
if ! command -v jq &> /dev/null; then
    echo -e "${RED}エラー: jqが必要ですがインストールされていません。${NC}"
    echo -e "${YELLOW}jqをインストールしてください: brew install jq (macOSの場合) または apt-get install jq (Ubuntuの場合)${NC}"
    exit 1
fi

# CDK出力からパラメータを抽出
echo -e "${YELLOW}CDK出力からパラメータを読み込んでいます...${NC}"

# 基本的なパラメータを抽出
API_URL=$(jq -r '.VtoAppStack.ApiUrl' "${CDK_OUTPUTS_FILE}")
BUCKET_NAME=$(jq -r '.VtoAppStack.VtoImageBucketName' "${CDK_OUTPUTS_FILE}")
GEN_IMAGE_FUNCTION_NAME=$(jq -r '.VtoAppStack.GenImageFunctionName' "${CDK_OUTPUTS_FILE}")

# フロントエンド用環境変数（JSON形式）を抽出
FRONTEND_ENV_VARS=$(jq -r '.VtoAppStack.FrontendFrontendBuildEnvVarsC8E75767' "${CDK_OUTPUTS_FILE}")

# フロントエンド環境変数から個別の値を抽出
API_ENDPOINT=$(echo "${FRONTEND_ENV_VARS}" | jq -r '.VITE_APP_API_ENDPOINT')
USER_POOL_ID=$(echo "${FRONTEND_ENV_VARS}" | jq -r '.VITE_APP_USER_POOL_ID')
USER_POOL_CLIENT_ID=$(echo "${FRONTEND_ENV_VARS}" | jq -r '.VITE_APP_USER_POOL_CLIENT_ID')
REGION=$(echo "${FRONTEND_ENV_VARS}" | jq -r '.VITE_APP_REGION')

# 抽出したパラメータを検証
if [ "${API_URL}" = "null" ] || [ -z "${API_URL}" ]; then
    echo -e "${RED}エラー: CDK出力からApiUrlを抽出できませんでした${NC}"
    exit 1
fi

if [ "${BUCKET_NAME}" = "null" ] || [ -z "${BUCKET_NAME}" ]; then
    echo -e "${RED}エラー: CDK出力からVtoImageBucketNameを抽出できませんでした${NC}"
    exit 1
fi

if [ "${GEN_IMAGE_FUNCTION_NAME}" = "null" ] || [ -z "${GEN_IMAGE_FUNCTION_NAME}" ]; then
    echo -e "${RED}エラー: CDK出力からGenImageFunctionNameを抽出できませんでした${NC}"
    exit 1
fi

if [ "${API_ENDPOINT}" = "null" ] || [ -z "${API_ENDPOINT}" ]; then
    echo -e "${RED}エラー: CDK出力からVITE_APP_API_ENDPOINTを抽出できませんでした${NC}"
    exit 1
fi

if [ "${USER_POOL_ID}" = "null" ] || [ -z "${USER_POOL_ID}" ]; then
    echo -e "${RED}エラー: CDK出力からVITE_APP_USER_POOL_IDを抽出できませんでした${NC}"
    exit 1
fi

if [ "${USER_POOL_CLIENT_ID}" = "null" ] || [ -z "${USER_POOL_CLIENT_ID}" ]; then
    echo -e "${RED}エラー: CDK出力からVITE_APP_USER_POOL_CLIENT_IDを抽出できませんでした${NC}"
    exit 1
fi


if [ "${REGION}" = "null" ] || [ -z "${REGION}" ]; then
    echo -e "${RED}エラー: CDK出力からVITE_APP_REGIONを抽出できませんでした${NC}"
    exit 1
fi

echo -e "${GREEN}パラメータの抽出に成功しました:${NC}"
echo -e "  API URL: ${API_URL}"
echo -e "  S3 バケット: ${BUCKET_NAME}"
echo -e "  生成関数名: ${GEN_IMAGE_FUNCTION_NAME}"
echo -e "  API エンドポイント: ${API_ENDPOINT}"
echo -e "  ユーザープール ID: ${USER_POOL_ID}"
echo -e "  アイデンティティプール ID: ${IDENTITY_POOL_ID}"
echo -e "  リージョン: ${REGION}"
echo ""

# AWS credentialの確認
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_SESSION_TOKEN" ]; then
    echo -e "${YELLOW}AWS credentialが設定されていません。${NC}"
    exit 1
fi

# .envファイルを作成
ENV_FILE="${PROJECT_ROOT}/frontend/.env"
echo -e "${YELLOW}.envファイルを作成しています: ${ENV_FILE}${NC}"

cat > "${ENV_FILE}" << EOF
# API設定
VITE_API_BASE_URL=${API_URL}
VITE_VTO_BUCKET=${BUCKET_NAME}
VITE_GEN_IMAGE_FUNCTION_NAME=${GEN_IMAGE_FUNCTION_NAME}

# Cognito認証設定
VITE_APP_API_ENDPOINT=${API_ENDPOINT}
VITE_APP_USER_POOL_ID=${USER_POOL_ID}
VITE_APP_USER_POOL_CLIENT_ID=${USER_POOL_CLIENT_ID}
VITE_APP_REGION=${REGION}
EOF

echo -e "${GREEN}.envファイルを作成しました。${NC}"
echo -e "${YELLOW}フロントエンドアプリケーションは以下のAPIを使用します:${NC}"
echo -e "  ${API_URL}"
echo ""

# APIの疎通確認
echo -e "${YELLOW}APIの疎通確認を行っています...${NC}"
if curl -s "${API_URL}/health" > /dev/null; then
    echo -e "${GREEN}APIに接続できました！${NC}"
else
    echo -e "${RED}警告: APIに接続できませんでした。${NC}"
    echo -e "${YELLOW}APIがデプロイされていることを確認してください。${NC}"
fi

echo -e "\n${GREEN}=== 設定完了 ===${NC}"
echo -e "${YELLOW}フロントエンドアプリケーションを起動するには:${NC}"
cd frontend/ && npm run dev

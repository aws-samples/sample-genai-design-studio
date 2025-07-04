#!/bin/zsh

# テスト環境のセットアップスクリプト

# 色付き出力用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== テスト環境のセットアップ ===${NC}"

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# プロジェクトのルートディレクトリに移動
cd "${SCRIPT_DIR}/../.."
PROJECT_ROOT="$(pwd)"
cd "${SCRIPT_DIR}/../"
FRONTEND_ROOT="$(pwd)"
echo -e "${YELLOW}フロントエンドルート: ${FRONTEND_ROOT}${NC}"

# node_modulesが存在しない場合はインストール
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}依存関係をインストールしています...${NC}"
    npm install
fi

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
API_URL=$(jq -r '.VtoAppStack.ApiUrl' "${CDK_OUTPUTS_FILE}")
BUCKET_NAME=$(jq -r '.VtoAppStack.VtoImageBucketName' "${CDK_OUTPUTS_FILE}")
GEN_IMAGE_FUNCTION_NAME=$(jq -r '.VtoAppStack.GenImageFunctionName' "${CDK_OUTPUTS_FILE}")

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

echo -e "${GREEN}パラメータの抽出に成功しました:${NC}"
echo -e "  API URL: ${s}"
echo -e "  S3 バケット: ${BUCKET_NAME}"
echo -e "  生成関数名: ${GEN_IMAGE_FUNCTION_NAME}"
echo ""

# テスト用の環境変数を設定
echo -e "${YELLOW}テスト用環境変数を設定しています...${NC}"
# AWS credentialの確認
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_SESSION_TOKEN" ]; then
    echo -e "${YELLOW}AWS credentialが設定されていません。${NC}"
    exit 1
fi

# .envファイルを作成
ENV_TEST_FILE="${FRONTEND_ROOT}/.env.test"
echo -e "${YELLOW}.envファイルを作成しています: ${ENV_TEST_FILE}${NC}"

cat > "${ENV_TEST_FILE}" << EOF
# API設定
VITE_API_BASE_URL=${API_URL}
VITE_VTO_BUCKET=${BUCKET_NAME}
VITE_GEN_IMAGE_FUNCTION_NAME=${GEN_IMAGE_FUNCTION_NAME}
EOF

echo -e "${GREEN}.envファイルを作成しました。${NC}"
echo -e "${YELLOW}フロントエンドアプリケーションは以下のAPIを使用します:${NC}"
echo -e "  ${API_URL}"
echo ""

echo -e "${GREEN}.env.testファイルを作成しました。${NC}"

# テストの実行オプションを表示
echo -e "\n${GREEN}=== テスト実行オプション ===${NC}"
echo -e "${YELLOW}1. すべてのテストを実行:${NC}"
echo -e "   npm test"
echo -e ""
echo -e "${YELLOW}2. ウォッチモードでテストを実行:${NC}"
echo -e "   npm run test:watch"
echo -e ""
echo -e "${YELLOW}3. カバレッジレポート付きでテストを実行:${NC}"
echo -e "   npm run test:coverage"
echo -e ""
echo -e "${YELLOW}4. UIモードでテストを実行:${NC}"
echo -e "   npm run test:ui"
echo -e ""
echo -e "${YELLOW}5. 特定のファイルのみテスト:${NC}"
echo -e "   npm test -- src/components/__tests__/Navigation.test.tsx"
echo -e ""

# テストを実行するか確認
echo -e "${GREEN}テストを実行しますか？ (y/n)${NC}"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}テストを実行しています...${NC}"
    npm test
else
    echo -e "${GREEN}セットアップが完了しました。${NC}"
    echo -e "${YELLOW}テストを実行するには上記のコマンドを使用してください。${NC}"
fi

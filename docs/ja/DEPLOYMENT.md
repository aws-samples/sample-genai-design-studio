# デプロイ方法

## 事前準備
### CDK実行環境
CDK のプロジェクトをデプロイするには、以下の環境が必要です。事前に環境のセットアップを実施してください。

- Docker: docker コマンドを実行できる状態に環境をセットアップしてください。Docker Desktop を業務利用する場合は多くの場合 [サブスクリプション契約が必要](https://www.docker.com/legal/docker-subscription-service-agreement/) ですのでご注意ください。
- Node.js (v18以上): npx コマンドを実行できる状態に環境をセットアップしてください。
- Python 3.12以上
- AWS CLI設定済み
- AWS 認証情報の設定： `aws configure` から設定できます。[詳細はこちら](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html)をご確認ください

## セットアップ

### 1. プロジェクトの依存関係インストール

```bash
# CDK依存関係のインストール
cd cdk
npm install

# フロントエンド依存関係のインストール
cd ../frontend
npm install
```

### 2. CDKブートストラップ（初回のみ）

```bash
cd ../cdk
npx cdk bootstrap
```

### 3. cdk.json でのオプションのパラメータ確認

デプロイ時に[cdk.json](../../cdk/cdk.json)を修正することで、セキュリティ強化などが可能です。
- selfSignUpEnabled: セルフ登録を無効にします（デフォルト: 有効）。このフラグを設定すると、Cognito 上で全てのユーザーを作成する必要があり、ユーザーが自分でアカウントを登録することはできなくなります。
- allowedIpV4AddressRanges: 許可する IPv4 範囲のカンマ区切りリスト。（デフォルト: 全ての IPv4 アドレスを許可）
- allowedIpV6AddressRanges: 許可する IPv6 範囲のカンマ区切りリスト。（デフォルト: 全ての IPv6 アドレスを許可）
- allowedSignUpEmailDomains: サインアップ時に許可するメールドメインのカンマ区切りリスト（「@」を含めずに指定してください）。（デフォルト: ドメイン制限なし）
- autoJoinUserGroups: 新規ユーザー自動参加cognitoユーザーグループのカンマ区切りリスト。（デフォルト: admin）
- deploymentRegion: デプロイ先リージョン。Nova Canvasが利用可能なリージョン（us-east-1、ap-northeast-1、eu-west-1）を指定してください。（デフォルト: us-east-1）

```json
{
  "context": {
    "allowedIpV4AddressRanges": ["0.0.0.0/1", "128.0.0.0/1"],
    "allowedIpV6AddressRanges": ["0000:0000:0000:0000:0000:0000:0000:0000/1", "8000:0000:0000:0000:0000:0000:0000:0000/1"],
    "identityProviders": [],
    "userPoolDomainPrefix": "",
    "allowedSignUpEmailDomains": ["example.co.jp", "company.com"],
    "autoJoinUserGroups": ["admin"],
    "selfSignUpEnabled": true,
    "deploymentRegion": "us-east-1"
  }
}
```

### 4. (OPTION) Bedrockモデルのリージョンを変更する場合

#### 変更箇所 
以下で Bedrock の使用するリージョンの変更が可能です。
- [API 実行時に使用するモデル](../../lambda/api/app/utils/core.py) 
- [画像生成時に使用するモデル](../../lambda/gen_vto_image/utils/core.py)

#### 変更方法
1. 上記、両ファイルの`BEDROCK_REGION = "us-east-1"` を `ap-northeast-1` や `eu-west-1` に設定
2. [API 実行時に使用するモデル](../../lambda/api/app/utils/core.py)  内の、`NOVA_MODEL_IDS` を該当リージョンのモデルIDに修正

**ap-northeast-1 の例:**
```python
NOVA_MODEL_IDS = {
    "lite": "apac.amazon.nova-lite-v1:0", 
    "canvas": "amazon.nova-canvas-v1:0",  
    "micro": "apac.amazon.nova-micro-v1:0", 
}
```

**eu-west-1 の例:**
```python
NOVA_MODEL_IDS = {
    "lite": "eu.amazon.nova-lite-v1:0", 
    "canvas": "amazon.nova-canvas-v1:0",  
    "micro": "eu.amazon.nova-micro-v1:0", 
}
```

> [!Note]
> `nova-lite-v1:0` と `nova-micro-v1:0` は Cross-Region Inference を使用しているため、呼び出し元のソースリージョンに応じて異なる送信先リージョンにルーティングされます。送信先リージョンなどについては[こちらのドキュメント](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)をご確認ください。

## デプロイ
### フルデプロイ（推奨）

```bash
cd cdk
npx cdk deploy --all --require-approval never --outputs-file ./.cdk-outputs.json
```
デプロイが完了すると以下の出力が表示されます：
- CloudFront Distribution URL（フロントエンド）
- API Gateway URL（バックエンドAPI）
- Cognito User Pool ID
- S3 Bucket名

5. **デプロイ後の確認**

   デプロイが完了すると、フロントエンド URL と API の URL が表示されます。
   表示された URL にアクセスして、アプリケーションを利用開始できます。

> [!Important]
> このデプロイ方法では、オプションパラメータを設定しない場合、URL を知っている誰でもサインアップできます。
本番環境での使用には、IP アドレス制限の追加やセルフサインアップの無効化 (`--cognito-self-signup=false`) を強くお勧めします。


## クリーンアップ

リソースを削除する場合：

```bash
cd cdk
npx cdk destroy --all
```

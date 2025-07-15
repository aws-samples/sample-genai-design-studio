# デプロイ方法

## 事前準備
### Bedrock
us-east-1、ap-northeast-1、eu-west-1 のいずれかのリージョンで、Nova モデルの有効化を行ってください。本サンプルではNova Canvasの画像生成モデル（us-east-1、ap-northeast-1、eu-west-1でのみ利用可能）と Nova Micro/Lite などのテキストモデルを使用しています。
[Bedrock Model access](https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess) > `Manage model access` からNovaモデルファミリー一式をチェックし、`Save changes`をクリックします
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

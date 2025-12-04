# GenAI Design Studio

日本語 | [English](./README.md)

このサンプルは、画像生成 AI (Amazon Bedrock Canvas) を活用した仮想着せ替え（ Virtual Try-On ）のソリューションです。アパレル業界やECサービスなどで洋服のデザインから実際のモデルの試着撮影までの各工程の効率化を目指しています。

## 機能
![demo](./img/demo.gif)
### 1. モデル生成
ボディポーズ・容姿の特徴・撮影環境などをテキストプロンプトとして指定することで仮想的なモデル画像を生成する機能です。

**サポートモデル:**
- **Amazon Nova 2 Omni**（デフォルト）: 次世代マルチモーダルモデルによる高速並列生成と高精度な画像生成
- **Amazon Nova Canvas**: 詳細なパラメーター制御による高品質な画像生成

**主要機能:**
- **テキスト入力**: 英語・日本語など様々な言語でプロンプトによる詳細な画像描写指定
- **モデル選択**: プルダウンメニューでNova 2 OmniまたはNova Canvasを選択
- **生成パラメータ**:
  - CFGスケール（1.1-10.0）による品質制御 - Nova Canvasのみ
  - 画像サイズ選択（1024x1024, 768x1344等）
  - 複数画像同時生成（最大5枚）
  - Nova 2: 並列Lambda実行による高速な複数画像生成

### 2. 画像編集
Amazon Nova 2 Omni を使用した画像編集機能です。既存の画像に対して自然言語プロンプトで指定した編集を適用できます。

**主要機能:**
- **画像アップロード**: 編集したい画像をアップロード（JPEG/PNG/WebP対応、自動PNG変換）
- **編集プロンプト**: 英語・日本語で編集内容を自然言語で指定（最大1024文字）
- **画像サイズ保持**: 入力画像と同じサイズで編集画像を生成
- **画像サイズ検証**: Nova 2推奨サイズ（2880x1440、2048x2048等）以外の場合は警告表示
- **複数画像生成**: 最大5枚の編集バリエーションを並列生成
- **S3ポーリング**: 非同期処理による画像生成完了の自動検知

**活用例:**
- 衣服の色変更（「赤いドレスを青に変更」）
- 背景の追加・変更（「背景に山と湖を追加」）
- アクセサリーの追加（「サングラスを追加」）
- 照明・雰囲気の調整（「ゴールデンアワーの照明に変更」）

### 3. Virtual Try-On
Amazon Nova Canvas を使用したバーチャル試着機能です。モデル生成で作成したモデル画像や既存の画像を使用して、衣服の画像のディテールを崩さずに着せ替えていくことができる。また、ジャケットの前開き/閉じやシャツのIn/Outなどの詳細も指定することができる。

**主要機能:**
- **画像指定**: モデル画像、衣服画像、（マスク画像）
- **マスクタイプ**:
  - `GARMENT`: 衣服タイプ自動検出（上半身、下半身、全身等）
  - `PROMPT`: テキストプロンプトによるマスク領域指定
  - `IMAGE`: カスタムマスク画像によるピンポイント指定
- **ペイントエディタ**: 描画ツールを使用してモデル画像の上からマスク画像を作成
- **詳細パラメータ**:
  - 衣服クラス（18種類）、スタイル設定（袖、裾、アウター等）
  - ボディポーズ・手・顔の保持設定
  - マージスタイル（Balanced/Seamless/Detailed）
- **生成設定**: 複数画像生成（最大5枚）、品質選択、CFGスケール調整

### 管理機能
- **ユーザーログイン**: Amazon Cognito User Pool によるユーザー管理
- **アクセス制限**: アクセス元IPや登録ユーザーメールのドメイン名制御
- **セルフサインナップ機能**: アプリでのユーザー登録機能の有効/無効制御


## 活用ユースケース
### テストマーケティング
洋服の商用販売前に複数のサンプルバリエーションの画像を用意して、Virtual Try-On 機能によりモデルが着た画像を生成しSNSなどでテストマーケティングを行う。
### ユニフォーム提案
スポーツチームユニフォームや学校制服など顧客提案時に、Virtual Try-On 機能により生成した画像を使ってより具体的な提案を行う。
### プランニング
撮影前に複数のサンプルバリエーションで Virtual Try-On を試し、それぞれの服にあったモデル、撮影場所、パンツとジャケットの組み合わせなどを選定していく。

## Deploy
[DEPLOYMENTドキュメント](./docs/ja/DEPLOYMENT.md)を参考にAWS環境へのデプロイを実行してください。

## アーキテクチャ
![architecture](./img/architecture.png)

- **Frontend**: React + Vite + TypeScript + MUI
- **Backend API**: FastAPI (Lambda) + Amazon Cognito認証
- **Image Generation**: Python Lambda + Amazon Nova 2 Omni / Amazon Nova Canvas
- **Infrastructure**: AWS CDK (TypeScript)
- **Storage**: Amazon S3
- **Security**: AWS WAF + Amazon Cognito
- **Authentication**: AWS Cognito + JWT

## プロジェクト構造

```
vto-app/
├── frontend/               # React フロントエンドアプリケーション
│   ├── src/               # ソースコード
│   │   ├── components/    # React コンポーネント
│   │   ├── pages/         # ページコンポーネント
│   │   ├── auth/          # 認証関連
│   │   ├── contexts/      # Reactコンテキスト
│   │   ├── hooks/         # カスタムフック
│   │   ├── stores/        # 状態管理
│   │   ├── utils/         # ユーティリティ
│   │   └── __tests__/     # テストファイル
│   ├── public/            # 静的ファイル
│   ├── test/              # テスト設定
│   │   └── test_setup.zsh              # テスト実行スクリプト
│   └── package.json       # Node.js依存関係
├── lambda/                # Lambda関数群
│   ├── api/               # FastAPI アプリケーション
│   │   ├── app/           # アプリケーションコード
│   │   │   ├── main.py                  # FastAPIメインアプリ
│   │   │   ├── auth/                    # 認証関連
│   │   │   ├── routes/                  # APIルート
│   │   │   ├── routes/schemas/          # APIスキーマ
│   │   │   └── utils/                   # 共通ユーティリティ
│   │   ├── Dockerfile                   # 本番用Dockerfile
│   │   ├── Dockerfile.dev               # 開発用Dockerfile
│   │   └── requirements.txt             # Python依存関係
│   ├── gen_vto_image/     # 画像生成Lambda（非同期処理）
│   │   ├── index.py                     # Lambdaエントリポイント
│   │   ├── utils/                       # 画像生成ユーティリティ
│   │   └── requirements.txt             # Python依存関係
│   ├── cognito_triggers/  # Cognito Lambda トリガー
│   │   └── pre_sign_up/   # プレサインアップトリガー
│   └── test/              # テストファイル
├── cdk/                   # AWS CDKインフラストラクチャ
│   ├── bin/               # CDKアプリケーションエントリポイント
│   │   └── vto-app.ts                   # CDKメインエントリ
│   ├── lib/               # CDKスタック定義
│   │   ├── vto-app-stack.ts             # メインスタック
│   │   ├── frontend-waf-stack.ts        # WAFスタック（us-east-1）
│   │   └── constructs/                  # CDK構成要素
│   ├── cdk.json           # CDK設定
│   └── package.json       # Node.js依存関係
├── docs/                  # ドキュメント
├── img/                   # ドキュメント用画像
```


## コントリビューション

[CONTRIBUTING](./CONTRIBUTING.md)をご確認ください。

## ライセンス

本プロジェクトは [LICENSE](./LICENSE) に記載されたライセンスの下で配布されています。

# フロントエンドテストガイド

## 概要

このドキュメントでは、VTOアプリケーションのフロントエンドテストについて説明します。テストフレームワークとしてVitestを使用し、React Testing LibraryとJest DOMを組み合わせて包括的なテストスイートを構築しています。

### システム構成

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CloudFront    │    │  API Gateway    │    │    Lambda       │
│      WAF        │───▶│      WAF        │───▶│   (FastAPI)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                ▲                       ▲
                                │                       │
┌─────────────────┐            JWT                    JWT
│     Cognito     │         Token                  Verification
│   UserPool      │──────────────┘                       │
└─────────────────┘                                      │
        ▲                                                │
        │                                                │
┌─────────────────┐                              ┌─────────────────┐
│   React App     │                              │   JWKS          │
│   (Amplify)     │                              │   Endpoint      │
└─────────────────┘                              └─────────────────┘
```

## テスト環境のセットアップ

### 1. 自動セットアップ

テスト環境を自動的にセットアップするスクリプトを用意しています：

```bash
cd vto-app/frontend
./test/test_setup.zsh
```

このスクリプトは以下を実行します：
- 依存関係のインストール確認
- テスト用環境変数の設定（`.env.test`ファイルの作成）
- テスト実行オプションの表示

### 2. 手動セットアップ

手動でセットアップする場合：

```bash
# 依存関係のインストール
npm install

# テスト用環境変数ファイルの作成
cat > .env.test << EOF
VITE_API_BASE_URL=http://localhost:8000
VITE_VTO_BUCKET=test-vto-bucket
VITE_GEN_IMAGE_FUNCTION_NAME=test-gen-image-function
EOF
```

## テストの実行
### セットアップスクリプトを実行
```bash
cd vto-app/frontend
./test/test_setup.zsh
```
### 手動でテストを実行
```bash
# すべてのテストを実行
npm test

# ウォッチモードでテストを実行（ファイル変更を監視）
npm run test:watch

# カバレッジレポート付きでテストを実行
npm run test:coverage

# UIモードでテストを実行（ブラウザでテスト結果を確認）
npm run test:ui
```

### 特定のテストのみ実行

```bash
# 特定のファイルのみテスト
npm test -- src/components/__tests__/Navigation.test.tsx

# パターンマッチングでテストを実行
npm test -- --grep "Navigation"

# 特定のディレクトリのテストのみ実行
npm test -- src/components/__tests__/
```

## テスト項目詳細

### api.test.ts（APIフック機能テスト）

#### generateObjectNames
**目的**: オブジェクト名生成API `/utils/get/objectname` の動作テスト

**Input**:
- `sellerId: 'seller123'` - 販売者ID
- `itemId: 'item456'` - 商品ID

**テストケース1: 正常ケース**
- **API呼び出し**: `GET /utils/get/objectname` with params `{seller_id: 'seller123', item_id: 'item456'}`
- **Expected Output**: `{date_folder: '2024-01-01', timestamp: '123456789', uid: 'test-uid'}`
- **検証項目**: 正しいエンドポイントとパラメータでAPI呼び出しされること、レスポンスデータが正常に返されること

**テストケース2: エラーケース**
- **Input**: API呼び出しが失敗する状況
- **Expected Output**: `Error('API Error')` が throw されること
- **検証項目**: API失敗時に適切な例外が発生すること

#### fileToBase64
**目的**: ファイルをBase64文字列に変換する機能テスト

**テストケース1: 正常変換**
- **Input**: `File(['test content'], 'test.txt', {type: 'text/plain'})`
- **Mock FileReader result**: `'data:text/plain;base64,dGVzdCBjb250ZW50'`
- **Expected Output**: `'dGVzdCBjb250ZW50'` (Base64部分のみ)
- **検証項目**: FileReaderが正常に動作し、Base64データが抽出されること

**テストケース2: 読み込みエラー**
- **Input**: `File(['test content'], 'test.txt', {type: 'text/plain'})`
- **Mock FileReader**: エラーイベント発生
- **Expected Output**: Promise rejection with `Error('Read error')`
- **検証項目**: FileReader エラー時に Promise が reject されること

#### getPresignedUploadUrl
**目的**: S3アップロード用プリサインドURL取得テスト

**テストケース1: デフォルト有効期限**
- **Input**: `objectName: 'test-object'`
- **API呼び出し**: `POST /utils/s3url/upload` with `{object_name: 'test-object', expiration: 900}`
- **Expected Output**: `{url: 'https://s3.amazonaws.com/presigned-upload-url'}`
- **検証項目**: デフォルト15分(900秒)の有効期限でプリサインドURL生成

**テストケース2: カスタム有効期限**
- **Input**: `objectName: 'test-object', expiration: 1800`
- **API呼び出し**: `POST /utils/s3url/upload` with `{object_name: 'test-object', expiration: 1800}`
- **Expected Output**: `{url: 'https://s3.amazonaws.com/presigned-upload-url'}`
- **検証項目**: 指定した有効期限（30分）でプリサインドURL生成

#### getPresignedDownloadUrl
**目的**: S3ダウンロード用プリサインドURL取得テスト

- **Input**: `objectName: 'test-object'`
- **API呼び出し**: `POST /utils/s3url/download` with `{object_name: 'test-object', expiration: 900}`
- **Expected Output**: `{url: 'https://s3.amazonaws.com/presigned-download-url'}`
- **検証項目**: ダウンロード用プリサインドURLが正常に生成されること

#### uploadFileToS3
**目的**: S3へのファイルアップロード機能テスト

**テストケース1: 成功ケース**
- **Input**: 
  - `file: File(['test content'], 'test.txt', {type: 'text/plain'})`
  - `url: 'https://s3.amazonaws.com/presigned-upload-url'`
- **Mock axios.put response**: `{status: 200}`
- **Expected Output**: `true`
- **検証項目**: ファイルが正しいContent-Typeヘッダーと共にアップロードされること

**テストケース2: 失敗ケース**
- **Input**: 同上
- **Mock axios.put response**: `{status: 403}`
- **Expected Output**: `false`
- **検証項目**: 非200ステータス時にfalseが返されること

#### downloadImageFromS3
**目的**: S3からの画像ダウンロード・Base64変換テスト

- **Input**: `url: 'https://s3.amazonaws.com/presigned-download-url'`
- **Mock axios.get response**: `{data: Blob(['image data'], {type: 'image/jpeg'})}`
- **Mock FileReader result**: `'data:image/jpeg;base64,aW1hZ2UgZGF0YQ=='`
- **Expected Output**: `'data:image/jpeg;base64,aW1hZ2UgZGF0YQ=='`
- **検証項目**: Blob形式の画像データがBase64形式に変換されること

#### processNovaVTO
**目的**: Nova VTO処理API呼び出しテスト

**テストケース1: 全パラメータ指定**
- **Input**:
  ```typescript
  {
    sellerId: 'seller123', itemId: 'item456',
    dateFolder: '2024-01-01', timestamp: '123456789', uid: 'test-uid',
    objectNames: ['model.jpg', 'garment.jpg'],
    sourceImageObjectName: 'model.jpg', referenceImageObjectName: 'garment.jpg',
    maskType: 'GARMENT', garmentClass: 'UPPER_BODY',
    numberOfImages: 2, quality: 'premium', cfgScale: 5.0, seed: 42
  }
  ```
- **API呼び出し**: `POST /vto/nova/process` with 変換されたパラメータ
- **Expected Output**: `{status: 'success', object_names: ['output1.jpg']}`
- **検証項目**: 全パラメータが正しいAPI形式に変換されて送信されること

**テストケース2: デフォルト値使用**
- **Input**: 最小限のパラメータのみ指定
- **検証デフォルト値**:
  - `mask_type: 'GARMENT'`
  - `garment_class: 'UPPER_BODY'`
  - `number_of_images: 1`
  - `quality: 'standard'`
  - `cfg_scale: 3.0`
  - `seed: -1`

#### processNovaModel
**目的**: Nova Model生成API呼び出しテスト

**テストケース1: 全パラメータ指定**
- **Input**:
  ```typescript
  {
    sellerId: 'seller123', itemId: 'item456',
    dateFolder: '2024-01-01', timestamp: '123456789', uid: 'test-uid',
    objectNames: ['output.jpg'], prompt: 'A beautiful landscape',
    modelId: 'amazon.nova-pro-v1:0', cfgScale: 10.0,
    height: 512, width: 512, numberOfImages: 3
  }
  ```
- **API呼び出し**: `POST /vto/nova/model` with 変換されたパラメータ
- **Expected Output**: `{status: 'success', object_names: ['generated1.jpg']}`
- **検証項目**: 画像生成パラメータが正しく送信されること

**テストケース2: デフォルト値使用**
- **Input**: 最小限のパラメータ（プロンプトのみ）
- **検証デフォルト値**:
  - `model_id: 'amazon.titan-image-generator-v2:0'`
  - `cfg_scale: 8.0`
  - `height: 1024, width: 1024`
  - `number_of_images: 1`

#### processBackgroundReplacement
**目的**: 背景置換処理API呼び出しテスト

**テストケース1: 基本的な背景置換**
- **Input**:
  ```typescript
  {
    sellerId: 'seller123', itemId: 'item456',
    dateFolder: '2024-01-01', timestamp: '123456789', uid: 'test-uid',
    objectNames: ['bg_replaced.jpg'],
    sourceImageObjectName: 'source.jpg',
    backgroundPrompt: 'Beautiful beach with clear blue sky'
  }
  ```
- **API呼び出し**: `POST /background-replacement/process` with 変換されたパラメータ
- **Expected Output**: `{status: 'accepted', object_names: ['bg_replaced.jpg']}`
- **検証項目**: 背景置換パラメータが正しく送信されること

**テストケース2: マスクプロンプト使用**
- **Input**: 基本パラメータ + `maskPrompt: 'person, human figure'`
- **検証項目**: マスクプロンプトが適切に処理されること

**テストケース3: カスタムマスク画像使用**
- **Input**: 基本パラメータ + `maskImageObjectName: 'custom_mask.png'`
- **検証項目**: カスタムマスク画像指定が正しく処理されること

#### downloadFromS3
**目的**: S3からのデータダウンロードテスト

- **Input**: `objectName: 'test-object.jpg'`
- **API呼び出し**: `GET /utils/get/data` with `{object_name: 'test-object.jpg', bucket_name: 'vto-app-local'}`
- **Expected Output**: `{content: 'file content'}`
- **検証項目**: 指定されたオブジェクト名とバケット名でデータが取得されること

### Navigation.test.tsx
- **ナビゲーション表示**: 全メニュー項目の表示確認
  - ブランド名「Nova Canvas」の表示
  - 各ページリンク（Home, Virtual Try-On, Model Generation, Settings）の表示
- **子コンテンツ表示**: children propsで渡されたコンテンツの表示確認
- **ナビゲーション機能**: メニュークリック時の画面遷移テスト
  - useNavigateフックの呼び出し確認
  - 正しいパスへの遷移確認
- **アクティブ状態表示**: 現在のページのハイライト表示確認
  - useLocationフックによる現在パス取得
  - 対応メニュー項目のselected状態確認
- **モバイル表示**: レスポンシブデザインのテスト
  - モバイルビューでのメニューボタン表示
  - ドロワーメニューの開閉動作
  - モバイルナビゲーション後のドロワー自動クローズ

### ImageUpload.test.tsx
- **基本表示**: コンポーネントの基本レンダリング確認
  - ラベルテキストの表示
  - アップロード促進メッセージの表示
- **マスク編集表示**: allowMaskプロパティによる表示制御
  - マスク編集可能時の「(mask editable)」表示
  - マスク編集不可時の非表示
- **画像表示**: アップロード済み画像の表示確認
  - 背景画像としての画像表示
  - アップロード促進メッセージの非表示
- **高さ設定**: カスタム高さとデフォルト高さの適用確認
  - propsで指定した高さの適用
  - デフォルト512pxの適用
- **ファイルドロップ**: react-dropzoneを使用したファイル処理
  - ファイルドロップ時のコールバック呼び出し
  - ドラッグアクティブ状態の表示変更
  - 画像ファイル形式の制限確認

### Home.test.tsx
- **メインタイトル表示**: ホームページのタイトル表示確認
  - 「Amazon Nova Canvas」タイトル
  - サブタイトルの表示
- **機能カード表示**: 各機能の紹介カード表示確認
  - Virtual Try-Onカードの表示と説明文
  - Model Generationカードの表示と説明文
- **ナビゲーション機能**: カードクリック時の画面遷移テスト
  - Virtual Try-Onページへの遷移
  - Model Generationページへの遷移
- **UI要素**: アイコンとレイアウトの確認
  - SVGアイコンの表示
  - ホバーエフェクトスタイルの適用
  - グリッドレイアウトの確認

### Settings.test.tsx
- **設定タイトル表示**: 設定ページのタイトル「設定」の表示確認
- **設定項目表示**: 全設定オプションの表示確認
  - ダークモード設定とその説明文
  - 通知設定とその説明文
  - 自動保存設定とその説明文
- **自動保存メッセージ**: 設定自動保存の案内メッセージ表示
- **設定切り替え機能**: 各設定のトグル動作テスト
  - ダークモード設定のON/OFF切り替え
  - 通知設定のON/OFF切り替え
  - 自動保存設定のON/OFF切り替え
- **独立状態管理**: 各設定の独立した状態管理確認
  - 一つの設定変更が他に影響しないことの確認
- **UI構造**: Material-UIコンポーネントの構造確認
  - Paperコンポーネント内のList構造
  - 設定間のDivider表示
  - ListItemSecondaryActionでのSwitch配置
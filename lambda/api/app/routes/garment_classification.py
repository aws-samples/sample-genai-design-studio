from fastapi import APIRouter, HTTPException
from app.routes.schemas.garment_classification import (
    GarmentClassificationRequest,
    GarmentClassificationResponse,
)
import os
import json
import base64
import boto3
from aws_lambda_powertools import Logger

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="api_proxy", level=LOG_LEVEL)

# Bedrock client for Claude 3.5 Haiku
bedrock_client = boto3.client("bedrock-runtime", region_name="us-east-1")

router = APIRouter()


def get_garment_class_mapping():
    """garmentClassのマッピング辞書を返す"""
    return {
        5: "LONG_SLEEVE_SHIRT",
        6: "SHORT_SLEEVE_SHIRT", 
        7: "NO_SLEEVE_SHIRT",
        8: "OTHER_UPPER_BODY",
        9: "LONG_PANTS",
        10: "SHORT_PANTS",
        11: "OTHER_LOWER_BODY",
        12: "LONG_DRESS",
        13: "SHORT_DRESS",
        14: "FULL_BODY_OUTFIT",
        15: "OTHER_FULL_BODY",
        16: "SHOES",
        17: "BOOTS",
        18: "OTHER_FOOTWEAR"
    }


def get_garment_class_descriptions():
    """garmentClassの説明付きマッピング辞書を返す"""
    return {
        5: "LONG_SLEEVE_SHIRT - 長袖シャツのみ写っている場合。ボタンで前開きできる衣服。",
        6: "SHORT_SLEEVE_SHIRT - 半袖シャツのみ写っている場合。ボタンで前開きできる衣服。", 
        7: "NO_SLEEVE_SHIRT - ノースリーブシャツのみ写っている場合。",
        8: "OTHER_UPPER_BODY - その他の上半身衣類のみ写っている場合",
        9: "LONG_PANTS - 長ズボンのみ写っている場合",
        10: "SHORT_PANTS - 短パンのみ写っている場合",
        11: "OTHER_LOWER_BODY - その他の下半身衣類のみ写っている場合",
        12: "LONG_DRESS - ロングドレスのみ写っている場合",
        13: "SHORT_DRESS - ショートドレスのみ写っている場合",
        14: "FULL_BODY_OUTFIT - 全身衣装。トップス、ボトムス、靴が全て写っている場合はこのカテゴリとする。",
        15: "OTHER_FULL_BODY - その他の全身衣類",
        16: "SHOES - 靴のみ写っている場合",
        17: "BOOTS - ブーツのみ写っている場合",
        18: "OTHER_FOOTWEAR - その他の履物のみ写っている場合"
    }


def create_classification_prompt():
    """衣服分類用のプロンプトを生成"""
    garment_descriptions = get_garment_class_descriptions()
    category_list = "\n".join([f"{k}. {v}" for k, v in garment_descriptions.items()])
    
    prompt = f"""あなたは衣服分類の専門家です。
提供された画像を分析し、以下のカテゴリから最も適切なものを1つ選択してください。

[カテゴリリスト]
{category_list}

画像を詳しく観察し、衣服の種類、袖の長さ、丈の長さ、着用部位などを考慮して分類してください。

回答は以下のJSON形式で返してください：
{{
  "category_id": 5,
  "category_name": "LONG_SLEEVE_SHIRT", 
  "confidence": 0.95,
  "reasoning": "長袖が確認できるシャツ形状のため"
}}

JSON以外の文字は含めないでください。"""
    
    return prompt


def call_claude_classification(image_bytes: bytes, model_id: str):
    """
    Claude 3.5 Haikuで衣服画像を分類
    
    Args:
        image_bytes: 画像のバイトデータ
        model_id: 使用するClaudeモデルID
        
    Returns:
        分類結果の辞書
    """
    try:
        # 画像をBase64エンコード
        image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        # 分類プロンプトを生成
        prompt = create_classification_prompt()
        
        # Claude 3.5 Haikuのリクエスト構造（Messages API形式）
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": image_b64
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        }
        
        # Claude 3.5 Haikuを呼び出し
        response = bedrock_client.invoke_model(
            body=json.dumps(body),
            modelId=model_id,
            accept="application/json",
            contentType="application/json"
        )
        
        response_body = json.loads(response.get("body").read())
        
        # レスポンスからテキストを抽出
        if "content" in response_body and len(response_body["content"]) > 0:
            response_text = response_body["content"][0]["text"]
            
            # JSONをパース
            try:
                result = json.loads(response_text)
                
                # 結果の検証
                if all(key in result for key in ["category_id", "category_name", "confidence", "reasoning"]):
                    # category_idが有効な範囲内かチェック
                    if result["category_id"] in get_garment_class_mapping():
                        logger.info(f"Classification successful: {result['category_name']} (confidence: {result['confidence']:.2%})")
                        return result
                    else:
                        raise ValueError(f"無効なcategory_id: {result['category_id']}")
                else:
                    raise ValueError("必要なキーが不足しています")
                    
            except json.JSONDecodeError as e:
                raise ValueError(f"JSON解析エラー: {str(e)}")
        else:
            raise ValueError("レスポンスにcontentが含まれていません")
            
    except Exception as e:
        logger.error(f"Claude classification error with model {model_id}: {str(e)}")
        raise


def classify_garment_image(image_bytes: bytes):
    """
    衣服画像を分類（フォールバック機能付き）
    
    Args:
        image_bytes: 画像のバイトデータ
        
    Returns:
        分類結果の辞書
    """
    # Model IDs for fallback
    model_ids = [
        "us.anthropic.claude-3-5-haiku-20241022-v1:0",  # inference profile ID
        "anthropic.claude-3-5-haiku-20241022-v1:0",     # 直接モデルID
        "anthropic.claude-3-haiku-20240307-v1:0"        # 古いバージョン
    ]
    
    try:
        logger.info("Starting garment classification")
        
        last_error = None
        
        # 複数のモデルIDで試行
        for model_id in model_ids:
            try:
                logger.info(f"Trying classification with model: {model_id}")
                result = call_claude_classification(image_bytes, model_id)
                
                return {
                    "success": True,
                    "result": result,
                    "model_used": model_id
                }
                
            except Exception as e:
                last_error = f"モデル {model_id}: {str(e)}"
                logger.warning(f"Classification failed with {model_id}: {str(e)}")
                continue  # 次のモデルIDを試行
        
        # すべてのモデルIDで失敗した場合
        error_msg = f"すべてのモデルで失敗: {last_error}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg
        }
            
    except Exception as e:
        error_msg = f"Garment classification error: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg
        }


@router.post("/vto/classify-garment", response_model=GarmentClassificationResponse)
async def classify_garment(request: GarmentClassificationRequest):
    """
    Claude 3.5 Haiku を使用して衣服画像を分類する

    Args:
        request: GarmentClassificationリクエスト（画像データ）

    Returns:
        GarmentClassificationレスポンス（分類結果）
    """
    try:
        request_id = f"{request.group_id}_{request.user_id}"
        logger.info(f"Received Garment Classification request: {request_id}")

        # 画像データを取得
        image_bytes = None
        
        if request.image_base64:
            # Base64エンコードされた画像データから取得
            image_bytes = base64.b64decode(request.image_base64)
            logger.info("Image loaded from base64 data")
            
        elif request.image_object_name:
            # S3オブジェクトから画像を取得（必要に応じて実装）
            # 現在はBase64のみサポート
            raise HTTPException(status_code=400, detail="S3 object name not supported yet")
            
        else:
            raise HTTPException(status_code=400, detail="No image data provided")
        
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Failed to load image data")
        
        # 衣服分類を実行
        classification_result = classify_garment_image(image_bytes)
        
        logger.info(f"Classification completed: {classification_result}")
        
        if classification_result["success"]:
            return GarmentClassificationResponse(
                request_id=request_id,
                status="success",
                classification_result=classification_result,
                message="Garment classification completed successfully",
            )
        else:
            return GarmentClassificationResponse(
                request_id=request_id,
                status="error",
                error=classification_result.get("error", "Unknown error"),
                message="Garment classification failed",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in Garment Classification process: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

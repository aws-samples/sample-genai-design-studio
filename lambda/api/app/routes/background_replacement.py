from fastapi import APIRouter, HTTPException
from app.routes.schemas.background_replacement import (
    BackgroundReplacementRequest,
    BackgroundReplacementResponse,
)
import os
import json
import boto3
from aws_lambda_powertools import Logger

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="api_proxy", level=LOG_LEVEL)

# Lambda client for invoking VTO generation function
lambda_client = boto3.client("lambda")
VTO_GEN_FUNCTION_NAME = os.environ.get("VTO_GEN_FUNCTION_NAME")

router = APIRouter()


def invoke_background_replacement_lambda(request: BackgroundReplacementRequest):
    """
    背景置換Lambda関数を非同期で呼び出す

    Args:
        request: BackgroundReplacementリクエスト
    """
    try:
        if not VTO_GEN_FUNCTION_NAME:
            logger.error("VTO_GEN_FUNCTION_NAME environment variable not set")
            return

        logger.info(
            f"Invoking background replacement Lambda for group: {request.group_id}, user: {request.user_id}"
        )

        # Lambda関数に渡すペイロードを作成
        payload = {
            "replace_background_params": {
                "prompt": request.prompt,
                "input_image_object_name": request.input_image_object_name,
                "mask_prompt": request.mask_prompt,
                "mask_image_object_name": request.mask_image_object_name,
                "model_id": request.model_id,
                "outPaintingMode": request.outPaintingMode,
                "cfg_scale": request.cfg_scale,
                "number_of_images": request.number_of_images,
                "quality": request.quality,
                "height": request.height,
                "width": request.width,
                "object_names": request.object_names,
            }
        }

        # Lambda関数を非同期で呼び出し（InvocationType='Event'）
        response = lambda_client.invoke(
            FunctionName=VTO_GEN_FUNCTION_NAME,
            InvocationType="Event",  # 非同期呼び出し
            Payload=json.dumps(payload),
        )

        logger.info(
            f"Background replacement Lambda invoked successfully. StatusCode: {response['StatusCode']}"
        )

    except Exception as e:
        logger.error(
            f"Error invoking background replacement Lambda for group: {request.group_id}, user: {request.user_id}: {str(e)}"
        )


@router.post("/vto/nova/background", response_model=BackgroundReplacementResponse)
async def process_background_replacement(request: BackgroundReplacementRequest):
    """
    Amazon Nova Canvas を使用して背景置換処理を実行する

    Args:
        request: BackgroundReplacementリクエスト（入力画像、プロンプト、各種パラメータ）

    Returns:
        BackgroundReplacementレスポンス（リクエストID、ステータス、生成画像）
    """
    try:
        # リクエストにオブジェクト名を追加
        object_names = request.object_names

        request_id = request.uid
        logger.info(f"Received background replacement request: {request_id}")
        logger.info(f"Prompt: {request.prompt}")
        logger.info(f"Generated S3 object names: {object_names}")

        # 背景置換Lambda関数を非同期で呼び出し
        invoke_background_replacement_lambda(request)

        # 即座に受付完了レスポンスを返す
        return BackgroundReplacementResponse(
            request_id=request_id,
            status="accepted",
            object_names=object_names,
            message="Background replacement request accepted. Images will be saved to S3.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in background replacement process: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

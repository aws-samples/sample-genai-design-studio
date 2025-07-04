from fastapi import APIRouter, HTTPException
from app.routes.schemas.nova_model import NovaModelRequest, NovaModelResponse
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


def invoke_nova_model_generation_lambda(request: NovaModelRequest):
    """
    Nova Model生成Lambda関数を非同期で呼び出す

    Args:
        request: NovaModelリクエスト
    """
    try:
        if not VTO_GEN_FUNCTION_NAME:
            logger.error("VTO_GEN_FUNCTION_NAME environment variable not set")
            return

        logger.info(
            f"Invoking Nova Model generation Lambda for group: {request.group_id}, user: {request.user_id}"
        )

        # Lambda関数に渡すペイロードを作成
        payload = {
            "text_to_image_params": {
                "prompt": request.prompt,
                "model_id": request.model_id,
                "cfg_scale": request.cfg_scale,
                "quality": request.quality,
                "height": request.height,
                "width": request.width,
                "number_of_images": request.number_of_images,
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
            f"Nova Model generation Lambda invoked successfully. StatusCode: {response['StatusCode']}"
        )

    except Exception as e:
        logger.error(
            f"Error invoking Nova Model generation Lambda for group: {request.group_id}, user: {request.user_id}: {str(e)}"
        )


@router.post("/vto/nova/model", response_model=NovaModelResponse)
async def process_nova_model(request: NovaModelRequest):
    """
    Amazon Nova Model を使用してText-to-Image生成処理を実行する

    Args:
        request: NovaModelリクエスト（プロンプト、各種パラメータ）

    Returns:
        NovaModelレスポンス（リクエストID、ステータス、生成画像）
    """
    try:
        # リクエストにオブジェクト名を追加
        object_names = request.object_names

        request_id = request.uid
        logger.info(f"Received Nova Model request: {request_id}")
        logger.info(f"Prompt: {request.prompt}")
        logger.info(f"Generated S3 object names: {object_names}")

        # Nova Model生成Lambda関数を非同期で呼び出し
        invoke_nova_model_generation_lambda(request)

        # 即座に受付完了レスポンスを返す
        return NovaModelResponse(
            request_id=request_id,
            status="accepted",
            object_names=object_names,
            message="Nova Model processing request accepted. Images will be saved to S3.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in Nova Model process: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

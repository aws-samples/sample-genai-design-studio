from fastapi import APIRouter, HTTPException
from app.routes.schemas.nova_vto import NovaVTORequest, NovaVTOResponse
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


def invoke_vto_generation_lambda(request: NovaVTORequest):
    """
    VTO生成Lambda関数を非同期で呼び出す

    Args:
        request: NovaVTOリクエスト
    """
    try:
        if not VTO_GEN_FUNCTION_NAME:
            logger.error("VTO_GEN_FUNCTION_NAME environment variable not set")
            return

        logger.info(
            f"Invoking VTO generation Lambda for group: {request.group_id}, user: {request.user_id}"
        )

        # Lambda関数に渡すペイロードを作成（画像データの代わりにS3オブジェクト名を渡す）
        payload = {
            "vto_params": {
                "source_image_object_name": request.source_image_object_name,
                "reference_image_object_name": request.reference_image_object_name,
                "mask_image_object_name": request.mask_image_object_name,
                "mask_type": request.mask_type,
                "mask_prompt": request.mask_prompt or "",
                "garment_class": request.garment_class,
                "long_sleeve_style": request.long_sleeve_style,
                "tucking_style": request.tucking_style,
                "outer_layer_style": request.outer_layer_style,
                "mask_shape": request.mask_shape,
                "mask_shape_prompt": request.mask_shape_prompt,
                "preserve_body_pose": request.preserve_body_pose,
                "preserve_hands": request.preserve_hands,
                "preserve_face": request.preserve_face,
                "merge_style": request.merge_style,
                "return_mask": request.return_mask,
                "number_of_images": request.number_of_images,
                "quality": request.quality,
                "cfg_scale": request.cfg_scale,
                "seed": request.seed,
                "date_folder": request.date_folder,
                "timestamp_uid": f"{request.timestamp}_{request.uid}",
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
            f"VTO generation Lambda invoked successfully. StatusCode: {response['StatusCode']}"
        )

    except Exception as e:
        logger.error(
            f"Error invoking VTO generation Lambda for group: {request.group_id}, user: {request.user_id}: {str(e)}"
        )


@router.post("/vto/nova/process", response_model=NovaVTOResponse)
async def process_nova_vto(request: NovaVTORequest):
    """
    Amazon Nova Canvas を使用してVirtual Try-On処理を実行する

    Args:
        request: NovaVTOリクエスト（ソース画像、参照画像、各種パラメータ）

    Returns:
        NovaVTOレスポンス（リクエストID、ステータス、生成画像）
    """
    try:
        # リクエストにオブジェクト名を追加
        object_names = request.object_names

        request_id = request.uid
        logger.info(f"Received Nova VTO request: {request_id}")
        logger.info(f"Generated S3 object names: {object_names}")

        # VTO生成Lambda関数を非同期で呼び出し
        invoke_vto_generation_lambda(request)

        # 即座に受付完了レスポンスを返す
        return NovaVTOResponse(
            request_id=request_id,
            status="accepted",
            object_names=object_names,
            message="VTO processing request accepted. Images will be saved to S3.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in Nova VTO process: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

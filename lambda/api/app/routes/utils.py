from fastapi import APIRouter, HTTPException
from app.routes.schemas.utils import (
    GenerateObjectNamesResponse,
    PresignedUploadUrlRequest,
    PresignedUrlResponse,
)
from app.utils.core import (
    get_object_names,
    creat_s3_presigned_url,
)
import os
from aws_lambda_powertools import Logger

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="api_proxy", level=LOG_LEVEL)

router = APIRouter()


@router.get("/utils/get/objectname", response_model=GenerateObjectNamesResponse)
async def generate_object_names_endpoint(group_id: str, user_id: str):
    """
    S3ストレージ用のオブジェクト名を生成する

    Args:
        group_id: グループID（クエリパラメータ）
        user_id: ユーザーID（クエリパラメータ）

    Returns:
        date_folder、timestamp、uidを含むレスポンス
    """
    try:
        # Validate parameters
        if not group_id or not group_id.strip():
            raise HTTPException(
                status_code=400, detail="group_id must be non-empty string"
            )
        if not user_id or not user_id.strip():
            raise HTTPException(
                status_code=400, detail="user_id must be non-empty string"
            )

        logger.info(
            f"Generating object names for group_id: {group_id}, user_id: {user_id}"
        )

        date_folder, timestamp, uid = get_object_names(
            group_id=group_id, user_id=user_id
        )

        return GenerateObjectNamesResponse(
            date_folder=date_folder, timestamp=timestamp, uid=uid
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating object names: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/utils/s3url/upload", response_model=PresignedUrlResponse)
async def upload_to_s3_url_endpoint(request: PresignedUploadUrlRequest):
    """
    S3への画像アップロード用のpresigned URLを生成する

    Args:
        request: PresignedUploadUrlRequest（object_name、expiration）

    Returns:
        PresignedUrlResponse（URL、エラー）
    """
    try:
        logger.info(f"Creating presigned upload URL for: {request.object_name}")

        presigned_url = creat_s3_presigned_url(
            object_name=request.object_name, method="PUT", expiration=request.expiration
        )

        if presigned_url is None:
            return PresignedUrlResponse(
                object_name=request.object_name,
                error="Failed to generate presigned upload URL",
            )

        return PresignedUrlResponse(
            url=presigned_url,
            object_name=request.object_name,
            error=None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating presigned upload URL: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/utils/s3url/download", response_model=PresignedUrlResponse)
async def download_from_s3_url_endpoint(request: PresignedUploadUrlRequest):
    """
    S3からの画像ダウンロード用のpresigned URLを生成する

    Args:
        request: PresignedUploadUrlRequest（object_name、expiration）

    Returns:
        PresignedUrlResponse（URL、エラー）
    """
    try:
        logger.info(f"Creating presigned download URL for: {request.object_name}")

        presigned_url = creat_s3_presigned_url(
            object_name=request.object_name, method="GET", expiration=request.expiration
        )

        if presigned_url is None:
            return PresignedUrlResponse(
                object_name=request.object_name,
                error="Failed to generate presigned download URL",
            )

        return PresignedUrlResponse(
            url=presigned_url,
            object_name=request.object_name,
            error=None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating presigned download URL: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

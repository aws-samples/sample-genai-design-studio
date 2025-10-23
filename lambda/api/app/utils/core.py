import json
from typing import Any, Dict, Tuple, Optional, List
import os
import boto3
from botocore.exceptions import ClientError
from io import BytesIO
from datetime import datetime
import uuid
import tempfile
import time
import base64
import io
from PIL import Image
from botocore.client import Config

# API proxi
from aws_lambda_powertools import Logger

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="api_proxy", level=LOG_LEVEL)

# リージョン設定
REGION = os.environ.get(
    "AWS_DEFAULT_REGION", "us-east-1"
)  # AWS_DEFAULT_REGIONを優先的に使用
VTO_BUCKET = os.environ.get("VTO_BUCKET")
PROMPT_PREFIX = os.environ.get("OBJECT_NAME", "config/prompt")
GENIMAGE_FUNCTION_NAME = os.environ.get("GENIMAGE_FUNCTION_NAME", "GenImageFunction")
GENVIDEO_FUNCTION_NAME = os.environ.get("GENVIDEO_FUNCTION_NAME", "GenVideoFunction")

# S3クライアント設定
s3_client = boto3.client(
    "s3",
    region_name=REGION,
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)
BEDROCK_REGION = "us-east-1"

# Bedrock client for garment classification
BEDROCK_CLIENT = boto3.client(
    service_name="bedrock-runtime",
    region_name=BEDROCK_REGION,
    config=Config(read_timeout=300),
)

# Model IDs
MODEL_IDS = {
    "anthropic.claude-3-haiku": "anthropic.claude-3-haiku-20240307-v1:0",
    "anthropic.claude-3.7-sonnet": "arn:aws:bedrock:us-east-1:825612589257:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0",
}


def get_object_names(group_id: str, user_id: str) -> Tuple[str, str, str]:
    """
    Generates object names for S3 storage based on group and user IDs.

    Args:
    group_id (str): ID of the group
    user_id (str): ID of the user

    Returns:
    Tuple[str, str, str]: date_folder, timestamp, and uid
    """
    now = datetime.now()
    date_folder = now.strftime("%Y%m%d%H")
    timestamp = now.strftime("%Y%m%d%H%M%S")
    system_uid = str(uuid.uuid4())[:8]  # UUIDの最初の8文字を使用
    uid = f"{group_id}_{user_id}_{system_uid}"
    return date_folder, timestamp, uid


def save_dict_to_s3(data: Dict, object_name: str) -> None:
    """
    Saves a dictionary as a JSON file to an S3 bucket.

    Args:
    data (Dict): Dictionary to be saved
    object_name (str): Key for the S3 object
    """

    try:
        json_data = json.dumps(data, ensure_ascii=False)

        # S3にアップロード
        s3_client.put_object(
            Bucket=VTO_BUCKET,
            Key=object_name,
            Body=json_data,
            ContentType="application/json",
        )
        logger.info(
            f"データが正常に S3 バケット '{VTO_BUCKET}' の '{object_name}' に保存されました。"
        )
    except ClientError as e:
        logger.error(f"S3へのアップロード中にエラーが発生しました: {e}")
    except Exception as e:
        logger.error(f"予期せぬエラーが発生しました: {e}")


def save_pil_image_to_s3(
    pil_image: Image.Image, object_name: str, format: str = "PNG"
) -> None:
    """
    Saves a PIL Image to an S3 bucket.

    Args:
    pil_image (Image.Image): PIL Image object to be saved
    object_name (str): Key for the S3 object
    format (str, optional): Image format. Defaults to "PNG".
    """
    try:
        # PILのImageオブジェクトをバイトストリームに変換
        img_byte_arr = BytesIO()
        pil_image.save(img_byte_arr, format=format)
        img_byte_arr = img_byte_arr.getvalue()

        # S3にアップロード
        s3_client.put_object(
            Bucket=VTO_BUCKET,
            Key=object_name,
            Body=img_byte_arr,
            ContentType=f"image/{format.lower()}",
        )
        logger.info(
            f"画像が正常に S3 バケット '{VTO_BUCKET}' の '{object_name}' に保存されました。"
        )
    except ClientError as e:
        logger.error(f"S3へのアップロード中にエラーが発生しました: {e}")
    except Exception as e:
        logger.error(f"予期せぬエラーが発生しました: {e}")


# def creat_s3_presigned_url(
#     bucket_name: str, object_name: str, expiration: int = 900
# ) -> Optional[str]:
#     """
#     Generates a presigned URL for an S3 object.

#     Args:
#     bucket_name (str): Name of the S3 bucket
#     object_name (str): Key of the S3 object
#     expiration (int, optional): Expiration time in seconds. Defaults to 900.

#     Returns:
#     Optional[str]: Presigned URL or None if an error occurs
#     """
#     try:
#         response = s3_client.generate_presigned_url(
#             "get_object",
#             Params={"Bucket": bucket_name, "Key": object_name},
#             ExpiresIn=expiration,
#         )
#         return response
#     except ClientError as e:
#         logger.error(f"Error generating presigned URL: {e}")
#         return None


def get_data_from_s3(object_name: str) -> Optional[str]:
    """
    Downloads data from an S3 object and returns it as a string.
    For text files, returns the content as UTF-8 string.
    For binary files (like images), returns Base64 encoded string.

    Args:
    object_name (str): Key of the S3 object

    Returns:
    Optional[str]: Content of the S3 object as a string, or None if an error occurs
    """
    try:
        response = s3_client.get_object(Bucket=VTO_BUCKET, Key=object_name)
        content_bytes = response["Body"].read()

        # Try to decode as UTF-8 first (for text files)
        try:
            content = content_bytes.decode("utf-8")
            return content
        except UnicodeDecodeError:
            # If UTF-8 decoding fails, assume it's binary data and return Base64 encoded
            import base64

            content_base64 = base64.b64encode(content_bytes).decode("utf-8")
            return content_base64

    except ClientError as e:
        logger.error(f"Error downloading {object_name}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error downloading {object_name}: {e}")
        return None


def get_image_from_s3_as_base64(object_name: str) -> Optional[str]:
    """
    Downloads image data from an S3 object and returns it as Base64 encoded string.

    Args:
    object_name (str): Key of the S3 object

    Returns:
    Optional[str]: Base64 encoded image content, or None if an error occurs
    """
    try:
        response = s3_client.get_object(Bucket=VTO_BUCKET, Key=object_name)
        content_bytes = response["Body"].read()

        import base64

        content_base64 = base64.b64encode(content_bytes).decode("utf-8")
        return content_base64

    except ClientError as e:
        logger.error(f"Error downloading image {object_name}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error downloading image {object_name}: {e}")
        return None


def creat_s3_presigned_url(
    object_name: str, method: str = "GET", expiration: int = 900
) -> Optional[str]:
    """
    Generates a presigned URL for S3 object operations (GET or PUT).

    Args:
    object_name (str): Key of the S3 object
    method (str): HTTP method - "GET" for download, "PUT" for upload
    expiration (int, optional): Expiration time in seconds. Defaults to 900.

    Returns:
    Optional[str]: Presigned URL or None if an error occurs
    """
    try:
        if method.upper() == "PUT":
            client_method = "put_object"
            http_method = "PUT"
        else:
            client_method = "get_object"
            http_method = "GET"

        response = s3_client.generate_presigned_url(
            ClientMethod=client_method,
            Params={"Bucket": VTO_BUCKET, "Key": object_name},
            ExpiresIn=expiration,
            HttpMethod=http_method,
        )
        logger.info(
            f"Presigned URL generated for {client_method}\nBucket: {VTO_BUCKET}\nObject_name: {object_name}"
        )
        return response
    except ClientError as e:
        logger.error(f"Error generating presigned URL: {e}")
        return None

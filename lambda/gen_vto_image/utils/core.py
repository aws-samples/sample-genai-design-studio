"""Core utility functions for image processing and S3 operations"""

import os
import base64
import io
from typing import Optional, Dict, Any, List, Union
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image
import numpy as np
from aws_lambda_powertools import Logger

# Logger setup
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="vto_core", level=LOG_LEVEL)

# S3 client setup
VTO_BUCKET = os.environ.get("VTO_BUCKET")
REGION = os.environ.get("REGION", "us-east-1")
S3_CLIENT = boto3.client("s3", region_name=REGION)

# Bedrock client setup
BEDROCK_REGION = "us-east-1"

# Nova Model IDs
NOVA_MODEL_IDS = {
    "lite": "us.amazon.nova-lite-v1:0",
    "canvas": "amazon.nova-canvas-v1:0",
    "micro": "us.amazon.nova-micro-v1:0",
}

# Model ID mapping for API to Bedrock
NOVA_MODEL_MAPPING = {
    "amazon.nova-canvas-v1:0": "amazon.nova-canvas-v1:0",
    "amazon.titan-image-generator-v2:0": "amazon.titan-image-generator-v2:0",
}

# DEFAULT MODELS
DEFAULTE_GEN_TAGS_MODEL = NOVA_MODEL_IDS["lite"]
DEFAULT_GEN_IMG = NOVA_MODEL_IDS["canvas"]
DEFAULT_BACKGROUND = NOVA_MODEL_IDS["canvas"]
DEFAULT_TRANSLATION = NOVA_MODEL_IDS["micro"]
DEFAULT_VTO_IMG = NOVA_MODEL_IDS["canvas"]

BEDROCK_CLIENT = boto3.client(
    service_name="bedrock-runtime",
    region_name=BEDROCK_REGION,
    config=Config(read_timeout=300),
)


# Custom exception class
class ImageError(Exception):
    """Exception class for image generation related errors"""

    pass


def get_bedrock_model_id(api_model_id: str) -> str:
    """
    Map API model ID to Bedrock model ID
    
    Args:
        api_model_id: Model ID specified in API request
        
    Returns:
        Bedrock model ID to use for API calls
        
    Examples:
        >>> get_bedrock_model_id("amazon.nova-canvas-v1:0")
        'amazon.nova-canvas-v1:0'
    """
    bedrock_model_id = NOVA_MODEL_MAPPING.get(api_model_id, api_model_id)
    logger.info(f"Model ID mapping: {api_model_id} -> {bedrock_model_id}")
    return bedrock_model_id


def is_nova2_model(model_id: str) -> bool:
    """
    Check if the model ID is Nova 2 Omni
    
    Args:
        model_id: API model ID
        
    Returns:
        True if Nova 2 Omni, False otherwise
        
    Examples:
        >>> is_nova2_model("amazon.nova-canvas-v1:0")
        False
    """
    return model_id == "nova2"


def pil_image_to_base64(pil_image: Image.Image) -> str:
    """Convert PIL image to Base64 encoded string"""
    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def base64_to_pil_image(base64_str: str) -> Image.Image:
    """
    Converts a Base64 encoded string to a PIL Image object.
    """
    # Remove the data URL prefix if it exists
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]

    # Decode base64 string to bytes
    image_bytes = base64.b64decode(base64_str)

    # Create PIL Image object
    image_buffer = io.BytesIO(image_bytes)
    pil_image = Image.open(image_buffer)

    return pil_image


def pil_to_binary_mask(pil_image: Image.Image) -> Image.Image:
    """Convert PIL image to binary mask"""
    np_image = np.array(pil_image)

    if len(np_image.shape) == 3 and np_image.shape[2] == 4:
        alpha_channel = np_image[:, :, 3]
        # Non-inverted: low alpha parts to black (0), high parts to white (255)
        binary_mask = (alpha_channel > 128).astype(np.uint8) * 255
    else:
        if len(np_image.shape) == 3:
            gray_image = np.mean(np_image, axis=2)
        else:
            gray_image = np_image
        # Non-inverted: low gray values to black (0), high values to white (255)
        binary_mask = (gray_image > 128).astype(np.uint8) * 255

    return Image.fromarray(binary_mask, mode="L")


def get_image_from_s3_as_base64(object_name: str) -> Optional[str]:
    """
    Downloads image data from an S3 object and returns it as Base64 encoded string.

    Args:
        object_name (str): Key of the S3 object

    Returns:
        Optional[str]: Base64 encoded image content, or None if an error occurs
    """
    try:
        response = S3_CLIENT.get_object(Bucket=VTO_BUCKET, Key=object_name)
        content_bytes = response["Body"].read()

        content_base64 = base64.b64encode(content_bytes).decode("utf-8")
        return content_base64

    except ClientError as e:
        logger.error(f"Error downloading image {object_name}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error downloading image {object_name}: {e}")
        return None


def save_image_to_s3(image_base64: str, bucket: str, key: str) -> Optional[str]:
    """
    Save base64 encoded image to S3 and return the S3 URL

    Args:
        image_base64: Base64 encoded image string
        bucket: S3 bucket name
        key: S3 object key

    Returns:
        S3 URL of the saved image or None if error
    """
    try:
        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_base64)

        # Upload to S3
        S3_CLIENT.put_object(
            Bucket=bucket, Key=key, Body=image_bytes, ContentType="image/png"
        )

        # Return S3 URL
        s3_url = f"s3://{bucket}/{key}"
        logger.info(f"Image saved to S3. s3_url: {s3_url}")
        return s3_url

    except ClientError as e:
        logger.error(f"Error saving image to S3: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error saving image to S3: {e}")
        return None


def generate_tags_from_image(
    process_name: str,
    image_base64: str,
    image_short_size: int = 768,
    model_id: str = DEFAULTE_GEN_TAGS_MODEL,
) -> Optional[Dict]:
    """
    Generate tags from image using Amazon Nova Pro model.

    Args:
        process_name (str): process name which called this function
        image_base64 (str): Base64 encoded image data
        image_short_size (int): Size for image short side resize
        model_id (str): Bedrock model ID to use

    Returns:
        Optional[Dict]: Generated tags response or None if error occurs
    """
    try:
        logger.info("Generating tags from image")
        # Decode base64 image
        image_data_bytes = base64.b64decode(image_base64)

        # Open image with PIL
        image_pil = Image.open(io.BytesIO(image_data_bytes))
        width, height = image_pil.size

        # Resize image
        ratio = image_short_size / min(width, height)
        width = round(ratio * width)
        height = round(ratio * height)

        image_pil = image_pil.resize((width, height), resample=Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image_pil.save(buffer, format="webp", quality=90)
        image_data = buffer.getvalue()

        # Create prompt
        prompts = """describe the image for searching following images.
Focusing particularly on the characteristics of people in the photo, their gender, race, the clothes they are wearing, and the items they have on them
Output only describe text in json format.
For example: {'text': "describing image text here"}
"""

        prefill = """{"""

        logger.info("Input Prompt:\n" + prompts)

        # Create message for Nova Pro
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "image": {
                            "format": "webp",
                            "source": {
                                "bytes": image_data,
                            },
                        }
                    },
                    {"text": prompts},
                ],
            },
            {
                "role": "assistant",
                "content": [
                    {"text": prefill},
                ],
            },
        ]

        # Call Bedrock
        bd_response = BEDROCK_CLIENT.converse(
            modelId=model_id,
            messages=messages,
            inferenceConfig={
                "temperature": 0.0,
                "maxTokens": 1024,
            },
        )

        logger.info(f"gen tag response: {bd_response}")
        # Extract the generated text from the response
        output_message = bd_response.get("output", {}).get("message", {})
        tag_content = output_message["content"][0].get("text", "")
        logger.info(f"Generated tags for image: {tag_content[:100]}...")
        response = {
            "process_name": process_name,
            "tags": tag_content,
        }
        return response

    except Exception as e:
        logger.error(f"Error generating tags from image: {str(e)}")
        response = {
            "process_name": process_name,
            "tags": None,
            "error": str(e),
        }
        return response

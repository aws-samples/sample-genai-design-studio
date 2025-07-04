"""Background replacement utility functions using Amazon Nova Canvas outpainting"""

import os
import json
from typing import Dict, Any, Optional, List
from aws_lambda_powertools import Logger
from .core import BEDROCK_CLIENT, ImageError, save_image_to_s3, VTO_BUCKET
from .translate import translate_to_english

# Logger setup
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="vto_replace_background", level=LOG_LEVEL)

# Default model
DEFAULT_BACKGROUND = "amazon.nova-canvas-v1:0"


def replace_background(
    prompt_txt: str,
    input_image: str,
    mask_prompt: Optional[str] = "people",
    mask_image: Optional[str] = None,
    model_id: str = DEFAULT_BACKGROUND,
    outPaintingMode: str = "DEFAULT",
    cfgScale: float = 5.0,
    numberOfImages: int = 1,
    quality: str = "premium",
    height: int = 512,
    width: int = 512,
    object_names: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Replace background using Amazon Nova Canvas outpainting

    Args:
        prompt_txt: Text prompt for the new background
        input_image: Base64 encoded input image
        mask_prompt: Optional mask prompt for automatic mask generation (default: "people")
        mask_image: Optional base64 encoded mask image
        model_id: Model ID to use
        outPaintingMode: Outpainting mode
        cfgScale: CFG scale for generation
        numberOfImages: Number of images to generate
        height: Output image height
        width: Output image width
        object_names: Optional S3 object names for saving

    Returns:
        Dict containing the response body with generated images
    """
    try:
        logger.info("Processing background replacement request")

        # Process prompt with language detection and translation
        logger.info("Process prompt with language detection and translation")
        processed_prompt = translate_to_english(prompt_txt)
        logger.info(f"Original prompt: {prompt_txt}")
        logger.info(f"Processed prompt: {processed_prompt}")

        # Build request body
        body = {
            "taskType": "OUTPAINTING",
            "outPaintingParams": {
                "text": processed_prompt,
                "image": input_image,
                "outPaintingMode": outPaintingMode,
            },
            "imageGenerationConfig": {
                "numberOfImages": numberOfImages,
                "quality": quality,
                "height": height,
                "width": width,
                "cfgScale": cfgScale,
            },
        }

        # Add mask image or mask prompt
        if mask_image:
            body["outPaintingParams"]["maskImage"] = mask_image
        else:
            body["outPaintingParams"]["maskPrompt"] = mask_prompt

        # Convert to JSON
        body_json = json.dumps(body)

        # Generate image
        accept = "application/json"
        content_type = "application/json"

        logger.info(f"Invoking model {model_id} for background replacement")
        response = BEDROCK_CLIENT.invoke_model(
            body=body_json, modelId=model_id, accept=accept, contentType=content_type
        )

        response_body = json.loads(response.get("body").read())

        # Check for errors
        finish_reason = response_body.get("error")
        if finish_reason is not None:
            raise ImageError(f"Background replacement error. Error is {finish_reason}")

        logger.info("Successfully generated background replacement image")

        # Save images to S3 if object_names are provided
        if object_names and VTO_BUCKET:
            images = response_body.get("images", [])
            s3_urls = []

            for idx, image_base64 in enumerate(images):
                if idx < len(object_names):
                    # Use pre-generated object name
                    s3_key = object_names[idx]

                    # Save to S3
                    s3_url = save_image_to_s3(image_base64, VTO_BUCKET, s3_key)
                    if s3_url:
                        s3_urls.append(s3_url)
                    else:
                        logger.warning(f"Failed to save image {idx} to S3")
                else:
                    logger.warning(f"No object name provided for image {idx}")

            # Add S3 URLs to response
            response_body["s3_urls"] = s3_urls
            logger.info(f"Saved {len(s3_urls)} images to S3")

        return response_body

    except Exception as e:
        logger.error(f"Error in replace_background: {str(e)}")
        return {"error": str(e)}


def process_background_replacement(
    replace_bg_params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Process background replacement request

    Args:
        replace_bg_params: Dictionary containing background replacement parameters

    Returns:
        Dict containing Lambda response with status code and body
    """
    from .core import get_image_from_s3_as_base64

    logger.info("Processing background replacement request")

    try:
        # Extract parameters
        prompt_txt = replace_bg_params.get("prompt", "")
        input_image_object_name = replace_bg_params.get("input_image_object_name")
        mask_prompt = replace_bg_params.get("mask_prompt", "people")
        mask_image_object_name = replace_bg_params.get("mask_image_object_name")
        model_id = replace_bg_params.get("model_id", DEFAULT_BACKGROUND)
        outPaintingMode = replace_bg_params.get("outPaintingMode", "DEFAULT")
        cfgScale = replace_bg_params.get("cfg_scale", 5.0)
        numberOfImages = replace_bg_params.get("number_of_images", 1)
        quality = replace_bg_params.get("quality", "premium")
        height = replace_bg_params.get("height", 512)
        width = replace_bg_params.get("width", 512)
        object_names = replace_bg_params.get("object_names")

        # Validate required parameters
        if not prompt_txt:
            return {
                "statusCode": 400,
                "body": json.dumps(
                    {"error": "Prompt is required for background replacement"}
                ),
            }

        if not input_image_object_name:
            return {
                "statusCode": 400,
                "body": json.dumps(
                    {
                        "error": "input_image_object_name is required for background replacement"
                    }
                ),
            }

        # Load input image from S3
        logger.info(f"Loading input image from S3: {input_image_object_name}")
        input_image_base64 = get_image_from_s3_as_base64(input_image_object_name)
        if not input_image_base64:
            return {
                "statusCode": 500,
                "body": json.dumps(
                    {
                        "error": f"Failed to load input image from S3: {input_image_object_name}",
                        "message": "Background replacement failed",
                    }
                ),
            }

        # Load mask image if provided
        mask_image_base64 = None
        if mask_image_object_name:
            logger.info(f"Loading mask image from S3: {mask_image_object_name}")
            mask_image_base64 = get_image_from_s3_as_base64(mask_image_object_name)
            if not mask_image_base64:
                logger.warning(
                    f"Failed to load mask image from S3: {mask_image_object_name}"
                )

        # Call replace_background function
        response_body = replace_background(
            prompt_txt=prompt_txt,
            input_image=input_image_base64,
            mask_prompt=mask_prompt,
            mask_image=mask_image_base64,
            model_id=model_id,
            outPaintingMode=outPaintingMode,
            cfgScale=cfgScale,
            numberOfImages=numberOfImages,
            quality=quality,
            height=height,
            width=width,
            object_names=object_names,
        )

        logger.info("Background replacement processing completed successfully")

        # Return simple response
        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Background replacement request accepted and processed",
                    "status": "completed",
                }
            ),
        }

    except ImageError as e:
        logger.error(f"Background replacement error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": str(e), "message": "Background replacement failed"}
            ),
        }
    except Exception as e:
        logger.error(f"Unexpected error in background replacement: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": str(e), "message": "Background replacement failed"}
            ),
        }

"""General image generation utility functions"""

import os
import json
from typing import Dict, Any
from datetime import datetime
from aws_lambda_powertools import Logger
from .core import (
    BEDROCK_CLIENT,
    ImageError,
    save_image_to_s3,
    VTO_BUCKET,
    DEFAULT_GEN_IMG,
)
from .translate import translate_to_english

# Logger setup
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="vto_gen_image", level=LOG_LEVEL)


def generate_image(
    body: Dict[str, Any],
    model_id: str = DEFAULT_GEN_IMG,
) -> Dict[str, Any]:
    """
    Generate an image using Amazon Titan Image Generator V2 model on demand.
    Args:
        model_id (str): The model ID to use.
        body (str) : The request body to use.
    Returns:
        response_body (dict): The response body containing the generated image.
    """

    logger.info(
        "Generating image with Amazon Titan Image Generator V2 model %s", model_id
    )

    accept = "application/json"
    content_type = "application/json"

    response = BEDROCK_CLIENT.invoke_model(
        body=body, modelId=model_id, accept=accept, contentType=content_type
    )
    response_body = json.loads(response.get("body").read())

    finish_reason = response_body.get("error")

    if finish_reason is not None:
        raise ImageError(f"Image generation error. Error is {finish_reason}")

    logger.info(
        "Successfully generated image with Amazon Bedrock Image model %s", model_id
    )

    return response_body


def generate_text_to_image(
    text_to_image_params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Generate images from text prompt using Amazon Bedrock

    Args:
        text_to_image_params: Dictionary containing generation parameters

    Returns:
        Dict containing Lambda response with status code and body
    """
    logger.info("Processing text-to-image generation request")

    try:
        # Extract parameters
        prompt = text_to_image_params.get("prompt", "")
        model_id = text_to_image_params.get(
            "model_id", "amazon.titan-image-generator-v2:0"
        )
        cfgScale = text_to_image_params.get("cfg_scale", 8.0)
        height = text_to_image_params.get("height", 1024)
        width = text_to_image_params.get("width", 1024)
        number_of_images = text_to_image_params.get("number_of_images", 1)
        quality = text_to_image_params.get("quality", "premium")

        if not prompt:
            return {
                "statusCode": 400,
                "body": json.dumps(
                    {"error": "Prompt is required for text-to-image generation"}
                ),
            }

        # Process prompt with language detection and translation
        logger.info("Process prompt with language detection and translation")
        processed_prompt = translate_to_english(prompt)
        logger.info(f"Original text-to-image prompt: {prompt}")
        logger.info(f"Processed text-to-image prompt: {processed_prompt}")

        # Prepare request body
        body = json.dumps(
            {
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {
                    "text": processed_prompt,
                },
                "imageGenerationConfig": {
                    "numberOfImages": number_of_images,
                    "quality": quality,
                    "height": height,
                    "width": width,
                    "cfgScale": cfgScale,
                },
            }
        )

        # Generate image
        response_body = generate_image(model_id=model_id, body=body)

        # Save images to S3 if object_names are provided
        object_names = text_to_image_params.get("object_names")
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

        logger.info("Text-to-image generation completed successfully")

        # Return simple response
        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Text-to-image generation request accepted and processed",
                    "status": "completed",
                }
            ),
        }

    except ImageError as e:
        logger.error(f"Image generation error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": str(e), "message": "Text-to-image generation failed"}
            ),
        }
    except Exception as e:
        logger.error(f"Unexpected error in text-to-image generation: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": str(e), "message": "Text-to-image generation failed"}
            ),
        }

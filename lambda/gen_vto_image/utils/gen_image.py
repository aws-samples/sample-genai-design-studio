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
    get_bedrock_model_id,
    is_nova2_model,
    NOVA2_DEFAULT_INFERENCE_CONFIG,
)
from .translate import translate_to_english
import base64
from botocore.exceptions import ClientError
from typing import Optional

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
        # Extract model_id to determine which API to use
        model_id = text_to_image_params.get(
            "model_id", "amazon.titan-image-generator-v2:0"
        )
        
        # Route to Nova 2 if model_id is "nova2"
        if is_nova2_model(model_id):
            logger.info("Routing to Nova 2 Omni generation")
            return generate_with_nova2(text_to_image_params)
        
        # Otherwise, use existing Invoke Model API (Nova Canvas, Titan)
        logger.info(f"Using Invoke Model API with model: {model_id}")
        
        # Extract parameters
        prompt = text_to_image_params.get("prompt", "")
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


# Nova 2 Omni specific functions

def build_nova2_system_prompt(height: int, width: int) -> str:
    """
    Build system prompt for Nova 2 Omni with image size specification
    
    Args:
        height: Image height in pixels
        width: Image width in pixels
        
    Returns:
        System prompt string
    """
    return f"Generate an image with dimensions {width}x{height} pixels based on the user's request."


def build_converse_request(
    prompt: str,
    height: int,
    width: int,
    bedrock_model_id: str = "us.amazon.nova-2-omni-v1:0"
) -> Dict[str, Any]:
    """
    Build Converse API request for Nova 2 Omni
    
    Args:
        prompt: Text prompt for image generation (should be in English)
        height: Image height
        width: Image width
        bedrock_model_id: Bedrock model ID
        
    Returns:
        Converse API request dictionary
    """
    system_prompt = build_nova2_system_prompt(height, width)
    
    request = {
        "modelId": bedrock_model_id,
        "system": [
            {"text": system_prompt}
        ],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"text": prompt}
                ]
            }
        ],
        "inferenceConfig": NOVA2_DEFAULT_INFERENCE_CONFIG
    }
    
    logger.debug(f"Built Converse API request: {json.dumps(request, indent=2)}")
    logger.info(f"Using Nova 2 default inference config: {NOVA2_DEFAULT_INFERENCE_CONFIG}")
    
    return request


def extract_image_from_converse_response(response: Dict[str, Any]) -> Optional[bytes]:
    """
    Extract image binary from Converse API response
    
    Args:
        response: Converse API response
        
    Returns:
        Image binary bytes, or None if no image found
    """
    try:
        content_list = response.get("output", {}).get("message", {}).get("content", [])
        
        for item in content_list:
            if "image" in item:
                image_bytes = item["image"]["source"]["bytes"]
                logger.info(f"Extracted image: {len(image_bytes)} bytes")
                return image_bytes
        
        logger.warning("No image found in Converse API response")
        return None
        
    except Exception as e:
        logger.error(f"Error extracting image from Converse response: {str(e)}")
        return None


def generate_with_nova2(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate image using Nova 2 Omni with Converse API
    
    Args:
        params: Image generation parameters
        
    Returns:
        Lambda response dictionary
        
    Note:
        - This function is called from API Lambda parallel invocation
        - number_of_images should always be 1
        - cfg_scale and quality parameters are ignored (Nova 2 doesn't support them)
    """
    logger.info("Generating single image with Nova 2 Omni")
    
    try:
        # Verify number_of_images is 1 (for parallel execution mode)
        number_of_images = params.get("number_of_images", 1)
        if number_of_images != 1:
            logger.warning(
                f"Nova 2 parallel mode: number_of_images should be 1, got {number_of_images}. Using 1."
            )
            number_of_images = 1
        
        image_index = params.get("image_index", 0)
        logger.info(f"Processing image index: {image_index}")
        
        # Get Bedrock model ID
        bedrock_model_id = get_bedrock_model_id("nova2")
        
        # Translate prompt
        original_prompt = params.get("prompt", "")
        if not original_prompt:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "error": "Prompt is required",
                    "message": "Nova 2 image generation failed"
                })
            }
        
        translated_prompt = translate_to_english(original_prompt)
        logger.info(f"Original prompt: {original_prompt}")
        logger.info(f"Translated prompt: {translated_prompt}")
        
        # Get image dimensions
        height = params.get("height", 1024)
        width = params.get("width", 1024)
        
        # Log ignored parameters
        if "cfg_scale" in params:
            logger.info(f"Ignoring cfg_scale parameter: {params['cfg_scale']} (not supported by Nova 2)")
        if "quality" in params:
            logger.info(f"Ignoring quality parameter: {params['quality']} (not supported by Nova 2)")
        
        # Build Converse API request
        request = build_converse_request(
            prompt=translated_prompt,
            height=height,
            width=width,
            bedrock_model_id=bedrock_model_id
        )
        
        # Call Converse API
        start_time = datetime.now()
        response = BEDROCK_CLIENT.converse(**request)
        duration = datetime.now() - start_time
        
        logger.info(f"Image generation took {duration.total_seconds():.2f} seconds")
        logger.info(f"Request ID: {response['ResponseMetadata']['RequestId']}")
        
        # Extract image
        image_bytes = extract_image_from_converse_response(response)
        if not image_bytes:
            logger.error("No image generated by Nova 2")
            return {
                "statusCode": 500,
                "body": json.dumps({
                    "error": "No image generated",
                    "message": "Nova 2 image generation failed"
                })
            }
        
        # Convert to base64
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")
        
        # Save to S3
        object_names = params.get("object_names", [])
        if object_names and VTO_BUCKET:
            s3_key = object_names[0]
            s3_url = save_image_to_s3(image_base64, VTO_BUCKET, s3_key)
            if s3_url:
                logger.info(f"Saved image to S3: {s3_url}")
            else:
                logger.error("Failed to save image to S3")
                return {
                    "statusCode": 500,
                    "body": json.dumps({
                        "error": "Failed to save image to S3",
                        "message": "Nova 2 image generation failed"
                    })
                }
        else:
            logger.warning("No object names provided or VTO_BUCKET not set")
        
        logger.info("Nova 2 image generation completed successfully")
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Nova 2 image generation completed",
                "status": "completed",
                "image_index": image_index
            })
        }
        
    except ClientError as e:
        logger.error(f"Bedrock API error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "message": "Nova 2 image generation failed"
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error in Nova 2 generation: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "message": "Nova 2 image generation failed"
            })
        }

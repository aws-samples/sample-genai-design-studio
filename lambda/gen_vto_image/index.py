"""Lambda handler for VTO image generation and text-to-image generation"""

import os
import json
from aws_lambda_powertools import Logger
from utils.vto import process_vto_request
from utils.replace_background import process_background_replacement
from utils.gen_image import generate_text_to_image
from utils.core import ImageError

# Logger setup
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="vto_handler", level=LOG_LEVEL)
logger.info("Environment variables: " + str(dict(os.environ)))


def handler(event, context):
    """
    Lambda handler for VTO image generation and text-to-image generation

    Args:
        event: Lambda event containing VTO request parameters or text-to-image parameters
        context: Lambda context

    Returns:
        Dict containing processing result
    """
    logger.info("Start processing image generation request")
    logger.info(f"Received event: {json.dumps(event, default=str)[:200]}")

    try:
        # Check if this is a health check request
        if "test" in event and event["test"] == "health_check":
            logger.info("Health check request received")
            return {
                "statusCode": 200,
                "body": json.dumps(
                    {
                        "message": "Health check successful",
                        "status": "healthy",
                        "service": "vto_handler",
                    }
                ),
            }

        # Check if this is a VTO request
        elif "vto_params" in event:
            return process_vto_request(event.get("vto_params", {}))

        # Check if this is a background replacement request
        elif "replace_background_params" in event:
            return process_background_replacement(
                event.get("replace_background_params", {})
            )

        # Check if this is a text-to-image generation request
        elif "text_to_image_params" in event:
            return generate_text_to_image(event.get("text_to_image_params", {}))

        else:
            # If no recognized parameter type is found
            logger.error("No recognized parameter type found in event")
            return {
                "statusCode": 400,
                "body": json.dumps(
                    {
                        "error": "No recognized parameter type (vto_params, replace_background_params, text_to_image_params, or health_check) found in event",
                        "message": "Request processing failed",
                    }
                ),
            }

    except Exception as e:
        logger.error(f"Error in image generation handler: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": str(e), "message": "Request processing failed"}
            ),
        }

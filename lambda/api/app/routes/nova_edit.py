from fastapi import APIRouter, HTTPException
from app.routes.schemas.nova_edit import NovaEditRequest, NovaEditResponse
import os
import json
import boto3
from aws_lambda_powertools import Logger

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="api_proxy", level=LOG_LEVEL)

lambda_client = boto3.client("lambda")
VTO_GEN_FUNCTION_NAME = os.environ.get("VTO_GEN_FUNCTION_NAME")

router = APIRouter()


def invoke_nova2_parallel_edit(request: NovaEditRequest):
    number_of_images = request.number_of_images
    logger.info(
        f"Invoking {number_of_images} Lambda functions in parallel for Nova 2 image edit "
        f"(group: {request.group_id}, user: {request.user_id})"
    )
    
    for i in range(number_of_images):
        payload = {
            "image_edit_params": {
                "prompt": request.prompt,
                "input_image_object_name": request.input_image_object_name,
                "model_id": request.model_id,
                "height": request.height,
                "width": request.width,
                "number_of_images": 1,
                "object_names": [request.object_names[i]],
                "image_index": i
            }
        }
        
        try:
            response = lambda_client.invoke(
                FunctionName=VTO_GEN_FUNCTION_NAME,
                InvocationType="Event",
                Payload=json.dumps(payload)
            )
            logger.info(
                f"Lambda {i+1}/{number_of_images} invoked successfully. "
                f"StatusCode: {response['StatusCode']}"
            )
        except Exception as e:
            logger.error(f"Error invoking Lambda {i+1}/{number_of_images}: {str(e)}")


def invoke_image_edit_lambda(request: NovaEditRequest):
    try:
        if not VTO_GEN_FUNCTION_NAME:
            logger.error("VTO_GEN_FUNCTION_NAME environment variable not set")
            return

        invoke_nova2_parallel_edit(request)

    except Exception as e:
        logger.error(
            f"Error invoking image edit Lambda for group: {request.group_id}, user: {request.user_id}: {str(e)}"
        )


@router.post("/vto/nova/edit", response_model=NovaEditResponse)
async def process_image_edit(request: NovaEditRequest):
    try:
        object_names = request.object_names
        request_id = request.uid
        
        logger.info(f"Received image edit request: {request_id}")
        logger.info(f"Prompt: {request.prompt}")
        logger.info(f"Input image: {request.input_image_object_name}")
        logger.info(f"Generated S3 object names: {object_names}")

        invoke_image_edit_lambda(request)

        return NovaEditResponse(
            request_id=request_id,
            status="accepted",
            object_names=object_names,
            message="Image edit request accepted. Images will be saved to S3.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in image edit process: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

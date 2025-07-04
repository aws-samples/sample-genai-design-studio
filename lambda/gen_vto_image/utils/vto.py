"""Virtual Try-On (VTO) utility functions"""

import os
import json
import sys
from typing import Dict, Any, Optional, List
from datetime import datetime
from PIL import Image
from aws_lambda_powertools import Logger
from .core import (
    BEDROCK_CLIENT,
    VTO_BUCKET,
    ImageError,
    base64_to_pil_image,
    pil_image_to_base64,
    pil_to_binary_mask,
    get_image_from_s3_as_base64,
    save_image_to_s3,
    generate_tags_from_image,
)
from .translate import translate_to_english


# Logger setup
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="vto_processing", level=LOG_LEVEL)

# Default model
DEFAULT_VTO_IMG = "amazon.nova-canvas-v1:0"


def generate_vto_images(
    inference_params: Dict[str, Any],
    model_id: str = DEFAULT_VTO_IMG,
) -> Dict[str, Any]:
    """
    Generate images using AWS Bedrock
    """
    if "imageGenerationConfig" in inference_params:
        if "numberOfImages" in inference_params["imageGenerationConfig"]:
            image_count = inference_params["imageGenerationConfig"]["numberOfImages"]

    # Display the seed value if one is being used
    if "imageGenerationConfig" in inference_params:
        if "seed" in inference_params["imageGenerationConfig"]:
            logger.info(
                f"Using seed: {inference_params['imageGenerationConfig']['seed']}"
            )

    body_json = json.dumps(inference_params, indent=2)

    start_time = datetime.now()

    try:
        response = BEDROCK_CLIENT.invoke_model(
            body=body_json,
            modelId=model_id,
            accept="application/json",
            contentType="application/json",
        )
        duration = datetime.now() - start_time
        logger.info(
            f"Image generation took {round(duration.total_seconds(), 2)} seconds."
        )

        # Log the request ID
        logger.info(
            f"Image generation request ID: {response['ResponseMetadata']['RequestId']}"
        )

        response_body = json.loads(response.get("body").read())
        logger.info(f"Response body keys: {response_body.keys()}")

        return response_body

    except Exception as ex:
        logger.error(f"Error generating images: {str(ex)}")
        raise ex


def process_vto_image(
    source_image_base64: str,
    reference_image_base64: str,
    mask_image_base64: Optional[str] = None,
    mask_type: str = "GARMENT",
    mask_prompt: str = "",
    garment_class: str = "UPPER_BODY",
    long_sleeve_style: Optional[str] = None,
    tucking_style: Optional[str] = None,
    outer_layer_style: Optional[str] = None,
    mask_shape: str = "DEFAULT",
    mask_shape_prompt: str = "DEFAULT",
    preserve_body_pose: str = "DEFAULT",
    preserve_hands: str = "DEFAULT",
    preserve_face: str = "DEFAULT",
    merge_style: Optional[str] = None,
    return_mask: bool = False,
    number_of_images: int = 1,
    quality: str = "standard",
    cfg_scale: float = 3.0,
    seed: int = -1,
    date_folder: Optional[str] = None,
    timestamp_uid: Optional[str] = None,
    object_names: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Process Virtual Try-On image using AWS Bedrock Nova Canvas

    Returns:
        Dict containing:
        - images: List of base64 encoded result images
        - error: Error message if any
    """
    try:
        # No resizing needed - use images as is

        # Determine actual mask type and process mask_prompt
        if mask_prompt and mask_prompt.strip():
            actual_mask_type = "PROMPT"
            logger.info(f"Process mask_prompt with language detection and translation")
            processed_mask_prompt = translate_to_english(mask_prompt)

        else:
            actual_mask_type = mask_type
            processed_mask_prompt = mask_prompt

        logger.debug(f"actual_mask_type: {actual_mask_type}")
        if actual_mask_type == "PROMPT":
            logger.info(f"Original mask_prompt: {mask_prompt}")
            logger.info(f"Processed mask_prompt: {processed_mask_prompt}")

        # Set inference parameters
        inference_params = {
            "taskType": "VIRTUAL_TRY_ON",
            "virtualTryOnParams": {
                "sourceImage": source_image_base64,
                "referenceImage": reference_image_base64,
                "maskType": actual_mask_type,
            },
        }

        # Add returnMask if true
        if return_mask:
            inference_params["virtualTryOnParams"]["returnMask"] = return_mask

        # Settings based on mask type
        if actual_mask_type == "PROMPT":
            prompt_based_mask = {
                "maskPrompt": processed_mask_prompt,
            }
            if mask_shape_prompt and mask_shape_prompt != "DEFAULT":
                prompt_based_mask["maskShape"] = mask_shape_prompt
            inference_params["virtualTryOnParams"][
                "promptBasedMask"
            ] = prompt_based_mask

        elif actual_mask_type == "GARMENT":
            garment_based_mask = {
                "garmentClass": garment_class,
            }

            # Optional garmentStyling settings
            garment_styling = {}
            if long_sleeve_style:
                garment_styling["longSleeveStyle"] = long_sleeve_style
            if tucking_style:
                garment_styling["tuckingStyle"] = tucking_style
            if outer_layer_style:
                garment_styling["outerLayerStyle"] = outer_layer_style

            if garment_styling:
                garment_based_mask["garmentStyling"] = garment_styling

            if mask_shape and mask_shape != "DEFAULT":
                garment_based_mask["maskShape"] = mask_shape

            inference_params["virtualTryOnParams"][
                "garmentBasedMask"
            ] = garment_based_mask

        elif actual_mask_type == "IMAGE":
            # IMAGE type requires maskImage
            if mask_image_base64:
                # Process mask image
                mask_pil = base64_to_pil_image(mask_image_base64)
                mask_binary = pil_to_binary_mask(mask_pil)
                mask_image_base64 = pil_image_to_base64(mask_binary)

                image_based_mask = {
                    "maskImage": mask_image_base64,
                }
                inference_params["virtualTryOnParams"][
                    "imageBasedMask"
                ] = image_based_mask
            else:
                return {"error": "IMAGE mask type selected but no mask image provided"}

        # Optional mask exclusions
        mask_exclusions = {}
        if preserve_body_pose and preserve_body_pose != "DEFAULT":
            mask_exclusions["preserveBodyPose"] = preserve_body_pose
        if preserve_hands and preserve_hands != "DEFAULT":
            mask_exclusions["preserveHands"] = preserve_hands
        if preserve_face and preserve_face != "DEFAULT":
            mask_exclusions["preserveFace"] = preserve_face

        if mask_exclusions:
            inference_params["virtualTryOnParams"]["maskExclusions"] = mask_exclusions

        # Optional merge style
        if merge_style:
            inference_params["virtualTryOnParams"]["mergeStyle"] = merge_style

        # Image generation config
        image_gen_config = {}
        if number_of_images != 1:
            image_gen_config["numberOfImages"] = number_of_images
        if quality != "standard":
            image_gen_config["quality"] = quality
        if cfg_scale != 3.0:
            image_gen_config["cfgScale"] = cfg_scale
        if seed != -1:
            image_gen_config["seed"] = int(seed)

        if image_gen_config:
            inference_params["imageGenerationConfig"] = image_gen_config

        logger.debug(f"inference params: {json.dumps(inference_params, indent=2)}")

        # Generate images using Bedrock
        response_body = generate_vto_images(
            inference_params=inference_params,
            model_id=DEFAULT_VTO_IMG,
        )

        # Save images to S3
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
        logger.error(f"Error in process_vto_image: {str(e)}")
        return {"error": str(e)}


def process_vto_request(vto_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process a VTO request with all validation and S3 operations

    Args:
        vto_params: VTO parameters from the event

    Returns:
        Dict containing the Lambda response
    """
    try:
        logger.info("Processing VTO (Virtual Try-On) request")

        # Check if tag generation is requested
        search_flag = vto_params.get("search_flag", False)
        if search_flag:
            logger.info("VTO result images will be search-able")

        # Basic parameter validation (API側で詳細な検証は完了済み)
        if not vto_params:
            logger.error("No VTO parameters found in event")
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "No VTO parameters found in event"}),
            }

        # Get images from S3 using object names
        source_image_object_name = vto_params.get("source_image_object_name")
        reference_image_object_name = vto_params.get("reference_image_object_name")
        mask_image_object_name = vto_params.get("mask_image_object_name")

        logger.info(f"Loading source image from S3: {source_image_object_name}")
        source_image_base64 = get_image_from_s3_as_base64(source_image_object_name)
        if not source_image_base64:
            return {
                "statusCode": 500,
                "body": json.dumps(
                    {
                        "error": f"Failed to load source image from S3: {source_image_object_name}",
                        "message": "VTO processing failed",
                    }
                ),
            }

        logger.info(f"Loading reference image from S3: {reference_image_object_name}")
        reference_image_base64 = get_image_from_s3_as_base64(
            reference_image_object_name
        )
        if not reference_image_base64:
            return {
                "statusCode": 500,
                "body": json.dumps(
                    {
                        "error": f"Failed to load reference image from S3: {reference_image_object_name}",
                        "message": "VTO processing failed",
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

        # Call process_vto_image with the parameters
        result = process_vto_image(
            source_image_base64=source_image_base64,
            reference_image_base64=reference_image_base64,
            mask_image_base64=mask_image_base64,
            mask_type=vto_params.get("mask_type", "GARMENT"),
            mask_prompt=vto_params.get("mask_prompt", ""),
            garment_class=vto_params.get("garment_class", "UPPER_BODY"),
            long_sleeve_style=vto_params.get("long_sleeve_style"),
            tucking_style=vto_params.get("tucking_style"),
            outer_layer_style=vto_params.get("outer_layer_style"),
            mask_shape=vto_params.get("mask_shape", "DEFAULT"),
            mask_shape_prompt=vto_params.get("mask_shape_prompt", "DEFAULT"),
            preserve_body_pose=vto_params.get("preserve_body_pose", "DEFAULT"),
            preserve_hands=vto_params.get("preserve_hands", "DEFAULT"),
            preserve_face=vto_params.get("preserve_face", "DEFAULT"),
            merge_style=vto_params.get("merge_style"),
            return_mask=vto_params.get("return_mask", False),
            number_of_images=vto_params.get("number_of_images", 1),
            quality=vto_params.get("quality", "standard"),
            cfg_scale=vto_params.get("cfg_scale", 3.0),
            seed=vto_params.get("seed", -1),
            date_folder=vto_params.get("date_folder"),
            timestamp_uid=vto_params.get("timestamp_uid"),
            object_names=vto_params.get("object_names"),
        )

        logger.info("VTO image generation completed successfully")

        # Generate tags if requested
        if search_flag and "images" in result:
            logger.info("Generating tags for VTO result images")
            generated_tags = []

            for idx, image_base64 in enumerate(result["images"]):
                logger.info(f"Generating tags for image {idx + 1}")

                # Generate tags for this image
                tag_response = generate_tags_from_image(
                    process_name="gen_vto", image_base64=image_base64
                )
                logger.info(f"Tag response: {tag_response}")
                generated_tags.append(tag_response)

            # Add generated tags to the result
            result["generated_tags"] = generated_tags
            logger.info(f"Successfully generated tags for {len(generated_tags)} images")
        else:
            logger.warning("generated images can not be search-able")

        # Return simple response regardless of search_flag
        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "VTO processing request accepted and processed",
                    "status": "completed",
                }
            ),
        }

    except Exception as e:
        logger.error(f"Error in process_vto_request: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps(
                {
                    "error": str(e),
                    "message": "VTO processing failed",
                }
            ),
        }

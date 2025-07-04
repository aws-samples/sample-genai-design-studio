#!/usr/bin/env python3
"""
gen_vto_image Lambda function test script
Supports both local (Lambda RIE) and remote (deployed Lambda) testing
"""

import unittest
import requests
import json
import base64
import os
import sys
import time
import logging
import argparse
from typing import Dict, Any
from PIL import Image
import io

try:
    import boto3
    from botocore.config import Config

    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    print("Warning: boto3 not available. Remote Lambda testing will be disabled.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


class GenVTOImageTest(unittest.TestCase):
    """gen_vto_image Lambda function test class"""

    # Class variables for test mode configuration
    test_mode = "local"  # "local" or "remote"
    lambda_function_name = None
    aws_region = "us-east-1"

    @classmethod
    def setUpClass(cls):
        """Initialize test class setup"""
        # Load CDK outputs for Lambda function name
        cls._load_cdk_outputs()

        # Set up based on test mode
        if cls.test_mode == "local":
            cls._setup_local_test()
        elif cls.test_mode == "remote":
            cls._setup_remote_test()
        else:
            raise ValueError(f"Invalid test mode: {cls.test_mode}")

        # Test image paths
        cls.source_image_path = "./test_data/input/model.png"
        cls.reference_image_path = "./test_data/input/garment.png"
        cls.mask_image_path = "./test_data/input/mask.png"

        # S3 bucket for testing (from environment variable)
        cls.vto_bucket = os.environ.get("VTO_BUCKET", "test-vto-bucket")

        # S3 object names for test images
        cls.source_image_object_name = "test/input/model.png"
        cls.reference_image_object_name = "test/input/garment.png"
        cls.mask_image_object_name = "test/input/mask.png"

        # Check if test images exist
        if not os.path.exists(cls.source_image_path):
            logger.warning(f"Source image not found: {cls.source_image_path}")
        if not os.path.exists(cls.reference_image_path):
            logger.warning(f"Reference image not found: {cls.reference_image_path}")

        # Upload test images to S3
        cls._upload_test_images_to_s3()

    @classmethod
    def _load_cdk_outputs(cls):
        """Load CDK outputs to get Lambda function name"""
        cdk_outputs_path = "../cdk/.cdk-outputs.json"
        try:
            with open(cdk_outputs_path, "r") as f:
                cdk_outputs = json.load(f)
                cls.lambda_function_name = cdk_outputs["VtoAppStack"][
                    "GenImageFunctionName"
                ]
                logger.info(f"Loaded Lambda function name: {cls.lambda_function_name}")
        except FileNotFoundError:
            logger.warning(f"CDK outputs file not found: {cdk_outputs_path}")
            cls.lambda_function_name = (
                "VtoAppStack-GenImageFunction12D690F1-AvX6yJvVr1B4"  # fallback
            )
        except KeyError as e:
            logger.error(f"Key not found in CDK outputs: {e}")
            cls.lambda_function_name = (
                "VtoAppStack-GenImageFunction12D690F1-AvX6yJvVr1B4"  # fallback
            )

    @classmethod
    def _setup_local_test(cls):
        """Setup for local Lambda RIE testing"""
        cls.lambda_rie_url = (
            "http://localhost:9000/2015-03-31/functions/function/invocations"
        )
        logger.info(f"Test setup - Local mode - Lambda RIE URL: {cls.lambda_rie_url}")
        cls._check_lambda_rie_health()

    @classmethod
    def _setup_remote_test(cls):
        """Setup for remote Lambda testing"""
        if not BOTO3_AVAILABLE:
            raise unittest.SkipTest("boto3 is required for remote Lambda testing")

        if not cls.lambda_function_name:
            raise unittest.SkipTest("Lambda function name not available")

        cls.lambda_client = boto3.client("lambda", region_name=cls.aws_region)
        logger.info(
            f"Test setup - Remote mode - Lambda function: {cls.lambda_function_name}"
        )
        cls._check_remote_lambda_health()

    @classmethod
    def _check_lambda_rie_health(cls):
        """Check Lambda RIE connection"""
        try:
            # Simple health check event
            health_event = {"test": "health_check"}

            response = requests.post(cls.lambda_rie_url, json=health_event, timeout=10)

            logger.info(f"Lambda RIE health check response: {response.status_code}")

            if response.status_code != 200:
                raise unittest.SkipTest("Lambda RIE is not responding properly")

        except requests.exceptions.ConnectionError:
            logger.error("Cannot connect to Lambda RIE")
            raise unittest.SkipTest("Cannot connect to Lambda RIE")

    @classmethod
    def _check_remote_lambda_health(cls):
        """Check remote Lambda function availability"""
        try:
            # Simple health check event
            health_event = {"test": "health_check"}

            response = cls.lambda_client.invoke(
                FunctionName=cls.lambda_function_name,
                InvocationType="RequestResponse",
                Payload=json.dumps(health_event),
            )

            logger.info(
                f"Remote Lambda health check response: {response['StatusCode']}"
            )

            if response["StatusCode"] != 200:
                raise unittest.SkipTest("Remote Lambda is not responding properly")

        except Exception as e:
            logger.error(f"Cannot connect to remote Lambda: {e}")
            raise unittest.SkipTest(f"Cannot connect to remote Lambda: {e}")

    @classmethod
    def _upload_test_images_to_s3(cls):
        """Upload test images to S3 bucket"""
        if not BOTO3_AVAILABLE:
            logger.warning("boto3 not available, skipping S3 upload")
            return

        try:
            s3_client = boto3.client("s3", region_name=cls.aws_region)

            # Upload source image
            if os.path.exists(cls.source_image_path):
                with open(cls.source_image_path, "rb") as f:
                    s3_client.put_object(
                        Bucket=cls.vto_bucket,
                        Key=cls.source_image_object_name,
                        Body=f.read(),
                        ContentType="image/png",
                    )
                logger.info(
                    f"Uploaded source image to S3: s3://{cls.vto_bucket}/{cls.source_image_object_name}"
                )
            else:
                logger.warning(
                    f"Source image not found for upload: {cls.source_image_path}"
                )

            # Upload reference image
            if os.path.exists(cls.reference_image_path):
                with open(cls.reference_image_path, "rb") as f:
                    s3_client.put_object(
                        Bucket=cls.vto_bucket,
                        Key=cls.reference_image_object_name,
                        Body=f.read(),
                        ContentType="image/png",
                    )
                logger.info(
                    f"Uploaded reference image to S3: s3://{cls.vto_bucket}/{cls.reference_image_object_name}"
                )
            else:
                logger.warning(
                    f"Reference image not found for upload: {cls.reference_image_path}"
                )

            # Upload mask image if exists
            if os.path.exists(cls.mask_image_path):
                with open(cls.mask_image_path, "rb") as f:
                    s3_client.put_object(
                        Bucket=cls.vto_bucket,
                        Key=cls.mask_image_object_name,
                        Body=f.read(),
                        ContentType="image/png",
                    )
                logger.info(
                    f"Uploaded mask image to S3: s3://{cls.vto_bucket}/{cls.mask_image_object_name}"
                )
            else:
                logger.warning(
                    f"Mask image not found for upload: {cls.mask_image_path}"
                )

        except Exception as e:
            logger.error(f"Failed to upload test images to S3: {e}")
            # Don't raise exception, just log warning
            logger.warning(
                "Continuing without S3 upload - tests may fail if images are not already in S3"
            )

    def _image_to_base64(self, image_path: str) -> str:
        """Convert image file to Base64 encoding"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")

    def _base64_to_image(self, base64_str: str, output_path: str):
        """Save Base64 string as image file"""
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]

        image_data = base64.b64decode(base64_str)
        image = Image.open(io.BytesIO(image_data))
        image.save(output_path)

    def _check_async_response(
        self, result: Dict[str, Any], expected_message_part: str = "processed"
    ):
        """Check async processing response format"""
        # Check response structure for async processing
        self.assertIn("statusCode", result)
        self.assertIn("body", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn(expected_message_part, body["message"])

        logger.info(f"Processing accepted: {body['message']}")
        return body

    def _invoke_lambda(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Invoke Lambda function (local RIE or remote)"""
        if self.test_mode == "local":
            return self._invoke_lambda_local(event)
        elif self.test_mode == "remote":
            return self._invoke_lambda_remote(event)
        else:
            raise ValueError(f"Invalid test mode: {self.test_mode}")

    def _invoke_lambda_local(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Invoke Lambda function via local RIE"""
        response = requests.post(
            self.lambda_rie_url,
            json=event,
            timeout=300,  # 5 minutes timeout for image generation
        )

        if response.status_code != 200:
            raise Exception(
                f"Lambda invocation failed: {response.status_code} - {response.text}"
            )

        return response.json()

    def _invoke_lambda_remote(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Invoke remote Lambda function via boto3"""
        try:
            # Create config with extended timeout
            config = Config(
                read_timeout=900,  # 15分のタイムアウト
                connect_timeout=60,  # 接続タイムアウトは60秒のまま
                retries={"max_attempts": 0},  # 再試行を無効化
            )

            # Use the config with the client
            lambda_client = boto3.client(
                "lambda", region_name=self.aws_region, config=config
            )

            response = lambda_client.invoke(
                FunctionName=self.lambda_function_name,
                InvocationType="RequestResponse",
                Payload=json.dumps(event),
            )

            # Read the response payload
            payload = response["Payload"].read()
            result = json.loads(payload.decode("utf-8"))

            # Check for Lambda execution errors
            if "errorMessage" in result:
                raise Exception(f"Lambda execution error: {result['errorMessage']}")

            return result

        except Exception as e:
            logger.error(f"Remote Lambda invocation failed: {e}")
            raise Exception(f"Remote Lambda invocation failed: {e}")

    def test_basic_vto_processing(self):
        """Test basic VTO image processing"""
        logger.info("Testing basic VTO image processing")

        # Check if test images exist
        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.reference_image_path
        ):
            self.skipTest("Test images not found")

        # Create Lambda event using S3 object names
        event = {
            "vto_params": {
                "source_image_object_name": self.source_image_object_name,
                "reference_image_object_name": self.reference_image_object_name,
                "mask_type": "GARMENT",
                "garment_class": "UPPER_BODY",
                "number_of_images": 1,
                "quality": "standard",
                "cfg_scale": 3.0,
                "seed": -1,
                "size": [1024, 1024],
                "object_names": ["test/output/gen_vto_result_0.png"],
                "search_flag": False,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for VTO processing...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure for async processing
        self.assertIn("statusCode", result)
        self.assertIn("body", result)

        # Check status code
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"VTO processing accepted: {body['message']}")

        logger.info("Basic VTO processing test passed")

    def test_basic_vto_processing_with_search_flag(self):
        """Test basic VTO image processing"""
        logger.info("Testing basic VTO image processing with_search_flag")

        # Check if test images exist
        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.reference_image_path
        ):
            self.skipTest("Test images not found")

        # Create Lambda event using S3 object names
        event = {
            "vto_params": {
                "source_image_object_name": self.source_image_object_name,
                "reference_image_object_name": self.reference_image_object_name,
                "mask_type": "GARMENT",
                "garment_class": "UPPER_BODY",
                "number_of_images": 1,
                "quality": "standard",
                "cfg_scale": 3.0,
                "seed": -1,
                "size": [1024, 1024],
                "object_names": ["test/output/gen_vto_result_0.png"],
                "search_flag": True,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for VTO processing...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"VTO processing accepted: {body['message']}")
        logger.info("Basic VTO processing test passed")

    def test_vto_with_prompt_mask(self):
        """Test VTO with prompt-based mask"""
        logger.info("Testing VTO with prompt-based mask")

        # Check if test images exist
        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.reference_image_path
        ):
            self.skipTest("Test images not found")

        # Create Lambda event with prompt mask using S3 object names
        event = {
            "vto_params": {
                "source_image_object_name": self.source_image_object_name,
                "reference_image_object_name": self.reference_image_object_name,
                "mask_type": "PROMPT",
                "mask_prompt": "upper body clothing",
                "number_of_images": 1,
                "quality": "standard",
                "cfg_scale": 3.0,
                "seed": 42,
                "size": [1024, 1024],
                "search_flag": False,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for VTO processing with prompt mask...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"VTO processing accepted: {body['message']}")
        logger.info("VTO with prompt mask test passed")

    def test_vto_with_return_mask(self):
        """Test VTO with return mask option"""
        logger.info("Testing VTO with return mask option")

        # Check if test images exist
        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.reference_image_path
        ):
            self.skipTest("Test images not found")

        # Create Lambda event with return mask using S3 object names
        event = {
            "vto_params": {
                "source_image_object_name": self.source_image_object_name,
                "reference_image_object_name": self.reference_image_object_name,
                "mask_type": "GARMENT",
                "garment_class": "UPPER_BODY",
                "return_mask": True,
                "number_of_images": 1,
                "quality": "standard",
                "cfg_scale": 3.0,
                "seed": -1,
                "size": [1024, 1024],
                "search_flag": False,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for VTO processing with return mask...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"VTO processing accepted: {body['message']}")
        logger.info("VTO with return mask test passed")

    def test_vto_with_image_mask(self):
        """Test VTO with image-based mask"""
        logger.info("Testing VTO with image-based mask")

        # Check if test images exist
        if (
            not os.path.exists(self.source_image_path)
            or not os.path.exists(self.reference_image_path)
            or not os.path.exists(self.mask_image_path)
        ):
            self.skipTest("Test images not found")

        # Create Lambda event with image mask using S3 object names
        event = {
            "vto_params": {
                "source_image_object_name": self.source_image_object_name,
                "reference_image_object_name": self.reference_image_object_name,
                "mask_image_object_name": self.mask_image_object_name,
                "mask_type": "IMAGE",  # Use IMAGE mask type
                "garment_class": "UPPER_BODY",
                "number_of_images": 1,
                "quality": "standard",
                "cfg_scale": 3.0,
                "seed": 42,
                "size": [1024, 1024],
                "search_flag": False,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for VTO processing with image mask...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"VTO processing accepted: {body['message']}")
        logger.info("VTO with image mask test passed")

    def test_invalid_event_structure(self):
        """Test with invalid event structure"""
        logger.info("Testing invalid event structure")

        # Create invalid event (missing vto_params)
        event = {"invalid_key": "invalid_value"}

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        # Check error response
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 400)

        body = json.loads(result["body"])
        self.assertIn("error", body)

        logger.info("Invalid event structure test passed")

    def test_missing_required_images(self):
        """Test with missing required images"""
        logger.info("Testing missing required images")

        # Create event with missing images
        event = {
            "vto_params": {
                "mask_type": "GARMENT",
                "garment_class": "UPPER_BODY",
                "number_of_images": 1,
                # source_image and reference_image are missing
            }
        }

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        # Check error response
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 500)

        body = json.loads(result["body"])
        self.assertIn("error", body)

        logger.info("Missing required images test passed")

    def test_vto_with_five_images(self):
        """Test VTO with generating 5 images (maximum limit)"""
        logger.info("Testing VTO with 5 images generation")

        # Check if test images exist
        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.reference_image_path
        ):
            self.skipTest("Test images not found")

        # Create Lambda event with 5 images using S3 object names and search_flag=True to get result
        event = {
            "vto_params": {
                "source_image_object_name": self.source_image_object_name,
                "reference_image_object_name": self.reference_image_object_name,
                "mask_type": "GARMENT",
                "garment_class": "UPPER_BODY",
                "number_of_images": 5,  # Request 5 images (maximum limit)
                "quality": "standard",
                "cfg_scale": 3.0,
                "seed": 42,
                "size": [1024, 1024],
                "search_flag": True,  # Enable search_flag to get result with images
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for VTO processing with 5 images...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"VTO processing accepted: {body['message']}")
        logger.info("VTO with 5 images test passed")

    # def test_vto_with_five_images_error(self):
    #     """Test VTO with generating 5 images (should fail)"""
    #     logger.info("Testing VTO with 5 images generation (expecting error)")

    #     # Check if test images exist
    #     if not os.path.exists(self.source_image_path) or not os.path.exists(
    #         self.reference_image_path
    #     ):
    #         self.skipTest("Test images not found")

    #     # Create Lambda event with 5 images (exceeding limit) using S3 object names
    #     event = {
    #         "vto_params": {
    #             "source_image_object_name": self.source_image_object_name,
    #             "reference_image_object_name": self.reference_image_object_name,
    #             "mask_type": "GARMENT",
    #             "garment_class": "UPPER_BODY",
    #             "number_of_images": 5,  # Request 5 images (should fail)
    #             "quality": "standard",
    #             "cfg_scale": 3.0,
    #             "seed": 42,
    #             "size": [1024, 1024],
    #         }
    #     }

    #     # For debugging
    #     logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

    #     logger.info("Invoking Lambda function for VTO processing with 5 images...")

    #     # Invoke Lambda function
    #     result = self._invoke_lambda(event)

    #     logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

    #     # Check error response
    #     self.assertIn("statusCode", result)
    #     self.assertNotEqual(result["statusCode"], 200)  # Should not be 200 OK

    #     # Parse body and check for error
    #     body = json.loads(result["body"])
    #     self.assertIn("error", body)

    #     logger.info("VTO with 5 images error test passed")

    def test_text_to_image_generation(self):
        """Test text-to-image generation using generate_image function"""
        logger.info("Testing text-to-image generation")

        # Create Lambda event for text-to-image generation
        event = {
            "text_to_image_params": {
                "prompt": "A beautiful landscape with mountains and a lake",
                "model_id": "amazon.titan-image-generator-v2:0",
                "cfg_scale": 8.0,
                "height": 1024,
                "width": 1024,
                "number_of_images": 1,
                "object_names": ["test/output/text_to_image_result_0.png"],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for text-to-image generation...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Text-to-image processing accepted: {body['message']}")
        logger.info("Text-to-image generation test passed")

    def test_text_to_image_generation_japanese(self):
        """Test text-to-image generation with Japanese prompt"""
        logger.info("Testing text-to-image generation with Japanese prompt")

        # Japanese prompt
        japanese_prompt = "美しい女性のモデルが撮影スタジオでポージングしている。白背景にモデルの全身が映っていて、正面を向いて立っている。モデルは美しい赤いワンピースをきている"

        # Create Lambda event for text-to-image generation with Japanese prompt
        event = {
            "text_to_image_params": {
                "prompt": japanese_prompt,
                "model_id": "amazon.titan-image-generator-v2:0",
                "cfg_scale": 8.0,
                "height": 1024,
                "width": 1024,
                "number_of_images": 1,
                "object_names": ["test/output/text_to_image_japanese_result_0.png"],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")
        logger.info(f"Japanese prompt: {japanese_prompt}")

        logger.info(
            "Invoking Lambda function for text-to-image generation with Japanese prompt..."
        )

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Text-to-image processing accepted: {body['message']}")
        logger.info("Text-to-image generation with Japanese prompt test passed")

    def test_text_to_image_generation_english(self):
        """Test text-to-image generation with English prompt (equivalent to Japanese)"""
        logger.info("Testing text-to-image generation with English prompt")

        # English prompt (equivalent to the Japanese prompt)
        english_prompt = "A beautiful female model is posing in a photography studio. Her whole body is visible against a white background, standing and facing forward. The model is wearing a beautiful red dress."

        # Create Lambda event for text-to-image generation with English prompt
        event = {
            "text_to_image_params": {
                "prompt": english_prompt,
                "model_id": "amazon.titan-image-generator-v2:0",
                "cfg_scale": 8.0,
                "height": 1024,
                "width": 1024,
                "number_of_images": 1,
                "object_names": ["test/output/text_to_image_english_result_0.png"],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")
        logger.info(f"English prompt: {english_prompt}")

        logger.info(
            "Invoking Lambda function for text-to-image generation with English prompt..."
        )

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Text-to-image processing accepted: {body['message']}")
        logger.info("Text-to-image generation with English prompt test passed")

    def test_text_to_image_with_custom_params(self):
        """Test text-to-image generation with custom parameters"""
        logger.info("Testing text-to-image generation with custom parameters")
        number_of_images = 3
        logger.info(f"Generating {number_of_images} images")

        # Create Lambda event with custom parameters
        event = {
            "text_to_image_params": {
                "prompt": "A futuristic city with flying cars and neon lights",
                "model_id": "amazon.titan-image-generator-v2:0",
                "cfg_scale": 10.0,  # Higher CFG scale
                "height": 512,  # Different size
                "width": 512,
                "number_of_images": number_of_images,  # Multiple images
                "object_names": [
                    "test/output/text_to_image_custom_0.png",
                    "test/output/text_to_image_custom_1.png",
                ],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for text-to-image with custom params...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Text-to-image processing accepted: {body['message']}")
        logger.info("Text-to-image with custom parameters test passed")

    def test_text_to_image_missing_prompt(self):
        """Test text-to-image generation with missing prompt (should fail)"""
        logger.info("Testing text-to-image generation with missing prompt")

        # Create Lambda event without prompt
        event = {
            "text_to_image_params": {
                # "prompt": "",  # Missing prompt
                "model_id": "amazon.titan-image-generator-v2:0",
                "cfg_scale": 8.0,
                "height": 1024,
                "width": 1024,
                "number_of_images": 1,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for text-to-image without prompt...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check error response
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 400)

        # Parse body and check for error
        body = json.loads(result["body"])
        self.assertIn("error", body)
        self.assertIn("Prompt is required", body["error"])

        logger.info("Text-to-image missing prompt test passed")

    def test_text_to_image_with_s3_save(self):
        """Test text-to-image generation with S3 save functionality"""
        logger.info("Testing text-to-image generation with S3 save")

        # Create Lambda event with S3 object names
        event = {
            "text_to_image_params": {
                "prompt": "A serene Japanese garden with cherry blossoms",
                "model_id": "amazon.titan-image-generator-v2:0",
                "cfg_scale": 8.0,
                "height": 1024,
                "width": 1024,
                "number_of_images": 1,
                "object_names": ["test/output/text_to_image_s3_save.png"],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for text-to-image with S3 save...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Text-to-image processing accepted: {body['message']}")
        logger.info("Text-to-image with S3 save test passed")

    # def test_text_to_image_four_images(self):
    #     """Test text-to-image generation with 4 images"""
    #     logger.info("Testing text-to-image generation with 4 images")

    #     # Create Lambda event for 4 images
    #     event = {
    #         "text_to_image_params": {
    #             "prompt": "Abstract art with vibrant colors and geometric shapes",
    #             "model_id": "amazon.titan-image-generator-v2:0",
    #             "cfg_scale": 8.0,
    #             "height": 1024,
    #             "width": 1024,
    #             "number_of_images": 4,  # Request 4 images
    #             "object_names": [
    #                 "test/output/text_to_image_four_0.png",
    #                 "test/output/text_to_image_four_1.png",
    #                 "test/output/text_to_image_four_2.png",
    #                 "test/output/text_to_image_four_3.png",
    #             ],
    #         }
    #     }

    #     # For debugging
    #     logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

    #     logger.info("Invoking Lambda function for text-to-image with 4 images...")

    #     # Invoke Lambda function
    #     result = self._invoke_lambda(event)

    #     logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

    #     # Check response structure
    #     self.assertIn("statusCode", result)
    #     self.assertEqual(result["statusCode"], 200)

    #     # Parse body
    #     body = json.loads(result["body"])
    #     text_to_image_result = body["result"]

    #     # Check exactly 4 images were generated
    #     self.assertIn("images", text_to_image_result)
    #     self.assertEqual(len(text_to_image_result["images"]), 4)

    #     # Save generated images
    #     mode = self.test_mode  # "local" or "remote"
    #     output_dir = f"./test_data/output/{mode}/text_to_image_test"
    #     os.makedirs(output_dir, exist_ok=True)

    #     for i, image_base64 in enumerate(text_to_image_result["images"]):
    #         output_path = os.path.join(output_dir, f"text_to_image_four_{i}.png")
    #         self._base64_to_image(image_base64, output_path)
    #         logger.info(f"Saved text-to-image {i+1} of 4: {output_path}")

    #     logger.info("Text-to-image with 4 images test passed")

    def test_background_replacement_basic(self):
        """Test basic background replacement with mask prompt"""
        logger.info("Testing basic background replacement")

        # Check if test images exist
        if not os.path.exists(self.source_image_path):
            self.skipTest("Test images not found")

        # Create Lambda event for background replacement
        event = {
            "replace_background_params": {
                "prompt": "A beautiful beach with palm trees and sunset",
                "input_image_object_name": self.source_image_object_name,
                "mask_prompt": "people",  # Default mask prompt
                "model_id": "amazon.nova-canvas-v1:0",
                "outPaintingMode": "DEFAULT",
                "cfg_scale": 5.0,
                "number_of_images": 1,
                "height": 512,
                "width": 512,
                "object_names": ["test/output/background_replacement_result_0.png"],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for background replacement...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Background replacement processing accepted: {body['message']}")
        logger.info("Basic background replacement test passed")

    def test_background_replacement_with_mask_image(self):
        """Test background replacement with mask image"""
        logger.info("Testing background replacement with mask image")

        # Check if test images exist
        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.mask_image_path
        ):
            self.skipTest("Test images not found")

        # Create Lambda event with mask image
        event = {
            "replace_background_params": {
                "prompt": "A modern office with large windows and city view",
                "input_image_object_name": self.source_image_object_name,
                "mask_image_object_name": self.mask_image_object_name,
                "model_id": "amazon.nova-canvas-v1:0",
                "outPaintingMode": "DEFAULT",
                "cfg_scale": 5.0,
                "number_of_images": 1,
                "height": 512,
                "width": 512,
                "object_names": [
                    "test/output/background_replacement_mask_result_0.png"
                ],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info("Invoking Lambda function for background replacement with mask...")

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Background replacement processing accepted: {body['message']}")
        logger.info("Background replacement with mask test passed")

    def test_background_replacement_japanese_prompt(self):
        """Test background replacement with Japanese prompt"""
        logger.info("Testing background replacement with Japanese prompt")

        # Check if test images exist
        if not os.path.exists(self.source_image_path):
            self.skipTest("Test images not found")

        # Japanese prompt
        japanese_prompt = "美しい日本庭園、桜の木と池がある風景"

        # Create Lambda event with Japanese prompt
        event = {
            "replace_background_params": {
                "prompt": japanese_prompt,
                "input_image_object_name": self.source_image_object_name,
                "mask_prompt": "people",  # Default mask prompt
                "model_id": "amazon.nova-canvas-v1:0",
                "outPaintingMode": "DEFAULT",
                "cfg_scale": 5.0,
                "number_of_images": 1,
                "height": 512,
                "width": 512,
                "object_names": ["test/output/background_replacement_japanese_0.png"],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")
        logger.info(f"Japanese prompt: {japanese_prompt}")

        logger.info(
            "Invoking Lambda function for background replacement with Japanese prompt..."
        )

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Background replacement processing accepted: {body['message']}")
        logger.info("Background replacement with Japanese prompt test passed")

    def test_background_replacement_custom_params(self):
        """Test background replacement with custom parameters"""
        logger.info("Testing background replacement with custom parameters")

        # Check if test images exist
        if not os.path.exists(self.source_image_path):
            self.skipTest("Test images not found")

        # Create Lambda event with custom parameters
        event = {
            "replace_background_params": {
                "prompt": "A futuristic space station interior",
                "input_image_object_name": self.source_image_object_name,
                "mask_prompt": "person",  # Custom mask prompt
                "model_id": "amazon.nova-canvas-v1:0",
                "outPaintingMode": "PRECISE",  # Different mode
                "cfg_scale": 7.0,  # Higher CFG scale
                "number_of_images": 2,  # Multiple images
                "height": 1024,  # Larger size
                "width": 1024,
                "object_names": [
                    "test/output/background_replacement_custom_0.png",
                    "test/output/background_replacement_custom_1.png",
                ],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info(
            "Invoking Lambda function for background replacement with custom params..."
        )

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Background replacement processing accepted: {body['message']}")
        logger.info("Background replacement with custom parameters test passed")

    def test_background_replacement_missing_prompt(self):
        """Test background replacement with missing prompt (should fail)"""
        logger.info("Testing background replacement with missing prompt")

        # Create Lambda event without prompt
        event = {
            "replace_background_params": {
                # "prompt": "",  # Missing prompt
                "input_image_object_name": self.source_image_object_name,
                "model_id": "amazon.nova-canvas-v1:0",
                "outPaintingMode": "DEFAULT",
                "cfg_scale": 5.0,
                "number_of_images": 1,
                "height": 512,
                "width": 512,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info(
            "Invoking Lambda function for background replacement without prompt..."
        )

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check error response
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 400)

        # Parse body and check for error
        body = json.loads(result["body"])
        self.assertIn("error", body)
        self.assertIn("Prompt is required", body["error"])

        logger.info("Background replacement missing prompt test passed")

    def test_background_replacement_missing_input_image(self):
        """Test background replacement with missing input image (should fail)"""
        logger.info("Testing background replacement with missing input image")

        # Create Lambda event without input image
        event = {
            "replace_background_params": {
                "prompt": "A beautiful landscape",
                # "input_image_object_name": "",  # Missing input image
                "model_id": "amazon.nova-canvas-v1:0",
                "outPaintingMode": "DEFAULT",
                "cfg_scale": 5.0,
                "number_of_images": 1,
                "height": 512,
                "width": 512,
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info(
            "Invoking Lambda function for background replacement without input image..."
        )

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check error response
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 400)

        # Parse body and check for error
        body = json.loads(result["body"])
        self.assertIn("error", body)
        self.assertIn("input_image_object_name is required", body["error"])

        logger.info("Background replacement missing input image test passed")

    def test_background_replacement_with_s3_save(self):
        """Test background replacement with S3 save functionality"""
        logger.info("Testing background replacement with S3 save")

        # Check if test images exist
        if not os.path.exists(self.source_image_path):
            self.skipTest("Test images not found")

        # Create Lambda event with S3 object names
        event = {
            "replace_background_params": {
                "prompt": "A cozy coffee shop interior with warm lighting",
                "input_image_object_name": self.source_image_object_name,
                "mask_prompt": "people",  # Default mask prompt
                "model_id": "amazon.nova-canvas-v1:0",
                "outPaintingMode": "DEFAULT",
                "cfg_scale": 5.0,
                "number_of_images": 1,
                "height": 512,
                "width": 512,
                "object_names": ["test/output/background_replacement_s3_save.png"],
            }
        }

        # For debugging
        logger.info(f"Event structure: {json.dumps(event, default=str)[:200]}...")

        logger.info(
            "Invoking Lambda function for background replacement with S3 save..."
        )

        # Invoke Lambda function
        result = self._invoke_lambda(event)

        logger.info(f"Lambda response: {json.dumps(result, default=str)[:200]}")

        # Check response structure
        self.assertIn("statusCode", result)
        self.assertEqual(result["statusCode"], 200)

        # Parse body
        body = json.loads(result["body"])
        self.assertIn("message", body)
        self.assertIn("status", body)

        # Check response structure for async processing
        self.assertEqual(body["status"], "completed")
        self.assertIn("processed", body["message"])

        logger.info(f"Background replacement processing accepted: {body['message']}")
        logger.info("Background replacement with S3 save test passed")


def main():
    """Main function - Execute unittest"""
    parser = argparse.ArgumentParser(description="gen_vto_image Lambda function test")
    parser.add_argument(
        "--mode",
        choices=["local", "remote"],
        default="local",
        help="Test mode: local (Lambda RIE) or remote (deployed Lambda)",
    )
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region for remote Lambda testing (default: us-east-1)",
    )

    # Parse known args to allow unittest args to pass through
    args, unknown = parser.parse_known_args()

    # Set test mode in the test class
    GenVTOImageTest.test_mode = args.mode
    GenVTOImageTest.aws_region = args.region

    print(f"Starting gen_vto_image Lambda function test in {args.mode} mode...")

    if args.mode == "local":
        print("Make sure Lambda RIE container is running on port 9000")
    elif args.mode == "remote":
        print(f"Testing deployed Lambda function in region: {args.region}")
        if not BOTO3_AVAILABLE:
            print("Error: boto3 is required for remote Lambda testing")
            print("Install with: pip install boto3")
            sys.exit(1)

    # Execute tests with remaining args
    if unknown:
        # If specific test is provided, run it directly
        test_suite = unittest.TestSuite()
        for test_name in unknown:
            # Handle both "test_method" and "Class.test_method" formats
            if "." in test_name:
                class_name, method_name = test_name.split(".", 1)
                if class_name == "GenVTOImageTest":
                    test_suite.addTest(GenVTOImageTest(method_name))
                else:
                    print(f"Warning: Unknown test class {class_name}")
            else:
                # Assume it's a method name for GenVTOImageTest
                test_suite.addTest(GenVTOImageTest(test_name))

        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(test_suite)
        sys.exit(0 if result.wasSuccessful() else 1)
    else:
        # Run all tests
        unittest.main(verbosity=2, argv=[sys.argv[0]])


if __name__ == "__main__":
    main()

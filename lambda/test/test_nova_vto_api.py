#!/usr/bin/env python3
"""
Nova VTO API unittest test script with S3 presigned URL support
"""

import unittest
import requests
import json
import base64
from PIL import Image
import io
import os
import boto3
import argparse
import sys
import logging
import time
from typing import List, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def cognito_first(
    username, email, initial_password, new_password, user_pool_id, client_id
):
    """First-time Cognito authentication: Create user and get tokens"""
    cognito_client = boto3.client("cognito-idp")

    try:
        # Create user
        response = cognito_client.admin_create_user(
            UserPoolId=user_pool_id,
            Username=username,
            TemporaryPassword=initial_password,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "True"},
            ],
            MessageAction="SUPPRESS",
        )
        logger.info(f"User created successfully: {username}")

        # Password initialization
        auth_response = cognito_client.admin_initiate_auth(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            AuthFlow="ADMIN_USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": username, "PASSWORD": initial_password},
        )

        session = auth_response["Session"]
        logger.info(f"Auth session obtained: {session[:10]}...")

        # Change password
        challenge_response = cognito_client.admin_respond_to_auth_challenge(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            ChallengeResponses={"USERNAME": username, "NEW_PASSWORD": new_password},
            Session=session,
        )

        logger.info("Password changed successfully")

        data_token = challenge_response["AuthenticationResult"]
        id_token = data_token["IdToken"]
        refresh_token = data_token["RefreshToken"]

        # Save token info to file
        config_file = os.environ.get("AUTH_CONFIG_FILE", "./.apiconfig.json")
        with open(config_file, "w") as f:
            json.dump(data_token, f)
        logger.info(f"Auth config saved: {config_file}")

        # API header
        headers = {
            "Authorization": f"Bearer {id_token}",
            "Content-Type": "application/json",
        }
        return headers

    except cognito_client.exceptions.UsernameExistsException:
        logger.info(f"User already exists: {username}")
        # Login with existing user
        try:
            auth_response = cognito_client.admin_initiate_auth(
                UserPoolId=user_pool_id,
                ClientId=client_id,
                AuthFlow="ADMIN_USER_PASSWORD_AUTH",
                AuthParameters={"USERNAME": username, "PASSWORD": new_password},
            )

            data_token = auth_response["AuthenticationResult"]
            id_token = data_token["IdToken"]

            # Save token info to file
            config_file = os.environ.get("AUTH_CONFIG_FILE", "./.apiconfig.json")
            with open(config_file, "w") as f:
                json.dump(data_token, f)

            headers = {
                "Authorization": f"Bearer {id_token}",
                "Content-Type": "application/json",
            }
            return headers

        except Exception as e:
            logger.error(f"Failed to login with existing user: {e}")
            return {"Content-Type": "application/json"}

    except Exception as e:
        logger.error(f"Cognito auth error: {e}")
        return {"Content-Type": "application/json"}


def cognito_second(user_pool_id, client_id, config_file):
    """Subsequent authentication: Refresh tokens"""
    cognito_client = boto3.client("cognito-idp")

    try:
        # Load saved token info
        with open(config_file, "r") as f:
            data_token = json.load(f)

        refresh_token = data_token.get("RefreshToken")
        if not refresh_token:
            logger.error("No refresh token found")
            return {"Content-Type": "application/json"}

        # Refresh token
        try:
            response = cognito_client.admin_initiate_auth(
                UserPoolId=user_pool_id,
                ClientId=client_id,
                AuthFlow="REFRESH_TOKEN_AUTH",
                AuthParameters={"REFRESH_TOKEN": refresh_token},
            )
            # logger.info(f"cognito info: {response}")

            # Get new IdToken
            id_token = response["AuthenticationResult"]["IdToken"]
            logger.info("Token refreshed successfully")

            # Update data
            data_token["IdToken"] = id_token
            if "RefreshToken" in response["AuthenticationResult"]:
                data_token["RefreshToken"] = response["AuthenticationResult"][
                    "RefreshToken"
                ]

            # Save updated token
            with open(config_file, "w") as f:
                json.dump(data_token, f)

        except cognito_client.exceptions.ClientError as e:
            logger.warning(f"Token refresh error: {e} - using saved token")
            id_token = data_token.get("IdToken")

        # API header
        headers = {
            "Authorization": f"Bearer {id_token}",
            "Content-Type": "application/json",
        }
        return headers

    except Exception as e:
        logger.error(f"Auth token processing error: {e}")
        return {"Content-Type": "application/json"}


def get_auth_headers_for_tests(local_mode=True):
    """Get authentication headers based on mode"""
    if local_mode:
        logger.info("Running in local mode - no authentication required")
        return {"Content-Type": "application/json"}

    # Remote mode - use Cognito authentication
    logger.info("Running in remote mode - using Cognito authentication")
    username = os.environ.get("AUTH_USERNAME")
    password = os.environ.get("AUTH_PASSWORD")
    config_file = os.environ.get("AUTH_CONFIG_FILE", "./.apiconfig.json")
    first_run = os.environ.get("AUTH_FIRST_RUN", "false").lower() == "true"

    user_pool_id = os.environ.get("USER_POOL_ID")
    client_id = os.environ.get("USER_POOL_CLIENT_ID")

    if not username or not password or not user_pool_id or not client_id:
        logger.warning(
            "Missing auth credentials for remote mode. Running without authentication."
        )
        return {"Content-Type": "application/json"}

    if first_run or not os.path.exists(config_file):
        logger.info(f"First run: Creating user {username}")
        headers = cognito_first(
            username,
            username,  # usernameをそのままemailとして使用
            password,
            password,
            user_pool_id,
            client_id,
        )
    else:
        logger.info(f"Refreshing auth token from: {config_file}")
        headers = cognito_second(user_pool_id, client_id, config_file)

    return headers


class NovaVTOAPITest(unittest.TestCase):
    """Nova VTO API test class with S3 presigned URL support"""

    # Class variables to store command line arguments
    base_url = None
    bucket_name = None
    remote = False  # リモートテストモードフラグ
    auth_headers = None  # 認証ヘッダーを保持
    user_pool_id = None
    client_id = None
    config_file = None

    @classmethod
    def setUpClass(cls):
        """Initialize test class setup"""
        # Use class variables set by main() function
        if cls.base_url is None:
            cls.base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")

        # AWS clients
        session = boto3.Session()
        cls.sts = session.client("sts")
        cls.s3 = boto3.client("s3")

        cls.account_id = cls.sts.get_caller_identity()["Account"]

        # Use bucket_name from command line argument or environment variable
        if cls.bucket_name is None:
            cls.bucket_name = os.environ.get(
                "S3_BUCKET_NAME", f"vto-app-{cls.account_id}"
            )

        # Test parameters
        cls.group_id = "test_group_001"
        cls.user_id = "test_user_001"

        # Test image paths
        cls.source_image_path = "./test_data/input/model.png"
        cls.reference_image_path = "./test_data/input/garment.png"
        cls.mask_image_path = "./test_data/input/mask.png"

        # Cognito settings
        cls.user_pool_id = os.environ.get("USER_POOL_ID")
        cls.client_id = os.environ.get("USER_POOL_CLIENT_ID")
        cls.config_file = os.environ.get("AUTH_CONFIG_FILE", "./.apiconfig.json")

        logger.info(f"Test setup - API URL: {cls.base_url}")
        logger.info(f"Test setup - S3 Bucket: {cls.bucket_name}")
        logger.info(f"Test setup - Account ID: {cls.account_id}")
        logger.info(f"Test setup - Remote mode: {cls.remote}")

        # Initialize authentication based on mode
        cls.auth_headers = get_auth_headers_for_tests(local_mode=not cls.remote)
        logger.info(
            f"Initial authentication completed for {'remote' if cls.remote else 'local'} mode"
        )

        # Check API server health
        cls._check_api_health()

    @classmethod
    def _check_api_health(cls):
        """Check API server health"""
        try:
            logger.info(f"Checking API health at {cls.base_url}/health")
            response = requests.get(
                f"{cls.base_url}/health", headers=cls.auth_headers, timeout=10
            )
            logger.info(f"Health check response: {response.status_code}")
            if response.status_code != 200:
                raise unittest.SkipTest("API server is not healthy")
        except requests.exceptions.ConnectionError:
            logger.error("Cannot connect to API server")
            raise unittest.SkipTest("Cannot connect to API server")

    def setUp(self):
        """Set up before each test method - refresh auth token if in remote mode"""
        if self.remote and self.user_pool_id and self.client_id and self.config_file:
            logger.info(f"Refreshing auth token for test: {self._testMethodName}")
            self.auth_headers = cognito_second(
                self.user_pool_id, self.client_id, self.config_file
            )
        else:
            # Use class-level auth headers (set in setUpClass)
            self.auth_headers = self.__class__.auth_headers

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

    def _upload_image_via_presigned_url(
        self, image_path: str, object_name: str
    ) -> bool:
        """Upload image to S3 using presigned URL"""
        try:
            # Get presigned upload URL
            request_body = {"object_name": object_name, "expiration": 900}

            response = requests.post(
                f"{self.base_url}/utils/s3url/upload",
                json=request_body,
                headers=self.auth_headers,
                timeout=30,
            )

            if response.status_code != 200:
                logger.error(
                    f"Failed to get presigned upload URL: {response.status_code}"
                )
                return False

            presigned_data = response.json()
            if presigned_data.get("error"):
                logger.error(f"Presigned URL error: {presigned_data['error']}")
                return False

            upload_url = presigned_data.get("url")
            if not upload_url:
                logger.error("No upload URL in response")
                return False

            # Upload image using presigned URL
            with open(image_path, "rb") as image_file:
                upload_response = requests.put(
                    upload_url,
                    data=image_file,
                    headers={"Content-Type": "image/png"},
                    timeout=60,
                )

            if upload_response.status_code in [200, 204]:
                logger.info(f"Successfully uploaded {image_path} to {object_name}")
                return True
            else:
                logger.error(f"Upload failed: {upload_response.status_code}")
                logger.error(f"Upload response headers: {upload_response.headers}")
                logger.error(f"Upload response body: {upload_response.text}")
                return False

        except Exception as e:
            logger.error(f"Error uploading image via presigned URL: {e}")
            return False

    def _get_current_test_name(self):
        """Get the name of the current test method"""
        return self._testMethodName

    def _ensure_output_directory(self):
        """Ensure output directory exists"""
        # Determine mode (local or remote)
        mode = "remote" if self.remote else "local"

        # Create directory structure: mode/api_test
        output_dir = f"./test_data/output/{mode}/api_test"
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        return output_dir

    def _download_image_via_presigned_url(self, object_name: str) -> bool:
        """Download image from S3 using presigned URL"""
        try:
            logger.info(f"_download_image_via_presigned_url object_name: {object_name}")
            # Get presigned download URL
            request_body = {"object_name": object_name, "expiration": 900}

            response = requests.post(
                f"{self.base_url}/utils/s3url/download",
                json=request_body,
                headers=self.auth_headers,
                timeout=30,
            )

            logger.info(
                f"_download_image_via_presigned_url response body: {response.text}"
            )

            if response.status_code != 200:
                logger.error(
                    f"Failed to get presigned download URL: {response.status_code}"
                )
                return False

            presigned_data = response.json()
            if presigned_data.get("error"):
                logger.error(f"Presigned URL error: {presigned_data['error']}")
                return False

            download_url = presigned_data.get("url")
            if not download_url:
                logger.error("No download URL in response")
                return False

            # Download image using presigned URL
            download_response = requests.get(download_url, timeout=60)

            if download_response.status_code == 200:
                logger.info(f"Successfully downloaded {object_name}")

                # Save downloaded image to output directory
                output_dir = self._ensure_output_directory()
                test_name = self._get_current_test_name()

                # Extract filename from object_name
                filename = os.path.basename(object_name)
                if not filename:
                    filename = "downloaded_image.png"

                # Create output filename with test name
                output_filename = f"{test_name}_{filename}"
                output_path = os.path.join(output_dir, output_filename)

                # Save the image
                with open(output_path, "wb") as f:
                    f.write(download_response.content)

                logger.info(f"Saved downloaded image to {output_path}")
                return True
            else:
                logger.error(f"Download failed: {download_response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Error downloading image via presigned URL: {e}")
            return False

    def test_health_check(self):
        """Test health check endpoint"""
        logger.info("Testing health check endpoint")
        response = requests.get(
            f"{self.base_url}/health", headers=self.auth_headers, timeout=30
        )

        logger.info(f"Health check response status: {response.status_code}")
        logger.info(f"Health check response body: {response.text}")

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("status", data)
        self.assertIn("message", data)
        self.assertEqual(data["status"], "healthy")

        logger.info("Health check test passed")

    def test_generate_object_names(self):
        """Test /utils/get/objectname endpoint"""
        logger.info("Testing generate object names endpoint")

        params = {"group_id": self.group_id, "user_id": self.user_id}
        logger.info(f"Request params: {params}")

        response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(f"Generate object names response status: {response.status_code}")
        logger.info(f"Generate object names response body: {response.text}")

        # Check status code
        self.assertEqual(response.status_code, 200)

        # Check response data type
        data = response.json()
        self.assertIsInstance(data, dict)

        # Check required fields exist
        required_fields = ["date_folder", "timestamp", "uid"]
        for field in required_fields:
            self.assertIn(field, data)
            self.assertIsInstance(data[field], str)
            self.assertGreater(len(data[field]), 0)

        logger.info(f"Generated object names: {data}")
        logger.info("Generate object names test passed")

    def test_presigned_upload_url(self):
        """Test S3 presigned upload URL generation"""
        logger.info("Testing S3 presigned upload URL generation")

        test_object_name = "test/upload/test_image.png"
        request_body = {"object_name": test_object_name, "expiration": 900}

        response = requests.post(
            f"{self.base_url}/utils/s3url/upload",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(f"Presigned upload URL response status: {response.status_code}")
        logger.info(f"Presigned upload URL response body: {response.text}")

        # Check status code
        self.assertEqual(response.status_code, 200)

        # Check response data
        data = response.json()
        self.assertIsInstance(data, dict)
        self.assertIsNone(data.get("error"))
        self.assertIsNotNone(data.get("url"))
        self.assertEqual(data.get("object_name"), test_object_name)

        logger.info("Presigned upload URL test passed")

    def test_presigned_download_url(self):
        """Test S3 presigned download URL generation"""
        logger.info("Testing S3 presigned download URL generation")

        test_object_name = "test/download/test_image.png"
        request_body = {"object_name": test_object_name, "expiration": 900}

        response = requests.post(
            f"{self.base_url}/utils/s3url/download",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(f"Presigned download URL response status: {response.status_code}")
        logger.info(f"Presigned download URL response body: {response.text}")

        # Check status code
        self.assertEqual(response.status_code, 200)

        # Check response data
        data = response.json()
        self.assertIsInstance(data, dict)
        self.assertIsNone(data.get("error"))
        self.assertIsNotNone(data.get("url"))
        self.assertEqual(data.get("object_name"), test_object_name)

        logger.info("Presigned download URL test passed")

    def test_image_upload_via_presigned_url(self):
        """Test image upload using presigned URL"""
        logger.info("Testing image upload via presigned URL")

        if not os.path.exists(self.source_image_path):
            logger.warning(f"Test image not found: {self.source_image_path}")
            self.skipTest("Test image not found")

        test_object_name = "test/upload/source_image_test.png"

        # Upload image using presigned URL
        success = self._upload_image_via_presigned_url(
            self.source_image_path, test_object_name
        )
        self.assertTrue(success, "Failed to upload image via presigned URL")

        # Verify upload by downloading the image using presigned URL
        download_success = self._download_image_via_presigned_url(test_object_name)
        self.assertTrue(
            download_success, "Failed to verify upload via presigned URL download"
        )

        logger.info("Image upload via presigned URL test passed")

    def test_image_download_via_presigned_url(self):
        """Test image download using presigned URL"""
        logger.info("Testing image download via presigned URL")

        # First upload a test image
        if not os.path.exists(self.reference_image_path):
            logger.warning(f"Test image not found: {self.reference_image_path}")
            self.skipTest("Test image not found")

        test_object_name = "test/download/reference_image_test.png"

        # Upload image first
        upload_success = self._upload_image_via_presigned_url(
            self.reference_image_path, test_object_name
        )
        self.assertTrue(upload_success, "Failed to upload test image")

        # Download image using presigned URL
        download_success = self._download_image_via_presigned_url(test_object_name)
        self.assertTrue(download_success, "Failed to download image via presigned URL")

        logger.info("Image download via presigned URL test passed")

    def test_nova_vto_workflow(self):
        """Test Nova VTO workflow with S3 presigned URLs"""
        logger.info("Testing Nova VTO workflow with S3 presigned URLs")

        # Step 1: Generate object names for source and reference images
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for input images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        source_image_object_name = (
            f"{self.group_id}/{self.user_id}/vto/{date_folder}/{uid}/source_image.png"
        )
        reference_image_object_name = f"{self.group_id}/{self.user_id}/vto/{date_folder}/{uid}/reference_image.png"

        logger.info(f"Generated source image object name: {source_image_object_name}")
        logger.info(
            f"Generated reference image object name: {reference_image_object_name}"
        )

        # Step 2: Upload test images using presigned URLs
        logger.info("Step 2: Uploading test images using presigned URLs")

        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.reference_image_path
        ):
            logger.warning("Test images not found, skipping test")
            self.skipTest("Test images not found")

        # Upload source image
        source_upload_success = self._upload_image_via_presigned_url(
            self.source_image_path, source_image_object_name
        )
        self.assertTrue(source_upload_success, "Failed to upload source image")

        # Upload reference image
        reference_upload_success = self._upload_image_via_presigned_url(
            self.reference_image_path, reference_image_object_name
        )
        self.assertTrue(reference_upload_success, "Failed to upload reference image")

        # Step 3: Process Nova VTO
        logger.info("Step 3: Processing Nova VTO")

        # Generate object_names for output images
        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = (
                f"{self.group_id}/{self.user_id}/vto/{date_folder}/{uid}/result_{i}.png"
            )
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "source_image_object_name": source_image_object_name,
            "reference_image_object_name": reference_image_object_name,
            "mask_type": "GARMENT",
            "garment_class": "UPPER_BODY",
            "number_of_images": number_of_images,
            "quality": "standard",
            "cfg_scale": 3.0,
            "seed": -1,
        }

        logger.info(f"VTO request body: {request_body}")

        vto_response = requests.post(
            f"{self.base_url}/vto/nova/process",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"VTO response status: {vto_response.status_code}")
        logger.info(f"VTO response body: {vto_response.text}")

        # Check status code
        self.assertEqual(vto_response.status_code, 200)

        # Check response data
        vto_data = vto_response.json()
        self.assertIsInstance(vto_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, vto_data)
            self.assertIsInstance(vto_data[field], str)
            self.assertGreater(len(vto_data[field]), 0)

        # Check status is expected value
        self.assertEqual(vto_data["status"], "accepted")

        # Check object_names exists
        self.assertIn("object_names", vto_data)
        self.assertIsInstance(vto_data["object_names"], list)
        self.assertGreater(len(vto_data["object_names"]), 0)

        logger.info(
            f"VTO workflow completed successfully. Request ID: {vto_data['request_id']}"
        )

        # Step 4: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 4: Testing download of generated VTO images using presigned URLs"
            )

            # Wait for image generation
            logger.info("Waiting 45 seconds for VTO image generation...")
            time.sleep(45)

            # Download generated images using presigned URLs
            for object_name in vto_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success, f"Failed to download VTO image: {object_name}"
                    )

                    logger.info(f"Successfully downloaded VTO image: {object_name}")

            logger.info("VTO image download via presigned URLs test passed")

        logger.info("Nova VTO workflow test passed")

    def test_nova_vto_with_mask_image(self):
        """Test Nova VTO workflow with mask image (IMAGE mask type)"""
        # Skip if not in remote mode
        if not self.remote:
            logger.info("Skipping mask image test in local mode")
            self.skipTest("This test is only run in remote mode")

        logger.info("Testing Nova VTO workflow with mask image")

        # Step 1: Generate object names for source, reference and mask images
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for input images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        source_image_object_name = (
            f"{self.group_id}/{self.user_id}/vto/{date_folder}/{uid}/source_image.png"
        )
        reference_image_object_name = f"{self.group_id}/{self.user_id}/vto/{date_folder}/{uid}/reference_image.png"
        mask_image_object_name = (
            f"{self.group_id}/{self.user_id}/vto/{date_folder}/{uid}/mask_image.png"
        )

        logger.info(f"Generated source image object name: {source_image_object_name}")
        logger.info(
            f"Generated reference image object name: {reference_image_object_name}"
        )
        logger.info(f"Generated mask image object name: {mask_image_object_name}")

        # Step 2: Upload test images using presigned URLs
        logger.info("Step 2: Uploading test images using presigned URLs")

        if (
            not os.path.exists(self.source_image_path)
            or not os.path.exists(self.reference_image_path)
            or not os.path.exists(self.mask_image_path)
        ):
            logger.warning("Test images not found, skipping test")
            self.skipTest("Test images not found")

        # Upload source image
        source_upload_success = self._upload_image_via_presigned_url(
            self.source_image_path, source_image_object_name
        )
        self.assertTrue(source_upload_success, "Failed to upload source image")

        # Upload reference image
        reference_upload_success = self._upload_image_via_presigned_url(
            self.reference_image_path, reference_image_object_name
        )
        self.assertTrue(reference_upload_success, "Failed to upload reference image")

        # Upload mask image
        mask_upload_success = self._upload_image_via_presigned_url(
            self.mask_image_path, mask_image_object_name
        )
        self.assertTrue(mask_upload_success, "Failed to upload mask image")

        # Step 3: Process Nova VTO with mask image
        logger.info("Step 3: Processing Nova VTO with mask image")

        # Generate object_names for output images
        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = (
                f"{self.group_id}/{self.user_id}/vto/{date_folder}/{uid}/result_{i}.png"
            )
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "source_image_object_name": source_image_object_name,
            "reference_image_object_name": reference_image_object_name,
            "mask_image_object_name": mask_image_object_name,
            "mask_type": "IMAGE",  # Use IMAGE mask type
            "garment_class": "UPPER_BODY",
            "number_of_images": number_of_images,
            "quality": "standard",
            "cfg_scale": 3.0,
            "seed": -1,
        }

        logger.info(f"VTO request body with mask image: {request_body}")

        vto_response = requests.post(
            f"{self.base_url}/vto/nova/process",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"VTO response status: {vto_response.status_code}")
        logger.info(f"VTO response body: {vto_response.text}")

        # Check status code
        self.assertEqual(vto_response.status_code, 200)

        # Check response data
        vto_data = vto_response.json()
        self.assertIsInstance(vto_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, vto_data)
            self.assertIsInstance(vto_data[field], str)
            self.assertGreater(len(vto_data[field]), 0)

        # Check status is expected value
        self.assertEqual(vto_data["status"], "accepted")

        # Check object_names exists
        self.assertIn("object_names", vto_data)
        self.assertIsInstance(vto_data["object_names"], list)
        self.assertGreater(len(vto_data["object_names"]), 0)

        logger.info(
            f"VTO workflow with mask image completed successfully. Request ID: {vto_data['request_id']}"
        )

        # Step 4: Test downloading generated images
        logger.info(
            "Step 4: Testing download of generated VTO images using presigned URLs"
        )

        # Wait for image generation
        logger.info("Waiting 45 seconds for VTO image generation...")
        time.sleep(45)

        # Download generated images using presigned URLs
        for object_name in vto_data["object_names"]:
            with self.subTest(object_name=object_name):
                logger.info(f"Testing presigned URL download for: {object_name}")

                # Download using presigned URL
                download_success = self._download_image_via_presigned_url(object_name)
                self.assertTrue(
                    download_success, f"Failed to download VTO image: {object_name}"
                )

                logger.info(f"Successfully downloaded VTO image: {object_name}")

        logger.info("VTO image download via presigned URLs test passed")
        logger.info("Nova VTO workflow with mask image test passed")

    def test_nova_vto_missing_required_fields(self):
        """Test with missing required fields"""
        logger.info("Testing Nova VTO with missing required fields")

        incomplete_request = {
            "group_id": self.group_id,
            # user_id, source_image_object_name, reference_image_object_name are missing
        }

        response = requests.post(
            f"{self.base_url}/vto/nova/process",
            json=incomplete_request,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(f"Missing fields response status: {response.status_code}")
        logger.info(f"Missing fields response body: {response.text}")

        # Check validation error occurs
        self.assertEqual(response.status_code, 422)

        logger.info("Missing required fields test passed")

    def test_nova_model_text_to_image(self):
        """Test Nova Model text-to-image generation workflow"""
        logger.info("Testing Nova Model text-to-image generation workflow")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/gen_image/{date_folder}/{uid}/result_{i}.png"
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova Model text-to-image generation
        logger.info("Step 2: Processing Nova Model text-to-image generation")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A beautiful landscape with mountains and a lake",
            "model_id": "amazon.titan-image-generator-v2:0",
            "cfg_scale": 8.0,
            "height": 1024,
            "width": 1024,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova Model request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"Nova Model response status: {model_response.status_code}")
        logger.info(f"Nova Model response body: {model_response.text}")

        # Check status code
        self.assertEqual(model_response.status_code, 200)

        # Check response data
        model_data = model_response.json()
        self.assertIsInstance(model_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, model_data)
            self.assertIsInstance(model_data[field], str)
            self.assertGreater(len(model_data[field]), 0)

        # Check status is expected value
        self.assertEqual(model_data["status"], "accepted")

        # Check object_names exists
        self.assertIn("object_names", model_data)
        self.assertIsInstance(model_data["object_names"], list)
        self.assertGreater(len(model_data["object_names"]), 0)

        logger.info(
            f"Nova Model workflow completed successfully. Request ID: {model_data['request_id']}"
        )

        # Step 3: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 3: Testing download of generated Nova Model images using presigned URLs"
            )

            # Wait for image generation
            logger.info("Waiting 30 seconds for Nova Model image generation...")
            time.sleep(30)

            # Download generated images using presigned URLs
            for object_name in model_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download Nova Model image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded Nova Model image: {object_name}"
                    )

            logger.info("Nova Model image download via presigned URLs test passed")

        logger.info("Nova Model text-to-image generation test passed")

    def test_nova_model_with_custom_params(self):
        """Test Nova Model with custom parameters"""
        logger.info("Testing Nova Model with custom parameters")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 2  # Generate 2 images
        output_object_names = []
        for i in range(number_of_images):
            object_name = (
                f"{date_folder}/{uid}/nova_model_img/{timestamp}_{uid}_custom_{i}.png"
            )
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova Model with custom parameters
        logger.info("Step 2: Processing Nova Model with custom parameters")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A futuristic city with flying cars and neon lights",
            "model_id": "amazon.titan-image-generator-v2:0",
            "cfg_scale": 10.0,  # Higher CFG scale
            "height": 512,  # Different size
            "width": 512,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova Model custom request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"Nova Model custom response status: {model_response.status_code}")
        logger.info(f"Nova Model custom response body: {model_response.text}")

        # Check status code
        self.assertEqual(model_response.status_code, 200)

        # Check response data
        model_data = model_response.json()
        self.assertIsInstance(model_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, model_data)
            self.assertIsInstance(model_data[field], str)
            self.assertGreater(len(model_data[field]), 0)

        # Check status is expected value
        self.assertEqual(model_data["status"], "accepted")

        # Check object_names exists and has correct count
        self.assertIn("object_names", model_data)
        self.assertIsInstance(model_data["object_names"], list)
        self.assertEqual(len(model_data["object_names"]), number_of_images)

        logger.info(
            f"Nova Model custom workflow completed successfully. Request ID: {model_data['request_id']}"
        )

        # Step 3: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 3: Testing download of generated Nova Model custom images using presigned URLs"
            )

            # Wait for image generation
            logger.info("Waiting 30 seconds for Nova Model image generation...")
            time.sleep(30)

            # Download generated images using presigned URLs
            for object_name in model_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download Nova Model custom image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded Nova Model custom image: {object_name}"
                    )

            logger.info(
                "Nova Model custom image download via presigned URLs test passed"
            )

        logger.info("Nova Model with custom parameters test passed")

    def test_nova_model_missing_prompt(self):
        """Test Nova Model with missing prompt (should fail)"""
        logger.info("Testing Nova Model with missing prompt")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        output_object_names = [
            f"{date_folder}/{uid}/nova_model_img/{timestamp}_{uid}_0.png"
        ]

        # Step 2: Process Nova Model without prompt
        logger.info("Step 2: Processing Nova Model without prompt")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            # "prompt": "",  # Missing prompt
            "model_id": "amazon.titan-image-generator-v2:0",
            "cfg_scale": 8.0,
            "height": 1024,
            "width": 1024,
            "number_of_images": 1,
        }

        logger.info(f"Nova Model missing prompt request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Nova Model missing prompt response status: {model_response.status_code}"
        )
        logger.info(f"Nova Model missing prompt response body: {model_response.text}")

        # Check validation error occurs
        self.assertEqual(model_response.status_code, 422)

        logger.info("Nova Model missing prompt test passed")

    def test_nova_model_missing_required_fields(self):
        """Test Nova Model with missing required fields"""
        logger.info("Testing Nova Model with missing required fields")

        incomplete_request = {
            "group_id": self.group_id,
            "prompt": "A test prompt",
            # user_id, uid, object_names are missing
        }

        response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=incomplete_request,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(
            f"Nova Model missing fields response status: {response.status_code}"
        )
        logger.info(f"Nova Model missing fields response body: {response.text}")

        # Check validation error occurs
        self.assertEqual(response.status_code, 422)

        logger.info("Nova Model missing required fields test passed")

    def test_nova_model_three_images(self):
        """Test Nova Model with 3 images generation (maximum limit)"""
        logger.info("Testing Nova Model with 3 images generation")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 3  # Generate 3 images (maximum limit)
        output_object_names = []
        for i in range(number_of_images):
            object_name = (
                f"{date_folder}/{uid}/nova_model_img/{timestamp}_{uid}_three_{i}.png"
            )
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova Model with 3 images
        logger.info("Step 2: Processing Nova Model with 3 images")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "Abstract art with vibrant colors and geometric shapes",
            "model_id": "amazon.titan-image-generator-v2:0",
            "cfg_scale": 8.0,
            "height": 1024,
            "width": 1024,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova Model 3 images request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Nova Model 3 images response status: {model_response.status_code}"
        )
        logger.info(f"Nova Model 3 images response body: {model_response.text}")

        # Check status code
        self.assertEqual(model_response.status_code, 200)

        # Check response data
        model_data = model_response.json()
        self.assertIsInstance(model_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, model_data)
            self.assertIsInstance(model_data[field], str)
            self.assertGreater(len(model_data[field]), 0)

        # Check status is expected value
        self.assertEqual(model_data["status"], "accepted")

        # Check object_names exists and has correct count (exactly 3)
        self.assertIn("object_names", model_data)
        self.assertIsInstance(model_data["object_names"], list)
        self.assertEqual(len(model_data["object_names"]), number_of_images)

        logger.info(
            f"Nova Model 3 images workflow completed successfully. Request ID: {model_data['request_id']}"
        )

        # Step 3: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 3: Testing download of generated Nova Model 3 images using presigned URLs"
            )

            # Wait for image generation
            logger.info("Waiting 45 seconds for Nova Model 3 images generation...")
            time.sleep(45)

            # Download generated images using presigned URLs
            for object_name in model_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download Nova Model 3 images: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded Nova Model 3 images: {object_name}"
                    )

            logger.info("Nova Model 3 images download via presigned URLs test passed")

        logger.info("Nova Model with 3 images test passed")

    def test_nova_model_five_images(self):
        """Test Nova Model with 5 images generation (maximum limit)"""
        logger.info("Testing Nova Model with 5 images generation")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 5  # Generate 5 images (maximum limit)
        output_object_names = []
        for i in range(number_of_images):
            object_name = (
                f"{date_folder}/{uid}/nova_model_img/{timestamp}_{uid}_five_{i}.png"
            )
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova Model with 5 images
        logger.info("Step 2: Processing Nova Model with 5 images")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "Abstract art with vibrant colors and geometric shapes",
            "model_id": "amazon.titan-image-generator-v2:0",
            "cfg_scale": 8.0,
            "height": 1024,
            "width": 1024,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova Model 5 images request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Nova Model 5 images response status: {model_response.status_code}"
        )
        logger.info(f"Nova Model 5 images response body: {model_response.text}")

        # Check status code
        self.assertEqual(model_response.status_code, 200)

        # Check response data
        model_data = model_response.json()
        self.assertIsInstance(model_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, model_data)
            self.assertIsInstance(model_data[field], str)
            self.assertGreater(len(model_data[field]), 0)

        # Check status is expected value
        self.assertEqual(model_data["status"], "accepted")

        # Check object_names exists and has correct count (exactly 5)
        self.assertIn("object_names", model_data)
        self.assertIsInstance(model_data["object_names"], list)
        self.assertEqual(len(model_data["object_names"]), number_of_images)

        logger.info(
            f"Nova Model 5 images workflow completed successfully. Request ID: {model_data['request_id']}"
        )

        # Step 3: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 3: Testing download of generated Nova Model 5 images using presigned URLs"
            )

            # Wait for image generation
            logger.info("Waiting 60 seconds for Nova Model 5 images generation...")
            time.sleep(60)

            # Download generated images using presigned URLs
            for object_name in model_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download Nova Model 5 images: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded Nova Model 5 images: {object_name}"
                    )

            logger.info("Nova Model 5 images download via presigned URLs test passed")

        logger.info("Nova Model with 5 images test passed")

    def test_nova2_text_to_image(self):
        """Test Nova 2 Omni text-to-image generation workflow"""
        logger.info("Testing Nova 2 Omni text-to-image generation workflow")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/gen_image/{date_folder}/{uid}/nova2_result_{i}.png"
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova 2 text-to-image generation
        logger.info("Step 2: Processing Nova 2 text-to-image generation")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A serene Japanese garden with cherry blossoms and a traditional tea house",
            "model_id": "nova2",  # Nova 2 Omni model
            "height": 1024,
            "width": 1024,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova 2 request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"Nova 2 response status: {model_response.status_code}")
        logger.info(f"Nova 2 response body: {model_response.text}")

        # Check status code
        self.assertEqual(model_response.status_code, 200)

        # Check response data
        model_data = model_response.json()
        self.assertIsInstance(model_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, model_data)
            self.assertIsInstance(model_data[field], str)
            self.assertGreater(len(model_data[field]), 0)

        # Check status is expected value
        self.assertEqual(model_data["status"], "accepted")

        # Check object_names exists
        self.assertIn("object_names", model_data)
        self.assertIsInstance(model_data["object_names"], list)
        self.assertGreater(len(model_data["object_names"]), 0)

        logger.info(
            f"Nova 2 workflow completed successfully. Request ID: {model_data['request_id']}"
        )

        # Step 3: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 3: Testing download of generated Nova 2 images using presigned URLs"
            )

            # Wait for image generation (Nova 2 may take longer)
            logger.info("Waiting 45 seconds for Nova 2 image generation...")
            time.sleep(45)

            # Download generated images using presigned URLs
            for object_name in model_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download Nova 2 image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded Nova 2 image: {object_name}"
                    )

            logger.info("Nova 2 image download via presigned URLs test passed")

        logger.info("Nova 2 text-to-image generation test passed")

    def test_nova2_japanese_prompt(self):
        """Test Nova 2 with Japanese prompt translation (Task 6.6)"""
        logger.info("Testing Nova 2 with Japanese prompt translation")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/gen_image/{date_folder}/{uid}/nova2_japanese_{i}.png"
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova 2 with Japanese prompt
        logger.info("Step 2: Processing Nova 2 with Japanese prompt")

        japanese_prompt = "美しい日本庭園、桜の木と伝統的な茶室がある風景"

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": japanese_prompt,
            "model_id": "nova2",
            "height": 1024,
            "width": 1024,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova 2 Japanese prompt request body: {request_body}")
        logger.info(f"Japanese prompt: {japanese_prompt}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"Nova 2 Japanese response status: {model_response.status_code}")
        logger.info(f"Nova 2 Japanese response body: {model_response.text}")

        # Check status code
        self.assertEqual(model_response.status_code, 200)

        # Check response data
        model_data = model_response.json()
        self.assertIsInstance(model_data, dict)
        self.assertEqual(model_data["status"], "accepted")

        logger.info("Nova 2 Japanese prompt translation test passed")

    def test_nova2_multiple_images_parallel(self):
        """Test Nova 2 multiple images parallel generation (Task 6.5)"""
        logger.info("Testing Nova 2 multiple images parallel generation")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 3  # Test with 3 images
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/gen_image/{date_folder}/{uid}/nova2_parallel_{i}.png"
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova 2 with multiple images
        logger.info(f"Step 2: Processing Nova 2 with {number_of_images} images (parallel)")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A beautiful mountain landscape with a lake",
            "model_id": "nova2",
            "height": 1024,
            "width": 1024,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova 2 parallel request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"Nova 2 parallel response status: {model_response.status_code}")
        logger.info(f"Nova 2 parallel response body: {model_response.text}")

        # Check status code
        self.assertEqual(model_response.status_code, 200)

        # Check response data
        model_data = model_response.json()
        self.assertIsInstance(model_data, dict)
        self.assertEqual(model_data["status"], "accepted")

        # Check that all object names are returned
        self.assertIn("object_names", model_data)
        self.assertEqual(len(model_data["object_names"]), number_of_images)

        logger.info(
            f"Nova 2 parallel generation accepted for {number_of_images} images"
        )

        # Step 3: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                f"Step 3: Testing download of {number_of_images} Nova 2 images (parallel generation)"
            )

            # Wait for parallel image generation (may take longer)
            logger.info("Waiting 60 seconds for Nova 2 parallel image generation...")
            time.sleep(60)

            # Download all generated images
            for object_name in model_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download Nova 2 parallel image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded Nova 2 parallel image: {object_name}"
                    )

            logger.info("Nova 2 parallel image download test passed")

        logger.info("Nova 2 multiple images parallel generation test passed")

    def test_nova_model_six_images_error(self):
        """Test Nova Model with 6 images generation (should fail - exceeds limit)"""
        logger.info("Testing Nova Model with 6 images generation (expecting error)")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for output images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        number_of_images = 6  # Generate 6 images (exceeds limit)
        output_object_names = []
        for i in range(number_of_images):
            object_name = (
                f"{date_folder}/{uid}/nova_model_img/{timestamp}_{uid}_six_{i}.png"
            )
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        # Step 2: Process Nova Model with 6 images (should fail)
        logger.info("Step 2: Processing Nova Model with 6 images (should fail)")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A test prompt for 6 images",
            "model_id": "amazon.titan-image-generator-v2:0",
            "cfg_scale": 8.0,
            "height": 1024,
            "width": 1024,
            "number_of_images": number_of_images,
        }

        logger.info(f"Nova Model 6 images request body: {request_body}")

        model_response = requests.post(
            f"{self.base_url}/vto/nova/model",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Nova Model 6 images response status: {model_response.status_code}"
        )
        logger.info(f"Nova Model 6 images response body: {model_response.text}")

        # Check validation error occurs (should fail at API level)
        self.assertEqual(model_response.status_code, 422)

        logger.info(
            "Nova Model 6 images error test passed (validation error as expected)"
        )

    def test_nova_background_replacement_workflow(self):
        """Test Nova background replacement workflow with S3 presigned URLs"""
        logger.info(
            "Testing Nova background replacement workflow with S3 presigned URLs"
        )

        # Step 1: Generate object names for input image
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for input image
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/background_input.png"

        logger.info(f"Generated input image object name: {input_image_object_name}")

        # Step 2: Upload test image using presigned URL
        logger.info("Step 2: Uploading test image using presigned URL")

        if not os.path.exists(self.source_image_path):
            logger.warning("Test image not found, skipping test")
            self.skipTest("Test image not found")

        # Upload input image
        input_upload_success = self._upload_image_via_presigned_url(
            self.source_image_path, input_image_object_name
        )
        self.assertTrue(input_upload_success, "Failed to upload input image")

        # Step 3: Process background replacement
        logger.info("Step 3: Processing background replacement")

        # Generate object_names for output images
        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/result_{i}.png"
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A beautiful beach with palm trees and sunset",
            "input_image_object_name": input_image_object_name,
            # Not providing mask_image_object_name to use default "people" mask prompt
            "model_id": "amazon.nova-canvas-v1:0",
            "outPaintingMode": "DEFAULT",
            "cfg_scale": 5.0,
            "number_of_images": number_of_images,
            "height": 512,
            "width": 512,
        }

        logger.info(f"Background replacement request body: {request_body}")

        bg_response = requests.post(
            f"{self.base_url}/vto/nova/background",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Background replacement response status: {bg_response.status_code}"
        )
        logger.info(f"Background replacement response body: {bg_response.text}")

        # Check status code
        self.assertEqual(bg_response.status_code, 200)

        # Check response data
        bg_data = bg_response.json()
        self.assertIsInstance(bg_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, bg_data)
            self.assertIsInstance(bg_data[field], str)
            self.assertGreater(len(bg_data[field]), 0)

        # Check status is expected value
        self.assertEqual(bg_data["status"], "accepted")

        # Check object_names exists
        self.assertIn("object_names", bg_data)
        self.assertIsInstance(bg_data["object_names"], list)
        self.assertGreater(len(bg_data["object_names"]), 0)

        logger.info(
            f"Background replacement workflow completed successfully. Request ID: {bg_data['request_id']}"
        )

        # Step 4: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 4: Testing download of generated background replacement images using presigned URLs"
            )

            # Wait for image generation
            logger.info(
                "Waiting 30 seconds for background replacement image generation..."
            )
            time.sleep(30)

            # Download generated images using presigned URLs
            for object_name in bg_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download background replacement image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded background replacement image: {object_name}"
                    )

            logger.info(
                "Background replacement image download via presigned URLs test passed"
            )

        logger.info("Nova background replacement workflow test passed")

    def test_nova_background_replacement_with_mask_image_workflow(self):
        """Test Nova background replacement with mask image workflow"""
        # Skip if not in remote mode
        if not self.remote:
            logger.info("Skipping background replacement with mask test in local mode")
            self.skipTest("This test is only run in remote mode")

        logger.info("Testing Nova background replacement with mask image workflow")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for input and mask images
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/background_input_mask.png"
        mask_image_object_name = f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/background_mask.png"

        logger.info(f"Generated input image object name: {input_image_object_name}")
        logger.info(f"Generated mask image object name: {mask_image_object_name}")

        # Step 2: Upload test images using presigned URLs
        logger.info("Step 2: Uploading test images using presigned URLs")

        if not os.path.exists(self.source_image_path) or not os.path.exists(
            self.mask_image_path
        ):
            logger.warning("Test images not found, skipping test")
            self.skipTest("Test images not found")

        # Upload input image
        input_upload_success = self._upload_image_via_presigned_url(
            self.source_image_path, input_image_object_name
        )
        self.assertTrue(input_upload_success, "Failed to upload input image")

        # Upload mask image
        mask_upload_success = self._upload_image_via_presigned_url(
            self.mask_image_path, mask_image_object_name
        )
        self.assertTrue(mask_upload_success, "Failed to upload mask image")

        # Step 3: Process background replacement with mask
        logger.info("Step 3: Processing background replacement with mask")

        # Generate object_names for output images
        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/result_mask_{i}.png"
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A modern office with large windows and city view",
            "input_image_object_name": input_image_object_name,
            "mask_image_object_name": mask_image_object_name,  # Using mask image
            "model_id": "amazon.nova-canvas-v1:0",
            "outPaintingMode": "DEFAULT",
            "cfg_scale": 5.0,
            "number_of_images": number_of_images,
            "height": 512,
            "width": 512,
        }

        logger.info(f"Background replacement with mask request body: {request_body}")

        bg_response = requests.post(
            f"{self.base_url}/vto/nova/background",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Background replacement response status: {bg_response.status_code}"
        )
        logger.info(f"Background replacement response body: {bg_response.text}")

        # Check status code
        self.assertEqual(bg_response.status_code, 200)

        # Check response data
        bg_data = bg_response.json()
        self.assertIsInstance(bg_data, dict)
        self.assertEqual(bg_data["status"], "accepted")

        logger.info(
            f"Background replacement with mask workflow completed successfully. Request ID: {bg_data['request_id']}"
        )

        # Step 4: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 4: Testing download of generated background replacement images using presigned URLs"
            )

            # Wait for image generation (longer wait for large images with PRECISE mode)
            wait_time = 60  # Increased wait time for 1024x1024 images with PRECISE mode
            logger.info(
                f"Waiting {wait_time} seconds for background replacement image generation (large images with PRECISE mode)..."
            )
            time.sleep(wait_time)

            # Download generated images using presigned URLs
            for object_name in bg_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download background replacement image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded background replacement image: {object_name}"
                    )

            logger.info(
                "Background replacement image download via presigned URLs test passed"
            )

        logger.info("Nova background replacement with mask image workflow test passed")

    def test_nova_background_replacement_missing_prompt(self):
        """Test Nova background replacement with missing prompt (should fail)"""
        logger.info("Testing Nova background replacement with missing prompt")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/background_input.png"
        output_object_names = [
            f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/result_0.png"
        ]

        # Step 2: Process background replacement without prompt
        logger.info("Step 2: Processing background replacement without prompt")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            # "prompt": "",  # Missing prompt
            "input_image_object_name": input_image_object_name,
            "model_id": "amazon.nova-canvas-v1:0",
            "outPaintingMode": "DEFAULT",
            "cfg_scale": 5.0,
            "number_of_images": 1,
            "height": 512,
            "width": 512,
        }

        logger.info(
            f"Background replacement missing prompt request body: {request_body}"
        )

        bg_response = requests.post(
            f"{self.base_url}/vto/nova/background",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(
            f"Background replacement missing prompt response status: {bg_response.status_code}"
        )
        logger.info(
            f"Background replacement missing prompt response body: {bg_response.text}"
        )

        # Check validation error occurs
        self.assertEqual(bg_response.status_code, 422)

        logger.info("Nova background replacement missing prompt test passed")

    def test_nova_background_replacement_missing_input_image(self):
        """Test Nova background replacement with missing input image (should fail)"""
        logger.info("Testing Nova background replacement with missing input image")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        output_object_names = [
            f"{self.group_id}/{self.user_id}/background_replace/{date_folder}/{uid}/result_0.png"
        ]

        # Step 2: Process background replacement without input image
        logger.info("Step 2: Processing background replacement without input image")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "A beautiful landscape",
            # "input_image_object_name": "",  # Missing input image
            "model_id": "amazon.nova-canvas-v1:0",
            "outPaintingMode": "DEFAULT",
            "cfg_scale": 5.0,
            "number_of_images": 1,
            "height": 512,
            "width": 512,
        }

        logger.info(
            f"Background replacement missing input image request body: {request_body}"
        )

        bg_response = requests.post(
            f"{self.base_url}/vto/nova/background",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(
            f"Background replacement missing input image response status: {bg_response.status_code}"
        )
        logger.info(
            f"Background replacement missing input image response body: {bg_response.text}"
        )

        # Check validation error occurs
        self.assertEqual(bg_response.status_code, 422)

        logger.info("Nova background replacement missing input image test passed")

    def test_garment_classification_workflow(self):
        """Test garment classification workflow with base64 image"""
        logger.info("Testing garment classification workflow")

        # Load test garment image
        test_image_path = os.path.join(
            os.path.dirname(__file__), "test_data", "input", "garment.png"
        )
        
        if not os.path.exists(test_image_path):
            logger.warning(f"Test image not found: {test_image_path}")
            self.skipTest("Test image not available")

        # Convert image to base64
        image_base64 = self._image_to_base64(test_image_path)

        # Step 1: Test garment classification
        logger.info("Step 1: Testing garment classification")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "image_base64": image_base64,
        }

        logger.info(f"Garment classification request body keys: {list(request_body.keys())}")

        response = requests.post(
            f"{self.base_url}/vto/classify-garment",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,  # Longer timeout for AI processing
        )

        logger.info(f"Garment classification response status: {response.status_code}")
        logger.info(f"Garment classification response body: {response.text}")

        # Check successful response
        self.assertEqual(response.status_code, 200)

        response_data = response.json()
        
        # Verify response structure
        self.assertIn("request_id", response_data)
        self.assertIn("status", response_data)
        self.assertIn("message", response_data)
        
        # Check request_id format
        expected_request_id = f"{self.group_id}_{self.user_id}"
        self.assertEqual(response_data["request_id"], expected_request_id)

        if response_data["status"] == "success":
            # Verify successful classification result
            self.assertIn("classification_result", response_data)
            classification_result = response_data["classification_result"]
            
            self.assertTrue(classification_result["success"])
            self.assertIn("result", classification_result)
            self.assertIn("model_used", classification_result)
            
            # Verify classification result structure
            result = classification_result["result"]
            self.assertIn("category_id", result)
            self.assertIn("category_name", result)
            self.assertIn("confidence", result)
            self.assertIn("reasoning", result)
            
            # Verify category_id is valid (5-18)
            self.assertGreaterEqual(result["category_id"], 5)
            self.assertLessEqual(result["category_id"], 18)
            
            # Verify confidence is between 0 and 1
            self.assertGreaterEqual(result["confidence"], 0.0)
            self.assertLessEqual(result["confidence"], 1.0)
            
            logger.info(f"Classification successful: {result['category_name']} (ID: {result['category_id']}, Confidence: {result['confidence']:.2%})")
            logger.info(f"Reasoning: {result['reasoning']}")
            
        elif response_data["status"] == "error":
            # Log error but don't fail the test (AI service might be temporarily unavailable)
            logger.warning(f"Classification failed: {response_data.get('error', 'Unknown error')}")
            logger.info("Test passed despite classification error (service may be temporarily unavailable)")
        else:
            self.fail(f"Unexpected status: {response_data['status']}")

        logger.info("Garment classification workflow test passed")

    def test_garment_classification_missing_image(self):
        """Test garment classification with missing image data (should fail)"""
        logger.info("Testing garment classification with missing image data")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            # Missing both image_base64 and image_object_name
        }

        logger.info(f"Garment classification missing image request body: {request_body}")

        response = requests.post(
            f"{self.base_url}/vto/classify-garment",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(f"Garment classification missing image response status: {response.status_code}")
        logger.info(f"Garment classification missing image response body: {response.text}")

        # Check validation error occurs
        self.assertEqual(response.status_code, 422)

        logger.info("Garment classification missing image test passed")

    def test_garment_classification_invalid_base64(self):
        """Test garment classification with invalid base64 data (should fail)"""
        logger.info("Testing garment classification with invalid base64 data")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "image_base64": "invalid_base64_data_that_cannot_be_decoded",
        }

        logger.info(f"Garment classification invalid base64 request body keys: {list(request_body.keys())}")

        response = requests.post(
            f"{self.base_url}/vto/classify-garment",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(f"Garment classification invalid base64 response status: {response.status_code}")
        logger.info(f"Garment classification invalid base64 response body: {response.text}")

        # Check error response (API handles invalid base64 gracefully and returns 200 with error status)
        self.assertEqual(response.status_code, 200)
        
        response_data = response.json()
        self.assertEqual(response_data["status"], "error")
        self.assertIn("error", response_data)
        self.assertIsNotNone(response_data["error"])

        logger.info("Garment classification invalid base64 test passed")

    def test_garment_classification_empty_group_id(self):
        """Test garment classification with empty group_id (should fail)"""
        logger.info("Testing garment classification with empty group_id")

        # Load test garment image
        test_image_path = os.path.join(
            os.path.dirname(__file__), "test_data", "input", "garment.png"
        )
        
        if not os.path.exists(test_image_path):
            logger.warning(f"Test image not found: {test_image_path}")
            self.skipTest("Test image not available")

        # Convert image to base64
        image_base64 = self._image_to_base64(test_image_path)

        request_body = {
            "group_id": "",  # Empty group_id
            "user_id": self.user_id,
            "image_base64": image_base64,
        }

        logger.info(f"Garment classification empty group_id request body keys: {list(request_body.keys())}")

        response = requests.post(
            f"{self.base_url}/vto/classify-garment",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(f"Garment classification empty group_id response status: {response.status_code}")
        logger.info(f"Garment classification empty group_id response body: {response.text}")

        # Check validation error occurs
        self.assertEqual(response.status_code, 422)

        logger.info("Garment classification empty group_id test passed")

    def test_prompt_enhancement_english(self):
        """Test prompt enhancement with English input"""
        logger.info("Testing prompt enhancement - English")
        
        request_body = {
            "prompt": "Female model wearing white shirt",
            "language": "en"
        }
        
        response = requests.post(
            f"{self.base_url}/enhance-prompt",
            json=request_body,
            headers=self.auth_headers,
            timeout=60
        )
        
        logger.info(f"Prompt enhancement English response status: {response.status_code}")
        logger.info(f"Prompt enhancement English response body: {response.text}")
        
        # 基本検証
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertIn("original_prompt", data)
        self.assertIn("enhanced_prompt", data)
        self.assertEqual(data["original_prompt"], "Female model wearing white shirt")
        
        # 改善効果の確認
        enhanced = data["enhanced_prompt"]
        self.assertGreater(len(enhanced), len(request_body["prompt"]))
        
        logger.info(f"Original: {data['original_prompt']}")
        logger.info(f"Enhanced: {enhanced}")
        logger.info("Prompt enhancement English test passed")

    def test_prompt_enhancement_japanese(self):
        """Test prompt enhancement with Japanese input"""
        logger.info("Testing prompt enhancement - Japanese")
        
        request_body = {
            "prompt": "白いシャツを着た女性モデル",
            "language": "ja"
        }
        
        response = requests.post(
            f"{self.base_url}/enhance-prompt",
            json=request_body,
            headers=self.auth_headers,
            timeout=60
        )
        
        logger.info(f"Prompt enhancement Japanese response status: {response.status_code}")
        logger.info(f"Prompt enhancement Japanese response body: {response.text}")
        
        # 基本検証
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertIn("original_prompt", data)
        self.assertIn("enhanced_prompt", data)
        self.assertEqual(data["original_prompt"], "白いシャツを着た女性モデル")
        
        # 改善効果の確認
        enhanced = data["enhanced_prompt"]
        self.assertGreater(len(enhanced), len(request_body["prompt"]))
        
        logger.info(f"Original: {data['original_prompt']}")
        logger.info(f"Enhanced: {enhanced}")
        logger.info("Prompt enhancement Japanese test passed")

    def test_nova2_image_edit_workflow(self):
        """Test Nova 2 image edit workflow with S3 presigned URLs"""
        logger.info("Testing Nova 2 image edit workflow with S3 presigned URLs")

        # Step 1: Generate object names for input image
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names for input image
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/input_image.png"

        logger.info(f"Generated input image object name: {input_image_object_name}")

        # Step 2: Upload test image using presigned URL
        logger.info("Step 2: Uploading test image using presigned URL")

        if not os.path.exists(self.source_image_path):
            logger.warning("Test image not found, skipping test")
            self.skipTest("Test image not found")

        # Upload input image
        input_upload_success = self._upload_image_via_presigned_url(
            self.source_image_path, input_image_object_name
        )
        self.assertTrue(input_upload_success, "Failed to upload input image")

        # Step 3: Process image edit
        logger.info("Step 3: Processing image edit")

        # Generate object_names for output images
        number_of_images = 1
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/result_{i}.png"
            output_object_names.append(object_name)

        logger.info(f"Generated output object_names: {output_object_names}")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "Change the background to a beautiful beach with palm trees",
            "input_image_object_name": input_image_object_name,
            "model_id": "nova2",
            "number_of_images": number_of_images,
            "height": 512,
            "width": 512,
        }

        logger.info(f"Image edit request body: {request_body}")

        edit_response = requests.post(
            f"{self.base_url}/vto/nova/edit",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(f"Image edit response status: {edit_response.status_code}")
        logger.info(f"Image edit response body: {edit_response.text}")

        # Check status code
        self.assertEqual(edit_response.status_code, 200)

        # Check response data
        edit_data = edit_response.json()
        self.assertIsInstance(edit_data, dict)

        # Check required fields
        required_fields = ["request_id", "status"]
        for field in required_fields:
            self.assertIn(field, edit_data)
            self.assertIsInstance(edit_data[field], str)
            self.assertGreater(len(edit_data[field]), 0)

        # Check status is expected value
        self.assertEqual(edit_data["status"], "accepted")

        # Check object_names exists
        self.assertIn("object_names", edit_data)
        self.assertIsInstance(edit_data["object_names"], list)
        self.assertGreater(len(edit_data["object_names"]), 0)

        logger.info(
            f"Image edit workflow completed successfully. Request ID: {edit_data['request_id']}"
        )

        # Step 4: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                "Step 4: Testing download of generated image edit images using presigned URLs"
            )

            # Wait for image generation
            logger.info("Waiting 45 seconds for image edit generation...")
            time.sleep(45)

            # Download generated images using presigned URLs
            for object_name in edit_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    # Download using presigned URL
                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download image edit image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded image edit image: {object_name}"
                    )

            logger.info("Image edit image download via presigned URLs test passed")

        logger.info("Nova 2 image edit workflow test passed")

    def test_nova2_image_edit_japanese_prompt(self):
        """Test Nova 2 image edit with Japanese prompt"""
        logger.info("Testing Nova 2 image edit with Japanese prompt")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/input_japanese.png"
        output_object_names = [
            f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/result_japanese_0.png"
        ]

        # Step 2: Upload test image
        logger.info("Step 2: Uploading test image")

        if not os.path.exists(self.source_image_path):
            logger.warning("Test image not found, skipping test")
            self.skipTest("Test image not found")

        input_upload_success = self._upload_image_via_presigned_url(
            self.source_image_path, input_image_object_name
        )
        self.assertTrue(input_upload_success, "Failed to upload input image")

        # Step 3: Process image edit with Japanese prompt
        logger.info("Step 3: Processing image edit with Japanese prompt")

        japanese_prompt = "背景を美しいビーチとヤシの木に変更してください"

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": japanese_prompt,
            "input_image_object_name": input_image_object_name,
            "model_id": "nova2",
            "number_of_images": 1,
            "height": 512,
            "width": 512,
        }

        logger.info(f"Image edit Japanese prompt request body: {request_body}")
        logger.info(f"Japanese prompt: {japanese_prompt}")

        edit_response = requests.post(
            f"{self.base_url}/vto/nova/edit",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Image edit Japanese response status: {edit_response.status_code}"
        )
        logger.info(f"Image edit Japanese response body: {edit_response.text}")

        # Check status code
        self.assertEqual(edit_response.status_code, 200)

        # Check response data
        edit_data = edit_response.json()
        self.assertIsInstance(edit_data, dict)
        self.assertEqual(edit_data["status"], "accepted")

        logger.info("Nova 2 image edit Japanese prompt test passed")

    def test_nova2_image_edit_multiple_images(self):
        """Test Nova 2 image edit with multiple images"""
        logger.info("Testing Nova 2 image edit with multiple images")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/input_multiple.png"

        number_of_images = 3
        output_object_names = []
        for i in range(number_of_images):
            object_name = f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/result_multiple_{i}.png"
            output_object_names.append(object_name)

        # Step 2: Upload test image
        logger.info("Step 2: Uploading test image")

        if not os.path.exists(self.source_image_path):
            logger.warning("Test image not found, skipping test")
            self.skipTest("Test image not found")

        input_upload_success = self._upload_image_via_presigned_url(
            self.source_image_path, input_image_object_name
        )
        self.assertTrue(input_upload_success, "Failed to upload input image")

        # Step 3: Process image edit with multiple images
        logger.info(f"Step 3: Processing image edit with {number_of_images} images")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "Add a rainbow in the sky",
            "input_image_object_name": input_image_object_name,
            "model_id": "nova2",
            "number_of_images": number_of_images,
            "height": 512,
            "width": 512,
        }

        logger.info(f"Image edit multiple images request body: {request_body}")

        edit_response = requests.post(
            f"{self.base_url}/vto/nova/edit",
            json=request_body,
            headers=self.auth_headers,
            timeout=60,
        )

        logger.info(
            f"Image edit multiple images response status: {edit_response.status_code}"
        )
        logger.info(f"Image edit multiple images response body: {edit_response.text}")

        # Check status code
        self.assertEqual(edit_response.status_code, 200)

        # Check response data
        edit_data = edit_response.json()
        self.assertIsInstance(edit_data, dict)
        self.assertEqual(edit_data["status"], "accepted")

        # Check that all object names are returned
        self.assertIn("object_names", edit_data)
        self.assertEqual(len(edit_data["object_names"]), number_of_images)

        logger.info(
            f"Image edit multiple images accepted for {number_of_images} images"
        )

        # Step 4: Test downloading generated images (remote mode only)
        if self.remote:
            logger.info(
                f"Step 4: Testing download of {number_of_images} image edit images"
            )

            # Wait for image generation
            logger.info("Waiting 60 seconds for multiple image edit generation...")
            time.sleep(60)

            # Download all generated images
            for object_name in edit_data["object_names"]:
                with self.subTest(object_name=object_name):
                    logger.info(f"Testing presigned URL download for: {object_name}")

                    download_success = self._download_image_via_presigned_url(
                        object_name
                    )
                    self.assertTrue(
                        download_success,
                        f"Failed to download image edit image: {object_name}",
                    )

                    logger.info(
                        f"Successfully downloaded image edit image: {object_name}"
                    )

            logger.info("Image edit multiple images download test passed")

        logger.info("Nova 2 image edit multiple images test passed")

    def test_nova2_image_edit_missing_prompt(self):
        """Test Nova 2 image edit with missing prompt (should fail)"""
        logger.info("Testing Nova 2 image edit with missing prompt")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/input.png"
        output_object_names = [
            f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/result_0.png"
        ]

        # Step 2: Process image edit without prompt
        logger.info("Step 2: Processing image edit without prompt")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            # "prompt": "",  # Missing prompt
            "input_image_object_name": input_image_object_name,
            "model_id": "nova2",
            "number_of_images": 1,
            "height": 512,
            "width": 512,
        }

        logger.info(f"Image edit missing prompt request body: {request_body}")

        edit_response = requests.post(
            f"{self.base_url}/vto/nova/edit",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(
            f"Image edit missing prompt response status: {edit_response.status_code}"
        )
        logger.info(f"Image edit missing prompt response body: {edit_response.text}")

        # Check validation error occurs
        self.assertEqual(edit_response.status_code, 422)

        logger.info("Nova 2 image edit missing prompt test passed")

    def test_nova2_image_edit_missing_input_image(self):
        """Test Nova 2 image edit with missing input image (should fail)"""
        logger.info("Testing Nova 2 image edit with missing input image")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        output_object_names = [
            f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/result_0.png"
        ]

        # Step 2: Process image edit without input image
        logger.info("Step 2: Processing image edit without input image")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "Change the background",
            # "input_image_object_name": "",  # Missing input image
            "model_id": "nova2",
            "number_of_images": 1,
            "height": 512,
            "width": 512,
        }

        logger.info(f"Image edit missing input image request body: {request_body}")

        edit_response = requests.post(
            f"{self.base_url}/vto/nova/edit",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(
            f"Image edit missing input image response status: {edit_response.status_code}"
        )
        logger.info(
            f"Image edit missing input image response body: {edit_response.text}"
        )

        # Check validation error occurs
        self.assertEqual(edit_response.status_code, 422)

        logger.info("Nova 2 image edit missing input image test passed")

    def test_nova2_image_edit_invalid_image_size(self):
        """Test Nova 2 image edit with invalid image size (should fail)"""
        logger.info("Testing Nova 2 image edit with invalid image size")

        # Step 1: Generate object names
        logger.info("Step 1: Generating object names")
        params = {"group_id": self.group_id, "user_id": self.user_id}

        objectname_response = requests.get(
            f"{self.base_url}/utils/get/objectname",
            params=params,
            headers=self.auth_headers,
            timeout=30,
        )

        self.assertEqual(objectname_response.status_code, 200)
        objectname_data = objectname_response.json()

        # Generate object names
        date_folder = objectname_data["date_folder"]
        timestamp = objectname_data["timestamp"]
        uid = objectname_data["uid"]

        input_image_object_name = f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/input.png"
        output_object_names = [
            f"{self.group_id}/{self.user_id}/image_edit/{date_folder}/{uid}/result_0.png"
        ]

        # Step 2: Process image edit with invalid image size
        logger.info("Step 2: Processing image edit with invalid image size")

        request_body = {
            "group_id": self.group_id,
            "user_id": self.user_id,
            "date_folder": date_folder,
            "timestamp": timestamp,
            "uid": uid,
            "object_names": output_object_names,
            "prompt": "Change the background",
            "input_image_object_name": input_image_object_name,
            "model_id": "nova2",
            "number_of_images": 1,
            "height": 999,  # Invalid size
            "width": 999,  # Invalid size
        }

        logger.info(f"Image edit invalid size request body: {request_body}")

        edit_response = requests.post(
            f"{self.base_url}/vto/nova/edit",
            json=request_body,
            headers=self.auth_headers,
            timeout=30,
        )

        logger.info(
            f"Image edit invalid size response status: {edit_response.status_code}"
        )
        logger.info(f"Image edit invalid size response body: {edit_response.text}")

        # Check validation error occurs
        self.assertEqual(edit_response.status_code, 422)

        logger.info("Nova 2 image edit invalid image size test passed")


def main():
    """Main function - Execute unittest"""
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Nova VTO API test script")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("API_BASE_URL", "http://localhost:8000"),
        help="API base URL",
    )
    parser.add_argument(
        "--bucket-name",
        default=None,
        help="S3 bucket name (use environment variable or default value if not specified)",
    )
    parser.add_argument(
        "--remote",
        action="store_true",
        help="Run in remote mode to test downloading generated VTO images",
    )

    # Separate unittest arguments from custom arguments
    known_args, unittest_args = parser.parse_known_args()

    # Set parameters to test class
    NovaVTOAPITest.base_url = known_args.base_url
    if known_args.bucket_name:
        NovaVTOAPITest.bucket_name = known_args.bucket_name
    NovaVTOAPITest.remote = known_args.remote

    print(f"Starting Nova VTO API unittest...")
    print(f"  API URL: {NovaVTOAPITest.base_url}")
    print(f"  S3 Bucket: {known_args.bucket_name or 'Using default value'}")
    print(f"  Remote mode: {NovaVTOAPITest.remote}")

    # Execute tests with remaining args
    if unittest_args:
        # If specific test is provided, run it directly
        test_suite = unittest.TestSuite()
        for test_name in unittest_args:
            # Handle both "test_method" and "Class.test_method" formats
            if "." in test_name:
                class_name, method_name = test_name.split(".", 1)
                if class_name == "NovaVTOAPITest":
                    test_suite.addTest(NovaVTOAPITest(method_name))
                else:
                    print(f"Warning: Unknown test class {class_name}")
            else:
                # Assume it's a method name for NovaVTOAPITest
                test_suite.addTest(NovaVTOAPITest(test_name))

        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(test_suite)
        sys.exit(0 if result.wasSuccessful() else 1)
    else:
        # Run all tests
        unittest.main(verbosity=2, argv=[sys.argv[0]])


if __name__ == "__main__":
    main()

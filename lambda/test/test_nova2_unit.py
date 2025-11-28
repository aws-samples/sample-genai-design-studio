#!/usr/bin/env python3
"""
Unit tests for Nova 2 Omni integration
Tests core utility functions and Converse API implementation
"""

import unittest
import json
import base64
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../gen_vto_image"))

from utils.core import (
    get_bedrock_model_id,
    is_nova2_model,
    NOVA_MODEL_MAPPING,
    NOVA2_DEFAULT_INFERENCE_CONFIG,
)
from utils.gen_image import (
    build_nova2_system_prompt,
    build_converse_request,
    extract_image_from_converse_response,
)


class TestModelIDMapping(unittest.TestCase):
    """Test model ID mapping functions (Task 6.1)"""

    def test_get_bedrock_model_id_nova2(self):
        """Test that 'nova2' maps to correct Bedrock model ID"""
        result = get_bedrock_model_id("nova2")
        self.assertEqual(result, "us.amazon.nova-2-omni-v1:0")

    def test_get_bedrock_model_id_nova_canvas(self):
        """Test that Nova Canvas model ID remains unchanged"""
        result = get_bedrock_model_id("amazon.nova-canvas-v1:0")
        self.assertEqual(result, "amazon.nova-canvas-v1:0")

    def test_get_bedrock_model_id_titan(self):
        """Test that Titan model ID remains unchanged"""
        result = get_bedrock_model_id("amazon.titan-image-generator-v2:0")
        self.assertEqual(result, "amazon.titan-image-generator-v2:0")

    def test_get_bedrock_model_id_unknown(self):
        """Test that unknown model ID is returned as-is"""
        unknown_id = "unknown-model-id"
        result = get_bedrock_model_id(unknown_id)
        self.assertEqual(result, unknown_id)

    def test_is_nova2_model_true(self):
        """Test that is_nova2_model returns True for 'nova2'"""
        self.assertTrue(is_nova2_model("nova2"))

    def test_is_nova2_model_false_canvas(self):
        """Test that is_nova2_model returns False for Nova Canvas"""
        self.assertFalse(is_nova2_model("amazon.nova-canvas-v1:0"))

    def test_is_nova2_model_false_titan(self):
        """Test that is_nova2_model returns False for Titan"""
        self.assertFalse(is_nova2_model("amazon.titan-image-generator-v2:0"))

    def test_is_nova2_model_false_unknown(self):
        """Test that is_nova2_model returns False for unknown model"""
        self.assertFalse(is_nova2_model("unknown-model"))

    def test_nova_model_mapping_contains_nova2(self):
        """Test that NOVA_MODEL_MAPPING contains nova2 entry"""
        self.assertIn("nova2", NOVA_MODEL_MAPPING)
        self.assertEqual(
            NOVA_MODEL_MAPPING["nova2"], "us.amazon.nova-2-omni-v1:0"
        )


class TestConverseAPIRequest(unittest.TestCase):
    """Test Converse API request construction (Task 6.2)"""

    def test_build_nova2_system_prompt(self):
        """Test system prompt generation with image dimensions"""
        prompt = build_nova2_system_prompt(1024, 1024)
        self.assertIn("1024x1024", prompt)
        self.assertIn("pixels", prompt)
        self.assertIn("Generate", prompt)

    def test_build_nova2_system_prompt_different_sizes(self):
        """Test system prompt with different image sizes"""
        prompt = build_nova2_system_prompt(512, 768)
        self.assertIn("768x512", prompt)

    def test_build_converse_request_structure(self):
        """Test that Converse API request has correct structure"""
        request = build_converse_request(
            prompt="A beautiful sunset",
            height=1024,
            width=1024
        )

        # Check required fields
        self.assertIn("modelId", request)
        self.assertIn("system", request)
        self.assertIn("messages", request)
        self.assertIn("inferenceConfig", request)

    def test_build_converse_request_model_id(self):
        """Test that correct model ID is used"""
        request = build_converse_request(
            prompt="Test prompt",
            height=1024,
            width=1024
        )

        self.assertEqual(request["modelId"], "us.amazon.nova-2-omni-v1:0")

    def test_build_converse_request_system_prompt(self):
        """Test that system prompt contains image size"""
        request = build_converse_request(
            prompt="Test prompt",
            height=512,
            width=768
        )

        self.assertEqual(len(request["system"]), 1)
        self.assertIn("text", request["system"][0])
        self.assertIn("768x512", request["system"][0]["text"])

    def test_build_converse_request_messages_structure(self):
        """Test that messages have correct structure"""
        test_prompt = "A cat sitting on a chair"
        request = build_converse_request(
            prompt=test_prompt,
            height=1024,
            width=1024
        )

        # Check messages structure
        self.assertEqual(len(request["messages"]), 1)
        message = request["messages"][0]

        self.assertEqual(message["role"], "user")
        self.assertIn("content", message)
        self.assertEqual(len(message["content"]), 1)
        self.assertIn("text", message["content"][0])
        self.assertEqual(message["content"][0]["text"], test_prompt)

    def test_build_converse_request_default_inference_config(self):
        """Test that default inference parameters are used"""
        request = build_converse_request(
            prompt="Test prompt",
            height=1024,
            width=1024
        )

        inference_config = request["inferenceConfig"]

        # Check default values
        self.assertEqual(inference_config["temperature"], 0)
        self.assertEqual(inference_config["topP"], 1)
        self.assertEqual(inference_config["maxTokens"], 10000)

    def test_build_converse_request_uses_constant(self):
        """Test that request uses NOVA2_DEFAULT_INFERENCE_CONFIG constant"""
        request = build_converse_request(
            prompt="Test prompt",
            height=1024,
            width=1024
        )

        # Should match the constant
        self.assertEqual(
            request["inferenceConfig"],
            NOVA2_DEFAULT_INFERENCE_CONFIG
        )


class TestConverseAPIResponse(unittest.TestCase):
    """Test Converse API response processing (Task 6.3)"""

    def test_extract_image_from_valid_response(self):
        """Test extracting image binary from valid response"""
        # Create mock response with image
        fake_image_bytes = b"fake_image_data_12345"
        response = {
            "output": {
                "message": {
                    "content": [
                        {
                            "image": {
                                "format": "png",
                                "source": {
                                    "bytes": fake_image_bytes
                                }
                            }
                        }
                    ]
                }
            }
        }

        result = extract_image_from_converse_response(response)
        self.assertEqual(result, fake_image_bytes)

    def test_extract_image_from_response_with_text(self):
        """Test extracting image when response contains both text and image"""
        fake_image_bytes = b"fake_image_data"
        response = {
            "output": {
                "message": {
                    "content": [
                        {"text": "Here is your image"},
                        {
                            "image": {
                                "format": "png",
                                "source": {
                                    "bytes": fake_image_bytes
                                }
                            }
                        }
                    ]
                }
            }
        }

        result = extract_image_from_converse_response(response)
        self.assertEqual(result, fake_image_bytes)

    def test_extract_image_no_image_in_response(self):
        """Test that None is returned when no image in response"""
        response = {
            "output": {
                "message": {
                    "content": [
                        {"text": "No image generated"}
                    ]
                }
            }
        }

        result = extract_image_from_converse_response(response)
        self.assertIsNone(result)

    def test_extract_image_empty_content(self):
        """Test that None is returned for empty content"""
        response = {
            "output": {
                "message": {
                    "content": []
                }
            }
        }

        result = extract_image_from_converse_response(response)
        self.assertIsNone(result)

    def test_extract_image_malformed_response(self):
        """Test that None is returned for malformed response"""
        response = {
            "output": {
                "message": {}
            }
        }

        result = extract_image_from_converse_response(response)
        self.assertIsNone(result)

    def test_extract_image_missing_output(self):
        """Test that None is returned when output is missing"""
        response = {}

        result = extract_image_from_converse_response(response)
        self.assertIsNone(result)


def main():
    """Run unit tests"""
    unittest.main(verbosity=2)


if __name__ == "__main__":
    main()

from pydantic import BaseModel, field_validator, Field
from typing import Optional, Dict, Any


class GarmentClassificationRequest(BaseModel):
    group_id: str = Field(
        ..., min_length=1, description="Group ID for S3 object naming"
    )
    user_id: str = Field(..., min_length=1, description="User ID for S3 object naming")
    image_base64: Optional[str] = Field(
        None, description="Base64 encoded image data"
    )
    image_object_name: Optional[str] = Field(
        None, description="S3 object name for the image"
    )

    @field_validator("group_id", "user_id")
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must be non-empty string")
        return v

    @field_validator("image_base64", "image_object_name")
    @classmethod
    def validate_image_source(cls, v, info):
        # At least one image source must be provided
        if info.field_name == "image_object_name":
            # This validation will be called for both fields
            # We need to check if at least one is provided in the model_validator
            pass
        return v

    def model_post_init(self, __context) -> None:
        """Validate that at least one image source is provided"""
        if not self.image_base64 and not self.image_object_name:
            raise ValueError("Either image_base64 or image_object_name must be provided")


class GarmentClassificationResponse(BaseModel):
    request_id: str
    status: str
    classification_result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    message: Optional[str] = None

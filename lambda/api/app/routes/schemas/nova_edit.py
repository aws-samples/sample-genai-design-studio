from pydantic import BaseModel, field_validator, Field
from typing import Optional, List


class NovaEditRequest(BaseModel):
    group_id: str = Field(
        ..., min_length=1, description="Group ID for S3 object naming"
    )
    user_id: str = Field(..., min_length=1, description="User ID for S3 object naming")
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=1024,
        description="Edit prompt for image modification",
    )
    input_image_object_name: str = Field(
        ..., min_length=1, description="S3 object name of input image"
    )
    date_folder: Optional[str] = Field(None, description="Date folder for S3 storage")
    timestamp: Optional[str] = Field(None, description="Timestamp for S3 object naming")
    uid: Optional[str] = Field(None, description="Unique ID for S3 object naming")
    object_names: Optional[List[str]] = Field(
        None, description="Pre-generated S3 object names"
    )
    model_id: str = Field("nova2", description="Model ID")
    number_of_images: int = Field(
        1, ge=1, le=5, description="Number of images to generate"
    )
    height: int = Field(512, gt=0, description="Image height")
    width: int = Field(512, gt=0, description="Image width")

    @field_validator("group_id", "user_id", "prompt", "input_image_object_name")
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must be non-empty string")
        return v


class NovaEditResponse(BaseModel):
    request_id: str
    status: str
    object_names: Optional[List[str]] = None
    error: Optional[str] = None
    message: Optional[str] = None

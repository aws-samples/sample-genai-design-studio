from pydantic import BaseModel, field_validator, Field
from typing import Optional, List, Literal

# Default model for text-to-image generation
DEFAULT_MODEL_ID = "amazon.nova-canvas-v1:0"

# Valid dimensions for Nova models
VALID_DIMENSIONS = [256, 512, 768, 1024, 1280, 1536, 1792, 2048]


class BackgroundReplacementRequest(BaseModel):
    group_id: str = Field(
        ..., min_length=1, description="Group ID for S3 object naming"
    )
    user_id: str = Field(..., min_length=1, description="User ID for S3 object naming")
    date_folder: Optional[str] = Field(None, description="Date folder for S3 storage")
    timestamp: Optional[str] = Field(None, description="Timestamp for S3 object naming")
    uid: Optional[str] = Field(None, description="Unique ID for S3 object naming")
    object_names: Optional[List[str]] = Field(
        None, description="Pre-generated S3 object names"
    )
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=1024,
        description="Text prompt for the new background",
    )
    input_image_object_name: str = Field(
        ..., min_length=1, description="S3 object name for input image"
    )
    mask_prompt: Optional[str] = Field(
        "people", description="Mask prompt for automatic mask generation"
    )
    mask_image_object_name: Optional[str] = Field(
        None, description="S3 object name for mask image"
    )
    model_id: str = Field(DEFAULT_MODEL_ID, description="Model ID")
    outPaintingMode: Literal["DEFAULT", "PRECISE"] = Field(
        "DEFAULT", description="Outpainting mode"
    )
    cfg_scale: float = Field(6.5, ge=1.1, le=10.0, description="CFG scale")
    number_of_images: int = Field(
        1, ge=1, le=5, description="Number of images to generate"
    )
    quality: Literal["standard", "premium"] = Field(
        "premium", description="Image generation quality"
    )
    height: int = Field(512, description="Output image height")
    width: int = Field(512, description="Output image width")

    @field_validator("group_id", "user_id", "prompt", "input_image_object_name")
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must be non-empty string")
        return v

    @field_validator("height", "width")
    @classmethod
    def validate_dimensions(cls, v: int) -> int:
        if v not in VALID_DIMENSIONS:
            raise ValueError(f"must be one of {VALID_DIMENSIONS}")
        return v


class BackgroundReplacementResponse(BaseModel):
    request_id: str
    status: str
    object_names: Optional[List[str]] = None  # S3 object names for saved images
    error: Optional[str] = None
    message: Optional[str] = None

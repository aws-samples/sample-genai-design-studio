from pydantic import BaseModel, field_validator, model_validator, Field
from typing import Optional, List, Literal


class NovaVTORequest(BaseModel):
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
    source_image_object_name: str = Field(
        ..., min_length=1, description="S3 object name for source image"
    )
    reference_image_object_name: str = Field(
        ..., min_length=1, description="S3 object name for reference/garment image"
    )
    mask_image_object_name: Optional[str] = Field(
        None, description="S3 object name for mask image (for IMAGE mask type)"
    )
    mask_type: Literal["GARMENT", "IMAGE", "PROMPT"] = Field(
        "GARMENT", description="Mask type"
    )
    mask_prompt: Optional[str] = Field("", description="Mask prompt")
    garment_class: Literal["UPPER_BODY", "LOWER_BODY", "FULL_BODY", "SHOES"] = Field(
        "UPPER_BODY", description="Garment class"
    )
    long_sleeve_style: Optional[str] = None
    tucking_style: Optional[str] = None
    outer_layer_style: Optional[str] = None
    mask_shape: str = "DEFAULT"
    mask_shape_prompt: str = "DEFAULT"
    preserve_body_pose: str = "DEFAULT"
    preserve_hands: str = "DEFAULT"
    preserve_face: str = "DEFAULT"
    merge_style: Optional[str] = None
    return_mask: bool = False
    number_of_images: int = Field(
        1, ge=1, le=5, description="Number of images to generate"
    )
    quality: Literal["standard", "premium"] = "premium"
    cfg_scale: float = Field(6.5, ge=1.0, le=10.0, description="CFG scale")
    seed: int = Field(-1, description="Seed for random generation")

    @field_validator(
        "group_id",
        "user_id",
        "source_image_object_name",
        "reference_image_object_name",
    )
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must be non-empty string")
        return v

    @field_validator("seed")
    @classmethod
    def validate_seed(cls, v: int) -> int:
        if v != -1 and (v < 0 or v > 2147483647):
            raise ValueError("must be -1 or integer between 0 and 2147483647")
        return v

    @model_validator(mode="after")
    def validate_mask_dependencies(self):
        if self.mask_type == "IMAGE":
            if (
                not self.mask_image_object_name
                or not self.mask_image_object_name.strip()
            ):
                raise ValueError(
                    "mask_image_object_name is required when mask_type is IMAGE"
                )

        if self.mask_type == "PROMPT":
            if not self.mask_prompt or not self.mask_prompt.strip():
                raise ValueError("mask_prompt is required when mask_type is PROMPT")

        return self


class NovaVTOResponse(BaseModel):
    request_id: str
    status: str
    # images: Optional[List[str]] = None  # Base64 encoded result images
    object_names: Optional[List[str]] = None  # S3 object names for saved images
    error: Optional[str] = None
    message: Optional[str] = None

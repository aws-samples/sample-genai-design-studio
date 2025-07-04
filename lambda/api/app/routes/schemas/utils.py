from pydantic import BaseModel, field_validator, Field
from typing import Optional


class GenerateObjectNamesRequest(BaseModel):
    seller_id: str = Field(..., min_length=1, description="Seller ID")
    item_id: str = Field(..., min_length=1, description="Item ID")

    @field_validator("seller_id", "item_id")
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must be non-empty string")
        return v


class GenerateObjectNamesResponse(BaseModel):
    date_folder: str
    timestamp: str
    uid: str


class PresignedUploadUrlRequest(BaseModel):
    object_name: str = Field(..., min_length=1, description="S3 object name")
    expiration: Optional[int] = Field(
        900, ge=1, le=3600, description="URL expiration time in seconds"
    )

    @field_validator("object_name")
    @classmethod
    def validate_object_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must be non-empty string")
        return v


class PresignedUrlResponse(BaseModel):
    url: Optional[str] = None
    object_name: str
    error: Optional[str] = None

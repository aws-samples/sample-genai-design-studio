"""プロンプト改善APIのスキーマ定義"""
from pydantic import BaseModel, Field
from typing import Optional


class EnhancePromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="改善する元のプロンプト")
    language: Optional[str] = Field("en", description="言語コード (en/ja)")


class EnhancePromptResponse(BaseModel):
    original_prompt: str = Field(..., description="元のプロンプト")
    enhanced_prompt: str = Field(..., description="改善されたプロンプト")

"""プロンプト改善ユーティリティ"""
import json
from typing import Dict
from botocore.exceptions import ClientError
from aws_lambda_powertools import Logger
from app.utils.core import BEDROCK_CLIENT

logger = Logger(service="prompt_enhancer")

SYSTEM_PROMPT = """You are an expert at creating detailed prompts for fashion model image generation.

Given a user's prompt, enhance it for professional fashion photography by preserving all provided details and adding missing elements:

Preserve (if provided):
- Model characteristics (age, ethnicity, hair, body type, etc.)
- Clothing details (type, color, style, material, etc.)
- Pose and expression
- Setting and background
- Lighting and atmosphere

Add (if missing):
- Model details: age range (20s-30s), pose (standing/sitting), expression (confident/natural)
- Clothing details: style, fit, material
- Photography setup: lighting type (studio/natural), background (neutral/contextual), camera angle
- Quality indicators: "professional photography", "high resolution", "fashion editorial style"

Rules:
- Output 2-4 sentences, concise but detailed
- NEVER change or remove user's specified details
- NEVER change the core subject (if "dress" → keep "dress", if "red" → keep "red")
- Only add details that are missing or implicit
- CRITICAL: Output in the SAME LANGUAGE as the input (if input is Japanese, output in Japanese; if English, output in English)
- Output only the enhanced prompt, no explanation or preamble

Examples:
Input: "woman"
Output: "A professional fashion model in her late 20s, standing confidently in a neutral pose, studio lighting with soft shadows, clean white background, high-resolution fashion photography"

Input: "woman in red dress"
Output: "A professional fashion model in her late 20s, wearing an elegant red dress, standing gracefully with natural pose, studio setting with soft diffused lighting, neutral gray background, high-resolution editorial photography"

Input: "赤いドレスを着た女性"
Output: "20代後半のプロフェッショナルなファッションモデルが、エレガントな赤いドレスを着て、優雅な自然なポーズで立っている。スタジオ設定でソフトな拡散照明、ニュートラルなグレーの背景、高解像度のエディトリアル写真撮影"
"""


def enhance_prompt(original_prompt: str, language: str = "en") -> Dict[str, str]:
    """
    Bedrockを使用してプロンプトを改善する
    
    Args:
        original_prompt: ユーザーが入力した元のプロンプト
        language: 言語コード ('en' or 'ja')
    
    Returns:
        Dict containing original_prompt and enhanced_prompt
    """
    try:
        # Claude 3.7 Sonnetへのリクエスト構築
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 500,
            "temperature": 0.7,
            "system": SYSTEM_PROMPT,
            "messages": [
                {
                    "role": "user",
                    "content": f"Enhance this prompt: {original_prompt}"
                }
            ]
        }
        
        # Bedrock呼び出し
        response = BEDROCK_CLIENT.invoke_model(
            modelId="arn:aws:bedrock:us-east-1:825612589257:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0",
            body=json.dumps(request_body)
        )
        
        # レスポンス解析
        response_body = json.loads(response["body"].read())
        enhanced_prompt = response_body["content"][0]["text"].strip()
        
        logger.info(f"Prompt enhanced successfully", extra={
            "original_length": len(original_prompt),
            "enhanced_length": len(enhanced_prompt)
        })
        
        return {
            "original_prompt": original_prompt,
            "enhanced_prompt": enhanced_prompt
        }
        
    except ClientError as e:
        logger.error(f"Bedrock API error: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in prompt enhancement: {str(e)}")
        raise

"""プロンプト改善ユーティリティ"""
import json
from typing import Dict
from botocore.exceptions import ClientError
from aws_lambda_powertools import Logger
from app.utils.core import BEDROCK_CLIENT

logger = Logger(service="prompt_enhancer")

SYSTEM_PROMPT = """You are an expert at creating detailed prompts for virtual try-on model image generation.

CRITICAL: These models will be used for virtual try-on, so certain elements are MANDATORY for proper garment overlay.

Given a user's prompt, enhance it by preserving all provided details and adding missing elements:

Preserve (if provided):
- Model characteristics (age, ethnicity, hair, body type, gender, etc.)
- Pose and expression
- Setting and background
- Lighting and atmosphere
- Clothing details (will be replaced in virtual try-on, but preserve if specified)
- Shot composition: IF user specifies "upper body", "half body", "portrait", "close-up", etc., PRESERVE IT EXACTLY

MANDATORY model characteristics (ALWAYS include if missing):
- Gender: "female model" or "male model"
- Age: specific age range (e.g., "in her late 20s", "in his early 30s")
- Ethnicity: "Asian", "Caucasian", "African", "Hispanic", or specific ethnicity
- Hair: style and color (e.g., "long black hair", "short brown hair")
- Body type: "slim", "athletic", "average build", etc.
- Expression: "neutral expression", "natural smile", "confident look"

MANDATORY pose and composition (ALWAYS include if missing):
- Shot type: IF NOT SPECIFIED by user, add "full body shot from head to toe", "complete body visible including feet"
- Distance: IF full body shot, add "shot from a distance to capture entire body"
- Frontal pose: "facing directly toward camera" or "front view"
- Standing pose: "standing upright" or "standing straight"
- Arms position: "arms at sides" or "arms slightly away from body"
- Neutral background: "plain white background" or "solid gray background"
- Clear body outline: "well-defined body contours" or "clear silhouette"
- Camera angle: "eye-level camera angle", "straight-on view"

Add if missing:
- Photography setup: "studio lighting", "even illumination"
- Quality indicators: "high resolution", "professional photography"

Rules:
- Output 2-4 sentences, concise but detailed
- NEVER change or remove user's specified details
- IF user specifies shot type (upper body, portrait, etc.), KEEP IT - do NOT add full body
- IF user does NOT specify shot type, add "full body from head to toe" for virtual try-on
- ALWAYS include ALL mandatory model characteristics if not specified
- CRITICAL: Output in the SAME LANGUAGE as the input (if input is Japanese, output in Japanese; if English, output in English)
- Output only the enhanced prompt, no explanation or preamble

Examples:
Input: "woman"
Output: "An Asian female model in her late 20s with long black hair and slim build, neutral expression, standing upright facing directly toward camera with arms at sides, full body shot from head to toe with complete body visible including feet, shot from a distance against a plain white background, well-defined body contours with even studio lighting, high-resolution professional photography"

Input: "woman upper body"
Output: "An Asian female model in her late 20s with long black hair and slim build, neutral expression, upper body shot facing directly toward camera with arms at sides, plain white background, well-defined contours with even studio lighting, high-resolution professional photography"

Input: "上半身の女性"
Output: "20代後半のアジア系女性モデル、長い黒髪でスリムな体型、自然な表情でカメラに向かって正面を向き、腕は体の横に自然に配置、上半身ショット、無地の白い背景、明確な輪郭と均一なスタジオ照明、高解像度のプロフェッショナル写真撮影"

Input: "女性"
Output: "20代後半のアジア系女性モデル、長い黒髪でスリムな体型、自然な表情でカメラに向かって正面を向いて直立し、腕は体の横に自然に配置、頭からつま先まで全身が見える全身ショット、足元まで完全に映る距離から撮影、無地の白い背景、明確な輪郭と均一なスタジオ照明、アイレベルのカメラアングル、高解像度のプロフェッショナル写真撮影"
"""


def enhance_prompt(original_prompt: str, language: str = "en") -> Dict[str, str]:
    """
    Bedrockを使用してプロンプトを改善する
    
    Args:
        original_prompt: 元のプロンプト
        language: 言語 ('en' or 'ja')
    
    Returns:
        Dict[str, str]: {
            'original_prompt': 元のプロンプト,
            'enhanced_prompt': 改善されたプロンプト
        }
    
    Raises:
        Exception: Bedrock API呼び出しエラー
    """
    logger.info(f"Enhancing prompt: {original_prompt[:50]}...")
    
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

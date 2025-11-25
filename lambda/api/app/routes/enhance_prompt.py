"""プロンプト改善APIルート"""
from fastapi import APIRouter, HTTPException
from app.routes.schemas.prompt_enhancement import EnhancePromptRequest, EnhancePromptResponse
from app.utils.prompt_enhancer import enhance_prompt
from aws_lambda_powertools import Logger

logger = Logger(service="enhance_prompt_route")

router = APIRouter()


@router.post("/enhance-prompt", response_model=EnhancePromptResponse)
async def enhance_prompt_endpoint(request: EnhancePromptRequest):
    """
    プロンプトを改善するエンドポイント
    
    Args:
        request: EnhancePromptRequest (prompt, language)
    
    Returns:
        EnhancePromptResponse (original_prompt, enhanced_prompt)
    """
    try:
        logger.info(f"Received prompt enhancement request", extra={
            "prompt_length": len(request.prompt),
            "language": request.language
        })
        
        # プロンプト改善を実行
        result = enhance_prompt(request.prompt, request.language)
        
        logger.info("Prompt enhancement completed successfully")
        
        return EnhancePromptResponse(
            original_prompt=result["original_prompt"],
            enhanced_prompt=result["enhanced_prompt"]
        )
        
    except Exception as e:
        logger.error(f"Error in prompt enhancement: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enhance prompt: {str(e)}"
        )

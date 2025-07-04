from fastapi import APIRouter
from app.routes.schemas.health import HealthCheckResponse

router = APIRouter()


@router.get("/", response_model=HealthCheckResponse)
async def root():
    """ルートエンドポイント - ヘルスチェック"""
    return HealthCheckResponse(status="healthy", message="VTO API is running")


@router.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """ヘルスチェックエンドポイント"""
    return HealthCheckResponse(status="healthy", message="Service is operational")

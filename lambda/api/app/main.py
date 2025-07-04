from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from pydantic import ValidationError
import os
from aws_lambda_powertools import Logger

# Import routers
from app.routes.health import router as health_router
from app.routes.nova_vto import router as nova_vto_router
from app.routes.nova_model import router as nova_model_router
from app.routes.background_replacement import router as background_replacement_router
from app.routes.utils import router as utils_router


# ロギングの設定
# API proxy
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="api_proxy", level=LOG_LEVEL)
logger.info("Environment variables: " + str(dict(os.environ)))

# FastAPIアプリケーションの初期化
app = FastAPI(title="VTO API", description="Virtual Try-On API", version="1.0.0")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では適切なオリジンを設定してください
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(health_router)
app.include_router(nova_vto_router)
app.include_router(nova_model_router)
app.include_router(background_replacement_router)
app.include_router(utils_router)


# Exception handler for Pydantic validation errors
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Handle Pydantic validation errors"""
    logger.error(f"Validation error: {exc}")

    # Format the error messages
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        msg = error["msg"]
        errors.append(f"{field}: {msg}")

    return JSONResponse(status_code=422, content={"detail": errors})


# Lambda handler
def lambda_handler(event, context):
    # Call the Mangum handler
    return Mangum(app)(event, context)


# Lambda handler
handler = lambda_handler

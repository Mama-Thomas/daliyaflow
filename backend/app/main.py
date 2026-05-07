import logging
import time
import uuid
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.clients import router as clients_router
from app.api.v1.continuity import router as continuity_router
from app.api.v1.coordinator import router as coordinator_router
from app.api.v1.demo import router as demo_router
from app.api.v1.flags import router as flags_router
from app.api.v1.handoffs import router as handoffs_router
from app.api.v1.invitations import router as invitations_router
from app.api.v1.shift_templates import router as shift_templates_router
from app.api.v1.shifts import router as shifts_router
from app.api.v1.users import router as users_router
from app.api.v1.waitlist import router as waitlist_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.observability import scrub_sentry_event, setup_logging
from app.core.rate_limit import limiter
from app.db.session import SessionLocal


setup_logging()
logger = logging.getLogger("daliyaflow")


def _sentry_traces_rate() -> float:
    return 1.0 if settings.ENVIRONMENT == "development" else 0.1


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=_sentry_traces_rate(),
            send_default_pii=False,
            before_send=scrub_sentry_event,
        )
        logger.info("sentry_initialised")
    logger.info("api_starting", extra={"environment": settings.ENVIRONMENT})
    yield
    logger.info("api_shutdown")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url=None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# Register the limiter on the app so SlowAPI middleware finds it.
app.state.limiter = limiter


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-ms"] = str(elapsed_ms)
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "elapsed_ms": elapsed_ms,
                "request_id": request_id,
                "agency_id": getattr(request.state, "agency_id", None),
                "user_id": getattr(request.state, "user_id", None),
            },
        )
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized request bodies before they reach the route.

    Audio upload routes get a higher cap (settings.MAX_AUDIO_BODY_BYTES); every
    other route is capped at MAX_REQUEST_BODY_BYTES.
    """

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit():
            size = int(cl)
            path = request.url.path
            limit = (
                settings.MAX_AUDIO_BODY_BYTES
                if "/audio" in path or path.endswith("/transcribe")
                else settings.MAX_REQUEST_BODY_BYTES
            )
            if size > limit:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "REQUEST_TOO_LARGE",
                            "message": f"Request body exceeds {limit} bytes.",
                        }
                    },
                )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(self), geolocation=(), payment=()",
        )
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "meta": {"request_id": request_id},
        },
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    request_id = getattr(request.state, "request_id", None)
    # Default retry hint: 60s. SlowAPI's exc.detail is the limit string; we don't
    # parse it precisely — the client only needs a non-zero value to back off.
    retry_after = 60
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests, please slow down.",
                "retry_after": retry_after,
            },
            "meta": {"request_id": request_id},
        },
        headers={"Retry-After": str(retry_after)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception("unhandled_exception", extra={"request_id": request_id})
    message = (
        "An unexpected error occurred"
        if settings.is_production
        else f"{type(exc).__name__}: {exc}"
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {"code": "INTERNAL_ERROR", "message": message},
            "meta": {"request_id": request_id},
        },
    )


async def _check_db() -> str:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        logger.warning("health_check_db_failed")
        return "error"


async def _check_redis() -> str:
    try:
        import redis.asyncio as aioredis  # type: ignore

        client = aioredis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )
        try:
            ok = await client.ping()
        finally:
            await client.aclose()
        return "ok" if ok else "error"
    except Exception:
        logger.warning("health_check_redis_failed")
        return "error"


@app.get("/health", tags=["meta"])
async def health() -> dict:
    db_status = await _check_db()
    redis_status = await _check_redis()
    overall = "ok" if db_status == "ok" and redis_status == "ok" else "degraded"
    return {
        "status": overall,
        "service": "daliyaflow-api",
        "environment": settings.ENVIRONMENT,
        "version": "0.1.0",
        "db": db_status,
        "redis": redis_status,
    }


@app.get("/", tags=["meta"])
async def root() -> dict:
    return {"service": "DaliyaFlow API", "docs": "/docs"}


app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(clients_router, prefix=settings.API_V1_PREFIX)
app.include_router(shifts_router, prefix=settings.API_V1_PREFIX)
app.include_router(shift_templates_router, prefix=settings.API_V1_PREFIX)
app.include_router(handoffs_router, prefix=settings.API_V1_PREFIX)
app.include_router(flags_router, prefix=settings.API_V1_PREFIX)
app.include_router(coordinator_router, prefix=settings.API_V1_PREFIX)
app.include_router(continuity_router, prefix=settings.API_V1_PREFIX)
app.include_router(users_router, prefix=settings.API_V1_PREFIX)
app.include_router(invitations_router, prefix=settings.API_V1_PREFIX)
app.include_router(waitlist_router, prefix=settings.API_V1_PREFIX)
app.include_router(demo_router, prefix=settings.API_V1_PREFIX)

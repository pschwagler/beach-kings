"""
Beach Volleyball ELO API Server

FastAPI server that provides REST endpoints for ELO calculations and statistics.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import logging
import os
import uvicorn
from slowapi import _rate_limit_exceeded_handler  # type: ignore
from slowapi.errors import RateLimitExceeded  # type: ignore

from backend.api.routes import router, limiter as routes_limiter
from backend.api.public_routes import public_router
from backend.database import db
from backend.database.init_defaults import init_defaults
from backend.database.seed_courts import seed_courts
from backend.services.stats_queue import get_stats_queue
from backend.services.session_cleanup_service import get_session_cleanup_service
from backend.services import settings_service

# Set up logging
# Allow log level to be configured via environment variable (default: INFO)
# Note: Database setting will be checked after database initialization
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
numeric_level = getattr(logging, log_level, logging.INFO)
logging.basicConfig(
    level=numeric_level, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler for startup and shutdown events."""
    # Startup
    logger.info("Starting up Beach Volleyball ELO API...")

    # Initialize database (create tables if they don't exist)
    # This is a fallback for tables that might not be in migrations yet
    try:
        await db.init_database()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}", exc_info=True)
        # Don't raise - allow app to start even if initialization fails
        # (useful for development, but you might want to raise in production)

    # Initialize default values (settings, etc.)
    try:
        await init_defaults()
        logger.info("✓ Default values initialized")

        # Check for log level setting in database and apply it
        try:
            from backend.database.db import AsyncSessionLocal
            from backend.services import data_service

            async with AsyncSessionLocal() as session:
                log_level_setting = await data_service.get_setting(session, "log_level")
                if log_level_setting:
                    log_level_name = log_level_setting.upper()
                    numeric_level = getattr(logging, log_level_name, logging.INFO)
                    root_logger = logging.getLogger()
                    root_logger.setLevel(numeric_level)
                    logger.info(f"Log level set from database: {log_level_name}")
                else:
                    logger.info(f"Log level set from environment: {log_level}")
        except Exception as e:
            logger.warning(f"Could not load log level from database, using environment: {e}")
            logger.info(f"Log level set from environment: {log_level}")
    except Exception as e:
        logger.error(f"Failed to initialize defaults: {e}", exc_info=True)
        # Don't raise - allow app to start even if defaults fail

    # Seed court tags and default courts
    try:
        await seed_courts()
        logger.info("✓ Court seed data initialized")
    except Exception as e:
        logger.error(f"Failed to seed court data: {e}", exc_info=True)

    # Register stats calculation callbacks (must be done before starting worker)
    try:
        from backend.services.data_service import register_stats_queue_callbacks

        register_stats_queue_callbacks()
        logger.info("✓ Stats calculation callbacks registered")
    except Exception as e:
        logger.error(f"Failed to register stats calculation callbacks: {e}", exc_info=True)
        # Don't raise - allow app to start, but calculations will fail if callbacks aren't registered

    # Start stats calculation queue worker
    try:
        queue = get_stats_queue()
        queue.start_background_worker()
        logger.info("✓ Stats calculation queue worker started")
    except Exception as e:
        logger.error(f"Failed to start stats calculation queue worker: {e}", exc_info=True)
        # Don't raise - allow app to start even if queue worker fails

    # Start session cleanup worker (auto-submit/delete stale sessions)
    try:
        cleanup_service = get_session_cleanup_service()
        cleanup_service.start()
        logger.info("✓ Session cleanup worker started")
    except Exception as e:
        logger.error(f"Failed to start session cleanup worker: {e}", exc_info=True)

    yield  # App is running

    # Shutdown (if needed)
    logger.info("Shutting down Beach Volleyball ELO API...")

    # Stop stats calculation queue worker
    try:
        queue = get_stats_queue()
        queue.stop_background_worker()
        logger.info("✓ Stats calculation queue worker stopped")
    except Exception as e:
        logger.error(f"Error stopping stats calculation queue worker: {e}", exc_info=True)

    # Stop session cleanup worker
    try:
        cleanup_service = get_session_cleanup_service()
        cleanup_service.stop()
        logger.info("✓ Session cleanup worker stopped")
    except Exception as e:
        logger.error(f"Error stopping session cleanup worker: {e}", exc_info=True)

    # Close Redis connection
    try:
        await settings_service.close_redis_connection()
        logger.info("✓ Redis connection closed")
    except Exception as e:
        logger.error(f"Error closing Redis connection: {e}", exc_info=True)


app = FastAPI(
    title="Beach Volleyball ELO API",
    description="API for calculating and retrieving beach volleyball ELO ratings and statistics",
    version="2.0.0",
    lifespan=lifespan,
)

# Setup rate limiter
app.state.limiter = routes_limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware — origins configured via ALLOWED_ORIGINS env var
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)
app.include_router(public_router)


@app.get("/", response_class=HTMLResponse)
async def root():
    """API root endpoint - frontend is served separately."""
    return HTMLResponse(
        content="""
        <!DOCTYPE html>
        <html>
            <head>
                <title>Beach Volleyball ELO API</title>
                <style>
                    body { font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                    h1 { color: #667eea; }
                    a { color: #667eea; }
                </style>
            </head>
            <body>
                <h1>🏐 Beach Volleyball ELO API</h1>
                <p>API is running successfully!</p>
                <h2>Available Resources:</h2>
                <ul>
                    <li><a href="/docs">📚 API Documentation</a> - Interactive API docs</li>
                    <li><a href="/api/health">❤️ Health Check</a> - System status</li>
                </ul>
                <p><em>Note: Frontend is served separately by Next.js service.</em></p>
            </body>
        </html>
    """
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

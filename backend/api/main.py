"""
Beach Volleyball ELO API Server

FastAPI server that provides REST endpoints for ELO calculations and statistics.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging
from slowapi import _rate_limit_exceeded_handler  # type: ignore
from slowapi.errors import RateLimitExceeded  # type: ignore

from backend.api.routes import router, limiter as routes_limiter
from backend.database import db
from backend.database.migrate_add_sessions import migrate as migrate_sessions
from backend.database.migrate_rename_is_active import migrate as migrate_rename_is_active
from backend.database.migrate_add_users import migrate as migrate_users
from backend.services import data_service, sheets_service, calculation_service

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler for startup and shutdown events."""
    # Startup
    logger.info("Starting up Beach Volleyball ELO API...")
    
    # Run database migrations first (in order)
    try:
        logger.info("Running database migrations...")
        migrate_sessions()
        migrate_rename_is_active()
        migrate_users()
        logger.info("✓ All migrations completed")
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        # Don't raise - allow app to start even if migrations fail
        # (useful for development, but you might want to raise in production)
    
    # Initialize database (create tables if they don't exist)
    db.init_database()
    logger.info("Database initialized")

    yield  # App is running
    
    # Shutdown (if needed)
    logger.info("Shutting down Beach Volleyball ELO API...")


app = FastAPI(
    title="Beach Volleyball ELO API",
    description="API for calculating and retrieving beach volleyball ELO ratings and statistics",
    version="2.0.0",
    lifespan=lifespan
)

# Setup rate limiter
app.state.limiter = routes_limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the React frontend."""
    try:
        # Try to serve React build first
        with open("frontend/dist/index.html", "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        # Fallback to simple HTML
        return HTMLResponse(content="""
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Beach Volleyball ELO</title>
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
                    <p><em>Note: Run frontend build to see the web interface.</em></p>
                </body>
            </html>
        """)


# Mount static assets from React build
try:
    # Mount assets directory
    app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")
except:
    # Assets directory might not exist yet (before build)
    pass


# Serve static files (images, etc.) from dist - must be after all API routes
@app.get("/{file_path:path}")
async def serve_static_files(file_path: str):
    """Serve static files from frontend/dist directory."""
    # Don't serve API routes through this catch-all
    if file_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # Try to serve the requested file
    full_path = Path(f"frontend/dist/{file_path}")
    if full_path.is_file():
        return FileResponse(full_path)
    
    # If file not found, serve index.html (for React Router)
    return FileResponse("frontend/dist/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


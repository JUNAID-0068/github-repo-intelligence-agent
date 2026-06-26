import os
import warnings
import logging

# Silence Hugging Face Hub cache/symlink warnings on Windows and unauthenticated requests warnings
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
warnings.filterwarnings("ignore", category=UserWarning, module="huggingface_hub")
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)

try:
    from huggingface_hub import logging as hf_logging
    hf_logging.set_verbosity_error()
except ImportError:
    pass

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database.postgres import init_db
from routes.analyze import router as analyze_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks (DB init) then yield control to the app."""
    await init_db()
    yield


app = FastAPI(
    title="GitHub Intelligence API",
    description="AI-powered GitHub repository analysis backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(analyze_router)


# ── Health / root ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "GitHub Intelligence API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Entry-point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

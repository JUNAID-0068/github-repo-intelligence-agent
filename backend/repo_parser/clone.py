"""
Repository cloning and structural analysis module.

Clones a GitHub repository into REPOS_TEMP_DIR, walks the file tree,
and detects the primary language and framework.

Usage:
    from repo_parser.clone import clone_repository

    info = clone_repository("https://github.com/fastapi/fastapi")
"""

import asyncio
import os
import shutil
import stat

import git
from dotenv import load_dotenv

load_dotenv()

REPOS_TEMP_DIR: str = os.getenv("REPOS_TEMP_DIR", "/tmp/repos")


# ---------------------------------------------------------------------------
# Windows-safe directory removal
# ---------------------------------------------------------------------------

def _force_rmtree(path: str) -> None:
    """
    Remove a directory tree even when files are marked read-only (common for
    ``.git`` pack files on Windows).

    The error handler catches ``PermissionError`` / ``OSError``, flips the
    read-only bit on the offending file, then retries the removal.
    """
    def _on_error(func, fpath, exc_info):
        # Attempt to make the file writable and retry
        try:
            os.chmod(fpath, stat.S_IWRITE)
            func(fpath)
        except Exception:
            pass  # best-effort; ignore if still fails

    shutil.rmtree(path, onerror=_on_error)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Directories that are never useful to walk (noise reduction)
_SKIP_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv",
    ".mypy_cache", ".pytest_cache", "dist", "build", ".next",
    ".nuxt", "coverage", ".tox", "eggs", ".eggs",
}

# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

_EXT_LANGUAGE: dict[str, str] = {
    ".py":   "Python",
    ".js":   "JavaScript/TypeScript",
    ".jsx":  "JavaScript/TypeScript",
    ".ts":   "JavaScript/TypeScript",
    ".tsx":  "JavaScript/TypeScript",
    ".java": "Java",
    ".go":   "Go",
    ".rb":   "Ruby",
}


def _detect_language(files: list[str]) -> str:
    """Return the primary language based on file-extension counts."""
    counts: dict[str, int] = {}
    for path in files:
        ext = os.path.splitext(path)[1].lower()
        lang = _EXT_LANGUAGE.get(ext)
        if lang:
            counts[lang] = counts.get(lang, 0) + 1

    if not counts:
        return "Unknown"
    return max(counts, key=lambda k: counts[k])


# ---------------------------------------------------------------------------
# Framework detection
# ---------------------------------------------------------------------------

def _read_lower(path: str) -> str:
    """Read a file as lowercase text; return '' on any error."""
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            return fh.read().lower()
    except OSError:
        return ""


def _detect_framework(repo_path: str) -> str:
    """
    Inspect well-known config files to identify the framework.

    Priority order (first match wins):
        requirements.txt  →  FastAPI / Django / Flask
        package.json      →  Next.js / React
        pom.xml           →  Spring Boot
        go.mod            →  Go
    """
    req_path     = os.path.join(repo_path, "requirements.txt")
    pkg_path     = os.path.join(repo_path, "package.json")
    pom_path     = os.path.join(repo_path, "pom.xml")
    gomod_path   = os.path.join(repo_path, "go.mod")

    if os.path.isfile(req_path):
        content = _read_lower(req_path)
        if "fastapi" in content:
            return "FastAPI"
        if "django" in content:
            return "Django"
        if "flask" in content:
            return "Flask"

    if os.path.isfile(pkg_path):
        content = _read_lower(pkg_path)
        if "next" in content:
            return "Next.js"
        if "react" in content:
            return "React"

    if os.path.isfile(pom_path):
        return "Spring Boot"

    if os.path.isfile(gomod_path):
        return "Go"

    return "Unknown"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def clone_repository(repo_url: str) -> dict:
    """
    Clone a GitHub repository, walk its file tree, and detect language/framework.

    Args:
        repo_url: Full GitHub URL, e.g. "https://github.com/fastapi/fastapi"

    Returns:
        {
            "repo_name":      str,
            "repo_path":      str,
            "language":       str,
            "framework":      str,
            "folders":        list[str],   # relative paths
            "files":          list[str],   # relative paths
            "total_files":    int,
            "total_folders":  int,
        }

    Raises:
        ValueError: If repo_url is empty or has fewer than 2 path segments.
        git.GitCommandError: If the clone operation fails (bad URL, auth, etc.)
    """
    # -- 1. Extract repo_name from URL -----------------------------------
    repo_url = repo_url.rstrip("/")
    parts = [p for p in repo_url.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Cannot extract repo name from URL: {repo_url!r}")
    repo_name = parts[-1]

    # -- 2. Prepare target directory -------------------------------------
    os.makedirs(REPOS_TEMP_DIR, exist_ok=True)
    repo_path = os.path.join(REPOS_TEMP_DIR, repo_name)

    if os.path.exists(repo_path):
        print(f"[CLONE] '{repo_name}' already exists — deleting and re-cloning.")
        _force_rmtree(repo_path)

    # -- 3. Clone (run blocking git call in a thread pool) ---------------
    print(f"[CLONE] Cloning {repo_url} -> {repo_path}")
    await asyncio.to_thread(git.Repo.clone_from, repo_url, repo_path)
    print(f"[CLONE] Done.")

    # -- 4. Walk file tree -----------------------------------------------
    folders: list[str] = []
    files:   list[str] = []

    for root, dirs, filenames in os.walk(repo_path):
        # Prune noisy directories in-place so os.walk skips them entirely
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]

        rel_root = os.path.relpath(root, repo_path)

        if rel_root != ".":                          # skip the root itself
            folders.append(rel_root.replace("\\", "/"))

        for fname in filenames:
            rel_file = os.path.relpath(
                os.path.join(root, fname), repo_path
            )
            files.append(rel_file.replace("\\", "/"))

    # -- 5. Detect language & framework ----------------------------------
    language  = _detect_language(files)
    framework = _detect_framework(repo_path)

    return {
        "repo_name":     repo_name,
        "repo_path":     repo_path,
        "language":      language,
        "framework":     framework,
        "folders":       sorted(folders),
        "files":         sorted(files),
        "total_files":   len(files),
        "total_folders": len(folders),
    }

import os
import ast
import json


SKIP_DIRS = {"node_modules", ".git", "__pycache__", "venv", ".env", "dist", "build"}
CHUNK_SIZE = 500


def _chunk_text(text: str, size: int = CHUNK_SIZE) -> list[str]:
    """Split text into chunks of at most `size` characters."""
    return [text[i : i + size] for i in range(0, len(text), size)]


def _extract_python_metadata(source: str) -> dict:
    """
    Parse a Python source string with the AST and extract:
      - function names + their docstrings
      - class names + their docstrings
      - import statements (as source-level strings)
    Returns a dict with keys 'functions', 'classes', 'imports'.
    """
    functions: list[dict] = []
    classes: list[dict] = []
    imports: list[str] = []

    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {"functions": functions, "classes": classes, "imports": imports}

    for node in ast.walk(tree):
        # ── Functions ──────────────────────────────────────────────────────────
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            docstring = ast.get_docstring(node) or ""
            # Collect route decorators attached to this function
            route_decorators: list[str] = []
            for dec in node.decorator_list:
                dec_src = ast.unparse(dec)
                if any(
                    dec_src.startswith(prefix)
                    for prefix in (
                        "app.get", "app.post", "app.put", "app.delete", "app.patch",
                        "router.get", "router.post", "router.put", "router.delete", "router.patch",
                    )
                ):
                    route_decorators.append(dec_src)

            functions.append(
                {
                    "name": node.name,
                    "docstring": docstring,
                    "route_decorators": route_decorators,
                }
            )

        # ── Classes ────────────────────────────────────────────────────────────
        elif isinstance(node, ast.ClassDef):
            docstring = ast.get_docstring(node) or ""
            classes.append({"name": node.name, "docstring": docstring})

        # ── Imports ────────────────────────────────────────────────────────────
        elif isinstance(node, ast.Import):
            for alias in node.names:
                stmt = f"import {alias.name}"
                if alias.asname:
                    stmt += f" as {alias.asname}"
                imports.append(stmt)

        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            names = ", ".join(
                (f"{a.name} as {a.asname}" if a.asname else a.name)
                for a in node.names
            )
            imports.append(f"from {module} import {names}")

    return {"functions": functions, "classes": classes, "imports": imports}


def parse_repository(repo_path: str) -> list:
    """
    Walk every file under *repo_path*, parse it according to its type,
    and return a flat list of chunk dicts.

    Chunk dict shapes
    -----------------
    Python  : {file_path, content, type="python",  functions, classes, imports}
    Markdown: {file_path, content, type="markdown"}
    Dependency (requirements.txt / package.json / pom.xml):
              {file_path, content, type="dependency"}
    JS/TS   : {file_path, content, type="javascript"}
    Config  : {file_path, content, type="config"}
    """
    chunks: list[dict] = []

    for dirpath, dirnames, filenames in os.walk(repo_path):
        # Prune skipped directories in-place so os.walk won't descend into them
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            ext = os.path.splitext(filename)[1].lower()

            # ── Python ──────────────────────────────────────────────────────────
            if ext == ".py":
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except OSError:
                    continue

                metadata = _extract_python_metadata(content)
                for chunk_text in _chunk_text(content):
                    chunks.append(
                        {
                            "file_path": file_path,
                            "content": chunk_text,
                            "type": "python",
                            "functions": metadata["functions"],
                            "classes": metadata["classes"],
                            "imports": metadata["imports"],
                        }
                    )

            # ── Markdown ────────────────────────────────────────────────────────
            elif ext == ".md":
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except OSError:
                    continue

                for chunk_text in _chunk_text(content):
                    chunks.append(
                        {
                            "file_path": file_path,
                            "content": chunk_text,
                            "type": "markdown",
                        }
                    )

            # ── Dependency manifests ────────────────────────────────────────────
            elif filename in {"requirements.txt", "package.json", "pom.xml"}:
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except OSError:
                    continue

                chunks.append(
                    {
                        "file_path": file_path,
                        "content": content,
                        "type": "dependency",
                    }
                )

            # ── JavaScript / TypeScript ─────────────────────────────────────────
            elif ext in {".js", ".ts", ".jsx", ".tsx"}:
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except OSError:
                    continue

                for chunk_text in _chunk_text(content):
                    chunks.append(
                        {
                            "file_path": file_path,
                            "content": chunk_text,
                            "type": "javascript",
                        }
                    )

            # ── Config files ────────────────────────────────────────────────────
            elif ext in {".yaml", ".yml", ".toml"}:
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except OSError:
                    continue

                chunks.append(
                    {
                        "file_path": file_path,
                        "content": content,
                        "type": "config",
                    }
                )

    return chunks

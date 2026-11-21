"""Điểm vào WSGI và máy chủ phát triển của AgriData."""

import os
import runpy
from pathlib import Path

from src.main import app, create_app

__all__ = ["app", "create_app"]

if __name__ == "__main__":
    if os.environ.get("MACH_DONG_LOCAL_PREVIEW") == "1":
        runpy.run_path(str(Path(__file__).resolve().parent / "scripts" / "run-local.py"), run_name="__main__")
    else:
        app.run()

"""Điểm vào WSGI và máy chủ phát triển của AgriData."""

import os
import runpy
from pathlib import Path

__all__ = ["app", "create_app"]

if __name__ == "__main__" and os.environ.get("MACH_DONG_USE_CLOUD") != "1":
    runpy.run_path(str(Path(__file__).resolve().parent / "scripts" / "run-local.py"), run_name="__main__")
else:
    # WSGI/desktop imports keep the hosted configuration. Source launches use local D1/R2.
    from src.main import app, create_app

    if __name__ == "__main__":
        app.run()

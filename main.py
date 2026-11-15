"""Điểm vào WSGI và máy chủ phát triển của AgriData."""

from src.main import app, create_app

__all__ = ["app", "create_app"]

if __name__ == "__main__":
    app.run()

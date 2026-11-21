"""Shared HTTPS transport using certifi's CA bundle when available."""

from __future__ import annotations

import ssl
from typing import Any
from urllib import request

try:
    import certifi
except ImportError:  # pragma: no cover
    certifi = None


def create_ssl_context() -> ssl.SSLContext:
    """Return an SSLContext backed by certifi's CA bundle if installed."""
    if certifi is not None:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl.create_default_context()


def default_urlopen(req: request.Request | str, timeout: float = 12) -> Any:
    """Open an HTTP(S) request using the certifi-backed SSLContext."""
    return request.urlopen(req, timeout=timeout, context=create_ssl_context())

"""Validate and normalize the single photo attached to a Cò Mạ question."""

import base64
import binascii
from io import BytesIO

from PIL import Image, ImageOps

from src.services.ai_client import ChatImage, GeminiError

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BASE64 = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
IMAGE_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def parse_chat_image(value: object) -> ChatImage | None:
    if value is None:
        return None
    if not isinstance(value, dict) or not isinstance(value.get("mime_type"), str) or value["mime_type"] not in IMAGE_FORMATS:
        raise GeminiError("Chọn ảnh JPG, PNG hoặc WebP nha.", 400)
    encoded = value.get("data")
    if not isinstance(encoded, str) or not encoded:
        raise GeminiError("Ảnh gửi lên chưa hợp lệ. Bà con chọn lại ảnh nha.", 400)
    if len(encoded) > MAX_IMAGE_BASE64:
        raise GeminiError("Chọn ảnh có dung lượng tối đa 5 MB nha.", 413)
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise GeminiError("Ảnh gửi lên chưa hợp lệ. Bà con chọn lại ảnh nha.", 400) from None
    if len(raw) > MAX_IMAGE_BYTES:
        raise GeminiError("Chọn ảnh có dung lượng tối đa 5 MB nha.", 413)
    try:
        with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as source:
            if source.format != IMAGE_FORMATS[value["mime_type"]]:
                raise ValueError("Image MIME mismatch")
            if source.width * source.height > 24_000_000:
                raise ValueError("Image dimensions too large")
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGBA")
            image.thumbnail((1600, 1600))
            normalized = Image.new("RGB", image.size, "#ffffff")
            normalized.paste(image, mask=image.getchannel("A"))
            output = BytesIO()
            normalized.save(output, format="JPEG", quality=85)
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise GeminiError("Không đọc được ảnh. Chọn ảnh JPG, PNG hoặc WebP tối đa 24 megapixel nha.", 400) from None
    return {"mime_type": "image/jpeg", "data": base64.b64encode(output.getvalue()).decode("ascii")}

"""Validate and normalize avatar bytes before sending them to cloud storage."""
from io import BytesIO
from PIL import Image, ImageOps


def normalizeAvatar(data: bytes) -> bytes:
    if not data or len(data) > 1_000_000:
        raise ValueError("Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 1 MB.")
    try:
        with Image.open(BytesIO(data), formats=["JPEG", "PNG", "WEBP"]) as source:
            if source.width * source.height > 24_000_000:
                raise ValueError("Chọn ảnh có độ phân giải tối đa 24 megapixel.")
            image = ImageOps.fit(ImageOps.exif_transpose(source).convert("RGB"), (256, 256))
            output = BytesIO()
            image.save(output, format="JPEG", quality=86)
            return output.getvalue()
    except (OSError, SyntaxError, Image.DecompressionBombError) as error:
        raise ValueError("Không đọc được ảnh. Hãy chọn lại ảnh JPG, PNG hoặc WebP.") from error

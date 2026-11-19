"""Animate the field poster into a continuous dry and rainy weather cycle."""

import math
import subprocess
from pathlib import Path

from imageio_ffmpeg import get_ffmpeg_exe
from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / "src/static/assets/weather"
FPS = 24
SECONDS = 12


def build() -> None:
    field = Image.open(ASSETS / "field.jpg").convert("RGB")
    width, height = field.size
    wet = Image.blend(field, Image.new("RGB", field.size, "#344c62"), .49)
    sun = Image.blend(field, Image.new("RGB", field.size, "#fff3ac"), .10)
    command = [
        get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{width}x{height}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
        "-pix_fmt", "yuv420p", "-crf", "25", "-movflags", "+faststart", str(ASSETS / "field-cycle.mp4"),
    ]
    with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
        assert encoder.stdin is not None
        for frame in range(FPS * SECONDS):
            phase = frame / (FPS * SECONDS)
            rain = (1 - math.cos(math.tau * phase)) / 2
            image = Image.blend(sun, wet, rain)
            draw = ImageDraw.Draw(image, "RGBA")
            for drop in range(160):
                x = (drop * 107 - frame * 2) % (width + 10)
                y = (drop * 79 + frame * 9) % (height + 20) - 20
                draw.line((x, y, x - 4, y + 13), fill=(223, 240, 251, round(155 * rain**2)))
            encoder.stdin.write(image.tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError("Could not encode the weather cycle")


if __name__ == "__main__":
    build()

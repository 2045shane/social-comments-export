#!/usr/bin/env python3
"""Draw the toolbar icons. No third-party packages."""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "icons"
SEAL = (158, 47, 42, 255)
PAPER = (251, 246, 238, 255)
CLEAR = (0, 0, 0, 0)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(pixels[y])
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def rounded(x, y, size, radius):
    if x < radius and y < radius:
        return (x + 0.5 - radius) ** 2 + (y + 0.5 - radius) ** 2 <= radius ** 2
    if x >= size - radius and y < radius:
        return (x + 0.5 - (size - radius)) ** 2 + (y + 0.5 - radius) ** 2 <= radius ** 2
    if x < radius and y >= size - radius:
        return (x + 0.5 - radius) ** 2 + (y + 0.5 - (size - radius)) ** 2 <= radius ** 2
    if x >= size - radius and y >= size - radius:
        return (x + 0.5 - (size - radius)) ** 2 + (y + 0.5 - (size - radius)) ** 2 <= radius ** 2
    return True


def draw(size):
    radius = size * 0.22
    band = max(1, round(size / 16))
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if not rounded(x, y, size, radius):
                row.extend(CLEAR)
                continue
            nx = (x + 0.5) / size
            ny = (y + 0.5) / size
            in_body = 0.22 <= nx <= 0.78 and 0.18 <= ny <= 0.60
            in_tail = False
            if 0.32 <= nx <= 0.58 and 0.56 <= ny <= 0.80:
                t = (ny - 0.56) / 0.24
                left = 0.38 - t * 0.06
                right = 0.54 - t * 0.16
                in_tail = left <= nx <= right
            line_y = abs(ny - 0.32) * size <= band and 0.32 <= nx <= 0.68
            line_y2 = abs(ny - 0.44) * size <= band and 0.32 <= nx <= 0.54
            if in_body and (line_y or line_y2):
                row.extend(SEAL)
            elif in_body or in_tail:
                row.extend(PAPER)
            else:
                row.extend(SEAL)
        rows.append(row)
    return rows


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(ROOT / f"icon{size}.png", size, draw(size))


if __name__ == "__main__":
    main()

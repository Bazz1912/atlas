"""Rasterizza il simbolo vettoriale ATLAS in PNG, senza dipendenze esterne."""
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'public' / 'icons'
DEST.mkdir(parents=True, exist_ok=True)
THEME = json.loads((ROOT / 'src/design/tokens.json').read_text())
def rgb(key):
    value=THEME[key].lstrip('#')
    return tuple(int(value[i:i+2],16) for i in (0,2,4))

def inside(x, y, polygon):
    result = False
    previous = polygon[-1]
    for current in polygon:
        ax, ay = previous
        bx, by = current
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            result = not result
        previous = current
    return result

def make_png(size, name):
    arrow = [(0.5, 0.22), (0.73, 0.76), (0.5, 0.65), (0.27, 0.76)]
    cutout = [(0.5, 0.37), (0.5, 0.59), (0.39, 0.65)]
    raw = bytearray()
    for row in range(size):
        raw.append(0)
        for column in range(size):
            pixels = []
            for dy, dx in [(0.25, 0.25), (0.25, 0.75), (0.75, 0.25), (0.75, 0.75)]:
                x, y = (column + dx) / size, (row + dy) / size
                color = rgb('canvas')
                radius = ((x - .5) ** 2 + (y - .5) ** 2) ** .5
                if .359 < radius < .363:
                    color = rgb('border')
                if inside(x, y, arrow):
                    color = rgb('coral')
                if inside(x, y, cutout):
                    color = rgb('canvas')
                pixels.append(color)
            raw.extend(sum(pixel[channel] for pixel in pixels)//4 for channel in range(3))
    def chunk(tag, data):
        return struct.pack('!I', len(data)) + tag + data + struct.pack('!I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    (DEST / name).write_bytes(png)

for dimension, filename in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png'), (512, 'icon-maskable-512.png')]:
    make_png(dimension, filename)
    print(filename)

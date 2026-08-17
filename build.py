#!/usr/bin/env python3
"""
Inlines the base64 fonts into a template and writes a fully self-contained HTML file.

This build step is mine, not the user's — the shipped artefact is a single file that
needs no tooling to open, host or edit.

    python3 build.py src/style-tile.html style-tile.html
    python3 build.py src/app.html index.html
"""
import sys
import pathlib

ROOT = pathlib.Path(__file__).parent
FONTS = {
    "@FONT_DOTO@": "src/fonts/doto.b64",
    "@FONT_MONO@": "src/fonts/jetbrainsmono.b64",
    "@FONT_SERIF@": "src/fonts/instrumentserif.b64",
}


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    src, dst = ROOT / sys.argv[1], ROOT / sys.argv[2]
    html = src.read_text()

    for token, path in FONTS.items():
        if token in html:
            html = html.replace(token, (ROOT / path).read_text().strip())

    leftover = [t for t in FONTS if t in html]
    if leftover:
        print(f"error: unresolved tokens {leftover}")
        return 1

    dst.write_text(html)
    print(f"{src.name} -> {dst.name}  ({len(html) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

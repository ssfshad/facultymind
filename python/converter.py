"""
FacultyMind — Document → Markdown Converter
Uses Microsoft's MarkItDown engine for high-accuracy document extraction.

Usage:
    python converter.py <file_path>

Exit codes:
    0 = success (markdown printed to stdout)
    1 = error (message printed to stderr)

Supported inputs (via MarkItDown):
    PDF, DOCX, PPTX, XLSX, images (PNG/JPG/etc with OCR),
    HTML, CSV, JSON, XML, ZIP, audio (with transcription), and more.
"""

import sys
import io
from markitdown import MarkItDown


def main():
    if len(sys.argv) < 2:
        print("Error: No file path provided", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]

    # Force stdout/stderr to UTF-8 so we don't lose unicode chars on Windows
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

    md = MarkItDown()

    try:
        result = md.convert(file_path)
        print(result.text_content)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

"""Independent inspection of the S00.04 calibration PDF using PyMuPDF.

Usage: python scripts/inspect-print-pdf.py [PDF path]
Checks emitted PDF geometry rather than importing application calculations.
Requires pymupdf; emits an inspection report next to temporary renders.
"""
import json
import sys
from pathlib import Path

import pymupdf


pdf_path = Path(sys.argv[1] if len(sys.argv) > 1 else
                "output/pdf/org-board-print-calibration.pdf")
doc = pymupdf.open(pdf_path)
mm = 72 / 25.4
errors = []
pages = []


def check(condition, message):
    if not condition:
        errors.append(message)


check(len(doc) == 2, f"Expected 22-card calibration across 2 pages, got {len(doc)}")
for index, page in enumerate(doc):
    check(abs(page.rect.width / mm - 297) < 0.01 and
          abs(page.rect.height / mm - 210) < 0.01,
          f"Page {index + 1}: MediaBox is not landscape A4")
    outlines = []
    for drawing in page.get_drawings():
        if drawing.get("type") not in ("s", "fs"):
            continue
        rect = drawing["rect"]
        width = drawing.get("width", 0)
        # Recognize the physical outside of a stroked card, not its centerline.
        if (abs((rect.width + width) / mm - 25) < 0.02 and
                abs((rect.height + width) / mm - 38) < 0.02):
            check(abs(width - 0.6) < 0.01,
                  f"Page {index + 1}: card outline is not 0.6pt")
            outlines.append([rect.x0 - width / 2, rect.y0 - width / 2])
    expected_count = 21 if index == 0 else 1
    check(len(outlines) == expected_count,
          f"Page {index + 1}: expected {expected_count} card outlines, got {len(outlines)}")
    outlines.sort(key=lambda xy: (round(xy[1], 2), xy[0]))
    for slot, (x, y) in enumerate(outlines):
        check(abs(x / mm - (54.4 + slot % 7 * 27.2)) < 0.02 and
              abs(y / mm - (47 + slot // 7 * 39)) < 0.02,
              f"Page {index + 1}, slot {slot}: unexpected card origin")
    images = page.get_image_info()
    photos = [item for item in images
              if abs((item["bbox"][2] - item["bbox"][0]) / mm - 22.4) < 0.02
              and abs((item["bbox"][3] - item["bbox"][1]) / mm - 26.3) < 0.02]
    check(len(photos) == expected_count,
          f"Page {index + 1}: expected {expected_count} vector-positioned photos, got {len(photos)}")
    fonts = page.get_fonts(full=True)
    embedded = []
    for font in fonts:
        content = doc.extract_font(font[0])
        embedded.append({"name": font[3], "bytes": len(content[3])})
    check(any(item["bytes"] > 0 and "Nanum" in item["name"] for item in embedded),
          f"Page {index + 1}: missing embedded Nanum font")
    text = page.get_text()
    check(bool(text.strip()), f"Page {index + 1}: no extractable vector text")
    check("\ufffd" not in text, f"Page {index + 1}: replacement glyph found")
    pages.append({"page": index + 1, "size_mm": [page.rect.width / mm, page.rect.height / mm],
                  "cards": len(outlines), "photos": len(photos), "fonts": embedded,
                  "text": text})

report = {"file": str(pdf_path), "pass": not errors, "errors": errors, "pages": pages}
report_dir = Path("tmp/pdfs")
report_dir.mkdir(parents=True, exist_ok=True)
(report_dir / "independent-inspection.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"pass": not errors, "errors": errors,
                  "pages": len(pages)}, ensure_ascii=False))
sys.exit(1 if errors else 0)

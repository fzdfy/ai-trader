"""研报全文提取、OCR 兜底、分块与本地向量生成。"""
from __future__ import annotations

import re
import hashlib
from io import BytesIO
from pathlib import Path
from typing import Any

OCR_MIN_TEXT_CHARS = 120
EXTRACTOR_VERSION = "pymupdf+ocr-v1"
EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"


def needs_ocr(text: str, min_chars: int = OCR_MIN_TEXT_CHARS) -> bool:
    return len(re.sub(r"\s+", "", text or "")) < min_chars


def chunk_pages(
    pages: list[dict[str, Any]],
    max_chars: int = 4000,
    overlap_chars: int = 500,
) -> list[dict[str, Any]]:
    """按字符预算切分文本，同时保留每个块的页码范围和顺序。"""
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")
    if overlap_chars < 0 or overlap_chars >= max_chars:
        raise ValueError("overlap_chars must be between 0 and max_chars")
    ordered = sorted(pages, key=lambda page: int(page.get("page") or 0))
    spans: list[tuple[int, int, int]] = []
    parts: list[str] = []
    cursor = 0
    for page in ordered:
        text = str(page.get("text") or "").strip()
        if not text:
            continue
        part = f"{text}\n"
        start = cursor
        parts.append(part)
        cursor += len(part)
        spans.append((start, cursor, int(page.get("page") or 0)))
    full_text = "".join(parts)
    if not full_text.strip() or not spans:
        return []

    def page_range(start: int, end: int) -> tuple[int, int]:
        touched = [page for span_start, span_end, page in spans if span_start < end and span_end > start]
        if not touched:
            return spans[0][2], spans[0][2]
        return min(touched), max(touched)

    chunks: list[dict[str, Any]] = []
    start = 0
    while start < len(full_text):
        end = min(start + max_chars, len(full_text))
        text = full_text[start:end].strip()
        if text:
            page_from, page_to = page_range(start, end)
            chunks.append(
                {
                    "chunk_index": len(chunks),
                    "page_from": page_from,
                    "page_to": page_to,
                    "text": text,
                }
            )
        if end >= len(full_text):
            break
        start = max(end - overlap_chars, start + 1)
    return chunks


def extract_pdf_pages(pdf_bytes: bytes, language: str = "chi_sim+eng") -> list[dict[str, Any]]:
    """优先提取 PDF 文本；文本密度不足时对页面做 OCR。"""
    try:
        import fitz  # type: ignore[import-not-found]
    except ImportError as error:
        raise RuntimeError("PyMuPDF is required for PDF extraction") from error

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[dict[str, Any]] = []
    try:
        for index, page in enumerate(document, start=1):
            text = page.get_text("text").strip()
            if needs_ocr(text):
                text = _ocr_page(page, language)
            pages.append({"page": index, "text": text})
    finally:
        document.close()
    return pages


def _ocr_page(page: Any, language: str) -> str:
    try:
        import fitz  # type: ignore[import-not-found]
        import pytesseract  # type: ignore[import-not-found]
        from PIL import Image  # type: ignore[import-not-found]
    except ImportError as error:
        raise RuntimeError("pytesseract and Pillow are required for OCR") from error
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    image = Image.open(BytesIO(pixmap.tobytes("png")))
    return pytesseract.image_to_string(image, lang=language).strip()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """使用本地 BGE-small-zh 生成 512 维向量。"""
    try:
        from fastembed import TextEmbedding  # type: ignore[import-not-found]
    except ImportError as error:
        raise RuntimeError("fastembed is required for report embeddings") from error
    model = TextEmbedding(model_name=EMBEDDING_MODEL)
    return [vector.tolist() for vector in model.embed(texts)]


def persist_report_pdf(
    pdf_bytes: bytes,
    source_id: str,
    publish_date: str,
    root: str | Path,
) -> dict[str, Any]:
    """按 SHA-256 写入共享研报卷，返回数据库所需元数据。"""
    if not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("response is not a valid PDF")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", source_id):
        raise ValueError("invalid report source id")
    year, month = (publish_date[:4], publish_date[5:7]) if re.match(r"^\d{4}-\d{2}", publish_date) else ("unknown", "unknown")
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    storage_key = f"eastmoney/{year}/{month}/{digest}.pdf"
    target = Path(root).resolve() / storage_key
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(pdf_bytes)
    return {
        "storage_key": storage_key,
        "sha256": digest,
        "file_size": len(pdf_bytes),
    }

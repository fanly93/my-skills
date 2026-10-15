#!/usr/bin/env python3
"""Verify an image-only PPTX against the generic handdrawn-image-ppt manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import posixpath
import struct
import sys
import zipfile
import zlib
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
EMU_PER_PX = 9525
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def error(message: str) -> None:
    raise ValueError(message)


def png_info(data: bytes, label: str) -> tuple[int, int]:
    if len(data) < 24 or data[:8] != PNG_SIGNATURE:
        error(f"{label}: expected a PNG")
    if data[12:16] != b"IHDR":
        error(f"{label}: PNG has no IHDR")
    width, height = struct.unpack(">II", data[16:24])
    if width == 0 or height == 0:
        error(f"{label}: zero PNG dimensions")
    position = 8
    ended = False
    data_chunks = []
    while position < len(data):
        if position + 12 > len(data):
            error(f"{label}: truncated PNG chunk")
        length = struct.unpack(">I", data[position:position + 4])[0]
        chunk_end = position + length + 12
        if chunk_end > len(data):
            error(f"{label}: truncated PNG chunk payload")
        chunk_type = data[position + 4:position + 8]
        payload_end = position + length + 8
        stored_crc = struct.unpack(">I", data[payload_end:payload_end + 4])[0]
        if zlib.crc32(data[position + 4:payload_end]) & 0xffffffff != stored_crc:
            error(f"{label}: PNG chunk CRC mismatch")
        if chunk_type == b"IDAT":
            data_chunks.append(data[position + 8:payload_end])
        if chunk_type == b"IEND":
            if length != 0 or chunk_end != len(data):
                error(f"{label}: invalid PNG IEND")
            ended = True
        position = chunk_end
    if not ended or not data_chunks:
        error(f"{label}: incomplete PNG")
    try:
        if not zlib.decompress(b"".join(data_chunks)):
            error(f"{label}: empty PNG pixel stream")
    except zlib.error:
        error(f"{label}: invalid PNG pixel stream")
    return width, height


def inside(root: Path, value: object, label: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        error(f"{label}: path is required")
    candidate = Path(value)
    if candidate.is_absolute():
        error(f"{label}: path must be relative to the manifest")
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        error(f"{label}: path escapes the manifest directory")
    return resolved


def load_manifest(path: Path) -> tuple[dict, list[dict]]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        error(f"Cannot read manifest: {exc}")
    if not isinstance(manifest, dict) or not isinstance(manifest.get("title"), str) or not manifest["title"].strip():
        error("Manifest title is required")
    size = manifest.get("slide_size", {"width": 1280, "height": 720})
    if not isinstance(size, dict) or not isinstance(size.get("width"), (int, float)) or not isinstance(size.get("height"), (int, float)):
        error("slide_size.width and slide_size.height must be numbers")
    width, height = float(size["width"]), float(size["height"])
    if not math.isfinite(width) or not math.isfinite(height) or width <= 0 or height <= 0:
        error("slide_size dimensions must be positive")
    raw_slides = manifest.get("slides")
    if not isinstance(raw_slides, list) or not raw_slides:
        error("Manifest slides must be a non-empty array")
    root = path.parent
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    seen_hashes: set[str] = set()
    slides: list[dict] = []
    for index, item in enumerate(raw_slides):
        if not isinstance(item, dict):
            error(f"slides[{index}] must be an object")
        sid, title = item.get("id"), item.get("title")
        if not isinstance(sid, str) or not sid.strip() or sid in seen_ids:
            error(f"Invalid or duplicate slide id at slides[{index}]")
        if not isinstance(title, str) or not title.strip():
            error(f"slides[{index}].title is required")
        seen_ids.add(sid)
        image_path = inside(root, item.get("image_file"), f"slides[{index}].image_file")
        path_key = str(image_path).lower()
        if path_key in seen_paths:
            error(f"Duplicate image_file: {item['image_file']}")
        seen_paths.add(path_key)
        try:
            image_data = image_path.read_bytes()
        except Exception as exc:
            error(f"Cannot read {image_path}: {exc}")
        iw, ih = png_info(image_data, str(image_path))
        if abs(iw / ih - width / height) > 0.005:
            error(f"{image_path}: aspect ratio does not match slide_size")
        digest = hashlib.sha256(image_data).hexdigest()
        if digest in seen_hashes:
            error(f"Duplicate image content: {item['image_file']}")
        seen_hashes.add(digest)
        prompt_file = item.get("prompt_file")
        if prompt_file is not None:
            prompt_path = inside(root, prompt_file, f"slides[{index}].prompt_file")
            if not prompt_path.is_file():
                error(f"Missing prompt_file: {prompt_file}")
        notes = item.get("notes", "")
        sources = item.get("sources", [])
        insertion = item.get("insert_after_original")
        if not isinstance(notes, str):
            error(f"slides[{index}].notes must be a string")
        if not isinstance(sources, list) or any(not isinstance(source, str) for source in sources):
            error(f"slides[{index}].sources must be an array of strings")
        if insertion is not None and (not isinstance(insertion, int) or isinstance(insertion, bool) or insertion < 0):
            error(f"slides[{index}].insert_after_original must be a non-negative integer or null")
        slides.append({"id": sid, "title": title, "image_file": item["image_file"], "image_path": image_path, "sha256": digest, "prompt_file": prompt_file, "notes": notes, "sources": sources, "insert_after_original": insertion})
    return {"title": manifest["title"], "slide_size": {"width": width, "height": height}}, slides


def xml_bytes(zf: zipfile.ZipFile, name: str) -> ET.Element:
    try:
        return ET.fromstring(zf.read(name))
    except KeyError:
        error(f"Missing package member: {name}")
    except ET.ParseError as exc:
        error(f"Invalid XML in {name}: {exc}")


def relationship_target(zf: zipfile.ZipFile, rels_name: str, rel_id: str) -> str:
    rels = xml_bytes(zf, rels_name)
    for rel in rels.findall("pr:Relationship", NS):
        if rel.attrib.get("Id") == rel_id:
            return rel.attrib["Target"]
    error(f"Relationship {rel_id} is missing from {rels_name}")


def member_target(owner: str, target: str) -> str:
    target = target.replace("\\", "/")
    return target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(owner), target))


def relationship_of_type(zf: zipfile.ZipFile, rels_name: str, suffix: str) -> str:
    rels = xml_bytes(zf, rels_name)
    matches = [rel.attrib.get("Target") for rel in rels.findall("pr:Relationship", NS) if rel.attrib.get("Type", "").endswith("/" + suffix)]
    if len(matches) != 1:
        error(f"Expected one {suffix} relationship in {rels_name}")
    return matches[0]


def verify(manifest_path: Path, pptx_path: Path, report_path: Path | None) -> dict:
    manifest, slides = load_manifest(manifest_path)
    if not pptx_path.is_file():
        error(f"PPTX does not exist: {pptx_path}")
    details = []
    with zipfile.ZipFile(pptx_path) as zf:
        presentation = xml_bytes(zf, "ppt/presentation.xml")
        size = presentation.find("p:sldSz", NS)
        expected_w = round(manifest["slide_size"]["width"] * EMU_PER_PX)
        expected_h = round(manifest["slide_size"]["height"] * EMU_PER_PX)
        if size is None or int(size.attrib.get("cx", 0)) != expected_w or int(size.attrib.get("cy", 0)) != expected_h:
            error("PPTX slide size does not match manifest")
        slide_ids = presentation.findall("p:sldIdLst/p:sldId", NS)
        if len(slide_ids) != len(slides):
            error(f"Expected {len(slides)} slides, found {len(slide_ids)}")
        names = set(zf.namelist())
        for index, expected in enumerate(slides, 1):
            slide_rel_id = slide_ids[index - 1].attrib.get(f"{{{NS['r']}}}id")
            slide_target = relationship_target(zf, "ppt/_rels/presentation.xml.rels", slide_rel_id)
            slide_name = member_target("ppt/presentation.xml", slide_target)
            slide = xml_bytes(zf, slide_name)
            pictures = slide.findall(".//p:pic", NS)
            shapes = slide.findall(".//p:sp", NS)
            if len(pictures) != 1 or shapes:
                error(f"{slide_name}: expected one full-frame image and no native shapes")
            xfrm = pictures[0].find("p:spPr/a:xfrm", NS)
            off = xfrm.find("a:off", NS) if xfrm is not None else None
            ext = xfrm.find("a:ext", NS) if xfrm is not None else None
            if off is None or ext is None or off.attrib.get("x") != "0" or off.attrib.get("y") != "0" or int(ext.attrib.get("cx", 0)) != expected_w or int(ext.attrib.get("cy", 0)) != expected_h:
                error(f"{slide_name}: image does not fill the slide")
            blip = pictures[0].find("p:blipFill/a:blip", NS)
            embed = blip.attrib.get(f"{{{NS['r']}}}embed") if blip is not None else None
            if not embed:
                error(f"{slide_name}: image relationship is missing")
            rels_name = posixpath.join(posixpath.dirname(slide_name), "_rels", posixpath.basename(slide_name) + ".rels")
            target = relationship_target(zf, rels_name, embed).replace("\\", "/")
            media_path = member_target(slide_name, target)
            if media_path not in names or not media_path.lower().endswith(".png"):
                error(f"{slide_name}: embedded image is not a PNG")
            image_data = zf.read(media_path)
            if hashlib.sha256(image_data).hexdigest() != expected["sha256"]:
                error(f"{slide_name}: embedded image bytes differ from manifest")
            png_info(image_data, media_path)
            notes_name = member_target(slide_name, relationship_of_type(zf, rels_name, "notesSlide"))
            notes = xml_bytes(zf, notes_name)
            notes_text = "\n".join(node.text or "" for node in notes.findall(".//a:t", NS))
            if f"{expected['id']}: {expected['title']}" not in notes_text:
                error(f"{notes_name}: slide id/title are missing from speaker notes")
            if expected["notes"] and expected["notes"] not in notes_text:
                error(f"{notes_name}: manifest notes are missing")
            if any(source not in notes_text for source in expected["sources"]):
                error(f"{notes_name}: manifest source is missing")
            if expected["insert_after_original"] is not None and f"Suggested insertion after original slide {expected['insert_after_original']}." not in notes_text:
                error(f"{notes_name}: insertion note is missing")
            details.append({"slide": index, "id": expected["id"], "image_bytes_preserved": True, "single_full_frame_image": True, "notes_present": True})
    report = {"ok": True, "pptx": str(pptx_path), "slide_count": len(slides), "slide_size": manifest["slide_size"], "slides": details}
    if report_path:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a handdrawn-image-ppt image-only PPTX")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--pptx", required=True, type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    pptx_path = args.pptx if args.pptx.is_absolute() else manifest_path.parent / args.pptx
    report_path = args.report if args.report is None or args.report.is_absolute() else manifest_path.parent / args.report
    try:
        report = verify(manifest_path, pptx_path.resolve(), report_path.resolve() if report_path else None)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"verify_delivery: ERROR: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

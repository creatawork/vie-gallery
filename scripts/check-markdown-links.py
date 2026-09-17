#!/usr/bin/env python3
"""Check relative Markdown links in the current project documentation."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"!?(?:\[[^\]]*\])\(([^)]+)\)")
SCANNED_FILES = [
    ROOT / "README.md",
    ROOT / "CONTRIBUTING.md",
    *sorted((ROOT / "docs").rglob("*.md")),
]


def iter_links(path: Path):
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        for match in MARKDOWN_LINK.finditer(line):
            target = match.group(1).strip().strip("<>")
            if target:
                yield line_number, target


def is_external(target: str) -> bool:
    return target.startswith(("http://", "https://", "mailto:", "#"))


def main() -> int:
    missing: list[tuple[Path, int, str]] = []
    checked = 0

    for path in SCANNED_FILES:
        if not path.is_file():
            continue
        for line_number, raw_target in iter_links(path):
            target = raw_target.split("#", 1)[0].strip()
            if not target or is_external(raw_target):
                continue
            checked += 1
            resolved = (path.parent / target).resolve()
            if not resolved.is_file():
                missing.append((path.relative_to(ROOT), line_number, raw_target))

    if missing:
        print(f"Found {len(missing)} missing relative Markdown link(s):", file=sys.stderr)
        for path, line_number, target in missing:
            print(f"  {path}:{line_number}: {target}", file=sys.stderr)
        return 1

    print(f"Checked {checked} relative Markdown link(s); all targets exist.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

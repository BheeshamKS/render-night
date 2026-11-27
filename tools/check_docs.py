#!/usr/bin/env python3
"""Enforce the documentation evidence rules.

Fails when a tracked markdown doc:
  1. contains an absolute host path (file:///mnt, /mnt/, /home/<user>, /Users/<user>, C:\\Users\\),
  2. links to a relative path that does not exist,
  3. marks an item VERIFIED without an evidence link that resolves,
  4. marks an item PASS at all (use VERIFIED / LOCAL-ONLY / UNVERIFIED).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ABS_RE = re.compile(
    r"file:///(?:mnt|home|Users)"
    r"|/mnt/"
    r"|/home/[\w.-]+/"
    r"|[A-Za-z]:\\Users"
    r"|/Users/[\w.-]+/"
)
LINK_RE = re.compile(r"\]\(([^)]+)\)")
VERIFIED_ROW_RE = re.compile(r"\|\s*VERIFIED\s*\|")
PASS_ROW_RE = re.compile(r"\|\s*PASS\s*\|")
SKIP_PREFIXES = ("http://", "https://", "mailto:", "#")


def doc_files() -> list[Path]:
    files = [p for p in (ROOT / "docs").rglob("*.md")]
    files = [
        p
        for p in files
        if "superpowers" not in p.relative_to(ROOT).parts
        and "evidence" not in p.relative_to(ROOT).parts
    ]
    readme = ROOT / "README.md"
    if readme.exists():
        files.append(readme)
    return sorted(set(files))


def resolves(doc: Path, target: str) -> bool:
    target = target.split("#", 1)[0].split("?", 1)[0].strip("<>")
    if not target:
        return True
    return (ROOT / target).exists() or (doc.parent / target).exists()


def main() -> int:
    failures: list[str] = []
    files = doc_files()

    for doc in files:
        rel = doc.relative_to(ROOT).as_posix()
        text = doc.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()

        for number, line in enumerate(lines, start=1):
            match = ABS_RE.search(line)
            if match:
                failures.append(f"{rel}:{number} absolute host path: {match.group(0)}")

        for number, line in enumerate(lines, start=1):
            for link in LINK_RE.findall(line):
                link = link.strip()
                if not link or link.startswith(SKIP_PREFIXES) or "://" in link:
                    continue
                if not resolves(doc, link):
                    failures.append(f"{rel}:{number} broken relative link: {link}")

        for number, line in enumerate(lines, start=1):
            if PASS_ROW_RE.search(line):
                failures.append(f"{rel}:{number} uses PASS; use VERIFIED / LOCAL-ONLY / UNVERIFIED")
            elif VERIFIED_ROW_RE.search(line):
                links = [l.strip() for l in LINK_RE.findall(line)]
                if not links:
                    failures.append(f"{rel}:{number} VERIFIED without an evidence link")
                    continue
                evidence = [
                    l
                    for l in links
                    if l.startswith(("http://", "https://")) or resolves(doc, l)
                ]
                if not evidence:
                    failures.append(
                        f"{rel}:{number} VERIFIED evidence does not resolve: {links[0]}"
                    )

    if failures:
        for failure in failures:
            print(f"check-docs: {failure}", file=sys.stderr)
        print(f"\ncheck-docs: FAILED ({len(failures)} problem(s))", file=sys.stderr)
        return 1

    print(f"check-docs: OK ({len(files)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

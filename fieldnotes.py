"""Tiny helpers for keeping plain-text field notes.

A field note line looks like:

    2026-08-18 | site-A | Soil moisture higher than last visit.

Date, site tag, and free-text observation, separated by pipes.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass
class Entry:
    day: date
    site: str
    observation: str


def parse_entry(line: str) -> Entry:
    """Parse one 'YYYY-MM-DD | site | observation' line into an Entry."""
    parts = [part.strip() for part in line.split("|", 2)]
    if len(parts) != 3 or not all(parts):
        raise ValueError(f"malformed field note: {line!r}")
    day_text, site, observation = parts
    return Entry(day=date.fromisoformat(day_text), site=site, observation=observation)


def format_entry(entry: Entry) -> str:
    """Render an Entry back into its one-line text form."""
    return f"{entry.day.isoformat()} | {entry.site} | {entry.observation}"


def entries_for_site(lines: list[str], site: str) -> list[Entry]:
    """Return parsed entries matching a site tag, skipping blank lines."""
    entries = []
    for line in lines:
        if not line.strip():
            continue
        entry = parse_entry(line)
        if entry.site == site:
            entries.append(entry)
    return entries


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="fieldnotes",
        description="Show entries from a plain-text field notes file.",
    )
    parser.add_argument("notes_file", type=Path, help="path to the notes file")
    parser.add_argument("--site", help="only show entries for this site tag")
    args = parser.parse_args(argv)

    try:
        lines = args.notes_file.read_text(encoding="utf-8-sig").splitlines()
    except OSError as error:
        sys.exit(f"error: cannot read {args.notes_file}: {error}")

    try:
        if args.site is not None:
            entries = entries_for_site(lines, args.site)
        else:
            entries = [parse_entry(line) for line in lines if line.strip()]
    except ValueError as error:
        sys.exit(f"error: {error}")

    for entry in entries:
        print(format_entry(entry))


if __name__ == "__main__":
    main()

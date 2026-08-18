"""Tiny helpers for keeping plain-text field notes.

A field note line looks like:

    2026-08-18 | site-A | Soil moisture higher than last visit.

Date, site tag, and free-text observation, separated by pipes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


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

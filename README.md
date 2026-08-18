# PotatoLink Fieldwork

Small helpers for keeping plain-text field notes.

A note is one line per observation:

```
2026-08-18 | site-A | Soil moisture higher than last visit.
```

## Usage

Show every entry in a notes file, or filter to one site:

```
python fieldnotes.py notes.txt
python fieldnotes.py notes.txt --site site-A
```

Or use it as a library:

```python
from fieldnotes import parse_entry, entries_for_site

entry = parse_entry("2026-08-18 | site-A | Soil moisture higher than last visit.")
print(entry.site)  # site-A
```

## Development

No dependencies beyond Python 3.10+. Run the tests with:

```
python -m unittest
```

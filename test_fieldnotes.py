import io
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path

from fieldnotes import Entry, entries_for_site, format_entry, main, parse_entry


class ParseEntryTests(unittest.TestCase):
    def test_parses_well_formed_line(self):
        entry = parse_entry("2026-08-18 | site-A | Soil moisture higher than last visit.")
        self.assertEqual(entry.day, date(2026, 8, 18))
        self.assertEqual(entry.site, "site-A")
        self.assertEqual(entry.observation, "Soil moisture higher than last visit.")

    def test_strips_whitespace_around_fields(self):
        entry = parse_entry("  2026-08-18|site-B|  Frost overnight.  ")
        self.assertEqual(entry.site, "site-B")
        self.assertEqual(entry.observation, "Frost overnight.")

    def test_observation_may_contain_pipes(self):
        entry = parse_entry("2026-08-18 | site-A | Reading: 4 | retest tomorrow")
        self.assertEqual(entry.observation, "Reading: 4 | retest tomorrow")

    def test_rejects_missing_fields(self):
        with self.assertRaises(ValueError):
            parse_entry("2026-08-18 | site-A")

    def test_rejects_empty_field(self):
        with self.assertRaises(ValueError):
            parse_entry("2026-08-18 |  | Something happened.")

    def test_rejects_bad_date(self):
        with self.assertRaises(ValueError):
            parse_entry("18/08/2026 | site-A | Something happened.")


class FormatEntryTests(unittest.TestCase):
    def test_round_trips_through_parse(self):
        line = "2026-08-18 | site-C | Drainage channel cleared."
        self.assertEqual(format_entry(parse_entry(line)), line)

    def test_formats_entry(self):
        entry = Entry(day=date(2026, 1, 5), site="site-A", observation="First visit.")
        self.assertEqual(format_entry(entry), "2026-01-05 | site-A | First visit.")


class EntriesForSiteTests(unittest.TestCase):
    LINES = [
        "2026-08-17 | site-A | Rows planted.",
        "",
        "2026-08-18 | site-B | Irrigation line repaired.",
        "2026-08-18 | site-A | Soil moisture higher than last visit.",
    ]

    def test_filters_by_site_and_skips_blank_lines(self):
        entries = entries_for_site(self.LINES, "site-A")
        self.assertEqual(len(entries), 2)
        self.assertTrue(all(e.site == "site-A" for e in entries))

    def test_no_matches_returns_empty_list(self):
        self.assertEqual(entries_for_site(self.LINES, "site-Z"), [])


class MainTests(unittest.TestCase):
    NOTES = (
        "2026-08-17 | site-A | Rows planted.\n"
        "\n"
        "2026-08-18 | site-B | Irrigation line repaired.\n"
        "2026-08-18 | site-A | Soil moisture higher than last visit.\n"
    )

    def write_notes(self, content):
        handle = tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        )
        self.addCleanup(Path(handle.name).unlink)
        handle.write(content)
        handle.close()
        return handle.name

    def run_main(self, argv):
        output = io.StringIO()
        with redirect_stdout(output):
            main(argv)
        return output.getvalue()

    def test_prints_all_entries(self):
        path = self.write_notes(self.NOTES)
        output = self.run_main([path])
        self.assertEqual(len(output.splitlines()), 3)
        self.assertIn("Irrigation line repaired.", output)

    def test_site_flag_filters_entries(self):
        path = self.write_notes(self.NOTES)
        output = self.run_main([path, "--site", "site-A"])
        self.assertEqual(
            output.splitlines(),
            [
                "2026-08-17 | site-A | Rows planted.",
                "2026-08-18 | site-A | Soil moisture higher than last visit.",
            ],
        )

    def test_handles_utf8_bom(self):
        bom = chr(0xFEFF)
        path = self.write_notes(bom + "2026-08-17 | site-A | Rows planted.\n")
        output = self.run_main([path])
        self.assertEqual(output.splitlines(), ["2026-08-17 | site-A | Rows planted."])

    def test_malformed_file_exits_with_error(self):
        path = self.write_notes("not a valid entry\n")
        with self.assertRaises(SystemExit):
            self.run_main([path])

    def test_missing_file_exits_with_error(self):
        with self.assertRaises(SystemExit):
            self.run_main(["no-such-file.txt"])


if __name__ == "__main__":
    unittest.main()

"""GEDCOM 5.5.1 export adapter."""

from __future__ import annotations

import argparse
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from data_store import load_family

GEDCOM_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
GENDER_MAP = {"M": "M", "F": "F", "NB": "U", "U": "U"}


def _escape(value: str) -> str:
    return str(value).replace("@", "@@").replace("\n", " ")


def _gedcom_date(date: str | None) -> str | None:
    """Convert our YYYY, YYYY-MM, or YYYY-MM-DD format to a GEDCOM DATE value."""
    if not date or date.lower() == "unknown":
        return None
    match = re.fullmatch(r"(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?", date)
    if not match:
        return None
    year, month, day = match.groups()
    if day and month:
        return f"{int(day)} {GEDCOM_MONTHS[int(month) - 1]} {year}"
    if month:
        return f"{GEDCOM_MONTHS[int(month) - 1]} {year}"
    return year


def _gedcom_id(prefix: str, person_id: str) -> str:
    return f"@{prefix}{person_id.upper()}@"


class GedcomWriter:
    def __init__(self) -> None:
        self.lines: list[str] = []

    def add(self, level: int, tag: str, value: str = "") -> None:
        self.lines.append(f"{level} {tag} {value}".rstrip() if value else f"{level} {tag}")

    def render(self) -> str:
        return "\n".join(self.lines) + "\n"


def build_gedcom(family: dict[str, Any]) -> str:
    writer = GedcomWriter()
    writer.add(0, "HEAD")
    writer.add(1, "SOUR", "FamilyVault")
    writer.add(1, "GEDC")
    writer.add(2, "VERS", "5.5.1")
    writer.add(2, "FORM", "LINEAGE-LINKED")
    writer.add(1, "CHAR", "UTF-8")
    writer.add(1, "DATE", datetime.now(UTC).strftime("%d %b %Y").upper())

    child_unions: dict[str, list[dict[str, Any]]] = {}
    partner_unions: dict[str, list[dict[str, Any]]] = {}
    for union in family.get("unions", []):
        for child in union.get("children", []):
            child_unions.setdefault(child["individual_id"], []).append(union)
        for partner in union.get("partners", []):
            partner_unions.setdefault(partner["individual_id"], []).append(union)

    for person in family.get("individuals", []):
        person_id = person["id"]
        writer.add(0, _gedcom_id("I", person_id), "INDI")
        name = " ".join(part for part in (person.get("first_name"), person.get("middle_name")) if part)
        writer.add(1, "NAME", _escape(f"{name} /{person.get('last_name', '')}/ "))
        writer.add(1, "SEX", GENDER_MAP.get(person.get("gender", "U"), "U"))

        birth = person.get("vital_events", {}).get("birth", {})
        birth_date = _gedcom_date(birth.get("date"))
        if birth_date or birth.get("location"):
            writer.add(1, "BIRT")
            if birth_date:
                writer.add(2, "DATE", birth_date)
            if birth.get("location"):
                writer.add(2, "PLAC", _escape(birth["location"]))

        death = person.get("vital_events", {}).get("death", {})
        death_date = _gedcom_date(death.get("date"))
        if death_date or death.get("location"):
            writer.add(1, "DEAT")
            if death_date:
                writer.add(2, "DATE", death_date)
            if death.get("location"):
                writer.add(2, "PLAC", _escape(death["location"]))

        cultural = person.get("cultural_metadata", {})
        if cultural.get("native_village"):
            writer.add(1, "NOTE", _escape(f"Native village: {cultural['native_village']}"))
        if cultural.get("gotra_clan"):
            writer.add(1, "NOTE", _escape(f"Gotra/clan: {cultural['gotra_clan']}"))
        if cultural.get("community_caste"):
            writer.add(1, "NOTE", _escape(f"Community: {cultural['community_caste']}"))
        for entry in person.get("migration_history", []):
            note = f"Migration {entry.get('year', '')}: {entry.get('from', '')} -> {entry.get('to', '')}"
            if entry.get("reason"):
                note += f" ({entry['reason']})"
            writer.add(1, "NOTE", _escape(note))
        if person.get("biographical_notes"):
            writer.add(1, "NOTE", _escape(person["biographical_notes"]))
        for tag in person.get("tags", []):
            writer.add(1, "NOTE", _escape(f"Tag: {tag}"))
        if person.get("is_private"):
            writer.add(1, "RESN", "privacy")

        for union in partner_unions.get(person_id, []):
            writer.add(1, "FAMS", _gedcom_id("F", union["id"]))
        for union in child_unions.get(person_id, []):
            writer.add(1, "FAMC", _gedcom_id("F", union["id"]))

    genders = {person["id"]: person.get("gender") for person in family.get("individuals", [])}
    for union in family.get("unions", []):
        writer.add(0, _gedcom_id("F", union["id"]), "FAM")
        # GEDCOM 5.5.1 only has HUSB/WIFE slots; assign by gender where known,
        # then fill any remaining slot so every partner is still recorded.
        remaining_tags = ["HUSB", "WIFE"]
        for entry in union.get("partners", []):
            gender = genders.get(entry["individual_id"])
            tag = "HUSB" if gender == "M" else "WIFE" if gender == "F" else None
            if tag in remaining_tags:
                remaining_tags.remove(tag)
            elif remaining_tags:
                tag = remaining_tags.pop(0)
            else:
                tag = "HUSB"  # GEDCOM has no third partner slot; still record the link.
            writer.add(1, tag, _gedcom_id("I", entry["individual_id"]))
        for child in union.get("children", []):
            writer.add(1, "CHIL", _gedcom_id("I", child["individual_id"]))
        marriage_date = _gedcom_date(union.get("start_date"))
        if union.get("union_type") == "marriage" or marriage_date:
            writer.add(1, "MARR")
            if marriage_date:
                writer.add(2, "DATE", marriage_date)

    writer.add(0, "TRLR")
    return writer.render()


def export_gedcom(destination: Path | None = None) -> str:
    """Build a GEDCOM document from the current family ledger and optionally write it to disk."""
    family = load_family()
    content = build_gedcom(family)
    if destination is not None:
        destination.write_text(content, encoding="utf-8", newline="\n")
    return content


def main() -> None:
    parser = argparse.ArgumentParser(description="Export family.yaml as a GEDCOM 5.5.1 file for Gramps or other tools.")
    parser.add_argument("output", nargs="?", type=Path, default=Path("family.ged"), help="Output .ged file path.")
    args = parser.parse_args()
    export_gedcom(args.output)
    print(f"Wrote GEDCOM export to {args.output}")


if __name__ == "__main__":
    main()



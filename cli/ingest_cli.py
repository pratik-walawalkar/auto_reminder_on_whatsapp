from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Callable

import gedcom
from data_store import DataValidationError, generate_person_id, load_family, save_family


def add_person(payload: dict[str, Any], parent_union_id: str | None = None) -> str:
    family = load_family()
    people = family["individuals"]
    existing_ids = {person["id"] for person in people}
    first_name = str(payload.get("first_name", "")).strip()
    last_name = str(payload.get("last_name", "")).strip()
    gender = str(payload.get("gender", "U")).strip()
    birth_date = str(payload.get("birth_date", "unknown")).strip()
    if not first_name or not last_name:
        raise DataValidationError("first_name and last_name are required.")
    if gender not in {"M", "F", "NB", "U"}:
        raise DataValidationError("gender must be M, F, NB, or U.")
    requested_id = str(payload.get("id", "")).strip().lower()
    if requested_id:
        if requested_id in existing_ids:
            raise DataValidationError(f"Individual ID already exists: {requested_id}.")
        person_id = requested_id
    else:
        person_id = generate_person_id(first_name, last_name, birth_date, existing_ids)
    person: dict[str, Any] = {
        "id": person_id,
        "first_name": first_name,
        "last_name": last_name,
        "gender": gender,
        "vital_events": {"birth": {"date": birth_date, "location": str(payload.get("birth_location", "")).strip()}},
    }
    for field in ("middle_name", "generation", "biographical_notes"):
        value = str(payload.get(field, "")).strip()
        if value:
            person[field] = value
    people.append(person)
    if parent_union_id:
        if not isinstance(parent_union_id, str) or not parent_union_id.strip():
            raise DataValidationError("parent_union_id must be a non-empty string.")
        parent_union_id = parent_union_id.strip()
        union = next((item for item in family["unions"] if item["id"] == parent_union_id), None)
        if union is None:
            raise DataValidationError(f"Unknown parent union: {parent_union_id}.")
        union.setdefault("children", []).append({"individual_id": person_id, "link_type": "biological"})
    save_family(family)
    return person_id


def run(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Validate or safely import structured family records.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate", help="Validate family.yaml without modifying it.")
    add = commands.add_parser("add", help="Add one person from a JSON object.")
    add.add_argument("payload", help="JSON object containing first_name, last_name, gender, birth_date, and optional fields.")
    add.add_argument("--parent-union", help="Optional union ID to register the person as a biological child.")
    export_gedcom_command = commands.add_parser("export-gedcom", help="Export family.yaml as a GEDCOM file for Gramps or other tools.")
    export_gedcom_command.add_argument("output", nargs="?", type=Path, default=Path("family.ged"))
    args = parser.parse_args(argv)
    if args.command == "validate":
        family = load_family()
        print(f"Valid family ledger: {len(family['individuals'])} people, {len(family['unions'])} family units.")
        return
    if args.command == "export-gedcom":
        gedcom.export_gedcom(args.output)
        print(f"Wrote GEDCOM export to {args.output}")
        return
    try:
        payload = json.loads(args.payload)
    except json.JSONDecodeError as error:
        parser.error(f"payload must be valid JSON: {error.msg}")
    if not isinstance(payload, dict):
        parser.error("payload must be a JSON object.")
    person_id = add_person(payload, args.parent_union)
    print(f"Added {person_id} to family.yaml.")



from __future__ import annotations

import re
from typing import Any

DATE_PATTERN = re.compile(r"^(?:\d{4}|\d{4}-\d{2}|\d{4}-\d{2}-\d{2}|unknown)$", re.IGNORECASE)
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
TAG_PATTERN = re.compile(r"^[A-Za-z0-9 _-]{1,30}$")
MAX_TAGS_PER_PERSON = 12


class DataValidationError(ValueError):
    pass


def validate_family(data: Any) -> None:
    if not isinstance(data, dict):
        raise DataValidationError("Family data must be a mapping.")
    if data.get("version") != "3.0":
        raise DataValidationError("Family data must use schema version 3.0.")

    people = data.get("individuals")
    unions = data.get("unions")
    if not isinstance(people, list) or not isinstance(unions, list):
        raise DataValidationError("individuals and unions must be lists.")

    people_by_id: dict[str, dict[str, Any]] = {}
    for person in people:
        if not isinstance(person, dict):
            raise DataValidationError("Each individual must be a mapping.")
        person_id = person.get("id")
        if not isinstance(person_id, str) or not ID_PATTERN.fullmatch(person_id):
            raise DataValidationError("Individual IDs must contain lowercase letters, digits, hyphens, or underscores.")
        if person_id in people_by_id:
            raise DataValidationError(f"Duplicate individual ID: {person_id}.")
        for field in ("first_name", "last_name"):
            if not isinstance(person.get(field), str) or not person[field].strip():
                raise DataValidationError(f"{person_id} requires a {field}.")
        if person.get("gender") not in {"M", "F", "NB", "U"}:
            raise DataValidationError(f"{person_id} has an invalid gender.")
        birth = person.get("vital_events", {}).get("birth", {})
        if not isinstance(birth, dict) or not isinstance(birth.get("date"), str) or not DATE_PATTERN.fullmatch(birth["date"]):
            raise DataValidationError(f"{person_id} requires a valid birth date or 'unknown'.")
        if "is_private" in person and not isinstance(person["is_private"], bool):
            raise DataValidationError(f"{person_id} has an invalid is_private flag.")
        position = person.get("position")
        if position is not None:
            if not isinstance(position, dict) or set(position) != {"x", "y"} or any(not isinstance(position[key], (int, float)) for key in ("x", "y")):
                raise DataValidationError(f"{person_id} has an invalid position.")
            if any(abs(position[key]) > 1000000 for key in ("x", "y")):
                raise DataValidationError(f"{person_id} has an out-of-range position.")
        tags = person.get("tags", [])
        if not isinstance(tags, list) or len(tags) > MAX_TAGS_PER_PERSON:
            raise DataValidationError(f"{person_id} has an invalid tags list.")
        for tag in tags:
            if not isinstance(tag, str) or not TAG_PATTERN.fullmatch(tag):
                raise DataValidationError(f"{person_id} has an invalid tag: {tag!r}.")
        if len({tag.strip().lower() for tag in tags}) != len(tags):
            raise DataValidationError(f"{person_id} has duplicate tags.")
        people_by_id[person_id] = person

    union_ids: set[str] = set()
    biological_parent_unions: dict[str, int] = {}
    graph: dict[str, set[str]] = {person_id: set() for person_id in people_by_id}
    for union in unions:
        if not isinstance(union, dict):
            raise DataValidationError("Each union must be a mapping.")
        union_id = union.get("id")
        if not isinstance(union_id, str) or not ID_PATTERN.fullmatch(union_id) or union_id in union_ids:
            raise DataValidationError("Union IDs must be unique and valid.")
        union_ids.add(union_id)
        partners = union.get("partners")
        if not isinstance(partners, list) or not 1 <= len(partners) <= 2:
            raise DataValidationError(f"{union_id} must have one or two partners.")
        partner_ids = [entry.get("individual_id") for entry in partners if isinstance(entry, dict)]
        if len(partner_ids) != len(partners) or len(set(partner_ids)) != len(partner_ids):
            raise DataValidationError(f"{union_id} has invalid or duplicate partners.")
        if any(person_id not in people_by_id for person_id in partner_ids):
            raise DataValidationError(f"{union_id} references an unknown partner.")
        if union.get("union_type", "unknown") not in {"marriage", "partnership", "unknown"}:
            raise DataValidationError(f"{union_id} has an invalid union type.")
        for child in union.get("children", []):
            if not isinstance(child, dict) or child.get("individual_id") not in people_by_id:
                raise DataValidationError(f"{union_id} references an unknown child.")
            child_id = child["individual_id"]
            if child_id in partner_ids:
                raise DataValidationError(f"{union_id} cannot contain a partner as a child.")
            link_type = child.get("link_type")
            if link_type not in {"biological", "adoptive", "step", "foster"}:
                raise DataValidationError(f"{union_id} has an invalid child link type.")
            if link_type == "biological":
                biological_parent_unions[child_id] = biological_parent_unions.get(child_id, 0) + 1
                if biological_parent_unions[child_id] > 1:
                    raise DataValidationError(f"{child_id} has more than one biological parent union.")
            for parent_id in partner_ids:
                graph[parent_id].add(child_id)

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(person_id: str) -> None:
        if person_id in visiting:
            raise DataValidationError("Parent-child relationships contain a cycle.")
        if person_id not in visited:
            visiting.add(person_id)
            for child_id in graph[person_id]:
                visit(child_id)
            visiting.remove(person_id)
            visited.add(person_id)

    for person_id in graph:
        visit(person_id)



from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
import os
import re
import tempfile
from threading import RLock
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent
FAMILY_FILE = ROOT / "family.yaml"
DATE_PATTERN = re.compile(r"^(?:\d{4}|\d{4}-\d{2}|\d{4}-\d{2}-\d{2}|unknown)$", re.IGNORECASE)
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
TAG_PATTERN = re.compile(r"^[A-Za-z0-9 _-]{1,30}$")
MAX_TAGS_PER_PERSON = 12
LOCK = RLock()


class DataValidationError(ValueError):
    pass


def load_family() -> dict[str, Any]:
    with LOCK, FAMILY_FILE.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    validate_family(data)
    return data


def save_family(data: dict[str, Any]) -> None:
    validate_family(data)
    data = deepcopy(data)
    data.setdefault("metadata", {})["last_updated"] = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    with LOCK:
        descriptor, temp_path = tempfile.mkstemp(prefix="family-", suffix=".yaml", dir=ROOT, text=True)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                yaml.safe_dump(data, handle, allow_unicode=True, default_flow_style=False, sort_keys=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, FAMILY_FILE)
        except Exception:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
            raise


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


def birth_year(person: dict[str, Any]) -> int | None:
    value = person.get("vital_events", {}).get("birth", {}).get("date", "")
    match = re.match(r"^(\d{4})", str(value))
    return int(match.group(1)) if match else None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def generate_union_id(seed_ids: list[str], existing_ids: set[str]) -> str:
    """Derive a stable union ID from the people it links, with a numeric suffix on collision."""
    base = "_".join(part for part in (_slug(seed_id) for seed_id in seed_ids) if part)
    base = f"union_{base}" if base else "union"
    if base not in existing_ids:
        return base
    suffix = 2
    candidate = f"{base}_{suffix}"
    while candidate in existing_ids:
        suffix += 1
        candidate = f"{base}_{suffix}"
    return candidate


def generate_person_id(first_name: str, last_name: str, birth_date: str | None, existing_ids: set[str]) -> str:
    """Derive a stable person ID from name, falling back to birth year then a numeric suffix on collision."""
    base = "_".join(part for part in (_slug(first_name), _slug(last_name)) if part) or "person"
    if base not in existing_ids:
        return base
    year_match = re.match(r"^(\d{4})", birth_date or "")
    candidate = f"{base}_{year_match.group(1)}" if year_match else base
    if candidate not in existing_ids:
        return candidate
    suffix = 2
    unique_candidate = f"{candidate}_{suffix}"
    while unique_candidate in existing_ids:
        suffix += 1
        unique_candidate = f"{candidate}_{suffix}"
    return unique_candidate


def detach_relationships(family: dict[str, Any], person_id: str) -> None:
    """Remove a person from every union's partner/child list, dropping unions left with no partners."""
    remaining_unions = []
    for union in family.get("unions", []):
        union["partners"] = [entry for entry in union.get("partners", []) if entry.get("individual_id") != person_id]
        union["children"] = [child for child in union.get("children", []) if child.get("individual_id") != person_id]
        if union["partners"]:
            remaining_unions.append(union)
    family["unions"] = remaining_unions


def resolve_relationship(family: dict[str, Any], person_id: str, relationship: dict[str, Any]) -> None:
    """Rewire person_id's place in the family graph per a {"type", "relative_id"} descriptor.

    "child_of" and "new_root" only touch the person's biological parent-child link (at most one
    allowed), so re-pointing a parent never disturbs the person's own marriages or children.
    "parent_of" and "spouse_of" are additive: a person may have several unions over a lifetime.
    """
    kind = relationship.get("type")
    if kind in {None, "", "keep"}:
        return
    unions = family.setdefault("unions", [])
    if kind == "new_root":
        for union in unions:
            union["children"] = [child for child in union.get("children", []) if child.get("individual_id") != person_id]
        return

    people_ids = {person["id"] for person in family.get("individuals", [])}
    relative_id = relationship.get("relative_id")
    if not isinstance(relative_id, str) or relative_id not in people_ids or relative_id == person_id:
        raise DataValidationError("Choose a valid, existing family member to link to.")
    union_ids = {union["id"] for union in unions}

    if kind == "child_of":
        for union in unions:
            union["children"] = [child for child in union.get("children", []) if child.get("individual_id") != person_id]
        co_parent_id = relationship.get("co_parent_id")
        if co_parent_id is not None:
            if not isinstance(co_parent_id, str) or co_parent_id not in people_ids or co_parent_id in {person_id, relative_id}:
                raise DataValidationError("Choose a valid, existing second parent to link to.")
        parent_ids = [relative_id] + ([co_parent_id] if co_parent_id else [])
        parent_id_set = set(parent_ids)
        # Prefer a union that already links both chosen parents together.
        union = next((u for u in unions if parent_id_set <= {p.get("individual_id") for p in u.get("partners", [])}), None)
        if union is None and co_parent_id:
            # Extend a union that has exactly one of the two parents, linking the parents together.
            union = next(
                (
                    u
                    for u in unions
                    if any(p.get("individual_id") in parent_id_set for p in u.get("partners", []))
                    and len(u.get("partners", [])) < 2
                ),
                None,
            )
            if union is not None:
                existing_partner_ids = {p.get("individual_id") for p in union["partners"]}
                for pid in parent_ids:
                    if pid not in existing_partner_ids:
                        union["partners"].append({"individual_id": pid})
        if union is None:
            union = {
                "id": generate_union_id(parent_ids, union_ids),
                "partners": [{"individual_id": pid} for pid in parent_ids],
                "union_type": "marriage" if co_parent_id else "unknown",
                "children": [],
            }
            unions.append(union)
        union.setdefault("children", []).append({"individual_id": person_id, "link_type": "biological"})
    elif kind == "parent_of":
        union = next(
            (
                u
                for u in unions
                if any(c.get("individual_id") == relative_id for c in u.get("children", []))
                and not any(p.get("individual_id") == person_id for p in u.get("partners", []))
                and len(u.get("partners", [])) < 2
            ),
            None,
        )
        if union is not None:
            union["partners"].append({"individual_id": person_id})
        else:
            unions.append(
                {
                    "id": generate_union_id([person_id, relative_id], union_ids),
                    "partners": [{"individual_id": person_id}],
                    "union_type": "unknown",
                    "children": [{"individual_id": relative_id, "link_type": "biological"}],
                }
            )
    elif kind == "spouse_of":
        union = next(
            (
                u
                for u in unions
                if any(p.get("individual_id") == relative_id for p in u.get("partners", []))
                and not any(p.get("individual_id") == person_id for p in u.get("partners", []))
                and len(u.get("partners", [])) < 2
            ),
            None,
        )
        if union is not None:
            union["partners"].append({"individual_id": person_id})
        else:
            unions.append(
                {
                    "id": generate_union_id([relative_id, person_id], union_ids),
                    "partners": [{"individual_id": relative_id}, {"individual_id": person_id}],
                    "union_type": "marriage",
                    "children": [],
                }
            )
    else:
        raise DataValidationError("Choose a valid relationship option.")


def remove_person(family: dict[str, Any], person_id: str) -> None:
    """Remove a person and detach them from every union, dropping unions left with no partners."""
    people = family.get("individuals", [])
    if not any(person.get("id") == person_id for person in people):
        raise DataValidationError(f"Unknown person: {person_id}.")
    family["individuals"] = [person for person in people if person.get("id") != person_id]
    detach_relationships(family, person_id)

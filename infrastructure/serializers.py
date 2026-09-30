from __future__ import annotations

from typing import Any

from domain.person_ids import birth_year


def public_person(person: dict[str, Any], viewer_is_admin: bool) -> dict[str, Any]:
    result = {
        **person,
        "display_name": " ".join(part for part in (person.get("first_name"), person.get("middle_name"), person.get("last_name")) if part),
        "birth_year": birth_year(person),
    }
    if person.get("is_private") and not viewer_is_admin:
        result["vital_events"] = {"birth": {"date": "private", "location": ""}}
        result.pop("cultural_metadata", None)
        result.pop("migration_history", None)
        result.pop("biographical_notes", None)
        result["birth_year"] = None
    return result



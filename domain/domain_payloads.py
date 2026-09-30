from __future__ import annotations

from typing import Any

from domain.domain_validation import DataValidationError, MAX_TAGS_PER_PERSON, TAG_PATTERN
from domain.person_ids import generate_person_id

RELATIONSHIP_KINDS = {"new_root", "child_of", "parent_of", "spouse_of"}


def valid_person_payload(
    payload: Any, existing_ids: set[str], current_id: str | None = None, existing_person: dict[str, Any] | None = None
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise DataValidationError("Proposal must be an object.")
    required = ("first_name", "last_name", "gender")
    if any(not isinstance(payload.get(field), str) or not payload[field].strip() for field in required):
        raise DataValidationError("First name, last name, and gender are required.")
    birth_date = str(payload.get("birth_date", "")).strip() or "unknown"
    person = {
        "first_name": payload["first_name"].strip(),
        "last_name": payload["last_name"].strip(),
        "gender": payload["gender"].strip(),
        "vital_events": {"birth": {"date": birth_date, "location": str(payload.get("birth_location", "")).strip()}},
    }
    for name in ("middle_name", "generation", "biographical_notes"):
        if isinstance(payload.get(name), str) and payload[name].strip():
            person[name] = payload[name].strip()
    relationship = payload.get("relationship")
    if relationship not in {None, "", "keep", *RELATIONSHIP_KINDS}:
        raise DataValidationError("Choose a valid relationship option.")
    if relationship == "new_root":
        person["_relationship"] = {"type": "new_root"}
    elif relationship in {"child_of", "parent_of", "spouse_of"}:
        relative_id = payload.get("relative_id")
        if not isinstance(relative_id, str) or not relative_id.strip():
            raise DataValidationError("Choose the family member this relationship links to.")
        descriptor = {"type": relationship, "relative_id": relative_id.strip()}
        if relationship == "child_of":
            co_parent_id = payload.get("co_parent_id")
            if isinstance(co_parent_id, str) and co_parent_id.strip():
                descriptor["co_parent_id"] = co_parent_id.strip()
        person["_relationship"] = descriptor
    death_date = str(payload.get("death_date", "")).strip()
    death_location = str(payload.get("death_location", "")).strip()
    if death_date:
        person["vital_events"]["death"] = {"date": death_date, "location": death_location}
    cultural = {key: str(payload.get(key, "")).strip() for key in ("gotra_clan", "native_village", "community_caste")}
    cultural = {key: value for key, value in cultural.items() if value}
    if cultural:
        person["cultural_metadata"] = cultural
    is_private = payload.get("is_private")
    is_private = is_private if isinstance(is_private, bool) else str(is_private).strip().lower() in ("true", "1", "on", "yes")
    if is_private:
        person["is_private"] = True
    tags = payload.get("tags", [])
    if isinstance(tags, str):
        tags = [part.strip() for part in tags.split(",") if part.strip()]
    if not isinstance(tags, list):
        raise DataValidationError("Tags must be a list of short labels.")
    deduped_tags: list[str] = []
    seen_tags: set[str] = set()
    for tag in tags:
        tag = str(tag).strip()
        if not tag:
            continue
        if not TAG_PATTERN.fullmatch(tag):
            raise DataValidationError(f"Invalid tag: {tag!r}. Use up to 30 letters, digits, spaces, hyphens, or underscores.")
        key = tag.lower()
        if key in seen_tags:
            continue
        seen_tags.add(key)
        deduped_tags.append(tag)
    if len(deduped_tags) > MAX_TAGS_PER_PERSON:
        raise DataValidationError(f"A person may have at most {MAX_TAGS_PER_PERSON} tags.")
    if deduped_tags:
        person["tags"] = deduped_tags
    if existing_person and existing_person.get("migration_history"):
        person["migration_history"] = existing_person["migration_history"]
    if existing_person and existing_person.get("position"):
        person["position"] = existing_person["position"]
    if current_id:
        person["id"] = current_id
    else:
        requested_id = str(payload.get("id", "")).strip().lower()
        if requested_id:
            if requested_id in existing_ids:
                raise DataValidationError("That person ID already exists.")
            person["id"] = requested_id
        else:
            person["id"] = generate_person_id(person["first_name"], person["last_name"], birth_date, existing_ids)
    return person



from __future__ import annotations

import re


def birth_year(person: dict) -> int | None:
    value = person.get("vital_events", {}).get("birth", {}).get("date", "")
    match = re.match(r"^(\d{4})", str(value))
    return int(match.group(1)) if match else None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def generate_union_id(seed_ids: list[str], existing_ids: set[str]) -> str:
    """Derive a stable union ID from linked people, adding a numeric suffix on collision."""
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
    """Derive a stable person ID from names, birth year, and numeric collision suffix."""
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



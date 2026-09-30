from __future__ import annotations

import json
import sqlite3
from typing import Any, Callable

from data_store import DataValidationError, load_family, remove_person, resolve_relationship, save_family


def apply_proposal(
    family: dict[str, Any],
    proposal: sqlite3.Row,
    payload_validator: Callable[..., dict[str, Any]],
) -> str:
    payload = json.loads(proposal["payload"])
    people = family["individuals"]
    current_ids = {person["id"] for person in people}
    if proposal["kind"] == "delete":
        target_id = proposal["target_id"]
        remove_person(family, target_id)
        return target_id
    if proposal["kind"] == "add":
        person = payload_validator(payload, current_ids)
        relationship = person.pop("_relationship", None)
        people.append(person)
        if relationship:
            resolve_relationship(family, person["id"], relationship)
        return person["id"]
    target_id = proposal["target_id"]
    for index, existing in enumerate(people):
        if existing["id"] == target_id:
            replacement = payload_validator(payload, current_ids, target_id, existing_person=existing)
            relationship = replacement.pop("_relationship", None)
            people[index] = replacement
            if relationship:
                resolve_relationship(family, target_id, relationship)
            return target_id
    raise DataValidationError("The proposed person no longer exists.")


def finalize_proposal(
    proposal_id: int,
    action: str,
    note: str,
    *,
    db_factory: Callable[[], sqlite3.Connection],
    actor: Callable[[], str],
    audit: Callable[[str, dict[str, Any]], None],
    backup_create: Callable[[], Any],
    backup_git: Callable[[Any, bool], str],
    backup_error: type[Exception],
    payload_validator: Callable[..., dict[str, Any]],
) -> tuple[dict[str, Any], int]:
    with db_factory() as connection:
        proposal = connection.execute("SELECT * FROM proposals WHERE id = ? AND status = 'pending'", (proposal_id,)).fetchone()
    if proposal is None:
        return {"error": "Pending proposal not found."}, 404
    if action == "approve":
        try:
            data = load_family()
            affected_id = apply_proposal(data, proposal, payload_validator)
            save_family(data)
        except DataValidationError as error:
            return {"error": str(error)}, 400
        details = {"proposal_id": proposal_id, "affected_id": affected_id}
    else:
        details = {"proposal_id": proposal_id}
    with db_factory() as connection:
        connection.execute(
            "UPDATE proposals SET status = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?",
            ("approved" if action == "approve" else "rejected", note, actor(), proposal_id),
        )
    audit(f"proposal_{action}d", details)
    backup_status = None
    if action == "approve":
        try:
            backup_file = backup_create()
            backup_status = backup_git(backup_file, push=True)
            audit("backup_created", {"proposal_id": proposal_id, "file": backup_file.name, "status": backup_status})
        except backup_error as error:
            backup_status = f"Backup failed: {error}"
            audit("backup_failed", {"proposal_id": proposal_id, "error": str(error)})
    return {"status": "approved" if action == "approve" else "rejected", "backup": backup_status}, 200



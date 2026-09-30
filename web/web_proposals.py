from __future__ import annotations

import json
import sqlite3
from typing import Any, Callable

from flask import Flask, abort, jsonify, request

from data_store import DataValidationError


def register_proposal_routes(
    app: Flask,
    db: Callable[[], sqlite3.Connection],
    load_family: Callable[[], dict[str, Any]],
    valid_person_payload: Callable[..., dict[str, Any]],
    finalize_proposal: Callable[..., tuple[dict[str, Any], int]],
    actor: Callable[[], str],
    current_user: Callable[[], sqlite3.Row | None],
    audit: Callable[[str, dict[str, Any]], None],
    login_required: Callable,
    admin_required: Callable,
    csrf_required: Callable,
):
    @app.post("/api/proposals")
    @login_required
    @csrf_required
    def create_proposal():
        payload = request.get_json(silent=True) or {}
        kind = payload.get("kind")
        target_id = payload.get("target_id") if kind in {"edit", "delete"} else None
        family = load_family()
        identifiers = {person["id"] for person in family["individuals"]}
        if kind not in {"add", "edit", "delete"} or (kind in {"edit", "delete"} and target_id not in identifiers):
            return jsonify(error="Invalid proposal target."), 400
        if kind == "delete":
            person_id = target_id
        else:
            try:
                candidate = valid_person_payload(payload.get("person"), identifiers, target_id)
                relationship = candidate.get("_relationship") or {}
                for key in ("relative_id", "co_parent_id"):
                    linked_id = relationship.get(key)
                    if linked_id is not None and (linked_id not in identifiers or linked_id == target_id):
                        raise DataValidationError("Choose a valid, existing family member to link to.")
            except DataValidationError as error:
                return jsonify(error=str(error)), 400
            person_id = candidate["id"]
        stored_person = {"id": target_id} if kind == "delete" else dict(payload["person"])
        if kind == "add":
            stored_person["id"] = person_id
        with db() as connection:
            cursor = connection.execute(
                "INSERT INTO proposals (proposer, kind, target_id, payload) VALUES (?, ?, ?, ?)",
                (actor(), kind, target_id, json.dumps(stored_person, ensure_ascii=False)),
            )
            proposal_id = cursor.lastrowid
        audit("proposal_created", {"proposal_id": proposal_id, "kind": kind, "target_id": target_id})
        if current_user()["role"] == "admin":
            body, status_code = finalize_proposal(proposal_id, "approve")
            if status_code != 200:
                return jsonify(**body), status_code
            return jsonify(id=proposal_id, status="approved", person_id=person_id, backup=body.get("backup")), 201
        return jsonify(id=proposal_id, status="pending", person_id=person_id), 201

    @app.get("/api/proposals")
    @admin_required
    def proposals():
        with db() as connection:
            rows = connection.execute("SELECT * FROM proposals WHERE status = 'pending' ORDER BY created_at DESC").fetchall()
        return jsonify(proposals=[dict(row) | {"payload": json.loads(row["payload"])} for row in rows])

    @app.post("/api/proposals/<int:proposal_id>/<action>")
    @admin_required
    @csrf_required
    def review_proposal(proposal_id: int, action: str):
        if action not in {"approve", "reject"}:
            abort(404)
        note = str((request.get_json(silent=True) or {}).get("note", "")).strip()
        body, status_code = finalize_proposal(proposal_id, action, note)
        return jsonify(**body), status_code

    return create_proposal, proposals, review_proposal



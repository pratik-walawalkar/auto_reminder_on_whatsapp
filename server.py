from __future__ import annotations

import argparse
import html
import json
import os
import markdown
import backup
from datetime import timedelta
from functools import wraps
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any

from flask import Flask, Response, abort, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import gedcom
from data_store import (
    MAX_TAGS_PER_PERSON,
    TAG_PATTERN,
    DataValidationError,
    birth_year,
    generate_person_id,
    load_family,
    remove_person,
    save_family,
)

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "family_vault.db"

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("FAMILY_VAULT_SECRET") or secrets.token_hex(32),
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    MAX_CONTENT_LENGTH=32 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_database() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proposer TEXT NOT NULL REFERENCES users(username),
                kind TEXT NOT NULL CHECK(kind IN ('add', 'edit', 'delete')),
                target_id TEXT,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
                review_note TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TEXT,
                reviewed_by TEXT REFERENCES users(username)
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


def actor() -> str:
    return str(session.get("username", "system"))


def audit(action: str, details: dict[str, Any]) -> None:
    with db() as connection:
        connection.execute(
            "INSERT INTO audit_log (actor, action, details) VALUES (?, ?, ?)",
            (actor(), action, json.dumps(details, ensure_ascii=False)),
        )


def current_user() -> sqlite3.Row | None:
    username = session.get("username")
    if not username:
        return None
    with db() as connection:
        return connection.execute("SELECT username, display_name, role FROM users WHERE username = ?", (username,)).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return jsonify(error="Authentication required."), 401
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if current_user()["role"] != "admin":
            return jsonify(error="Administrator access required."), 403
        return view(*args, **kwargs)
    return wrapped


def csrf_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if request.headers.get("X-CSRF-Token") != session.get("csrf_token"):
            return jsonify(error="Invalid CSRF token."), 403
        return view(*args, **kwargs)
    return wrapped


def public_person(person: dict[str, Any], viewer_is_admin: bool) -> dict[str, Any]:
    result = {
        **person,
        "display_name": " ".join(part for part in (person.get("first_name"), person.get("middle_name"), person.get("last_name")) if part),
        "birth_year": birth_year(person),
    }
    # A private person's sensitive details are visible only to administrators;
    # everyone else still sees the name and place in the tree, nothing more.
    if person.get("is_private") and not viewer_is_admin:
        result["vital_events"] = {"birth": {"date": "private", "location": ""}}
        result.pop("cultural_metadata", None)
        result.pop("migration_history", None)
        result.pop("biographical_notes", None)
        result["birth_year"] = None
    return result


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
    if relationship not in {None, "", "new_root", "child_of_union"}:
        raise DataValidationError("Choose a valid relationship option.")
    if relationship == "child_of_union":
        union_id = payload.get("union_id")
        if not isinstance(union_id, str) or not union_id.strip():
            raise DataValidationError("Choose the parents' family unit.")
        person["_relationship"] = {"type": "child_of_union", "union_id": union_id.strip()}
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
    # Preserve fields the edit form does not expose, so editing never silently discards history.
    if existing_person and existing_person.get("migration_history"):
        person["migration_history"] = existing_person["migration_history"]
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


def apply_proposal(family: dict[str, Any], proposal: sqlite3.Row) -> str:
    payload = json.loads(proposal["payload"])
    people = family["individuals"]
    current_ids = {person["id"] for person in people}
    if proposal["kind"] == "delete":
        target_id = proposal["target_id"]
        remove_person(family, target_id)
        return target_id
    if proposal["kind"] == "add":
        person = valid_person_payload(payload, current_ids)
        relationship = person.pop("_relationship", None)
        people.append(person)
        if relationship:
            union = next((item for item in family["unions"] if item["id"] == relationship["union_id"]), None)
            if union is None:
                raise DataValidationError("The selected parents' family unit no longer exists.")
            union.setdefault("children", []).append({"individual_id": person["id"], "link_type": "biological"})
        return person["id"]
    target_id = proposal["target_id"]
    for index, existing in enumerate(people):
        if existing["id"] == target_id:
            replacement = valid_person_payload(payload, current_ids, target_id, existing_person=existing)
            replacement.pop("_relationship", None)
            people[index] = replacement
            return target_id
    raise DataValidationError("The proposed person no longer exists.")


@app.get("/")
def shell():
    return render_template("shell.html")


@app.get("/help")
@login_required
def help_guide():
    source = ROOT / "docs" / "USER_GUIDE.md"
    content = markdown.markdown(html.escape(source.read_text(encoding="utf-8")), extensions=["tables"])
    return render_template("help.html", content=content)


@app.post("/api/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not re.fullmatch(r"[a-z0-9_.-]{3,64}", username) or len(password) > 1024:
        return jsonify(error="Invalid username or password."), 401
    with db() as connection:
        user = connection.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Invalid username or password."), 401
    session.clear()
    session.permanent = True
    session["username"] = user["username"]
    session["csrf_token"] = secrets.token_urlsafe(32)
    audit("login", {"username": username})
    return jsonify(user={"username": user["username"], "display_name": user["display_name"], "role": user["role"]}, csrf_token=session["csrf_token"])


@app.post("/api/logout")
@login_required
@csrf_required
def logout():
    audit("logout", {})
    session.clear()
    return "", 204


@app.get("/api/me")
@login_required
def me():
    user = current_user()
    return jsonify(user={"username": user["username"], "display_name": user["display_name"], "role": user["role"]}, csrf_token=session["csrf_token"])


@app.get("/api/family")
@login_required
def family():
    data = load_family()
    viewer_is_admin = current_user()["role"] == "admin"
    data["individuals"] = [public_person(person, viewer_is_admin) for person in data["individuals"]]
    return jsonify(data)


@app.get("/api/export/gedcom")
@admin_required
def export_gedcom_route():
    content = gedcom.build_gedcom(load_family())
    audit("gedcom_exported", {})
    return Response(
        content,
        mimetype="text/vnd.familysearch.gedcom",
        headers={"Content-Disposition": 'attachment; filename="family_vault.ged"'},
    )


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
        with db() as connection:
            cursor = connection.execute(
                "INSERT INTO proposals (proposer, kind, target_id, payload) VALUES (?, ?, ?, ?)",
                (actor(), kind, target_id, json.dumps({"id": target_id}, ensure_ascii=False)),
            )
        audit("proposal_created", {"proposal_id": cursor.lastrowid, "kind": kind, "target_id": target_id})
        return jsonify(id=cursor.lastrowid, status="pending", person_id=target_id), 201
    try:
        candidate = valid_person_payload(payload.get("person"), identifiers, target_id)
        if candidate.get("_relationship", {}).get("union_id") not in {None, *(union["id"] for union in family["unions"])}:
            raise DataValidationError("Choose an existing parents' family unit.")
    except DataValidationError as error:
        return jsonify(error=str(error)), 400
    stored_person = dict(payload["person"])
    if kind == "add":
        # Freeze the generated ID now so it stays stable even if other proposals are approved before this one.
        stored_person["id"] = candidate["id"]
    with db() as connection:
        cursor = connection.execute(
            "INSERT INTO proposals (proposer, kind, target_id, payload) VALUES (?, ?, ?, ?)",
            (actor(), kind, target_id, json.dumps(stored_person, ensure_ascii=False)),
        )
    audit("proposal_created", {"proposal_id": cursor.lastrowid, "kind": kind, "target_id": target_id})
    return jsonify(id=cursor.lastrowid, status="pending", person_id=candidate["id"]), 201


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
    with db() as connection:
        proposal = connection.execute("SELECT * FROM proposals WHERE id = ? AND status = 'pending'", (proposal_id,)).fetchone()
    if proposal is None:
        return jsonify(error="Pending proposal not found."), 404
    note = str((request.get_json(silent=True) or {}).get("note", "")).strip()
    if action == "approve":
        try:
            data = load_family()
            affected_id = apply_proposal(data, proposal)
            save_family(data)
        except DataValidationError as error:
            return jsonify(error=str(error)), 400
        details = {"proposal_id": proposal_id, "affected_id": affected_id}
    else:
        details = {"proposal_id": proposal_id}
    with db() as connection:
        connection.execute(
            "UPDATE proposals SET status = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?",
            ("approved" if action == "approve" else "rejected", note, actor(), proposal_id),
        )
    audit(f"proposal_{action}d", details)
    backup_status = None
    if action == "approve":
        try:
            backup_file = backup.create_backup()
            backup_status = backup.git_backup(backup_file, push=True)
            audit("backup_created", {"proposal_id": proposal_id, "file": backup_file.name, "status": backup_status})
        except backup.BackupError as error:
            backup_status = f"Backup failed: {error}"
            audit("backup_failed", {"proposal_id": proposal_id, "error": str(error)})
    return jsonify(status="approved" if action == "approve" else "rejected", backup=backup_status)


def create_user(username: str, display_name: str, password: str, role: str) -> None:
    if role not in {"admin", "member"} or not re.fullmatch(r"[a-zA-Z0-9_.-]{3,64}", username):
        raise ValueError("Username must contain 3-64 letters, digits, dots, hyphens, or underscores.")
    if not display_name.strip() or len(display_name.strip()) > 120:
        raise ValueError("Display name must contain 1-120 characters.")
    if len(password) < 12:
        raise ValueError("Use a password of at least 12 characters.")
    with db() as connection:
        if connection.execute("SELECT 1 FROM users WHERE username = ?", (username.lower(),)).fetchone():
            raise ValueError(f"Username already exists: {username.lower()}.")
        connection.execute(
            "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
            (username.lower(), display_name.strip(), generate_password_hash(password), role),
        )


def public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {"username": row["username"], "display_name": row["display_name"], "role": row["role"], "created_at": row["created_at"]}


def admin_count(connection: sqlite3.Connection, exclude_username: str | None = None) -> int:
    query = "SELECT COUNT(*) FROM users WHERE role = 'admin'"
    params: tuple[str, ...] = ()
    if exclude_username:
        query += " AND username != ?"
        params = (exclude_username,)
    return connection.execute(query, params).fetchone()[0]


@app.get("/api/admin/users")
@admin_required
def list_users():
    with db() as connection:
        rows = connection.execute("SELECT username, display_name, role, created_at FROM users ORDER BY created_at").fetchall()
    return jsonify(users=[public_user(row) for row in rows])


@app.post("/api/admin/users")
@admin_required
@csrf_required
def add_user():
    payload = request.get_json(silent=True) or {}
    try:
        create_user(
            str(payload.get("username", "")).strip(),
            str(payload.get("display_name", "")).strip(),
            str(payload.get("password", "")),
            str(payload.get("role", "member")).strip(),
        )
    except ValueError as error:
        return jsonify(error=str(error)), 400
    audit("user_created", {"username": str(payload.get("username", "")).strip().lower(), "role": payload.get("role")})
    with db() as connection:
        row = connection.execute(
            "SELECT username, display_name, role, created_at FROM users WHERE username = ?",
            (str(payload.get("username", "")).strip().lower(),),
        ).fetchone()
    return jsonify(user=public_user(row)), 201


@app.patch("/api/admin/users/<username>")
@admin_required
@csrf_required
def edit_user(username: str):
    username = username.strip().lower()
    payload = request.get_json(silent=True) or {}
    with db() as connection:
        existing = connection.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if existing is None:
            return jsonify(error="User not found."), 404
        updates: dict[str, Any] = {}
        if "display_name" in payload:
            display_name = str(payload["display_name"]).strip()
            if not display_name or len(display_name) > 120:
                return jsonify(error="Display name must contain 1-120 characters."), 400
            updates["display_name"] = display_name
        if "role" in payload:
            role = str(payload["role"]).strip()
            if role not in {"admin", "member"}:
                return jsonify(error="Role must be admin or member."), 400
            if existing["role"] == "admin" and role != "admin" and admin_count(connection, exclude_username=username) == 0:
                return jsonify(error="At least one administrator account must remain."), 400
            updates["role"] = role
        if "password" in payload:
            password = str(payload["password"])
            if len(password) < 12:
                return jsonify(error="Use a password of at least 12 characters."), 400
            updates["password_hash"] = generate_password_hash(password)
        if not updates:
            return jsonify(error="No changes were provided."), 400
        assignments = ", ".join(f"{field} = ?" for field in updates)
        connection.execute(f"UPDATE users SET {assignments} WHERE username = ?", (*updates.values(), username))
        row = connection.execute("SELECT username, display_name, role, created_at FROM users WHERE username = ?", (username,)).fetchone()
    audit("user_updated", {"username": username, "fields": sorted(updates.keys())})
    return jsonify(user=public_user(row))


@app.delete("/api/admin/users/<username>")
@admin_required
@csrf_required
def delete_user(username: str):
    username = username.strip().lower()
    if username == actor():
        return jsonify(error="You cannot delete your own account."), 400
    with db() as connection:
        existing = connection.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if existing is None:
            return jsonify(error="User not found."), 404
        if existing["role"] == "admin" and admin_count(connection, exclude_username=username) == 0:
            return jsonify(error="At least one administrator account must remain."), 400
        pending = connection.execute("SELECT COUNT(*) FROM proposals WHERE proposer = ? AND status = 'pending'", (username,)).fetchone()[0]
        if pending:
            return jsonify(error="Reject or approve this user's pending proposals before deleting the account."), 400
        connection.execute("DELETE FROM users WHERE username = ?", (username,))
    audit("user_deleted", {"username": username})
    return "", 204


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Family Vault server.")
    parser.add_argument("--host", default="127.0.0.1", help="Use this PC's Tailnet IP for family access.")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--create-user", action="store_true")
    parser.add_argument("--username")
    parser.add_argument("--display-name")
    parser.add_argument("--password")
    parser.add_argument("--role", choices=("admin", "member"), default="member")
    args = parser.parse_args()
    init_database()
    if args.create_user:
        if not all((args.username, args.display_name, args.password)):
            parser.error("--create-user requires --username, --display-name, and --password.")
        create_user(args.username, args.display_name, args.password, args.role)
        return
    if not os.environ.get("FAMILY_VAULT_SECRET"):
        print("Warning: FAMILY_VAULT_SECRET is not set; sessions will end when the server restarts.")
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()

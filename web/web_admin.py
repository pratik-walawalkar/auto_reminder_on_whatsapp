from __future__ import annotations

import sqlite3
from typing import Any, Callable

from flask import Flask, jsonify, request


def register_admin_routes(
    app: Flask,
    db: Callable[[], sqlite3.Connection],
    actor: Callable[[], str],
    create_user: Callable[[str, str, str, str], None],
    public_user: Callable[[sqlite3.Row], dict[str, Any]],
    admin_count: Callable[[sqlite3.Connection, str | None], int],
    audit: Callable[[str, dict[str, Any]], None],
    admin_required: Callable,
    csrf_required: Callable,
):
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
        normalized = str(payload.get("username", "")).strip().lower()
        audit("user_created", {"username": normalized, "role": payload.get("role")})
        with db() as connection:
            row = connection.execute(
                "SELECT username, display_name, role, created_at FROM users WHERE username = ?", (normalized,)
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
                if existing["role"] == "admin" and role != "admin" and admin_count(connection, username) == 0:
                    return jsonify(error="At least one administrator account must remain."), 400
                updates["role"] = role
            if "password" in payload:
                password = str(payload["password"])
                if len(password) < 12:
                    return jsonify(error="Use a password of at least 12 characters."), 400
                from werkzeug.security import generate_password_hash
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
            if existing["role"] == "admin" and admin_count(connection, username) == 0:
                return jsonify(error="At least one administrator account must remain."), 400
            pending = connection.execute("SELECT COUNT(*) FROM proposals WHERE proposer = ? AND status = 'pending'", (username,)).fetchone()[0]
            if pending:
                return jsonify(error="Reject or approve this user's pending proposals before deleting the account."), 400
            connection.execute("DELETE FROM users WHERE username = ?", (username,))
        audit("user_deleted", {"username": username})
        return "", 204

    return list_users, add_user, edit_user, delete_user



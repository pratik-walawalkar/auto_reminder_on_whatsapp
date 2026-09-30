from __future__ import annotations

import json
import sqlite3
from functools import wraps
from typing import Any, Callable

from flask import jsonify, request, session


def actor() -> str:
    return str(session.get("username", "system"))


def audit(db_factory: Callable[[], sqlite3.Connection], action: str, details: dict[str, Any]) -> None:
    with db_factory() as connection:
        connection.execute(
            "INSERT INTO audit_log (actor, action, details) VALUES (?, ?, ?)",
            (actor(), action, json.dumps(details, ensure_ascii=False)),
        )


def current_user(db_factory: Callable[[], sqlite3.Connection]) -> sqlite3.Row | None:
    username = session.get("username")
    if not username:
        return None
    with db_factory() as connection:
        return connection.execute(
            "SELECT username, display_name, role FROM users WHERE username = ?", (username,)
        ).fetchone()


def login_required(view, user_loader: Callable[[], sqlite3.Row | None]):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if user_loader() is None:
            return jsonify(error="Authentication required."), 401
        return view(*args, **kwargs)

    return wrapped


def admin_required(view, user_loader: Callable[[], sqlite3.Row | None]):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = user_loader()
        if user is None:
            return jsonify(error="Authentication required."), 401
        if user["role"] != "admin":
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



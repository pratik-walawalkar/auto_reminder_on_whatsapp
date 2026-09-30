from __future__ import annotations

import re
import secrets
import sqlite3
from pathlib import Path
from typing import Any, Callable

from flask import Flask, jsonify, request, session
from werkzeug.security import check_password_hash


def register_auth_routes(
    app: Flask,
    db: Callable[[], sqlite3.Connection],
    audit: Callable[[str, dict[str, Any]], None],
    login_required: Callable,
    csrf_required: Callable,
):
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
        return jsonify(
            user={"username": user["username"], "display_name": user["display_name"], "role": user["role"]},
            csrf_token=session["csrf_token"],
        )

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
        username = session.get("username")
        with db() as connection:
            user = connection.execute(
                "SELECT username, display_name, role FROM users WHERE username = ?", (username,)
            ).fetchone()
        return jsonify(
            user={"username": user["username"], "display_name": user["display_name"], "role": user["role"]},
            csrf_token=session["csrf_token"],
        )

    return login, logout, me



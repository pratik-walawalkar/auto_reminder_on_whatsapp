from __future__ import annotations

import sqlite3
from typing import Any, Callable

from flask import Flask, jsonify, request


def register_profile_routes(
    app: Flask,
    db: Callable[[], sqlite3.Connection],
    actor: Callable[[], str],
    change_password: Callable[[Callable[[], sqlite3.Connection], str, str, str], str | None],
    audit: Callable[[str, dict[str, Any]], None],
    login_required: Callable,
    csrf_required: Callable,
):
    @app.patch("/api/profile/password")
    @login_required
    @csrf_required
    def change_own_password():
        payload = request.get_json(silent=True) or {}
        current_password = str(payload.get("current_password", ""))
        password = str(payload.get("password", ""))
        username = actor()
        error = change_password(db, username, current_password, password)
        if error:
            return jsonify(error=error), 400
        audit("password_changed", {"username": username})
        return jsonify(message="Password updated successfully.")

    return change_own_password



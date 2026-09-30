from __future__ import annotations

import re
import sqlite3
from typing import Any, Callable

from werkzeug.security import check_password_hash, generate_password_hash


def create_user(db_factory: Callable[[], sqlite3.Connection], username: str, display_name: str, password: str, role: str) -> None:
    if role not in {"admin", "member"} or not re.fullmatch(r"[a-zA-Z0-9_.-]{3,64}", username):
        raise ValueError("Username must contain 3-64 letters, digits, dots, hyphens, or underscores.")
    if not display_name.strip() or len(display_name.strip()) > 120:
        raise ValueError("Display name must contain 1-120 characters.")
    if len(password) < 12:
        raise ValueError("Use a password of at least 12 characters.")
    normalized_username = username.lower()
    with db_factory() as connection:
        if connection.execute("SELECT 1 FROM users WHERE username = ?", (normalized_username,)).fetchone():
            raise ValueError(f"Username already exists: {normalized_username}.")
        connection.execute(
            "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
            (normalized_username, display_name.strip(), generate_password_hash(password), role),
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


def password_meets_policy(password: str) -> bool:
    return (
        len(password) >= 12
        and bool(re.search(r"[A-Z]", password))
        and bool(re.search(r"[a-z]", password))
        and bool(re.search(r"\d", password))
        and bool(re.search(r"[^A-Za-z0-9]", password))
    )


def change_password(
    db_factory: Callable[[], sqlite3.Connection], username: str, current_password: str, password: str
) -> str | None:
    with db_factory() as connection:
        existing = connection.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if existing is None or not check_password_hash(existing["password_hash"], current_password):
        return "Current password is incorrect."
    if not password_meets_policy(password):
        return "Password must be at least 12 characters and include uppercase, lowercase, number, and special character."
    with db_factory() as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (generate_password_hash(password), username),
        )
    return None



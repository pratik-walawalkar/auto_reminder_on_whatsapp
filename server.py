from __future__ import annotations

import os
import backup
from datetime import timedelta
import secrets
import sqlite3
from typing import Any

from flask import Flask


from config import DATABASE as DEFAULT_DATABASE, ROOT as PROJECT_ROOT
from infrastructure.sqlite_store import connect as connect_database, initialize as initialize_database
from infrastructure.security import (
    actor as security_actor,
    audit as security_audit,
    current_user as security_current_user,
    login_required as security_login_required,
    admin_required as security_admin_required,
    csrf_required as security_csrf_required,
)
from infrastructure.serializers import public_person as serialize_public_person
from domain.domain_payloads import valid_person_payload as build_person_payload
from domain.domain_proposals import apply_proposal as apply_proposal_service, finalize_proposal as finalize_proposal_service
from domain.domain_users import (
    admin_count as count_admins,
    change_password as update_password,
    create_user as create_user_service,
    public_user as serialize_user,
)
from web.web_pages import register_page_routes
from web.web_auth import register_auth_routes
from web.web_family import register_family_routes
from web.web_exports import register_export_routes
from web.web_proposals import register_proposal_routes
from web.web_profile import register_profile_routes
from web.web_admin import register_admin_routes
from cli.server_cli import run as run_server_cli
import gedcom
from data_store import DataValidationError, load_family, save_family

ROOT = PROJECT_ROOT
DATABASE = DEFAULT_DATABASE

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("FAMILY_VAULT_SECRET") or secrets.token_hex(32),
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    MAX_CONTENT_LENGTH=32 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


def db() -> sqlite3.Connection:
    return connect_database(DATABASE)


def init_database() -> None:
    initialize_database(DATABASE)



def actor() -> str:
    return security_actor()


def audit(action: str, details: dict[str, Any]) -> None:
    security_audit(db, action, details)


def current_user() -> sqlite3.Row | None:
    return security_current_user(db)


def login_required(view):
    return security_login_required(view, current_user)


def admin_required(view):
    return security_admin_required(view, current_user)


def csrf_required(view):
    return security_csrf_required(view)



def public_person(person: dict[str, Any], viewer_is_admin: bool) -> dict[str, Any]:
    return serialize_public_person(person, viewer_is_admin)


def valid_person_payload(
    payload: Any, existing_ids: set[str], current_id: str | None = None, existing_person: dict[str, Any] | None = None
) -> dict[str, Any]:
    return build_person_payload(payload, existing_ids, current_id, existing_person)





def apply_proposal(family: dict[str, Any], proposal: sqlite3.Row) -> str:
    return apply_proposal_service(family, proposal, valid_person_payload)



shell, help_guide = register_page_routes(app, ROOT, login_required)





login, logout, me = register_auth_routes(app, db, audit, login_required, csrf_required)





family, update_positions = register_family_routes(
    app,
    load_family,
    save_family,
    public_person,
    current_user,
    audit,
    login_required,
    csrf_required,
)





export_gedcom_route = register_export_routes(app, load_family, gedcom.build_gedcom, audit, admin_required)




def finalize_proposal(proposal_id: int, action: str, note: str = "") -> tuple[dict[str, Any], int]:
    """Apply (or reject) a pending proposal and record the review."""
    return finalize_proposal_service(
        proposal_id,
        action,
        note,
        db_factory=db,
        actor=actor,
        audit=audit,
        backup_create=backup.create_backup,
        backup_git=backup.git_backup,
        backup_error=backup.BackupError,
        payload_validator=valid_person_payload,
        )


create_proposal, proposals, review_proposal = register_proposal_routes(
    app,
    db,
    load_family,
    valid_person_payload,
    finalize_proposal,
    actor,
    current_user,
    audit,
    login_required,
    admin_required,
    csrf_required,
)



def create_user(username: str, display_name: str, password: str, role: str) -> None:
    create_user_service(db, username, display_name, password, role)


def public_user(row: sqlite3.Row) -> dict[str, Any]:
    return serialize_user(row)


def admin_count(connection: sqlite3.Connection, exclude_username: str | None = None) -> int:
    return count_admins(connection, exclude_username)



change_own_password = register_profile_routes(app, db, actor, update_password, audit, login_required, csrf_required)


list_users, add_user, edit_user, delete_user = register_admin_routes(
    app,
    db,
    actor,
    create_user,
    public_user,
    admin_count,
    audit,
    admin_required,
    csrf_required,
)





def main() -> None:
    run_server_cli(app, init_database, create_user)



if __name__ == "__main__":
    main()



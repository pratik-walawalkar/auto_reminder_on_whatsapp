from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest
import yaml

import backup
import data_store
import server


@pytest.fixture
def family_data() -> dict:
    with Path("family.yaml").open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


@pytest.fixture
def app(monkeypatch, tmp_path, family_data):
    family_file = tmp_path / "family.yaml"
    family_file.write_text(yaml.safe_dump(family_data, sort_keys=False), encoding="utf-8")
    monkeypatch.setattr(data_store, "FAMILY_FILE", family_file)
    monkeypatch.setattr(data_store, "ROOT", tmp_path)
    monkeypatch.setattr(server, "DATABASE", tmp_path / "family_vault.db")
    monkeypatch.setattr(backup, "DATABASE", tmp_path / "family_vault.db")
    monkeypatch.setattr(backup, "ROOT", tmp_path)
    monkeypatch.setattr(backup, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(backup, "MANIFEST", tmp_path / "backups" / "manifest.json")
    monkeypatch.setenv("FAMILY_VAULT_BACKUP_PASSPHRASE", "test backup passphrase")
    server.app.config.update(TESTING=True, SECRET_KEY="test-secret")
    server.init_database()
    server.create_user("adminuser", "Admin User", "admin-password-123", "admin")
    server.create_user("memberuser", "Member User", "member-password-123", "member")
    return server.app


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, username: str, password: str) -> str:
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.get_json()["csrf_token"]


@pytest.fixture
def member_token(client):
    return login(client, "memberuser", "member-password-123")


@pytest.fixture
def admin_token(client):
    return login(client, "adminuser", "admin-password-123")


@pytest.fixture
def proposed_person() -> dict:
    return {
        "id": "meera_1980_g2",
        "first_name": "Meera",
        "last_name": "Surname",
        "gender": "F",
        "birth_date": "1980-03-15",
        "birth_location": "Mumbai",
    }


@pytest.fixture
def valid_family(family_data) -> dict:
    return deepcopy(family_data)



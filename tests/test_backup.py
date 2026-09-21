from __future__ import annotations

import sqlite3

import pytest

import backup
import server


def test_backup_encrypts_snapshot_and_verifies_without_plaintext(app):
    with server.db() as connection:
        connection.execute("INSERT INTO audit_log (actor, action, details) VALUES (?, ?, ?)", ("adminuser", "test", "{}"))

    encrypted = backup.create_backup()

    assert encrypted.suffix == ".enc"
    assert b"adminuser" not in encrypted.read_bytes()
    assert backup.MANIFEST.exists()
    backup.verify_backup(encrypted)


def test_restore_replaces_database_after_integrity_check(app, tmp_path):
    with server.db() as connection:
        connection.execute("INSERT INTO audit_log (actor, action, details) VALUES (?, ?, ?)", ("adminuser", "before_backup", "{}"))
    encrypted = backup.create_backup()
    with server.db() as connection:
        connection.execute("INSERT INTO audit_log (actor, action, details) VALUES (?, ?, ?)", ("adminuser", "after_backup", "{}"))

    backup.restore_backup(encrypted)

    with server.db() as connection:
        actions = [row[0] for row in connection.execute("SELECT action FROM audit_log ORDER BY id")]
    assert "before_backup" in actions
    assert "after_backup" not in actions


def test_backup_rejects_wrong_passphrase(app, monkeypatch):
    encrypted = backup.create_backup()
    monkeypatch.setenv("FAMILY_VAULT_BACKUP_PASSPHRASE", "wrong passphrase")

    with pytest.raises(backup.BackupError, match="decryption failed"):
        backup.verify_backup(encrypted)


def test_git_backup_without_repository_keeps_local_snapshot(app):
    encrypted = backup.create_backup()

    message = backup.git_backup(encrypted, push=True)

    assert "initialize Git" in message
    assert encrypted.exists()

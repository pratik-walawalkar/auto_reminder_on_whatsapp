from __future__ import annotations

from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tempfile
from typing import Any

from cli.backup_cli import run as run_backup_cli
from adapters.backup_crypto import (
    MAGIC,
    NONCE_BYTES,
    SALT_BYTES,
    SCRYPT_MAXMEM,
    SCRYPT_N,
    SCRYPT_P,
    SCRYPT_R,
    BackupCryptoError,
    decrypt as decrypt_payload,
    derive_key as derive_backup_key,
    encrypt as encrypt_payload,
    passphrase as load_passphrase,
)
from adapters.backup_sqlite import snapshot as snapshot_database, validate as validate_database
from adapters.backup_manifest import read as read_manifest_file, write as write_manifest_file
from adapters.backup_git import backup as git_backup_operation, run_git
import data_store
from config import BACKUP_DIR as DEFAULT_BACKUP_DIR, DATABASE as DEFAULT_DATABASE, MANIFEST as DEFAULT_MANIFEST, ROOT as PROJECT_ROOT
from data_store import load_family

ROOT = PROJECT_ROOT
DATABASE = DEFAULT_DATABASE
BACKUP_DIR = DEFAULT_BACKUP_DIR
MANIFEST = DEFAULT_MANIFEST
class BackupError(RuntimeError):
    pass


def passphrase() -> bytes:
    try:
        return load_passphrase()
    except BackupCryptoError as error:
        raise BackupError(str(error)) from error


def derive_key(secret: bytes, salt: bytes) -> bytes:
    try:
        return derive_backup_key(secret, salt)
    except BackupCryptoError as error:
        raise BackupError(str(error)) from error


def encrypt(plaintext: bytes, secret: bytes) -> bytes:
    return encrypt_payload(plaintext, secret)


def decrypt(payload: bytes, secret: bytes) -> bytes:
    try:
        return decrypt_payload(payload, secret)
    except BackupCryptoError as error:
        raise BackupError(str(error)) from error


def sqlite_snapshot(database: Path | None = None) -> bytes:
    try:
        return snapshot_database(database or DATABASE, validate_sqlite)
    except RuntimeError as error:
        raise BackupError(str(error)) from error


def validate_sqlite(database: Path) -> None:
    try:
        validate_database(database)
    except RuntimeError as error:
        raise BackupError(str(error)) from error


def read_manifest() -> list[dict[str, Any]]:
    return read_manifest_file(MANIFEST, BackupError)


def write_manifest(entries: list[dict[str, Any]]) -> None:
    write_manifest_file(BACKUP_DIR, MANIFEST, entries)


def load_family_bytes() -> bytes:
    return data_store.FAMILY_FILE.read_bytes()


def create_backup(database: Path | None = None) -> Path:
    database = database or DATABASE
    load_family()
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    destination = BACKUP_DIR / f"family_vault-{timestamp}.db.enc"
    if destination.exists():
        destination = BACKUP_DIR / f"family_vault-{timestamp}-{secrets.token_hex(3)}.db.enc"
    encrypted = encrypt(sqlite_snapshot(database), passphrase())
    destination.write_bytes(encrypted)
    entries = read_manifest()
    entries.append(
        {
            "file": destination.name,
            "created_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "cipher": "AES-256-GCM",
            "kdf": f"scrypt N={SCRYPT_N}, r={SCRYPT_R}, p={SCRYPT_P}",
            "sha256": hashlib.sha256(encrypted).hexdigest(),
            "family_yaml_sha256": hashlib.sha256(load_family_bytes()).hexdigest(),
        }
    )
    write_manifest(entries)
    return destination


def verify_backup(backup_file: Path) -> None:
    if not backup_file.is_file():
        raise BackupError(f"Backup does not exist: {backup_file}")
    decrypted = decrypt(backup_file.read_bytes(), passphrase())
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as handle:
        database = Path(handle.name)
    try:
        database.write_bytes(decrypted)
        validate_sqlite(database)
    finally:
        database.unlink(missing_ok=True)


def restore_backup(backup_file: Path, database: Path | None = None) -> None:
    database = database or DATABASE
    if not backup_file.is_file():
        raise BackupError(f"Backup does not exist: {backup_file}")
    decrypted = decrypt(backup_file.read_bytes(), passphrase())
    with tempfile.NamedTemporaryFile(suffix=".db", dir=database.parent, delete=False) as handle:
        replacement = Path(handle.name)
    source: sqlite3.Connection | None = None
    destination: sqlite3.Connection | None = None
    try:
        replacement.write_bytes(decrypted)
        validate_sqlite(replacement)
        source = sqlite3.connect(replacement)
        destination = sqlite3.connect(database)
        source.backup(destination)
        destination.close()
        destination = None
        source.close()
        source = None
        validate_sqlite(database)
    finally:
        if destination is not None:
            destination.close()
        if source is not None:
            source.close()
        replacement.unlink(missing_ok=True)


def git(arguments: list[str], required: bool = True) -> subprocess.CompletedProcess[str] | None:
    return run_git(ROOT, arguments, required, BackupError)


def git_backup(backup_file: Path, push: bool) -> str:
    return git_backup_operation(
        ROOT,
        BACKUP_DIR,
        MANIFEST,
        backup_file,
        push,
        BackupError,
        git_runner=lambda root, arguments, required, error_type: git(arguments, required),
    )


def main() -> None:
    run_backup_cli(create_backup, verify_backup, restore_backup, git_backup, ROOT)


if __name__ == "__main__":
    try:
        main()
    except BackupError as error:
        raise SystemExit(f"Backup error: {error}")



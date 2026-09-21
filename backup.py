from __future__ import annotations

import argparse
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import sqlite3
import subprocess
import tempfile
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import data_store
from data_store import load_family

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "family_vault.db"
BACKUP_DIR = ROOT / "backups"
MANIFEST = BACKUP_DIR / "manifest.json"
MAGIC = b"FAMILYVAULTDB1"
SALT_BYTES = 16
NONCE_BYTES = 12
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_MAXMEM = 64 * 1024 * 1024


class BackupError(RuntimeError):
    pass


def passphrase() -> bytes:
    value = os.environ.get("FAMILY_VAULT_BACKUP_PASSPHRASE")
    if not value:
        raise BackupError("Set FAMILY_VAULT_BACKUP_PASSPHRASE before creating, verifying, or restoring a backup.")
    return value.encode("utf-8")


def derive_key(secret: bytes, salt: bytes) -> bytes:
    try:
        return hashlib.scrypt(secret, salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, maxmem=SCRYPT_MAXMEM, dklen=32)
    except ValueError as error:
        raise BackupError("Unable to derive the backup key on this host.") from error


def encrypt(plaintext: bytes, secret: bytes) -> bytes:
    salt = secrets.token_bytes(SALT_BYTES)
    nonce = secrets.token_bytes(NONCE_BYTES)
    ciphertext = AESGCM(derive_key(secret, salt)).encrypt(nonce, plaintext, MAGIC)
    return MAGIC + salt + nonce + ciphertext


def decrypt(payload: bytes, secret: bytes) -> bytes:
    minimum = len(MAGIC) + SALT_BYTES + NONCE_BYTES + 16
    if len(payload) < minimum or payload[:len(MAGIC)] != MAGIC:
        raise BackupError("This is not a Family Vault encrypted database backup.")
    salt_start = len(MAGIC)
    salt_end = salt_start + SALT_BYTES
    nonce_end = salt_end + NONCE_BYTES
    try:
        return AESGCM(derive_key(secret, payload[salt_start:salt_end])).decrypt(
            payload[salt_end:nonce_end], payload[nonce_end:], MAGIC
        )
    except Exception as error:
        raise BackupError("Backup decryption failed. Check the passphrase and file integrity.") from error


def sqlite_snapshot(database: Path | None = None) -> bytes:
    database = database or DATABASE
    if not database.exists():
        raise BackupError(f"Operational database not found: {database}")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as handle:
        snapshot = Path(handle.name)
    source: sqlite3.Connection | None = None
    destination: sqlite3.Connection | None = None
    try:
        source = sqlite3.connect(database)
        destination = sqlite3.connect(snapshot)
        source.backup(destination)
        destination.close()
        destination = None
        source.close()
        source = None
        validate_sqlite(snapshot)
        return snapshot.read_bytes()
    finally:
        if destination is not None:
            destination.close()
        if source is not None:
            source.close()
        snapshot.unlink(missing_ok=True)


def validate_sqlite(database: Path) -> None:
    connection: sqlite3.Connection | None = None
    try:
        connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
        result = connection.execute("PRAGMA integrity_check").fetchone()[0]
    except sqlite3.Error as error:
        raise BackupError("Decrypted backup is not a readable SQLite database.") from error
    finally:
        if connection is not None:
            connection.close()
    if result != "ok":
        raise BackupError(f"SQLite integrity check failed: {result}")


def read_manifest() -> list[dict[str, Any]]:
    if not MANIFEST.exists():
        return []
    try:
        content = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise BackupError("Backup manifest is invalid JSON.") from error
    if not isinstance(content, list):
        raise BackupError("Backup manifest must contain a list.")
    return content


def write_manifest(entries: list[dict[str, Any]]) -> None:
    BACKUP_DIR.mkdir(exist_ok=True)
    MANIFEST.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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
    try:
        result = subprocess.run(["git", *arguments], cwd=ROOT, check=False, text=True, capture_output=True)
    except FileNotFoundError as error:
        if required:
            raise BackupError("Git is not installed or unavailable on PATH.") from error
        return None
    if required and result.returncode:
        message = result.stderr.strip() or result.stdout.strip() or "Git command failed."
        raise BackupError(message)
    return result


def git_backup(backup_file: Path, push: bool) -> str:
    if git(["rev-parse", "--is-inside-work-tree"], required=False) is None:
        return "Local encrypted backup created; Git is unavailable."
    repository = git(["rev-parse", "--is-inside-work-tree"], required=False)
    if repository is None or repository.returncode != 0:
        return "Local encrypted backup created; initialize Git to record it."
    tracked = git(["ls-files", "--error-unmatch", "family_vault.db"], required=False)
    if tracked and tracked.returncode == 0:
        raise BackupError("Plaintext family_vault.db is tracked. Remove it from Git before backing up.")
    git(["add", "family.yaml", str(backup_file.relative_to(ROOT)), str(MANIFEST.relative_to(ROOT))])
    diff = git(["diff", "--cached", "--quiet"], required=False)
    if diff and diff.returncode == 1:
        git(["commit", "-m", f"backup: family vault {backup_file.stem}\n\nGenerated with BEACON"])
    message = "Encrypted backup committed locally."
    if push:
        remote = git(["remote", "get-url", "origin"], required=False)
        if remote and remote.returncode == 0:
            git(["push", "origin", "HEAD"])
            message = "Encrypted backup committed and pushed to origin."
        else:
            message += " Push skipped because origin is not configured."
    return message


def main() -> None:
    parser = argparse.ArgumentParser(description="Create, verify, restore, and synchronize encrypted Family Vault backups.")
    commands = parser.add_subparsers(dest="command", required=True)
    backup_command = commands.add_parser("backup", help="Create an encrypted SQLite snapshot.")
    backup_command.add_argument("--commit", action="store_true", help="Commit family.yaml, snapshot, and manifest to Git.")
    backup_command.add_argument("--push", action="store_true", help="Push the Git commit to origin; implies --commit.")
    verify_command = commands.add_parser("verify-backup", help="Decrypt and run SQLite integrity check.")
    verify_command.add_argument("backup_file", type=Path)
    restore_command = commands.add_parser("restore", help="Restore an encrypted snapshot after integrity validation.")
    restore_command.add_argument("backup_file", type=Path)
    args = parser.parse_args()
    if args.command == "backup":
        backup_file = create_backup()
        print(f"Created encrypted snapshot: {backup_file.relative_to(ROOT)}")
        if args.commit or args.push:
            print(git_backup(backup_file, args.push))
    elif args.command == "verify-backup":
        verify_backup(args.backup_file)
        print("Encrypted backup passed decryption and SQLite integrity checks.")
    else:
        restore_backup(args.backup_file)
        print("Encrypted backup restored after SQLite integrity verification.")


if __name__ == "__main__":
    try:
        main()
    except BackupError as error:
        raise SystemExit(f"Backup error: {error}")

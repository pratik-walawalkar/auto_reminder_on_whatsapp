from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FAMILY_FILE = ROOT / "family.yaml"
DATABASE = ROOT / "family_vault.db"
BACKUP_DIR = ROOT / "backups"
MANIFEST = BACKUP_DIR / "manifest.json"


def session_secret() -> str:
    return os.environ.get("FAMILY_VAULT_SECRET") or ""


def backup_passphrase() -> str:
    return os.environ.get("FAMILY_VAULT_BACKUP_PASSPHRASE") or ""



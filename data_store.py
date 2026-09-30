from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
import os
import tempfile
from pathlib import Path
from threading import RLock
from typing import Any

import yaml

from config import FAMILY_FILE as DEFAULT_FAMILY_FILE, ROOT as PROJECT_ROOT
from domain.domain_validation import (
    DATE_PATTERN,
    ID_PATTERN,
    TAG_PATTERN,
    MAX_TAGS_PER_PERSON,
    DataValidationError,
    validate_family,
)
from domain.family_relationships import detach_relationships, remove_person, resolve_relationship
from domain.person_ids import birth_year, generate_person_id, generate_union_id

ROOT = PROJECT_ROOT
FAMILY_FILE = DEFAULT_FAMILY_FILE
LOCK = RLock()


def load_family() -> dict[str, Any]:
    with LOCK, FAMILY_FILE.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    validate_family(data)
    return data


def save_family(data: dict[str, Any]) -> None:
    validate_family(data)
    data = deepcopy(data)
    data.setdefault("metadata", {})["last_updated"] = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    with LOCK:
        descriptor, temp_path = tempfile.mkstemp(prefix="family-", suffix=".yaml", dir=ROOT, text=True)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                yaml.safe_dump(data, handle, allow_unicode=True, default_flow_style=False, sort_keys=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, FAMILY_FILE)
        except Exception:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
            raise



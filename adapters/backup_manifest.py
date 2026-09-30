from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read(path: Path, error_type: type[Exception]) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise error_type("Backup manifest is invalid JSON.") from error
    if not isinstance(content, list):
        raise error_type("Backup manifest must contain a list.")
    return content


def write(directory: Path, path: Path, entries: list[dict[str, Any]]) -> None:
    directory.mkdir(exist_ok=True)
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")



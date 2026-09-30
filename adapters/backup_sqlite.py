from __future__ import annotations

from pathlib import Path
import sqlite3
import tempfile
from typing import Callable


def snapshot(database: Path, validate: Callable[[Path], None]) -> bytes:
    if not database.exists():
        raise RuntimeError(f"Operational database not found: {database}")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as handle:
        snapshot_path = Path(handle.name)
    source: sqlite3.Connection | None = None
    destination: sqlite3.Connection | None = None
    try:
        source = sqlite3.connect(database)
        destination = sqlite3.connect(snapshot_path)
        source.backup(destination)
        destination.close()
        destination = None
        source.close()
        source = None
        validate(snapshot_path)
        return snapshot_path.read_bytes()
    finally:
        if destination is not None:
            destination.close()
        if source is not None:
            source.close()
        snapshot_path.unlink(missing_ok=True)


def validate(database: Path) -> None:
    connection: sqlite3.Connection | None = None
    try:
        connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
        result = connection.execute("PRAGMA integrity_check").fetchone()[0]
    except sqlite3.Error as error:
        raise RuntimeError("Decrypted backup is not a readable SQLite database.") from error
    finally:
        if connection is not None:
            connection.close()
    if result != "ok":
        raise RuntimeError(f"SQLite integrity check failed: {result}")



from __future__ import annotations

import argparse
from pathlib import Path
from typing import Callable


def run(
    create_backup: Callable[[], Path],
    verify_backup: Callable[[Path], None],
    restore_backup: Callable[[Path], None],
    git_backup: Callable[[Path, bool], str],
    root: Path,
    argv: list[str] | None = None,
) -> None:
    parser = argparse.ArgumentParser(description="Create, verify, restore, and synchronize encrypted Family Vault backups.")
    commands = parser.add_subparsers(dest="command", required=True)
    backup_command = commands.add_parser("backup", help="Create an encrypted SQLite snapshot.")
    backup_command.add_argument("--commit", action="store_true", help="Commit family.yaml, snapshot, and manifest to Git.")
    backup_command.add_argument("--push", action="store_true", help="Push the Git commit to origin; implies --commit.")
    verify_command = commands.add_parser("verify-backup", help="Decrypt and run SQLite integrity check.")
    verify_command.add_argument("backup_file", type=Path)
    restore_command = commands.add_parser("restore", help="Restore an encrypted snapshot after integrity validation.")
    restore_command.add_argument("backup_file", type=Path)
    args = parser.parse_args(argv)
    if args.command == "backup":
        backup_file = create_backup()
        print(f"Created encrypted snapshot: {backup_file.relative_to(root)}")
        if args.commit or args.push:
            print(git_backup(backup_file, args.push))
    elif args.command == "verify-backup":
        verify_backup(args.backup_file)
        print("Encrypted backup passed decryption and SQLite integrity checks.")
    else:
        restore_backup(args.backup_file)
        print("Encrypted backup restored after SQLite integrity verification.")



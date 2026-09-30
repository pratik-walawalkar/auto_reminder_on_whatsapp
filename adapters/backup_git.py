from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Callable


def run_git(root: Path, arguments: list[str], required: bool, error_type: type[Exception]):
    try:
        result = subprocess.run(["git", *arguments], cwd=root, check=False, text=True, capture_output=True)
    except FileNotFoundError as error:
        if required:
            raise error_type("Git is not installed or unavailable on PATH.") from error
        return None
    if required and result.returncode:
        message = result.stderr.strip() or result.stdout.strip() or "Git command failed."
        raise error_type(message)
    return result


def backup(
    root: Path,
    backup_dir: Path,
    manifest: Path,
    backup_file: Path,
    push: bool,
    error_type: type[Exception],
    git_runner: Callable[..., Any] = run_git,
) -> str:
    if git_runner(root, ["rev-parse", "--is-inside-work-tree"], required=False, error_type=error_type) is None:
        return "Local encrypted backup created; Git is unavailable."
    repository = git_runner(root, ["rev-parse", "--is-inside-work-tree"], required=False, error_type=error_type)
    if repository is None or repository.returncode != 0:
        return "Local encrypted backup created; initialize Git to record it."
    tracked = git_runner(root, ["ls-files", "--error-unmatch", "family_vault.db"], required=False, error_type=error_type)
    if tracked and tracked.returncode == 0:
        raise error_type("Plaintext family_vault.db is tracked. Remove it from Git before backing up.")
    git_runner(root, ["add", "family.yaml", str(backup_file.relative_to(root)), str(manifest.relative_to(root))], required=True, error_type=error_type)
    diff = git_runner(root, ["diff", "--cached", "--quiet"], required=False, error_type=error_type)
    if diff and diff.returncode == 1:
        git_runner(root, ["commit", "-m", f"backup: family vault {backup_file.stem}\n\nGenerated with BEACON"], required=True, error_type=error_type)
    message = "Encrypted backup committed locally."
    if push:
        remote = git_runner(root, ["remote", "get-url", "origin"], required=False, error_type=error_type)
        if remote and remote.returncode == 0:
            git_runner(root, ["push", "origin", "HEAD"], required=True, error_type=error_type)
            message = "Encrypted backup committed and pushed to origin."
        else:
            message += " Push skipped because origin is not configured."
    return message



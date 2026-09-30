from __future__ import annotations

from pathlib import Path

import backup
import data_store
import gedcom
import ingest
import server

import adapters.gedcom_adapter
import cli.ingest_cli
import domain.domain_validation
import web.web_auth


def test_legacy_facades_export_expected_entrypoints():
    assert callable(server.main)
    assert callable(server.db)
    assert callable(data_store.load_family)
    assert callable(backup.create_backup)
    assert callable(gedcom.build_gedcom)
    assert callable(ingest.add_person)


def test_server_keeps_public_route_endpoints():
    routes = {rule.rule for rule in server.app.url_map.iter_rules()}
    assert {"/", "/help", "/api/login", "/api/family", "/api/proposals", "/api/export/gedcom"} <= routes


def test_shell_loads_frontend_modules_before_entrypoint():
    source = Path("templates/shell.html").read_text(encoding="utf-8")
    modules = [
        "/static/js/core.js",
        "/static/js/tree-data.js",
        "/static/js/tree-layout.js",
        "/static/js/tree-edges.js",
        "/static/js/tree-animation.js",
        "/static/js/tree-lineage.js",
        "/static/js/tree-interactions.js",
        "/static/js/tree-lifecycle.js",
        "/static/js/panel-forms.js",
        "/static/js/panel-controller.js",
        "/static/js/admin-ui.js",
        "/static/js/admin-controller.js",
        "/static/js/export-utils.js",
        "/static/js/account-ui.js",
        "/static/app.js",
    ]
    positions = [source.index(module) for module in modules]
    assert positions == sorted(positions)


def test_backup_git_wrapper_delegates_through_legacy_git_hook(monkeypatch, tmp_path):
    backup_file = tmp_path / "backups" / "snapshot.db.enc"
    manifest = tmp_path / "backups" / "manifest.json"
    backup_file.parent.mkdir()
    backup_file.write_bytes(b"encrypted")
    manifest.write_text("[]\n", encoding="utf-8")
    monkeypatch.setattr(backup, "ROOT", tmp_path)
    monkeypatch.setattr(backup, "BACKUP_DIR", backup_file.parent)
    monkeypatch.setattr(backup, "MANIFEST", manifest)

    def fake_git(arguments, required=True):
        class Result:
            returncode = 1
            stdout = ""
            stderr = ""
        return Result()

    monkeypatch.setattr(backup, "git", fake_git)
    assert "initialize Git" in backup.git_backup(backup_file, push=False)



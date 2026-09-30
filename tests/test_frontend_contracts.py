from __future__ import annotations

from pathlib import Path

import server


ROOT = Path(__file__).parent.parent
STATIC = ROOT / "static"


def read_frontend(path: str) -> str:
    return (STATIC / path).read_text(encoding="utf-8")


def test_tree_interaction_modules_keep_browser_event_contracts():
    source = read_frontend("js/tree-interactions.js")

    for event in (
        "stabilizationIterationsDone",
        "dragStart",
        "dragEnd",
        "hoverNode",
        "blurNode",
        "mousemove",
        "afterDrawing",
        "zoom",
        "doubleClick",
    ):
        assert f"network.on('{event}'" in source
    assert "api('/api/family/positions'" in source
    assert "applyLineageHover" in source
    assert "focusSearchMatch" in source
    assert "query && matchedIds.size" in source
    assert "isShiftPressed()" in source


def test_theme_toggle_uses_accessible_switch_markup():
    app = read_frontend("../static/app.js")
    shell = (ROOT / "templates" / "shell.html").read_text(encoding="utf-8")

    assert 'role="switch"' in shell
    assert 'aria-checked="false"' in shell
    assert "theme-switch-thumb" in shell
    assert "theme-switch-scene" in shell
    assert "setAttribute('aria-checked', String(isLight))" in app
    assert "theme-switch-icon" in app


def test_panel_and_admin_controllers_keep_form_submission_contracts():
    panel = read_frontend("js/panel-controller.js")
    admin = read_frontend("js/admin-controller.js")

    assert "function panelOpenPanel" in panel
    assert "async function panelSubmitProposal" in panel
    assert "async function panelSubmitDeleteProposal" in panel
    assert "new FormData(event.target)" in panel
    assert "'/api/proposals'" in panel
    assert "async function adminOpenReviews" in admin
    assert "async function adminOpenUsers" in admin
    assert "'/api/admin/users'" in admin
    assert "data-role-toggle" in admin
    assert "data-reset-password" in admin


def test_shell_loads_all_frontend_dependencies_before_app_entrypoint():
    shell = (ROOT / "templates" / "shell.html").read_text(encoding="utf-8")
    modules = [
        "core.js",
        "tree-data.js",
        "tree-layout.js",
        "tree-edges.js",
        "tree-animation.js",
        "tree-lineage.js",
        "tree-interactions.js",
        "tree-lifecycle.js",
        "panel-forms.js",
        "panel-controller.js",
        "admin-ui.js",
        "admin-controller.js",
        "export-utils.js",
        "account-ui.js",
        "app.js",
    ]
    positions = [shell.index(f"/static/js/{module}") if module != "app.js" else shell.index("/static/app.js") for module in modules]
    assert positions == sorted(positions)


def test_application_serves_extracted_frontend_modules():
    client = server.app.test_client()
    for module in (
        "tree-interactions.js",
        "panel-controller.js",
        "admin-controller.js",
    ):
        response = client.get(f"/static/js/{module}")
        assert response.status_code == 200
        assert response.data



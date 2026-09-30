from __future__ import annotations

from typing import Any, Callable

from flask import Flask, Response


def register_export_routes(
    app: Flask,
    load_family: Callable[[], dict[str, Any]],
    build_gedcom: Callable[[dict[str, Any]], str],
    audit: Callable[[str, dict[str, Any]], None],
    admin_required: Callable,
):
    @app.get("/api/export/gedcom")
    @admin_required
    def export_gedcom_route():
        content = build_gedcom(load_family())
        audit("gedcom_exported", {})
        return Response(
            content,
            mimetype="text/vnd.familysearch.gedcom",
            headers={"Content-Disposition": 'attachment; filename="family_vault.ged"'},
        )

    return export_gedcom_route



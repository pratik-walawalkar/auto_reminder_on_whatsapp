from __future__ import annotations

import sqlite3
from typing import Any, Callable

from flask import Flask, jsonify, request

from data_store import DataValidationError


def register_family_routes(
    app: Flask,
    load_family: Callable[[], dict[str, Any]],
    save_family: Callable[[dict[str, Any]], None],
    public_person: Callable[[dict[str, Any], bool], dict[str, Any]],
    current_user: Callable[[], sqlite3.Row | None],
    audit: Callable[[str, dict[str, Any]], None],
    login_required: Callable,
    csrf_required: Callable,
):
    @app.get("/api/family")
    @login_required
    def family():
        data = load_family()
        viewer_is_admin = current_user()["role"] == "admin"
        data["individuals"] = [public_person(person, viewer_is_admin) for person in data["individuals"]]
        return jsonify(data)

    @app.patch("/api/family/positions")
    @login_required
    @csrf_required
    def update_positions():
        payload = request.get_json(silent=True) or {}
        positions = payload.get("positions")
        if not isinstance(positions, dict) or len(positions) > 1000:
            return jsonify(error="Positions must be an object."), 400
        family_data = load_family()
        people = {person["id"]: person for person in family_data["individuals"]}
        try:
            for person_id, position in positions.items():
                if person_id not in people or not isinstance(position, dict) or set(position) != {"x", "y"}:
                    raise DataValidationError("Invalid person position.")
                x, y = position["x"], position["y"]
                if isinstance(x, bool) or isinstance(y, bool) or not isinstance(x, (int, float)) or not isinstance(y, (int, float)) or abs(x) > 1000000 or abs(y) > 1000000:
                    raise DataValidationError("Invalid person position.")
                people[person_id]["position"] = {"x": x, "y": y}
            save_family(family_data)
        except DataValidationError as error:
            return jsonify(error=str(error)), 400
        audit("family_positions_updated", {"count": len(positions)})
        return jsonify(status="saved", count=len(positions))

    return family, update_positions



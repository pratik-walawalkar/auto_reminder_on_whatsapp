from __future__ import annotations

import html
from pathlib import Path
from typing import Callable

import markdown
from flask import Flask, render_template


def register_page_routes(app: Flask, root: Path, login_required: Callable):
    def shell():
        return render_template("shell.html")

    @login_required
    def help_guide():
        source = root / "docs" / "USER_GUIDE.md"
        content = markdown.markdown(html.escape(source.read_text(encoding="utf-8")), extensions=["tables"])
        return render_template("help.html", content=content)

    app.add_url_rule("/", endpoint="shell", view_func=shell, methods=["GET"])
    app.add_url_rule("/help", endpoint="help_guide", view_func=help_guide, methods=["GET"])
    return shell, help_guide



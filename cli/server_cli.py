from __future__ import annotations

import argparse
import os
from typing import Any, Callable


def run(
    app: Any,
    init_database: Callable[[], None],
    create_user: Callable[[str, str, str, str], None],
    argv: list[str] | None = None,
) -> None:
    parser = argparse.ArgumentParser(description="Run the Family Vault server.")
    parser.add_argument("--host", default="127.0.0.1", help="Use this PC's Tailnet IP for family access.")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--create-user", action="store_true")
    parser.add_argument("--username")
    parser.add_argument("--display-name")
    parser.add_argument("--password")
    parser.add_argument("--role", choices=("admin", "member"), default="member")
    args = parser.parse_args(argv)
    init_database()
    if args.create_user:
        if not all((args.username, args.display_name, args.password)):
            parser.error("--create-user requires --username, --display-name, and --password.")
        create_user(args.username, args.display_name, args.password, args.role)
        return
    if not os.environ.get("FAMILY_VAULT_SECRET"):
        print("Warning: FAMILY_VAULT_SECRET is not set; sessions will end when the server restarts.")
    app.run(host=args.host, port=args.port, debug=False)



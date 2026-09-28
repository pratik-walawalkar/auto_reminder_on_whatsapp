# Family Vault developer guide

## Purpose and trust boundary

Family Vault is a self-hosted, Tailnet-accessible genealogy application. `family.yaml` is the canonical family ledger. SQLite stores application-only state: user accounts, password hashes, session-independent proposals, and audit records.

The application must be bound to a Tailnet IP or localhost, not a public interface. Tailnet network access does not replace application login, CSRF protection, administrator approval, or encrypted backups.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `server.py` | Flask routes, authentication, proposals, approval, user CLI, and app startup. |
| `data_store.py` | YAML loading, relationship validation, and atomic ledger writes. |
| `family.yaml` | Canonical versioned genealogy ledger. |
| `family_vault.db` | Local operational database; never commit plaintext. |
| `ingest.py` | Structured CLI validation/import tool; also exposes `export-gedcom`. |
| `backup.py` | Encrypted SQLite snapshot, restore, verification, and Git synchronization CLI. |
| `gedcom.py` | Standalone GEDCOM 5.5.1 exporter (no Gramps dependency) used by `ingest.py` and the admin export route. |
| `templates/`, `static/` | Local-only responsive web client (animated knowledge-graph tree, light/dark theme) and help view. Toolbar styling is isolated in `static/app.css` under `--tb-*` tokens and semantic classes; legacy canvas variables remain unchanged. Classic Tree layout reserves each couple's full spouse footprint and anchors the blood relation at the slot's left edge so sibling cards cannot overlap a spouse. |
| `docs/USER_GUIDE.md` | Browser-accessible, non-technical user guide. |
| `REQUIREMENTS_AND_USE_CASES.md` | Living requirements and use-case register; update with every feature. |
| `tests/` | Isolated data, API, help, backup, recovery, and GEDCOM export tests. |

## Setup

Use Python 3.12 or newer.

```powershell
py -3 -m pip install -r requirements.txt
$env:FAMILY_VAULT_SECRET = "generate-a-long-random-session-secret"
$env:FAMILY_VAULT_BACKUP_PASSPHRASE = "store-this-long-random-passphrase-outside-git"
py -3 server.py --create-user --username admin --display-name "Family Admin" --password "long-password-here" --role admin
py -3 server.py --host <this-pc-tailnet-ip> --port 8080
```

Use a stable `FAMILY_VAULT_SECRET`; otherwise all sessions become invalid after a restart. Keep both secrets out of source control and out of the repository directory.

## Data model

### Individuals

Every individual needs a unique lowercase ID, `first_name`, `last_name`, `gender` (`M`, `F`, `NB`, or `U`), and a birth date (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, or `unknown`). Cultural metadata and migration history are optional.

Two optional fields support light record-keeping without a separate permissions system:

- `is_private` (bool): when true, `server.public_person()` strips `cultural_metadata`, `migration_history`, `biographical_notes`, and `birth_year`, and reports the birth date as `"private"`, for any viewer whose role is not `admin`. Administrators always see the full record. This is a coarse per-record flag, not per-field visibility.
- `tags` (list of str): up to `MAX_TAGS_PER_PERSON` (12) short strings matching `TAG_PATTERN` (`^[A-Za-z0-9 _-]{1,30}$`), deduplicated case-insensitively by both `data_store.validate_family` and `server.valid_person_payload`. Rendered as chips on tree nodes and in the detail panel; free-form, with no fixed taxonomy.

### Unions

Parentage is represented by `unions`, not duplicated per-person parent arrays. A union has one or two known partners and zero or more children. A child link is `biological`, `adoptive`, `step`, or `foster`.

The validator rejects duplicate IDs, unknown references, invalid link types, duplicate biological parent unions, self-child relationships, and ancestry cycles.

### Person IDs

IDs are not chosen by the contributor. `data_store.generate_person_id` derives an ID from `first_name`/`last_name` (e.g. `meera_surname`); on collision it appends the birth year, then falls back to a numeric suffix. `server.valid_person_payload` uses this whenever a request omits `id`, and `ingest.py` shares the same helper for CLI imports, so an ID is guaranteed unique and stable at proposal-creation time (before admin review), not re-derived at approval time.

### Deleting a person

`data_store.remove_person(family, person_id)` removes the individual and detaches them from every union: partner entries and child entries referencing them are stripped, and a union left with zero partners is dropped entirely (a union that still has one partner, or other children, is kept). Deletion is proposed and approved through the same `proposals` table as add/edit, using `kind = "delete"`; `target_id` holds the person to remove and no `person` payload is required.

## Editing flow

1. Members submit an add/edit/delete proposal through the web UI.
2. The server performs proposal validation but does not change the ledger.
3. An administrator approves or rejects it.
4. Approval updates `family.yaml` through a temporary file and atomic replace.
5. The server creates an encrypted database snapshot and commits/pushes backup material when configured.

Direct YAML edits are allowed only for controlled maintenance. Run `py -3 ingest.py validate` and the test suite afterward.

## Admin user management

`server.py` exposes an Immich-style admin user API on top of the existing local `users` table (no separate identity service):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/users` | List accounts (username, display name, role, created_at). |
| `POST /api/admin/users` | Create an account (`username`, `display_name`, `password`, `role`). |
| `PATCH /api/admin/users/<username>` | Update `display_name`, `role`, and/or `password` (any subset). |
| `DELETE /api/admin/users/<username>` | Remove an account. |

All routes require `@admin_required` and `@csrf_required`. Safeguards enforced server-side, not just in the UI:

- `admin_count()` blocks demoting or deleting the last remaining administrator.
- An administrator cannot delete their own account (`DELETE` on `actor()`).
- Deleting a user with pending proposals is rejected until those proposals are approved or rejected, so proposal history stays attributable.

The frontend's **Manage users** panel (`static/app.js:openUsers`) is the only place these endpoints are called from; there is still no self-registration route.

## Backup and recovery

`backup.py` creates AES-256-GCM encrypted snapshots using an scrypt-derived key. The passphrase comes only from `FAMILY_VAULT_BACKUP_PASSPHRASE` or explicit CLI input. Git tracks encrypted snapshots, `family.yaml`, and a backup manifest; it never tracks `family_vault.db`.

```powershell
$env:FAMILY_VAULT_BACKUP_PASSPHRASE = "..."
py -3 backup.py backup --commit --push
py -3 backup.py verify-backup backups\family_vault-YYYYMMDDTHHMMSSZ.db.enc
py -3 backup.py restore backups\family_vault-YYYYMMDDTHHMMSSZ.db.enc
```

To enable off-PC recovery:

```powershell
git init
git add .gitignore family.yaml docs requirements.txt pytest.ini server.py data_store.py ingest.py backup.py gedcom.py static templates tests .github REQUIREMENTS_AND_USE_CASES.md
git commit -m "chore: initialize Family Vault`n`nGenerated with BEACON"
git branch -M main
git remote add origin <private-github-repository-url>
git push -u origin main
```

A restore operation verifies the decrypted SQLite database before atomically replacing the local operational database. Test recovery periodically on a copy of the repository. A lost passphrase makes encrypted database snapshots unrecoverable.

## GEDCOM export

`gedcom.py` is a small, dependency-free GEDCOM 5.5.1 writer (`build_gedcom`, `export_gedcom`) â€” it does not use or embed the Gramps Desktop codebase (a large GTK/Celery/SQLAlchemy stack that was evaluated and rejected as too heavy for this project; see `gramps-web-reference/` and `gramps-web-api-reference/` if that evaluation needs to be revisited). It maps `individuals`/`unions` to INDI/FAM records: `NAME`/`SEX`/`BIRT`/`DEAT` with `DATE`/`PLAC`, `FAMC`/`FAMS` links, `HUSB`/`WIFE`/`CHIL`, and `MARR`. Cultural metadata, migration history, biographical notes, and tags are emitted as `NOTE` lines; a private person gets `1 RESN privacy`. Available via:

- CLI: `py -3 ingest.py export-gedcom [output.ged]`
- HTTP: `GET /api/export/gedcom` (`@admin_required`, streams `family_vault.ged`)

The resulting file imports into Gramps, Ancestry, MyHeritage, or any other GEDCOM-compatible tool.

## Frontend: knowledge-graph tree and theming

`static/app.js` positions each person absolutely inside `#treeCanvas` (row = generation, column = alphabetical within generation) and draws curved, gradient-stroked SVG edges between parents and children in `familyLinks`/`renderTree`. Node color rings are driven by CSS custom properties keyed off gender (`.m`/`.f`/`.nb`/`.u` classes map to `--male`/`--female`/`--nb`/`--unknown` tokens). Pan/zoom (`setPanZoom`) skips drag-start when the pointerdown originates on a `.person-node`, so clicks still open the side panel.

Theme: `data-theme="dark"|"light"` on `<html>` selects the token block in `static/app.css`; `applyTheme`/`toggleTheme` in `app.js` persist the choice to `localStorage` (`familyVaultTheme`) and default to the OS preference via `prefers-color-scheme` on first load. An inline blocking script in `templates/shell.html` sets the attribute before first paint to avoid a flash of the wrong theme. The visualization uses immutable `WORKSPACE_THEME_DARK` and `WORKSPACE_THEME_LIGHT` matrices, and a `MutationObserver` rebuilds the network and SVG overlay after theme changes while restoring the prior viewport and zoom. `templates/help.html` intentionally has no such script or other `<script>` tag (`test_help_requires_authentication_and_renders_user_guide` asserts the guide page ships script-free).

## Frontend layout and view modes

The authenticated shell is a fixed `100vh` flex column: `#vaultView` owns the header, controls, and flexing `#treeViewport`, while `html`/`body`/`#app` suppress page scrolling. Search lives in `.header-search`; `renderTree()` keeps eligible people in the dataset, sets unmatched node/edge opacity to `0.12`, and focuses the first match with `network.focus()`. Clearing the query restores opacity and the normal fit behavior.

The header profile module uses `#userProfileModule` and `#profilePopoverCard`. `initializeAvatarInitials()` derives initials from the authenticated `state.user.display_name`, falling back to `state.user.username`; the same targets are updated in the popover and profile modal. `applySavedAvatarData()` synchronizes a browser-local avatar image across all three views. Account actions, including **Manage Approvals**, are routed from the popover instead of occupying header space. The password form calls the existing administrator user-update endpoint and retains its minimum-length validation.

`state.viewMode` persists as `familyVaultView` (`organic` or `classic`). Organic uses repulsion physics and permits node dragging. Classic uses the earlier vis-network hierarchical layout with physics disabled, allowing spouse relationships to retain their earlier vertical linkage behavior. Custom SVG curve and moving-dot experiments are disabled. Holding Shift during an ancestral hover locks the lineage opacity state across `hoverNode`, `blurNode`, and `mousemove` transitions; releasing Shift explicitly resets it.

## Tests and validation

```powershell
py -3 ingest.py validate
py -3 -m pytest -p no:cacheprovider
node --check static\app.js
```

GitHub Actions runs these checks only; it does not deploy family data publicly.

## Feature-development rule

Every feature must:

1. update `REQUIREMENTS_AND_USE_CASES.md`;
2. update the user guide if behavior is visible to family members;
3. add or update automated tests;
4. preserve the private Tailnet-only deployment model; and
5. include backup/recovery impact in code review.

## Future integrations

Immich, Evolution API, WhatsApp, OCR, maps, and AI parsing are intentionally not coupled to the core. Integrate through disabled-by-default adapters, explicit configuration, schema validation, proposal creation, and administrator approval. Never give an external integration direct write access to `family.yaml`.

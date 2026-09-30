# Family Vault requirements and use cases

**Status:** Living document  
**Last updated:** 2026-09-29
**Update rule:** Every new feature, behavior change, integration, or security decision must update this file, related tests, and user-facing documentation in the same change set.

## Scope

Family Vault is a self-hosted, mobile-first genealogy tool for a private family Tailnet. It provides an interactive family tree, controlled contribution workflow, durable YAML ledger, and Git-based disaster-recovery backups.

## Personas

| Persona | Needs |
| --- | --- |
| Family member | View the full tree, search family history, and suggest corrections without technical knowledge. |
| Family administrator | Create accounts, review proposals, preserve accuracy, operate backups, and restore after an incident. |
| Developer/operator | Maintain the Tailnet-hosted app, data validation, automated tests, security configuration, and integrations. |

## Functional requirements

| ID | Requirement | Status | Verification |
| --- | --- | --- | --- |
| FR-01 | Only authenticated, administrator-created accounts may access family data. | Implemented | API authentication tests |
| FR-02 | All signed-in family accounts may view the complete tree. | Implemented | Authenticated family API test |
| FR-03 | Members may submit add/edit proposals without directly modifying the ledger. | Implemented | Proposal API tests |
| FR-04 | Administrators may approve or reject pending proposals. | Implemented | Approval/rejection tests |
| FR-05 | Approved changes must be validated and atomically written to `family.yaml`. | Implemented | Data-store and approval tests |
| FR-06 | The interface must support search, chronological filtering, node details, drag, zoom, and reset. | Implemented | Frontend syntax and HTTP smoke tests |
| FR-07 | New-person proposals may link a child to an existing family unit. | Implemented | Parent-union API tests |
| FR-08 | Users can open an authenticated in-app help guide. | Implemented | Help route/API test |
| FR-09 | Administrators can create accounts through a local CLI. | Implemented | Manual setup procedure |
| FR-10 | Approved ledger changes trigger an encrypted database backup and Git commit. | Implemented | Approval and backup tests |
| FR-11 | An operator can verify and restore an encrypted database snapshot. | Implemented | Backup restore tests |
| FR-12 | Optional external integrations create reviewable proposals only. | Deferred | Adapter tests when implemented |
| FR-13 | Clicking a node or "+ Add family member" opens one right-side panel for viewing/adding/editing; selecting another node updates the same panel without closing it. | Implemented | Frontend syntax and HTTP smoke tests |
| FR-14 | New-person IDs are generated automatically from first and last name, falling back to birth year then a numeric suffix on collision; manual ID entry is optional. | Implemented | `generate_person_id` unit tests, proposal API tests |
| FR-15 | Birth date is optional on add/edit; omitted dates are stored as `unknown`. | Implemented | Proposal API tests |
| FR-16 | Editing a person preserves fields not exposed in the edit form (e.g. migration history). | Implemented | Edit-proposal API test |
| FR-17 | Members may propose deleting a person from the right-side panel; deletion requires administrator approval like any other change. | Implemented | Delete-proposal API tests |
| FR-18 | Deleting a person detaches them from every union; a union left with no partners is removed, but unions with a remaining partner and their other children are preserved. | Implemented | `remove_person` unit tests, delete-proposal API test |
| FR-19 | Administrators can list, create, change the role of, reset the password of, and delete family accounts from the web UI, without shell access. | Implemented | Admin user-management API tests |
| FR-20 | Signed-in users can change their own password after entering the current password and meeting the password policy; the UI reports requirements in realtime. | Implemented | Self-service password API tests and frontend source checks |
| FR-21 | The system always keeps at least one administrator account: demoting or deleting the last admin is rejected. | Implemented | Admin user-management API tests |
| FR-22 | An administrator cannot delete their own account (self-lockout protection). | Implemented | Admin user-management API test |
| FR-23 | A person can be marked private; non-admin viewers see only name and place, with birth date shown as "private" and cultural/migration/notes fields hidden, while administrators always see full detail. | Implemented | `public_person` API test |
| FR-24 | A person may carry up to 12 short free-text tags (deduplicated case-insensitively) shown as chips on the tree node and in the detail panel. | Implemented | Tag validation unit tests, proposal API test |
| FR-25 | An administrator can export the full family ledger as a standard GEDCOM 5.5.1 file for use in Gramps, Ancestry, MyHeritage, or other genealogy tools. | Implemented | GEDCOM builder unit tests, export-route API test |
| FR-26 | The interface offers a light/dark theme toggle that persists across sessions and defaults to the visitor's OS preference. | Implemented | Frontend syntax and HTTP smoke tests |
| FR-27 | The authenticated dashboard fits the viewport without page scrolling, keeps search in the master header, highlights matching nodes while dimming unmatched nodes and edges, and supports persisted Organic and top-down Classic Tree views. | Implemented | Frontend syntax and Playwright smoke tests |
| FR-28 | Classic Tree places spouses side-by-side on the same generation tier, reserves a complete horizontal slot for each couple (including spouse gap), routes their children from the midpoint of the couple without overlapping sibling cards, and centers parents over all their children (including grafted cross-branch marriages) for visual cohesion. | Implemented | Frontend regression checks, layout geometry tests, and Playwright smoke tests |
| FR-29 | Classic Tree uses the earlier vis-network hierarchy with vertical spouse linkage; experimental custom curve and moving-dot overlays are not part of the active layout. | Implemented | Frontend syntax and Playwright smoke tests |
| FR-30 | Holding Shift while hovering a person locks the ancestral highlight until Shift is released, allowing movement to and double-click editing of an ancestor without resetting dimmed branches. | Implemented | Frontend source regression checks and Playwright interaction diagnostics |
| FR-31 | The authenticated dashboard toolbar uses isolated `--tb-*` design tokens, consistent control geometry, semantic view/action groups, responsive wrapping, persisted light/dark themes, and a warm ivory light palette without mutating legacy canvas variables. | Implemented | Playwright visual and computed-style checks |
| FR-32 | Switching themes dynamically rebuilds all canvas node, edge, text, arrow, and animated-overlay styles from isolated dark/light matrices while preserving the current viewport position and zoom. | Implemented | Theme-isolation regression test and Playwright toggle cycle |
| FR-33 | Authenticated users can open an Appearance & Layout panel whose controls are specific to the active view: Classic Tree exposes presets and geometric spacing, Organic exposes node distance and physics behavior, and shared edge styling remains available in both; settings persist locally and can be reset to defaults. Organic physics Off must retain the current Organic positions when toggled, stop automatic motion without fixing visible nodes, keep nodes draggable, and keep relationship hubs at their rendered positions; switching back On restores the normal dynamic Organic simulation. | Implemented | Playwright view-specific visibility, persistence/reset, and no-physics rendering tests |

## Data and integrity requirements

| ID | Requirement | Status |
| --- | --- | --- |
| DR-01 | `family.yaml` is the canonical genealogy source of truth. | Implemented |
| DR-02 | SQLite stores accounts, proposals, and audit records only. | Implemented |
| DR-03 | Person and union IDs must be unique and reference valid records. | Implemented |
| DR-04 | Parent-child links must reject cycles and invalid biological parentage. | Implemented |
| DR-05 | Plaintext SQLite data must never be committed to Git. | Implemented via `.gitignore` and backup enforcement |
| DR-06 | Git recovery backups include `family.yaml` and encrypted SQLite snapshots. | Implemented |

## Security and operational requirements

| ID | Requirement | Status |
| --- | --- | --- |
| SR-01 | App access is limited to the Tailnet or localhost; no public deployment. | Operational requirement |
| SR-02 | Passwords are stored as hashes, never plaintext. | Implemented |
| SR-03 | State-changing HTTP endpoints require a signed-in session and CSRF token. | Implemented |
| SR-09 | Self-service password changes require the current password and a new password with at least 12 characters, uppercase, lowercase, number, and special character. | Implemented |
| SR-04 | Session cookies must be HTTP-only and SameSite Lax. | Implemented |
| SR-05 | Snapshot encryption uses AES-256-GCM with scrypt key derivation and a unique salt. | Implemented |
| SR-06 | Encryption passphrases and session secrets must remain outside Git and logs. | Implemented |
| SR-07 | Backup restores must validate SQLite before replacing the live database. | Implemented |
| SR-08 | Regular restoration exercises are required before relying on recovery backups. | Operational requirement |

## Use cases

### UC-01: Explore family history

**Actor:** Family member  
**Preconditions:** User is signed in through the Tailnet.  
**Flow:** User searches, adjusts the year slider, drags/zooms the tree, and opens a person card.  
**Outcome:** User sees the permitted family information without modifying data.

### UC-02: Propose a new person

**Actor:** Family member  
**Preconditions:** User is signed in and has verified the information.  
**Flow:** User selects **+ Add family member**, which opens the right-side panel; completes required fields (an ID is generated automatically from the name if left blank; birth date may be left blank), optionally selects a parent family unit, and submits.  
**Outcome:** A pending proposal is recorded with a stable generated or chosen ID; the official ledger is unchanged.

### UC-02b: Propose an edit by switching between nodes

**Actor:** Family member  
**Preconditions:** User is signed in and viewing the tree.  
**Flow:** User clicks a node, which opens the right-side panel pre-filled with that person's details; user edits fields and submits, or clicks a different node while the panel is open, which refreshes the same panel with the newly selected person.  
**Outcome:** A pending edit proposal is recorded per submission; fields not shown in the form (e.g. migration history) are preserved unchanged.

### UC-03: Review a proposal

**Actor:** Family administrator  
**Preconditions:** A pending proposal exists.  
**Flow:** Administrator opens **Review proposals**, checks evidence, and approves or rejects.  
**Outcome:** Approval atomically updates the ledger; rejection records a decision without changing it.

### UC-04: Recover after device loss

**Actor:** Family administrator  
**Preconditions:** Private GitHub repository and backup passphrase are available.  
**Flow:** Operator clones the repository, restores a selected encrypted snapshot, validates the ledger, configures secrets, and starts the service.  
**Outcome:** Accounts, proposals, audit data, and the family ledger are restored.

### UC-05: Propose removing a person

**Actor:** Family member  
**Preconditions:** User is signed in and has selected the person to remove.  
**Flow:** User opens the person's right-side panel, selects **Delete this person**, and confirms.  
**Outcome:** A pending delete proposal is recorded; the official ledger is unchanged until an administrator approves it, at which point the person is removed and detached from every family unit.

### UC-06: Manage family accounts

**Actor:** Family administrator  
**Preconditions:** Administrator is signed in.  
**Flow:** Administrator opens **Manage users**, creates a new account with a temporary password and role, or changes an existing account's role, resets its password, or deletes it.  
**Outcome:** The family member can sign in with their own credentials; at least one administrator account always remains; an administrator cannot delete their own account or demote themselves if they are the last admin.

### UC-07: Change own password

**Actor:** Authenticated family member
**Preconditions:** User is signed in and knows their current password.
**Flow:** User opens **Manage Profile & Security**, enters the current password and a new password. The modal updates password-policy indicators in realtime; submission requires every indicator to pass.
**Outcome:** The server verifies the current password, hashes the new password, records an audit event, and updates the account.

## Deferred use cases

- Photo attachment and lookup through Immich.
- Evolution API/WhatsApp message ingestion.
- OCR extraction from family documents.
- Migration map with locally controlled geocoding.
- Self-service invitation workflows (self-registration remains disabled; accounts are admin-managed).
- Fine-grained visibility controls for living people beyond the single private/public flag.

## Change log

| Date | Change |
| --- | --- |
| 2026-09-21 | Created initial requirements, use cases, privacy constraints, and acceptance traceability. |
| 2026-09-21 | Added authenticated user help, developer/user documentation, encrypted SQLite snapshots, Git synchronization, and recovery validation. |
| 2026-09-21 | Replaced separate view/add/edit sheets with one right-side panel supporting live node switching; added automatic name-based person-ID generation with year/suffix fallback; made birth date optional; edits now preserve fields not shown in the form. |
| 2026-09-21 | Fixed a pan/zoom regression that swallowed node clicks so the right-side panel never opened. Added member-submittable, admin-approved delete proposals with referential cleanup (`remove_person`). Added an Immich-style admin user-management API and "Manage users" panel: list, create, change role, reset password, and delete accounts, with safeguards preventing the last administrator from being demoted, deleted, or self-deleted. |
| 2026-09-29 | Added self-service password changes with current-password verification, realtime password-policy indicators, matching frontend/backend validation, and API tests. |
| 2026-09-22 | Consolidated search into the header, added match focus/dimming, fixed viewport fitting and action-row alignment, and introduced persisted Organic/Classic Tree modes with top-down generation lanes. |
| 2026-09-30 | Completed the modular package reorganization under `domain/`, `adapters/`, `cli/`, `web/`, `infrastructure/`, and `compat/`; added Playwright authenticated smoke tests, frontend contract coverage, and encoding-safe theme icons without changing public entrypoints or data contracts. |
| 2026-09-30 | Added the Appearance & Layout panel with persisted settings, then refined it so Classic Tree and Organic views show only their relevant controls while shared edge styling remains available. |
| 2026-09-21 | Added a per-person `is_private` flag (redacts sensitive fields from non-admin viewers) and up to 12 free-text `tags` per person, exposed in the add/edit form and as chips on tree nodes. Added standalone GEDCOM 5.5.1 export (`gedcom.py`, `ingest.py export-gedcom`, admin-only `GET /api/export/gedcom`) so the ledger can be imported into Gramps or other genealogy tools without depending on the Gramps codebase. Redesigned the frontend as an animated, theme-aware "knowledge graph": gradient-stroked curved edges, glassmorphic panels, avatar-initial nodes with color-coded rings and tag chips, and a persistent light/dark theme toggle. |

from __future__ import annotations

import json

import data_store
import server
from conftest import login


def csrf(token: str) -> dict[str, str]:
    return {"X-CSRF-Token": token}


def create_add_proposal(client, token, person) -> int:
    response = client.post("/api/proposals", json={"kind": "add", "person": person}, headers=csrf(token))
    assert response.status_code == 201
    return response.get_json()["id"]


def test_login_rejects_invalid_credentials_and_returns_session_details(client):
    rejected = client.post("/api/login", json={"username": "memberuser", "password": "wrong-password"})
    accepted = client.post("/api/login", json={"username": "MEMBERUSER", "password": "member-password-123"})

    assert rejected.status_code == 401
    assert accepted.status_code == 200
    body = accepted.get_json()
    assert body["user"] == {"username": "memberuser", "display_name": "Member User", "role": "member"}
    assert body["csrf_token"]


def test_help_requires_authentication_and_renders_user_guide(client, member_token):
    assert server.app.test_client().get("/help").status_code == 401

    response = client.get("/help")

    assert response.status_code == 200
    assert b"Suggest a new family member" in response.data
    assert b"<script" not in response.data


def test_shell_exposes_viewport_controls_and_consolidated_search(client):
    response = client.get("/")

    assert response.status_code == 200
    assert b'class="header-search"' in response.data
    assert b'id="searchInput"' in response.data
    assert b'id="organicView"' in response.data
    assert b'id="classicView"' in response.data


def test_theme_switch_rebuilds_canvas_with_isolated_palettes():
    source = server.app.test_client().get("/static/app.js").data.decode()

    assert "const WORKSPACE_THEME_DARK = Object.freeze" in source
    assert "const WORKSPACE_THEME_LIGHT = Object.freeze" in source
    assert "function getCurrentThemeStyle()" in source
    assert "function executeThemeCanvasRefresh()" in source
    assert "const themeObserver = new MutationObserver" in source
    assert "themeObserver.observe(document.documentElement, {attributes: true})" in source
    assert "teardownNetwork();" in source
    assert "network.moveTo({position: view, scale, animation: false})" in source
    assert "activeTheme.nodeBorderMale" in source
    assert "activeTheme.nodeBorderFemale" in source
    assert "themeColors.edge" in source


def test_shell_documents_same_tier_spouse_layout():

    response = server.app.test_client().get("/")
    assert response.status_code == 200
    source = response.data.decode()
    assert "Classic Tree" in source


def test_search_match_uses_smooth_centered_pan_and_zoom():
    source = server.app.test_client().get("/static/app.js").data.decode()

    assert "function focusSearchMatch(personId)" in source
    assert "const position = network.getPositions([personId])[personId]" in source
    assert "network.moveTo({" in source
    assert "position," in source
    assert "scale: 0.9" in source
    assert "duration: 900" in source
    assert "easingFunction: 'easeInOutCubic'" in source
    assert "applyLineageHover(matchedId, people, unions, parentsOf);" in source
    assert "focusSearchMatch(matchedId);" in source
    assert "state.lineageHover = {nodeId, lineage, vividNodes, vividEdges};" in source
    assert "edge._lineageColor = edge.color;" in source
    assert "const relevant = matchedIds.has(edge.from) || matchedIds.has(edge.to);" not in source





def test_classic_tree_uses_union_hubs_with_straight_edges_and_manual_layout():
    source = server.app.test_client().get("/static/app.js").data.decode()

    # Union hubs still route two-parent families through an invisible junction node.
    assert "const intersectionId = `union_${group.parentIds.join('_')}`" in source
    assert "edgeKind: 'union'" in source
    assert "edgeKind: 'parent'" in source
    # Classic mode must keep vis-network's own hierarchical layout and physics OFF so
    # our manually computed x/y coordinates from computeLayout() are not overridden.
    assert "layout: {hierarchical: {enabled: false}}" in source
    assert "physics: classicTree ? {enabled: false}" in source
    assert "const NODE_WIDTH = 230" in source
    assert "const COUPLE_HGAP = 260" in source
    assert "const SIBLING_GAP = 20" in source
    assert "const ROOT_GAP = 180" in source
    assert "const LEVEL_HEIGHT = 300" in source
    # Married children reserve two cards plus the spouse gap; unmarried children
    # continue to reserve a single card slot.
    assert "const getOwnWidth = spouseId => spouseId" in source
    assert "NODE_WIDTH + COUPLE_HGAP" in source
    assert "const w = spouse ? getSubtreeWidth(kidId, spouse) : NODE_WIDTH" in source
    assert "const primaryX = spouseId ? centerX - COUPLE_HGAP / 2 : centerX" in source
    assert "if (rootMembers[j].has(id)) count += 1" in source
    assert "const nextHasPlacedLink = nextIdx !== undefined" in source
    assert "smooth: {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.5}" in source
    assert "network.fit({animation: false});" in source



def test_family_requires_authentication_and_returns_public_data(client, member_token):
    unauthenticated_client = server.app.test_client()
    assert unauthenticated_client.get("/api/family").status_code == 401

    response = client.get("/api/family")

    assert response.status_code == 200
    person = response.get_json()["individuals"][0]
    assert person["display_name"] == "Vithal Ramesh Surname"
    assert person["birth_year"] == 1895


def test_family_redacts_private_person_for_non_admin_but_not_for_admin(client, member_token):
    family = data_store.load_family()
    family["individuals"][0]["is_private"] = True
    family["individuals"][0]["tags"] = ["Verified"]
    family["individuals"][0]["biographical_notes"] = "Sensitive notes."
    data_store.save_family(family)
    target_id = family["individuals"][0]["id"]

    member_view = client.get("/api/family")
    member_person = next(item for item in member_view.get_json()["individuals"] if item["id"] == target_id)
    assert member_person["vital_events"]["birth"]["date"] == "private"
    assert member_person["birth_year"] is None
    assert "biographical_notes" not in member_person

    login(client, "adminuser", "admin-password-123")
    admin_view = client.get("/api/family")
    admin_person = next(item for item in admin_view.get_json()["individuals"] if item["id"] == target_id)
    assert admin_person["biographical_notes"] == "Sensitive notes."
    assert admin_person["tags"] == ["Verified"]


def test_proposal_can_set_tags_and_is_private(client, member_token):
    person = {
        "first_name": "Meera",
        "last_name": "Surname",
        "gender": "F",
        "tags": "Verified, Needs research",
        "is_private": True,
    }
    proposal_id = create_add_proposal(client, member_token, person)
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/approve", json={}, headers=csrf(admin_token))

    assert response.status_code == 200
    added = next(item for item in data_store.load_family()["individuals"] if item["id"] == "meera_surname")
    assert added["tags"] == ["Verified", "Needs research"]
    assert added["is_private"] is True


def test_export_gedcom_requires_admin_and_streams_document(client, member_token):
    member_response = client.get("/api/export/gedcom")
    assert member_response.status_code == 403

    login(client, "adminuser", "admin-password-123")
    admin_response = client.get("/api/export/gedcom")

    assert admin_response.status_code == 200
    assert admin_response.data.startswith(b"0 HEAD\n")
    assert admin_response.headers["Content-Disposition"] == 'attachment; filename="family_vault.ged"'


def test_mutating_endpoints_enforce_csrf(client, member_token, proposed_person):
    proposal = client.post("/api/proposals", json={"kind": "add", "person": proposed_person})
    logout = client.post("/api/logout")

    assert proposal.status_code == 403
    assert proposal.get_json()["error"] == "Invalid CSRF token."
    assert logout.status_code == 403


def test_member_can_create_pending_proposal(client, member_token, proposed_person):
    proposal_id = create_add_proposal(client, member_token, proposed_person)

    with server.db() as connection:
        proposal = connection.execute("SELECT proposer, kind, target_id, payload, status FROM proposals WHERE id = ?", (proposal_id,)).fetchone()

    proposal_data = dict(proposal)
    assert {key: value for key, value in proposal_data.items() if key != "payload"} == {
        "proposer": "memberuser",
        "kind": "add",
        "target_id": None,
        "status": "pending",
    }
    assert json.loads(proposal_data["payload"]) == proposed_person


def test_admin_approval_updates_yaml_and_marks_proposal(client, member_token, proposed_person):
    proposal_id = create_add_proposal(client, member_token, proposed_person)
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/approve", json={"note": "Approved"}, headers=csrf(admin_token))

    assert response.status_code == 200
    assert response.get_json()["status"] == "approved"
    assert response.get_json()["backup"].startswith("Local encrypted backup created")
    assert any(person["id"] == proposed_person["id"] for person in data_store.load_family()["individuals"])
    with server.db() as connection:
        proposal = connection.execute("SELECT status, review_note, reviewed_by FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    assert dict(proposal) == {"status": "approved", "review_note": "Approved", "reviewed_by": "adminuser"}


def test_admin_approval_can_link_new_child_to_existing_union(client, member_token, proposed_person):
    proposed_person.update({"relationship": "child_of", "relative_id": "vithal_1895_g0"})
    proposal_id = create_add_proposal(client, member_token, proposed_person)
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/approve", json={}, headers=csrf(admin_token))

    assert response.status_code == 200
    union = data_store.load_family()["unions"][0]
    assert {"individual_id": "meera_1980_g2", "link_type": "biological"} in union["children"]


def test_admin_approval_can_link_new_spouse_to_existing_person(client, member_token, proposed_person):
    proposed_person.update({"relationship": "spouse_of", "relative_id": "ramesh_1935_g1"})
    proposal_id = create_add_proposal(client, member_token, proposed_person)
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/approve", json={}, headers=csrf(admin_token))

    assert response.status_code == 200
    family = data_store.load_family()
    union = next(u for u in family["unions"] if {"individual_id": "meera_1980_g2"} in u["partners"])
    assert {"individual_id": "ramesh_1935_g1"} in union["partners"]


def test_admin_approval_can_link_new_parent_to_existing_person(client, member_token, proposed_person):
    proposed_person.update({"relationship": "parent_of", "relative_id": "vithal_1895_g0"})
    proposal_id = create_add_proposal(client, member_token, proposed_person)
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/approve", json={}, headers=csrf(admin_token))

    assert response.status_code == 200
    family = data_store.load_family()
    union = next(u for u in family["unions"] if {"individual_id": "vithal_1895_g0", "link_type": "biological"} in u["children"])
    assert any(p["individual_id"] == "meera_1980_g2" for p in union["partners"])


def test_edit_proposal_can_rewire_relationship_anytime(client, admin_token):
    # Admin proposals apply immediately, no separate approval step required.
    response = client.post(
        "/api/proposals",
        json={
            "kind": "edit",
            "target_id": "ramesh_1935_g1",
            "person": {
                "first_name": "Ramesh",
                "last_name": "Surname",
                "gender": "M",
                "birth_date": "1935-04-12",
                "relationship": "child_of",
                "relative_id": "laxmi_1902_g0",
            },
        },
        headers=csrf(admin_token),
    )

    assert response.status_code == 201
    assert response.get_json()["status"] == "approved"
    family = data_store.load_family()
    union = next(u for u in family["unions"] if {"individual_id": "ramesh_1935_g1", "link_type": "biological"} in u["children"])
    assert any(p["individual_id"] == "laxmi_1902_g0" for p in union["partners"])


def test_admin_add_proposal_is_auto_approved_without_review(client, admin_token, proposed_person):
    response = client.post("/api/proposals", json={"kind": "add", "person": proposed_person}, headers=csrf(admin_token))

    assert response.status_code == 201
    body = response.get_json()
    assert body["status"] == "approved"
    assert body["backup"]
    assert any(person["id"] == proposed_person["id"] for person in data_store.load_family()["individuals"])
    with server.db() as connection:
        proposal = connection.execute("SELECT status, reviewed_by FROM proposals WHERE id = ?", (body["id"],)).fetchone()
    assert dict(proposal) == {"status": "approved", "reviewed_by": "adminuser"}


def test_spouse_of_relationship_links_both_partners_into_the_same_union(client, member_token, proposed_person):
    proposed_person.update({"relationship": "spouse_of", "relative_id": "ramesh_1935_g1"})
    proposal_id = create_add_proposal(client, member_token, proposed_person)
    admin_token = login(client, "adminuser", "admin-password-123")

    client.post(f"/api/proposals/{proposal_id}/approve", json={}, headers=csrf(admin_token))

    family = data_store.load_family()
    union = next(u for u in family["unions"] if {"individual_id": "meera_1980_g2"} in u["partners"])
    partner_ids = {partner["individual_id"] for partner in union["partners"]}
    assert partner_ids == {"meera_1980_g2", "ramesh_1935_g1"}


def test_child_of_with_co_parent_links_both_parents_together_and_to_the_child(client, admin_token, proposed_person):
    proposed_person.update({"relationship": "child_of", "relative_id": "pranay_walawalkar", "co_parent_id": "saloni_walawalkar"})

    response = client.post("/api/proposals", json={"kind": "add", "person": proposed_person}, headers=csrf(admin_token))

    assert response.status_code == 201
    family = data_store.load_family()
    union = next(u for u in family["unions"] if {"individual_id": "meera_1980_g2", "link_type": "biological"} in u["children"])
    partner_ids = {partner["individual_id"] for partner in union["partners"]}
    assert partner_ids == {"pranay_walawalkar", "saloni_walawalkar"}


def test_add_proposal_without_id_generates_stable_id_from_name(client, member_token):
    person = {"first_name": "Meera", "last_name": "Surname", "gender": "F", "birth_location": "Mumbai"}

    response = client.post("/api/proposals", json={"kind": "add", "person": person}, headers=csrf(member_token))

    assert response.status_code == 201
    assert response.get_json()["person_id"] == "meera_surname"
    with server.db() as connection:
        stored = json.loads(connection.execute("SELECT payload FROM proposals WHERE id = ?", (response.get_json()["id"],)).fetchone()["payload"])
    assert stored["id"] == "meera_surname"


def test_add_proposal_without_birth_date_defaults_to_unknown(client, member_token):
    person = {"first_name": "Anand", "last_name": "Surname", "gender": "M"}
    proposal_id = create_add_proposal(client, member_token, person)
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/approve", json={}, headers=csrf(admin_token))

    assert response.status_code == 200
    added = next(item for item in data_store.load_family()["individuals"] if item["id"] == "anand_surname")
    assert added["vital_events"]["birth"]["date"] == "unknown"


def test_add_proposal_generates_unique_id_on_name_collision(client, member_token):
    first_id = create_add_proposal(client, member_token, {"first_name": "Ravi", "last_name": "Surname", "gender": "M"})
    admin_token = login(client, "adminuser", "admin-password-123")
    client.post(f"/api/proposals/{first_id}/approve", json={}, headers=csrf(admin_token))
    member_token = login(client, "memberuser", "member-password-123")

    response = client.post(
        "/api/proposals",
        json={"kind": "add", "person": {"first_name": "Ravi", "last_name": "Surname", "gender": "M", "birth_date": "1990"}},
        headers=csrf(member_token),
    )

    assert response.status_code == 201
    assert response.get_json()["person_id"] == "ravi_surname_1990"


def test_edit_proposal_preserves_migration_history_not_present_in_form(client, admin_token):
    # Admin edits apply immediately, no separate approval step required.
    response = client.post(
        "/api/proposals",
        json={
            "kind": "edit",
            "target_id": "vithal_1895_g0",
            "person": {"first_name": "Vithal", "last_name": "Surname", "gender": "M", "birth_date": "1895"},
        },
        headers=csrf(admin_token),
    )

    assert response.status_code == 201
    assert response.get_json()["status"] == "approved"
    updated = next(item for item in data_store.load_family()["individuals"] if item["id"] == "vithal_1895_g0")
    assert updated["migration_history"][0]["to"] == "Chawl No. 4, Girgaon, Mumbai"


def test_member_proposal_rejects_unknown_relative(client, member_token, proposed_person):
    proposed_person.update({"relationship": "child_of", "relative_id": "does_not_exist"})

    response = client.post("/api/proposals", json={"kind": "add", "person": proposed_person}, headers=csrf(member_token))

    assert response.status_code == 400
    assert response.get_json()["error"] == "Choose a valid, existing family member to link to."


def test_admin_rejection_leaves_yaml_unchanged_and_marks_proposal(client, member_token, proposed_person):
    proposal_id = create_add_proposal(client, member_token, proposed_person)
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/reject", json={"note": "Insufficient evidence"}, headers=csrf(admin_token))

    assert response.status_code == 200
    assert response.get_json() == {"status": "rejected", "backup": None}
    assert all(person["id"] != proposed_person["id"] for person in data_store.load_family()["individuals"])
    with server.db() as connection:
        proposal = connection.execute("SELECT status, review_note, reviewed_by FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    assert dict(proposal) == {"status": "rejected", "review_note": "Insufficient evidence", "reviewed_by": "adminuser"}


def test_member_can_submit_delete_proposal_and_admin_can_approve_it(client, member_token):
    proposal = client.post("/api/proposals", json={"kind": "delete", "target_id": "ramesh_1935_g1"}, headers=csrf(member_token))
    assert proposal.status_code == 201
    proposal_id = proposal.get_json()["id"]
    admin_token = login(client, "adminuser", "admin-password-123")

    response = client.post(f"/api/proposals/{proposal_id}/approve", json={}, headers=csrf(admin_token))

    assert response.status_code == 200
    remaining_ids = {person["id"] for person in data_store.load_family()["individuals"]}
    assert "ramesh_1935_g1" not in remaining_ids


def test_delete_proposal_detaches_person_from_unions_and_drops_empty_unions(client, admin_token):
    # Admin deletions apply immediately, no separate approval step required.
    response = client.post("/api/proposals", json={"kind": "delete", "target_id": "laxmi_1902_g0"}, headers=csrf(admin_token))

    assert response.status_code == 201
    assert response.get_json()["status"] == "approved"
    family = data_store.load_family()
    assert all(person["id"] != "laxmi_1902_g0" for person in family["individuals"])
    for union in family["unions"]:
        assert all(partner["individual_id"] != "laxmi_1902_g0" for partner in union["partners"])


def test_delete_proposal_rejects_unknown_person(client, member_token):
    response = client.post("/api/proposals", json={"kind": "delete", "target_id": "does_not_exist"}, headers=csrf(member_token))

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid proposal target."


def test_admin_can_list_and_create_users(client, admin_token):
    listing = client.get("/api/admin/users", headers=csrf(admin_token))
    assert listing.status_code == 200
    assert {user["username"] for user in listing.get_json()["users"]} == {"adminuser", "memberuser"}

    creation = client.post(
        "/api/admin/users",
        json={"username": "newmember", "display_name": "New Member", "password": "another-long-password", "role": "member"},
        headers=csrf(admin_token),
    )

    assert creation.status_code == 201
    assert creation.get_json()["user"]["role"] == "member"


def test_member_cannot_manage_users(client, member_token):
    response = client.get("/api/admin/users", headers=csrf(member_token))

    assert response.status_code == 403


def test_admin_can_change_role_and_reset_password_for_another_user(client, admin_token):
    response = client.patch(
        "/api/admin/users/memberuser",
        json={"role": "admin", "password": "brand-new-long-password"},
        headers=csrf(admin_token),
    )

    assert response.status_code == 200
    assert response.get_json()["user"]["role"] == "admin"
    relogin = login(client, "memberuser", "brand-new-long-password")
    assert relogin


def test_admin_cannot_demote_the_last_administrator(client, admin_token):
    response = client.patch("/api/admin/users/adminuser", json={"role": "member"}, headers=csrf(admin_token))

    assert response.status_code == 400
    assert "administrator" in response.get_json()["error"]


def test_admin_cannot_delete_their_own_account(client, admin_token):
    response = client.delete("/api/admin/users/adminuser", headers=csrf(admin_token))

    assert response.status_code == 400


def test_admin_can_delete_another_user(client, admin_token):
    client.post(
        "/api/admin/users",
        json={"username": "removable", "display_name": "Removable", "password": "another-long-password", "role": "member"},
        headers=csrf(admin_token),
    )

    response = client.delete("/api/admin/users/removable", headers=csrf(admin_token))

    assert response.status_code == 204
    listing = client.get("/api/admin/users", headers=csrf(admin_token))
    assert "removable" not in {user["username"] for user in listing.get_json()["users"]}

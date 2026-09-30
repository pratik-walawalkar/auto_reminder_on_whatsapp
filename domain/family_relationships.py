from __future__ import annotations

from typing import Any

from domain.person_ids import generate_union_id
from domain.domain_validation import DataValidationError

def detach_relationships(family: dict[str, Any], person_id: str) -> None:
    """Remove a person from every union's partner/child list, dropping unions left with no partners."""
    remaining_unions = []
    for union in family.get("unions", []):
        union["partners"] = [entry for entry in union.get("partners", []) if entry.get("individual_id") != person_id]
        union["children"] = [child for child in union.get("children", []) if child.get("individual_id") != person_id]
        if union["partners"]:
            remaining_unions.append(union)
    family["unions"] = remaining_unions


def resolve_relationship(family: dict[str, Any], person_id: str, relationship: dict[str, Any]) -> None:
    """Rewire person_id's place in the family graph per a {"type", "relative_id"} descriptor.

    "child_of" and "new_root" only touch the person's biological parent-child link (at most one
    allowed), so re-pointing a parent never disturbs the person's own marriages or children.
    "parent_of" and "spouse_of" are additive: a person may have several unions over a lifetime.
    """
    kind = relationship.get("type")
    if kind in {None, "", "keep"}:
        return
    unions = family.setdefault("unions", [])
    if kind == "new_root":
        for union in unions:
            union["children"] = [child for child in union.get("children", []) if child.get("individual_id") != person_id]
        return

    people_ids = {person["id"] for person in family.get("individuals", [])}
    relative_id = relationship.get("relative_id")
    if not isinstance(relative_id, str) or relative_id not in people_ids or relative_id == person_id:
        raise DataValidationError("Choose a valid, existing family member to link to.")
    union_ids = {union["id"] for union in unions}

    if kind == "child_of":
        for union in unions:
            union["children"] = [child for child in union.get("children", []) if child.get("individual_id") != person_id]
        co_parent_id = relationship.get("co_parent_id")
        if co_parent_id is not None:
            if not isinstance(co_parent_id, str) or co_parent_id not in people_ids or co_parent_id in {person_id, relative_id}:
                raise DataValidationError("Choose a valid, existing second parent to link to.")
        parent_ids = [relative_id] + ([co_parent_id] if co_parent_id else [])
        parent_id_set = set(parent_ids)
        # Prefer a union that already links both chosen parents together.
        union = next((u for u in unions if parent_id_set <= {p.get("individual_id") for p in u.get("partners", [])}), None)
        if union is None and co_parent_id:
            # Extend a union that has exactly one of the two parents, linking the parents together.
            union = next(
                (
                    u
                    for u in unions
                    if any(p.get("individual_id") in parent_id_set for p in u.get("partners", []))
                    and len(u.get("partners", [])) < 2
                ),
                None,
            )
            if union is not None:
                existing_partner_ids = {p.get("individual_id") for p in union["partners"]}
                for pid in parent_ids:
                    if pid not in existing_partner_ids:
                        union["partners"].append({"individual_id": pid})
        if union is None:
            union = {
                "id": generate_union_id(parent_ids, union_ids),
                "partners": [{"individual_id": pid} for pid in parent_ids],
                "union_type": "marriage" if co_parent_id else "unknown",
                "children": [],
            }
            unions.append(union)
        union.setdefault("children", []).append({"individual_id": person_id, "link_type": "biological"})
    elif kind == "parent_of":
        union = next(
            (
                u
                for u in unions
                if any(c.get("individual_id") == relative_id for c in u.get("children", []))
                and not any(p.get("individual_id") == person_id for p in u.get("partners", []))
                and len(u.get("partners", [])) < 2
            ),
            None,
        )
        if union is not None:
            union["partners"].append({"individual_id": person_id})
        else:
            unions.append(
                {
                    "id": generate_union_id([person_id, relative_id], union_ids),
                    "partners": [{"individual_id": person_id}],
                    "union_type": "unknown",
                    "children": [{"individual_id": relative_id, "link_type": "biological"}],
                }
            )
    elif kind == "spouse_of":
        union = next(
            (
                u
                for u in unions
                if any(p.get("individual_id") == relative_id for p in u.get("partners", []))
                and not any(p.get("individual_id") == person_id for p in u.get("partners", []))
                and len(u.get("partners", [])) < 2
            ),
            None,
        )
        if union is not None:
            union["partners"].append({"individual_id": person_id})
        else:
            unions.append(
                {
                    "id": generate_union_id([relative_id, person_id], union_ids),
                    "partners": [{"individual_id": relative_id}, {"individual_id": person_id}],
                    "union_type": "marriage",
                    "children": [],
                }
            )
    else:
        raise DataValidationError("Choose a valid relationship option.")


def remove_person(family: dict[str, Any], person_id: str) -> None:
    """Remove a person and detach them from every union, dropping unions left with no partners."""
    people = family.get("individuals", [])
    if not any(person.get("id") == person_id for person in people):
        raise DataValidationError(f"Unknown person: {person_id}.")
    family["individuals"] = [person for person in people if person.get("id") != person_id]
    detach_relationships(family, person_id)




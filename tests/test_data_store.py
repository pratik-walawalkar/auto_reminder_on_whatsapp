from __future__ import annotations

from copy import deepcopy

import pytest
import yaml

import data_store


def test_family_yaml_is_valid(family_data):
    data_store.validate_family(family_data)


def test_validate_family_rejects_duplicate_individual_ids(valid_family):
    duplicate = deepcopy(valid_family["individuals"][0])
    valid_family["individuals"].append(duplicate)

    with pytest.raises(data_store.DataValidationError, match="Duplicate individual ID"):
        data_store.validate_family(valid_family)


def test_validate_family_rejects_unknown_references(valid_family):
    valid_family["unions"][0]["partners"][0]["individual_id"] = "unknown_person"

    with pytest.raises(data_store.DataValidationError, match="unknown partner"):
        data_store.validate_family(valid_family)


def test_validate_family_rejects_parent_cycles(valid_family):
    valid_family["unions"].append(
        {
            "id": "union_cycle",
            "partners": [{"individual_id": "ramesh_1935_g1"}],
            "union_type": "unknown",
            "children": [{"individual_id": "vithal_1895_g0", "link_type": "adoptive"}],
        }
    )

    with pytest.raises(data_store.DataValidationError, match="contain a cycle"):
        data_store.validate_family(valid_family)


def test_save_family_atomically_preserves_existing_file_on_replace_failure(monkeypatch, tmp_path, valid_family):
    family_file = tmp_path / "family.yaml"
    original = "original family data\n"
    family_file.write_text(original, encoding="utf-8")
    monkeypatch.setattr(data_store, "FAMILY_FILE", family_file)
    monkeypatch.setattr(data_store, "ROOT", tmp_path)

    def fail_replace(source, destination):
        raise OSError("simulated replacement failure")

    monkeypatch.setattr(data_store.os, "replace", fail_replace)

    with pytest.raises(OSError, match="simulated replacement failure"):
        data_store.save_family(valid_family)

    assert family_file.read_text(encoding="utf-8") == original
    assert list(tmp_path.glob("family-*.yaml")) == []


def test_save_family_writes_valid_yaml_and_timestamp(tmp_path, monkeypatch, valid_family):
    family_file = tmp_path / "family.yaml"
    monkeypatch.setattr(data_store, "FAMILY_FILE", family_file)
    monkeypatch.setattr(data_store, "ROOT", tmp_path)

    data_store.save_family(valid_family)

    saved = yaml.safe_load(family_file.read_text(encoding="utf-8"))
    data_store.validate_family(saved)
    assert saved["metadata"]["last_updated"].endswith("Z")


def test_generate_person_id_uses_first_and_last_name():
    assert data_store.generate_person_id("Meera", "Surname", None, set()) == "meera_surname"


def test_generate_person_id_falls_back_to_birth_year_on_name_collision():
    existing = {"ravi_surname"}
    assert data_store.generate_person_id("Ravi", "Surname", "1990-04-01", existing) == "ravi_surname_1990"


def test_generate_person_id_falls_back_to_numeric_suffix_when_year_unknown_or_taken():
    existing = {"ravi_surname"}
    assert data_store.generate_person_id("Ravi", "Surname", None, existing) == "ravi_surname_2"

    existing_with_year = {"ravi_surname", "ravi_surname_1990"}
    assert data_store.generate_person_id("Ravi", "Surname", "1990", existing_with_year) == "ravi_surname_1990_2"


def test_remove_person_detaches_partner_but_keeps_union_with_remaining_partner(valid_family):
    data_store.remove_person(valid_family, "laxmi_1902_g0")

    assert all(person["id"] != "laxmi_1902_g0" for person in valid_family["individuals"])
    union = next(item for item in valid_family["unions"] if item["id"] == "union_vithal_laxmi_1918")
    assert union["partners"] == [{"individual_id": "vithal_1895_g0"}]
    data_store.validate_family(valid_family)


def test_remove_person_drops_union_left_with_no_partners(valid_family):
    data_store.remove_person(valid_family, "vithal_1895_g0")
    data_store.remove_person(valid_family, "laxmi_1902_g0")

    assert all(union["id"] != "union_vithal_laxmi_1918" for union in valid_family["unions"])
    data_store.validate_family(valid_family)


def test_remove_person_detaches_child_but_keeps_union_with_remaining_partners(valid_family):
    data_store.remove_person(valid_family, "ramesh_1935_g1")

    union = next(item for item in valid_family["unions"] if item["id"] == "union_vithal_laxmi_1918")
    assert union["children"] == []
    assert len(union["partners"]) == 2
    data_store.validate_family(valid_family)


def test_remove_person_rejects_unknown_id(valid_family):
    with pytest.raises(data_store.DataValidationError, match="Unknown person"):
        data_store.remove_person(valid_family, "does_not_exist")


def test_validate_family_accepts_is_private_and_tags(valid_family):
    valid_family["individuals"][0]["is_private"] = True
    valid_family["individuals"][0]["tags"] = ["Verified", "Needs research"]

    data_store.validate_family(valid_family)


def test_validate_family_rejects_non_bool_is_private(valid_family):
    valid_family["individuals"][0]["is_private"] = "yes"

    with pytest.raises(data_store.DataValidationError, match="is_private"):
        data_store.validate_family(valid_family)


def test_validate_family_rejects_too_many_tags(valid_family):
    valid_family["individuals"][0]["tags"] = [f"tag{i}" for i in range(data_store.MAX_TAGS_PER_PERSON + 1)]

    with pytest.raises(data_store.DataValidationError, match="invalid tags list"):
        data_store.validate_family(valid_family)


def test_validate_family_rejects_invalid_tag_characters(valid_family):
    valid_family["individuals"][0]["tags"] = ["bad@tag"]

    with pytest.raises(data_store.DataValidationError, match="invalid tag"):
        data_store.validate_family(valid_family)


def test_validate_family_rejects_duplicate_tags_case_insensitive(valid_family):
    valid_family["individuals"][0]["tags"] = ["Verified", "verified"]

    with pytest.raises(data_store.DataValidationError, match="duplicate tags"):
        data_store.validate_family(valid_family)

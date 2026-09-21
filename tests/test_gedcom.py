from __future__ import annotations

import gedcom


def test_gedcom_date_handles_year_month_day_and_unknown():
    assert gedcom._gedcom_date("1895") == "1895"
    assert gedcom._gedcom_date("1922-05") == "MAY 1922"
    assert gedcom._gedcom_date("1962-04-12") == "12 APR 1962"
    assert gedcom._gedcom_date("unknown") is None
    assert gedcom._gedcom_date(None) is None


def test_build_gedcom_includes_head_and_trailer(valid_family):
    document = gedcom.build_gedcom(valid_family)

    assert document.startswith("0 HEAD\n")
    assert document.rstrip("\n").endswith("0 TRLR")
    assert "2 VERS 5.5.1" in document


def test_build_gedcom_emits_individual_and_family_records(valid_family):
    document = gedcom.build_gedcom(valid_family)

    assert "0 @IVITHAL_1895_G0@ INDI" in document
    assert "1 NAME Vithal Ramesh /Surname/" in document
    assert "1 SEX M" in document
    assert "0 @FUNION_VITHAL_LAXMI_1918@ FAM" in document
    assert "1 HUSB @IVITHAL_1895_G0@" in document
    assert "1 WIFE @ILAXMI_1902_G0@" in document


def test_build_gedcom_marks_private_person_with_resn_and_writes_tags(valid_family):
    valid_family["individuals"][0]["is_private"] = True
    valid_family["individuals"][0]["tags"] = ["Verified"]

    document = gedcom.build_gedcom(valid_family)

    assert "1 RESN privacy" in document
    assert "1 NOTE Tag: Verified" in document


def test_export_gedcom_writes_file(tmp_path, monkeypatch, valid_family):
    import data_store

    family_file = tmp_path / "family.yaml"
    monkeypatch.setattr(data_store, "FAMILY_FILE", family_file)
    monkeypatch.setattr(data_store, "ROOT", tmp_path)
    data_store.save_family(valid_family)

    destination = tmp_path / "export.ged"
    content = gedcom.export_gedcom(destination)

    assert destination.exists()
    assert destination.read_text(encoding="utf-8") == content
    assert content.rstrip("\n").endswith("0 TRLR")

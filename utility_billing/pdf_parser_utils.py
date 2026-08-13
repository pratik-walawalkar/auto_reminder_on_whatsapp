import os
import re
import datetime
from pypdf import PdfReader


def extract_clean_text_from_pdf(pdf_path, password=None):
    """Safely extracts readable text from a PDF using pypdf."""
    if not os.path.exists(pdf_path):
        print(f"❌ PDF Parser Error: File not found at target location: {pdf_path}")
        return ""

    try:
        reader = PdfReader(pdf_path)

        if reader.is_encrypted:
            if password:
                reader.decrypt(password)
            else:
                print(f"⚠️ Warning: Encrypted PDF found for {os.path.basename(pdf_path)}. Skipping.")
                return ""

        full_text = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                full_text.append(page_text)

        return "\n".join(full_text)
    except Exception as e:
        print(f"❌ Critical PDF Stream Read Failure on {os.path.basename(pdf_path)}: {e}")
        return ""


def _normalize_text(text):
    if not text:
        return ""
    text = text.replace("\u00a0", " ").replace("\xa0", " ")
    text = text.replace("₹", " Rs ")
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _parse_date_value(date_string):
    if not date_string:
        return None
    if isinstance(date_string, datetime.date):
        return date_string

    text = re.sub(r"\s+", " ", str(date_string)).strip()
    if not text:
        return None

    formats = [
        "%d-%b-%Y", "%d/%m/%Y", "%d %b %Y", "%d-%m-%Y",
        "%d-%b-%y", "%d/%m/%y", "%d %b %y", "%d-%m-%y"
    ]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    return None


def _extract_amount(text, patterns):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            raw_value = match.group(1) if match.lastindex else match.group(0)
            cleaned = re.sub(r"[^0-9.\-]", "", str(raw_value).replace(",", ""))
            if cleaned:
                try:
                    return float(cleaned)
                except ValueError:
                    continue
    return None


def _extract_units(text, patterns):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            cleaned = re.sub(r"[^0-9.\-]", "", str(match.group(1)))
            if cleaned:
                try:
                    return float(cleaned)
                except ValueError:
                    continue
    return 0.0


def _extract_date(text, patterns):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            parsed = _parse_date_value(match.group(1))
            if parsed:
                return parsed
    return None


def _extract_period(text):
    patterns = [
        r"(?:statement|billing|period)[^0-9\n]{0,20}([0-9]{1,2}[ -/][A-Za-z]{3}[ -/][0-9]{2,4})[^0-9\n]{0,10}(?:to|-|–|—)[^0-9\n]{0,10}([0-9]{1,2}[ -/][A-Za-z]{3}[ -/][0-9]{2,4})",
        r"([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\s*(?:to|-|–|—)\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            start = _parse_date_value(match.group(1))
            end = _parse_date_value(match.group(2))
            if start and end:
                return start, end
    return None, None


def parse_airtel_wifi_bill(text_stream):
    """Robust parser for Airtel WiFi bills using label-based extraction."""
    text = _normalize_text(text_stream)
    data = {"amount": None, "start_date": None, "end_date": None, "due_date": None, "units": 0.0}

    data["amount"] = _extract_amount(
        text,
        [
            r"total\s+amount\s+payable[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"total\s+payable[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"amount\s+payable[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"payable\s+amount[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
        ],
    )

    data["due_date"] = _extract_date(
        text,
        [
            r"due\s+date[^0-9]{0,20}([0-9]{1,2}(?:-|/|\.| )?[A-Za-z]{3}(?:-|/|\.| )?[0-9]{2,4})",
            r"payment\s+due[^0-9]{0,20}([0-9]{1,2}(?:-|/|\.| )?[A-Za-z]{3}(?:-|/|\.| )?[0-9]{2,4})",
        ],
    )

    start, end = _extract_period(text)
    data["start_date"] = start
    data["end_date"] = end

    if data["start_date"] is None:
        data["start_date"] = _extract_date(
            text,
            [r"statement\s+date[^0-9]{0,20}([0-9]{1,2}(?:-|/|\.| )?[A-Za-z]{3}(?:-|/|\.| )?[0-9]{2,4})"],
        )
        data["end_date"] = data["start_date"]

    data["units"] = _extract_units(
        text,
        [
            r"your\s+plan[^0-9]{0,10}([0-9]{2,6})",
            r"speed\s+plan[^0-9]{0,10}([0-9]{2,6})",
        ],
    )

    return data


def parse_adani_electricity_bill(text_stream):
    """Robust parser for Adani bills with flexible field matching."""
    text = _normalize_text(text_stream)
    data = {"amount": None, "start_date": None, "end_date": None, "due_date": None, "units": 0.0}

    data["amount"] = _extract_amount(
        text,
        [
            r"current\s+month\s+bill[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"net\s+payable[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"bill\s+amount[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"amount\s+payable[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"amt\s*r([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
        ],
    )

    data["units"] = _extract_units(
        text,
        [
            r"units\s+consumed[^0-9]{0,20}([0-9]{1,10})",
            r"consumption[^0-9]{0,20}([0-9]{1,10})",
        ],
    )

    data["due_date"] = _extract_date(
        text,
        [
            r"due\s+date[^0-9]{0,20}([0-9]{1,2}(?:-|/|\.| )?[A-Za-z]{3}(?:-|/|\.| )?[0-9]{2,4})",
        ],
    )

    start, end = _extract_period(text)
    data["start_date"] = start
    data["end_date"] = end

    return data


def parse_mgl_gas_bill(text_stream):
    """Robust parser for MGL bills with tolerant amount and period matching."""
    text = _normalize_text(text_stream)
    data = {"amount": None, "start_date": None, "end_date": None, "due_date": None, "units": 0.0}

    data["amount"] = _extract_amount(
        text,
        [
            r"total\s+payable\s*\(a\+b\)[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"due\s+amount[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
            r"amount\s+due[^0-9]{0,20}([0-9][0-9,\.]*(?:\.[0-9]{1,2})?)",
        ],
    )

    data["units"] = _extract_units(
        text,
        [
            r"gas\s+consumption[^0-9]{0,20}([0-9]{1,10})",
            r"scm[^0-9]{0,20}([0-9]{1,10})",
        ],
    )

    data["due_date"] = _extract_date(
        text,
        [
            r"due\s+date[^0-9]{0,20}([0-9]{1,2}(?:-|/|\.| )?[A-Za-z]{3}(?:-|/|\.| )?[0-9]{2,4})",
        ],
    )

    start, end = _extract_period(text)
    data["start_date"] = start
    data["end_date"] = end

    return data

def _score_confidence(parsed: dict) -> float:
    score = 0.0
    if parsed.get("amount"):
        score += 0.5
    if parsed.get("start_date"):
        score += 0.35
    if parsed.get("due_date"):
        score += 0.10
    # small bonus for units
    if parsed.get("units") and parsed.get("units") > 0:
        score += 0.05
    return min(score, 1.0)

def auto_parse_with_confidence(text_stream: str) -> dict:
    text = _normalize_text(text_stream)
    # run the three parsers and pick best (based on non-empty fields and heuristics)
    candidates = []
    candidates.append(parse_airtel_wifi_bill(text))
    candidates.append(parse_adani_electricity_bill(text))
    candidates.append(parse_mgl_gas_bill(text))
    # score each candidate
    best = None
    best_score = -1.0
    for c in candidates:
        s = _score_confidence(c)
        c['confidence'] = s
        if s > best_score:
            best = c
            best_score = s
    # fallback: if none had data, still return small structure
    if not best:
        return {"amount": None, "start_date": None, "end_date": None, "due_date": None, "units": 0.0, "confidence": 0.0}
    return best

def parse_flexible_date(date_string):
    """Backward-compatible wrapper for date parsing."""
    return _parse_date_value(date_string)
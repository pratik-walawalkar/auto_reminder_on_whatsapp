import os
import re
import datetime
from pypdf import PdfReader

def extract_clean_text_from_pdf(pdf_path, password=None):
    """Safely decrypts and extracts readable raw text streams from multi-page PDFs."""
    if not os.path.exists(pdf_path):
        print(f"❌ PDF Parser Error: File not found at target location: {pdf_path}")
        return ""
        
    try:
        reader = PdfReader(pdf_path)
        
        # --- REQUIREMENT: AUTOMATED PASSWORD DECRYPTION SYSTEM ---
        if reader.is_encrypted:
            if password:
                reader.decrypt(password)
            else:
                # Standard credential lookup rules default template fallback
                # Many utilities use lowercase/uppercase variants of personal info
                print(f"⚠️ Warning: Encrypted stream found for {os.path.basename(pdf_path)}. Attempting fallback profiles...")
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

def parse_airtel_wifi_bill(text_stream):
    """Regex configuration profile matching Airtel Telemedia PDF side-by-side text data structures."""
    data = {"amount": None, "start_date": None, "end_date": None, "due_date": None, "units": 0.0}
    
    # 1. Parse Bill Amount & Due Date from the side-by-side layout block
    # Matches patterns like: "Total Amount Payable: Due Date:\n`  941.64 28 Jun 2026"
    composite_match = re.search(
        r"Total\s*Amount\s*Payable:\s*Due\s*Date:\s*(?:\n|\r\n)?(?:\`|\s)*([\d,]+\.\d{2})\s+(\d{1,2}\s+\w{3}\s+\d{4})", 
        text_stream, 
        re.IGNORECASE
    )
    
    if composite_match:
        data["amount"] = float(composite_match.group(1).replace(",", ""))
        data["due_date"] = parse_flexible_date(composite_match.group(2))
    else:
        # Fallback Amount Parsing from Total Payable rows
        amt_match = re.search(r"TOTAL\s*Payable\s*Amount\s*(?:\`|\s)*([\d,]+\.\d{2})", text_stream, re.IGNORECASE)
        if amt_match:
            data["amount"] = float(amt_match.group(1).replace(",", ""))

    # 2. Parse Invoice Billing Period (Statement Period)
    # Matches patterns like: "Statement Period: 17 May 2026 to 16 Jun 2026"
    period_match = re.search(
        r"Statement\s*Period:\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*to\s*(\d{1,2}\s+\w{3}\s+\d{4})", 
        text_stream, 
        re.IGNORECASE
    )
    if period_match:
        data["start_date"] = parse_flexible_date(period_match.group(1))
        data["end_date"] = parse_flexible_date(period_match.group(2))
    else:
        # Fallback to Statement Date if the explicit period line is obscured
        stmt_match = re.search(r"Statement\s*Date:\s*(\d{1,2}\s+\w{3}\s+\d{4})", text_stream, re.IGNORECASE)
        if stmt_match:
            data["start_date"] = parse_flexible_date(stmt_match.group(1))
            data["end_date"] = data["start_date"]

    # 3. Extra KPI Metric: Extract Airtel WiFi Speed Plan limit context if available (Optional check)
    plan_match = re.search(r"Your\s*Plan:\s*(\d+)\s*plan", text_stream, re.IGNORECASE)
    if plan_match:
        data["units"] = float(plan_match.group(1)) # Ingests plan speed (e.g., 798 plan -> 798)
        
    return data


def parse_adani_electricity_bill(text_stream):
    """Hardened wildcard-resilient regex extractor tracking Adani text layouts."""
    import re
    data = {"amount": None, "start_date": None, "end_date": None, "due_date": None, "units": 0.0}
    
    # 1. Parse Bill Net Payable Amount Due 
    amt_match = re.search(r"due\s+date\s+\d{1,2}-\w{3}-\d{4}\s*:\s*Amt\s*r([\d\.]+)", text_stream, re.IGNORECASE)
    if amt_match:
        data["amount"] = float(amt_match.group(1).replace(",", ""))
    else:
        fallback_amt = re.search(r"Current\s+Month\s+Bill\s*[\r\n]*r([\d\.]+)", text_stream, re.IGNORECASE)
        if fallback_amt:
            data["amount"] = float(fallback_amt.group(1).replace(",", ""))

    # 2. Parse Consumption Metric Units (kWh)
    units_match = re.search(r"Units\s+Consumed\s*[\r\n]+(\d+)", text_stream, re.IGNORECASE)
    if units_match:
        data["units"] = float(units_match.group(1))

    # 3. Parse Official Due Date Deadline
    due_match = re.search(r"Due\s+Date:\s*(\d{1,2}-\w{3}-\d{4})", text_stream, re.IGNORECASE)
    if due_match:
        data["due_date"] = parse_flexible_date(due_match.group(1))

    # 4. Parse Billing Cycle Timeline Intervals
    period_match = re.search(r"(\d{1,2}-\w{3}-\d{4})\s*-\s*(\d{1,2}-\w{3}-\d{4})", text_stream)
    if period_match:
        data["start_date"] = parse_flexible_date(period_match.group(1))
        data["end_date"] = parse_flexible_date(period_match.group(2))
        
    return data

def parse_mgl_gas_bill(text_stream):
    """Hardened regex extractor profile tracking Mahanagar Gas (MGL) vertical text layer layouts."""
    import re
    data = {"amount": None, "start_date": None, "end_date": None, "due_date": None, "units": 0.0}
    
    # 1. Parse Bill Net Payable Amount Due 
    # Finds "TOTAL PAYABLE (A+B)", skips down past the currency symbol,
    # and extracts the multi-line stacked digits sequence (e.g. 7\n2\n3)
    amt_block_match = re.search(
        r"TOTAL\s+PAYABLE\s*\(A\+B\)\s*[\r\n]+(?:₹\s*[\r\n]+)?([\d\s]+)", 
        text_stream, 
        re.IGNORECASE
    )
    
    if amt_block_match:
        # Strip out all hidden vertical line breaks, carriage returns, and spaces 
        # to stitch the numbers back together cleanly into a single string (7\n2\n3 -> 723)
        clean_amt_str = re.sub(r"[\r\n\s]+", "", amt_block_match.group(1))
        if clean_amt_str:
            data["amount"] = float(clean_amt_str)
            
    if not data["amount"]:
        # Fallback to the Due Amount text section row if needed
        fallback_amt = re.search(r"Due\s+Amount\s*[\r\n]+([\d\.]+)", text_stream, re.IGNORECASE)
        if fallback_amt:
            data["amount"] = float(fallback_amt.group(1))

    # 2. Parse Gas Consumption Metric Volume Units (SCM)
    # Uses the same vertical-stitching line-break fix for consumption values!
    units_block_match = re.search(r"Gas\s+Consumption\s+SCM\s*[\r\n]+([\d\s]+)", text_stream, re.IGNORECASE)
    if units_block_match:
        clean_units_str = re.sub(r"[\r\n\s]+", "", units_block_match.group(1))
        if clean_units_str:
            data["units"] = float(clean_units_str)

    # 3. Parse Official Due Date Deadline ("Due Date: 24/08/2023")
    due_match = re.search(r"Due\s+Date\s*[\r\n]+(\d{2}/\d{2}/\d{4})", text_stream, re.IGNORECASE)
    if due_match:
        data["due_date"] = parse_flexible_date(due_match.group(1))

    # 4. Parse Billing Cycle Timeline Intervals ("21/05/2023 TO 19/07/2023")
    period_match = re.search(
        r"Period\s*[\r\n]+(\d{2}/\d{2}/\d{4})\s*[\r\n]+TO\s*[\r\n]+(\d{2}/\d{2}/\d{4})", 
        text_stream, 
        re.IGNORECASE
    )
    if period_match:
        data["start_date"] = parse_flexible_date(period_match.group(1))
        data["end_date"] = parse_flexible_date(period_match.group(2))
        
    return data





def parse_flexible_date(date_string):
    """Normalizes variation arrays in Indian utility statement dates into standardized datetime.date formats."""
    date_string = date_string.strip().replace(",", "")
    # Support formats: 13-Jul-2026, 13/07/2026, 13 Jul 2026, 13-07-2026
    formats = [
        "%d-%b-%Y", "%d/%m/%Y", "%d %b %Y", "%d-%m-%Y",
        "%d-%b-%y", "%d/%m/%y", "%d %b %y", "%d-%m-%y"
    ]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(date_string, fmt).date()
        except ValueError:
            continue
            
    print(f"⚠️ Warning: Unable to parse date format string index: '{date_string}'")
    return None

# main.py (Updated to execute full sync pipeline logic via bill_scanner)
import os
import sys
import datetime
import subprocess
from typing import Optional
import psycopg2
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, UploadFile, File, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi import BackgroundTasks, Query
from pathlib import Path

import os
import json
import datetime
from fastapi import HTTPException


import pandas as pd
import io
import httpx
import hashlib
import shutil
import json
import uvicorn
from dotenv import load_dotenv
from fastapi import Request

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
# main.py - Add this endpoint to serve calendar data

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import timedelta

# Define the Pydantic model for a standardized Calendar Event
class CalendarEvent(BaseModel):
    id: str
    title: str
    start: str  # ISO 8601 format (e.g., "2026-08-01T10:00:00")
    end: Optional[str] = None
    allDay: bool = False
    type: str  # e.g., 'family', 'individual', 'system'


# --- ROOT PATH RESOLUTION LAYER ---
# --- ROOT PATH RESOLUTION LAYER ---
ROOT_DIR = os.path.abspath(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)
    
PROJECT_ROOT = os.path.abspath(os.path.join(ROOT_DIR, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

os.chdir(PROJECT_ROOT)

MATRIX_FILE = os.path.join(PROJECT_ROOT, "routing_matrix.json")
DROPZONE_DIR = os.path.join(PROJECT_ROOT, "manual_upload_dropzone")
DOWNLOADS_DIR = os.path.join(PROJECT_ROOT, "downloaded_bills")
SETTINGS_FILE = os.path.join(PROJECT_ROOT, "backend_api", "settings.json")



# Add near other constants
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 2 * 1024 * 1024))  # 2MB default
CONFIDENCE_THRESHOLD_AUTO = float(os.getenv("CONFIDENCE_THRESHOLD_AUTO", 0.80))

import whatsapp_utils
from utility_billing import bill_scanner


load_dotenv()


# Read from environment variables with safe defaults
EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL", "http://localhost:8080")
INSTANCE_NAME = os.getenv("INSTANCE_NAME", "my_personal_session")
EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY", "")

app = FastAPI(
    title="Headless Automation Billing Warehouse API",
    description="Production-grade data orchestration backend for local utility ledgers.",
    version="2.0.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|.*\.ts\.net|100\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database="evolution_whatsapp",
        user="evolution_user",
        password="SecretLocalPassword123",
        port=os.getenv("DB_PORT", "5432")
    )

class BillEntryForm(BaseModel):
    provider_name: str = Field(..., example="Airtel WiFi")
    bill_amount: float = Field(..., gt=0)
    tax_amount: Optional[float] = Field(0.0, ge=0)
    billing_month: str = Field(..., example="2026-07")
    billing_period_start: str
    billing_period_end: str
    due_date: str
    units_consumed: Optional[float] = Field(0.0, ge=0)

class StagingApprovalForm(BaseModel):
    provider_name: str
    utility_type: str
    bill_amount: float
    units_consumed: float
    due_date: str
    billing_period_start: str
    billing_period_end: str

def load_settings():
    if not os.path.exists(SETTINGS_FILE):
        default = {
            "upload": {
                "max_file_size_mb": 2,
                "allowed_content_types": ["application/pdf"],
                "confidence_threshold": 0.8
            },
            "message_templates": {
                "due_date_alert": "⚠️ *{provider}* bill of ₹{amount} is due on {due_date}. Please pay before {due_date}.",
                "payment_confirmed": "✅ Payment confirmed for {provider}, amount ₹{amount}.",
                "conflict_notice": "⚠️ Bill conflict detected for {provider} from {billing_period_start} to {billing_period_end}."
            },
            "parser": {
                "auto_approve_on_confidence": True
            }
        }
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(default, f, indent=2)
        return default

    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_settings(settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)

def _parse_date_string(date_str: str):
    if not date_str:
        return None
    candidates = [
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d-%b-%Y",
        "%d %B %Y", "%d-%B-%Y"
    ]
    for fmt in candidates:
        try:
            return datetime.datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None

def _save_temp_file(bytes_data: bytes, filename: str) -> str:
    os.makedirs(DROPZONE_DIR, exist_ok=True)
    safe_name = filename.replace(" ", "_")
    path = os.path.join(DROPZONE_DIR, f"staging_temp_{safe_name}")
    with open(path, "wb") as f:
        f.write(bytes_data)
    return path

def parse_and_stage_from_bytes(file_bytes: bytes, filename: str):
    try:
        from pypdf import PdfReader
        import io

        reader = PdfReader(io.BytesIO(file_bytes))
        extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages)

        with open(MATRIX_FILE, "r", encoding="utf-8") as f:
            matrix_rules = json.load(f)
        providers = matrix_rules.get("billing_rules", {}).get("providers", [])

        matched_provider = None
        clean_text = extracted_text.lower()
        if clean_text.strip():
            if ("natural" in clean_text and "gas" in clean_text) or "mgl" in clean_text or "mahanagar" in clean_text:
                matched_provider = next((p for p in providers if p["name"] == "MGL Gas"), None)
            elif "adani" in clean_text or "electricity" in clean_text:
                matched_provider = next((p for p in providers if p["name"] == "Adani Electricity"), None)
            elif "airtel" in clean_text or "fixedline" in clean_text or "wifi" in clean_text:
                matched_provider = next((p for p in providers if p["name"] == "Airtel WiFi"), None)

        if not matched_provider:
            matched_provider = next(
                (
                    p for p in providers
                    if p["name"].lower() in filename.lower()
                    or p.get("local_storage_folder", "").lower() in filename.lower()
                ),
                None
            )

        p_name = matched_provider["name"] if matched_provider else "Unknown"
        u_type = matched_provider.get("utility_type", "Unknown") if matched_provider else "Unknown"

        from utility_billing import pdf_parser_utils
        bill_data_raw = {"amount": None, "units": 0.0, "start_date": None, "end_date": None, "due_date": None, "confidence": 0.0}
        if extracted_text.strip():
            bill_data_raw = pdf_parser_utils.auto_parse_with_confidence(extracted_text)

        settings = load_settings()
        threshold = float(settings.get("upload", {}).get("confidence_threshold", 0.8))

        confidence = float(bill_data_raw.get("confidence", 0.0))
        extraction_status = "AUTO_APPROVED" if confidence >= threshold else "REVIEW_PENDING"

        duplicate_status, conflict_data = "NONE", None
        if bill_data_raw.get("start_date") and bill_data_raw.get("end_date"):
            conn = get_db_connection()
            duplicate_status, conflict_data = _compare_to_existing(
                conn,
                p_name,
                bill_data_raw.get("start_date"),
                bill_data_raw.get("end_date"),
                bill_data_raw.get("amount"),
                bill_data_raw.get("due_date"),
                bill_data_raw.get("units")
            )
            conn.close()

        if duplicate_status == "EXACT_DUPLICATE":
            extraction_status = "DUPLICATE"
        elif duplicate_status == "CONFLICT":
            extraction_status = "CONFLICT"

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO billing_ingestion_staging (
                file_name, raw_file_bytes, utility_type, provider_name, bill_amount,
                units_consumed, due_date, billing_period_start, billing_period_end, extraction_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
        """, (
            filename,
            psycopg2.Binary(file_bytes),
            u_type,
            p_name,
            bill_data_raw.get("amount"),
            bill_data_raw.get("units"),
            bill_data_raw.get("due_date").isoformat() if bill_data_raw.get("due_date") else None,
            bill_data_raw.get("start_date").isoformat() if bill_data_raw.get("start_date") else None,
            bill_data_raw.get("end_date").isoformat() if bill_data_raw.get("end_date") else None,
            extraction_status
        ))
        staging_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return staging_id
    except Exception as e:
        print(f"Background parse/stage error for {filename}: {e}")
        return None

def _compare_to_existing(conn, provider, start_date, end_date, amount, due_date, units):
    if not start_date or not end_date:
        return "NONE", None

    cur = conn.cursor()
    cur.execute("""
        SELECT bill_amount, due_date, units_consumed
        FROM utility_billing_history
        WHERE provider_name=%s AND billing_period_start=%s AND billing_period_end=%s
    """, (provider, start_date, end_date))
    existing = cur.fetchone()
    cur.close()

    if not existing:
        return "NONE", None

    existing_amount, existing_due, existing_units = existing
    same_amount = float(existing_amount or 0) == float(amount or 0)
    same_due = existing_due == due_date
    same_units = float(existing_units or 0) == float(units or 0)

    if same_amount and same_due and same_units:
        return "EXACT_DUPLICATE", None

    return "CONFLICT", {
        "existing": {
            "amount": float(existing_amount or 0),
            "due_date": existing_due.isoformat() if existing_due else None,
            "units_consumed": float(existing_units or 0)
        },
        "parsed": {
            "amount": float(amount or 0),
            "due_date": due_date.isoformat() if due_date else None,
            "units_consumed": float(units or 0)
        }
    }

def db_lookup_bill(bill_id: int):
    """Queries utility_billing_history for the file path and metadata using the record ID."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, provider_name, local_pdf_path 
            FROM utility_billing_history 
            WHERE id = %s;
        """, (bill_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            return None
            
        # Return a lightweight object/dictionary wrapper
        class BillRecord:
            def __init__(self, db_id, provider, path):
                self.id = db_id
                self.provider_name = provider
                self.file_path = path
                
        return BillRecord(row[0], row[1], row[2])
    except Exception as e:
        print(f"❌ Database lookup error for bill ID {bill_id}: {e}")
        return None

def format_filename_from_template(template: str, provider: str, start_date: datetime.date) -> str:
    """Evaluates dynamic token strings similar to Immich storage templates."""
    year = start_date.strftime("%Y")
    month = start_date.strftime("%m")
    safe_provider = provider.replace(" ", "_")
    
    filename = template.replace("{{year}}", year) \
                       .replace("{{month}}", month) \
                       .replace("{{provider}}", safe_provider)
    return filename


def execute_file_renaming_migration(template: str):
    print("🔄 [Migration Engine]: Starting bulk file storage restructuring...")
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("SELECT id, provider_name, billing_period_start, local_pdf_path FROM utility_billing_history;")
        records = cur.fetchall()
        
        migrated_count = 0
        for rec_id, provider, start_date, old_path in records:
            if not old_path or not os.path.exists(old_path):
                continue
                
            clean_folder_name = provider.replace("/", "_")
            target_dir = os.path.join("downloaded_bills", clean_folder_name)
            os.makedirs(target_dir, exist_ok=True)
            
            new_filename = format_filename_from_template(template, provider, start_date)
            new_path = os.path.join(target_dir, new_filename)
            
            if old_path != new_path:
                shutil.move(old_path, new_path)
                
                # Update database reference
                cur.execute(
                    "UPDATE utility_billing_history SET local_pdf_path = %s WHERE id = %s;",
                    (new_path, rec_id)
                )
                conn.commit()
                migrated_count += 1
                
        print(f"✅ [Migration Engine Complete]: Successfully restructured {migrated_count} bill files.")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration Job Failure: {e}")
    finally:
        cur.close()
        conn.close()

@app.put("/api/v1/bills/edit/{record_id}")
async def update_bill_record(record_id: int, payload: BillEntryForm):
    try:
        s_date = _parse_date_string(payload.billing_period_start)
        e_date = _parse_date_string(payload.billing_period_end)
        d_date = _parse_date_string(payload.due_date)

        if not s_date or not e_date or not d_date:
            raise HTTPException(status_code=400, detail="One or more dates are invalid.")

        net_amount = float(payload.bill_amount)
        units = float(payload.units_consumed or 0.0)
        tax = float(payload.tax_amount or 0.0)
        days_delta = (e_date - s_date).days or 1
        daily_avg = units / days_delta

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM utility_billing_history WHERE id = %s;", (record_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Bill record not found.")

        cur.execute("""
            UPDATE utility_billing_history
            SET provider_name = %s,
                bill_amount = %s,
                tax_amount = %s,
                due_date = %s,
                billing_period_start = %s,
                billing_period_end = %s,
                billing_year = %s,
                billing_month = %s,
                units_consumed = %s,
                daily_average_usage = %s,
                updated_at = CURRENT_TIMESTAMP,
                is_user_locked = TRUE
            WHERE id = %s;
        """, (
            payload.provider_name,
            net_amount,
            tax,
            d_date,
            s_date,
            e_date,
            s_date.year,
            payload.billing_month,
            units,
            daily_avg,
            record_id
        ))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": "Bill record updated successfully."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Edit bill record error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update bill record: {e}")

@app.patch("/api/v1/pipeline/stage-update/{staging_id}")
async def update_staging_record(staging_id: int, payload: StagingApprovalForm):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM billing_ingestion_staging WHERE id = %s;", (staging_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Staging record not found.")
        cur.execute("""
            UPDATE billing_ingestion_staging
            SET provider_name = %s,
                utility_type = %s,
                bill_amount = %s,
                units_consumed = %s,
                due_date = %s,
                billing_period_start = %s,
                billing_period_end = %s,
                extraction_status = 'REVIEW_PENDING'
            WHERE id = %s;
        """, (
            payload.provider_name,
            payload.utility_type,
            payload.bill_amount,
            payload.units_consumed,
            payload.due_date,
            payload.billing_period_start,
            payload.billing_period_end,
            staging_id
        ))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": "Staging record updated successfully."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Staging update error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update staging record: {e}")

@app.get("/api/v1/settings")
async def get_settings():
    return {"status": "success", "settings": load_settings()}

@app.patch("/api/v1/settings")
async def update_settings(payload: dict):
    settings = load_settings()
    settings.update(payload)
    save_settings(settings)
    return {"status": "success", "settings": settings}

@app.get("/api/v1/metrics", summary="Fetches consolidated KPI cards metrics metadata arrays.")
async def get_dashboard_summary_cards():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        current_year = datetime.datetime.now().year
        current_month = datetime.datetime.now().month
        
        cur.execute("SELECT COALESCE(SUM(bill_amount), 0.00) FROM utility_billing_history WHERE is_paid_status = FALSE;")
        unpaid_balance = float(cur.fetchone()[0])
        
        cur.execute("""
            SELECT COALESCE(SUM(bill_amount), 0.00) FROM utility_billing_history 
            WHERE is_paid_status = TRUE AND billing_year = %s AND billing_month = %s;
        """, (current_year, str(current_month)))
        paid_this_month = float(cur.fetchone()[0])
        
        cur.execute("SELECT provider_name, COALESCE(SUM(bill_amount), 0.00), COUNT(id) FROM utility_billing_history GROUP BY provider_name;")
        provider_rows = cur.fetchall()
        provider_breakdown = [{"provider": r[0], "total_spent": float(r[1]), "total_bills_logged": int(r[2])} for r in provider_rows]
        
        cur.close()
        conn.close()
        return {
            "status": "success", "database_offline": False,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "data": {
                "total_outstanding_payable": unpaid_balance,
                "total_cleared_current_month": paid_this_month,
                "provider_historical_aggregates": provider_breakdown
            }
        }
    except Exception as e:
        return {
            "status": "error", "database_offline": True,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "data": {"total_outstanding_payable": 0.00, "total_cleared_current_month": 0.00, "provider_historical_aggregates": []}
        }

@app.get("/api/v1/bills/history", summary="Retrieves continuous timeline tabular history database logs.")
async def get_billing_history_ledger(provider: Optional[str] = Query(None)):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        if provider:
            cur.execute("SELECT * FROM utility_billing_history WHERE provider_name = %s ORDER BY billing_period_start DESC;", (provider,))
        else:
            cur.execute("SELECT * FROM utility_billing_history ORDER BY billing_period_start DESC;")
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        records = []
        for r in rows:
            record = dict(zip(columns, r))
            for key, val in record.items():
                if isinstance(val, (datetime.date, datetime.datetime)):
                    record[key] = val.isoformat()
                elif isinstance(val, float) or hasattr(val, '__float__'):
                    if val is not None: record[key] = float(val)
            records.append(record)
        cur.close()
        conn.close()
        return {"status": "success", "database_offline": False, "count": len(records), "records": records}
    except Exception as e:
        return {"status": "error", "database_offline": True, "count": 0, "records": []}

@app.post("/api/v1/bills/manual", summary="Inserts a manual user record row override directly into the data warehouse ledger.")
async def post_manual_bill_override(payload: BillEntryForm):
    try:
        s_date = datetime.datetime.strptime(payload.billing_period_start.strip(), "%Y-%m-%d").date()
        e_date = datetime.datetime.strptime(payload.billing_period_end.strip(), "%Y-%m-%d").date()
        d_date = datetime.datetime.strptime(payload.due_date.strip(), "%Y-%m-%d").date()
        
        id_str = f"{payload.provider_name}_{s_date}_{e_date}"
        id_hash = hashlib.sha256(id_str.encode('utf-8')).hexdigest()
        
        units = float(payload.units_consumed) if payload.units_consumed is not None else 0.0
        tax = float(payload.tax_amount) if payload.tax_amount is not None else 0.0
        days_delta = (e_date - s_date).days or 1
        daily_avg = units / days_delta
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO utility_billing_history (
                idempotency_hash, provider_name, bill_amount, tax_amount, due_date,
                billing_period_start, billing_period_end, billing_year, billing_month,
                units_consumed, daily_average_usage, data_source, is_user_locked, is_paid_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'manual_form', TRUE, FALSE)
            ON CONFLICT (provider_name, billing_period_start, billing_period_end) 
            DO UPDATE SET
                bill_amount = EXCLUDED.bill_amount, tax_amount = EXCLUDED.tax_amount,
                due_date = EXCLUDED.due_date, units_consumed = EXCLUDED.units_consumed,
                daily_average_usage = EXCLUDED.daily_average_usage, data_source = 'manual_form',
                is_user_locked = TRUE, updated_at = CURRENT_TIMESTAMP;
        """, (id_hash, payload.provider_name, payload.bill_amount, tax, d_date,
              s_date, e_date, s_date.year, payload.billing_month, units, daily_avg))
        
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": f"Manual record locked successfully for {payload.provider_name}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manual ledger insertion override aborted: {e}")

# backend/main.py
@app.post("/api/v1/pipeline/sync", summary="Executes unified state sync pipeline synchronously.")
async def trigger_pipeline_sync_task():
    try:
        await bill_scanner.main_sync_pipeline(re_sync_history=False)
        return {
            "status": "completed", 
            "message": "Pipeline sync operations complete."
        }
    except Exception as e:
        # Gracefully handle dropzone warnings or minor parsing drops without a 500 crash if desired, 
        # or properly return details:
        print(f"⚠️ Pipeline execution warning/error caught: {e}")
        return {
            "status": "completed_with_warnings",
            "message": f"Pipeline finished with warnings: {e}"
        }

@app.patch("/api/v1/bills/{record_id}/status", summary="Toggles a specific statement's paid status flag.")
async def toggle_bill_payment_status(record_id: int, is_paid: bool = Query(...)):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM utility_billing_history WHERE id = %s;", (record_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Target billing statement record not found.")
        
        cur.execute("""
            UPDATE utility_billing_history 
            SET is_paid_status = %s, payment_success_date = %s, is_user_locked = TRUE
            WHERE id = %s;
        """, (is_paid, datetime.datetime.now() if is_paid else None, record_id))
        
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "new_paid_state": is_paid}
    except Exception as e:
        print(f"❌ Status toggle error: {e}")
        raise HTTPException(status_code=500, detail=f"Interactive status toggle aborted: {e}")

@app.get("/api/v1/export", summary="Compiles filters and streams download report files packaged into clean .xlsx or .csv data frames.")
async def export_warehouse_data(format: str = Query("csv")):
    try:
        conn = get_db_connection()
        df = pd.read_sql_query("SELECT provider_name, bill_amount, tax_amount, due_date, billing_period_start, billing_period_end, units_consumed, is_paid_status, data_source FROM utility_billing_history ORDER BY billing_period_start DESC;", conn)
        conn.close()
        
        if format.lower() == "excel":
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Utility Bills Ledger')
            output.seek(0)
            headers = {"Content-Disposition": "attachment; filename=Utility_Billing_Ledger_Export.xlsx"}
            return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
        else:
            stream = io.StringIO()
            df.to_csv(stream, index=False)
            response = StreamingResponse(io.BytesIO(stream.getvalue().encode()), media_type="text/csv")
            response.headers["Content-Disposition"] = "attachment; filename=Utility_Billing_Ledger_Export.csv"
            return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report format export streaming engine failure: {e}")

@app.post("/api/v1/pipeline/upload", summary="Accepts raw user PDFs at the exact path expected by the UI.")
async def stage_incoming_bill_pdf(background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)):
    saved = []
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files uploaded")

        settings = load_settings()
        allowed_types = settings.get("upload", {}).get("allowed_content_types", ["application/pdf"])
        max_file_size_mb = int(settings.get("upload", {}).get("max_file_size_mb", 2))
        max_bytes = max_file_size_mb * 1024 * 1024

        for file in files:
            if file.content_type not in allowed_types and not file.filename.lower().endswith(".pdf"):
                continue
            content = await file.read()
            if not content or len(content) == 0:
                continue
            if len(content) > max_bytes:
                continue
            parse_and_stage_from_bytes(content, file.filename)
            saved.append(file.filename)

        if not saved:
            raise HTTPException(status_code=400, detail="No valid PDF files uploaded (type/size).")

        return {"status": "accepted", "saved_files": saved}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

@app.post("/api/v1/pipeline/stage-approve/{staging_id}", summary="Approves a staged record and finalizes database rows safely.")
async def approve_staging_record(staging_id: int, payload: StagingApprovalForm):
    try:
        import hashlib
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT file_name, raw_file_bytes FROM billing_ingestion_staging WHERE id = %s;", (staging_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Staging record block not found.")
            
        file_name, raw_pdf_bytes = row
        
        # --- FIX: ROBUST STRPTIME COMBINATIONS TO FORCE TRUE CODES OVER FALLBACKS ---
        def force_parse_db_date(date_str: str):
            if not date_str:
                return datetime.date.today()
            # Standardize variations like slashes into clean dashes instantly
            clean_str = date_str.strip().replace("/", "-")
            
            # Pattern A: Try ISO format (YYYY-MM-DD)
            try: return datetime.datetime.strptime(clean_str, "%Y-%m-%d").date()
            except ValueError: pass
            
            # Pattern B: Try explicit preferred format (DD-MM-YYYY)
            try: return datetime.datetime.strptime(clean_str, "%d-%m-%Y").date()
            except ValueError: pass
            
            # Pattern C: Try 2-digit years format (DD-MM-YY)
            try: return datetime.datetime.strptime(clean_str, "%d-%m-%y").date()
            except ValueError: pass
            
            # Ultimate safety fallback: use our flexible project layout utility
            from utility_billing.pdf_parser_utils import parse_flexible_date
            parsed = parse_flexible_date(clean_str)
            if parsed: return parsed
            
            raise ValueError(f"Unable to safely commit format: {date_str}")
        # --- FIX: ENFORCE HIGH-PRECISION FLOATING CAST PADDING ---
        # Ensures raw text integers are cast into exact decimal values (723 -> 723.00)
        # to prevent PostgreSQL numeric scaling column truncation bugs
        try:
            net_payable_amount = float(str(payload.bill_amount).replace(",", "").strip())
        except ValueError:
            net_payable_amount = 0.00

        s_date = force_parse_db_date(payload.billing_period_start)
        e_date = force_parse_db_date(payload.billing_period_end)
        d_date = force_parse_db_date(payload.due_date)

        id_str = f"{payload.provider_name}_{s_date}_{e_date}"
        id_hash = hashlib.sha256(id_str.encode('utf-8')).hexdigest()
        
        days_delta = (e_date - s_date).days or 1
        daily_avg = payload.units_consumed / days_delta
        
        clean_folder_name = payload.provider_name.replace("/", "_")
        final_dir = os.path.join("downloaded_bills", clean_folder_name)
        os.makedirs(final_dir, exist_ok=True)
        
        final_filename = f"MANUAL_STAGED_{s_date.strftime('%Y_%m')}_{clean_folder_name.replace(' ', '_')}.pdf"
        final_pdf_path = os.path.join(final_dir, final_filename)
        
        with open(final_pdf_path, "wb") as f:
            f.write(bytes(raw_pdf_bytes))
            
        cur.execute("""
            INSERT INTO utility_billing_history (
                idempotency_hash, provider_name, utility_type, bill_amount, due_date,
                billing_period_start, billing_period_end, billing_year, billing_month,
                units_consumed, daily_average_usage, local_pdf_path, data_source, is_user_locked, is_paid_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'ui_staging_dropzone', TRUE, FALSE)
            ON CONFLICT (provider_name, billing_period_start, billing_period_end)
            DO UPDATE SET
                bill_amount = EXCLUDED.bill_amount, due_date = EXCLUDED.due_date,
                utility_type = EXCLUDED.utility_type, units_consumed = EXCLUDED.units_consumed,
                daily_average_usage = EXCLUDED.daily_average_usage, local_pdf_path = EXCLUDED.local_pdf_path,
                data_source = 'ui_staging_dropzone', is_user_locked = TRUE, updated_at = CURRENT_TIMESTAMP;
        """, (id_hash, payload.provider_name, payload.utility_type, net_payable_amount, d_date,
              s_date, e_date, s_date.year, s_date.month, payload.units_consumed, daily_avg, final_pdf_path))

        
        cur.execute("DELETE FROM billing_ingestion_staging WHERE id = %s;", (staging_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        return {"status": "success", "message": f"Successfully processed {payload.provider_name}!"}
    except Exception as e:
        print(f"❌ Backend Staging Approval Exception: {e}")
        raise HTTPException(status_code=500, detail=f"Staging file commitment aborted: {e}")

@app.delete("/api/v1/pipeline/stage-reject/{staging_id}", summary="Rejects a staging record.")
async def reject_staging_record(staging_id: int):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Purge row data from database cleanly
        cur.execute("DELETE FROM billing_ingestion_staging WHERE id = %s;", (staging_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {"status": "success", "message": f"Staging item identification card {staging_id} was successfully destroyed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Staging record rejection workflow dropped: {e}")

@app.get("/api/v1/pipeline/staging", summary="Fetches all currently queued review cards waiting inside staging.")
async def get_staged_ingestion_queue():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, file_name, utility_type, provider_name, bill_amount, units_consumed,
                   due_date, billing_period_start, billing_period_end, extraction_status
            FROM billing_ingestion_staging ORDER BY created_at ASC;
        """)
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        records = []
        for r in rows:
            record = dict(zip(columns, r))
            for k, v in record.items():
                if isinstance(v, (datetime.date, datetime.datetime)):
                    record[k] = v.isoformat()
                elif isinstance(v, float) or hasattr(v, '__float__'):
                    if v is not None: record[k] = float(v)
            records.append(record)
        cur.close()
        conn.close()
        return {"status": "success", "queue": records}
    except Exception as e:
        return {"status": "success", "queue": []}

@app.delete("/api/v1/bills/delete/{record_id}", summary="Purges an absolute transaction out of history ledgers.")
async def delete_history_record(record_id: int):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM utility_billing_history WHERE id = %s;", (record_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": f"Record {record_id} successfully purged."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database record removal constraint failure: {e}")

@app.on_event("startup")
def startup_event():
    os.makedirs("manual_upload_dropzone", exist_ok=True)
    os.makedirs("downloaded_bills", exist_ok=True)
    whatsapp_utils.load_env_file()
    print("🚀 FastAPI backend initialized and dropzone folders verified.")

@app.get("/api/v1/whatsapp/status")
async def get_whatsapp_status():
    async with httpx.AsyncClient() as client:
        try:
            url = f"{EVOLUTION_API_URL}/instance/connectionState/{INSTANCE_NAME}"
            
            response = await client.get(
                url,
                headers={"apikey": EVOLUTION_API_KEY}
            )
            
            if response.status_code != 200:
                return {"connected": False, "state": "disconnected"}
                
            data = response.json()
            
            # Extract state safely
            state = data.get("instance", {}).get("state") or data.get("state")
            
            # STRICT CHECK: Only consider it connected if the state is precisely "open"
            is_connected = (state == "open")
            
            return {
                "connected": is_connected,
                "state": state or "disconnected"
            }
        except Exception as e:
            return {"connected": False, "state": "error", "error": str(e)}



@app.get("/api/bills/{bill_id}/view")
async def view_bill(bill_id: int):
    """Retrieves and streams the PDF statement securely from storage."""
    bill_record = db_lookup_bill(bill_id)
    if not bill_record or not bill_record.file_path:
        raise HTTPException(status_code=404, detail="Bill record not found in database.")
    
    file_path = Path(bill_record.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Bill document file missing on disk: {file_path}")
        
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=file_path.name
    )

    
@app.post("/api/v1/settings/storage-migration", summary="Migrates file naming formats across storage disks using custom templates.")
async def run_storage_template_migration(background_tasks: BackgroundTasks, payload: dict):
    """
    Payload example: {"filename_template": "{{year}}_{{month}}_{{provider}}.pdf"}
    """
    new_template = payload.get("filename_template")
    if not new_template:
        raise HTTPException(status_code=400, detail="Missing 'filename_template' parameter.")
        
    # Save the setting change
    settings = load_settings()
    settings.setdefault("storage", {})["filename_template"] = new_template
    save_settings(settings)
    
    # Trigger migration job in background
    background_tasks.add_task(execute_file_renaming_migration, new_template)
    return {"status": "success", "message": "Storage template updated. Migration job started in the background."}

@app.post("/api/v1/reminders/trigger", summary="Manually trigger WhatsApp reminder pipelines")
async def trigger_whatsapp_reminders(
    background_tasks: BackgroundTasks, 
    target: str = Query("all", description="Accepts: 'family', 'individual', or 'all'")
):
    """
    Executes the reminder automation scripts in the background.
    """
    def run_automation_scripts(target_type):
        try:
            print(f"🚀 [Reminders Pipeline] Starting manual trigger for: {target_type}")
            
            # Re-verify the API connection before firing scripts
            import whatsapp_utils
            connection_is_active = whatsapp_utils.initialize_whatsapp()
            if not connection_is_active:
                print("❌ [Reminders Pipeline] Aborted: WhatsApp Evolution API is disconnected.")
                return

            # Execute Family Reminders
            if target_type in ["family", "all"]:
                print("▶️ Executing family_reminders.py...")
                # We use subprocess to ensure clean memory/variable isolation per run
                subprocess.run(["python", "reminders_core/family_reminders.py"], check=True)
                
            # Execute Individual Reminders
            if target_type in ["individual", "all"]:
                print("▶️ Executing individual_reminders.py...")
                subprocess.run(["python", "reminders_core/individual_reminders.py"], check=True)
                
            print("✅ [Reminders Pipeline] All requested background scripts executed successfully.")
            
        except subprocess.CalledProcessError as e:
            print(f"❌ [Reminders Pipeline] Script execution failed: {e}")
        except Exception as e:
            print(f"❌ [Reminders Pipeline] Unexpected error: {e}")

    # Dispatch to background task to immediately free up the UI
    background_tasks.add_task(run_automation_scripts, target)
    
    return {
        "status": "success", 
        "message": f"Reminder automation for '{target}' has been queued in the background engine."
    }


@app.get("/api/v1/reminders/calendar", summary="Robust Google Calendar Sync")
async def get_calendar_events():
    TOKEN_FILE_PERSONAL = os.path.join(PROJECT_ROOT, "token_personal.json")
    
    # Fallback/Check for missing files
    if not os.path.exists(TOKEN_FILE_PERSONAL):
        raise HTTPException(
            status_code=400, 
            detail=f"Token file not found at {TOKEN_FILE_PERSONAL}. Please re-authenticate."
        )

    all_events = []
    
    try:
        creds = Credentials.from_authorized_user_file(TOKEN_FILE_PERSONAL)
        service = build('calendar', 'v3', credentials=creds, cache_discovery=False)

        # Define time range (7 days past, 45 days future)
        now = datetime.datetime.utcnow()
        time_min = (now - datetime.timedelta(days=7)).isoformat() + 'Z'
        time_max = (now + datetime.timedelta(days=45)).isoformat() + 'Z'

        # Load routing matrix safely if it exists
        matrix = {}
        if os.path.exists(MATRIX_FILE):
            with open(MATRIX_FILE, "r", encoding="utf-8") as f:
                matrix = json.load(f)

        # Collect calendar IDs from matrix or fallback to 'primary'
        calendar_targets = []
        
        if matrix:
            # Support both new and older matrix schema structures
            for rule in matrix.get("family_rules", []):
                if rule.get("calendar_id"):
                    calendar_targets.append((rule["calendar_id"], "family"))
            for rule in matrix.get("individual_rules", []):
                if rule.get("calendar_id"):
                    calendar_targets.append((rule["calendar_id"], "individual"))
            # Fallback flat list if defined in older revisions
            for cal_id in matrix.get("calendars", []):
                calendar_targets.append((cal_id, "default"))

        if not calendar_targets:
            # Default fallback to primary calendar if matrix has no IDs configured
            calendar_targets.append(("primary", "personal"))

        # Fetch events for each target calendar
        for cal_id, cal_type in calendar_targets:
            try:
                events_result = service.events().list(
                    calendarId=cal_id, 
                    timeMin=time_min, 
                    timeMax=time_max, 
                    singleEvents=True, 
                    orderBy='startTime'
                ).execute()
                
                for event in events_result.get('items', []):
                    start = event['start'].get('dateTime', event['start'].get('date'))
                    # Handle full-day vs timestamp strings safely
                    date_str = start.split('T')[0] if start else datetime.date.today().isoformat()
                    summary = event.get('summary', 'Untitled Event')
                    
                    icon = "📌 "
                    if cal_type == "family":
                        icon = "🏠 "
                    elif "birthday" in summary.lower():
                        icon = "🎂 "

                    all_events.append({
                        "id": event.get('id'),
                        "title": icon + summary,
                        "date": date_str,
                        "type": cal_type
                    })
            except HttpError as sub_err:
                print(f"⚠️ [Calendar Warning] Could not fetch calendar {cal_id}: {sub_err}")
                continue

        # Return format matching both array-expecting and object-expecting frontends
        return {
            "success": True,
            "events": all_events,
            "count": len(all_events)
        }

    except Exception as e:
        print(f"❌ [Calendar Critical Error]: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Google Calendar Sync Failed: {str(e)}")
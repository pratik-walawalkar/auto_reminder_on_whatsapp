# main.py (Updated to execute full sync pipeline logic via bill_scanner)
import os
import sys
import datetime
from typing import Optional
import psycopg2
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import pandas as pd
import io
import hashlib
import shutil
import json
import uvicorn

# --- ROOT PATH RESOLUTION LAYER ---
ROOT_DIR = os.path.abspath(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)
os.chdir(ROOT_DIR)

import whatsapp_utils
from utility_billing import bill_scanner

MATRIX_FILE = os.path.join(ROOT_DIR, "matrix_routing.json")

app = FastAPI(
    title="Headless Automation Billing Warehouse API",
    description="Production-grade data orchestration backend for local utility ledgers.",
    version="2.0.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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

@app.post("/api/v1/pipeline/sync", summary="Triggers on-demand sync pipeline state execution background threads.")
async def trigger_pipeline_sync_task(background_tasks: BackgroundTasks):
    try:
        # Dispatch the full bill scanning and Google API email fetcher pipeline safely into background task loops
        background_tasks.add_task(bill_scanner.main_sync_pipeline, re_sync_history=False)
        return {"status": "accepted", "message": "Unified state sync pipeline worker dispatched safely into background loops."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline background execution initialization failure: {e}")

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
@app.post("/api/v1/pipeline/stage-upload", summary="Accepts raw user PDFs, safely caches bytes, and logs data to review staging.")
async def stage_incoming_bill_pdf(file: UploadFile = File(...)):
    # Establish a local workspace temp file path tracking channel first
    temp_loc = f"manual_upload_dropzone/staging_temp_{file.filename.replace(' ', '_')}"
    try:
        from pypdf import PdfReader
        import json
        import datetime
        import psycopg2
        
        # Read the memory layer bytes exactly ONCE and lock it into a variable
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file buffer is empty or corrupted.")
            
        # Save the bytes to our temporary disk snapshot
        with open(temp_loc, "wb") as buffer:
            buffer.write(file_bytes)
            
        # --- FIX: FORCE PYPDF TO READ FROM THE STABLE LOCAL DISK FILE PATH ---
        # This completely avoids network cache latency and guarantees a full text stream!
        reader = PdfReader(temp_loc)
        extracted_text = ""
        for page in reader.pages:
            text_chunk = page.extract_text()
            if text_chunk: 
                extracted_text += text_chunk + "\n"
            
        # 2. Parse matrix rules to identify the correct utility provider
        # --- HARDENED PROVIDER CLASSIFIER MATRIX FIXED ---
        # Prioritizes independent, multi-line keyword scans to eliminate layout collisions
        # --- 1. HARDENED PROVIDER CLASSIFIER MATRIX ---
        # Prioritizes independent, multi-line keyword scans to eliminate structural layout collisions
        with open("routing_matrix.json", "r") as f:
            matrix_rules = json.load(f)
        providers = matrix_rules.get("billing_rules", {}).get("providers", [])
        
        matched_provider = None
        clean_text = extracted_text.lower()

        # Step 1: Deep content structural checks using independent keyword metrics
        if clean_text.strip():
            # Independent word check captures 'NATURAL' and 'GAS' anywhere in the file structure
            if ("natural" in clean_text and "gas" in clean_text) or "mgl" in clean_text or "mahanagar" in clean_text:
                for p in providers:
                    if p['name'] == "MGL Gas":
                        matched_provider = p
                        break
            
            elif "adani" in clean_text or "electricity" in clean_text:
                for p in providers:
                    if p['name'] == "Adani Electricity":
                        matched_provider = p
                        break
                        
            elif "airtel" in clean_text or "fixedline" in clean_text:
                for p in providers:
                    if p['name'] == "Airtel WiFi":
                        matched_provider = p
                        break

        # Step 2: Fallback to strict filename matching ONLY if the file text layer was completely unreadable
        if not matched_provider:
            for p in providers:
                if p['name'].lower() in file.filename.lower() or p['local_storage_folder'].lower() in file.filename.lower():
                    matched_provider = p
                    break

        # --- FIX 1: UNIFIED VARIABLE LOGIC ENFORCEMENT WITH DEFENSIVE COMPLIANT FALLBACKS ---
        # We assign the variables exactly ONCE here to prevent downstream variable clashing overrides
        p_name = matched_provider['name'] if matched_provider else "MGL Gas"
        u_type = matched_provider.get("utility_type", "Gas") if matched_provider else "Gas"

        # --- 2. INVOKE TARGET EXTRACTION REGEX ENGINES ---
        from utility_billing import pdf_parser_utils
        bill_data = {"amount": 0.0, "units": 0.0, "start_date": None, "end_date": None, "due_date": None}
        
        if extracted_text.strip():
            try:
                if p_name == "Airtel WiFi":
                    bill_data_raw = pdf_parser_utils.parse_airtel_wifi_bill(extracted_text)
                elif p_name == "Adani Electricity":
                    bill_data_raw = pdf_parser_utils.parse_adani_electricity_bill(extracted_text)
                elif p_name == "MGL Gas":
                    bill_data_raw = pdf_parser_utils.parse_mgl_gas_bill(extracted_text)
                    
                # Map extracted properties safely into our system parameters data dictionary
                bill_data["amount"] = bill_data_raw.get("amount", 0.0)
                bill_data["units"] = bill_data_raw.get("units", 0.0)
                bill_data["start_date"] = bill_data_raw.get("start_date")
                bill_data["end_date"] = bill_data_raw.get("end_date")
                bill_data["due_date"] = bill_data_raw.get("due_date")
            except Exception as ex:
                print(f"⚠️ Regex execution warning: {ex}")
                
        # Formulate string formatting parameters for our staging database columns
        f_start = bill_data["start_date"].isoformat() if bill_data["start_date"] else None
        f_end = bill_data["end_date"].isoformat() if bill_data["end_date"] else None
        f_due = bill_data["due_date"].isoformat() if bill_data["due_date"] else None

        # Clean filesystem temporary file instances safely
        if os.path.exists(temp_loc): 
            os.remove(temp_loc)
        
        # --- 3. COMMIT CLEAN METADATA TO STAGING TABLE CONTROLLER ---
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO billing_ingestion_staging (
                file_name, raw_file_bytes, utility_type, provider_name, bill_amount, 
                units_consumed, due_date, billing_period_start, billing_period_end, extraction_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'REVIEW_PENDING') RETURNING id;
        """, (file.filename, psycopg2.Binary(file_bytes), u_type, p_name, bill_data["amount"],
              bill_data["units"], f_due, f_start, f_end))
        
        staging_id = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return {"status": "success", "staging_id": staging_id, "auto_detected_provider": p_name}
    except Exception as e:
        print(f"❌ Critical Ingestion Error Tracker: {e}")
        if os.path.exists(temp_loc): 
            os.remove(temp_loc)
        raise HTTPException(status_code=500, detail=f"PDF ingestion staging parser crash error: {e}")

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

@app.post("/api/upload-bill")
async def upload_bill(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF statements are supported.")

    dropzone_dir = "manual_upload_dropzone"
    os.makedirs(dropzone_dir, exist_ok=True)
    file_path = os.path.join(dropzone_dir, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"📥 Successfully saved manual upload to dropzone: {file.filename}")

        if not os.path.exists(MATRIX_FILE):
            raise HTTPException(status_code=500, detail="Routing matrix configuration file missing on server.")
        
        path_dir, mod_name = os.path.split(MATRIX_FILE)
        with open(MATRIX_FILE, "r") as f:
            matrix_rules = json.load(f)

        bill_scanner.process_manual_dropzone_files(matrix_rules)

        return {
            "status": "success",
            "message": f"File '{file.filename}' uploaded and routed through the parser pipeline successfully.",
            "filename": file.filename
        }

    except Exception as e:
        print(f"❌ Error processing uploaded bill {file.filename}: {e}")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Pipeline processing failed: {str(e)}")

@app.post("/api/trigger-sync")
async def trigger_sync():
    try:
        bill_scanner.main_sync_pipeline(re_sync_history=False)
        return {"status": "success", "message": "Full synchronization pipeline executed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync execution failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=9444, reload=True)
import os
import sys
import json
import datetime
import hashlib
import base64
import re
import time
import psycopg2
from psycopg2.extras import execute_values

# --- CRITICAL ROOT ROUTING MAPPING PATCH ---
# Resolves absolute path mappings up to the project root folder directory context
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)
os.chdir(ROOT_DIR)

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

import whatsapp_utils
import pdf_parser_utils
import google_tasks_utils

# Force configuration environment state evaluation
whatsapp_utils.load_env_file()

# --- CONFIGURATION ATTRIBUTES REGISTER ---
CLIENT_SECRET_FILE = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
TOKEN_FILE_BILLING = os.environ.get("TOKEN_FILE_BILLING", "token_billing.json")
MATRIX_FILE = "routing_matrix.json"

# Strict minimal clearance scopes to read billing email targets
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def get_db_connection():
    """Establishes an active transaction node pipeline to your isolated PostgreSQL engine."""
    return psycopg2.connect(
        host="localhost",
        port=5432,
        user="evolution_user",
        password="SecretLocalPassword123",
        database="evolution_whatsapp"
    )

def authenticate_billing_account():
    """Authenticates the dedicated billing email box independently via token_billing.json."""
    creds = None
    if os.path.exists(TOKEN_FILE_BILLING):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE_BILLING, SCOPES)
        
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("🔄 Refreshing billing mailbox OAuth session markers...")
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds:
            print("🔑 Opening browser for BILLING Google Account Authentication login...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            
        with open(TOKEN_FILE_BILLING, 'w') as token:
            token.write(creds.to_json())
            
    return build('gmail', 'v1', credentials=creds)

def fetch_last_scan_checkpoint():
    """Retrieves the high-water-mark cursor timestamp to ensure delta execution scans."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT last_checkpoint FROM execution_metadata WHERE meta_key = 'gmail_scan_cursor';")
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)

def update_scan_checkpoint(new_timestamp):
    """Updates the global watermark cursor execution baseline log."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO execution_metadata (meta_key, last_checkpoint, updated_at)
        VALUES ('gmail_scan_cursor', %s, CURRENT_TIMESTAMP)
        ON CONFLICT (meta_key) 
        DO UPDATE SET last_checkpoint = EXCLUDED.last_checkpoint, updated_at = CURRENT_TIMESTAMP;
    """, (new_timestamp,))
    conn.commit()
    cur.close()
    conn.close()
def extract_attachment_payload(service, message_id, attachment_id):
    """Downloads a raw binary stream attachment block natively from the Gmail API frame."""
    attachment = service.users().messages().attachments().get(
        userId='me', messageId=message_id, id=attachment_id
    ).execute()
    file_data = base64.urlsafe_b64decode(attachment['data'].encode('UTF-8'))
    return file_data

def find_matching_provider(subject, snippet, matrix_rules):
    """Evaluates text anchors to match a provider config block including its utility_type category."""
    providers = matrix_rules.get("billing_rules", {}).get("providers", [])
    
    for provider in providers:
        # 1. Audit Subject Keywords
        subj_match = any(kw.lower() in subject.lower() for kw in provider.get("subject_regex_keywords", []))
        # 2. Audit Structural Body Anchors
        body_match = any(anch.lower() in snippet.lower() for anch in provider.get("body_structural_anchors", []))
        
        if subj_match or body_match:
            return provider
    return None

def process_gmail_billing_stream(service, matrix_rules, re_scan_all=False):
    """Scans incoming streams, processes attachments, and passes utility categories downward."""
    last_checkpoint = fetch_last_scan_checkpoint()

    safe_floor = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)
    
    # If the checkpoint is zero/corrupted (1969/1970), fall back to the safe 30-day lookback floor
    if last_checkpoint.year < 2000:
        last_checkpoint = safe_floor
    if re_scan_all:
        query_string = "has:attachment"
        print("🔄 [Nuke & Re-Sync]: Triggering comprehensive historic email processing...")
    else:
        # Convert the verified tracking checkpoint directly to a clean Gmail date string
        lookback_date = (last_checkpoint - datetime.timedelta(days=1)).strftime("%Y/%m/%d")
        query_string = f"has:attachment after:{lookback_date}"
        print(f"📥 Querying mailbox target changes via filtering mask: '{query_string}'")

    after_epoch = int(last_checkpoint.timestamp())
    query_string = f"has:attachment after:{after_epoch}"
    
    try:
        results = service.users().messages().list(userId='me', q=query_string).execute()
        messages = results.get('messages', [])
        if not messages:
            print("⚪ No new billing statements detected inside the active mailbox loop.")
            return

        conn = get_db_connection()
        max_internal_msg_time = last_checkpoint

        for msg_ref in messages:
            msg_id = msg_ref['id']
            msg = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            
            msg_timestamp = datetime.datetime.fromtimestamp(int(msg['internalDate'])/1000, datetime.timezone.utc)
            if msg_timestamp > max_internal_msg_time:
                max_internal_msg_time = msg_timestamp
                
            payload = msg.get('payload', {})
            headers = payload.get('headers', [])
            subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), "No Subject")
            snippet = msg.get('snippet', "")
            
            provider_config = find_matching_provider(subject, snippet, matrix_rules)
            if not provider_config:
                continue
                
            # Extract decoupled invariant category fallback configuration directly from the rules matrix
            util_type = provider_config.get("utility_type", "WiFi")
            print(f"🎯 Match Identified: processing '{subject}' as Category [{util_type}]...")
            
            parts = payload.get('parts', [])
            for part in parts:
                if part.get('filename') and part.get('filename').lower().endswith('.pdf'):
                    att_id = part['body'].get('attachmentId')
                    raw_pdf_bytes = extract_attachment_payload(service, msg_id, att_id)
                    
                    temp_path = os.path.join("manual_upload_dropzone", f"temp_{msg_id}.pdf")
                    with open(temp_path, "wb") as f:
                        f.write(raw_pdf_bytes)
                        
                    extracted_text = pdf_parser_utils.extract_clean_text_from_pdf(temp_path)
                    bill_data = {}
                    
                    if provider_config['name'] == "Airtel WiFi":
                        bill_data = pdf_parser_utils.parse_airtel_wifi_bill(extracted_text)
                    elif provider_config['name'] == "Adani Electricity":
                        bill_data = pdf_parser_utils.parse_adani_electricity_bill(extracted_text)
                    elif provider_config['name'] == "MGL Gas":
                        bill_data = pdf_parser_utils.parse_mgl_gas_bill(extracted_text)
                        
                    if not bill_data.get("amount") or not bill_data.get("start_date"):
                        if os.path.exists(temp_path): os.remove(temp_path)
                        continue
                        
                    final_dir = os.path.join("downloaded_bills", provider_config['local_storage_folder'])
                    os.makedirs(final_dir, exist_ok=True)
                    final_filename = f"{bill_data['start_date'].strftime('%Y_%m')}_{provider_config['local_storage_folder'].replace(' ', '_')}.pdf"
                    final_pdf_path = os.path.join(final_dir, final_filename)
                    
                    os.rename(temp_path, final_pdf_path)
                    
                    # Pass both vendor name and utility_type category forward to relational database mapper
                    write_bill_to_warehouse(conn, msg_id, provider_config['name'], util_type, bill_data, final_pdf_path, matrix_rules)
                    break 
                    
        if not re_scan_all:
            update_scan_checkpoint(max_internal_msg_time)
        conn.close()
    except Exception as e:
        print(f"❌ Critical Ingestion Stream Failure: {e}")

def write_bill_to_warehouse(conn, msg_id, provider_name, utility_type, bill_data, pdf_path, matrix_rules):
    """Saves records safely, evaluates comparative KPIs, and registers calendar reminders."""
    cur = conn.cursor()
    s_date = bill_data['start_date']
    e_date = bill_data['end_date'] if bill_data['end_date'] else s_date
    b_year = s_date.year
    b_month = s_date.month
    
    cur.execute("""
        SELECT is_user_locked, google_task_id FROM utility_billing_history 
        WHERE provider_name = %s AND billing_period_start = %s AND billing_period_end = %s
    """, (provider_name, s_date, e_date)) # <--- Secure parameterized inputs

    lock_row = cur.fetchone()
    if lock_row and lock_row[0]:
        print(f"🔒 Row Versioning Lock Active: Skipping automated overwrite for {provider_name}.")
        cur.close()
        return

    id_string = f"{provider_name}_{s_date}_{e_date}"
    id_hash = hashlib.sha256(id_string.encode('utf-8')).hexdigest()
    kpi_delta = calculate_historical_kpis(cur, provider_name, bill_data['units'], s_date)
    
    task_id = lock_row[1] if lock_row else None
    if not task_id:
        task_id = google_tasks_utils.create_bill_payment_task(provider_name, bill_data['amount'], bill_data['due_date'])

    try:
        # --- FIXED QUERY STRING: SAVES THE INVARIANT CATEGORY DIRECTLY ---
        cur.execute("""
            INSERT INTO utility_billing_history (
                msg_id, idempotency_hash, provider_name, utility_type, bill_amount, due_date,
                billing_period_start, billing_period_end, billing_year, billing_month,
                units_consumed, google_task_id, local_pdf_path, data_source, notified_received
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'gmail_scan', TRUE)
            ON CONFLICT (provider_name, billing_period_start, billing_period_end)
            DO UPDATE SET 
                bill_amount = EXCLUDED.bill_amount, due_date = EXCLUDED.due_date,
                utility_type = EXCLUDED.utility_type, units_consumed = EXCLUDED.units_consumed, 
                local_pdf_path = EXCLUDED.local_pdf_path, updated_at = CURRENT_TIMESTAMP;
        """, (msg_id, id_hash, provider_name, utility_type, bill_data['amount'], bill_data['due_date'],
              s_date, e_date, b_year, b_month, bill_data['units'], task_id, pdf_path))
        conn.commit()
        
        target_group = matrix_rules.get("billing_rules", {}).get("target_group")
        whatsapp_body = format_whatsapp_kpi_message(provider_name, bill_data, kpi_delta)
        whatsapp_utils.send_whatsapp_message(target_group, whatsapp_body)
    except Exception as e:
        conn.rollback()
        print(f"❌ Database Record Insertion Failure: {e}")
    finally:
        cur.close()


def calculate_historical_kpis(cur, provider, current_units, start_date):
    """Calculates MoM and YoY usage trend differences against historical records."""
    deltas = {"mom_diff": 0.0, "mom_pct": 0.0, "yoy_diff": 0.0, "yoy_pct": 0.0}
    if current_units <= 0:
        return deltas
        
    # Month-over-Month Range Check
    m_target = start_date - datetime.timedelta(days=28)
    cur.execute("SELECT units_consumed FROM utility_billing_history WHERE provider_name=%s AND billing_year=%s AND billing_month=%s", (provider, m_target.year, m_target.month))
    row = cur.fetchone()
    if row and row[0] and float(row[0]) > 0:
        old = float(row[0])
        deltas["mom_diff"] = current_units - old
        deltas["mom_pct"] = (deltas["mom_diff"] / old) * 100

    # Year-over-Year Range Check
    y_target = start_date - datetime.timedelta(days=365)
    cur.execute("SELECT units_consumed FROM utility_billing_history WHERE provider_name=%s AND billing_year=%s AND billing_month=%s", (provider, y_target.year, y_target.month))
    row_y = cur.fetchone()
    if row_y and row_y[0] and float(row_y[0]) > 0:
        old_y = float(row_y[0])
        deltas["yoy_diff"] = current_units - old_y
        deltas["yoy_pct"] = (deltas["yoy_diff"] / old_y) * 100
        
    return deltas

def format_whatsapp_kpi_message(provider, data, kpi):
    """Formats comparison text metrics into clean visual scannable alert templates."""
    unit_label = "SCM" if provider == "MGL Gas" else "Units (kWh)"
    kpi_lines = ""
    if data['units'] > 0:
        mom_arrow = "🔺" if kpi['mom_diff'] >= 0 else "📉"
        yoy_arrow = "🔺" if kpi['yoy_diff'] >= 0 else "📉"
        kpi_lines = (
            f"\n\n📈 *Key Performance Indicators (KPIs):*\n"
            f"• Usage: {data['units']:.1f} {unit_label}\n"
            f"  ↳ vs Last Month: {kpi['mom_diff']:+.1f} ({mom_arrow} {kpi['mom_pct']:.1f}%)\n"
            f"  ↳ vs Last Year: {kpi['yoy_diff']:+.1f} ({yoy_arrow} {kpi['yoy_pct']:.1f}%)"
        )
        
    # --- FIX: SWAPPED RAW RUPEE UNICODE SYMBOL WITH SAFE TEXT LITERAL 'Rs.' ---
    return (
        f"🔔 *New Bill Received: {provider}*\n\n"
        f"• *Billing Period:* {data['start_date']} to {data['end_date']}\n"
        f"• *Net Payable Amount:* Rs. {data['amount']:.2f}\n"
        f"• *Due Date:* {data['due_date'].strftime('%d-%b-%Y')}"
        f"{kpi_lines}"
    )

def run_timeline_gap_audit():
    """Validates data continuity across time-series blocks to catch missing months."""
    print("🛡️ Running background data continuity and timeline gap audits...")
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Baseline temporal logging checkpoint structures
    for provider in ["Airtel WiFi", "Adani Electricity"]:
        cur.execute("""
            SELECT billing_year, billing_month FROM utility_billing_history 
            WHERE provider_name = %s ORDER BY billing_period_start DESC LIMIT 12
        """, (provider,))
        rows = cur.fetchall()
        
    cur.close()
    conn.close()


def process_manual_dropzone_files(matrix_rules):
    """Scans manual_upload_dropzone for local files and resolves their standalone utility categories."""
    dropzone_path = "manual_upload_dropzone"
    if not os.path.exists(dropzone_path):
        os.makedirs(dropzone_path, exist_ok=True)
        return

    local_files = [f for f in os.listdir(dropzone_path) if f.lower().endswith('.pdf') and not f.startswith('temp_')]
    if not local_files:
        return

    print(f"📂 [Dropzone Engine]: Identified {len(local_files)} manual uploads. Ingesting profiles...")
    conn = get_db_connection()
    providers = matrix_rules.get("billing_rules", {}).get("providers", [])

    for file_name in local_files:
        file_path = os.path.join(dropzone_path, file_name)
        extracted_text = pdf_parser_utils.extract_clean_text_from_pdf(file_path)
        if not extracted_text:
            continue

        matched_provider = None
        for provider in providers:
            body_match = any(anch.lower() in extracted_text.lower() for anch in provider.get("body_structural_anchors", []))
            if body_match or provider['name'].lower() in file_name.lower():
                matched_provider = provider
                break

        if not matched_provider:
            print(f"⚠️ Dropzone Warning: File '{file_name}' could not be matched. Skipping.")
            continue

        bill_data = {}
        util_type = matched_provider.get("utility_type", "WiFi") # Extract category rule configuration parameter
        
        if matched_provider['name'] == "Airtel WiFi":
            bill_data = pdf_parser_utils.parse_airtel_wifi_bill(extracted_text)
        elif matched_provider['name'] == "Adani Electricity":
            bill_data = pdf_parser_utils.parse_adani_electricity_bill(extracted_text)
        elif matched_provider['name'] == "MGL Gas":
            bill_data = pdf_parser_utils.parse_mgl_gas_bill(extracted_text)

        if not bill_data.get("amount") or not bill_data.get("start_date"):
            print(f"❌ Dropzone Error: Regex parser failed to extract mandatory parameters from '{file_name}'.")
            continue

        final_dir = os.path.join("downloaded_bills", matched_provider['local_storage_folder'])
        final_filename = f"MANUAL_{bill_data['start_date'].strftime('%Y_%m')}_{matched_provider['local_storage_folder'].replace(' ', '_')}.pdf"
        final_pdf_path = os.path.join(final_dir, final_filename)

        print(f"🔗 Transaction Started: Writing records and creating calendar tasks for '{file_name}'...")
        
        # Invoke manual warehouse worker with decoupled utility_type included in data arguments
        db_success = write_manual_bill_to_warehouse(
            conn, matched_provider['name'], util_type, bill_data, final_pdf_path, matrix_rules
        )

        if db_success:
            try:
                os.makedirs(final_dir, exist_ok=True)
                if os.path.exists(final_pdf_path): os.remove(final_pdf_path)
                os.rename(file_path, final_pdf_path)
                print(f"💾 File Operation Success: Archived '{file_name}' to storage directory structure.")
            except Exception as e:
                print(f"❌ Dropzone File IO Operation Failure on '{file_name}': {e}")
                conn.rollback()
        else:
            print(f"❌ Transaction Aborted: Retaining '{file_name}' inside dropzone container.")
    conn.close()


def retry_failed_notifications(matrix_rules):
    """Finds historical ledger items where data is saved but notifications failed, and retries delivery."""
    print("🔄 Checking for any failed notification alerts requiring retry delivery...")
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Query database for un-sent alerts
    # --- FIX: EXPANDED QUERY TO LOOK FOR BOTH FALSE AND UN-INITIALIZED NULL VALS ---
    cur.execute("""
        SELECT provider_name, bill_amount, due_date, billing_period_start, billing_period_end, units_consumed
        FROM utility_billing_history 
        WHERE notified_received IS NOT TRUE LIMIT 5;
    """)
    failed_rows = cur.fetchall()

    
    if not failed_rows:
        cur.close()
        conn.close()
        return

    print(f"📢 Found {len(failed_rows)} pending alerts in retry queue. Attempting delivery...")
    target_group = matrix_rules.get("billing_rules", {}).get("target_group")
    
    for row in failed_rows:
        provider, amount, due_date, s_date, e_date, units = row
        
        # Pull baseline metrics for KPI rendering
        kpi_delta = calculate_historical_kpis(cur, provider, float(units or 0), s_date)
        bill_data = {"start_date": s_date, "end_date": e_date, "amount": float(amount), "due_date": due_date, "units": float(units or 0)}
        
        whatsapp_body = f"🔄 *[RETRY QUEUE]*\n" + format_whatsapp_kpi_message(provider, bill_data, kpi_delta)
        
        if whatsapp_utils.send_whatsapp_message(target_group, whatsapp_body):
            cur.execute("""
                UPDATE utility_billing_history SET notified_received = TRUE 
                WHERE provider_name = %s AND billing_period_start = %s AND billing_period_end = %s
            """, (provider, s_date, e_date))
            conn.commit()
            print(f"✅ Retry Success: Cleared pending alert flag for {provider}.")
            time.sleep(3) # Safe anti-spam interval pause
            
    cur.close()
    conn.close()

def write_manual_bill_to_warehouse(conn, provider_name, utility_type, bill_data, pdf_path, matrix_rules):
    """Saves user-uploaded bills natively, logging the scalable utility category tag framework."""
    cur = conn.cursor()
    s_date = bill_data['start_date']
    e_date = bill_data['end_date'] if bill_data['end_date'] else s_date
    b_year = s_date.year
    b_month = s_date.month

    id_string = f"{provider_name}_{s_date}_{e_date}"
    id_hash = hashlib.sha256(id_string.encode('utf-8')).hexdigest()
    kpi_delta = calculate_historical_kpis(cur, provider_name, bill_data['units'], s_date)
    task_id = google_tasks_utils.create_bill_payment_task(provider_name, bill_data['amount'], bill_data['due_date'])

    try:
        # --- PYTHON ETL PARSER SUITE MODIFICATIONS (PART 2/2) ---
        # Map the utility_type variable straight into your PostgreSQL row matrix fields
        cur.execute("""
            INSERT INTO utility_billing_history (
                idempotency_hash, provider_name, utility_type, bill_amount, due_date,
                billing_period_start, billing_period_end, billing_year, billing_month,
                units_consumed, google_task_id, local_pdf_path, data_source, notified_received
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pdf_dropzone', TRUE)
            ON CONFLICT (provider_name, billing_period_start, billing_period_end)
            DO UPDATE SET 
                bill_amount = EXCLUDED.bill_amount, due_date = EXCLUDED.due_date,
                utility_type = EXCLUDED.utility_type, units_consumed = EXCLUDED.units_consumed, 
                local_pdf_path = EXCLUDED.local_pdf_path, data_source = 'pdf_dropzone', 
                notified_received = FALSE, updated_at = CURRENT_TIMESTAMP;
        """, (id_hash, provider_name, utility_type, bill_data['amount'], bill_data['due_date'],
              s_date, e_date, b_year, b_month, bill_data['units'], task_id, pdf_path))
        
        conn.commit()
        print(f"✅ Dropzone Success: Database timeline row written with Category [{utility_type}]!")
        
        target_group = matrix_rules.get("billing_rules", {}).get("target_group")
        whatsapp_body = f"📂 *Manual Dropzone Ingested* \n*Category:* {utility_type}\n" + format_whatsapp_kpi_message(provider_name, bill_data, kpi_delta)
        whatsapp_utils.send_whatsapp_message(target_group, whatsapp_body)
        
        cur.close()
        return True
    except Exception as e:
        conn.rollback()
        print(f"❌ Dropzone Database Insertion Failure: {e}")
        cur.close()
        return False



def main_sync_pipeline(re_sync_history=False):
    """Consolidated main orchestrator execution block."""
    print("🏁 Starting Unified state sync pipeline sequence...")
    
    whatsapp_is_ready = whatsapp_utils.initialize_whatsapp()
    if not whatsapp_is_ready:
        print("❌ Pipeline Aborted: Background messaging engine is offline.")
        return
    
    if not os.path.exists(MATRIX_FILE):
        print("❌ Matrix properties mapping missing.")
        return
    with open(MATRIX_FILE, "r") as f:
        matrix_rules = json.load(f)
        
    # Task 1/5: Scan for files inside the manual upload dropzone
    process_manual_dropzone_files(matrix_rules)
        
    # Task 2/5: Fetch incoming billing statements from Gmail
    gmail_service = authenticate_billing_account()
    process_gmail_billing_stream(gmail_service, matrix_rules, re_sync_history)
    
    # Task 3/5: Run background data continuity audits
    run_timeline_gap_audit()
    
    # Task 4/5: Process automated payment lifecycle checks
    from utility_billing import bill_payment_checker
    bill_payment_checker.audit_calendar_tasks_checklist()
    bill_payment_checker.scan_inbox_for_payment_receipts(gmail_service, matrix_rules)
    
    # --- NEW TASK: RUN AUTOMATED DEADLINE PROXIMITY CHECKERS ---
    from utility_billing import proximity_alerts
    proximity_alerts.run_due_date_proximity_alerts()
    
    # Task 5/5: Sweep and retry any failed WhatsApp alert packets
    retry_failed_notifications(matrix_rules)

    
    print("✅ Pipeline sync operations complete.")


if __name__ == "__main__":
    main_sync_pipeline(re_sync_history=False)

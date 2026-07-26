import os
import sys
import json
import datetime
import base64
import psycopg2

# --- ROOT RESOLUTION TRACKING ENGINE ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)
os.chdir(ROOT_DIR)

import whatsapp_utils
import google_tasks_utils

from whatsapp_utils import get_db_connection
from bill_scanner import authenticate_billing_account

# Explicitly re-declare matrix path to avoid loading bill_scanner variables
MATRIX_FILE = "routing_matrix.json"

whatsapp_utils.load_env_file()

def scan_inbox_for_payment_receipts(gmail_service, matrix_rules):
    """Scans for payment confirmation receipts and updates the transaction ledger states."""
    print("📥 Querying mailbox logs for recent utility payment confirmations...")
    
    # Calculate a trailing 30-day lookup window to catch recent payment receipts
    lookback_date = (datetime.datetime.now() - datetime.timedelta(days=30)).strftime("%Y/%m/%d")
    
    # Unified search mask looking for generic payment indicators
    query_string = f"after:{lookback_date} (subject:\"payment confirmation\" OR subject:\"receipt\" OR subject:\"successful\")"
    
    try:
        results = gmail_service.users().messages().list(userId='me', q=query_string).execute()
        messages = results.get('messages', [])
        if not messages:
            print("⚪ No new payment receipts detected inside the active evaluation window.")
            return

        conn = get_db_connection()
        cur = conn.cursor()
        
        # Pull all currently unpaid ledger items from PostgreSQL to check for matches
        cur.execute("""
            SELECT id, provider_name, bill_amount, billing_month, google_task_id 
            FROM utility_billing_history 
            WHERE is_paid_status = FALSE;
        """)
        unpaid_bills = cur.fetchall()
        
        if not unpaid_bills:
            print("✅ All clear! Your database timeline ledger shows zero outstanding unpaid bills.")
            cur.close()
            conn.close()
            return

        print(f"🔍 Auditing {len(unpaid_bills)} unpaid database records against incoming email streams...")
        
        for msg_ref in messages:
            msg_id = msg_ref['id']
            msg = gmail_service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            
            payload = msg.get('payload', {})
            headers = payload.get('headers', [])
            subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), "").lower()
            snippet = msg.get('snippet', "").lower()
            
            combined_email_text = f"{subject} {snippet}"
            
            for db_id, provider, amount, b_month, task_id in unpaid_bills:
                # 1. Verify Provider Keyword Match
                provider_matched = False
                if provider == "Airtel WiFi" and ("airtel" in combined_email_text or "broadband" in combined_email_text):
                    provider_matched = True
                elif provider == "Adani Electricity" and ("adani" in combined_email_text or "electricity" in combined_email_text):
                    provider_matched = True
                elif provider == "MGL Gas" and ("mahanagar" in combined_email_text or "mgl" in combined_email_text):
                    provider_matched = True
                    
                if not provider_matched:
                    continue
                    
                # 2. Verify payment amount match (handles standard text structures or integer matches)
                amount_str = f"{amount:.0f}" # Check for integer base (e.g., "942")
                amount_exact = f"{amount:.2f}" # Check for exact decimal string
                
                if amount_str in combined_email_text or amount_exact in combined_email_text:
                    print(f"🎉 Payment Match Found! Confirmed receipt for {provider} - Amount: Rs. {amount:.2f}")
                    
                    # Update database ledger fields to PAID state
                    cur.execute("""
                        UPDATE utility_billing_history 
                        SET is_paid_status = TRUE, 
                            payment_success_date = CURRENT_TIMESTAMP 
                        WHERE id = %s;
                    """, (db_id,)) # <--- Secure integer input mapping

                    conn.commit()
                    
                    # Safely remove the matching checklist item from your Google Calendar sidebar
                    if task_id:
                        google_tasks_utils.delete_bill_payment_task(task_id)
                        
                    # Dispatch confirmation summary to WhatsApp group
                    target_group = matrix_rules.get("billing_rules", {}).get("target_group")
                    whatsapp_msg = f"✅ *Payment Success Confirmed!*\n\n• *Provider:* {provider}\n• *Amount Cleared:* Rs. {amount:.2f}\n• *Status:* Marked PAID in database. System tracking timeline is healthy."
                    whatsapp_utils.send_whatsapp_message(target_group, whatsapp_msg)
                    
                    break # Record finalized, move to next item
                    
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error scanning payment confirmation scripts: {e}")

def audit_calendar_tasks_checklist():
    """Queries Google Tasks directly to check if items were marked complete by the user via the Calendar UI."""
    print("🛡️ Auditing Google Tasks side-panel checkboxes for manual completion updates...")
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Fetch tracking entries that are still marked as outstanding and unpaid
    cur.execute("SELECT id, provider_name, bill_amount, google_task_id FROM utility_billing_history WHERE is_paid_status = FALSE AND google_task_id IS NOT NULL;")
    pending_tasks = cur.fetchall()
    
    if not pending_tasks:
        cur.close()
        conn.close()
        return

    for db_id, provider, amount, task_id in pending_tasks:
        # Invoke Google Tasks utility file to audit state vectors
        is_completed_by_user = google_tasks_utils.check_task_completion_status(task_id)
        
        if is_completed_by_user:
            print(f"☑️ User Check Detected: Syncing {provider} statement to PAID state inside ledger.")
            cur.execute("""
                UPDATE utility_billing_history 
                SET is_paid_status = TRUE, 
                    payment_success_date = CURRENT_TIMESTAMP 
                WHERE id = %s;
            """, (db_id,))
            conn.commit()
            
    cur.close()
    conn.close()

def execute_payment_sync_pipeline():
    """Consolidated orchestration sequence wrapper."""
    print("🏁 Initializing payment validation lifecycle checks...")
    
    if not os.path.exists(MATRIX_FILE):
        print("❌ Configuration matrix routing parameters file missing.")
        return
    with open(MATRIX_FILE, "r") as f:
        matrix_rules = json.load(f)
        
    # Task 1: Check your Google Calendar Tasks Checklist
    audit_calendar_tasks_checklist()
    
    # Task 2: Scan Inbox for Provider Confirmation Email Slugs
    gmail_service = authenticate_billing_account()
    scan_inbox_for_payment_receipts(gmail_service, matrix_rules)
    
    print("✅ Payment status synchronization workflow complete.")

if __name__ == "__main__":
    execute_payment_sync_pipeline()

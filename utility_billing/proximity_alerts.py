import os
import sys
import json
import datetime

# --- ROOT RESOLUTION TRACKING ENGINE ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

os.chdir(ROOT_DIR)

import whatsapp_utils
from whatsapp_utils import get_db_connection

def run_due_date_proximity_alerts():
    """Identifies unpaid bills nearing deadlines and dispatches urgent group reminders."""
    print("⏳ Auditing database entries for due date proximity thresholds...")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    # 1. Fetch all outstanding unpaid records
    cur.execute("""
        SELECT id, provider_name, bill_amount, due_date, billing_period_start, billing_period_end
        FROM utility_billing_history
        WHERE is_paid_status = FALSE;
    """)
    unpaid_rows = cur.fetchall()
    
    if not unpaid_rows:
        print("✅ All clear! Zero outstanding liabilities found requiring deadline alerts.")
        cur.close()
        conn.close()
        return

    # Load matrix routing parameters to extract the target WhatsApp group JID
    with open("routing_matrix.json", "r") as f:
        matrix_rules = json.load(f)
    target_group = matrix_rules.get("billing_rules", {}).get("target_group")

    today = datetime.date.today()
    alerts_triggered = 0

    # 2. Iterate through unpaid bills to calculate threshold gaps
    for row in unpaid_rows:
        db_id, provider, amount, due_date, s_date, e_date = row
        
        # Calculate exactly how many days are left until the deadline
        days_remaining = (due_date - today).days
        
        # Trigger an alert if the bill is due in exactly 2 days, or if it's already overdue
        if days_remaining == 2 or days_remaining < 0:
            alerts_triggered += 1
            
            # Choose the appropriate heading emoji based on priority
            status_header = "⚠️ *URGENT OVERDUE WARNING*" if days_remaining < 0 else "⏰ *DEADLINE PROXIMITY ALERT*"
            time_label = f"OVERDUE BY {abs(days_remaining)} DAYS!" if days_remaining < 0 else "DUE IN EXACTLY 2 DAYS"
            
            # Format a clear, high-contrast notification message string
            whatsapp_body = (
                f"{status_header}\n\n"
                f"Your billing ledger detects an outstanding balance that requires immediate attention.\n\n"
                f"• *Utility Channel:* {provider}\n"
                f"• *Net Amount:* Rs. {float(amount):.2f}\n"
                f"• *Official Due Date:* {due_date.strftime('%d-%b-%Y')} ({time_label})\n"
                f"• *Billing Cycle:* {s_date} to {e_date}\n\n"
                f"👉 _Please mark this task complete on your Google Calendar side panel or click PAID on your Sapphire dashboard once settled._"
            )
            
            print(f"🚨 Priority Match! Sending {provider} alert string over your network layout...")
            whatsapp_utils.send_whatsapp_message(target_group, whatsapp_body)
            
    print(f"🏁 Deadline audit complete. Dispatched {alerts_triggered} alert packets.")
    cur.close()
    conn.close()

if __name__ == "__main__":
    whatsapp_utils.initialize_whatsapp()
    run_due_date_proximity_alerts()

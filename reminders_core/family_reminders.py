import sys
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(ROOT_DIR)
os.chdir(ROOT_DIR)

import json
import datetime
import argparse
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

import whatsapp_utils 

whatsapp_utils.load_env_file()

CLIENT_SECRET_FILE = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
TOKEN_FILE_PERSONAL = os.environ.get("TOKEN_FILE_PERSONAL", "token_personal.json")

SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/tasks'
]
MATRIX_FILE = "routing_matrix.json"

def authenticate_google_calendar():
    creds = None
    if os.path.exists(TOKEN_FILE_PERSONAL):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE_PERSONAL, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing authentication session...")
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds:
            print("Opening browser for Personal Google Account Authentication login...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE_PERSONAL, 'w') as token:
            token.write(creds.to_json())
    return build('calendar', 'v3', credentials=creds)

def process_family_reminders(force_run=False):
    """Fetches upcoming events and dispatches them via headless API gateway connections."""
    if not os.path.exists(MATRIX_FILE):
        print(f"❌ Critical Error: Missing matrix mapping layout file '{MATRIX_FILE}'")
        return

    with open(MATRIX_FILE, "r") as f:
        matrix = json.load(f)
    
    rules = matrix.get("family_rules", [])
    if not rules:
        print("⚠️ Warning: No family mapping rules detected inside your routing matrix.")
        return

    service = authenticate_google_calendar()
    now = datetime.datetime.now()
    today = now.date()
    current_hour = now.hour
    current_weekday = today.strftime("%A")

    if current_weekday == "Sunday" and current_hour < 13:
        mode = "SUNDAY"
        start, end = today, today + datetime.timedelta(days=6)
        print(f"📋 Running Mode: [SUNDAY WEEKLY DIGEST] for range {start} to {end}")
    elif current_hour < 12:
        mode = "MORNING"
        start, end = today, today
        print(f"📋 Running Mode: [ON-THE-DAY MORNING REMINDERS] for {today}")
    else:
        mode = "EVENING"
        start, end = today + datetime.timedelta(days=1), today + datetime.timedelta(days=1)
        print(f"📋 Running Mode: [DAY-BEFORE EVENING REMINDERS] for tomorrow ({start})")

    time_min = datetime.datetime.combine(start, datetime.time.min).isoformat() + 'Z'
    time_max = datetime.datetime.combine(end, datetime.time.max).isoformat() + 'Z'

    for rule in rules:
        label = rule.get("calendar_name", "📅 Reminder")
        
        # 🔍 Check schedule configuration per rule before processing
        if not whatsapp_utils.check_schedule_recurrence(rule, force_run=force_run):
            continue

        calendar_id = rule.get("calendar_id")
        targets = rule.get("targets", [])

        if not calendar_id or not targets:
            print(f"⏩ Skipping rule '{label}': Missing calendar_id or targets array list.")
            continue

        print(f"🔍 Scanning events for '{label}'...")
        events_by_date = {}
        try:
            events_result = service.events().list(
                calendarId=calendar_id, timeMin=time_min, timeMax=time_max, singleEvents=True, orderBy='startTime'
            ).execute()
            
            for event in events_result.get('items', []):
                summary = event.get('summary', 'Untitled Event')
                event_start = event['start'].get('dateTime', event['start'].get('date'))
                event_date = datetime.datetime.strptime(event_start.split('T')[0], "%Y-%m-%d").date()
                if event_date not in events_by_date:
                    events_by_date[event_date] = []
                events_by_date[event_date].append(f"{label}: {summary}")
        except Exception as e:
            print(f"❌ Error accessing family calendar '{label}': {e}")
            continue

        if not events_by_date:
            print(f"⚪ No events found in calendar '{label}' for this execution window.")
            whatsapp_utils.log_reminder_execution(
                target_id=targets[0] if targets else "N/A",
                status="Skipped",
                error_msg="",
                message_content=f"⚪ No events found in calendar '{label}' for this execution window.",
                pipeline_type="family"
            )
            continue
        else:
            print(f"☑️ Found {sum(len(events) for events in events_by_date.values())} events in calendar '{label}' for this execution window.")

        if mode == "SUNDAY":
            msg_lines = ["🗓️ *Upcoming Family Events This Week:* \n"]
            for edate in sorted(events_by_date.keys()):
                for ev in events_by_date[edate]:
                    msg_lines.append(f"• *{edate.strftime('%A, %b %d')}* -> {ev}")
            message_body = "\n".join(msg_lines)
        elif mode == "MORNING":
            day_events = events_by_date.get(today, [])
            if not day_events:
                print(f"⚪ No events found today in calendar '{label}'.")
                whatsapp_utils.log_reminder_execution(
                    target_id=targets[0] if targets else "N/A",
                    status="Skipped",
                    error_msg="",
                    message_content=f"⚪ No events found today in calendar '{label}'.",
                    pipeline_type="family"
                )
                continue
            message_body = "🔔 *Reminders for TODAY:*\n\n" + "\n".join(day_events)
        else:
            day_events = events_by_date.get(start, [])
            if not day_events:
                print(f"⚪ No events found for tomorrow in calendar '{label}'.")
                whatsapp_utils.log_reminder_execution(
                    target_id=targets[0] if targets else "N/A",
                    status="Skipped",
                    error_msg="",
                    message_content=f"⚪ No events found for tomorrow in calendar '{label}'.",
                    pipeline_type="family"
                )
                continue
            cleaned_events = [ev.replace(" Tomorrow", "") for ev in day_events]
            message_body = "🔔 *Reminders for Tomorrow:*\n\n" + "\n".join(cleaned_events)

        for target in targets:
            success = whatsapp_utils.send_whatsapp_message(target, message_body, pipeline_type="family")            
            if success:
                print(f"🚀 Success! Reminders sent via Background Engine to target: {target}")
            else:
                print(f"❌ Failed execution matrix delivery payload on target: {target}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Family WhatsApp Reminders Runner")
    parser.add_argument("--force", action="store_true", help="Bypass schedule restrictions and execute immediately.")
    args = parser.parse_args()

    print("Verifying background WhatsApp engine connectivity and session status...")
    if not whatsapp_utils.initialize_whatsapp():
        print("❌ Script aborted due to inactive API session node.")
        exit(1)
        
    try:
        process_family_reminders(force_run=args.force)
    except Exception as e:
        print(f"❌ Unhandled execution exception: {e}")
        whatsapp_utils.log_reminder_execution(
            target_id="SYSTEM_CORE",
            status="Failed",
            error_msg=str(e),
            message_content="Critical unhandled exception during pipeline execution.",
            pipeline_type="family"
        )
        exit(1)
    finally:
        print("🏁 Execution complete. Headless pipeline closed down cleanly.")
import os
import json
import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

import whatsapp_utils 

whatsapp_utils.load_env_file() # Run common env loader

CLIENT_SECRET_FILE = "client_secret.json"
TOKEN_FILE = "token.json"
SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/contacts.readonly'
]
MATRIX_FILE = "routing_matrix.json"

def authenticate_google_calendar():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing authentication session...")
            creds.refresh(Request())
        else:
            print("Opening browser for Google Authentication login...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
    return build('calendar', 'v3', credentials=creds)

def process_family_reminders():
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
                summary = event.get('summary')
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
            message_body = "🔔 *Reminders for TODAY:*\n\n" + "\n".join(events_by_date[today])
        else:
            cleaned_events = [ev.replace(" Tomorrow", "") for ev in events_by_date[start]]
            message_body = "🔔 *Reminders for Tomorrow:*\n\n" + "\n".join(cleaned_events)

        for target in targets:
            # Replaced Selenium call with direct, headless HTTP API transaction
            success = whatsapp_utils.send_whatsapp_message(target, message_body)
            if success:
                print(f"🚀 Success! Reminders sent via Background Engine to target: {target}")
            else:
                print(f"❌ Failed execution matrix delivery payload on target: {target}")

if __name__ == "__main__":
    print("Verifying background WhatsApp engine connectivity and session status...")
    
    # Initialize the connection state check
    connection_is_active = whatsapp_utils.initialize_whatsapp()

    if not connection_is_active:
        print("❌ Script aborted due to inactive API session node.")
        exit(1)
        
    try:
        process_family_reminders()
    finally:
        print("🏁 Execution complete. Headless pipeline closed down cleanly.")

# import os
# import json
# import datetime
# from google.auth.transport.requests import Request
# from google.oauth2.credentials import Credentials
# from google_auth_oauthlib.flow import InstalledAppFlow
# from googleapiclient.discovery import build

# import whatsapp_utils 

# whatsapp_utils.load_env_file() # Run common env loader

# CLIENT_SECRET_FILE = "client_secret.json"
# TOKEN_FILE = "token.json"
# SCOPES = [
#     'https://www.googleapis.com/auth/calendar.readonly',
#     'https://www.googleapis.com/auth/contacts.readonly'
# ]
# MATRIX_FILE = "routing_matrix.json"

# def authenticate_google_calendar():
#     creds = None
#     if os.path.exists(TOKEN_FILE):
#         creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
#     if not creds or not creds.valid:
#         if creds and creds.expired and creds.refresh_token:
#             print("Refreshing authentication session...")
#             creds.refresh(Request())
#         else:
#             print("Opening browser for Google Authentication login...")
#             flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
#             creds = flow.run_local_server(port=0)
#         with open(TOKEN_FILE, 'w') as token:
#             token.write(creds.to_json())
#     return build('calendar', 'v3', credentials=creds)

# def process_family_reminders(driver):
#     if not os.path.exists(MATRIX_FILE):
#         print(f"❌ Critical Error: Missing matrix mapping layout file '{MATRIX_FILE}'")
#         return

#     with open(MATRIX_FILE, "r") as f:
#         matrix = json.load(f)
    
#     rules = matrix.get("family_rules", [])
#     if not rules:
#         print("⚠️ Warning: No family mapping rules detected inside your routing matrix.")
#         return

#     service = authenticate_google_calendar()
#     now = datetime.datetime.now()
#     today = now.date()
#     current_hour = now.hour
#     current_weekday = today.strftime("%A")

#     if current_weekday == "Sunday" and current_hour < 13:
#         mode = "SUNDAY"
#         start, end = today, today + datetime.timedelta(days=6)
#         print(f"📋 Running Mode: [SUNDAY WEEKLY DIGEST] for range {start} to {end}")
#     elif current_hour < 12:
#         mode = "MORNING"
#         start, end = today, today
#         print(f"📋 Running Mode: [ON-THE-DAY MORNING REMINDERS] for {today}")
#     else:
#         mode = "EVENING"
#         start, end = today + datetime.timedelta(days=1), today + datetime.timedelta(days=1)
#         print(f"📋 Running Mode: [DAY-BEFORE EVENING REMINDERS] for tomorrow ({start})")

#     time_min = datetime.datetime.combine(start, datetime.time.min).isoformat() + 'Z'
#     time_max = datetime.datetime.combine(end, datetime.time.max).isoformat() + 'Z'

#     for rule in rules:
#         label = rule.get("calendar_name", "📅 Reminder")
#         calendar_id = rule.get("calendar_id")
#         targets = rule.get("targets", [])

#         if not calendar_id or not targets:
#             print(f"⏩ Skipping rule '{label}': Missing calendar_id or targets array list.")
#             continue

#         print(f"🔍 Scanning events for '{label}'...")
#         events_by_date = {}
#         try:
#             events_result = service.events().list(
#                 calendarId=calendar_id, timeMin=time_min, timeMax=time_max, singleEvents=True, orderBy='startTime'
#             ).execute()
            
#             for event in events_result.get('items', []):
#                 summary = event.get('summary')
#                 event_start = event['start'].get('dateTime', event['start'].get('date'))
#                 event_date = datetime.datetime.strptime(event_start.split('T')[0], "%Y-%m-%d").date()
#                 if event_date not in events_by_date:
#                     events_by_date[event_date] = []
#                 events_by_date[event_date].append(f"{label}: {summary}")
#         except Exception as e:
#             print(f"❌ Error accessing family calendar '{label}': {e}")
#             continue

#         if not events_by_date:
#             print(f"⚪ No events found in calendar '{label}' for this execution window.")
#             continue
#         else:
#             print(f"☑️ Found {sum(len(events) for events in events_by_date.values())} events in calendar '{label}' for this execution window.")


#         if mode == "SUNDAY":
#             msg_lines = ["🗓️ *Upcoming Family Events This Week:* \n"]
#             for edate in sorted(events_by_date.keys()):
#                 for ev in events_by_date[edate]:
#                     msg_lines.append(f"• *{edate.strftime('%A, %b %d')}* -> {ev}")
#             message_body = "\n".join(msg_lines)
#         elif mode == "MORNING":
#             message_body = "🔔 *Family Reminders for TODAY:*\n\n" + "\n".join(events_by_date[today])
#         else:
#             cleaned_events = [ev.replace(" Tomorrow", "") for ev in events_by_date[start]]
#             message_body = "🔔 *Family Reminders for Tomorrow:*\n\n" + "\n".join(cleaned_events)

#         for target in targets:
#             #success = whatsapp_utils.send_whatsapp_via_selenium(driver, target, message_body)
#             success = whatsapp_utils.send_whatsapp_message(target, message_body)
#             if success:
#                 print(f"🚀 Success! Reminders sent via Edge engine to: {target}")
#             else:
#                 print(f"❌ Failed execution matrix delivery payload on target: {target}")

# if __name__ == "__main__":
#     print("Verifying background WhatsApp engine connectivity and session status...")
#     # Start driver via common utility
#     # driver = whatsapp_utils.initialize_selenium_whatsapp()
#     driver = whatsapp_utils.initialize_whatsapp()

#     if not driver:
#         exit(1)
        
#     try:
#         process_family_reminders(driver)
#     finally:
#         print("🏁 Execution complete. Shutting down active Edge engine pipelines.")
#         if driver:
#             driver.quit()

import sys
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(ROOT_DIR)
os.chdir(ROOT_DIR)
import whatsapp_utils

import json
import datetime
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

def fetch_google_contacts_birthdays(creds):
    """Queries Google People API to extract contact names and matching birth dates."""
    birthdays_by_date = {}
    try:
        print("🔍 Syncing with Google Contacts database engine...")
        people_service = build('people', 'v1', credentials=creds)
        
        # Request a list of contacts containing names and birthday fields
        results = people_service.people().connections().list(
            resourceName='people/me',
            pageSize=1000, # Adjust higher if you have more than 1000 contacts
            personFields='names,birthdays'
        ).execute()
        
        connections = results.get('connections', [])
        current_year = datetime.datetime.now().year
        
        for person in connections:
            names = person.get('names', [])
            birthdays = person.get('birthdays', [])
            
            if names and birthdays:
                display_name = names[0].get('displayName')
                birthday_data = birthdays[0].get('date', {})
                
                month = birthday_data.get('month')
                day = birthday_data.get('day')
                
                if month and day:
                    # Map the birthday to the current processing year
                    mapped_date = datetime.date(current_year, month, day)
                    
                    if mapped_date not in birthdays_by_date:
                        birthdays_by_date[mapped_date] = []
                        
                    birthdays_by_date[mapped_date].append({
                        "text": f"{display_name}'s Birthday",
                        "category": "Birthday",
                        "icon": "🎂"
                    })
        print(f"✅ Successfully matched {len(connections)} contact identities.")
        return birthdays_by_date
    except Exception as e:
        print(f"⚠️ Warning: Unable to parse Google Contacts: {e}")
        return birthdays_by_date

def authenticate_google_calendar(creds):
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing authentication session...")
            creds.refresh(Request())
        else:
            print("Opening browser for Google Authentication login...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE_PERSONAL, 'w') as token:
            token.write(creds.to_json())
    return build('calendar', 'v3', credentials=creds)

def process_individual_reminders():
    if not os.path.exists(MATRIX_FILE):
        print(f"❌ Critical Error: Missing matrix mapping layout file '{MATRIX_FILE}'")
        return

    with open(MATRIX_FILE, "r") as f:
        matrix = json.load(f)
    
    rules = matrix.get("individual_rules", [])
    if not rules:
        print("⚠️ Warning: No individual mapping rules detected inside your routing matrix.")
        return
    
    # Pass the authorization object variables downstream
    # (Assume 'authenticate_google_calendar()' returns an authorized creds object now)
    # To make this easy, separate your credential tracking from the calendar service build:
    creds = None
    if os.path.exists(TOKEN_FILE_PERSONAL):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE_PERSONAL, SCOPES)
    # ... (Keep your standard flow initialization check code here) ...
    
    # NEW: Fetch all contact birthdays instantly
    contact_birthdays = fetch_google_contacts_birthdays(creds)
    calendar_service = authenticate_google_calendar(creds)
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
        calendar_name = rule.get("calendar_name", "💼 Custom Calendar")
        calendar_id = rule.get("calendar_id")
        targets = rule.get("targets", [])

        if not calendar_id or not targets:
            print(f"⏩ Skipping rule '{calendar_name}': Missing calendar_id or targets array list.")
            continue

        print(f"🔍 Scanning events for '{calendar_name}'...")
        events_by_date = {}
        current_date = start  # Reset the tracking date for each calendar rule loop

        while current_date <= end:
            if current_date in contact_birthdays:
                events_by_date[current_date] = list(contact_birthdays[current_date])
            current_date += datetime.timedelta(days=1)
        try:
            events_result = calendar_service.events().list(
                calendarId=calendar_id, timeMin=time_min, timeMax=time_max, singleEvents=True, orderBy='startTime'
            ).execute()
            
            for event in events_result.get('items', []):
                summary = event.get('summary', '')
                event_start = event['start'].get('dateTime', event['start'].get('date'))
                
                date_str = event_start.split('T')[0]
                event_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                
                if event_date not in events_by_date:
                    events_by_date[event_date] = []
                
                summary_lower = summary.lower()
                if "birthday" in summary_lower:
                    icon, category = "🎂", "Birthday"
                elif "anniversary" in summary_lower:
                    icon, category = "💑", "Anniversary"
                else:
                    icon, category = "📌", "Reminder"
                
                events_by_date[event_date].append({
                    "text": summary,
                    "category": category,
                    "icon": icon
                })
        except Exception as e:
            print(f"❌ Error accessing individual calendar '{calendar_name}': {e}")
            continue

        if not events_by_date:
            print(f"⚪ No events found in calendar '{calendar_name}' for this execution window.")
        else:
            print(f"☑️ Found {sum(len(events) for events in events_by_date.values())} events in calendar '{calendar_name}' for this execution window.")

        # --- MODE 1: SUNDAY DIGEST BROADCAST ---
        if mode == "SUNDAY":
            has_celebrations = any(ev["category"] in ["Birthday", "Anniversary"] for dates in events_by_date.values() for ev in dates)
            header = "🗓️ *Upcoming Celebrations This Week:*\n" if has_celebrations else "🗓️ *Upcoming Reminders This Week:*\n"
            
            msg_lines = [header]
            for edate in sorted(events_by_date.keys()):
                readable_date = edate.strftime("%A, %b %d")
                for ev in events_by_date[edate]:
                    msg_lines.append(f"• *{readable_date}* -> {ev['icon']} {ev['text']}")
            message_body = "\n".join(msg_lines)

        # --- MODE 2: ON-THE-DAY MORNING BROADCAST ---
        elif mode == "MORNING":
            day_events = events_by_date.get(today, [])
            if not day_events:
                print(f"⚪ No events found today in calendar '{calendar_name}'.")
                continue
                
            has_birthdays = any(ev["category"] == "Birthday" for ev in day_events)
            header = "🎉 *Today's Celebrations!:*\n" if has_birthdays else "🔔 *Your Reminders for TODAY:*\n"
            
            msg_lines = [header]
            for ev in day_events:
                msg_lines.append(f"• {ev['icon']} {ev['text']}")
            message_body = "\n".join(msg_lines)

        # --- MODE 3: DAY-BEFORE EVENING BROADCAST (Your Snippet) ---
        else:
            day_events = events_by_date.get(start, [])
            if not day_events:
                print(f"⚪ No events found for tomorrow in calendar '{calendar_name}'.")
                continue
                
            has_celebrations = any(ev["category"] in ["Birthday", "Anniversary"] for ev in day_events)
            message_body = "🎁 *Celebrations Tomorrow:*\n\n" if has_celebrations else "🔔 *Personal Reminders Tomorrow:*\n\n"
                
            formatted_events = []
            for ev in day_events:
                cleaned_text = ev['text'].replace(" Tomorrow", "").replace(" tomorrow", "")
                formatted_events.append(f"{ev['icon']} {cleaned_text}")
            message_body += "\n".join(formatted_events)

        # --- SEND MESSAGE & PRINT RECIPIENT LOGS ---
        for target in targets:
            # Note: WAHA specific 'get_chat_display_name' is removed here to maintain stability.
            # Using raw chat_id as target variable directly.
            # success = whatsapp_utils.send_whatsapp_via_selenium(driver, target, message_body)
            success = whatsapp_utils.send_whatsapp_message(target, message_body)
            if success:
                print(f"🚀 Success! Reminders for '{calendar_name}' successfully sent to: {target}")
            else:
                print(f"❌ Failed to deliver '{calendar_name}' alert package to: {target}")

if __name__ == "__main__":
    print("Verifying background WhatsApp engine connectivity and session status...")
    
    # Initialize the connection state check
    connection_is_active = whatsapp_utils.initialize_whatsapp()

    if not connection_is_active:
        print("❌ Script aborted due to inactive API session node.")
        exit(1)
        
    try:
        process_individual_reminders()
    finally:
        print("🏁 Execution complete. Headless pipeline closed down cleanly.")

# if __name__ == "__main__":
#     print("Verifying background WhatsApp engine connectivity and session status...")
#     # Start driver via common utility
#     # driver = whatsapp_utils.initialize_selenium_whatsapp()
#     driver = whatsapp_utils.initialize_whatsapp()
#     if not driver:
#         exit(1)
        
#     try:
#         process_individual_reminders(driver)
#     finally:
#         print("🏁 Execution complete. Shutting down active Edge engine pipelines.")
#         if driver:
#             driver.quit()

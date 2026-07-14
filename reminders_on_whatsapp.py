import os
import datetime
import requests
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# --- CONFIGURATION ---
WAHA_URL = "http://localhost:3005/api/sendText"
WAHA_HEADERS = {
    "Content-Type": "application/json",
    "X-Api-Key": "mysecretkey123" 
}

# Target Recipient Configuration
#GROUP_ID = "261318896562355@lid" # Pratik Germany
GROUP_ID = "919819415760-1498662272@g.us" # Mastikhors

CLIENT_SECRET_FILE = "client_secret.json"
CREDENTIALS_FILE = "credentials.json"
TOKEN_FILE = "token.json"

SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

CALENDARS_TO_CHECK = {
    "📅 Reminder": "family15341449385209504582@group.calendar.google.com"
}

def authenticate_google_calendar():
    """Authenticates the user via browser and saves token locally."""
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

def fetch_events_for_range(start_date, end_date):
    """Fetches events from Google Calendar between two specific dates."""
    service = authenticate_google_calendar()
    
    # Format boundaries to RFC3339 UTC format
    time_min = datetime.datetime.combine(start_date, datetime.time.min).isoformat() + 'Z'
    time_max = datetime.datetime.combine(end_date, datetime.time.max).isoformat() + 'Z'
    
    events_by_date = {}
    
    for label, calendar_id in CALENDARS_TO_CHECK.items():
        try:
            events_result = service.events().list(
                calendarId=calendar_id, 
                timeMin=time_min, 
                timeMax=time_max,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            for event in events:
                summary = event.get('summary')
                
                # Extract event date
                start = event['start'].get('dateTime', event['start'].get('date'))
                date_str = start.split('T')[0]
                event_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                
                if event_date not in events_by_date:
                    events_by_date[event_date] = []
                events_by_date[event_date].append(f"{label}: {summary}")
        except Exception as e:
            print(f"Error accessing calendar '{label}': {e}")
            
    return events_by_date

def send_whatsapp_broadcast(text_content):
    """Fires message parameters directly into WAHA Docker core API engine."""
    payload = {
        "chatId": GROUP_ID,
        "text": text_content,
        "session": "Send-Reminders-to-Whatsapp"
    }
    try:
        response = requests.post(WAHA_URL, json=payload, headers=WAHA_HEADERS)
        if response.status_code in [200, 201]:
            print("🚀 Notification successfully broadcasted to WhatsApp!")
        else:
            print(f"❌ WAHA Container error: {response.text}")
    except Exception as e:
        print(f"❌ Failed to reach local WAHA container: {e}")

if __name__ == "__main__":
    now = datetime.datetime.now()
    today = now.date()
    current_hour = now.hour
    current_weekday = today.strftime("%A") # e.g. "Sunday"

    # --- ACTION 1: SUNDAY DIGEST ---
    if current_weekday == "Sunday" and current_hour < 12:
        print("Executing Sunday Weekly Overview Scan...")
        # Get date window from today (Sunday) to next Saturday
        end_of_week = today + datetime.timedelta(days=6)
        all_events = fetch_events_for_range(today, end_of_week)
        
        if all_events:
            msg_lines = ["🗓️ *Upcoming Events This Week:* \n"]
            # Sort chronologically by date
            for edate in sorted(all_events.keys()):
                readable_date = edate.strftime("%A, %b %d") # e.g., "Monday, Jun 22"
                for ev in all_events[edate]:
                    msg_lines.append(f"• *{readable_date}* -> {ev}")
            send_whatsapp_broadcast("\n".join(msg_lines))
        else:
            print("No upcoming events found for this week.")

    # --- ACTION 2: ON THE DAY REMINDERS (Runs at 07:00 AM) ---
    elif current_hour < 12:
        print("Executing 'On-the-Day' Morning Reminder Scan...")
        all_events = fetch_events_for_range(today, today)
        if today in all_events:
            msg = "🔔 *Family Reminders for TODAY:*\n\n" + "\n".join(all_events[today])
            send_whatsapp_broadcast(msg)
        else:
            print("No events found for today.")

    # --- ACTION 3: ONE DAY BEFORE REMINDERS (Runs at 20:00 PM) ---
    else:
        print("Executing 'Day-Before' Evening Reminder Scan...")
        tomorrow = today + datetime.timedelta(days=1)
        all_events = fetch_events_for_range(tomorrow, tomorrow)
        if tomorrow in all_events:
            # Replaced "Tomorrow Tomorrow" with standard format
            cleaned_events = [ev.replace(" Tomorrow", "") for ev in all_events[tomorrow]]
            msg = "🔔 *Family Reminders for Tomorrow:*\n\n" + "\n".join(cleaned_events)
            send_whatsapp_broadcast(msg)
        else:
            print("No events found for tomorrow.")

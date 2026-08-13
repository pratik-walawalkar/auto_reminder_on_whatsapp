import os
import sys
import json
import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Suppress google API logs from ruining our JSON stdout
import logging
logging.getLogger('googleapiclient.discovery_cache').setLevel(logging.ERROR)

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(ROOT_DIR)

TOKEN_FILE_PERSONAL = os.environ.get("TOKEN_FILE_PERSONAL", "token_personal.json")
MATRIX_FILE = "routing_matrix.json"

def get_events():
    if not os.path.exists(MATRIX_FILE) or not os.path.exists(TOKEN_FILE_PERSONAL):
        print(json.dumps({"error": "Missing matrix or token file"}))
        return

    try:
        creds = Credentials.from_authorized_user_file(TOKEN_FILE_PERSONAL)
        service = build('calendar', 'v3', credentials=creds, cache_discovery=False)
        
        with open(MATRIX_FILE, "r") as f:
            matrix = json.load(f)

        # Fetch from today minus 7 days, to 30 days in the future
        now = datetime.datetime.utcnow()
        time_min = (now - datetime.timedelta(days=7)).isoformat() + 'Z'
        time_max = (now + datetime.timedelta(days=45)).isoformat() + 'Z'

        all_events = []

        # 1. Fetch Family Events (Blue)
        for rule in matrix.get("family_rules", []):
            if not rule.get("calendar_id"): continue
            events_result = service.events().list(
                calendarId=rule["calendar_id"], timeMin=time_min, timeMax=time_max, 
                singleEvents=True, orderBy='startTime'
            ).execute()
            
            for event in events_result.get('items', []):
                start = event['start'].get('dateTime', event['start'].get('date')).split('T')[0]
                all_events.append({
                    "id": event['id'],
                    "title": event.get('summary', 'Family Event'),
                    "date": start,
                    "type": "family"
                })

        # 2. Fetch Individual Events (Green)
        for rule in matrix.get("individual_rules", []):
            if not rule.get("calendar_id"): continue
            events_result = service.events().list(
                calendarId=rule["calendar_id"], timeMin=time_min, timeMax=time_max, 
                singleEvents=True, orderBy='startTime'
            ).execute()
            
            for event in events_result.get('items', []):
                start = event['start'].get('dateTime', event['start'].get('date')).split('T')[0]
                summary = event.get('summary', 'Individual Event')
                icon = "🎂 " if "birthday" in summary.lower() else "📌 "
                
                all_events.append({
                    "id": event['id'],
                    "title": icon + summary,
                    "date": start,
                    "type": "individual"
                })

        # Output raw JSON to stdout for Next.js to parse
        print(json.dumps({"success": True, "events": all_events}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    get_events()
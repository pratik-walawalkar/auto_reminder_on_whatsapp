import os
import sys
import datetime

# --- SYSTEM SUB-FOLDER PATH RESOLVER ---
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

import whatsapp_utils

whatsapp_utils.load_env_file()

# Configure isolated pointers using your personal authentication credentials profiles
CLIENT_SECRET_FILE = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
TOKEN_FILE_PERSONAL = os.environ.get("TOKEN_FILE_PERSONAL", "token_personal.json")

# Explicit scope clearances required to create, update, and read your personal task checklists
SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/tasks'
]

def authenticate_google_tasks():
    """Establishes an authorized connection to the Google Tasks service endpoint via token_personal.json."""
    creds = None
    if os.path.exists(TOKEN_FILE_PERSONAL):
        # Ingest pre-existing authorization data tokens if available
        creds = Credentials.from_authorized_user_file(TOKEN_FILE_PERSONAL, SCOPES)
        
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("🔄 Refreshing expired Google Tasks authentication credentials...")
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds:
            print("🔑 Initiating local authentication loop handshake for Google Tasks access...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            
        # Lock configuration changes back down into your local storage file
        with open(TOKEN_FILE_PERSONAL, 'w') as token:
            token.write(creds.to_json())
            
    return build('tasks', 'v1', credentials=creds)

def get_or_create_automation_task_list(service):
    """Retrieves or builds a dedicated task list bucket named 'Utility Bills Payment' inside your Google profile."""
    try:
        tasklists_result = service.tasklists().list().execute()
        tasklists = tasklists_result.get('items', [])
        
        for list_item in tasklists:
            if list_item.get('title') == 'Utility Bills Payment':
                return list_item.get('id')
                
        # Build the custom list bucket if missing
        print("📅 Creating dedicated 'Utility Bills Payment' task list in your Google Workspace...")
        new_list = service.tasklists().insert(body={'title': 'Utility Bills Payment'}).execute()
        return new_list.get('id')
    except Exception as e:
        print(f"❌ Error indexing Google Task lists: {e}")
        return "@default" # Fallback to standard primary checklist account matrix

def create_bill_payment_task(provider_name, amount, due_date):
    """Creates a new task item and returns the structural google_task_id token payload."""
    try:
        service = authenticate_google_tasks()
        list_id = get_or_create_automation_task_list(service)
        
        # Structure the target ISO formatted date string string parameter boundary
        due_iso = datetime.datetime.combine(due_date, datetime.time.min).isoformat() + "Z"
        
        task_body = {
            'title': f"💳 Pay {provider_name} Bill - ₹{amount:.2f}",
            'notes': f"Automated Utility Reminder Ledger Tracking Hook.\nProvider: {provider_name}\nAmount Due: ₹{amount:.2f}\nDue Date: {due_date.strftime('%d-%b-%Y')}\n\nCheck this item off once paid to stop WhatsApp notification sequences.",
            'due': due_iso
        }
        
        task_entry = service.tasks().insert(tasklist=list_id, body=task_body).execute()
        print(f"✅ Success! Google Calendar Task created for {provider_name} (ID: {task_entry.get('id')})")
        return task_entry.get('id')
    except Exception as e:
        print(f"❌ Tasks Integration Error: Unable to provision tracking item for {provider_name}: {e}")
        return None

def check_task_completion_status(google_task_id):
    """Queries the Google Tasks API (including hidden completed archives) to verify completion status."""
    if not google_task_id:
        return False
        
    try:
        # 1. Initialize our authenticated Google Tasks client service wrapper
        service = authenticate_google_tasks()
        list_id = get_or_create_automation_task_list(service)
        
        # --- FIX: FORCE GOOGLE TO TRANSMIT HIDDEN AND COMPLETED TASK MARKERS ---
        # showCompleted and showHidden ensure checked items are included in the transfer matrix
        tasks_result = service.tasks().list(
            tasklist=list_id, 
            task=google_task_id,
            showCompleted=True, 
            showHidden=True
        ).execute()
        
        items = tasks_result.get('items', [])
        
        # 2. Search through the returned items array to locate our specific target task ID
        for task in items:
            if task.get('id') == google_task_id:
                # Google switches the 'status' property to 'completed' when checked in the Calendar UI
                if task.get('status') == 'completed':
                    print(f"☑️ Utility Audit Match: Task {google_task_id} confirmed as COMPLETED by user.")
                    return True
                return False
                
        print(f"⚪ Task {google_task_id} was found but is still marked as active (uncompleted).")
        return False
        
    except Exception as e:
        print(f"⚠️ Warning: Unable to poll execution metadata state for Task {google_task_id}: {e}")
        return False

def delete_bill_payment_task(google_task_id):
    """Safely purges an entry from your Google profile if an item is voided or overriden inside the dashboard."""
    if not google_task_id:
        return
    try:
        service = authenticate_google_tasks()
        list_id = get_or_create_automation_task_list(service)
        service.tasks().delete(tasklist=list_id, task=google_task_id).execute()
        print(f"🗑️ Purged sync entry reference Task ID: {google_task_id}")
    except Exception:
        pass

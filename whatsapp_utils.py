import os
import time
import random
import requests
import psycopg2
import json
from datetime import datetime

UTILS_DIR = os.path.dirname(os.path.abspath(__file__))

API_BASE_URL = None
INSTANCE_NAME = None
HEADERS = None

def load_env_file(dotenv_path=None):
    """Loads environment configuration properties directly into script runtime."""
    if dotenv_path is None:
        dotenv_path = os.path.join(UTILS_DIR, ".env")
    if os.path.exists(dotenv_path):
        with open(dotenv_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()

def get_db_connection():
    """Establishes an active transaction node pipeline to your isolated PostgreSQL engine."""
    return psycopg2.connect(
        host="localhost",
        port=5432,
        user="evolution_user",
        password="SecretLocalPassword12345",
        database="evolution_whatsapp"
    )

def initialize_whatsapp():
    """Validates connectivity to Evolution API and PostgreSQL database with robust error logging."""
    global API_BASE_URL, INSTANCE_NAME, HEADERS
    
    load_env_file()
    
    API_BASE_URL = os.environ.get("EVOLUTION_API_URL", "http://localhost:8080").rstrip("/")
    INSTANCE_NAME = os.environ.get("EVOLUTION_INSTANCE_NAME", "my_personal_session")
    api_key = os.environ.get("EVOLUTION_API_KEY", "MySecurePythonApiKey12345")
    
    HEADERS = {
        "apikey": api_key,
        "Content-Type": "application/json"
    }
    
    print(f"🤖 Initializing API pipeline connection to instance: {INSTANCE_NAME}...")
    
    # 1. Proactive Database Health Check
    try:
        db_conn = get_db_connection()
        db_conn.close()
        print("✅ PostgreSQL database connection verified.")
    except Exception as db_err:
        err_msg = f"Database Connection Failed: {db_err}"
        print(f"❌ {err_msg}")
        log_reminder_execution(
            target_id="SYSTEM_CORE",
            status="Failed",
            error_msg=err_msg,
            message_content="Critical: PostgreSQL database is unreachable during startup check.",
            pipeline_type="system"
        )
        return False

    # 2. Evolution API Connection Check with Retry Logic
    check_url = f"{API_BASE_URL}/instance/connectionState/{INSTANCE_NAME}"
    max_attempts = 3
    
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(check_url, headers=HEADERS, timeout=30)
            
            if response.status_code == 200 and response.json().get("instance", {}).get("state") == "open":
                print("✅ WhatsApp connection validated via Background Engine. Session active.")
                return True
            else:
                err_msg = f"Evolution API state invalid (HTTP {response.status_code}): {response.text}"
                print(f"❌ {err_msg}")
                if attempt == max_attempts:
                    log_reminder_execution(
                        target_id="SYSTEM_CORE",
                        status="Failed",
                        error_msg=err_msg,
                        message_content="Critical: Evolution API session state is not open.",
                        pipeline_type="system"
                    )
                    return False
                
        except requests.exceptions.Timeout:
            print(f"⏳ Server response delayed (Attempt {attempt}/{max_attempts}). Retrying in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            err_msg = f"Evolution API communication exception: {e}"
            print(f"❌ {err_msg}")
            if attempt == max_attempts:
                log_reminder_execution(
                    target_id="SYSTEM_CORE",
                    status="Failed",
                    error_msg=err_msg,
                    message_content="Critical: Evolution API gateway unreachable.",
                    pipeline_type="system"
                )
                return False
                
    return False

def send_whatsapp_message(chat_id, text_content, pipeline_type=""):
    """Delivers message text to individual chats or group endpoints via clean HTTP transactions."""
    try:
        target_id = str(chat_id).strip()
        send_url = f"{API_BASE_URL}/message/sendText/{INSTANCE_NAME}"
        sanitized_text = str(text_content).strip().replace("`", "")
        
        payload = {
            "number": target_id,
            "text": sanitized_text
        }
        
        print(f"🚀 Firing message payload node directly over to internal queue framework...")
        response = requests.post(send_url, json=payload, headers=HEADERS, timeout=45)

        if response.status_code in [200, 201]:
            print(f"✅ Success! Server transaction verified for target destination node: {target_id}")
            log_reminder_execution(target_id, "Success", "", text_content, pipeline_type=pipeline_type)
            return True
        else:
            try:
                res_json = response.json()
                error_msg = res_json.get("message") or res_json.get("response", {}).get("message") or response.text
                if isinstance(error_msg, list):
                    error_msg = ", ".join(str(m) for m in error_msg)
            except Exception:
                error_msg = response.text

            formatted_error = f"HTTP {response.status_code}: {error_msg}"
            print(f"⚠️ Warning: Network gateway returned failure state structural flag: {formatted_error}")
            log_reminder_execution(target_id, "Failed", formatted_error, text_content, pipeline_type=pipeline_type)
            return False

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Automation Error: Unable to deliver payload to element destination ID {chat_id}: {error_msg}")
        log_reminder_execution(str(chat_id), "Failed", error_msg, text_content, pipeline_type=pipeline_type)
        return False

def log_reminder_execution(target_id, status, error_msg="", message_content="", pipeline_type="family"):
    """Appends execution results, debug details, and pipeline type to the JSON log."""
    log_file = os.path.join(UTILS_DIR, "reminders_log.json")
    entry = {
        "timestamp": datetime.now().isoformat(),
        "target": target_id,
        "status": status,
        "details": error_msg,
        "content": message_content,
        "type": pipeline_type
    }
    
    logs = []
    if os.path.exists(log_file):
        with open(log_file, "r") as f:
            try:
                logs = json.load(f)
            except:
                pass
    
    logs.insert(0, entry)
    with open(log_file, "w") as f:
        json.dump(logs[:50], f, indent=2)

def check_schedule_recurrence(rule_section, force_run=False):
    """
    Evaluates if the current system time matches the recurrence rules defined 
    in the dashboard configuration, or overrides if force_run is True.
    """
    if force_run:
        print("⚡ [FORCE MODE] Bypassing schedule & recurrence validation checks.")
        return True

    now = datetime.now()
    current_hour = now.hour
    current_weekday = now.strftime("%A")
    
    recurrence = str(rule_section.get("recurrence", "daily")).lower()
    print(f"🕒 Evaluating rule schedule: [Recurrence: {recurrence}] at [Current Time: {now.strftime('%Y-%m-%d %H:%M:%S')} ({current_weekday})]")

    if recurrence == "weekly":
        target_day = rule_section.get("day", "Sunday")
        if current_weekday.lower() != target_day.lower():
            print(f"⏩ Skipping rule: Scheduled for weekly execution on {target_day}, today is {current_weekday}.")
            return False
            
    elif recurrence == "hourly":
        return True
        
    elif recurrence == "daily":
        scheduled_hour = rule_section.get("hour", None)
        if scheduled_hour is not None and current_hour != int(scheduled_hour):
            print(f"⏩ Skipping rule: Configured to run at hour {scheduled_hour}, current hour is {current_hour}.")
            return False

    return True
import os
import time
import random
import requests
import psycopg2


# Dynamically resolve root project paths regardless of execution sub-folder contexts
UTILS_DIR = os.path.dirname(os.path.abspath(__file__))

# We will populate these variables dynamically inside initialize_whatsapp()
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

# --- NEW: UNIFIED DATA ACCESS ENGINE LAYER ---
def get_db_connection():
    """Establishes an active transaction node pipeline to your isolated PostgreSQL engine."""
    return psycopg2.connect(
        host="localhost",
        port=5432,  # Uses your high-tier port bypass
        user="evolution_user",
        password="SecretLocalPassword123",
        database="evolution_whatsapp"
    )

def initialize_whatsapp():
    """Validates connectivity to the background Evolution API instance with automatic retry logic."""
    global API_BASE_URL, INSTANCE_NAME, HEADERS
    
    load_env_file()
    
    API_BASE_URL = os.environ.get("EVOLUTION_API_URL", "http://localhost:8080").rstrip("/")
    INSTANCE_NAME = os.environ.get("EVOLUTION_INSTANCE_NAME", "my_personal_session")
    api_key = os.environ.get("EVOLUTION_API_KEY", "MySecurePythonApiKey123")
    
    HEADERS = {
        "apikey": api_key,
        "Content-Type": "application/json"
    }
    
    print(f"🤖 Initializing API pipeline connection to instance: {INSTANCE_NAME}...")
    
    # --- RETRY LOOP WITH INCREASED TIMEOUT BUFFER ---
    check_url = f"{API_BASE_URL}/instance/connectionState/{INSTANCE_NAME}"
    max_attempts = 3
    
    for attempt in range(1, max_attempts + 1):
        try:
            # Increased timeout from 10 to 30 seconds to allow the database to respond
            response = requests.get(check_url, headers=HEADERS, timeout=30)
            
            if response.status_code == 200 and response.json().get("instance", {}).get("state") == "open":
                print("✅ WhatsApp connection validated via Background Engine. Session active.")
                return True
            else:
                print("❌ Critical Error: Session is not open! Please verify pairing code registration.")
                return False
                
        except requests.exceptions.Timeout:
            print(f"⏳ Server response delayed (Attempt {attempt}/{max_attempts}). Retrying in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            print(f"❌ Connection Pipeline Error: Unable to communicate with the local gateway server: {e}")
            return False
            
    print("❌ Critical Error: Connection timed out repeatedly after multiple attempts.")
    return False

def send_whatsapp_message(chat_id, text_content):
    """Delivers message text to individual chats or group endpoints via clean HTTP transactions."""
    try:
        target_id = str(chat_id).strip()
        
        # --- BEHAVIOR ENGINE: STEP 1: MARK TARGET CHAT MESSAGES AS READ ---
        # Simulates opening up the message view thread windows locally
        try:
            read_url = f"{API_BASE_URL}/chat/markRead/{INSTANCE_NAME}"
            # Group vs personal accounts both use the same read format
            requests.post(read_url, json={"read": True, "chatId": target_id}, headers=HEADERS, timeout=5)
        except Exception:
            pass # Avoid throwing exceptions if historical message clearing markers lag

        # --- BEHAVIOR ENGINE: STEP 2: HUMAN RESIDUAL DELAY PAUSE ---
        # Simulates real mouse/screen focusing latencies
        time.sleep(random.uniform(2.1, 4.8)) 

        # --- BEHAVIOR ENGINE: STEP 3: EMIT THE 'TYPING...' STATE BROADCAST ---
        # Sends a real presence event animation package over WhatsApp servers
        try:
            presence_url = f"{API_BASE_URL}/instance/chatPresence/{INSTANCE_NAME}?jid={target_id}"
            requests.post(presence_url, json={"presence": "composing"}, headers=HEADERS, timeout=5)
        except Exception:
            pass

        # --- BEHAVIOR ENGINE: STEP 4: TYPING SIMULATION TIMER ---
        # Dynamically matches typing speed footprint to structural size variation lengths
        typing_duration = random.uniform(3.5, 7.2)
        print(f"⏳ Simulating realistic typing profile animations for {typing_duration:.2f}s...")
        time.sleep(typing_duration)

        # --- TRANSIT ENGINE: STEP 5: DELIVER MESSAGE PACKET PAYLOAD ---
        send_url = f"{API_BASE_URL}/message/sendText/{INSTANCE_NAME}"

        # This strips out ` characters which break the container's JSON object serializer
        sanitized_text = str(text_content).strip().replace("`", "")
        
        # --- UPDATED PAYLOAD PROPERTIES TO MATCH V2 STRUCTURAL SCHEMAS ---
        payload = {
            "number": target_id,
            "text": sanitized_text, # Evolution V2 expects 'text' directly on the root level
            "options": {
                "delay": 0,  
                "presence": "composing"
            }
        }
        
        print(f"🚀 Firing message payload node directly over to internal queue framework...")
        response = requests.post(send_url, json=payload, headers=HEADERS, timeout=45)

        if response.status_code in [200, 201]:
            print(f"✅ Success! Server transaction verified for target destination node: {target_id}")
            return True
        else:
            print(f"⚠️ Warning: Network gateway returned failure state structural flag: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Automation Error: Unable to deliver payload to element destination ID {chat_id}: {e}")
        return False

# # whatsapp_utils.py
# import os
# import time
# import random
# import pyperclip

# # --- MS EDGE SELENIUM IMPORTS ---
# from selenium import webdriver
# from selenium.webdriver.edge.options import Options as EdgeOptions
# from selenium.webdriver.edge.service import Service as EdgeService
# from webdriver_manager.microsoft import EdgeChromiumDriverManager
# from selenium.webdriver.common.by import By
# from selenium.webdriver.common.keys import Keys
# from selenium.webdriver.support.ui import WebDriverWait
# from selenium.webdriver.support import expected_conditions as EC
# from selenium.webdriver.common.action_chains import ActionChains

# EDGE_PROFILE_PATH = os.path.abspath("./whatsapp_edge_session")
# driver = None

# def load_env_file(dotenv_path=".env"):
#     if os.path.exists(dotenv_path):
#         with open(dotenv_path) as f:
#             for line in f:
#                 line = line.strip()
#                 if line and not line.startswith("#") and "=" in line:
#                     key, value = line.split("=", 1)
#                     os.environ[key.strip()] = value.strip()

# def initialize_selenium_whatsapp():
#     """Starts automation framework using MS Edge tracking persistent session user files."""
#     global driver
#     print("🤖 Initializing Microsoft Edge engine with persistent user session...")
    
#     options = EdgeOptions()
#     options.add_argument(f"user-data-dir={EDGE_PROFILE_PATH}")
#     options.add_argument("profile-directory=Default")
#     options.add_argument("--disable-blink-features=AutomationControlled")
#     # --- FIX: ADD ANTI-CRASH OPTIMIZATION ARGS ---
#     options.add_argument("--no-sandbox")
#     options.add_argument("--disable-dev-shm-usage")
#     # This prevents open browser windows from conflicting with your profile folder lock
#     options.add_argument("--use-mock-keychain") 
#     # Run visibly at first to scan the QR code.
#     # options.add_argument("--headless=new") 

#     driver = webdriver.Edge(service=EdgeService(EdgeChromiumDriverManager().install()), options=options)
#     driver.get("https://web.whatsapp.com")
    
#     print("⏳ Waiting for WhatsApp Web interface initialization structure...")
#     try:
#         WebDriverWait(driver, 300).until(
#             EC.presence_of_element_located((By.XPATH, '//div[@id="pane-side"]'))
#         )
#         print("✅ WhatsApp connection validated via MS Edge. Session active.")
#         return driver
#     except Exception:
#         print("❌ Critical Error: Login timeout! Please ensure the QR code was successfully scanned.")
#         return False

# def send_whatsapp_via_selenium(driver_instance, chat_id, text_content):
#     try:
#         target_id = str(chat_id).strip()
        
#         # --- FIX 1: DIRECT ROUTING SYSTEM BEYOND BROKEN SEARCH BOXES ---
#         # Both modern LIDs and Groups use the native app code loader mapping directory
#         if "@g.us" in target_id:
#             group_id = target_id.replace("@g.us", "").strip()
#             target_url = f"https://web.whatsapp.com/accept?code={group_id}"
#             print(f"🔗 Directly navigating to Group/LID app panel target: {target_url}")
#             driver_instance.get(target_url)
            
#         # Standard international numbers use the send query target path
#         elif "@c.us" in target_id:
#             phone_number = target_id.replace("@c.us", "").strip()
#             target_url = f"https://web.whatsapp.com/send?phone={phone_number}"
#             print(f"🔗 Directly navigating to standard phone profile node: {target_url}")
#             driver_instance.get(target_url)
            
#         else:
#             # Fallback pathing rules configuration
#             target_url = f"https://web.whatsapp.com/send?phone={target_id}"
#             driver_instance.get(target_url)

#         # --- FIX 2: TARGET ONLY STRUCTURALLY SECURE ELEMENTS ---
#         print("⏳ Waiting for the native conversation input box container to render...")
#         chat_box_xpath = '//div[@data-testid="conversation-compose-box-input"]'
        
#         message_box = WebDriverWait(driver_instance, 45).until(
#             EC.presence_of_element_located((By.XPATH, chat_box_xpath))
#         )

#         # OPTIMIZATION: Human-like variable wait before clicking the box
#         time.sleep(random.uniform(2.1, 4.8)) 
#         message_box.click() 

#         # Execute clipboard paste transaction
#         pyperclip.copy(text_content)
        
#         # OPTIMIZATION: Brief pause before executing the paste command shortcut
#         time.sleep(random.uniform(1.0, 2.5)) 
        
#         actions = ActionChains(driver_instance)
#         actions.key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
        
#         # OPTIMIZATION: Simulate a human review pause before pressing ENTER to send
#         time.sleep(random.uniform(1.8, 3.9)) 
#         message_box.send_keys(Keys.ENTER)
        
#         print(f"🚀 Message triggered! Holding connection pipeline for server verification verification...")

#         # --- FIX: VERIFY ACTUAL TRANSIT AND PHONE DELIVERED STATUS ---
#         # The 'msg-time' or 'span[data-testid="msg-meta"]' elements hold the status icons (Clock vs Check)
#         # We look for the 'msg-time' icon indicating a clock/pending status
#         pending_clock_xpath = '//span[@data-testid="msg-time"]' 
        
#         # Give the browser up to 15 seconds to sync data with your phone over WebSockets
#         try:
#             # We wait until any newly spawned pending icons are completely cleared/absent
#             WebDriverWait(driver_instance, 60).until_not(
#                 EC.presence_of_element_located((By.XPATH, pending_clock_xpath))
#             )
#             print(f"✅ Success! Server checkmark sync confirmed for target: {target_id}")
#         except Exception:
#             print("⚠️ Warning: Synchronization timeout reached. Proceeding with a hard buffer rest.")
#             time.sleep(5) # Hard fallback resting buffer padding if network packets stall
            
#         return True
#     except Exception as e:
#         print(f"❌ Automation Error: Unable to deliver payload to element ID {chat_id}: {e}")
#         return False

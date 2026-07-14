import time
import requests

BASE_URL = "http://localhost:3005"

def setup_whatsapp():
    # 1. Start the Session Instance
    print("[1/3] Triggering 'default' WhatsApp session configuration...")
    try:
        start_resp = requests.post(
            f"{BASE_URL}/api/sessions/start",
            json={"name": "default"},
            headers={"Content-Type": "application/json"}
        )
        print(f"Server Response: {start_resp.status_code}")
    except Exception as e:
        print(f"Error starting session: {e}")
        return

    # Give the background engine 5 seconds to load up the headless browser
    print("Waiting for headless environment initialization...")
    time.sleep(5)

    # 2. Extract the Active Connection Parameters
    print("[2/3] Querying active terminal parameters...")
    try:
        status_resp = requests.get(f"{BASE_URL}/api/sessions")
        print(f"Active Session Data: {status_resp.json()}")
    except Exception as e:
        print(f"Error checking session metrics: {e}")

    # 3. Retrieve the QR code as a text link
    print("[3/3] Pulling device linkage parameters...")
    try:
        qr_resp = requests.get(
            f"{BASE_URL}/api/sessions/default/qr",
            headers={"accept": "application/json"}
        )
        qr_data = qr_resp.json()
        
        if "qr" in qr_data:
            print("\n" + "="*60)
            print("🚀 SUCCESS: SEED FOUND!")
            print("To log in, copy the raw code value string below, paste it into")
            print("any free online QR generator (like qr-code-generator.com), and scan it:")
            print("="*60)
            print(f"\n{qr_data['qr']}\n")
            print("="*60)
        else:
            print(f"Could not retrieve string seed. Raw payload: {qr_data}")
            
    except Exception as e:
        print(f"Failed to communicate with QR endpoints: {e}")

if __name__ == "__main__":
    setup_whatsapp()

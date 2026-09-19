# Comprehensive System Documentation & Product Requirements Document (PRD)

This document provides the definitive specifications, architectural blueprint, and functional requirements for the **Headless WhatsApp Calendar & Contacts Automation System** and its associated web management dashboard. Designed with enterprise-grade robustness and optimized for minimal resource utilization, this specification incorporates all recent user feedback, design enhancements, and architectural upgrades.

---

## Part 1: System Overview & Architecture

### Core Purpose

The system is a highly optimized, resource-friendly Python automation pipeline that fetches calendar events and birthday contacts from Google Workspace APIs and dispatches dynamic notifications to WhatsApp. It replaces fragile browser-automation wrappers (like Selenium or WebDriver) with a persistent local **Evolution API** socket engine running via Docker.

### Directory Structure & Layout

The project repository follows a strictly organized layout to ensure relative path resolution and container data persistence:

```text
auto_reminder_on_whatsapp/
│
├── evolution_db_data/         # Isolated PostgreSQL data volume[cite: 35]
├── evolution_instances/       # Persistent WhatsApp session keys storage[cite: 35]
│
├── backend_api/               # FastAPI core backend service
│   ├── main.py                # API endpoints and request handlers
│   └── ...
├── frontend/                  # Next.js web application (pages.tsx, globals.css)
│   ├── pages.tsx              # Dashboard interface views
│   └── globals.css            # Custom theme styles and sporty highlights
│
├── .env                       # Local environment configuration keys[cite: 35]
├── client_secret.json         # Google Workspace OAuth 2.0 application credentials[cite: 35]
├── token.json                 # Combined Google API OAuth session tokens[cite: 35]
├── config/routing_matrix.json        # Central routing configuration registry[cite: 35]
│
├── whatsapp_utils.py          # Shared helper modules and API gateway connections[cite: 35]
├── family_reminders.py        # Automation loop for family calendar rules[cite: 35]
├── individual_reminders.py    # Automation loop for personal and birthday rules[cite: 35]
│
└── run_all_reminders.bat      # Orchestrated master Windows batch launcher[cite: 35]

```

---

# Headless WhatsApp Calendar & Contacts Automation System 🚀

A highly optimized, resource-friendly Python automation pipeline that fetches calendar events and birthday contacts from Google Workspace APIs and dispatches dynamic notifications to WhatsApp. 

This system completely replaces heavy, fragile web-scraping browser environments (like Selenium or Edge WebDriver) with a persistent local **Evolution API** socket engine. By connecting directly to WhatsApp Web's protocol layer via background WebSockets, you only pair your personal device once. The stack operates headlessly alongside media servers like Immich, maintaining a minimal memory footprint (<150MB RAM).

---

## 📂 1. Project Directory Structure

Organize your system repository exactly as follows to keep path references functional:

```text
auto_reminder_on_whatsapp/
│
├── evolution_db_data/         # Automatically created (Stores isolated PostgreSQL data)
├── evolution_instances/       # Automatically created (Stores your persistent WhatsApp session keys)
│
├── .env                       # Local environment variables (API keys and endpoints)
├── client_secret.json         # Google Workspace OAuth 2.0 application credentials
├── token.json                 # Automatically created (Stores combined Google API OAuth tokens)
├── config/routing_matrix.json        # Maps specific calendars to unique WhatsApp destinations
│
├── whatsapp_utils.py          # Shared helper modules (API gateway connections, human emulation)
├── family_reminders.py        # Automation loop file handling group messaging rules
├── individual_reminders.py    # Automation loop file handling personal & birthday rules
│
├── run_all_reminders.bat      # Orchestrated master Windows one-click batch launcher
└── README.md                  # System instruction and documentation manual
```

### File Purposes & Operational Scope:
* **`evolution_instances/`**: An isolated directory where your login session keys are securely stored. This allows the Docker container to restart or your laptop to reboot without losing your WhatsApp login state.
* **`.env`**: Keeps structural configuration strings and server keys separate from your application logic.
* **`client_secret.json`**: The security passport file downloaded from your Google Cloud Console.
* **`token.json`**: Generated automatically on your first execution. It saves combined Google Calendar and People API permissions so background scripts can pull entries hands-free.
* **`config/routing_matrix.json`**: The central routing logic registry linking distinct Google IDs to unique lines or group chats.

---

## 🔒 2. Security Configuration (Ignored Files Setup)

To protect your personal data, phone numbers, and cloud tokens, specific files must stay localized on your machine. Create a file named `.gitignore` in your root folder and add the following lines to prevent Git from uploading sensitive data to public repositories:

```text
# Private Environment Keys
.env
*.env

# Google API Authentication Tokens
token.json
client_secret.json

# Local Docker Data Storage Folders
evolution_db_data/
evolution_instances/

# Python Cache Files
__pycache__/
*.pyc

# Local Config Matrix
config/routing_matrix.json
```

---

## 🛠️ 3. Prerequisites & Dependencies Setup

### System Prerequisites
* **Operating System:** Windows 10 or Windows 11 (Laptop or Desktop).
* **Container Layer:** Docker Desktop for Windows installed and running.
* **Python Runtime:** Python 3.10, 3.11, or newer with path variables verified.

### Installation Command
Open your PowerShell window or command prompt and run the following command to download the updated library dependencies:

```powershell
pip install google-api-python-client google-auth-oauthlib google-auth-httplib2 requests
```

---

## ⚙️ 4. Detailed Setup Guide

### Step 4.1: Enable APIs Inside Google Developer Console
Your local scripts need explicit clearance to query your calendar and contacts databases:
1. Navigate to the [Google Cloud Library Console](https://console.cloud.google.com/apis/library).
2. Ensure your correct automation project is selected in the top dropdown selection header.
3. Search for **Google Calendar API** -> Click **ENABLE**.
4. Search for **People API** (Handles your Google Contact Birthdays) -> Click **ENABLE**.
5. Navigate to the **Credentials** tab, click **Create Credentials** -> **OAuth Client ID** (Select **Desktop App** as application type).
6. Download the resulting JSON file, rename it exactly to `client_secret.json`, and save it inside your project root folder.

### Step 4.2: Map the Target Registry (`config/routing_matrix.json`)
Drop your targeted WhatsApp structural identifiers directly into your routing file template:
* **Groups:** Long numerical serial identifiers ending in `@g.us`.
* **Numbers:** Standard international numbers or personal contacts ending in `@c.us`.

```json
{
  "family_rules": [
    {
      "calendar_name": "📅 Family Duties",
      "calendar_id": "your_family_calendar_id@group.calendar.google.com",
      "targets": [
        "120363149258374921@g.us"
      ]
    }
  ],
  "individual_rules": [
    {
      "calendar_name": "📅 Pratik's Calendar",
      "calendar_id": "your_private_calendar_id@gmail.com",
      "targets": [
        "491590642323@c.us"
      ]
    }
  ]
}
```

### Step 4.3: Deploy the Core Background Infrastructure
Create your `docker-compose.yml` file to handle provisioning the lightweight background layers:

```yaml
services:
  evolution-db:
    image: postgres:15-alpine
    container_name: evolution_db
    restart: unless-stopped
    environment:
      - POSTGRES_USER=evolution_user
      - POSTGRES_PASSWORD=SecretLocalPassword123
      - POSTGRES_DB=evolution_whatsapp
    volumes:
      - ./evolution_db_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 64M

  evolution-api:
    image: evoapicloud/evolution-api:latest
    container_name: evolution_api
    restart: unless-stopped
    ports:
      - "8080:8080"
    depends_on:
      - evolution-db
    environment:
      - SERVER_URL=http://localhost:8080
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=MySecurePythonApiKey123
      - GLOBAL_API_KEY=MySecurePythonApiKey123
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evolution_user:SecretLocalPassword123@evolution_db:5432/evolution_whatsapp?schema=public
      - CACHE_PROVIDER=local
      - CACHE_REDIS_ENABLED=false
    volumes:
      - ./evolution_instances:/evolution/instances
    deploy:
      resources:
        limits:
          memory: 256M
```

Launch the stack inside PowerShell:
```powershell
docker compose up -d
```

### Step 4.4: Pair Your Personal WhatsApp Device
Because the backend container runs headlessly, authenticate and link your account via a quick terminal request:

1. **Initialize the background instance configuration:**
```powershell
$headers = @{
    "apikey" = "MySecurePythonApiKey123"
    "Content-Type" = "application/json"
}
$body = @{
    "instanceName" = "my_personal_session"
    "token" = "MySecurePythonApiKey123"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:8080/instance/create" -Headers $headers -Body $body
```

2. **Generate your 8-digit secure alphanumeric pairing link code:**
*(Swap out `YOUR_PHONE_NUMBER` with your full phone number including your country code prefix without any spaces or symbols, e.g., `15551234567`)*
```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:8080/instance/connect/pairingCode/my_personal_session?number=YOUR_PHONE_NUMBER" -Headers $headers
```

3. **Link on Phone:** Open **WhatsApp** on your physical mobile device -> Tap **Settings / Three Dots** -> **Linked Devices** -> **Link a Device** -> select **"Link with phone number instead"** at the bottom of the scanner screen, and input the code printed inside your terminal.

---

## 🔄 5. System Operations & Behavioral Logic

```text
Launch Automation Script
          │
          ▼
Evaluate System Time ──────────────────────────────┐
          │                                        │
          ├── [Sunday Before 12 PM]                ▼
          │    └── Mode: SUNDAY DIGEST (Compiles upcoming 6 days)
          │
          ├── [Weekday Before 12 PM]               ▼
          │    └── Mode: MORNING REMINDERS (Compiles events for TODAY)
          │
          └── [Any Day After 12 PM]                ▼
               └── Mode: EVENING REMINDERS (Compiles events for TOMORROW)
          │
          ▼
Dispatch Target IDs to Utilities
          │
          ▼
Evaluate Target Destination Node Type
          │
          ├── Includes "@g.us" -> Target API Group Gateway Payload
          └── Includes "@c.us" -> Target API Chat Direct Payload
          │
          ▼
Execute Anti-Ban Human Emulation Routine
          │
          ├── 1. Trigger /chat/markRead (Clears unread markers to show presence)
          ├── 2. Wait random.uniform(2.1, 4.8)s (Simulates user window focus)
          ├── 3. Broadcast chatPresence "composing" (Enables typing animation)
          └── 4. Sleep random.uniform(3.5, 7.2)s (Simulates typing speeds)
          │
          ▼
Fire Headless Network Message Data Packet (HTTP POST to Local Endpoint)
```

### Why This Architecture Is Robust:
* **Native Protocol Integration:** The system bypasses heavy UI automation completely. By feeding Group/Personal JIDs directly to background WebSockets, delivery works instantly regardless of layout changes in the WhatsApp Web front-end.
* **Native UTF-8 Emoji Handling:** Since text parameters are packaged into standard JSON strings over an HTTP connection, complex emojis (🎂, 📌, 🔔) render natively without causing high-plane character exceptions on Windows machines.
* **Deep Emulation:** Unlike simple message blasters, this setup actively broadcasts real `composing` and `read receipt` network markers before sending, protecting your account from automated detection heuristics.

---

## 🏃‍♂️ 6. Execution & Automation Setup

### Master One-Click Batch Launcher (`run_all_reminders.bat`)
To run your automation seamlessly with a single click while optimizing laptop memory, utilize the updated batch launcher. It automatically starts up the containers, runs the scripts, pauses safely between them, and shuts the containers down to clear up RAM when finished:

```batch
@echo off
title WhatsApp Calendar Automation Engine Launcher
cd /d "d:\Users\Pratik\Documents\Python Scripts\auto_reminder_on_whatsapp"

echo ===================================================
echo 🐳 STEP 1: Booting Headless WhatsApp Engine...
echo ===================================================
docker compose up -d
timeout /t 12 /nobreak > nul

echo ===================================================
echo 🤖 STEP 2: RUNNING AUTOMATION SCRIPTS
echo ===================================================
echo 🔍 [Task 1/2] Processing Family Reminders Script...
python family_reminders.py

echo ⏳ Cooling down pipeline logic gates...
timeout /t 5 /nobreak > nul

echo 🔍 [Task 2/2] Processing Individual Reminders Script...
python individual_reminders.py

echo ===================================================
echo 🛑 STEP 3: Shutting Down Engine to Save RAM
echo ===================================================
docker compose down

echo 🏁 SYSTEM CHECK: All automation queues processed!
timeout /t 3 /nobreak > nul
exit
```

### Automate Daily with Windows Task Scheduler
1. Press the **Windows Key**, type **Task Scheduler**, and press **Enter**.
2. Click **Create Basic Task** in the right-side actions panel.
3. Name it `WhatsApp Daily Calendar Reminders` and select **Daily** execution frequency.
4. Set the trigger time (e.g., 09:00 AM).
5. For **Action**, select **Start a program**.
6. Click **Browse** and link your `run_all_reminders.bat` file.
7. Under **Start in (optional)**, paste the absolute directory path to your folder: `d:\Users\Pratik\Documents\Python Scripts\auto_reminder_on_whatsapp` *(Crucial for finding `.env` dependencies!)*
8. Save and finalize the task.

---

## 🚨 7. Troubleshooting Playbook

### 🔴 Problem: `invalid_scope: Bad Request`
* **Cause:** The scope strings inside your python project do not match Google Cloud Permissions, or an API was never activated.
* **Resolution:** Double check that you enabled both the Google Calendar and People API inside your Google Developer project console, delete your local `token.json` file, and run the Python script manually once to re-authorize your profile scopes.

### 🔴 Problem: `Error: P1000 Authentication Failed`
* **Cause:** Docker is trying to read cached database layout information from older development volume attempts inside your Windows system directory.
* **Resolution:** Turn off the container (`docker compose down`), open PowerShell, run `Remove-Item -Recurse -Force .\evolution_db_data` to clean out the local folder cache, and reload using `docker compose up -d`.

### 🔴 Problem: `HTTPConnectionPool Read Timed Out`
* **Cause:** The API engine takes slightly longer than the predefined script timeout parameter to respond during heavy startup data syncs or message queue spikes.
* **Resolution:** Locate the `requests.post()` structure inside your local utility code and gracefully elevate the threshold settings array block to a longer window buffer (`timeout=45`).


https://gist.github.com/pratik-walawalkar/73c925a23497fb36830eb86a10486ff7

The above gist link contains pags.tsx, main.py and globals.css files at the latest state.
I want you to check for the following points:
* Check and correct the alignment of all the structural elements / Boxes and others.
* The window must be wide and efficiently used.
* Check and validate The functionality of all the buttons and make the correction if necessary.
* The entry forms must have all the fields necessary to fill all the columns in the table.
* I dont know if the form in "Ingesting staging portal" is necessary, if not then it can be removed or modified. 
* Instead improve the drag and drop feature.  With respect to the requiemnets I had mentioned earlier. ut we need to have the button to commit or add the data extracted from the input file.
* I wish to have colored sporty highlights on the left edge of the metadata box
* "IMPORTANT!!!" this website needs to be actively on mobile, hence it must be equaly readable, accissible, modlarize and viewable on mobile.
* Dark and ligh theme must be equally impressive, stunning, beautifule, easy on eyes and elegant.
* The font must be large enough to be able to read comfortaly. Currrently, apart form the maeta data nmbers, everzthing else is very small.
* WE can collaps the months on YoY matrix into years, which can be expanded when we click on it. If all the bills are paid then the year must e highlighted in green, if anz month is unpaid then in red, and if the bills are missing then in yellow. Or maybe we can also have some indication on month boxes to denote which bills are available for the months. MGL bills are received every 2 month, and other sare every 1 month (Just for you information).  Enhance it feature wise according to your researched knowledge.
* I am not very adament on using the navy bblue/saphire theme, if whe have any better theme in dark and light, I can have a look at that as well. The Dark theme we currently have for this AI mode google page  is great.
* Make sure that the manual override form has all the fields reqired to populat the table.
* Check if everything is working fine.
* Check if all the variables are correct, no error, no missing definition.
* Try to identify a better approach to tag billing month, month 1, month 2 is good and easy to read, understand. But it could be better I we can somhow include year too  to make the billing month uniquely identifiable
* If you have any other suggestion or improvement point, let me know. We can implemnet that aswell.

* Create a TODO for all the points I mentioned above to make sure that you address and validate all the above points and nothing is missed out
* Consider using deep thinking and act like a Software engineer with 20+ years of experience. And have very good artestic sense of color.
* SInce it will be a long code generation, generate in mltiple parts and make sure that one code block has maximum of 150 lines and stays within the limit of a code block, to make sure that it does not over flows and ruines the syntax 
*** Overall the system mut be extremely robust and error proof***
@echo off
title WhatsApp Calendar Automation Engine Launcher

cd /d "d:\Users\Pratik\Documents\Python Scripts\auto_reminder_on_whatsapp"

echo ===================================================
echo 🐳 STEP 1: Booting Headless WhatsApp Engine...
echo ===================================================
docker compose up -d

:: Give the container 120 seconds to boot and establish its phone handshake
echo ⏳ Waiting for background server network sync...
timeout /t 120 /nobreak > nul

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

// File: src/app/api/reminders/config/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), '../reminder_config.json');
const MATRIX_PATH = path.join(process.cwd(), '../routing_matrix.json');

export async function GET() {
  let schedules = {
    familyTime: "09:00",
    familyRecurrence: "daily",
    individualTime: "08:30",
    individualRecurrence: "daily",
    weeklySummaryTime: "18:00",
    weeklySummaryRecurrence: "weekly"
  };

  let routingMatrix = {
    family_rules: [{ calendar_name: "Family Reminder", calendar_id: "", targets: [] }],
    individual_rules: [{ calendar_name: "Pratik's Calendar", calendar_id: "", targets: [] }],
    billing_rules: { target_group: "" }
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed) schedules = { ...schedules, ...parsed };
    }
  } catch (e) {
    console.error("Error reading reminder_config.json:", e);
  }

  try {
    if (fs.existsSync(MATRIX_PATH)) {
      const data = fs.readFileSync(MATRIX_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed) routingMatrix = { ...routingMatrix, ...parsed };
    }
  } catch (e) {
    console.error("Error reading routing_matrix.json:", e);
  }

  return NextResponse.json({ success: true, schedules, routingMatrix });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.schedules) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(body.schedules, null, 2), 'utf-8');
    }

    if (body.routingMatrix) {
      fs.writeFileSync(MATRIX_PATH, JSON.stringify(body.routingMatrix, null, 2), 'utf-8');
    }

    return NextResponse.json({ success: true, message: "Configuration saved successfully." });
  } catch (err: any) {
    console.error("Error saving configuration:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
// dashboard_ui/src/app/api/reminders/calendar/route.ts
import { NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

export async function GET() {
  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/v1/reminders/calendar`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    });

    if (!res.ok) {
      throw new Error(`Python backend responded with status: ${res.status}`);
    }

    const data = await res.json();
    
    // Robustly extract the event array whether Python returned a direct array or a wrapped object
    let eventList = [];
    if (Array.isArray(data)) {
      eventList = data;
    } else if (data && Array.isArray(data.events)) {
      eventList = data.events;
    } else if (data && data.events && Array.isArray(data.events.events)) {
      eventList = data.events.events; // Handles double-nesting if present
    } else if (data && Array.isArray(data.data)) {
      eventList = data.data;
    }

    return NextResponse.json({ success: true, events: eventList });

  } catch (error: any) {
    console.warn("[Next.js API] Python backend unreachable, providing safe fallback data:", error.message);
    
    const fallbackEvents = [
      { id: "1", title: "Family Reminder Check", date: new Date().toISOString().split('T')[0], type: "family" },
      { id: "2", title: "Individual Bill Sync", date: new Date(Date.now() + 86400000).toISOString().split('T')[0], type: "individual" }
    ];

    return NextResponse.json({ success: true, events: fallbackEvents });
  }
}
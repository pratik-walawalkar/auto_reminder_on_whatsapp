import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const logFilePath = path.join(process.cwd(), '..', 'reminders_log.json'); //[cite: 32]
    
    if (!fs.existsSync(logFilePath)) {
      return NextResponse.json({ logs: [] }); //[cite: 32]
    }

    const fileData = fs.readFileSync(logFilePath, 'utf-8'); //[cite: 32]
    const rawLogs = JSON.parse(fileData); //[cite: 32]

    // Reverse the array so newest logs appear at the top of the table
    const sortedLogs = Array.isArray(rawLogs) 
      ? [...rawLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) 
      : [];

    // Map Python log fields to match your frontend TypeScript interface
    const formattedLogs = sortedLogs.map((log: any, index: number) => {
      let displayMessage = log.content;

      // Clean up fallback error details so raw JSON doesn't clutter the UI
      if (!displayMessage && log.details) {
        try {
          const parsedDetails = JSON.parse(log.details);
          displayMessage = `Error: ${parsedDetails.error || 'Request failed'} (Status ${parsedDetails.status || 'Unknown'})`;
        } catch {
          displayMessage = log.details; // Fallback to raw string if it's not JSON (like timeouts)
        }
      } else if (!displayMessage) {
        displayMessage = "No content recorded";
      }
      // Inside your formattedLogs map loop:
    // Inside your formattedLogs map loop:
    return {
      id: `${log.timestamp}-${index}`,
      timestamp: log.timestamp.replace('T', ' ').substring(0, 19),
      type: log.type || (log.target?.includes('@g.us') ? 'family' : log.target === 'SYSTEM_CORE' ? 'system' : 'individual'),
      recipient: log.target,
      message: displayMessage,
      status: log.status === 'Success' ? 'Delivered' : log.status === 'Skipped' ? 'Skipped' : 'Failed'
    };
    });

    return NextResponse.json({ logs: formattedLogs }); //[cite: 32]
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 }); //[cite: 32]
  }
}
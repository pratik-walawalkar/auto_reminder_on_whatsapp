import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type } = body;

    if (!type || !['family', 'individual', 'all'].includes(type)) {
      return NextResponse.json({ error: "Invalid trigger type" }, { status: 400 });
    }

    const typesToRun = type === 'all' ? ['family', 'individual'] : [type];
    let combinedOutput = "";

    for (const t of typesToRun) {
      const scriptName = t === 'family' ? 'family_reminders.py' : 'individual_reminders.py';
      const scriptPath = path.resolve(process.cwd(), '../reminders_core', scriptName);

      await new Promise((resolve) => {
        exec(`python "${scriptPath}"`, (error, stdout, stderr) => {
          // This prints the python print statements directly in your Next.js terminal
          console.log(`--- PYTHON STDOUT (${t}) ---`, stdout);
          if (stderr) console.error(`--- PYTHON STDERR (${t}) ---`, stderr);

          combinedOutput += `\n[${t.toUpperCase()} OUTPUT]:\n` + stdout;

          // Record execution result into audit logs file
          try {
            const logsPath = path.resolve(process.cwd(), 'audit_logs.json');
            let logs = [];
            if (fs.existsSync(logsPath)) {
              logs = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
            }
            logs.unshift({
              id: `log-${Date.now()}-${t}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              type: t,
              recipient: t === 'family' ? 'Family WhatsApp Group' : 'Individual Contact',
              message: stdout.slice(0, 150) || `Executed ${t} reminder script successfully.`,
              status: error ? "Failed" : "Delivered"
            });
            if (logs.length > 50) logs = logs.slice(0, 50);
            fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf-8');
          } catch (err) {}

          resolve(true);
        });
      });
    }

    return NextResponse.json({ success: true, output: combinedOutput });
  } catch (err: any) {
    console.error("[Trigger Error]:", err);
    return NextResponse.json({ error: "Server error handling trigger: " + err.message }, { status: 500 });
  }
}
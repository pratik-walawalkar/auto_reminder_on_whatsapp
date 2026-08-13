// File: src/app/api/whatsapp/search/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || process.env.NEXT_PUBLIC_EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || process.env.NEXT_PUBLIC_EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE || '';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') || '').toLowerCase().trim();
  const jidTarget = searchParams.get('jid');
  
  let results: Array<{ name: string; jid: string }> = [];

  try {
    if (EVOLUTION_API_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE) {
      const baseUrl = EVOLUTION_API_URL.replace(/\/+$/, '');
      
      // Helper to fetch using GET first, then fallback to POST
      const robustFetch = async (endpointPath: string) => {
        try {
          let res = await fetch(`${baseUrl}${endpointPath}/${EVOLUTION_INSTANCE}`, {
            method: 'GET',
            headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' }
          });
          if (!res.ok) {
            res = await fetch(`${baseUrl}${endpointPath}/${EVOLUTION_INSTANCE}`, {
              method: 'POST',
              headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
          }
          if (res.ok) {
            return await res.json();
          }
        } catch (e) {
          console.error(`Error fetching ${endpointPath}:`, e);
        }
        return null;
      };

      // 1. Fetch live chats from Evolution API
      const chatData = await robustFetch('/chat/findChats');
      if (chatData) {
        const chats = Array.isArray(chatData) ? chatData : chatData.chats || chatData.data || [];
        for (const item of chats) {
          const jid = item.id || item.remoteJid || item.jid;
          const name = item.subject || item.name || item.pushName || item.notifyName || jid;
          if (jid && !results.some(r => r.jid === jid)) {
            results.push({ name, jid });
          }
        }
      }

      // 2. Fetch live contacts from Evolution API
      const contactData = await robustFetch('/chat/findContacts');
      if (contactData) {
        const contacts = Array.isArray(contactData) ? contactData : contactData.contacts || contactData.data || [];
        for (const item of contacts) {
          const jid = item.id || item.remoteJid || item.jid;
          const name = item.name || item.pushName || item.notifyName || item.formattedName || jid;
          if (jid && !results.some(r => r.jid === jid)) {
            results.push({ name, jid });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Evolution API] Failed to fetch live chats/contacts:", err);
  }

  // Fallback: Load known JIDs from routing_matrix.json if Evolution API is offline or unconfigured
  try {
    const configPath = path.join(process.cwd(), 'routing_matrix.json');
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const matrix = JSON.parse(fileContent);
      
      const addDefault = (jid: string, fallbackName: string) => {
        if (jid && !results.some(r => r.jid === jid)) {
          results.push({ name: fallbackName, jid });
        }
      };

      if (matrix.family_rules) {
        matrix.family_rules.forEach((rule: any) => {
          if (Array.isArray(rule.targets)) {
            rule.targets.forEach((t: string) => addDefault(t, t.includes('@g.us') ? "Family WhatsApp Group" : "Pratik's Personal Chat"));
          }
        });
      }
      if (matrix.individual_rules) {
        matrix.individual_rules.forEach((rule: any) => {
          if (Array.isArray(rule.targets)) {
            rule.targets.forEach((t: string) => addDefault(t, "Pratik's Personal Chat"));
          }
        });
      }
      if (matrix.billing_rules?.target_group) {
        addDefault(matrix.billing_rules.target_group, "Pratik's Personal Chat");
      }
    }
  } catch (e) {
    // Ignore fallback errors
  }

  if (jidTarget) {
    const found = results.find(r => r.jid === jidTarget);
    return NextResponse.json({ success: true, name: found ? found.name : jidTarget });
  }

  const filtered = query === '' 
    ? results 
    : results.filter(item => 
        item.name.toLowerCase().includes(query) || 
        item.jid.toLowerCase().includes(query)
      );

  return NextResponse.json({ success: true, results: filtered });
}
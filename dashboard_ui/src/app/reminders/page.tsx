"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "../theme-provider";
import HeaderNav from "../components/HeaderNav";
import { translations } from "../translations";
import { 
  Users, User, PlayCircle, AlertCircle, CheckCircle2, 
  Clock, ShieldCheck, FileText, Settings, RefreshCw 
} from "lucide-react";

const CalendarView = dynamic(() => import("./CalendarView"), { 
  ssr: false,
  loading: () => <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 animate-pulse flex items-center justify-center text-slate-400">Loading Calendar...</div>
});

// Dynamic Multi-Select JID Component fetching live WhatsApp names from Evolution API
function MultiJidSelect({ selectedJids = [], onChange }: { selectedJids: string[], onChange: (jids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ name: string, jid: string }>>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch all chats/contacts on mount to build the live JID-to-Name dictionary
  useEffect(() => {
    const fetchAllContacts = async () => {
      try {
        const res = await fetch(`/api/whatsapp/search?q=`);
        const data = await res.json();
        if (data.success && data.results) {
          const map: Record<string, string> = {};
          data.results.forEach((r: { name: string, jid: string }) => {
            map[r.jid] = r.name;
          });
          setNameMap(map);
        }
      } catch (err) {
        console.error("Failed to load WhatsApp name mappings:", err);
      }
    };
    fetchAllContacts();
  }, []);

  // Fetch filtered suggestions dynamically from WhatsApp chats
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const res = await fetch(`/api/whatsapp/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success) {
          setSuggestions(data.results);
          const map = { ...nameMap };
          data.results.forEach((r: { name: string, jid: string }) => {
            map[r.jid] = r.name;
          });
          setNameMap(map);
        }
      } catch (err) {
        console.error("Failed to fetch WhatsApp suggestions:", err);
      }
    };

    const timer = setTimeout(fetchSuggestions, 150);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addJid = (jid: string) => {
    if (!selectedJids.includes(jid)) {
      onChange([...selectedJids, jid]);
    }
    setQuery('');
    setIsOpen(false);
  };

  const removeJid = (jidToRemove: string) => {
    onChange(selectedJids.filter(jid => jid !== jidToRemove));
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div 
        className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl cursor-text focus-within:border-blue-500"
        onClick={() => setIsOpen(true)}
      >
        {selectedJids.map((jid) => {
          const displayName = nameMap[jid] || jid;
          return (
            <span key={jid} className="inline-flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded-lg text-xs font-medium" title={`JID: ${jid}`}>
              <span>{displayName}</span>
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); removeJid(jid); }} 
                className="hover:text-white font-bold ml-0.5"
              >
                &times;
              </button>
            </span>
          );
        })}
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedJids.length === 0 ? "Search WhatsApp chat or group name..." : "Add another..."}
          className="bg-transparent flex-1 outline-none text-sm text-slate-800 dark:text-slate-200 min-w-[160px] px-1 py-1"
        />
      </div>

      {isOpen && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          {suggestions.length === 0 ? (
            <li className="px-3 py-3 text-xs text-slate-400 text-center italic">No matching WhatsApp chats or contacts found</li>
          ) : (
            suggestions.map((item) => (
              <li
                key={item.jid}
                onClick={() => addJid(item.jid)}
                className="px-3 py-2.5 hover:bg-slate-700/85 cursor-pointer text-sm flex justify-between items-center transition-colors border-b border-slate-700/40 last:border-none text-slate-200"
              >
                <span className="font-semibold">{item.name}</span>
                <span className="text-xs text-slate-400 font-mono">{item.jid}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function RemindersPage() {
  const { theme, setTheme } = useTheme();
  const [lang, setLang] = useState<"en" | "mr">("en");
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [engineStatus, setEngineStatus] = useState<string | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState<string | null>(null);

  const [schedules, setSchedules] = useState({
    familyTime: "09:00",
    familyRecurrence: "daily",
    individualTime: "08:30",
    individualRecurrence: "daily",
    weeklySummaryTime: "18:00",
    weeklySummaryRecurrence: "weekly"
  });
  const [savingSchedules, setSavingSchedules] = useState(false);

  const [routingMatrix, setRoutingMatrix] = useState<any>({
    family_rules: [{ calendar_name: "", calendar_id: "", targets: [""] }],
    individual_rules: [{ calendar_name: "", calendar_id: "", targets: [""] }],
    billing_rules: { target_group: "" }
  });
  const [savingRouting, setSavingRouting] = useState(false);

  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; timestamp: string; recipient: string; message: string; type: string; status: string }>>([]);

  const t = translations[lang] || translations["en"];
  const isDark = theme === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchConfigurations();
    fetchAuditLogs();
  }, []);

  const fetchConfigurations = async () => {
    try {
      const res = await fetch('/api/reminders/config');
      if (res.ok) {
        const data = await res.json();
        if (data.schedules) setSchedules(data.schedules);
        if (data.routingMatrix) setRoutingMatrix(data.routingMatrix);
      }
    } catch (err) {
      console.error("Failed to load configurations", err);
      setEngineError("Failed to load routing matrix config.");
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/reminders/logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs) setAuditLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to load audit logs", err);
    }
  };

  const handleSaveSchedules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedules(true);
    try {
      const res = await fetch('/api/reminders/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules })
      });
      if (!res.ok) throw new Error("Failed to save schedule settings.");
      setEngineStatus("Reminder schedules updated successfully.");
    } catch (err: any) {
      setEngineError(err.message);
    } finally {
      setSavingSchedules(false);
    }
  };

  const handleSaveRouting = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRouting(true);
    setEngineError(null);
    try {
      const res = await fetch('/api/reminders/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routingMatrix })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync routing_matrix.json.");
      setEngineStatus("routing_matrix.json successfully updated and synced.");
    } catch (err: any) {
      setEngineError(err.message);
    } finally {
      setSavingRouting(false);
    }
  };

  const handleTrigger = async (type: 'family' | 'individual' | 'all') => {
    setIsTriggering(type);
    setEngineError(null);
    setEngineStatus(null);
    
    try {
      const response = await fetch('/api/reminders/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to execute engine pipeline.");
      
      setEngineStatus(`Successfully triggered ${type} pipeline. Messages dispatched.`);
      fetchAuditLogs();
    } catch (err: any) {
      setEngineError(err.message);
    } finally {
      setIsTriggering(null);
    }
  };

  if (!mounted) return null;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? "bg-[#0b0f19] text-slate-200" : "bg-slate-50 text-slate-800"}`}>
      
      <HeaderNav 
        theme={theme} 
        setTheme={setTheme} 
        lang={lang} 
        setLang={setLang} 
        isOffline={isOffline} 
        loading={loading} 
        onSync={async () => { fetchAuditLogs(); fetchConfigurations(); }} 
        t={t} 
      />

      <main className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-black mb-1">Reminders Hub</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage automated schedules, routing matrix configs, calendar sync status, and dispatch pipelines.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleTrigger('all')}
              disabled={isTriggering !== null}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <PlayCircle size={16} />
              {isTriggering === 'all' ? "Running All..." : "Run All Pipelines"}
            </button>
          </div>
        </div>

        {/* Status Banners */}
        {engineError && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{engineError}</span>
          </div>
        )}
        
        {engineStatus && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{engineStatus}</span>
          </div>
        )}

        {/* Top Grid: Manual Triggers & Calendar Module */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className={`p-6 rounded-2xl border shadow-md flex flex-col justify-between space-y-6 ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl">
                  <Settings className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold">Manual Triggers</h2>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Force execution of WhatsApp automation scripts outside of normal scheduled triggers.
              </p>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => handleTrigger('family')}
                disabled={isTriggering !== null}
                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                <Users className="w-4 h-4" />
                <span>{isTriggering === 'family' ? "Executing..." : "Trigger Family Reminders"}</span>
              </button>

              <button
                onClick={() => handleTrigger('individual')}
                disabled={isTriggering !== null}
                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                <User className="w-4 h-4" />
                <span>{isTriggering === 'individual' ? "Executing..." : "Trigger Individual Reminders"}</span>
              </button>
            </div>
          </div>

          <div className={`lg:col-span-2 rounded-2xl border shadow-md overflow-hidden ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className="p-5">
               <CalendarView />
            </div>
          </div>
        </div>

        {/* Configuration Grid: Google Calendar Style Schedules & Routing Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Google Calendar Style Schedule Config */}
          <div className={`p-6 rounded-2xl border shadow-md ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold">Reminder Schedule & Recurrence</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Set reminder times and repetition cycles just like Google Calendar events.
            </p>

            <form onSubmit={handleSaveSchedules} className="space-y-5">
              {/* Family Reminders */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                <label className="block text-xs font-bold uppercase text-slate-500">Family Reminders</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1">Time</span>
                    <input 
                      type="time" 
                      value={schedules.familyTime}
                      onChange={(e) => setSchedules({...schedules, familyTime: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1">Repetition</span>
                    <select
                      value={schedules.familyRecurrence}
                      onChange={(e) => setSchedules({...schedules, familyRecurrence: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="none">Does not repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="annually">Annually</option>
                      <option value="weekday">Every weekday (Monday to Friday)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Individual Alerts */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                <label className="block text-xs font-bold uppercase text-slate-500">Individual Alerts</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1">Time</span>
                    <input 
                      type="time" 
                      value={schedules.individualTime}
                      onChange={(e) => setSchedules({...schedules, individualTime: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1">Repetition</span>
                    <select
                      value={schedules.individualRecurrence}
                      onChange={(e) => setSchedules({...schedules, individualRecurrence: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="none">Does not repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="annually">Annually</option>
                      <option value="weekday">Every weekday (Monday to Friday)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Weekly Summary */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                <label className="block text-xs font-bold uppercase text-slate-500">Weekly Summary Reminder</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1">Time</span>
                    <input 
                      type="time" 
                      value={schedules.weeklySummaryTime}
                      onChange={(e) => setSchedules({...schedules, weeklySummaryTime: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1">Repetition</span>
                    <select
                      value={schedules.weeklySummaryRecurrence}
                      onChange={(e) => setSchedules({...schedules, weeklySummaryRecurrence: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="weekly">Every Sunday (Weekly)</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={savingSchedules}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {savingSchedules ? "Saving..." : "Save Schedule & Recurrence"}
              </button>
            </form>
          </div>

          {/* Routing Matrix Config */}
          <div className={`p-6 rounded-2xl border shadow-md ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-purple-500/10 text-purple-500 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold">Routing Matrix (routing_matrix.json)</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Synced directly with your local routing matrix mapping calendars to WhatsApp groups and contacts.
            </p>

            <form onSubmit={handleSaveRouting} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Family Calendar Name & Target Group JIDs</label>
                <input 
                  type="text" 
                  value={routingMatrix.family_rules?.[0]?.calendar_name || ""}
                  onChange={(e) => {
                    const updated = JSON.parse(JSON.stringify(routingMatrix));
                    if (!updated.family_rules || updated.family_rules.length === 0) updated.family_rules = [{}];
                    updated.family_rules[0].calendar_name = e.target.value;
                    setRoutingMatrix(updated);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm mb-2"
                  placeholder="Calendar Name"
                />
                <MultiJidSelect
                  selectedJids={routingMatrix.family_rules?.[0]?.targets || []}
                  onChange={(newTargets) => {
                    const updated = JSON.parse(JSON.stringify(routingMatrix));
                    if (!updated.family_rules || updated.family_rules.length === 0) updated.family_rules = [{}];
                    updated.family_rules[0].targets = newTargets;
                    setRoutingMatrix(updated);
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Individual Calendar Name & Target Contact JIDs</label>
                <input 
                  type="text" 
                  value={routingMatrix.individual_rules?.[0]?.calendar_name || ""}
                  onChange={(e) => {
                    const updated = JSON.parse(JSON.stringify(routingMatrix));
                    if (!updated.individual_rules || updated.individual_rules.length === 0) updated.individual_rules = [{}];
                    updated.individual_rules[0].calendar_name = e.target.value;
                    setRoutingMatrix(updated);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm mb-2"
                  placeholder="Calendar Name"
                />
                <MultiJidSelect
                  selectedJids={routingMatrix.individual_rules?.[0]?.targets || []}
                  onChange={(newTargets) => {
                    const updated = JSON.parse(JSON.stringify(routingMatrix));
                    if (!updated.individual_rules || updated.individual_rules.length === 0) updated.individual_rules = [{}];
                    updated.individual_rules[0].targets = newTargets;
                    setRoutingMatrix(updated);
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Billing Target Group JID</label>
                <MultiJidSelect
                  selectedJids={routingMatrix.billing_rules?.target_group ? [routingMatrix.billing_rules.target_group] : []}
                  onChange={(newTargets) => {
                    const updated = JSON.parse(JSON.stringify(routingMatrix));
                    if (!updated.billing_rules) updated.billing_rules = {};
                    updated.billing_rules.target_group = newTargets[0] || "";
                    setRoutingMatrix(updated);
                  }}
                />
              </div>

              <button 
                type="submit" 
                disabled={savingRouting}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-colors mt-2"
              >
                {savingRouting ? "Syncing..." : "Save & Sync routing_matrix.json"}
              </button>
            </form>
          </div>

        </div>

        {/* Message Dispatch Audit Log with Full Multi-line Visibility */}
        <div className={`p-6 rounded-2xl border shadow-md ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-cyan-500/10 text-cyan-500 rounded-xl">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold">Message Dispatch Audit Log</h2>
            </div>
            <button 
              onClick={fetchAuditLogs}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Refresh Logs"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Real-time audit history showing exact messages sent to specific groups and contacts.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-400 font-semibold">
                  <th className="pb-3 w-36">Timestamp</th>
                  <th className="pb-3 w-32">Pipeline Type</th>
                  <th className="pb-3 w-44">Recipient / Group</th>
                  <th className="pb-3">Dispatched Message Content</th>
                  <th className="pb-3 text-right w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 italic">No message dispatches recorded yet.</td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 align-top">
                      <td className="py-4 font-mono text-xs text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                      <td className="py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${log.type === 'family' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                          {log.type}
                        </span>
                      </td>
                      <td className="py-4 font-medium">{log.recipient}</td>
                      <td className="py-4">
                        <div className={`p-3 border rounded-xl whitespace-pre-wrap break-words font-mono text-xs max-h-48 overflow-y-auto ${
                          log.status === 'Failed' 
                            ? 'bg-rose-950/40 border-rose-900/60 text-rose-300' 
                            : 'bg-slate-900/80 border-slate-800 text-slate-300'
                        }`}>
                          {log.message}
                        </div>
                      </td>
                      <td className="py-4 text-right whitespace-nowrap">
                        <span className={`font-semibold text-xs inline-flex items-center justify-end gap-1 px-2.5 py-1 rounded-full border ${
                          log.status === 'Delivered' 
                            ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' 
                            : log.status === 'Skipped'
                            ? 'text-amber-400 bg-amber-950/40 border-amber-800/50'
                            : 'text-rose-400 bg-rose-950/40 border-rose-800/50' // 🔴 Red badge for Failed status
                        }`}>
                          {log.status === 'Delivered' && <CheckCircle2 size={14} />}
                          {log.status === 'Skipped' && <Clock size={14} />}
                          {log.status === 'Failed' && <AlertCircle size={14} />}
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
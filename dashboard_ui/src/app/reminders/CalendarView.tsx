"use client";

import React, { useEffect, useState } from 'react';
import { RefreshCw, Calendar as CalendarIcon, CheckCircle, AlertTriangle, WifiOff } from 'lucide-react';

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: 'family' | 'individual';
};

export default function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'connected' | 'error' | 'syncing'>('connected');

  const CACHE_KEY = "dashboard_calendar_events";
  const CACHE_DATE_KEY = "dashboard_calendar_sync_date";

  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchEvents = async (forceSync = false) => {
    const today = getLocalDateString();
    
    if (!forceSync) {
      const cachedDate = window.localStorage.getItem(CACHE_DATE_KEY);
      const cachedEvents = window.localStorage.getItem(CACHE_KEY);
      
      if (cachedDate === today && cachedEvents) {
        try {
          setEvents(JSON.parse(cachedEvents));
          setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          setApiStatus('connected');
          return;
        } catch (e) {
          console.error("Failed to parse cached events", e);
        }
      }
    }

    setIsSyncing(true);
    setApiStatus('syncing');
    try {
      const res = await fetch('/api/reminders/calendar');
      const contentType = res.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned a non-JSON response.");
      }

      const data = await res.json();
      
      // Robustly extract event array from any response shape
      let eventList: CalendarEvent[] = [];
      if (Array.isArray(data)) {
        eventList = data;
      } else if (data && Array.isArray(data.events)) {
        eventList = data.events;
      } else if (data && data.events && Array.isArray(data.events.events)) {
        eventList = data.events.events;
      } else if (data && Array.isArray(data.data)) {
        eventList = data.data;
      }

      if (Array.isArray(eventList)) {
        setEvents(eventList);
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(eventList));
        window.localStorage.setItem(CACHE_DATE_KEY, today);
        setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setApiStatus('connected');
      } else {
        setApiStatus('error');
      }
    } catch (error) {
      console.error("Failed to sync calendar data", error);
      setApiStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchEvents(false);
  }, []);

  const todayDate = new Date();
  const displayDates = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - 3 + i);
    return d;
  });

  return (
    <div className="p-6">
      
      {/* Header, API Status & Sync Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700/60 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <CalendarIcon size={20} className="text-slate-500" />
          <h2 className="text-lg font-semibold">Upcoming Schedule</h2>
          
          {/* Google Calendar API Status Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-xs">
            {apiStatus === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-600 dark:text-emerald-400">GCalendar API: Connected</span>
              </>
            )}
            {apiStatus === 'syncing' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-spin" />
                <span className="text-amber-600 dark:text-amber-400">GCalendar API: Syncing...</span>
              </>
            )}
            {apiStatus === 'error' && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-rose-600 dark:text-rose-400">GCalendar API: Offline / Error</span>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {lastSynced && <span className="text-xs text-slate-400">Updated: {lastSynced}</span>}
          <button 
            onClick={() => fetchEvents(true)}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>

      {/* MOBILE VIEW: Vertical Timeline/Agenda */}
      <div className="md:hidden space-y-4 max-h-[500px] overflow-y-auto pr-2">
        {displayDates.map((date, idx) => {
          const dateStr = getLocalDateString(date);
          const dayEvents = events.filter(e => e.date === dateStr);
          const isToday = dateStr === getLocalDateString(todayDate);
          
          if (dayEvents.length === 0 && !isToday) return null;

          return (
            <div key={idx} className={`p-3 rounded-lg border ${isToday ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-100 dark:border-slate-700'}`}>
              <h3 className={`text-xs font-bold uppercase mb-2 ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {isToday && " (Today)"}
              </h3>
              <div className="space-y-2">
                {dayEvents.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No events</p>
                ) : (
                  dayEvents.map(ev => (
                    <div key={ev.id} className={`text-sm p-2 rounded ${ev.type === 'family' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'}`}>
                      {ev.title}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP VIEW: Horizontal Grid */}
      <div className="hidden md:grid grid-cols-7 gap-2">
        {displayDates.slice(0, 7).map((date, idx) => (
          <div key={`header-${idx}`} className="text-center text-xs font-bold uppercase text-slate-500 mb-2">
            {date.toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
        ))}
        
        {displayDates.map((date, idx) => {
          const dateStr = getLocalDateString(date);
          const dayEvents = events.filter(e => e.date === dateStr);
          const isToday = dateStr === getLocalDateString(todayDate);

          return (
            <div key={idx} className={`min-h-[100px] p-2 rounded-lg border ${isToday ? 'border-blue-400 ring-1 ring-blue-400 bg-slate-50 dark:bg-slate-800/80' : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50'}`}>
              <div className={`text-right text-xs font-medium mb-1 ${isToday ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
                {date.getDate()}
              </div>
              <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                {dayEvents.map(ev => (
                  <div key={ev.id} title={ev.title} className={`text-[10px] leading-tight p-1 rounded truncate ${ev.type === 'family' ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300' : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'}`}>
                    {ev.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
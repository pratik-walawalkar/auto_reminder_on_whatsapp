// dashboard_ui/src/app/page.tsx
"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useTheme } from "./theme-provider";
import HeaderNav from "./components/HeaderNav";
import UtilityTracker from "./components/UtilityTracker";
import YoYCalendarChart from "./components/YoYCalendarChart";
import StagingQueueTable from "./components/StagingQueueTable";
import HistoricalTable from "./components/HistoricalTable";
import ManualOverrideModal from "./components/ManualOverrideModal";
import EditRecordModal from "./components/EditRecordModal";
import MobileDashboardView from "./components/MobileDashboardView";
import SyncProgressModal from "./components/SyncProgressModal"; 
import { BillRecord, MetricData, StagingRecord } from "./types";
import { translations } from "./translations";
import { getApiBaseUrl } from "./lib/api";
import { loadDashboardSnapshot, saveDashboardSnapshot } from "./lib/offlineStorage";

const AnalyticsCharts = React.lazy(() => import('./components/AnalyticsCharts'));
const ConsumptionChart = React.lazy(() => import('./components/ConsumptionChart'));

export default function DashboardPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [waStatus, setWaStatus] = useState<"online" | "offline">("offline");
  const [lang, setLang] = useState<"en" | "mr">("en");
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  // Replaced numeric progress state with clean boolean visibility for the checklist modal
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [rawHistory, setRawHistory] = useState<BillRecord[]>([]);
  const [history, setHistory] = useState<BillRecord[]>([]);
  const [stagingQueue, setStagingQueue] = useState<StagingRecord[]>([]);
  
  const [timeline, setTimeline] = useState<string>("Lifetime");
  const [selectedMonth, setSelectedMonth] = useState<string>("All");
  const [isManualOpen, setIsManualOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All");

  const [editingRecord, setEditingRecord] = useState<BillRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const t = translations[lang] || translations["en"];

  useEffect(() => {
    setMounted(true);
  }, []);

  const safeApiCall = async (endpoint: string) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}${endpoint}`);
      if (!res.ok) throw new Error("Network response was not ok");
      return await res.json();
    } catch (error) {
      console.error(`API Error on ${endpoint}:`, error);
      return { database_offline: true, error };
    }
  };

// dashboard_ui/src/app/page.tsx (Inside DashboardPage component)

  const fetchData = async () => {
    setLoading(true);

    const metricsJson = await safeApiCall("/api/v1/metrics");
    
    // If the database is offline, fallback to local storage snapshot
    if (metricsJson.database_offline) {
      setIsOffline(true);
      const cached = loadDashboardSnapshot();
      if (cached) {
        setMetrics(cached.metrics ?? null);
        const cachedHistory = Array.isArray(cached.history) ? cached.history : [];
        setRawHistory(cachedHistory as BillRecord[]);
        setHistory(cachedHistory as BillRecord[]);
        setStagingQueue(Array.isArray(cached.stagingQueue) ? cached.stagingQueue : []);
      }
    } else {
      // Backend is online: use live data and ignore stale local storage on startup
      setIsOffline(false);
      setMetrics(metricsJson.data ?? null);

      const historyJson = await safeApiCall("/api/v1/bills/history");
      if (historyJson.records) {
        const records = historyJson.records as BillRecord[];
        setRawHistory(records);
        setHistory(records);
      }

      const queueJson = await safeApiCall("/api/v1/pipeline/staging");
      setStagingQueue(Array.isArray(queueJson.queue) ? queueJson.queue : []);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isOffline) {
      setWaStatus("offline");
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("System Alert: Offline", { body: "The dashboard database or instance went offline." });
      }
    } else {
      setWaStatus("online");
    }
  }, [isOffline]);

// dashboard_ui/src/app/page.tsx
  const handleTriggerSync = async () => {
    // Open the checklist modal; SyncProgressModal itself will trigger the backend pipeline
    setIsSyncOpen(true);
  };

  useEffect(() => {
    const cached = loadDashboardSnapshot();
    if (cached) {
      setMetrics(cached.metrics ?? null);
      const cachedHistory = Array.isArray(cached.history) ? cached.history : [];
      setRawHistory(cachedHistory as BillRecord[]);
      setHistory(cachedHistory as BillRecord[]);
      setStagingQueue(Array.isArray(cached.stagingQueue) ? cached.stagingQueue : []);
      setIsOffline(true);
    }

    void fetchData();
  }, []);

  useEffect(() => {
    saveDashboardSnapshot({
      metrics,
      history,
      stagingQueue,
      savedAt: new Date().toISOString(),
    });
  }, [metrics, history, stagingQueue]);

  const handleTimelineChange = (newTimeline: string) => {
    setTimeline(newTimeline);
    if (newTimeline !== "custom") {
      setSelectedMonth("All");
      setSelectedYear("All");
    }
  };

  const handleSelectMonthFilter = (month: string, year: number) => {
    setTimeline("custom");
    setSelectedMonth(month);
    setSelectedYear(String(year));
  };

  const { totalOutstanding, totalCleared, activeProvidersCount } = useMemo(() => {
    const now = new Date();
    
    const timelineFilteredHistory = rawHistory.filter((record) => {
      const recordDate = new Date(record.billing_period_start || record.due_date || Date.now());
      if (timeline === "This Month") {
        return recordDate.getMonth() === now.getMonth() && recordDate.getFullYear() === now.getFullYear();
      }
      if (timeline === "This Year") {
        return recordDate.getFullYear() === now.getFullYear();
      }
      if (timeline === "custom" && selectedMonth !== "All" && selectedYear !== "All") {
        const recordMonthStr = record.billing_month ? String(record.billing_month).toLowerCase() : "";
        return recordMonthStr === selectedMonth.toLowerCase() && String(record.billing_year) === selectedYear;
      }
      return true;
    });

    const cleared = timelineFilteredHistory
      .filter((r) => r.is_paid_status)
      .reduce((sum, r) => sum + (Number(r.bill_amount) || 0), 0);

    const outstanding = rawHistory
      .filter((r) => !r.is_paid_status)
      .reduce((sum, r) => sum + (Number(r.bill_amount) || 0), 0);

    const uniqueProviders = new Set(rawHistory.map((r) => r.provider_name));

    return {
      totalOutstanding: outstanding,
      totalCleared: cleared,
      activeProvidersCount: uniqueProviders.size,
    };
  }, [rawHistory, timeline, selectedMonth, selectedYear]);

  const handleApprove = async () => { await fetchData(); };
  const handleReject = async () => { await fetchData(); };

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? "bg-[#0b0f19] text-slate-200" : "bg-slate-50 text-slate-800"}`}>
      
      {/* Clean Checklist Progress Modal Component Integration */}
      <SyncProgressModal 
        isOpen={isSyncOpen} 
        onClose={() => {
          setIsSyncOpen(false);
          void fetchData();
        }} 
      />

      {/* HeaderNav */}
      <HeaderNav theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} isOffline={isOffline} loading={loading} onSync={handleTriggerSync} t={t} />

      {/* Mobile Dashboard View */}
      <MobileDashboardView 
        theme={theme} 
        stats={{ 
          outstanding: totalOutstanding.toLocaleString("en-IN"), 
          paid: totalCleared.toLocaleString("en-IN"), 
          activeProvidersCount: activeProvidersCount 
        }} 
        rawHistory={rawHistory}
        history={history}
        stagingQueue={stagingQueue}
        metrics={metrics}
        t={t}
        timeline={timeline}
        onTimelineChange={handleTimelineChange}
        onSelectMonthFilter={handleSelectMonthFilter}
        onApprove={handleApprove}
        onReject={handleReject}
        onRefresh={fetchData}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedMonth={selectedMonth}
        onEditRecord={(record: BillRecord) => {
          setEditingRecord(record);
          setIsEditModalOpen(true);
        }}
      />

      {/* Laptop Dashboard View */}
      <main className="hidden sm:block max-w-[1920px] mx-auto px-6 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 mb-6 rounded-2xl border bg-slate-900/40 border-slate-800 backdrop-blur-md">
          <div className="flex items-center space-x-4 flex-wrap gap-y-2">
             <div className="flex items-center space-x-3">
               <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Master Timeline:</span>
               <select
                 value={timeline}
                 onChange={(e) => handleTimelineChange(e.target.value)}
                 className={`px-3 py-1.5 rounded-lg text-sm font-semibold border outline-none ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800"}`}
               >
                 <option value="This Month">This Month</option>
                 <option value="This Year">This Year</option>
                 <option value="Lifetime">Lifetime</option>
                 <option value="custom">Custom</option>
               </select>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* LEFT SIDEBAR */}
          <aside className="xl:col-span-3 space-y-6 xl:sticky xl:top-6">
            <div className={`p-5 rounded-3xl border shadow-lg ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
              <Suspense fallback={<div className="p-6">Loading charts...</div>}>
                <AnalyticsCharts metrics={metrics} history={rawHistory} rawHistory={rawHistory} theme={theme} t={t} />
              </Suspense>
            </div>
          </aside>

          {/* CENTRE PANEL */}
          <section className="xl:col-span-6 space-y-6 min-w-0">
            
            {/* Financial Metrics Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-5 rounded-3xl border shadow-md ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Outstanding</p>
                <h3 className="text-2xl font-black text-rose-500">₹ {totalOutstanding.toLocaleString("en-IN")}</h3>
              </div>
              <div className={`p-5 rounded-3xl border shadow-md ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cleared ({timeline})</p>
                <h3 className="text-2xl font-black text-emerald-500">₹ {totalCleared.toLocaleString("en-IN")}</h3>
              </div>
              <div className={`p-5 rounded-3xl border shadow-md ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Providers</p>
                <h3 className="text-2xl font-black text-blue-500">{activeProvidersCount}</h3>
              </div>
            </div>

            {/* Dynamic Utilities Tracker */}
            <UtilityTracker history={rawHistory} />

            <div className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900/40">
              <div className="overflow-x-auto w-full">
                <StagingQueueTable
                  stagingQueue={stagingQueue}
                  theme={theme}
                  t={t}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onUpload={fetchData}
                />
              </div>
            </div>

            {/* Core Historical Ledger Table */}
            <div className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900/40 mt-6">
              <div className="overflow-x-auto w-full">
                <HistoricalTable
                  history={history}
                  theme={theme}
                  t={t}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  selectedProvider={selectedProvider}
                  setSelectedProvider={setSelectedProvider}
                  selectedYear={selectedYear}
                  setSelectedYear={setSelectedYear}
                  selectedMonth={selectedMonth}
                  onRefresh={fetchData}
                  onEditRecord={(record: BillRecord) => {
                    setEditingRecord(record);
                    setIsEditModalOpen(true);
                  }}
                />
              </div>
            </div>

            {/* Advanced Consumption Trends Chart */}
            <Suspense fallback={<div className="p-4">Loading chart...</div>}>
              <ConsumptionChart
                history={history}
                theme={theme}
                t={t}
                selectedYear={selectedYear}
              />
            </Suspense>
          </section>

          {/* RIGHT SIDEBAR */}
          <aside className="xl:col-span-3 space-y-6 xl:sticky xl:top-6">
            <div className={`p-5 rounded-3xl border shadow-lg ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
              <YoYCalendarChart 
                history={rawHistory} 
                theme={theme} 
                t={t} 
                timelineFilter={timeline}
                setTimelineFilter={handleTimelineChange}
                onSelectMonthFilter={handleSelectMonthFilter}
              />
            </div>
          </aside>
        </div>
      </main>

      {/* Manual Entry Modal */}
      {isManualOpen && (
        <ManualOverrideModal
          theme={theme}
          t={t}
          onClose={() => setIsManualOpen(false)}
          onSuccess={fetchData}
        />
      )}

      {/* Edit Record Modal */}
      {isEditModalOpen && editingRecord && (
        <EditRecordModal
          record={editingRecord}
          theme={theme}
          t={t}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => { setIsEditModalOpen(false); fetchData(); }}
        />
      )}

      {/* New System Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl border p-6 space-y-6 shadow-2xl transition-colors ${isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">System Settings & Connections</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/40">
                <h3 className="font-semibold mb-2">Storage Migration Format</h3>
                <p className="text-[11px] text-slate-400 mb-2">Configure file naming pattern (Similar to Immich structure):</p>
                <input type="text" defaultValue="{YYYY}-{MM}-{Provider}-{Utility}" className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm outline-none focus:border-blue-500" />
              </div>

              <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/40">
                <h3 className="font-semibold mb-2 flex items-center gap-2">WhatsApp Evolution API</h3>
                <p className="text-[11px] text-slate-400 mb-3">Scan QR code to authorize and connect instance.</p>
                <div className="w-40 h-40 bg-white rounded-xl flex items-center justify-center mx-auto shadow-inner">
                   <span className="text-slate-900 text-xs font-bold text-center">QR Code<br/>Generated<br/>Here</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/40">
                <h3 className="font-semibold mb-3">Quick Links</h3>
                <div className="flex gap-3">
                  <a href="#" className="flex-1 text-center px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-500 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600/30 transition">Evolution API</a>
                  <a href="#" className="flex-1 text-center px-3 py-2 rounded-lg bg-blue-600/20 text-blue-500 border border-blue-500/30 text-xs font-bold hover:bg-blue-600/30 transition">Database Panel</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
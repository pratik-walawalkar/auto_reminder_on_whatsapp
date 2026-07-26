"use client";

import React, { useState, useEffect, useMemo } from "react";
import HeaderNav from "./components/HeaderNav";
import UtilityTracker from "./components/UtilityTracker";
import AnalyticsCharts from "./components/AnalyticsCharts";
import YoYCalendarChart from "./components/YoYCalendarChart";
import StagingQueueTable from "./components/StagingQueueTable";
import HistoricalTable from "./components/HistoricalTable";
import ManualOverrideModal from "./components/ManualOverrideModal";
import ConsumptionChart from "./components/ConsumptionChart";
import { BillRecord, MetricData, StagingRecord } from "./types";
import { translations } from "./translations";

export default function DashboardPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [lang, setLang] = useState<"en" | "mr">("en");
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  
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

  const safeApiCall = async (endpoint: string) => {
    try {
      const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiBaseUrl = activeHostname !== "localhost" && activeHostname !== "127.0.0.1" 
        ? `http://${activeHostname}:9444` 
        : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:9444");

      const res = await fetch(`${apiBaseUrl}${endpoint}`);
      if (!res.ok) throw new Error("Network response was not ok");
      return await res.json();
    } catch (error) {
      console.error(`API Error on ${endpoint}:`, error);
      return { database_offline: true, error };
    }
  };

  const fetchData = async () => {
    setLoading(true);
    
    const metricsJson = await safeApiCall("/api/v1/metrics");
    if (metricsJson.database_offline) setIsOffline(true);
    else { setIsOffline(false); setMetrics(metricsJson.data); }

    const historyJson = await safeApiCall("/api/v1/bills/history");
    if (historyJson.records) {
      setRawHistory(historyJson.records);
      setHistory(historyJson.records);
    }

    const queueJson = await safeApiCall("/api/v1/pipeline/staging");
    if (queueJson.queue) setStagingQueue(queueJson.queue);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  const isDark = theme === "dark";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? "bg-[#0b0f19] text-slate-200" : "bg-slate-50 text-slate-800"}`}>
      <HeaderNav
        theme={theme}
        setTheme={setTheme}
        lang={lang}
        setLang={setLang}
        isOffline={isOffline}
        loading={loading}
        onSync={fetchData}
        t={t}
      />

      <main className="max-w-[1920px] mx-auto px-6 py-6">
        
        {/* Top Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 mb-6 rounded-2xl border bg-slate-900/40 border-slate-800 backdrop-blur-md">
          <div className="flex items-center space-x-3">
             <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Master Timeline:</span>
             <select
               value={timeline}
               onChange={(e) => handleTimelineChange(e.target.value)}
               className={`px-3 py-1.5 rounded-lg text-sm font-semibold border outline-none ${
                 isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800"
               }`}
             >
               <option value="This Month">This Month</option>
               <option value="This Year">This Year</option>
               <option value="Lifetime">Lifetime</option>
               <option value="custom">Custom (Month / Calendar)</option>
             </select>
          </div>
          <button
            onClick={() => setIsManualOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center space-x-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>{t.addManual}</span>
          </button>
        </div>

        {/* 3-Column Layout Grid with standard CSS Grid fractions (3 / 6 / 3) and top-aligned sticky sidebar wrappers */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* LEFT SIDEBAR */}
          <aside className="xl:col-span-3 space-y-6 xl:sticky xl:top-6">
            <div className={`p-5 rounded-3xl border shadow-lg ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
              <AnalyticsCharts metrics={metrics} history={rawHistory} rawHistory={rawHistory} theme={theme} t={t} />
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

            {/* Pending Staging Queue Table */}
            <div className="overflow-x-auto w-full pb-2">
              <div className="min-w-[640px]">
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
            <div className="overflow-x-auto w-full pb-2">
              <div className="min-w-[640px]">
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
                  onEditRecord={(record) => {
                    setEditingRecord(record);
                    setIsEditModalOpen(true);
                  }}
                />
              </div>
            </div>

            {/* Advanced Consumption Trends Chart */}
            <ConsumptionChart
              history={history}
              theme={theme}
              t={t}
              selectedYear={selectedYear}
            />

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
    </div>
  );
}
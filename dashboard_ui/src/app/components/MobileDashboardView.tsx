"use client";

import React, { useState, Suspense } from "react";
import UtilityTracker from "./UtilityTracker";
import StagingQueueTable from "./StagingQueueTable";
import HistoricalTable from "./HistoricalTable";
import YoYCalendarChart from "./YoYCalendarChart";

const AnalyticsCharts = React.lazy(() => import('./AnalyticsCharts'));
const ConsumptionChart = React.lazy(() => import('./ConsumptionChart'));

interface MobileDashboardProps {
  theme: "dark" | "light" | "system";
  stats: {
    outstanding: string;
    paid: string;
    activeProvidersCount: number;
  };
  rawHistory: any[];
  history: any[];
  stagingQueue: any[];
  metrics: any;
  t: any;
  timeline: string;
  onTimelineChange: (val: string) => void;
  onSelectMonthFilter: (month: string, year: number) => void;
  onApprove: () => void;
  onReject: () => void;
  onRefresh: () => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedProvider: string;
  setSelectedProvider: (val: string) => void;
  selectedYear: string;
  setSelectedYear: (val: string) => void;
  selectedMonth: string;
  onEditRecord: (record: any) => void;
  onToggleStatus?: (recordId: string, currentStatus: string) => void;
}

export default function MobileDashboardView({
  theme,
  stats,
  rawHistory,
  history,
  stagingQueue,
  metrics,
  t,
  timeline,
  onTimelineChange,
  onSelectMonthFilter,
  onApprove,
  onReject,
  onRefresh,
  searchTerm,
  setSearchTerm,
  selectedProvider,
  setSelectedProvider,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  onEditRecord,
}: MobileDashboardProps) {
  const isDark = theme === "dark";
  const [activeTab, setActiveTab] = useState<"overview" | "providers" | "bills">("overview");

return (
  <div className={`block sm:hidden pb-24 px-3 pt-3 transition-colors duration-300 ${isDark ? "text-slate-100 bg-[#0b0f19]" : "text-slate-900 bg-slate-50"}`}>
    
    {/* REDESIGNED APP-LIKE TOP HEADER & TABS */}
    <div className="mb-4 space-y-3">
      {/* App Branding / Title Row to prevent clipping */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-sm font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            {t.billHistory || "Utility Dashboard"}
          </h1>
          <p className="text-[10px] text-slate-400">
            {t.lang === "mr" ? "युटिलिटी बिल व्यवस्थापन" : "Manage and track utility bills"}
          </p>
        </div>
      </div>

      {/* Navigation Tabs (Flex-wrap or scrollable to prevent text clipping) */}
      <div className={`flex rounded-xl p-1 border shadow-sm ${isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"}`}>
        <button 
          onClick={() => setActiveTab("overview")}
          className={`flex-1 py-2 px-1 text-[11px] font-bold rounded-lg transition-all truncate ${activeTab === "overview" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
        >
          Overview
        </button>
        <button 
          onClick={() => setActiveTab("providers")}
          className={`flex-1 py-2 px-1 text-[11px] font-bold rounded-lg transition-all truncate ${activeTab === "providers" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
        >
          Providers
        </button>
        <button 
          onClick={() => setActiveTab("bills")}
          className={`flex-1 py-2 px-1 text-[11px] font-bold rounded-lg transition-all truncate ${activeTab === "bills" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
        >
          Bills & Queue
        </button>
      </div>
    </div>

      {/* 2. TAB CONTENT: OVERVIEW (Top Priority Cards + Utilities + Calendar) */}
      {activeTab === "overview" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Master Timeline Selector for Mobile */}
          <div className={`flex items-center justify-between p-3 rounded-2xl border ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Timeline:</span>
            <select
              value={timeline}
              onChange={(e) => onTimelineChange(e.target.value)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border outline-none ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"}`}
            >
              <option value="This Month">This Month</option>
              <option value="This Year">This Year</option>
              <option value="Lifetime">Lifetime</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Outstanding & Paid Summary Cards (Compact 2-col layout) */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3.5 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outstanding</span>
              <div className="text-base font-black text-rose-500 mt-1 truncate">₹ {stats.outstanding}</div>
            </div>
            <div className={`p-3.5 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cleared</span>
              <div className="text-base font-black text-emerald-500 mt-1 truncate">₹ {stats.paid}</div>
            </div>
          </div>

          {/* Compact 3 Utility Providers Block with Dynamic Status Glow */}
          <div className={`p-3.5 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Utility Providers</h3>
            <div className="grid grid-cols-3 gap-2">
                {["Airtel", "Adani", "MGL"].map((provider) => {
                const latestRecord = rawHistory?.find((r) => r.provider?.toLowerCase().includes(provider.toLowerCase()));
                const isPaid = latestRecord ? latestRecord.status === "Paid" || latestRecord.paid === true : true;
                
                return (
                    <div 
                    key={provider}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                        isPaid 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]" 
                        : "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                    }`}
                    >
                    <div className={`text-[11px] font-bold truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>{provider}</div>
                    <div className="text-[10px] font-semibold mt-0.5">
                        {isPaid ? (t.paid || "Paid") : (t.unpaid || "Unpaid")}
                    </div>
                    </div>
                );
                })}
            </div>
          </div>

          {/* Calendar View Integration */}
          <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
            <YoYCalendarChart 
              history={rawHistory} 
              theme={theme} 
              t={t} 
              timelineFilter={timeline}
              setTimelineFilter={onTimelineChange}
              onSelectMonthFilter={onSelectMonthFilter}
            />
          </div>

        </div>
      )}

      {/* 3. TAB CONTENT: PROVIDERS & CHARTS */}
      {activeTab === "providers" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Analytics Charts Component */}
          <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
            <Suspense fallback={<div className="p-4 text-xs text-slate-400">Loading analytics...</div>}>
              <AnalyticsCharts metrics={metrics} history={rawHistory} rawHistory={rawHistory} theme={theme} t={t} />
            </Suspense>
          </div>

          {/* Consumption Trends Chart */}
          <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
            <Suspense fallback={<div className="p-4 text-xs text-slate-400">Loading consumption trends...</div>}>
              <ConsumptionChart
                history={history}
                theme={theme}
                t={t}
                selectedYear={selectedYear}
              />
            </Suspense>
          </div>

        </div>
      )}

      {/* 4. TAB CONTENT: BILLS & UPLOAD QUEUE */}
      {activeTab === "bills" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Staging Queue & Upload Bill Block */}
          <div className={`p-2 rounded-2xl border overflow-hidden ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
            <StagingQueueTable
            stagingQueue={stagingQueue}
            theme={theme}
            t={t}
            onApprove={async (item) => { await onApprove(); }}
            onReject={async (item) => { await onReject(); }}
            onUpload={async () => { await onRefresh(); }}
            />
          </div>

          {/* Historical Ledger Table with status toggle/edit support */}
          <div className={`p-2 rounded-2xl border overflow-hidden ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
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
              onRefresh={onRefresh}
              onEditRecord={onEditRecord}
            />
          </div>

        </div>
      )}

    </div>
  );
}
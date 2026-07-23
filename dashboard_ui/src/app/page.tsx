"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "./theme-provider";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { 
  Sun, Moon, Monitor, RefreshCw, Download, Plus, 
  CheckCircle, AlertTriangle, CreditCard, Calendar, BarChart2, Layers,
  Wifi, Zap, Flame, Activity, FileText, FileSpreadsheet
} from "lucide-react";

// --- HARDENED STRUCTURED RUNTIME DATA CONTRACTS ---
interface BillRecord {
  id: number;
  msg_id: string | null;
  provider_name: string;
  bill_amount: number;
  tax_amount: number;
  due_date: string;
  billing_period_start: string;
  billing_period_end: string;
  billing_year: number;
  billing_month: number;
  units_consumed: number;
  daily_average_usage: number;
  local_pdf_path: string;
  is_paid_status: number | boolean;
  data_source: string;
  payment_success_date: string | null; 
  created_at: string;
}

interface ProviderSummary {
  provider: string;
  total_spent: number;
  total_bills_logged: number;
}

export default function DashboardPage() {
  const { theme, setTheme } = useTheme();
  
  // Core Application Reactive Data State Frameworks
  const [records, setRecords] = useState<BillRecord[]>([]);
  const [providerAggregates, setProviderAggregates] = useState<ProviderSummary[]>([]);
  
  // UI UX Functional Interface Controllers
  const [isSyncing, setIsSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("All Data");
  const [backendOffline, setBackendOffline] = useState(false);
  // 1. Update state interface declaration
  const [temporalHorizon, setTemporalHorizon] = useState<"month" | "6-months" | "year" | "lifetime">("month");
  const [activeVizView, setActiveVizView] = useState<"spline" | "distribution" | "summary">("spline");

  // Asynchronous Staging Dropzone Queues Matrix State Hooks
  const [stagedQueue, setStagedQueue] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);


  // Manual Ingestion Entry Form Data States Container
  const [form, setForm] = useState({
    provider_name: "Airtel WiFi", bill_amount: "", tax_amount: "0.0",
    due_date: "", billing_period_start: "", billing_period_end: "", units_consumed: ""
  });

  // Integrated Data Table Inline Filtering and Sorting States
  const [sortField, setSortField] = useState<"provider" | "amount" | "due_date">("due_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [searchFilterQuery, setSearchFilterQuery] = useState<string>("");

  // --- PRODUCTION-GRADE MULTI-CLIENT DEVICE INTERFACE ROUTER ---
  const [apiBase, setApiBase] = useState<string>("http://localhost:9444/api/v1");

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Captures the exact IP address or MagicDNS hostname of the server machine hosting the session
      const activeServerHostname = window.location.hostname;
      
      if (activeServerHostname !== "localhost" && activeServerHostname !== "127.0.0.1") {
        setApiBase(`http://${activeServerHostname}:9444/api/v1`);
      } else {
        setApiBase("http://127.0.0");
      }
    }
  }, []);



// --- REAL-TIME ASYNCHRONOUS STAGING QUEUE LIFECYCLE CONTROLLER ---
  const fetchStagingReviewQueue = async () => {
    try {
      const res = await fetch(`${apiBase}/pipeline/stage-queue`);
      const data = await res.json();
      if (data.status === "success") setStagedQueue(data.queue || []);
    } catch (err) { console.error("Staging socket synchronization dropped:", err); }
  };

  // --- PRODUCTION STORAGE DATA WAREHOUSE INTEGRATION MATRIX ---
  // --- FIXED PRODUCTION STORAGE DATA WAREHOUSE INTEGRATION ---
  const fetchDashboardWarehouseData = async () => {
    try {
      const historyRes = await fetch(`${apiBase}/bills/history`);
      const historyData = await historyRes.json();

      if (historyData.database_offline === true || historyData.status === "error") {
        setBackendOffline(true);
        setRecords([]);
        setProviderAggregates([]);
        return;
      }

      if (historyData.status === "success") {
        const rawRecords = historyData.records || [];
        setRecords(rawRecords);
        setBackendOffline(false);

        // --- CALCULATE SUMMARY TOTALS FOR AGGREGATE INDEX ---
        const map: { [key: string]: { total: number; count: number } } = {};
        rawRecords.forEach((r: any) => {
          if (!r?.provider_name) return;
          const vendor = String(r.provider_name);
          const amount = parseFloat(String(r.bill_amount || 0));
          if (!map[vendor]) map[vendor] = { total: 0, count: 0 };
          map[vendor].total += amount;
          map[vendor].count += 1;
        });

        const formatted: ProviderSummary[] = Object.keys(map).map(k => ({
          provider: k,
          total_spent: map[k].total,
          total_bills_logged: map[k].count
        }));

        setProviderAggregates(formatted);
      }
    } catch (err) {
      setBackendOffline(true);
    }
  };




  useEffect(() => {
    if (apiBase) {
      fetchStagingReviewQueue();
      fetchDashboardWarehouseData();
    }
  }, [apiBase]);

  // --- AUTOMATED BACKGROUND CALENDAR STATE SYNC ENGINE BUTTON ---
  const handlePipelineExecutionSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`${apiBase}/pipeline/sync`, { method: "POST" });
      if (res.ok) await fetchDashboardWarehouseData();
    } catch (err) { console.error(err); }
    finally { setIsSyncing(false); }
  };

  // --- MULTI-FILE STATEMENT PACKETS UPLOAD TRANSPORTS ROUTINE ---
  const handleMultiplePdfUpload = async (e: any) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true); setUploadProgress(10);
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData(); formData.append("file", files[i]);
      try {
        setUploadProgress(Math.floor(((i + 0.5) / files.length) * 100));
        await fetch(`${apiBase}/pipeline/stage-upload`, { method: "POST", body: formData });
      } catch (err) { console.error(err); }
    }
    setUploadProgress(100);
    setTimeout(() => { setIsUploading(false); setUploadProgress(0); fetchStagingReviewQueue(); }, 800);
  };

  // --- HARDENED TEMPORAL DATE CONVERSION INTERVAL OVERVIEW BRIDGE ---
  // --- BULLETPROOF DATE EVALUATOR (NO SPLIT BUGS) ---
  // --- FIXED DATE FILTER ENGINE ---
  const isRecordInHorizon = (billingPeriodStartStr: string | null, mode: string) => {
    if (!billingPeriodStartStr) return mode === "lifetime";
    try {
      // 1. Standardize formatting and isolate date from time string
      const cleanStr = String(billingPeriodStartStr).trim().replace(/\//g, "-");
      const datePart = cleanStr.includes("T") ? cleanStr.split("T")[0] : cleanStr;
      const parts = datePart.split("-");
      
      if (parts.length !== 3) return mode === "lifetime";

      let year = 0;
      let month = 0;

      // 2. Identify if format is ISO (YYYY-MM-DD) or traditional (DD-MM-YYYY)
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1; // 0-indexed adjustment
      } else {
        year = parseInt(parts[2], 10);
        month = parseInt(parts[1], 10) - 1;
      }

      if (isNaN(year) || isNaN(month)) return mode === "lifetime";

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const targetAbsoluteMonths = (year * 12) + month;
      const currentAbsoluteMonths = (currentYear * 12) + now.getMonth();
      const monthDifference = currentAbsoluteMonths - targetAbsoluteMonths;

      switch (mode) {
        case "month": 
          return year === currentYear && (month === currentMonth || month === currentMonth - 1);
        case "6-months":
          return monthDifference >= 0 && monthDifference < 6;
        case "year": 
          return year === currentYear;
        case "lifetime": 
          return true;
        default: 
          return true;
      }
    } catch (e) {
      return mode === "lifetime";
    }
  };


  // --- SAFE STRING DISPLAY CONVERTER ---
  const formatToUserDisplayDate = (dateStr: any) => {
    if (!dateStr) return "--";
    try {
      const cleanStr = String(dateStr).trim().replace(/\//g, "-");
      const match = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      
      // If matches ISO format (YYYY-MM-DD), safely rewrite to user-friendly format
      if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
      }
      return cleanStr.split("T")[0] || String(dateStr);
    } catch (e) { 
      return String(dateStr); 
    }
  };


  const currentRecords = records || [];

  // --- ARMED FINANCIAL RUNWAY ACCOUNTING ENGINE CALCULATORS ---
  // Fix A: Rolling overdue liabilities display an unchanged, permanent aggregate (Decoupled from tabs)
  const totalUnpaidBalance = currentRecords.filter(r => {
    return r.is_paid_status === false || r.is_paid_status === 0 || r.is_paid_status === 0.0 || String(r.is_paid_status).toLowerCase() === "false" || Number(r.is_paid_status) === 0;
  }).reduce((sum, r) => sum + parseFloat(r.bill_amount?.toString() || "0"), 0);

  // Fix B: Cleared Expenses dynamically accrue relative to statement billing period start timestamps
  const clearedMetricValue = currentRecords.filter(r => {
    const isPaid = r.is_paid_status === true || r.is_paid_status === 1 || r.is_paid_status === 1.0 || String(r.is_paid_status).toLowerCase() === "true" || Number(r.is_paid_status) === 1;
    return isPaid && isRecordInHorizon(r.billing_period_start, temporalHorizon);
  }).reduce((sum, r) => sum + parseFloat(r.bill_amount?.toString() || "0"), 0);

  // Vocabulary Synchronization Contract: Total unique tracked "Managed Utilities"
  const total_streams = currentRecords.length ? new Set(currentRecords.map(r => r.provider_name)).size : 0;

  // // --- FIX 2: FIXED STRING INTERPOLATION MAPS NATIVE CONVERSIONS TO DD-MM-YYYY ---
  // const formatToUserDisplayDate = (dateStr: string | null) => {
  //   if (!dateStr) return "--";
  //   try {
  //     const cleanStr = dateStr.replace(/\//g, "-").split("T")[0];
  //     const parts = cleanStr.split("-");
  //     if (parts.length === 3) {
  //       // If coming from database ISO format (YYYY-MM-DD), transform it into DD-MM-YYYY layout
  //       return parts[0].length === 4 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanStr;
  //     }
  //     return dateStr;
  //   } catch (e) { return dateStr; }
  // };

  const getUtilityBreakdownData = () => {
    const horizonRecords = currentRecords.filter(r => isRecordInHorizon(r.billing_period_start, temporalHorizon));
    const totalSpent = horizonRecords.reduce((sum, r) => sum + parseFloat(r.bill_amount?.toString() || "0"), 0);
    const grouped: { [key: string]: number } = {};
    horizonRecords.forEach(r => { 
      grouped[r.provider_name] = (grouped[r.provider_name] || 0) + parseFloat(r.bill_amount?.toString() || "0"); 
    });

    return Object.keys(grouped).map(key => ({ provider: key, amount: grouped[key], percentage: totalSpent > 0 ? (grouped[key] / totalSpent) * 100 : 0 })).sort((a, b) => b.amount - a.amount);
  };

  const breakdownData = getUtilityBreakdownData();


  const toggleLedgerDataSorting = (field: "provider" | "amount" | "due_date") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getProviderIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("wifi") || n.includes("airtel") || n.includes("broadband")) return <Wifi className="w-5 h-5 text-blue-500" />;
    if (n.includes("electricity") || n.includes("adani") || n.includes("power")) return <Zap className="w-5 h-5 text-amber-500" />;
    return <Flame className="w-5 h-5 text-orange-500" />;
  };
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] p-6 md:p-10 lg:p-12 text-dashboard-body select-none font-sans antialiased transition-colors duration-300">
      
      {/* SYSTEM NETWORK OFFLINE EXCEPTION BANNER */}
       {/* SYSTEM OFFLINE MULTI-ACCOUNT DATABASE BANNER ALERT */}
      {backendOffline && (
        <div className="mb-8 p-6 bg-rose-500/10 border-2 border-rose-500/30 rounded-2xl flex items-center gap-4 text-rose-500 font-black shadow-md animate-pulse">
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <div className="text-base md:text-lg">
            CRITICAL SYSTEM ERROR: Relational Database on Port 5432 is unreachable. Verify Docker container states inside your PowerShell window.
          </div>
        </div>
      )}

      {/* RE-ENGINEERED HEADER MATRIX PANEL */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-12 border-b border-border/80 pb-8">
        <div className="space-y-2">
          {/* --- FIX: HIGH-CONTRAST DYNAMIC GRADIENT TITLE --- */}
          <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent filter drop-shadow-sm subpixel-antialiased">
            Walawalkar's Utilities Financial Dashboard
          </h1>
          <p className="text-xs md:text-sm font-black text-slate-400 dark:text-slate-500 tracking-widest uppercase">Continuous Time-Series Utility Validation & Anti-Ban Automation Matrix</p>
        </div>

        {/* RESTORED: MASTER TOOLBAR ACTIONS GRID */}
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto justify-end">
          
          {/* THEME SELECTION SEGMENTED SWITCHES */}
          <div className="flex bg-slate-500/5 border-2 border-border p-1.5 rounded-xl gap-1">
            {(["light", "dark", "system"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-black transition-all capitalize ${
                  theme === mode 
                    ? "gradient-btn scale-105" 
                    : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* PIPELINE SYNC SYSTEM TRIGER */}
          <button
            onClick={handlePipelineExecutionSync}
            disabled={isSyncing || backendOffline}
            className="flex items-center justify-center gap-2 gradient-btn text-xs md:text-sm font-black px-5 py-3.5 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            Sync Pipeline Status
          </button>

          {/* --- FIX: RESTYLED MANUAL OVERRIDE BUTTON TO MATCH PALETTE THEME ENTIRELY --- */}
          <button
            onClick={() => setShowModal(true)}
            disabled={backendOffline}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-500 dark:via-purple-500 dark:to-pink-500 hover:opacity-90 text-white text-xs md:text-sm font-black px-6 py-3.5 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-40"
          >
            <Plus className="w-4.5 h-4.5" />
            Add Manual Override
          </button>
        </div>
      </header>

      {/* REFACTORED HIGH-CONTRAST CRUNCHED 4-COLUMN SUMMARY DECK GRID */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
        
        {/* CARD 1: ALL-TIME DECOUPLED DEBT LIABILITIES ACCRUAL */}
        <div className="royal-card flex items-center justify-between border-2 border-border">
          <div className="space-y-2">
            <p className="text-dashboard-caption font-black text-slate-400 dark:text-slate-500">Outstanding Liabilities</p>
            <h3 className="text-dashboard-kpi text-rose-500 font-black">₹{totalUnpaidBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="p-4 bg-rose-500/10 rounded-2xl text-rose-500 border border-rose-500/20"><AlertTriangle className="w-6 h-6" /></div>
        </div>

        {/* CARD 2: TEMPORAL CHRONO FILTER INCURRED RUNWAY */}
        <div className="royal-card flex items-center justify-between border-2 border-border">
          <div className="space-y-2">
            <p className="text-dashboard-caption font-black text-slate-400 dark:text-slate-500">Cleared Expenses</p>
            <h3 className="text-dashboard-kpi text-emerald-500 font-black">₹{clearedMetricValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-500 border border-emerald-500/20"><CheckCircle className="w-6 h-6" /></div>
        </div>

        {/* CARD 3: RE-CLASSIFIED TERMINOLOGY FOR STREAMS ("Managed Utilities") */}
        <div className="royal-card flex items-center justify-between border-2 border-border">
          <div className="space-y-2">
            <p className="text-dashboard-caption font-black text-slate-400 dark:text-slate-500">Managed Utilities</p>
            <h3 className="text-dashboard-kpi text-blue-600 dark:text-blue-400 font-black">{total_streams} Channels</h3>
          </div>
          <div className="p-4 bg-blue-500/10 rounded-2xl text-blue-500 border border-blue-500/10"><Layers className="w-6 h-6" /></div>
        </div>

        {/* CARD 4: HORIZON SWITCH CONTROLS SEGMENT PILLS STRATEGY */}
        <div className="royal-card border-2 border-border p-5 flex flex-col justify-center gap-3">
          <p className="text-dashboard-caption font-black text-slate-400 dark:text-slate-500">Temporal Horizon Selection</p>
          <div className="flex bg-slate-500/5 p-1.5 rounded-xl border border-border/60 gap-1.5 w-full select-none">
            {(["month", "6-months", "year", "lifetime"] as const).map((horizon) => (
              <button
                key={horizon}
                onClick={() => setTemporalHorizon(horizon)}
                className={`flex-1 text-center py-2.5 rounded-xl text-xs font-black tracking-wide transition-all ${
                  temporalHorizon === horizon ? "temporal-pill-active shadow-md" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {horizon}
              </button>
            ))}
          </div>
        </div>
      </section>
      {/* INTEGRATED EXECUTIVE TWO-COLUMN VISUAL SPLIT GRID */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12 items-start">
        
        {/* COLUMN 1 & 2: MULTI-VIEW TABBED VISUALIZATION DECK PANEL */}
        {/* --- CHANGE THIS WRAPPER LINE (Around Line 132) --- */}
        <div className="royal-card xl:col-span-2 border-2 border-border flex flex-col justify-start p-6 md:p-8 min-h-[520px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-5 mb-6">
            <h2 className="text-dashboard-title flex items-center gap-2.5">
              <Activity className="w-5.5 h-5.5 text-purple-500 animate-pulse" /> Multi-Tier Predictive Trend Runway
            </h2>
            
            {/* --- FIX COMPLETE: STRICT CASE-SYNCHRONIZED CONTROLS ON TAB TOOGLE LINKS --- */}
            {/* We force absolute lowercase states mapping tokens to prevent interface component data truncation drops */}
            <div className="flex bg-slate-500/5 p-1.5 rounded-xl border border-border/80 gap-1.5 select-none">
              <button 
                onClick={() => setActiveVizView("spline")} 
                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-2 ${activeVizView === "spline" ? "bg-card text-purple-600 dark:text-purple-400 border border-border shadow-sm" : "text-slate-400 hover:text-foreground"}`}
              >
                📈 Spline Timeline
              </button>
              <button 
                onClick={() => setActiveVizView("distribution")} 
                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-2 ${activeVizView === "distribution" ? "bg-card text-purple-600 dark:text-purple-400 border border-border shadow-sm" : "text-slate-400 hover:text-foreground"}`}
              >
                📊 Proportional Share
              </button>
              <button 
                onClick={() => setActiveVizView("summary")} 
                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-2 ${activeVizView === "summary" ? "bg-card text-purple-600 dark:text-purple-400 border border-border shadow-sm" : "text-slate-400 hover:text-foreground"}`}
              >
                🗄️ Aggregate Index
              </button>
            </div>
          </div>


          {/* DYNAMIC CANVAS CHART SWITCH HOOKS VIEW DISPLAY PLOTTER */}
          {/* --- FIX: ADDED RIGID HEIGHT CONSTRAINTS TO FORCIBLY RENDER RECHARTS CANVAS --- */}
          {/* Swapped "flex-1 min-h-[340px] h-full" with an absolute pixel rendering viewport track "w-full h-[360px]" */}
          {/* RE-ENGINEERED DYNAMIC VISUALIZATION CANVAS CONTROLLER FIXED */}
          {/* Separates the layout containers so each view scales naturally with large typography */}
          {/* --- FIXED: MASTER VIEW PORT CONTAINER FORCED TO TOP-START WITH ANIMATION --- */}
          <div className="pt-2 min-h-[350px] w-full flex flex-col justify-start items-stretch">
            
            {activeVizView === "spline" && (
              <div className="w-full flex flex-col justify-start items-stretch space-y-4 animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Chronological Cost Paths</h3>
                <div className="h-80 w-full bg-slate-950/40 rounded-xl border border-slate-900/60 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[...currentRecords].reverse().map(r => {
                      const rawMonth = parseFloat(String(r.billing_month || 1));
                      const cleanMonth = isNaN(rawMonth) ? 1 : Math.floor(rawMonth);
                      const shortName = String(r.provider_name || "Vendor").trim().split(" ")[0];
                      return {
                        name: `${shortName} (M${cleanMonth})`,
                        amount: parseFloat(String(r.bill_amount || 0))
                      };
                    })}>
                      <defs>
                        <linearGradient id="cyberSapphireGlow" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35}/>
                          <stop offset="50%" stopColor="#7c3aed" stopOpacity={0.20}/>
                          <stop offset="100%" stopColor="#db2777" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800 }} stroke="currentColor" opacity={0.6} />
                      <YAxis tick={{ fontSize: 11, fontWeight: 800 }} stroke="currentColor" opacity={0.6} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "16px", border: "2px solid hsl(var(--border))" }} />
                      <Area type="monotone" dataKey="amount" stroke="#db2777" strokeWidth={3.5} fillOpacity={1} fill="url(#cyberSapphireGlow)" name="Payable (₹)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeVizView === "distribution" && (
              <div className="w-full flex flex-col justify-start items-stretch space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Proportional Vendor Weight</h3>
                {(!breakdownData || breakdownData.length === 0) ? (
                  <p className="text-slate-500 text-xs italic py-4">No structured cost metrics verified inside this time frame.</p>
                ) : (
                  <div className="w-full flex flex-col justify-start items-stretch space-y-4">
                    {breakdownData.map((item, idx) => {
                      const amountVal = parseFloat(String(item.amount || 0));
                      const percentVal = Math.min(Math.round(item.percentage || 0), 100);
                      return (
                        <div key={idx} className="w-full bg-slate-950/30 p-3 rounded-lg border border-slate-900/60">
                          <div className="flex justify-between text-xs font-semibold mb-2">
                            <span className="text-slate-300 tracking-wide">{item.provider}</span>
                            <span className="font-mono text-purple-400">₹{amountVal.toFixed(2)} ({percentVal}%)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500"
                              style={{ width: `${percentVal}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeVizView === "summary" && (
              <div className="w-full flex flex-col justify-start items-stretch space-y-4 animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Historical Provider Indexing</h3>
                {(!providerAggregates || providerAggregates.length === 0) ? (
                  <p className="text-slate-500 text-xs italic py-4">No static summary indexes constructed from historical records.</p>
                ) : (
                  <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 items-start content-start justify-start">
                    {providerAggregates.map((pa, idx) => (
                      <div key={idx} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 self-start">
                        <div className="flex items-center space-x-2 border-b border-slate-900 pb-2">
                          <Layers className="h-4 w-4 text-indigo-400" />
                          <h4 className="text-sm font-bold text-slate-200 tracking-wide">{pa.provider}</h4>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Logged</span>
                          <span className="text-lg font-mono font-bold text-emerald-400">₹{parseFloat(String(pa.total_spent || 0)).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Statements Count</span>
                          <span className="text-sm font-mono font-bold text-indigo-300">{pa.total_bills_logged} items</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* COLUMN 3: STABLE COMPACT INGESTION REVIEW STAGING MATRIX PANEL CONTAINER */}
        <div className="royal-card border-2 border-border p-6 flex flex-col gap-5 min-h-[520px] justify-between">
          <div>
            <h2 className="text-dashboard-title flex items-center gap-2.5"><Layers className="w-5 h-5 text-blue-500" /> Ingestion Staging</h2>
            <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Drop statement copies to review extraction details</p>
          </div>

          {/* DRAG AND DROP TARGET BLOCK CHANNEL */}
          <div className="border-2 border-dashed border-border hover:border-purple-500/40 rounded-2xl p-5 text-center bg-slate-500/5 cursor-pointer relative group transition-colors">
            <input type="file" multiple accept=".pdf" onChange={handleMultiplePdfUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
            <div className="flex flex-col items-center justify-center gap-2.5 py-2">
              <Download className="w-8 h-8 text-purple-500 opacity-60 group-hover:scale-105 transition-transform" />
              <span className="text-xs font-black text-slate-700 dark:text-slate-300">Drop Multiple PDFs here to stage</span>
            </div>
          </div>
          {/* EDITABLE REVIEW CARDS MATRIX CONTAINER STACK */}
          <div className="space-y-4 flex-1 overflow-y-auto max-h-[250px] pr-1">
            {stagedQueue.map((staged, sIdx) => (
              <div key={staged.id || sIdx} className={`p-4 bg-background border-2 rounded-xl space-y-3 relative shadow-inner transition-all ${staged.is_duplicate ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/80'}`}>
                <div className="flex justify-between items-center text-xs font-black pb-2 border-b border-border/60">
                  <span className="truncate max-w-[130px] font-black">{staged.file_name}</span>
                  {staged.is_duplicate ? (
                    <span className="text-[10px] font-black tracking-widest text-amber-500 animate-pulse">⚠️ DUPLICATE</span>
                  ) : (
                    <span className="text-[10px] font-black tracking-widest text-blue-500 uppercase bg-blue-500/10 px-2 py-0.5 rounded">QUEUED</span>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-black block mb-0.5">Vendor Name</label>
                    <input type="text" value={staged.provider_name || ""} onChange={e=>{const u=[...stagedQueue]; u[sIdx].provider_name=e.target.value; setStagedQueue(u);}} className="bg-card px-2.5 py-1.5 border border-border w-full rounded-xl font-bold text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-black block mb-0.5">Net Payable Amount</label>
                    <input type="number" value={staged.bill_amount || ""} onChange={e=>{const u=[...stagedQueue]; u[sIdx].bill_amount=e.target.value; setStagedQueue(u);}} className="bg-card px-2.5 py-1.5 border border-border w-full rounded-xl font-black text-sm text-slate-950 dark:text-white" />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                  <button type="button" onClick={async()=>{await fetch(`${apiBase}/pipeline/stage-reject/${staged.id}`,{method:"DELETE"}); fetchStagingReviewQueue();}} className="text-[10px] font-black px-3 py-1.5 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">REJECT</button>
                  <button type="button" onClick={async()=>{
                    const res = await fetch(`${apiBase}/pipeline/stage-approve/${staged.id}`,{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({provider_name:staged.provider_name, utility_type:staged.utility_type||"WiFi", bill_amount:parseFloat(staged.bill_amount), units_consumed:parseFloat(staged.units_consumed||"0"), due_date:staged.due_date, billing_period_start:staged.billing_period_start, billing_period_end:staged.billing_period_end})});
                    if(res.ok){ fetchStagingReviewQueue(); fetchDashboardWarehouseData(); }
                  }} className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-1.5 rounded-xl shadow-sm tracking-wide transition-all active:scale-95">APPROVE</button>
                </div>
              </div>
            ))}
            {stagedQueue.length === 0 && !isUploading && (
              <div className="text-center text-dashboard-caption py-8 border-2 border-dashed border-border bg-slate-500/5 rounded-xl font-bold">Staging queue empty. Drop statement copies to review profile metrics.</div>
            )}
          </div>
        </div>
      </section>

      {/* CONTINUOUS STATEMENT LEDGER HISTORY TRACKING MATRIX TABLE WITH FILTER SECTIONS */}
      <section className="royal-card overflow-hidden border-2 border-border/80 p-0 mb-12 shadow-sm">
        <div className="p-6 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-500/5">
          <div className="space-y-1">
            <h2 className="text-dashboard-title flex items-center gap-2.5">
              <CreditCard className="w-5.5 h-5.5 text-blue-500" /> Continuous Timeline Statement Ledger
            </h2>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Audit ledger profiles, toggle locks, or export point-in-time files</p>
          </div>
          
          {/* SEARCH AND EXPORT ACTION TOOLS GRID LAYOUT */}
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
            <input 
              type="text" 
              placeholder="Search statements (e.g. Airtel, Adani)..." 
              value={searchFilterQuery}
              onChange={(e) => setSearchFilterQuery(e.target.value)}
              className="bg-card text-foreground px-4 py-2 border-2 border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500/40 w-full sm:w-64"
            />
            <div className="flex gap-2.5">
              {/* --- RESTORED: ATTACHED HIGH-VISIBILITY ICON VECTORS BACK INTO LINK PACKETS --- */}
              <a href={`${apiBase}/export?format=csv`} className="flex-1 sm:flex-initial flex items-center justify-center gap-2 text-xs border-2 border-border bg-card hover:bg-slate-500/5 font-black px-4 py-2.5 rounded-xl text-slate-700 dark:text-slate-300 shadow-sm transition-all active:scale-95">
                <FileText className="w-4 h-4 text-blue-500" /> Export CSV
              </a>
              <a href={`${apiBase}/export?format=excel`} className="flex-1 sm:flex-initial flex items-center justify-center gap-2 text-xs border-2 border-border bg-card hover:bg-slate-500/5 font-black px-4 py-2.5 rounded-xl text-slate-700 dark:text-slate-300 shadow-sm transition-all active:scale-95">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Export Excel
              </a>
            </div>
          </div>
        </div>
        {/* LEDGER ARCHIVE DATA GRID RUNWAY */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-b-2 border-border font-black text-xs uppercase tracking-widest select-none">
                <th className="p-5 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => toggleLedgerDataSorting("provider")}>
                  Utility Profile {sortField === "provider" && (sortDirection === "asc" ? "▲" : "▼")}
                </th>
                <th className="p-5 font-black">Billing Period</th>
                <th className="p-5 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => toggleLedgerDataSorting("amount")}>
                  Net Payable {sortField === "amount" && (sortDirection === "asc" ? "▲" : "▼")}
                </th>
                <th className="p-5 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => toggleLedgerDataSorting("due_date")}>
                  Due Date {sortField === "due_date" && (sortDirection === "asc" ? "▲" : "▼")}
                </th>
                <th className="p-5 font-black">Consumption KPI</th>
                <th className="p-5 text-center font-black">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-dashboard-body text-slate-700 dark:text-slate-300">
              {currentRecords
                .filter(r => {
                  const query = searchFilterQuery.toLowerCase().trim();
                  if (!query) return true;
                  return r.provider_name.toLowerCase().includes(query) || r.data_source.toLowerCase().includes(query);
                })
                .sort((a, b) => {
                  let factor = sortDirection === "asc" ? 1 : -1;
                  if (sortField === "provider") return a.provider_name.localeCompare(b.provider_name) * factor;
                  if (sortField === "amount") return (parseFloat(a.bill_amount.toString()) - parseFloat(b.bill_amount.toString())) * factor;
                  return (new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) * factor;
                })
                .map((bill) => {
                  const isPaid = bill.is_paid_status === true || bill.is_paid_status === 1 || bill.is_paid_status === 1.0 || String(bill.is_paid_status).toLowerCase() === "true";
                  // Calculate typical historical average baseline for this matching vendor
                  const currentAmount = parseFloat(String(bill.bill_amount || 0));
 
                  const vendorHistory = records.filter(rec => 
                    String(rec.provider_name).trim().toLowerCase() === String(bill.provider_name).trim().toLowerCase() && 
                    rec.id !== bill.id
                  );
                  const averageBaseline = vendorHistory.length > 0 
                    ? vendorHistory.reduce((s, rec) => s + parseFloat(String(rec.bill_amount || 0)), 0) / vendorHistory.length 
                    : currentAmount;
                  const isAnomalousSpike = vendorHistory.length > 0 && currentAmount > (averageBaseline * 1.3);

                  return (
                    <tr key={bill.id} className={`... ${isAnomalousSpike ? "bg-amber-500/10" : ""}`}>
                        {/* ... table cells ... */}
                        {isAnomalousSpike && (
                            <span className="... animate-pulse">⚠ COST SPIKE</span>
                        )}
                      <td className="p-5 font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-card border border-border rounded-xl shadow-sm">{getProviderIcon(bill.provider_name)}</div>
                        <span className="font-extrabold text-base">{bill.provider_name}</span>
                      </td>
                      <td className="p-5 text-slate-500 dark:text-slate-400 font-bold text-sm">{formatToUserDisplayDate(bill.billing_period_start)} to {formatToUserDisplayDate(bill.billing_period_end)}</td>
                      <td className="p-5 font-black text-base text-slate-900 dark:text-white">
                        ₹{(() => {
                          const parsedAmount = parseFloat(String(bill.bill_amount));
                          return isNaN(parsedAmount) ? "0.00" : parsedAmount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          });
                        })()}
                      </td>
                      <td className="p-5"><span className="inline-flex items-center gap-2 bg-background px-3 py-1.5 border border-border rounded-lg font-black text-xs text-slate-900 dark:text-white"><Calendar className="w-4 h-4 text-blue-500 opacity-60" /> {formatToUserDisplayDate(bill.due_date)}</span></td>
                      <td className="p-5 font-black text-slate-900 dark:text-white">{bill.units_consumed ? `${bill.units_consumed} ${bill.provider_name.includes('Gas') ? 'SCM' : 'kWh'}` : '--'}</td>
                      
                      {/* FIXED: EXPANDED NO-WRAP OPERATIONAL UTILITY BUTTONS CODES GRID */}
                      <td className="p-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-center gap-3 tracking-wide select-none">
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetch(`${apiBase}/bills/toggle/${bill.id}`, { method: "POST" });
                              if (res.ok) fetchDashboardWarehouseData();
                            }}
                            className={`text-xs font-black tracking-widest px-5 py-2.5 rounded-xl border transition-all active:scale-95 min-w-[110px] text-center inline-block ${
                              isPaid ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse"
                            }`}
                          >
                            {isPaid ? "● PAID" : "○ UNPAID"}
                          </button>
                          <button type="button" onClick={async () => {
                            if (confirm("Are you sure you want to delete this record?")) {
                              const res = await fetch(`${apiBase}/bills/delete/${bill.id}`, { method: "DELETE" });
                              if (res.ok) fetchDashboardWarehouseData();
                            }
                          }} className="text-xs font-black text-rose-500 hover:bg-rose-500/10 px-4 py-2.5 rounded-xl transition-all active:scale-95 border border-transparent">Delete</button>
                          <button 
                            type="button" 
                            onClick={() => {
                              setForm({
                                provider_name: bill.provider_name,
                                bill_amount: bill.bill_amount.toString(),
                                tax_amount: bill.tax_amount?.toString() || "0.0",
                                due_date: formatToUserDisplayDate(bill.due_date),
                                billing_period_start: formatToUserDisplayDate(bill.billing_period_start),
                                billing_period_end: formatToUserDisplayDate(bill.billing_period_end),
                                units_consumed: bill.units_consumed?.toString() || ""
                              });
                              // If your backend manual route uses editing mode, set an active item pointer state here
                              setShowModal(true);
                            }} 
                            className="text-xs font-black text-blue-500 hover:bg-blue-500/10 px-4 py-2.5 rounded-xl transition-all active:scale-95 border border-transparent"
                          >
                            Edit
                          </button>

                        </div>
                      </td>
                    </tr>
                    
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* DYNAMIC MANUAL STATEMENT OVERRIDE DIALOG MODAL BOX */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl border-2 border-border shadow-2xl p-6 md:p-8 relative animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black mb-4 tracking-tight">Manual Statement Override Wizard</h3>
            <form onSubmit={async(e)=>{
              e.preventDefault();
              const res = await fetch(`${apiBase}/bills/manual`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...form, bill_amount:parseFloat(form.bill_amount), tax_amount:parseFloat(form.tax_amount), units_consumed:parseFloat(form.units_consumed||"0")})});
              if(res.ok){ setShowModal(false); fetchDashboardWarehouseData(); }
            }} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Utility Service Channel</label>
                <select value={form.provider_name} onChange={e=>setForm({...form, provider_name:e.target.value})} className="w-full bg-background border-2 border-border px-3 py-3 rounded-xl font-black text-sm">
                  <option>Airtel WiFi</option><option>Adani Electricity</option><option>MGL Gas</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Payable Amount (₹)</label>
                  <input type="number" step="0.01" required value={form.bill_amount} onChange={e=>setForm({...form, bill_amount:e.target.value})} className="w-full bg-background border-2 border-border px-3 py-2.5 rounded-xl text-sm font-black text-slate-900 dark:text-white" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Consumption Units</label>
                  <input type="number" step="0.1" value={form.units_consumed} onChange={e=>setForm({...form, units_consumed:e.target.value})} className="w-full bg-background border-2 border-border px-3 py-2.5 rounded-xl text-sm font-bold" placeholder="kWh / SCM" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Period Start Date</label>
                  <input type="text" required value={form.billing_period_start} onChange={e=>setForm({...form, billing_period_start:e.target.value})} className="w-full bg-background border-2 border-border px-3 py-2.5 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200" placeholder="DD-MM-YYYY" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Period End Date</label>
                  <input type="text" required value={form.billing_period_end} onChange={e=>setForm({...form, billing_period_end:e.target.value})} className="w-full bg-background border-2 border-border px-3 py-2.5 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200" placeholder="DD-MM-YYYY" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Payment Due Date</label>
                <input 
                  type="text" 
                  required 
                  value={form.due_date} 
                  onChange={e => setForm({ ...form, due_date: e.target.value })} 
                  className="w-full bg-background border-2 border-border px-3 py-2.5 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200" 
                  placeholder="DD-MM-YYYY" 
                />
              </div>

              {/* HIGH-CONTRAST GRADIENT CONTROL ACTIONS FOOTER ROW */}
              <div className="flex gap-4 justify-end pt-4 border-t border-border mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-5 py-2.5 border-2 border-border/80 dark:border-border rounded-xl text-xs font-black text-slate-500 hover:bg-slate-500/5 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 tracking-wide uppercase"
                >
                  Commit Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

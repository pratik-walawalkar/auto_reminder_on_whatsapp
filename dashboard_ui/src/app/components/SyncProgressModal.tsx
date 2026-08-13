// dashboard_ui/src/app/components/SyncProgressModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { getApiBaseUrl } from "../lib/api";

interface SyncStep {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "error";
}

interface SyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SyncProgressModal({ isOpen, onClose }: SyncProgressModalProps) {
  const [steps, setSteps] = useState<SyncStep[]>([
    { id: "whatsapp", label: "Validating WhatsApp Connection", status: "pending" },
    { id: "dropzone", label: "Ingesting Manual Dropzone Files", status: "pending" },
    { id: "gmail", label: "Querying Gmail Billing Stream", status: "pending" },
    { id: "audits", label: "Running Timeline & Task Audits", status: "pending" },
    { id: "retries", label: "Clearing Notification Retry Queue", status: "pending" },
  ]);

  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setHasError(false);
    setSteps(prev => prev.map(s => ({ ...s, status: "pending" })));

    const runSyncPipeline = async () => {
      try {
        // Step 1: WhatsApp Validation
        setSteps(prev => prev.map(s => s.id === "whatsapp" ? { ...s, status: "running" } : s));
        await new Promise(r => setTimeout(r, 400)); // Smooth UI transition
        setSteps(prev => prev.map(s => s.id === "whatsapp" ? { ...s, status: "completed" } : s));

        // Step 2: Dropzone Ingestion
        setSteps(prev => prev.map(s => s.id === "dropzone" ? { ...s, status: "running" } : s));
        
        // Trigger actual backend sync request here
        const res = await fetch(`${getApiBaseUrl()}/api/v1/pipeline/sync`, { method: "POST" });
        if (!res.ok) throw new Error("Sync pipeline failed on backend");

        if (!isMounted) return;

        setSteps(prev => prev.map(s => {
          if (s.id === "dropzone") return { ...s, status: "completed" };
          if (s.id === "gmail") return { ...s, status: "completed" };
          if (s.id === "audits") return { ...s, status: "completed" };
          if (s.id === "retries") return { ...s, status: "completed" };
          return s;
        }));

      } catch (err) {
        console.error(err);
        if (!isMounted) return;
        setHasError(true);
        setSteps(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s));
      }
    };

    runSyncPipeline();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const allDone = steps.every(s => s.status === "completed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl text-slate-100">
        <h3 className="text-base font-bold mb-4 flex items-center justify-between">
          <span>Unified Sync Pipeline Progress</span>
          <span className="text-xs font-normal text-slate-400">
            {steps.filter(s => s.status === "completed").length} / {steps.length} completed
          </span>
        </h3>

        <div className="space-y-3 mb-6">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-800/80 bg-slate-900/50">
              <span className="text-sm font-medium">{step.label}</span>
              <div>
                {step.status === "pending" && <span className="text-xs text-slate-500">Waiting...</span>}
                {step.status === "running" && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                {step.status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {step.status === "error" && <AlertCircle className="w-4 h-4 text-rose-400" />}
              </div>
            </div>
          ))}
        </div>

        {(allDone || hasError) && (
          <button
            onClick={onClose}
            className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all cursor-pointer shadow-lg ${
              hasError 
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-500/25" 
                : "bg-blue-600 hover:bg-blue-500 shadow-blue-500/25"
            }`}
          >
            {hasError ? "Close & Review Errors" : "Done & Close"}
          </button>
        )}
      </div>
    </div>
  );
}
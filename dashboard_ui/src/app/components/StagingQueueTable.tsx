// dashboard_ui/src/app/components/StagingQueueTable.tsx
"use client";

import React, { useEffect, useState } from "react";
import { StagingRecord } from "../types";

interface StagingQueueTableProps {
  stagingQueue: StagingRecord[];
  theme: "dark" | "light" | "system";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  onApprove: (item: StagingRecord) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  onUpload: () => Promise<void>;
}

export default function StagingQueueTable({
  stagingQueue,
  theme,
  t,
  onApprove,
  onReject,
  onUpload,
}: StagingQueueTableProps) {
  const isDark = theme === "dark";

  const [uploading, setUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [editingItem, setEditingItem] = useState<StagingRecord | null>(null);
  const [editForm, setEditForm] = useState({
    provider_name: "",
    utility_type: "",
    bill_amount: "",
    units_consumed: "",
    due_date: "",
    billing_period_start: "",
    billing_period_end: "",
  });

  const getApiBaseUrl = () => {
    const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
    return activeHostname !== "localhost" && activeHostname !== "127.0.0.1"
      ? `http://${activeHostname}:8000`
      : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3500);
  };

  const uploadFiles = async (files: File[] | FileList) => {
    const selectedFiles = Array.isArray(files) ? files : Array.from(files);
    const pdfFiles = selectedFiles.filter((file) => file.name.toLowerCase().endsWith(".pdf"));

    if (pdfFiles.length === 0) {
      showToast("error", "Please upload PDF bills only.");
      return;
    }

    setUploading(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const formData = new FormData();
      pdfFiles.forEach((file) => formData.append("files", file));

      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      showToast("success", `Queued ${pdfFiles.length} file(s) successfully.`);
      await onUpload();
    } catch (err) {
      console.error("Upload error:", err);
      showToast("error", "Upload failed. Check file type and size.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await uploadFiles(files);
    e.target.value = "";
  };

  const handleApproveClick = async (item: StagingRecord) => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/stage-approve/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error("Failed to approve staging item");
      showToast("success", "Bill approved into history.");
      await onApprove(item);
    } catch (err) {
      console.error("Approval error:", err);
      showToast("error", "Approve failed.");
    }
  };

  const handleRejectClick = async (id: number) => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/stage-reject/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to reject staging item");
      showToast("success", "Bill removed from staging.");
      await onReject(id);
    } catch (err) {
      console.error("Rejection error:", err);
      showToast("error", "Reject failed.");
    }
  };

  const handleEditClick = (item: StagingRecord) => {
    setEditingItem(item);
    setEditForm({
      provider_name: item.provider_name || "",
      utility_type: item.utility_type || "",
      bill_amount: item.bill_amount?.toString() || "",
      units_consumed: item.units_consumed?.toString() || "",
      due_date: item.due_date || "",
      billing_period_start: item.billing_period_start || "",
      billing_period_end: item.billing_period_end || "",
    });
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;

    setUploading(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/stage-update/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_name: editForm.provider_name,
          utility_type: editForm.utility_type,
          bill_amount: parseFloat(editForm.bill_amount) || 0,
          units_consumed: parseFloat(editForm.units_consumed) || 0,
          due_date: editForm.due_date,
          billing_period_start: editForm.billing_period_start,
          billing_period_end: editForm.billing_period_end,
        }),
      });

      if (!res.ok) throw new Error("Failed to update staging item");
      showToast("success", "Staging record updated.");
      setEditingItem(null);
      await onUpload();
    } catch (err) {
      console.error("Staging update error:", err);
      showToast("error", "Update failed.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let dragCounter = 0;

    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        dragCounter += 1;
        setIsDragActive(true);
      }
    };

    const onDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        dragCounter -= 1;
        if (dragCounter <= 0) {
          dragCounter = 0;
          setIsDragActive(false);
        }
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragActive(false);
      await uploadFiles(Array.from(e.dataTransfer?.files || []));
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const statusColor = (status: string) => {
    if (status === "AUTO_APPROVED") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
    if (status === "REVIEW_PENDING") return "bg-amber-500/15 text-amber-300 border-amber-500/20";
    if (status === "CONFLICT") return "bg-rose-500/15 text-rose-300 border-rose-500/20";
    if (status === "DUPLICATE") return "bg-slate-500/15 text-slate-200 border-slate-500/20";
    return "bg-slate-500/15 text-slate-200 border-slate-500/20";
  };

  return (
    <div
      className={`relative p-6 rounded-3xl border overflow-hidden transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-[#0b0f19] border-slate-800/80 shadow-2xl shadow-blue-950/20"
          : "bg-white border-slate-200/80 shadow-xl shadow-slate-200/50"
      }`}
    >
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {isDragActive && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-blue-400 bg-blue-500/10 backdrop-blur-sm">
          <div className="text-center py-6 px-8">
            <div className="text-2xl font-bold text-blue-300">Drop PDF bills to stage</div>
            <div className="text-sm text-slate-300 mt-2">Multiple files supported — parsing runs in background</div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-40 rounded-2xl px-4 py-3 shadow-2xl text-sm font-semibold ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            {t.stagingQueue || "Staging Queue (Pending Review)"}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Approve, resolve, or edit extracted PDF bills before pushing them to the permanent ledger.
          </p>
        </div>

        <label className="cursor-pointer px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>{uploading ? "Processing PDF(s)..." : (t.uploadPdf || "Upload Bill PDF")}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} multiple />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead
            className={`uppercase tracking-wider text-[11px] ${
              isDark ? "bg-slate-900/80 text-slate-400 border-b border-slate-800" : "bg-slate-50 text-slate-500 border-b border-slate-200"
            }`}
          >
            <tr>
              <th className="px-6 py-3.5 font-bold">{t.provider || "Provider"}</th>
              <th className="px-6 py-3.5 font-bold">Utility</th>
              <th className="px-6 py-3.5 font-bold">Billing Cycle</th>
              <th className="px-6 py-3.5 font-bold">{t.amount || "Amount"}</th>
              <th className="px-6 py-3.5 font-bold">Consumption</th>
              <th className="px-6 py-3.5 font-bold">Status</th>
              <th className="px-6 py-3.5 font-bold text-right">{t.actions || "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {(!stagingQueue || stagingQueue.length === 0) ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-500 text-xs">
                  No bills currently waiting in the staging queue.
                </td>
              </tr>
            ) : (
              stagingQueue.map((item) => (
                <tr key={item.id} className={`transition-colors ${isDark ? "hover:bg-slate-800/30" : "hover:bg-slate-50"}`}>
                  <td className="px-6 py-4">
                    <span className="font-bold text-white">{item.provider_name}</span>
                    <span className="block text-[10px] text-slate-400">Due: {item.due_date || "N/A"}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-medium">{item.utility_type}</td>
                  <td className="px-6 py-4 text-slate-400 text-[11px]">
                    <span className="block font-semibold text-slate-300">{item.billing_month || "Unknown"} {item.billing_year || ""}</span>
                    {item.billing_period_start && item.billing_period_end ? (
                      <span>{item.billing_period_start} to {item.billing_period_end}</span>
                    ) : (
                      <span>Cycle unavailable</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-extrabold text-blue-400">₹ {item.bill_amount?.toLocaleString("en-IN")}</td>
                  <td className="px-6 py-4 text-slate-300">
                    {item.units_consumed ? (
                      <span className="px-2 py-1 bg-slate-800/80 rounded-md text-[10px] font-bold border border-slate-700">
                        {item.units_consumed} Units
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold ${statusColor(item.extraction_status)}`}>
                      {item.extraction_status || "UNKNOWN"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleEditClick(item)}
                      className="px-3 py-1.5 rounded-lg bg-slate-700/10 hover:bg-slate-700/20 text-slate-200 border border-slate-600/20 text-xs font-bold transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleApproveClick(item)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-colors"
                    >
                      {t.approve || "Approve"}
                    </button>
                    <button
                      onClick={() => handleRejectClick(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-colors"
                    >
                      {t.reject || "Reject"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className={`w-full max-w-2xl rounded-3xl border p-6 shadow-2xl ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Edit Staging Record</h3>
                <p className="text-xs text-slate-400">Override parsed values before approval.</p>
              </div>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-400">
                  Provider
                  <input
                    type="text"
                    value={editForm.provider_name}
                    onChange={(e) => setEditForm({ ...editForm, provider_name: e.target.value })}
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    required
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-400">
                  Utility Type
                  <input
                    type="text"
                    value={editForm.utility_type}
                    onChange={(e) => setEditForm({ ...editForm, utility_type: e.target.value })}
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-xs font-semibold text-slate-400">
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.bill_amount}
                    onChange={(e) => setEditForm({ ...editForm, bill_amount: e.target.value })}
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    required
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-400">
                  Units
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.units_consumed}
                    onChange={(e) => setEditForm({ ...editForm, units_consumed: e.target.value })}
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-xs font-semibold text-slate-400">
                  Due Date
                  <input
                    type="date"
                    value={editForm.due_date}
                    onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    required
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-400">
                  Period Start
                  <input
                    type="date"
                    value={editForm.billing_period_start}
                    onChange={(e) => setEditForm({ ...editForm, billing_period_start: e.target.value })}
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    required
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-400">
                  Period End
                  <input
                    type="date"
                    value={editForm.billing_period_end}
                    onChange={(e) => setEditForm({ ...editForm, billing_period_end: e.target.value })}
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    required
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-2xl border px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {uploading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
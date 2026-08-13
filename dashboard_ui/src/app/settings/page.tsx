"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { getApiBaseUrl } from "../lib/api";


export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/v1/settings`);
        const data = await res.json();
        if (data?.settings) setSettings(data.settings);
      } catch (err) {
        console.error("Settings load error:", err);
      }
    };
    load();
  }, []);

  const handleChange = (section: string, key: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      [section]: {
        ...prev?.[section],
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setMessage("Settings saved successfully.");
      } else {
        setMessage("Failed to save settings.");
      }
    } catch (err) {
      console.error("Settings save error:", err);
      setMessage("Save failed.");
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(""), 4000);
    }
  };

  const handleBackup = () => {
    const payload = {
      settings,
      reminderRules: localStorage.getItem("family-reminder-rules") || "",
      auditLog: localStorage.getItem("family-audit-log") || "[]",
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "family-dashboard-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Application Settings</h1>
            <p className="text-sm text-slate-400">Edit runtime parser, upload, and message template values.</p>
          </div>
          <Link href="/">
            <button className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/60">
              Back to dashboard
            </button>
          </Link>
        </div>

        {/* Upload / Parser Settings Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-4">Upload / Parser Settings</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-slate-400">Max bill upload size (MB)</span>
              <input
                type="number"
                min={1}
                value={settings.upload?.max_file_size_mb || 2}
                onChange={(e) => handleChange("upload", "max_file_size_mb", Number(e.target.value))}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-slate-400">Auto-approve confidence threshold</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={settings.upload?.confidence_threshold || 0.8}
                onChange={(e) => handleChange("upload", "confidence_threshold", Number(e.target.value))}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          </div>
        </div>

        {/* Message Templates Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-4">Message Templates</h2>
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="text-slate-400">Due date notification</span>
              <textarea
                value={settings.message_templates?.due_date_alert || ""}
                onChange={(e) => handleChange("message_templates", "due_date_alert", e.target.value)}
                className="mt-2 w-full min-h-[100px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Payment confirmed notification</span>
              <textarea
                value={settings.message_templates?.payment_confirmed || ""}
                onChange={(e) => handleChange("message_templates", "payment_confirmed", e.target.value)}
                className="mt-2 w-full min-h-[100px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Conflict notification</span>
              <textarea
                value={settings.message_templates?.conflict_notice || ""}
                onChange={(e) => handleChange("message_templates", "conflict_notice", e.target.value)}
                className="mt-2 w-full min-h-[100px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100"
              />
            </label>
          </div>
        </div>

        {/* Storage Template Settings Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-1">Storage & File Naming Template</h2>
          <p className="text-xs text-slate-400 mb-4">
            Configure how your downloaded bills are structured on disk. Available tokens: <code className="text-blue-400">{"{{year}}"}</code>, <code className="text-blue-400">{"{{month}}"}</code>, <code className="text-blue-400">{"{{provider}}"}</code>.
          </p>
          
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-slate-400">Filename Template Pattern</span>
              <input
                type="text"
                value={settings.storage?.filename_template || "{{year}}_{{month}}_{{provider}}.pdf"}
                onChange={(e) => handleChange("storage", "filename_template", e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 font-mono text-sm"
              />
            </label>
          </div>
          
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                setSaving(true);
                setMessage("");
                try {
                  await fetch(`${getApiBaseUrl()}/api/v1/settings`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(settings),
                  });

                  const res = await fetch(`${getApiBaseUrl()}/api/v1/settings/storage-migration`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename_template: settings.storage?.filename_template || "{{year}}_{{month}}_{{provider}}.pdf" })
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setMessage("✅ " + data.message);
                  } else {
                    setMessage("❌ Failed to run migration: " + (data.detail || "Unknown error"));
                  }
                } catch (err) {
                  console.error("Migration trigger error:", err);
                  setMessage("❌ Migration trigger failed.");
                } finally {
                  setSaving(false);
                  window.setTimeout(() => setMessage(""), 5000);
                }
              }}
              disabled={saving}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Processing..." : "Save Template & Run Migration"}
            </button>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-slate-400">{message}</div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save settings"}
            </button>
            <button
              onClick={handleBackup}
              className="rounded-2xl border border-slate-700 px-6 py-3 text-sm text-slate-200 hover:bg-slate-800/60"
            >
              Create backup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
// dashboard_ui/src/app/components/NotificationCenter.tsx
"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { Bell } from "lucide-react"; // <-- Add this import
import { getApiBaseUrl } from "../lib/api";

interface NotificationCenterProps {
  theme: "dark" | "light" | "system";
}

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read: boolean;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export default function NotificationCenter({ theme }: NotificationCenterProps) {
  const isDark = theme === "dark";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [permissionState, setPermissionState] = useState("default");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem("family-dashboard-notifications");
    if (saved) {
      setItems(JSON.parse(saved));
    } else {
      const seeded = [
        {
          id: "seed-1",
          title: "System ready",
          message: "Notifications are ready for laptop and mobile.",
          read: false,
        },
      ];
      setItems(seeded);
      window.localStorage.setItem("family-dashboard-notifications", JSON.stringify(seeded));
    }

    if ("Notification" in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "family-dashboard-notifications" && e.newValue) {
        setItems(JSON.parse(e.newValue));
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("family-dashboard-notifications", JSON.stringify(items));
    }
  }, [items]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((prev) => !prev);
  };

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Notifications not supported on this device/browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== "granted") {
        alert("Notification permission denied.");
        return;
      }

      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
          
          if (vapidPublicKey) {
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });

            await fetch(`${getApiBaseUrl()}/api/v1/notifications/push-subscribe`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(subscription),
            });
          }
        } catch (swErr) {
          console.warn("Service worker push subscription skipped/failed on mobile:", swErr);
        }
      }

      new Notification("Alerts enabled", { body: "You will now receive updates on this device." });
    } catch (err) {
      console.error("Permission/subscribe error:", err);
      alert("Could not enable notifications. Ensure you are using a secure context (HTTPS/Local IP).");
    }
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer relative ${
          isDark
            ? "border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-slate-200"
            : "border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700"
        }`}
        aria-label="Open notifications"
        title="Notifications"
      >
        {/* Replaced emoji with Lucide Icon */}
        <Bell size={18} />
        
        {/* Sleek minimal red dot (replaces the numbered badge) */}
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-slate-100 dark:border-slate-900"></span>
        )}
      </button>

      {open && (
        <div 
          style={{ top: `${dropdownPosition.top}px`, right: `${dropdownPosition.right}px` }}
          className="fixed w-80 sm:w-96 rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl z-[9999] animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Recent activity</h4>
            <button className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer" onClick={markAllRead}>
              Mark all read
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {items.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No activity yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-2.5">
                  <p className="text-xs font-bold text-slate-100">{item.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.message}</p>
                </div>
              ))
            )}
          </div>

          <button
            onClick={requestPermission}
            className="mt-3 w-full rounded-xl border border-slate-700 px-3 py-2 text-center text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all cursor-pointer"
          >
            {permissionState === "granted" ? "Alerts enabled" : "Enable browser alerts"}
          </button>
        </div>
      )}
    </div>
  );
}

export const pushWhatsAppNotificationToCenter = (title: string, message: string) => {
  if (typeof window === "undefined") return;
  const existing = JSON.parse(window.localStorage.getItem("family-dashboard-notifications") || "[]");
  const newItem = {
    id: `wa-${Date.now()}`,
    title: `💬 WhatsApp: ${title}`,
    message: `${message} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
    read: false,
  };
  const updated = [newItem, ...existing];
  window.localStorage.setItem("family-dashboard-notifications", JSON.stringify(updated));
  window.dispatchEvent(new Event("storage"));
};
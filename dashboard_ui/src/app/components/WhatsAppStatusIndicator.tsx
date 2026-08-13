"use client";

import React, { useState, useEffect } from "react";
import { getApiBaseUrl } from "../lib/api";

export default function WhatsAppStatusIndicator() {
  const [isOnline, setIsOnline] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const dashboardUrl = "http://localhost:8080/manager/instance/3a5cf3f9-258c-406f-ae17-59bb0c132a87/dashboard";

  useEffect(() => {
    const checkInstanceStatus = async () => {
      try {
        const apiBaseUrl = getApiBaseUrl();
        const res = await fetch(`${apiBaseUrl}/api/v1/whatsapp/status`);
        
        if (!res.ok) throw new Error("Network response was not ok");
        
        const data = await res.json();
        console.log("WhatsApp status payload:", data);

        // Adjust these keys based on what your Evolution API / FastAPI backend actually returns
        const online = 
          data.connected === true || 
          data.status === "open" || 
          data.state === "open" || 
          data.instance?.state === "open" ||
          data.connectionState === "open";

        setIsOnline(online);
      } catch (error) {
        console.error("Failed to fetch WA status:", error);
        setIsOnline(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkInstanceStatus();
    const interval = setInterval(checkInstanceStatus, 15000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <a 
      href={dashboardUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center space-x-3 px-4 py-1.5 rounded-full border bg-slate-800/60 border-slate-700 hover:bg-slate-700 hover:border-slate-600 transition-all cursor-pointer shadow-sm"
      title="Open WhatsApp Manager"
    >
      <span className="relative flex h-3 w-3 items-center justify-center">
        {/* Outer glowing halo ring that matches current state */}
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
          isOnline ? 'bg-emerald-400' : 'bg-rose-500'
        }`}></span>
        
        {/* Core glowing dot that switches between green and red */}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 shadow-[0_0_10px] animate-pulse ${
          isChecking 
            ? 'bg-amber-400 shadow-amber-400' 
            : isOnline 
              ? 'bg-emerald-500 shadow-emerald-500' 
              : 'bg-rose-500 shadow-rose-500'
        }`}></span>
      </span>
      
      <span className="text-sm font-semibold tracking-wide text-slate-200">
        {isChecking ? "Checking..." : "WhatsApp"}
      </span>
    </a>
  );
}
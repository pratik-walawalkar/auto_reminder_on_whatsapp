// app/lib/offlineStorage.ts
type DashboardSnapshot = {
  metrics: any;
  history: any[];
  stagingQueue: any[];
  savedAt: string;
};

export const saveDashboardSnapshot = (snapshot: DashboardSnapshot) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("family-dashboard-snapshot", JSON.stringify(snapshot));
};

export const loadDashboardSnapshot = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("family-dashboard-snapshot");
  return raw ? JSON.parse(raw) : null;
};

export const queuePendingAction = (action: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  const existing = JSON.parse(localStorage.getItem("family-dashboard-pending-actions") || "[]");
  existing.push({ ...action, createdAt: new Date().toISOString() });
  localStorage.setItem("family-dashboard-pending-actions", JSON.stringify(existing));
};

export const getPendingActions = () => {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("family-dashboard-pending-actions") || "[]");
};
// app/lib/api.ts
export const getApiBaseUrl = () => {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";

  if (isLocal) {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  }

  return `http://${host}:8000`;
};

export const buildApiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

export const apiFetch = async (path: string, options: RequestInit = {}) => {
  const url = buildApiUrl(path);
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
};
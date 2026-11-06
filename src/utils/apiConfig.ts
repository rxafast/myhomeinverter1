/**
 * API configuration and safe network helpers supporting:
 * 1. Full-Stack Node.js runtime (Express backend)
 * 2. Static GitHub Pages hosting (relative routing with optional proxy backend or resilient fallback)
 */

export function getApiUrl(endpoint: string): string {
  try {
    const custom = localStorage.getItem('iz_backend_api_url')?.trim();
    const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
    const base = custom || envBase || '';
    if (base) {
      const cleanBase = base.replace(/\/+$/, '');
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${cleanBase}${cleanEndpoint}`;
    }
  } catch {}
  return endpoint;
}

export async function fetchJsonSafely<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const cType = res.headers.get('content-type') || '';
    if (!cType.includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

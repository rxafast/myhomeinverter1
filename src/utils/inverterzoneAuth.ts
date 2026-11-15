import { ParsedTelemetry, RawInverterTelemetry } from '../types/inverter';
import { getApiUrl } from './apiConfig';
import { parseRawTelemetry } from './telemetry';

export interface InverterZoneAccountSession {
  token: string;
  email: string;
  userName?: string;
  clientDeviceId: string;
  loggedInAt: number;
}

export interface InverterZoneDashboardStats {
  devicesCount: number;
  timerCount: number;
  nearByCount: number;
  favCount: number;
  onlineCount: number;
  liveSolarW: number;
  liveLoadW: number;
  liveGridW: number;
  liveBattW: number;
  userEmail?: string;
  userName?: string;
}

export interface InverterZoneAccountDevice {
  mac: string;
  name: string;
  ratedWatts: number;
  pvInstalled: number;
  latitude?: number;
  longitude?: number;
  favorite: boolean;
  firmware?: string;
  model?: string;
}

export interface InverterZoneNearbyItem {
  mac: string;
  name: string;
  brand?: string;
  model?: string;
  version?: string;
  online: boolean;
  productionW: number;
  loadW: number;
  pvCapacityW: number;
  acRatingW: number;
  distanceKm: number | null;
  location?: string;
}

export interface GeoCenterPreset {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

export const REGION_PRESETS: GeoCenterPreset[] = [
  { id: 'lahore', label: 'Lahore', lat: 31.5204, lon: 74.3587 },
  { id: 'islamabad', label: 'Islamabad / Rwp', lat: 33.6844, lon: 73.0479 },
  { id: 'karachi', label: 'Karachi', lat: 24.8607, lon: 67.0011 },
  { id: 'faisalabad', label: 'Faisalabad', lat: 31.4504, lon: 73.135 },
  { id: 'multan', label: 'Multan', lat: 30.1575, lon: 71.5249 },
  { id: 'peshawar', label: 'Peshawar', lat: 34.0151, lon: 71.5249 },
];

const SESSION_STORAGE_KEY = 'iz_account_session_v1';
const CLIENT_ID_STORAGE_KEY = 'iz_web_client_id_v1';
const NEARBY_CENTER_STORAGE_KEY = 'iz_nearby_center_v1';

function getOrCreateClientDeviceId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && existing.length >= 6) return existing;
    const generated = `web-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'web-dashboard-client';
  }
}

export function loadAccountSession(): InverterZoneAccountSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InverterZoneAccountSession>;
    if (parsed && typeof parsed.token === 'string' && parsed.token.length > 0) {
      return {
        token: parsed.token,
        email: parsed.email || '',
        userName: parsed.userName,
        clientDeviceId: parsed.clientDeviceId || getOrCreateClientDeviceId(),
        loggedInAt: parsed.loggedInAt || Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAccountSession(session: InverterZoneAccountSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedGeoCenter(): { lat: number; lon: number; label: string } {
  try {
    const raw = localStorage.getItem(NEARBY_CENTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { lat?: number; lon?: number; label?: string };
      if (
        typeof parsed.lat === 'number' &&
        typeof parsed.lon === 'number' &&
        Number.isFinite(parsed.lat) &&
        Number.isFinite(parsed.lon)
      ) {
        return { lat: parsed.lat, lon: parsed.lon, label: parsed.label || 'Custom Location' };
      }
    }
  } catch {}
  return { lat: REGION_PRESETS[0].lat, lon: REGION_PRESETS[0].lon, label: REGION_PRESETS[0].label };
}

export function saveGeoCenter(center: { lat: number; lon: number; label: string }): void {
  try {
    localStorage.setItem(NEARBY_CENTER_STORAGE_KEY, JSON.stringify(center));
  } catch {}
}

async function safeParseJsonResponse<T>(res: Response): Promise<T | null> {
  const rawText = (await res.text()).trim();
  if (!rawText || rawText === 'null') {
    return null;
  }
  return JSON.parse(rawText) as T;
}

async function postInverterZoneApi<T>(
  proxyPath: string,
  directUrl: string,
  body: Record<string, unknown>
): Promise<T | null> {
  // 1. Try local Express proxy when running full-stack
  try {
    const proxyRes = await fetch(getApiUrl(proxyPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const cType = proxyRes.headers.get('content-type') || '';
    if (proxyRes.ok && cType.includes('application/json')) {
      const json = await safeParseJsonResponse<{ ok?: boolean; data?: T; error?: string } & T>(
        proxyRes
      );
      if (json && typeof json === 'object' && 'ok' in json) {
        if (json.ok === false) {
          throw new Error(json.error || 'InverterZone request failed');
        }
        return json.data ?? null;
      }
      return json;
    }
  } catch {
    // Fall through on static host 404 / proxy unreachable / transient error
  }

  // 2. Direct browser CORS request (works on GitHub Pages & static hosts)
  const directRes = await fetch(directUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });

  if (!directRes.ok) {
    throw new Error(`InverterZone returned HTTP ${directRes.status}`);
  }
  return await safeParseJsonResponse<T>(directRes);
}

export async function loginInverterZoneAccount(
  email: string,
  password: string
): Promise<InverterZoneAccountSession> {
  const cleanEmail = email.trim();
  const clientDeviceId = getOrCreateClientDeviceId();
  const payload = await postInverterZoneApi<{
    code?: string;
    msg?: string;
    token?: string;
    userName?: string;
    name?: string;
  }>('/api/iz/login', 'https://inverterzone.com/api/login', {
    email: cleanEmail,
    password,
    deviceId: clientDeviceId,
    deviceName: 'InverterZone Web Dashboard',
  });

  if (!payload || payload.code !== 'Y' || !payload.token) {
    throw new Error(payload?.msg || 'Invalid InverterZone email or password.');
  }

  const session: InverterZoneAccountSession = {
    token: payload.token,
    email: cleanEmail,
    userName: payload.userName || payload.name,
    clientDeviceId,
    loggedInAt: Date.now(),
  };
  saveAccountSession(session);
  return session;
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchInverterZoneDashboard(
  token: string
): Promise<InverterZoneDashboardStats> {
  const raw =
    (await postInverterZoneApi<Record<string, unknown>>(
      '/api/iz/dashboard',
      'https://inverterzone.com/api/dashboard',
      { token }
    )) ?? {};

  return {
    devicesCount: toNum(raw.devicesCount),
    timerCount: toNum(raw.timerCount),
    nearByCount: toNum(raw.nearByCount),
    favCount: toNum(raw.favCount),
    onlineCount: toNum(raw.onlineCount),
    liveSolarW: toNum(raw.liveSolarW),
    liveLoadW: toNum(raw.liveLoadW),
    liveGridW: toNum(raw.liveGridW),
    liveBattW: toNum(raw.liveBattW),
    userEmail: typeof raw.userEmail === 'string' ? raw.userEmail : undefined,
    userName: typeof raw.userName === 'string' ? raw.userName : undefined,
  };
}

function normalizeAccountDeviceRecord(item: Record<string, unknown>): InverterZoneAccountDevice | null {
  const rawMac = item.mac ?? item.deviceId ?? item.id;
  if (typeof rawMac !== 'string' || !rawMac.trim()) return null;
  const mac = rawMac.trim().toUpperCase();
  const rawName = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : mac;
  const ratedWatts = Math.max(500, toNum(item.rateWatt ?? item.ratedWatts ?? item.capacity, 10000));
  const pvInstalled = Math.max(500, toNum(item.pvWatt ?? item.pvInstalled, ratedWatts));
  const lat = toNum(item.latitude ?? item.lat, NaN);
  const lon = toNum(item.longitude ?? item.lon ?? item.lng, NaN);

  return {
    mac,
    name: rawName,
    ratedWatts,
    pvInstalled,
    latitude: Number.isFinite(lat) && lat !== 0 ? lat : undefined,
    longitude: Number.isFinite(lon) && lon !== 0 ? lon : undefined,
    favorite: Boolean(item.fav ?? item.favorite ?? item.isFav),
    firmware: typeof item.fw === 'string' ? item.fw : typeof item.firmware === 'string' ? item.firmware : undefined,
    model: typeof item.model === 'string' ? item.model : undefined,
  };
}

export async function fetchInverterZoneAccountDevices(
  token: string
): Promise<InverterZoneAccountDevice[]> {
  const collected: InverterZoneAccountDevice[] = [];
  const seen = new Set<string>();

  try {
    const moreRes = await postInverterZoneApi<{ data?: unknown[] } | unknown[]>(
      '/api/iz/devices',
      'https://inverterzone.com/api/devicesMore',
      { token, pageNumber: '1' }
    );
    const rows = Array.isArray(moreRes)
      ? moreRes
      : Array.isArray(moreRes?.data)
        ? moreRes.data
        : [];
    for (const row of rows) {
      if (row && typeof row === 'object') {
        const dev = normalizeAccountDeviceRecord(row as Record<string, unknown>);
        if (dev && !seen.has(dev.mac)) {
          seen.add(dev.mac);
          collected.push(dev);
        }
      }
    }
  } catch {
    // Fallback to /api/devices if devicesMore fails
  }

  if (collected.length === 0) {
    try {
      const listRes = await postInverterZoneApi<{ data?: unknown[] } | unknown[]>(
        '/api/iz/devices-all',
        'https://inverterzone.com/api/devices',
        { token }
      );
      const rows = Array.isArray(listRes)
        ? listRes
        : Array.isArray(listRes?.data)
          ? listRes.data
          : [];
      for (const row of rows) {
        if (row && typeof row === 'object') {
          const dev = normalizeAccountDeviceRecord(row as Record<string, unknown>);
          if (dev && !seen.has(dev.mac)) {
            seen.add(dev.mac);
            collected.push(dev);
          }
        }
      }
    } catch {
      // Ignore if unavailable
    }
  }

  return collected;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseInstalledPvWatts(raw: Record<string, unknown>): number {
  const cap = toNum(raw.pvCapacityW, 0);
  if (cap > 0) return cap;
  const installedStr = String(raw.installedPv ?? '');
  const m = installedStr.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const val = Number(m[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  const ac = parseAcRatingWatts(raw);
  return ac > 0 ? ac : 10000;
}

function parseAcRatingWatts(raw: Record<string, unknown>): number {
  const acStr = String(raw.acRatingW ?? '').replace(/[^0-9.]/g, '');
  if (acStr) {
    const val = Number(acStr);
    if (Number.isFinite(val) && val > 0) return val;
  }
  const modelStr = String(raw.model ?? '');
  const m = modelStr.match(/(\d{4,5})/);
  if (m) {
    const val = Number(m[1]);
    if (Number.isFinite(val) && val >= 1000) return val;
  }
  return 10000;
}

export async function fetchInverterZoneNearbyDevices(options: {
  token: string;
  lat: number;
  lng: number;
  pageNumber?: number;
  sort?: 'distance' | 'production';
  search?: string;
}): Promise<{ items: InverterZoneNearbyItem[]; nextPage: number | null }> {
  const { token, lat, lng, pageNumber = 1, sort = 'distance', search = '' } = options;
  const cleanSearch = search.trim();
  const isSearch = cleanSearch.length > 0;

  const proxyPath = isSearch ? '/api/iz/nearby-search' : '/api/iz/nearby';
  const directUrl = isSearch
    ? 'https://inverterzone.com/api/getExploreDevicesSearch'
    : 'https://inverterzone.com/api/nearby';

  const body: Record<string, unknown> = {
    token,
    pageNumber: String(pageNumber),
    lat,
    lng,
    ...(isSearch ? { search: cleanSearch } : { sort }),
  };

  const raw = await postInverterZoneApi<{ data?: unknown[]; pageNumber?: number } | unknown[]>(
    proxyPath,
    directUrl,
    body
  );

  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw.data)
      ? raw.data
      : [];

  const nextPage =
    raw && !Array.isArray(raw) && typeof raw.pageNumber === 'number' && rows.length > 0
      ? raw.pageNumber
      : null;

  const seen = new Set<string>();
  const items: InverterZoneNearbyItem[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const mac = String(obj.mac ?? obj.deviceId ?? '').trim().toUpperCase();
    if (!mac || seen.has(mac)) continue;
    seen.add(mac);

    const acRatingW = parseAcRatingWatts(obj);
    const pvCapacityW = parseInstalledPvWatts(obj);
    const distRaw = obj.distanceKm;
    const distanceKm =
      typeof distRaw === 'number' && Number.isFinite(distRaw)
        ? distRaw
        : distRaw != null && Number.isFinite(Number(distRaw))
          ? Number(distRaw)
          : null;

    items.push({
      mac,
      name:
        typeof obj.name === 'string' && obj.name.trim()
          ? obj.name.trim()
          : `Plant ${mac.slice(-6)}`,
      brand: typeof obj.brand === 'string' && obj.brand.trim() ? obj.brand.trim() : undefined,
      model: typeof obj.model === 'string' && obj.model.trim() ? obj.model.trim() : undefined,
      version: typeof obj.version === 'string' && obj.version.trim() ? obj.version.trim() : undefined,
      online: obj.online === 'Y' || obj.online === true || toNum(obj.production, 0) > 0,
      productionW: Math.max(0, Math.round(toNum(obj.production, 0))),
      loadW: Math.max(0, Math.round(toNum(obj.load, 0))),
      pvCapacityW,
      acRatingW,
      distanceKm,
      location:
        typeof obj.location === 'string' && obj.location.trim() ? obj.location.trim() : undefined,
    });
  }

  return { items, nextPage };
}

export async function fetchLiveRealtimeForMac(mac: string): Promise<{
  telemetry: ParsedTelemetry;
  raw: RawInverterTelemetry & Record<string, unknown>;
} | null> {
  const cleanMac = mac.trim().toUpperCase();
  if (!cleanMac) return null;

  try {
    const proxyRes = await fetch(getApiUrl('/api/realtime'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: cleanMac }),
    });
    const cType = proxyRes.headers.get('content-type') || '';
    if (proxyRes.ok && cType.includes('application/json')) {
      const json = (await proxyRes.json()) as {
        ok?: boolean;
        fetchedAt?: number;
        latencyMs?: number;
        stale?: boolean;
        telemetry?: RawInverterTelemetry & Record<string, unknown>;
        mpptSummary?: Parameters<typeof parseRawTelemetry>[4];
      };
      if (json.ok && json.telemetry) {
        return {
          telemetry: parseRawTelemetry(
            json.telemetry,
            json.fetchedAt ?? Date.now(),
            Boolean(json.stale),
            json.latencyMs ?? 250,
            json.mpptSummary ?? null
          ),
          raw: json.telemetry,
        };
      }
    }
  } catch {
    // Fall through to direct cloud CORS fetch
  }

  try {
    const directUrl = `https://inverterzone.com/data-api/getRealtimeData?deviceId=${encodeURIComponent(cleanMac)}`;
    const res = await fetch(directUrl, { method: 'POST' });
    if (!res.ok) return null;
    const raw = await safeParseJsonResponse<RawInverterTelemetry & Record<string, unknown>>(res);
    if (!raw || typeof raw !== 'object') return null;
    return {
      telemetry: parseRawTelemetry(raw, Date.now(), false, 240, null),
      raw,
    };
  } catch {
    return null;
  }
}

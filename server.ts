import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CloudPeriod = 'T' | 'Y' | 'TM' | 'LM' | 'TY' | 'LY';
type ChartHoursWindow = 1 | 2 | 4 | 6;

interface CachedDevicePayload {
  data: Record<string, unknown>;
  fetchedAt: number;
  latencyMs: number;
}

interface StoredSample {
  timestamp: number;
  label: string;
  solarWatts: number;
  loadWatts: number;
  loadVa: number;
  gridWatts: number;
  batteryWatts: number;
  gridVoltage: number;
  loadVoltage: number;
  gridHz: number;
  mpptTemperature: number;
  fanSpeed: number;
}

interface CloudEnergySummary {
  period: CloudPeriod;
  todaySolar: number;
  todayGrid: number;
  todayNetGrid: number;
  todayNetSolar: number;
  todayBattery: number;
  todaySolarBattery: number;
  todayGridBattery: number;
  todayTotal: number;
  todayLoad: number;
  rate: number;
  fetchedAt: number;
}

interface CloudChartPoint {
  time: string;
  label: string;
  datePart: string;
  timestamp: number;
  solarW: number;
  acOutW: number;
  acOutVa: number;
  gridW: number;
  solarV: number;
  solarA: number;
  battV: number;
  battPercent: number;
  battChargeA: number;
  battDischargeA: number;
  gridV: number;
  acOutV: number;
  gridHz: number;
  heatSinkDegC: number;
  solarW1: number;
  solarV1: number;
  solarA1: number;
  solarW2: number;
  solarV2: number;
  solarA2: number;
}

interface CachedChartDataEntry {
  chart: CloudChartPoint[];
  chart24: CloudChartPoint[];
  chartMonth: CloudChartPoint[];
  monthStats: Array<CloudEnergySummary & { time?: string }>;
  fetchedAt: number;
}

interface CachedChartHoursEntry {
  chart: CloudChartPoint[];
  fetchedAt: number;
}

interface CachedExtendedDiagnostics {
  payload: Record<string, unknown>;
  fetchedAt: number;
}

interface PersistedCloudLabDeviceState {
  locationCity?: string;
  lastHealthReport?: Record<string, unknown> | null;
  lastForecastReport?: Record<string, unknown> | null;
  smartRules?: Array<Record<string, unknown>>;
  qaHistory?: Array<{ id: string; question: string; answer: string; askedAt: number }>;
}

interface PersistedServerState {
  devices?: Array<{ id?: string } & Record<string, unknown>>;
  timers?: unknown[];
  thresholds?: Record<string, unknown>;
  historyByDevice?: Record<string, StoredSample[]>;
  cloudEnergyByDevice?: Record<string, Partial<Record<CloudPeriod, CloudEnergySummary>>>;
  cloudChartHoursByDevice?: Record<string, Partial<Record<string, CachedChartHoursEntry>>>;
  cloudChartDataByDevice?: Record<string, Partial<Record<CloudPeriod, CachedChartDataEntry>>>;
  extendedDiagByDevice?: Record<string, CachedExtendedDiagnostics>;
  cloudLabByDevice?: Record<string, PersistedCloudLabDeviceState>;
  updatedAt?: number;
}

const INVERTERZONE_REALTIME_URL = 'https://inverterzone.com/data-api/getRealtimeData';
const INVERTERZONE_EXTENDED_REALTIME_URL = 'https://inverterzone.com/api/getRealtimeData';
const INVERTERZONE_CLOUD_SETTINGS_URL = 'https://inverterzone.com/api/getSettingsData';
const INVERTERZONE_PANEL_COMPANIES_URL = 'https://inverterzone.com/api/getPanelCompanies';
const INVERTERZONE_ENERGY_URL = 'https://inverterzone.com/api/getEnergy';
const INVERTERZONE_CHART_HOURS_URL = 'https://inverterzone.com/api/realtimeChartHours';
const INVERTERZONE_CHART_DATA_URL = 'https://inverterzone.com/api/realtimeChartData';

const MIN_UPSTREAM_SPACING_MS = 1850;
const REALTIME_CACHE_TTL_MS = 4000;
const EXTENDED_DIAG_TTL_MS = 15 * 1000;
const PANEL_COMPANIES_TTL_MS = 12 * 3600 * 1000;
const STALE_FALLBACK_MAX_AGE_MS = 30 * 60 * 1000;
const TODAY_ENERGY_TTL_MS = 45 * 1000;
const HISTORICAL_ENERGY_TTL_MS = 5 * 60 * 1000;
const CHART_HOURS_TTL_MS = 45 * 1000;

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'dashboard-state.json');

const deviceCache = new Map<string, CachedDevicePayload>();
const cloudEnergyMemCache = new Map<string, CloudEnergySummary>();
const cloudChartHoursMemCache = new Map<string, CachedChartHoursEntry>();
const cloudChartDataMemCache = new Map<string, CachedChartDataEntry>();
const extendedDiagMemCache = new Map<string, CachedExtendedDiagnostics>();
let panelCompaniesCache: { items: Array<{ label: string; value: string }>; fetchedAt: number } | null =
  null;
const inFlightMap = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPersistedState(): PersistedServerState {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as PersistedServerState;
  } catch {
    return {};
  }
}

function writePersistedState(state: PersistedServerState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Ignore write errors on read-only filesystems
  }
}

/* Hydrate memory caches from persisted disk state on boot */
(function hydrateFromDisk() {
  const persisted = readPersistedState();
  if (persisted.cloudEnergyByDevice) {
    for (const [devId, byPeriod] of Object.entries(persisted.cloudEnergyByDevice)) {
      if (!byPeriod) continue;
      for (const [p, entry] of Object.entries(byPeriod)) {
        if (entry) cloudEnergyMemCache.set(`${devId}:${p}`, entry);
      }
    }
  }
  if (persisted.cloudChartHoursByDevice) {
    for (const [devId, byHrs] of Object.entries(persisted.cloudChartHoursByDevice)) {
      if (!byHrs) continue;
      for (const [hrs, entry] of Object.entries(byHrs)) {
        if (entry) cloudChartHoursMemCache.set(`${devId}:${hrs}`, entry);
      }
    }
  }
  if (persisted.cloudChartDataByDevice) {
    for (const [devId, byPeriod] of Object.entries(persisted.cloudChartDataByDevice)) {
      if (!byPeriod) continue;
      for (const [p, entry] of Object.entries(byPeriod)) {
        if (entry) cloudChartDataMemCache.set(`${devId}:${p}`, entry);
      }
    }
  }
  if (persisted.extendedDiagByDevice) {
    for (const [devId, entry] of Object.entries(persisted.extendedDiagByDevice)) {
      if (entry) extendedDiagMemCache.set(devId, entry);
    }
  }
})();

/* Priority-Aware Global Upstream Queue to Prevent Cloudflare/Nginx 503 Rate Limits */
interface QueuedTask<T> {
  priority: 'high' | 'low';
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const taskQueue: Array<QueuedTask<unknown>> = [];
let queueDraining = false;
let lastUpstreamStartedAt = 0;

function scheduleUpstreamRequest<T>(
  priority: 'high' | 'low',
  fn: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const item: QueuedTask<unknown> = {
      priority,
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    };
    if (priority === 'high') {
      const firstLowIdx = taskQueue.findIndex((t) => t.priority === 'low');
      if (firstLowIdx === -1) {
        taskQueue.push(item);
      } else {
        taskQueue.splice(firstLowIdx, 0, item);
      }
    } else {
      taskQueue.push(item);
    }
    void drainUpstreamQueue();
  });
}

async function drainUpstreamQueue(): Promise<void> {
  if (queueDraining) return;
  queueDraining = true;
  try {
    while (taskQueue.length > 0) {
      const nextTask = taskQueue.shift()!;
      const elapsed = Date.now() - lastUpstreamStartedAt;
      if (elapsed < MIN_UPSTREAM_SPACING_MS) {
        await sleep(MIN_UPSTREAM_SPACING_MS - elapsed);
      }
      lastUpstreamStartedAt = Date.now();
      try {
        const res = await nextTask.fn();
        nextTask.resolve(res);
      } catch (err) {
        nextTask.reject(err);
      }
    }
  } finally {
    queueDraining = false;
  }
}

async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  priority: 'high' | 'low' = 'high'
): Promise<{ data: T; latencyMs: number }> {
  return scheduleUpstreamRequest(priority, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 11_000);
      const startedAt = Date.now();
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': 'InverterZone-Dashboard/1.0',
            ...(init.headers ?? {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const latencyMs = Math.max(25, Date.now() - startedAt);

        if (response.status === 503 && attempt < 2) {
          await sleep(2100);
          lastUpstreamStartedAt = Date.now();
          continue;
        }

        if (!response.ok) {
          throw new Error(`Upstream API returned HTTP ${response.status}`);
        }

        const rawText = await response.text();
        if (!rawText || !rawText.trim()) {
          throw new Error('Empty response from InverterZone Cloud API.');
        }

        const parsed = JSON.parse(rawText) as T;
        return { data: parsed, latencyMs };
      } catch (err) {
        clearTimeout(timeout);
        if (attempt < 2) {
          await sleep(1800);
          lastUpstreamStartedAt = Date.now();
          continue;
        }
        throw err;
      }
    }
    throw new Error('Unable to reach InverterZone Cloud API');
  });
}

function toNum(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseCloudTimestamp(rawTime: unknown, rawTimeDate: unknown): {
  time: string;
  datePart: string;
  label: string;
  timestamp: number;
} {
  const timeStr = typeof rawTime === 'string' && rawTime.trim() ? rawTime.trim() : '';
  const [dPart = '', tPart = ''] = timeStr.split(/\s+/);
  const hhmm = tPart ? tPart.slice(0, 5) : '';

  let epochMs = 0;
  const numericTd = toNum(rawTimeDate, 0);
  if (numericTd > 1_000_000_000_000) {
    epochMs = Math.round(numericTd);
  } else if (numericTd > 1_000_000_000) {
    epochMs = Math.round(numericTd * 1000);
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(dPart)) {
    const [dd, mm, yyyy] = dPart.split('-').map(Number);
    const [hh = 0, min = 0] = hhmm.split(':').map(Number);
    epochMs = new Date(yyyy, (mm || 1) - 1, dd || 1, hh || 0, min || 0).getTime();
  } else {
    epochMs = Date.now();
  }

  return {
    time: timeStr || new Date(epochMs).toLocaleString(),
    datePart: dPart || '',
    label: hhmm || dPart.slice(0, 5) || '00:00',
    timestamp: epochMs,
  };
}

function normalizeCloudChartPoint(
  raw: Record<string, unknown>,
  useDateAsLabel = false
): CloudChartPoint {
  const { time, datePart, label, timestamp } = parseCloudTimestamp(
    raw.time ?? raw.realTime,
    raw.timeDate
  );

  // For monthly charts (01-10-2026 .. 31-10-2026), label X-axis with DD-MM ("01-10")
  const resolvedLabel =
    useDateAsLabel && datePart.length >= 5 ? datePart.slice(0, 5) : label;

  return {
    time,
    label: resolvedLabel,
    datePart,
    timestamp,
    solarW: Math.max(0, Math.round(toNum(raw.solarW))),
    acOutW: Math.max(0, Math.round(toNum(raw.acOutW))),
    acOutVa: Math.max(0, Math.round(toNum(raw.acOutVa, toNum(raw.acOutW)))),
    gridW: Math.round(toNum(raw.gridW)),
    solarV: Number(toNum(raw.solarV).toFixed(1)),
    solarA: Number(toNum(raw.solarA).toFixed(1)),
    battV: Number(toNum(raw.battV).toFixed(1)),
    battPercent: Math.max(0, Math.min(100, Math.round(toNum(raw.battPercent)))),
    battChargeA: Number(toNum(raw.battChargeA).toFixed(1)),
    battDischargeA: Number(toNum(raw.battDischargeA).toFixed(1)),
    gridV: Number(toNum(raw.gridV).toFixed(1)),
    acOutV: Number(toNum(raw.acOutV, toNum(raw.gridV)).toFixed(1)),
    gridHz: Number(toNum(raw.gridHz, 50).toFixed(1)),
    heatSinkDegC: Math.round(toNum(raw.heatSinkDegC)),
    solarW1: Math.max(0, Math.round(toNum(raw.solarW1))),
    solarV1: Number(toNum(raw.solarV1).toFixed(1)),
    solarA1: Number(toNum(raw.solarA1).toFixed(1)),
    solarW2: Math.max(0, Math.round(toNum(raw.solarW2))),
    solarV2: Number(toNum(raw.solarV2).toFixed(1)),
    solarA2: Number(toNum(raw.solarA2).toFixed(1)),
  };
}

/* Peak-preserving downsampler so multi-hour charts stay crisp while preserving load/PV spikes */
function compactChartPoints(
  rawList: unknown,
  maxPoints = 220,
  useDateAsLabel = false
): CloudChartPoint[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const normalized = rawList
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeCloudChartPoint(item, useDateAsLabel));

  if (normalized.length <= maxPoints) {
    return normalized;
  }

  const result: CloudChartPoint[] = [normalized[0]];
  const interiorCount = maxPoints - 2;
  const bucketSize = (normalized.length - 2) / interiorCount;

  for (let i = 0; i < interiorCount; i++) {
    const start = 1 + Math.floor(i * bucketSize);
    const end = Math.min(normalized.length - 1, 1 + Math.floor((i + 1) * bucketSize));
    let chosen = normalized[start];
    let peakScore = -1;
    for (let j = start; j < end; j++) {
      const pt = normalized[j];
      const score = pt.solarW + pt.acOutVa + Math.abs(pt.gridW);
      if (score > peakScore) {
        peakScore = score;
        chosen = pt;
      }
    }
    if (chosen) result.push(chosen);
  }

  result.push(normalized[normalized.length - 1]);
  return result;
}

function normalizeCloudEnergy(
  raw: Record<string, unknown>,
  period: CloudPeriod,
  fetchedAt: number
): CloudEnergySummary {
  return {
    period,
    todaySolar: Number(toNum(raw.todaySolar).toFixed(1)),
    todayGrid: Number(toNum(raw.todayGrid).toFixed(1)),
    todayNetGrid: Number(toNum(raw.todayNetGrid).toFixed(1)),
    todayNetSolar: Number(toNum(raw.todayNetSolar).toFixed(1)),
    todayBattery: Number(toNum(raw.todayBattery).toFixed(1)),
    todaySolarBattery: Number(toNum(raw.todaySolarBattery).toFixed(1)),
    todayGridBattery: Number(toNum(raw.todayGridBattery).toFixed(1)),
    todayTotal: Number(toNum(raw.todayTotal).toFixed(1)),
    todayLoad: Number(toNum(raw.todayLoad).toFixed(1)),
    rate: Math.max(0, Math.round(toNum(raw.rate, 40))),
    fetchedAt,
  };
}

function withDedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightMap.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    inFlightMap.delete(key);
  });
  inFlightMap.set(key, p);
  return p;
}

function recordRealtimeSample(deviceId: string, raw: Record<string, unknown>, fetchedAt: number): void {
  const state = readPersistedState();
  const historyMap = state.historyByDevice ?? {};
  const deviceHistory = historyMap[deviceId] ?? [];

  const timeStr = typeof raw.time === 'string' ? raw.time.trim() : '';
  const tPart = timeStr.split(/\s+/)[1] || '';
  const label = tPart ? tPart.slice(0, 5) : new Date(fetchedAt).toTimeString().slice(0, 5);

  const lastSample = deviceHistory[deviceHistory.length - 1];
  if (!lastSample || fetchedAt - lastSample.timestamp >= 15_000) {
    const batteryVoltage = toNum(raw.batteryVoltage);
    const chargingWatts = batteryVoltage * Math.max(0, toNum(raw.chargingAmpere));
    const dischargingWatts = batteryVoltage * Math.max(0, toNum(raw.dischargingAmpere));
    const sample: StoredSample = {
      timestamp: fetchedAt,
      label,
      solarWatts: Math.max(0, Math.round(toNum(raw.solarWatts))),
      loadWatts: Math.max(0, Math.round(toNum(raw.loadWatts))),
      loadVa: Math.max(0, Math.round(toNum(raw.loadVa, toNum(raw.loadWatts)))),
      gridWatts: Math.round(toNum(raw.gridWatts)),
      batteryWatts: Math.round(chargingWatts > 1 ? chargingWatts : dischargingWatts),
      gridVoltage: toNum(raw.gridVoltage),
      loadVoltage: toNum(raw.loadVoltage),
      gridHz: toNum(raw.gridHz),
      mpptTemperature: Math.round(toNum(raw.mpptTemperature)),
      fanSpeed: Math.max(0, Math.round(toNum(raw.fanSpeed))),
    };
    const cutoff = fetchedAt - 6.5 * 3600 * 1000;
    historyMap[deviceId] = [...deviceHistory.filter((s) => s.timestamp >= cutoff), sample].slice(-480);
    writePersistedState({
      ...state,
      historyByDevice: historyMap,
      updatedAt: fetchedAt,
    });
  }
}

/* Seed local Stats tab history from Cloud 1h chart if local history has few samples */
function seedStatsHistoryFromCloudChart(deviceId: string, cloudPoints: CloudChartPoint[]): void {
  if (cloudPoints.length === 0) return;
  const state = readPersistedState();
  const historyMap = state.historyByDevice ?? {};
  const existing = historyMap[deviceId] ?? [];
  if (existing.length >= 24) return;

  const converted: StoredSample[] = cloudPoints.slice(-60).map((pt) => ({
    timestamp: pt.timestamp,
    label: pt.label,
    solarWatts: pt.solarW,
    loadWatts: pt.acOutW,
    loadVa: pt.acOutVa,
    gridWatts: pt.gridW,
    batteryWatts: Math.round(pt.battV * Math.max(pt.battChargeA, pt.battDischargeA)),
    gridVoltage: pt.gridV,
    loadVoltage: pt.acOutV,
    gridHz: pt.gridHz,
    mpptTemperature: pt.heatSinkDegC,
    fanSpeed: 35,
  }));

  const combined = [...converted, ...existing].sort((a, b) => a.timestamp - b.timestamp);
  const deduped: StoredSample[] = [];
  for (const item of combined) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(item.timestamp - prev.timestamp) >= 10_000) {
      deduped.push(item);
    }
  }
  historyMap[deviceId] = deduped.slice(-480);
  writePersistedState({
    ...state,
    historyByDevice: historyMap,
    updatedAt: Date.now(),
  });
}

async function getDeviceRealtimeData(deviceId: string, priority: 'high' | 'low' = 'high') {
  const cleanId = deviceId.trim().toUpperCase();
  const now = Date.now();
  const cachedEntry = deviceCache.get(cleanId);

  if (cachedEntry && now - cachedEntry.fetchedAt < REALTIME_CACHE_TTL_MS) {
    return {
      data: cachedEntry.data,
      fetchedAt: cachedEntry.fetchedAt,
      latencyMs: cachedEntry.latencyMs,
      stale: false,
      cached: true,
    };
  }

  return withDedupe(`realtime:${cleanId}`, async () => {
    try {
      const url = `${INVERTERZONE_REALTIME_URL}?deviceId=${encodeURIComponent(cleanId)}`;
      const { data: freshData, latencyMs } = await fetchJsonWithRetry<Record<string, unknown>>(
        url,
        {
          method: 'POST',
          headers: { 'Content-Length': '0' },
        },
        priority
      );
      const fetchedAt = Date.now();
      deviceCache.set(cleanId, { data: freshData, fetchedAt, latencyMs });
      recordRealtimeSample(cleanId, freshData, fetchedAt);
      return {
        data: freshData,
        fetchedAt,
        latencyMs,
        stale: false,
        cached: false,
      };
    } catch (err) {
      const fallback = deviceCache.get(cleanId);
      if (fallback && Date.now() - fallback.fetchedAt < STALE_FALLBACK_MAX_AGE_MS) {
        return {
          data: fallback.data,
          fetchedAt: fallback.fetchedAt,
          latencyMs: fallback.latencyMs,
          stale: true,
          cached: true,
        };
      }
      throw err;
    }
  });
}

async function getCloudEnergy(
  deviceId: string,
  period: CloudPeriod,
  force = false,
  priority: 'high' | 'low' = 'high'
): Promise<{ summary: CloudEnergySummary; stale: boolean }> {
  const cleanId = deviceId.trim().toUpperCase();
  const cacheKey = `${cleanId}:${period}`;
  const ttl = period === 'T' || period === 'TY' ? TODAY_ENERGY_TTL_MS : HISTORICAL_ENERGY_TTL_MS;
  const cached = cloudEnergyMemCache.get(cacheKey);

  if (!force && cached && Date.now() - cached.fetchedAt < ttl) {
    return { summary: cached, stale: false };
  }

  return withDedupe(`energy:${cacheKey}`, async () => {
    try {
      const body = `value=${encodeURIComponent(period)}&device=${encodeURIComponent(cleanId)}`;
      const { data } = await fetchJsonWithRetry<Record<string, unknown>>(
        INVERTERZONE_ENERGY_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
        priority
      );
      const fetchedAt = Date.now();
      const summary = normalizeCloudEnergy(data, period, fetchedAt);
      cloudEnergyMemCache.set(cacheKey, summary);

      const state = readPersistedState();
      const cloudEnergyByDevice = state.cloudEnergyByDevice ?? {};
      cloudEnergyByDevice[cleanId] = {
        ...(cloudEnergyByDevice[cleanId] ?? {}),
        [period]: summary,
      };
      writePersistedState({
        ...state,
        cloudEnergyByDevice,
        updatedAt: fetchedAt,
      });

      return { summary, stale: false };
    } catch (err) {
      if (cached) {
        return { summary: cached, stale: true };
      }
      throw err;
    }
  });
}

async function getCloudChartHours(
  deviceId: string,
  hours: ChartHoursWindow,
  force = false,
  priority: 'high' | 'low' = 'high'
): Promise<{ chart: CloudChartPoint[]; fetchedAt: number; stale: boolean }> {
  const cleanId = deviceId.trim().toUpperCase();
  const cacheKey = `${cleanId}:${hours}`;
  const cached = cloudChartHoursMemCache.get(cacheKey);

  if (!force && cached && Date.now() - cached.fetchedAt < CHART_HOURS_TTL_MS) {
    return { chart: cached.chart, fetchedAt: cached.fetchedAt, stale: false };
  }

  return withDedupe(`chartHours:${cacheKey}`, async () => {
    try {
      const { data } = await fetchJsonWithRetry<{ chart?: unknown[] }>(
        INVERTERZONE_CHART_HOURS_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ deviceId: cleanId, hours: String(hours) }),
        },
        priority
      );
      const fetchedAt = Date.now();
      const chart = compactChartPoints(data.chart, 220, false);
      const entry: CachedChartHoursEntry = { chart, fetchedAt };
      cloudChartHoursMemCache.set(cacheKey, entry);

      if (hours === 1 && chart.length > 0) {
        seedStatsHistoryFromCloudChart(cleanId, chart);
      }

      const state = readPersistedState();
      const cloudChartHoursByDevice = state.cloudChartHoursByDevice ?? {};
      cloudChartHoursByDevice[cleanId] = {
        ...(cloudChartHoursByDevice[cleanId] ?? {}),
        [String(hours)]: entry,
      };
      writePersistedState({
        ...state,
        cloudChartHoursByDevice,
        updatedAt: fetchedAt,
      });

      return { chart, fetchedAt, stale: false };
    } catch (err) {
      if (cached) {
        return { chart: cached.chart, fetchedAt: cached.fetchedAt, stale: true };
      }
      throw err;
    }
  });
}

async function getCloudChartData(
  deviceId: string,
  period: CloudPeriod,
  force = false,
  priority: 'high' | 'low' = 'high'
): Promise<{ entry: CachedChartDataEntry; stale: boolean }> {
  const cleanId = deviceId.trim().toUpperCase();
  const cacheKey = `${cleanId}:${period}`;
  const ttl = period === 'T' ? 60 * 1000 : HISTORICAL_ENERGY_TTL_MS;
  const cached = cloudChartDataMemCache.get(cacheKey);

  if (!force && cached && Date.now() - cached.fetchedAt < ttl) {
    return { entry: cached, stale: false };
  }

  return withDedupe(`chartData:${cacheKey}`, async () => {
    try {
      const { data } = await fetchJsonWithRetry<{
        chart?: unknown[];
        chart24?: unknown[];
        chartMonth?: unknown[];
        monthStats?: Array<Record<string, unknown>>;
      }>(
        INVERTERZONE_CHART_DATA_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ deviceId: cleanId, value: period }),
        },
        priority
      );

      const fetchedAt = Date.now();
      const chart = compactChartPoints(data.chart, 220, false);
      const chart24 = compactChartPoints(data.chart24, 140, false);
      const chartMonth = compactChartPoints(data.chartMonth, 62, true);
      const monthStats = Array.isArray(data.monthStats)
        ? data.monthStats.map((item) => ({
            ...normalizeCloudEnergy(item, period, fetchedAt),
            time: typeof item.time === 'string' ? item.time : undefined,
          }))
        : [];

      const entry: CachedChartDataEntry = {
        chart,
        chart24,
        chartMonth,
        monthStats,
        fetchedAt,
      };
      cloudChartDataMemCache.set(cacheKey, entry);

      // If Today's response also included 1-hour `chart`, populate 1h cache if empty
      if (period === 'T' && chart.length > 0 && !cloudChartHoursMemCache.has(`${cleanId}:1`)) {
        cloudChartHoursMemCache.set(`${cleanId}:1`, { chart, fetchedAt });
        seedStatsHistoryFromCloudChart(cleanId, chart);
      }

      const state = readPersistedState();
      const cloudChartDataByDevice = state.cloudChartDataByDevice ?? {};
      cloudChartDataByDevice[cleanId] = {
        ...(cloudChartDataByDevice[cleanId] ?? {}),
        [period]: entry,
      };
      writePersistedState({
        ...state,
        cloudChartDataByDevice,
        updatedAt: fetchedAt,
      });

      return { entry, stale: false };
    } catch (err) {
      if (cached) {
        return { entry: cached, stale: true };
      }
      throw err;
    }
  });
}

function collectCachedPeriodsForDevice(
  deviceId: string
): Partial<Record<CloudPeriod, CloudEnergySummary>> {
  const cleanId = deviceId.trim().toUpperCase();
  const out: Partial<Record<CloudPeriod, CloudEnergySummary>> = {};
  const persisted = readPersistedState().cloudEnergyByDevice?.[cleanId] ?? {};
  for (const p of ['T', 'Y', 'TM', 'LM', 'TY', 'LY'] as const) {
    const item = cloudEnergyMemCache.get(`${cleanId}:${p}`);
    if (item) {
      out[p] = item;
    } else if (persisted[p]) {
      out[p] = persisted[p];
      cloudEnergyMemCache.set(`${cleanId}:${p}`, persisted[p]);
    }
  }
  return out;
}

function toBoolFlag(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const clean = val.trim().toUpperCase();
    return clean === '1' || clean === 'Y' || clean === 'TRUE' || clean === 'ENABLE';
  }
  return false;
}

async function getCloudPanelCompanies(
  priority: 'high' | 'low' = 'low'
): Promise<Array<{ label: string; value: string }>> {
  if (panelCompaniesCache && Date.now() - panelCompaniesCache.fetchedAt < PANEL_COMPANIES_TTL_MS) {
    return panelCompaniesCache.items;
  }
  return withDedupe('panelCompanies', async () => {
    try {
      const { data } = await fetchJsonWithRetry<Array<Record<string, unknown>>>(
        INVERTERZONE_PANEL_COMPANIES_URL,
        { method: 'GET' },
        priority
      );
      const items = Array.isArray(data)
        ? data
            .map((it) => ({
              label: typeof it.label === 'string' ? it.label : String(it.value ?? ''),
              value: typeof it.value === 'string' ? it.value : '',
            }))
            .filter((it) => Boolean(it.label))
        : [];
      panelCompaniesCache = { items, fetchedAt: Date.now() };
      return items;
    } catch {
      return panelCompaniesCache?.items ?? [];
    }
  });
}

function findPeakDualMpptSnapshot(deviceId: string): {
  time: string;
  solarW: number;
  pv1W: number;
  pv1V: number;
  pv1A: number;
  pv2W: number;
  pv2V: number;
  pv2A: number;
} | null {
  const candidates: CloudChartPoint[] = [];
  for (const p of ['T', 'Y', 'TM', 'LM'] as const) {
    const entry = cloudChartDataMemCache.get(`${deviceId}:${p}`);
    if (entry) {
      candidates.push(...entry.chart24, ...entry.chartMonth);
    }
  }
  let best: CloudChartPoint | null = null;
  for (const pt of candidates) {
    if (pt.solarW1 + pt.solarW2 > 50 && (!best || pt.solarW > best.solarW)) {
      best = pt;
    }
  }
  if (!best) return null;
  return {
    time: best.time,
    solarW: best.solarW,
    pv1W: best.solarW1,
    pv1V: best.solarV1,
    pv1A: best.solarA1,
    pv2W: best.solarW2,
    pv2V: best.solarV2,
    pv2A: best.solarA2,
  };
}

async function getDongleExtendedDiagnostics(
  deviceId: string,
  force = false,
  priority: 'high' | 'low' = 'high'
): Promise<{ diagnostics: Record<string, unknown>; stale: boolean }> {
  const cleanId = deviceId.trim().toUpperCase();
  const cached = extendedDiagMemCache.get(cleanId);

  if (!force && cached && Date.now() - cached.fetchedAt < EXTENDED_DIAG_TTL_MS) {
    return {
      diagnostics: {
        ...cached.payload,
        peakMpptSnapshot: findPeakDualMpptSnapshot(cleanId) ?? cached.payload.peakMpptSnapshot,
      },
      stale: false,
    };
  }

  return withDedupe(`extDiag:${cleanId}`, async () => {
    try {
      const extRtRes = await fetchJsonWithRetry<{ dataDTO?: Record<string, unknown> }>(
        INVERTERZONE_EXTENDED_REALTIME_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `deviceId=${encodeURIComponent(cleanId)}`,
        },
        priority
      );

      const settingsRes = await fetchJsonWithRetry<Record<string, unknown>>(
        INVERTERZONE_CLOUD_SETTINGS_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ token: 'null', deviceId: cleanId }),
        },
        priority
      );

      // Ensure at least one historical cloud chart dataset is loaded for daytime PV1/PV2 balance
      if (!findPeakDualMpptSnapshot(cleanId)) {
        try {
          await getCloudChartData(cleanId, 'TM', false, priority);
        } catch {
          // Optional enrichment
        }
      }

      const panelCompanies = await getCloudPanelCompanies('low');
      const dto = extRtRes.data.dataDTO ?? (extRtRes.data as unknown as Record<string, unknown>);
      const cfg = settingsRes.data ?? {};
      const fetchedAt = Date.now();

      const acOutW = Math.max(0, Math.round(toNum(dto.acOutW)));
      const acOutVa = Math.max(acOutW, Math.round(toNum(dto.acOutVa, acOutW)));
      const reactiveVar = Math.round(Math.sqrt(Math.max(0, acOutVa * acOutVa - acOutW * acOutW)));

      const payload: Record<string, unknown> = {
        deviceId: cleanId,
        fetchedAt,
        stale: false,
        localIp: typeof dto.localIp === 'string' && dto.localIp ? dto.localIp : '192.168.1.4',
        signalDbm: Math.round(toNum(dto.signal ?? cfg.signal, -70)),
        firmwareVersion: String(dto.currentVersion ?? cfg.firmware ?? '11.1'),
        hardwareModel: String(dto.model ?? '1.0'),
        freeHeapBytes: Math.max(0, Math.round(toNum(dto.freeHeap))),
        jsonMemBytes: Math.max(0, Math.round(toNum(dto.jsonMemUsage))),
        heapFragPct: Math.max(0, Math.round(toNum(dto.heapFrag))),
        packageValidity:
          typeof cfg.packageDate === 'string' && cfg.packageDate ? cfg.packageDate : 'Active',
        realTime: typeof dto.realTime === 'string' ? dto.realTime : '',
        serverTime: typeof dto.serverTime === 'string' ? dto.serverTime : '',
        brandName: typeof cfg.brandName === 'string' && cfg.brandName ? cfg.brandName : 'fronus',
        modelName:
          typeof cfg.modelName === 'string' && cfg.modelName ? cfg.modelName : 'META PV 14000',
        inverterType:
          typeof cfg.inverterType === 'string' && cfg.inverterType ? cfg.inverterType : 'Hybrid',
        protocol: String(dto.protocol ?? cfg.protocol ?? 'PI30'),
        inverterSoftware: String(dto.inverterSoftware ?? cfg.inverterSoftware ?? 'VERFW:00051.35'),
        ivModeCode: String(dto.iv_mode ?? dto.type ?? 'L'),
        settingsWritable: toNum(cfg.settingsWritable, 1) === 1,
        busV: Number(toNum(dto.busV).toFixed(1)),
        pvInstalledW: Math.round(toNum(dto.pvInstalled ?? cfg.pvCapacity, 7020)),
        peakSolarW: Math.round(toNum(dto.peakSolar)),
        peakLoadW: Math.round(toNum(dto.peakLoad)),
        solarW: Math.max(0, Math.round(toNum(dto.solarW))),
        solarV: Number(toNum(dto.solarV).toFixed(1)),
        solarA: Number(toNum(dto.solarA).toFixed(1)),
        pv1: {
          watts: Math.max(0, Math.round(toNum(dto.solarW1))),
          volts: Number(toNum(dto.solarV1).toFixed(1)),
          amps: Number(toNum(dto.solarA1).toFixed(1)),
        },
        pv2: {
          watts: Math.max(0, Math.round(toNum(dto.solarW2))),
          volts: Number(toNum(dto.solarV2).toFixed(1)),
          amps: Number(toNum(dto.solarA2).toFixed(1)),
        },
        pv3: {
          watts: Math.max(0, Math.round(toNum(dto.solarW3))),
          volts: Number(toNum(dto.solarV3).toFixed(1)),
          amps: Number(toNum(dto.solarA3).toFixed(1)),
        },
        gridV: Number(toNum(dto.gridV).toFixed(1)),
        gridHz: Number(toNum(dto.gridHz, 50).toFixed(1)),
        gridW: Math.round(toNum(dto.gridW)),
        acOutV: Number(toNum(dto.acOutV).toFixed(1)),
        acOutHz: Number(toNum(dto.acOutHz, 50).toFixed(1)),
        acOutW,
        acOutVa,
        reactiveVar,
        acOutPercent: Math.max(0, Math.round(toNum(dto.acOutPercent))),
        acOutRatingW: Math.round(toNum(dto.acOutRatingW ?? cfg.acOutRatingW, 10000)),
        acOutRatingV: Math.round(toNum(dto.acOutRatingV ?? cfg.outputV, 230)),
        acOutRatingHz: Number(toNum(dto.acOutRatingHz ?? cfg.acOutRatingHz, 50).toFixed(1)),
        heatSinkDegC: Math.round(toNum(dto.heatSinkDegC)),
        fanSpeedPct: Math.max(0, Math.round(toNum(dto.fanSpeed))),
        battV: Number(toNum(dto.battV).toFixed(1)),
        battPercent: Math.max(0, Math.round(toNum(dto.battPercent))),
        battChargeA: Number(toNum(dto.battChargeA).toFixed(1)),
        battDischargeA: Number(toNum(dto.battDischargeA).toFixed(1)),
        solarBatteryWatts: Math.round(toNum(dto.solarBatteryWatts)),
        gridBatteryWatts: Math.round(toNum(dto.gridBatteryWatts)),
        battType: String(dto.battType ?? cfg.batteryType ?? 'AGM'),
        battRatingV: Number(toNum(dto.battRatingV ?? cfg.batteryRatingV).toFixed(1)),
        battBulkV: Number(toNum(dto.battBulkV ?? cfg.bulkCharge, 12).toFixed(1)),
        battFloatV: Number(toNum(dto.battFloatV ?? cfg.floatCharge, 12).toFixed(1)),
        cutOffVolts: Number(toNum(dto.cutOffVolts ?? cfg.cutOffVolt, 10).toFixed(1)),
        backToGridV: Number(toNum(dto.backToGridV ?? cfg.backToGrid).toFixed(1)),
        backToDisV: Number(toNum(dto.backToDisV ?? cfg.backDichargeVolt).toFixed(1)),
        battMaxAcChrgA: Math.round(toNum(dto.battMaxAcChrgA ?? cfg.acChargeA, 40)),
        battMaxChrgA: Math.round(toNum(dto.battMaxChrgA ?? cfg.solarChargeA, 80)),
        inputVoltType: String(dto.inputVoltType ?? cfg.acInputRange ?? 'APL'),
        outputSource: String(dto.outputSource ?? cfg.outputMode ?? 'SUB'),
        chargeSource: String(dto.chargeSource ?? 'CSO'),
        cloudChargeMode: String(cfg.batteryChargeMode ?? 'SNU'),
        eqStatus: Math.round(toNum(dto.eqStatus ?? cfg.eqStatus, 0)),
        eqTimeMin: Math.round(toNum(dto.eqTime ?? cfg.eqTime, 60)),
        eqIntervalDays: Math.round(toNum(dto.eqInterval ?? cfg.eqInterval, 30)),
        eqVoltage: Number(toNum(dto.eqVolatge ?? cfg.eqVolatge, 0).toFixed(1)),
        eqActivate: Math.round(toNum(dto.eqActivate ?? cfg.eqActivate, 0)),
        dualOutput: Math.round(toNum(dto.dualOutput ?? cfg.dualOutput, 0)),
        dualOutputVolts:
          cfg.dualOutputVolts != null ? Number(toNum(cfg.dualOutputVolts).toFixed(1)) : null,
        gridFeed: Math.round(toNum(dto.gridFeed ?? cfg.gridFeed, 0)),
        gridFeedCapable: Math.round(toNum(dto.gridFeedCapable ?? cfg.gridFeedCapable, 0)),
        netMetering: String(dto.netMetering ?? cfg.netMetering ?? 'N'),
        electricityRateRs: Math.round(toNum(cfg.rate, 40)),
        panelCompany: String(cfg.panelCompany ?? 'vsun').toUpperCase(),
        panelWatts: Math.round(toNum(cfg.panelWatts, 585)),
        panelCount: Math.round(toNum(cfg.panelCount, 12)),
        flags: {
          gridPresent: toBoolFlag(dto.grid),
          faultCode: String(dto.fault ?? 'NO'),
          heavyLoad: toBoolFlag(dto.heavyLoad),
          heavyLoadBattery: toBoolFlag(dto.heavyLoadBattery),
          lowSolar: toBoolFlag(dto.lowSolar),
          learnMode: toBoolFlag(dto.learnMode),
          inverterBuzzer: toBoolFlag(dto.inverterBuzzer ?? cfg.inverterBuzzer),
          powerSaving: toBoolFlag(dto.powerSaving ?? cfg.powerSaving),
          overloadRestart: toBoolFlag(dto.overloadRestart ?? cfg.overloadRestart),
          temperatureRestart: toBoolFlag(dto.temperatureRestart ?? cfg.temperatureRestart),
          lcdBacklight: toBoolFlag(dto.lcdBacklight ?? cfg.lcdBacklight),
          alarmInterrupt: toBoolFlag(dto.alarmInterrupt ?? cfg.alarmInterrupt),
          faultRecord: toBoolFlag(dto.faultRecord ?? cfg.faultRecord),
          overloadBypass: toBoolFlag(dto.overloadBypass ?? cfg.overloadBypass),
          defaultLcdPage: toBoolFlag(dto.defaultLcdPage ?? cfg.defaultLcdPage),
          cloudNotification: toBoolFlag(cfg.notification),
          emailNotification: toBoolFlag(cfg.emailNotification),
        },
        panelCompanies,
        peakMpptSnapshot: findPeakDualMpptSnapshot(cleanId),
        rawExtendedDto: dto,
        rawCloudSettings: cfg,
      };

      extendedDiagMemCache.set(cleanId, { payload, fetchedAt });
      const state = readPersistedState();
      writePersistedState({
        ...state,
        extendedDiagByDevice: {
          ...(state.extendedDiagByDevice ?? {}),
          [cleanId]: { payload, fetchedAt },
        },
        updatedAt: fetchedAt,
      });

      return { diagnostics: payload, stale: false };
    } catch (err) {
      if (cached) {
        return {
          diagnostics: { ...cached.payload, stale: true },
          stale: true,
        };
      }
      const persisted = readPersistedState().extendedDiagByDevice?.[cleanId];
      if (persisted) {
        return {
          diagnostics: { ...persisted.payload, stale: true },
          stale: true,
        };
      }
      throw err;
    }
  });
}

/* Gently warm saved cloud history in background using low-priority queue slots */
async function warmCloudHistoryForDevice(deviceId: string): Promise<void> {
  const cleanId = deviceId.trim().toUpperCase();
  const tasks: Array<() => Promise<unknown>> = [
    () => getCloudEnergy(cleanId, 'T', false, 'low'),
    () => getCloudChartData(cleanId, 'T', false, 'low'),
    () => getCloudChartHours(cleanId, 1, false, 'low'),
    () => getDongleExtendedDiagnostics(cleanId, false, 'low'),
    () => getCloudEnergy(cleanId, 'Y', false, 'low'),
    () => getCloudChartData(cleanId, 'Y', false, 'low'),
    () => getCloudEnergy(cleanId, 'TM', false, 'low'),
    () => getCloudChartData(cleanId, 'TM', false, 'low'),
    () => getCloudEnergy(cleanId, 'LM', false, 'low'),
    () => getCloudChartData(cleanId, 'LM', false, 'low'),
    () => getCloudChartHours(cleanId, 2, false, 'low'),
    () => getCloudChartHours(cleanId, 4, false, 'low'),
    () => getCloudChartHours(cleanId, 6, false, 'low'),
  ];

  for (const runTask of tasks) {
    try {
      await runTask();
    } catch {
      // Ignore individual background warm glitches
    }
  }
}

function parsePeriodParam(val: unknown): CloudPeriod {
  if (
    val === 'Y' ||
    val === 'TM' ||
    val === 'LM' ||
    val === 'T' ||
    val === 'TY' ||
    val === 'LY'
  ) {
    return val;
  }
  return 'T';
}

function parseHoursParam(val: unknown): ChartHoursWindow {
  const n = Number(val);
  if (n === 2 || n === 4 || n === 6) return n;
  return 1;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get('/api/settings', (_req, res) => {
    const state = readPersistedState();
    res.json({
      ok: true,
      state: {
        devices: state.devices,
        timers: state.timers,
        thresholds: state.thresholds,
      },
    });
  });

  app.post('/api/settings', (req, res) => {
    const current = readPersistedState();
    const incoming =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const merged: PersistedServerState = {
      ...current,
      devices: Array.isArray(incoming.devices)
        ? (incoming.devices as PersistedServerState['devices'])
        : current.devices,
      timers: Array.isArray(incoming.timers) ? incoming.timers : current.timers,
      thresholds:
        incoming.thresholds && typeof incoming.thresholds === 'object'
          ? (incoming.thresholds as Record<string, unknown>)
          : current.thresholds,
      updatedAt: Date.now(),
    };
    writePersistedState(merged);
    res.json({ ok: true, updatedAt: merged.updatedAt });
  });

  /* Unified Cloud Historical Stat2 Endpoint (Energy + 1h/2h/4h/6h Chart + 24h/Month Cloud History) */
  const handleStat2Bundle = async (req: express.Request, res: express.Response) => {
    const rawDeviceId =
      (req.body && typeof req.body.deviceId === 'string' ? req.body.deviceId : '') ||
      (typeof req.query.deviceId === 'string' ? req.query.deviceId : '') ||
      'BCDDC277F175';

    const cleanId = rawDeviceId.trim().replace(/^["']|["']$/g, '').toUpperCase();
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(cleanId)) {
      res.status(400).json({ ok: false, error: 'Invalid deviceId format.' });
      return;
    }

    const period = parsePeriodParam(req.body?.period ?? req.query.period);
    const hours = parseHoursParam(req.body?.hours ?? req.query.hours);
    const force = req.body?.force === true || req.query.force === 'true';

    try {
      const energyResult = await getCloudEnergy(cleanId, period, force, 'high');
      const chartDataResult = await getCloudChartData(cleanId, period, force, 'high');
      const chartHoursResult = await getCloudChartHours(cleanId, hours, force, 'high');

      // Opportunistically pre-fetch missing periods with low priority through our rate-limited scheduler
      for (const p of ['T', 'Y', 'TM', 'LM', 'TY', 'LY'] as const) {
        if (p !== period && !cloudEnergyMemCache.has(`${cleanId}:${p}`)) {
          void getCloudEnergy(cleanId, p, false, 'low').catch(() => {});
        }
      }

      res.json({
        ok: true,
        bundle: {
          deviceId: cleanId,
          period,
          hours,
          energy: energyResult.summary,
          allPeriods: collectCachedPeriodsForDevice(cleanId),
          realtimeChart:
            chartHoursResult.chart.length > 0
              ? chartHoursResult.chart
              : chartDataResult.entry.chart,
          historyChart24: chartDataResult.entry.chart24,
          historyChartMonth: chartDataResult.entry.chartMonth,
          monthStats: chartDataResult.entry.monthStats,
          stale: energyResult.stale || chartDataResult.stale || chartHoursResult.stale,
          fetchedAt: Math.max(
            energyResult.summary.fetchedAt,
            chartHoursResult.fetchedAt,
            chartDataResult.entry.fetchedAt
          ),
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load cloud history from InverterZone';
      res.status(502).json({ ok: false, error: message });
    }
  };

  app.get('/api/stat2', handleStat2Bundle);
  app.post('/api/stat2', handleStat2Bundle);

  /* Dedicated Fast Endpoint for 1h / 2h / 4h / 6h Real-Time Chart Window Switching */
  app.get('/api/stat2/chart-hours', async (req, res) => {
    const rawDeviceId =
      typeof req.query.deviceId === 'string' ? req.query.deviceId : 'BCDDC277F175';
    const cleanId = rawDeviceId.trim().replace(/^["']|["']$/g, '').toUpperCase();
    const hours = parseHoursParam(req.query.hours);
    const force = req.query.force === 'true';

    try {
      const result = await getCloudChartHours(cleanId, hours, force, 'high');
      res.json({
        ok: true,
        deviceId: cleanId,
        hours,
        realtimeChart: result.chart,
        fetchedAt: result.fetchedAt,
        stale: result.stale,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load cloud chart window';
      res.status(502).json({ ok: false, error: message });
    }
  });

  /* Endpoint to ensure all 4 Cloud Periods (Today, Yesterday, This Month, Last Month) are loaded for History & Export */
  app.get('/api/stat2/all-periods', async (req, res) => {
    const rawDeviceId =
      typeof req.query.deviceId === 'string' ? req.query.deviceId : 'BCDDC277F175';
    const cleanId = rawDeviceId.trim().replace(/^["']|["']$/g, '').toUpperCase();
    const force = req.query.force === 'true';

    try {
      for (const p of ['T', 'Y', 'TM', 'LM', 'TY', 'LY'] as const) {
        await getCloudEnergy(cleanId, p, force, 'high');
      }
      res.json({
        ok: true,
        deviceId: cleanId,
        allPeriods: collectCachedPeriodsForDevice(cleanId),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch all cloud energy periods';
      res.status(502).json({ ok: false, error: message });
    }
  });

  /* Helper: Extract Realtime Multi-MPPT Summary from Extended Dongle Cache */
  const buildMpptSummaryFromCache = (deviceId: string) => {
    const ext = extendedDiagMemCache.get(deviceId);
    if (!ext || !ext.payload) return null;
    const p = ext.payload;
    return {
      pv1: (p.pv1 as { watts: number; volts: number; amps: number }) ?? {
        watts: 0,
        volts: 0,
        amps: 0,
      },
      pv2: (p.pv2 as { watts: number; volts: number; amps: number }) ?? {
        watts: 0,
        volts: 0,
        amps: 0,
      },
      pv3: (p.pv3 as { watts: number; volts: number; amps: number }) ?? {
        watts: 0,
        volts: 0,
        amps: 0,
      },
      busV: toNum(p.busV),
      acOutHz: toNum(p.acOutHz, 50),
      panelCompany: typeof p.panelCompany === 'string' ? p.panelCompany : 'VSUN',
      panelWatts: Math.round(toNum(p.panelWatts, 585)),
      panelCount: Math.round(toNum(p.panelCount, 12)),
      pvInstalledW: Math.round(toNum(p.pvInstalledW, 7020)),
      peakMpptSnapshot: findPeakDualMpptSnapshot(deviceId) ?? p.peakMpptSnapshot ?? null,
    };
  };

  /* Default Cloud SmartTimer Rules (Sensor-Triggered IF-THEN) */
  const getDefaultSmartRules = () => [
    {
      id: 'rule_cloudy_sub',
      name: 'Cloudy Weather · Grid Assist',
      description:
        'When clouds roll in and PV1 voltage drops below 120 V, hold SUB solar-grid sharing so heavy home appliances remain stable.',
      metric: 'solar1_voltage',
      operator: 'LT',
      threshold: 120,
      targetSetting: 'Mode',
      targetValue: 'SUB',
      enabled: true,
    },
    {
      id: 'rule_strong_sun',
      name: 'Strong Midday Sun · Peak PV Priority',
      description:
        'When combined solar PV exceeds 1,800 W, prioritize solar harvest across home loads to minimize utility import.',
      metric: 'total_solar_watts',
      operator: 'GT',
      threshold: 1800,
      targetSetting: 'Mode',
      targetValue: 'SUB',
      enabled: true,
    },
    {
      id: 'rule_grid_sag',
      name: 'Low Grid Voltage Watch',
      description:
        'Flags brownout conditions when utility AC input dips below 198 V during evening peak demand.',
      metric: 'grid_voltage',
      operator: 'LT',
      threshold: 198,
      targetSetting: 'Mode',
      targetValue: 'SUB',
      enabled: true,
    },
    {
      id: 'rule_thermal_guard',
      name: 'MPPT Heatsink Thermal Guard',
      description:
        'Switches charger priority to Solar-First (CSO) when heatsink exceeds 56 °C to reduce AC charger thermal load.',
      metric: 'heatsink_temp',
      operator: 'GT',
      threshold: 56,
      targetSetting: 'ChargerPriority',
      targetValue: 'CSO',
      enabled: true,
    },
  ];

  /* Build Multi-Month Cloud Self-Sufficiency & ROI Audit from InverterZone Cloud History */
  const buildCloudAuditSummary = async (deviceId: string) => {
    const cleanId = deviceId.trim().toUpperCase();
    if (!cloudEnergyMemCache.has(`${cleanId}:TM`)) {
      try {
        await getCloudEnergy(cleanId, 'TM', false, 'high');
      } catch {}
    }
    if (!cloudEnergyMemCache.has(`${cleanId}:LM`)) {
      try {
        await getCloudEnergy(cleanId, 'LM', false, 'low');
      } catch {}
    }
    if (!cloudChartDataMemCache.has(`${cleanId}:TM`)) {
      try {
        await getCloudChartData(cleanId, 'TM', false, 'low');
      } catch {}
    }
    if (!cloudChartDataMemCache.has(`${cleanId}:LM`)) {
      try {
        await getCloudChartData(cleanId, 'LM', false, 'low');
      } catch {}
    }

    const tmEnergy = cloudEnergyMemCache.get(`${cleanId}:TM`);
    const lmEnergy = cloudEnergyMemCache.get(`${cleanId}:LM`);
    const tmChart = cloudChartDataMemCache.get(`${cleanId}:TM`);
    const lmChart = cloudChartDataMemCache.get(`${cleanId}:LM`);

    const byDate = new Map<string, { date: string; solarKwh: number; gridKwh: number; loadKwh: number }>();
    for (const src of [lmChart?.monthStats ?? [], tmChart?.monthStats ?? []]) {
      for (const item of src) {
        const key = (item.time || '').trim();
        if (!key) continue;
        byDate.set(key, {
          date: key,
          solarKwh: item.todaySolar,
          gridKwh: item.todayGrid,
          loadKwh: item.todayLoad || Number((item.todaySolar + item.todayGrid).toFixed(2)),
        });
      }
    }

    const rateRs = tmEnergy?.rate || lmEnergy?.rate || 40;
    let totalSolarKwh = 0;
    let totalGridKwh = 0;
    let totalLoadKwh = 0;
    let daysCount = byDate.size;
    let peakSolarDay: { date: string; solarKwh: number; loadKwh: number } | null = null;

    if (byDate.size > 0) {
      for (const d of byDate.values()) {
        totalSolarKwh += d.solarKwh;
        totalGridKwh += d.gridKwh;
        totalLoadKwh += d.loadKwh;
        if (!peakSolarDay || d.solarKwh > peakSolarDay.solarKwh) {
          peakSolarDay = {
            date: d.date,
            solarKwh: Number(d.solarKwh.toFixed(1)),
            loadKwh: Number(d.loadKwh.toFixed(1)),
          };
        }
      }
    } else {
      totalSolarKwh = (tmEnergy?.todaySolar ?? 0) + (lmEnergy?.todaySolar ?? 0);
      totalGridKwh = (tmEnergy?.todayGrid ?? 0) + (lmEnergy?.todayGrid ?? 0);
      totalLoadKwh =
        (tmEnergy?.todayLoad ?? 0) + (lmEnergy?.todayLoad ?? 0) || totalSolarKwh + totalGridKwh;
      daysCount = (tmEnergy ? 15 : 0) + (lmEnergy ? 30 : 0) || 1;
    }

    const denom = Math.max(0.1, totalSolarKwh + totalGridKwh);
    const solarSelfSufficiencyPct = Math.min(
      100,
      Math.max(0, Math.round((totalSolarKwh / denom) * 100))
    );
    const avgDailySolarKwh = Number((totalSolarKwh / Math.max(1, daysCount)).toFixed(2));
    const totalSavingsRs = Math.round(totalSolarKwh * rateRs);

    return {
      daysCount: Math.max(1, daysCount),
      totalSolarKwh: Number(totalSolarKwh.toFixed(1)),
      totalGridKwh: Number(totalGridKwh.toFixed(1)),
      totalLoadKwh: Number(totalLoadKwh.toFixed(1)),
      solarSelfSufficiencyPct,
      avgDailySolarKwh,
      peakSolarDay,
      totalSavingsRs,
      rateRs,
    };
  };

  /* Shared Server-Side Gemini Client Helper with 503 High-Demand Circuit-Breaker Fallback */
  let flash38CooldownUntil = 0;

  const getGeminiClient = (): GoogleGenAI => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error(
        'Gemini API key is missing. Please check your API key in the Settings > Secrets panel.'
      );
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  const generateGeminiResilient = async (
    contents: string,
    config: Record<string, unknown>
  ) => {
    const ai = getGeminiClient();
    const modelsToTry =
      Date.now() < flash38CooldownUntil
        ? ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
        : ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

    let lastErr: unknown = null;
    for (const modelName of modelsToTry) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 14_000);
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            ...config,
            abortSignal: controller.signal,
          },
        });
        clearTimeout(timeout);
        return res;
      } catch (err) {
        clearTimeout(timeout);
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (modelName === 'gemini-3.8-flash' && /503|UNAVAILABLE|abort|timeout/i.test(msg)) {
          flash38CooldownUntil = Date.now() + 3 * 60_000;
          continue;
        }
        if (/503|UNAVAILABLE|abort|timeout/i.test(msg)) {
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('Gemini model temporarily unavailable');
  };

  const formatGeminiError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/PERMISSION_DENIED|API_KEY_INVALID|403|400/i.test(msg)) {
      return `${msg} — Please verify your API key in the Settings > Secrets panel.`;
    }
    if (/RESOURCE_EXHAUSTED|429/i.test(msg)) {
      return 'Gemini quota reached. Upgrading your API key in Settings > Secrets increases quota.';
    }
    return msg;
  };

  const buildDeviceCloudPromptContext = async (deviceId: string) => {
    const cleanId = deviceId.trim().toUpperCase();
    const { diagnostics } = await getDongleExtendedDiagnostics(cleanId, false, 'high');
    const audit = await buildCloudAuditSummary(cleanId);
    const todayEnergy = cloudEnergyMemCache.get(`${cleanId}:T`);
    const yesterdayEnergy = cloudEnergyMemCache.get(`${cleanId}:Y`);
    const tmEnergy = cloudEnergyMemCache.get(`${cleanId}:TM`);
    const lmEnergy = cloudEnergyMemCache.get(`${cleanId}:LM`);

    return {
      diagnostics,
      audit,
      contextText: JSON.stringify(
        {
          deviceId: cleanId,
          brand: diagnostics.brandName,
          model: diagnostics.modelName,
          protocol: diagnostics.protocol,
          dspFirmware: diagnostics.inverterSoftware,
          dongleFirmware: diagnostics.firmwareVersion,
          pvArray: {
            company: diagnostics.panelCompany,
            panelCount: diagnostics.panelCount,
            panelWatts: diagnostics.panelWatts,
            pvInstalledW: diagnostics.pvInstalledW,
          },
          liveReadings: {
            ivMode: diagnostics.ivModeCode,
            outputSource: diagnostics.outputSource,
            chargeSource: diagnostics.chargeSource,
            busV: diagnostics.busV,
            solarW: diagnostics.solarW,
            pv1: diagnostics.pv1,
            pv2: diagnostics.pv2,
            pv3: diagnostics.pv3,
            gridV: diagnostics.gridV,
            gridHz: diagnostics.gridHz,
            gridW: diagnostics.gridW,
            acOutV: diagnostics.acOutV,
            acOutHz: diagnostics.acOutHz,
            acOutW: diagnostics.acOutW,
            acOutVa: diagnostics.acOutVa,
            reactiveVar: diagnostics.reactiveVar,
            heatSinkDegC: diagnostics.heatSinkDegC,
            battV: diagnostics.battV,
            battType: diagnostics.battType,
            wifiSignalDbm: diagnostics.signalDbm,
            freeHeapBytes: diagnostics.freeHeapBytes,
            flags: diagnostics.flags,
          },
          daytimePeakDualMpptSnapshot: diagnostics.peakMpptSnapshot,
          cloudEnergyHistory: {
            electricityRateRsPerKwh: diagnostics.electricityRateRs || audit.rateRs,
            today: todayEnergy ?? null,
            yesterday: yesterdayEnergy ?? null,
            thisMonth: tmEnergy ?? null,
            lastMonth: lmEnergy ?? null,
            multiMonthAudit: audit,
          },
        },
        null,
        2
      ),
    };
  };

  /* Cloud AI Lab State Endpoints */
  app.get('/api/cloud-lab-state', async (req, res) => {
    const rawId = typeof req.query.deviceId === 'string' ? req.query.deviceId : 'BCDDC277F175';
    const cleanId = rawId.trim().toUpperCase();
    try {
      const state = readPersistedState();
      const saved = state.cloudLabByDevice?.[cleanId] ?? {};
      const audit30Day = await buildCloudAuditSummary(cleanId);

      res.json({
        ok: true,
        bundle: {
          deviceId: cleanId,
          locationCity: saved.locationCity || 'Lahore, Pakistan',
          lastHealthReport: saved.lastHealthReport ?? null,
          lastForecastReport: saved.lastForecastReport ?? null,
          smartRules:
            Array.isArray(saved.smartRules) && saved.smartRules.length > 0
              ? saved.smartRules
              : getDefaultSmartRules(),
          qaHistory: Array.isArray(saved.qaHistory) ? saved.qaHistory : [],
          audit30Day,
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load Cloud Lab state',
      });
    }
  });

  app.post('/api/cloud-lab-state', (req, res) => {
    const cleanId = String(req.body?.deviceId || 'BCDDC277F175')
      .trim()
      .toUpperCase();
    const state = readPersistedState();
    const existing = state.cloudLabByDevice?.[cleanId] ?? {};
    const updated: PersistedCloudLabDeviceState = {
      ...existing,
      locationCity:
        typeof req.body?.locationCity === 'string'
          ? req.body.locationCity
          : existing.locationCity,
      smartRules: Array.isArray(req.body?.smartRules)
        ? req.body.smartRules
        : existing.smartRules,
    };
    writePersistedState({
      ...state,
      cloudLabByDevice: {
        ...(state.cloudLabByDevice ?? {}),
        [cleanId]: updated,
      },
      updatedAt: Date.now(),
    });
    res.json({ ok: true });
  });

  /* 1. AI Inverter & Dual-MPPT Cloud Health Doctor */
  app.post('/api/ai/diagnostics', async (req, res) => {
    const cleanId = String(req.body?.deviceId || 'BCDDC277F175')
      .trim()
      .toUpperCase();
    try {
      const { contextText } = await buildDeviceCloudPromptContext(cleanId);

      const response = await generateGeminiResilient(
        `Perform an engineering health & efficiency audit on this real InverterZone hybrid solar inverter telemetry and cloud history:\n${contextText}`,
        {
          systemInstruction:
            'You are a senior Voltronic PI30 & Fronus hybrid solar inverter engineer. Analyze the live PI30 registers, HV DC link bus, batteryless SUB operation (if battV is 0V), daytime PV1 vs PV2 MPPT string voltage/power balance, dongle WiFi/RAM health, and multi-month cloud kWh data. Give concise, accurate, hardware-grounded findings.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              healthScore: {
                type: Type.INTEGER,
                description: 'Overall system health score between 0 and 100.',
              },
              overallStatus: {
                type: Type.STRING,
                description: 'Short 2-4 word status headline, e.g. Healthy Batteryless SUB.',
              },
              summary: {
                type: Type.STRING,
                description: '2-3 sentence executive summary citing exact telemetry figures.',
              },
              mpptStringVerdict: {
                type: Type.STRING,
                description:
                  'Specific analysis of PV1 vs PV2 daytime string wattage/voltage/current balance and string configuration.',
              },
              busAndGridVerdict: {
                type: Type.STRING,
                description:
                  'Analysis of HV DC link bus voltage, grid voltage/Hz stability, reactive VAR/power factor, and thermal state.',
              },
              estimatedMonthlySavingsPotentialRs: {
                type: Type.INTEGER,
                description:
                  'Realistic extra monthly PKR savings achievable via load-shifting or string/setting optimization.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    action: { type: Type.STRING },
                    impact: { type: Type.STRING },
                    priority: { type: Type.STRING },
                  },
                  required: ['title', 'action', 'impact', 'priority'],
                },
              },
            },
            required: [
              'healthScore',
              'overallStatus',
              'summary',
              'mpptStringVerdict',
              'busAndGridVerdict',
              'estimatedMonthlySavingsPotentialRs',
              'recommendations',
            ],
          },
        }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      const report = {
        healthScore: Math.min(100, Math.max(0, Math.round(toNum(parsed.healthScore, 92)))),
        overallStatus: String(parsed.overallStatus || 'Healthy Operation'),
        summary: String(parsed.summary || ''),
        mpptStringVerdict: String(parsed.mpptStringVerdict || ''),
        busAndGridVerdict: String(parsed.busAndGridVerdict || ''),
        estimatedMonthlySavingsPotentialRs: Math.max(
          0,
          Math.round(toNum(parsed.estimatedMonthlySavingsPotentialRs, 1500))
        ),
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.slice(0, 4).map((r: Record<string, unknown>) => ({
              title: String(r.title || 'Optimization'),
              action: String(r.action || ''),
              impact: String(r.impact || ''),
              priority:
                r.priority === 'High' || r.priority === 'Low' ? r.priority : ('Medium' as const),
            }))
          : [],
        generatedAt: Date.now(),
      };

      const state = readPersistedState();
      const existing = state.cloudLabByDevice?.[cleanId] ?? {};
      writePersistedState({
        ...state,
        cloudLabByDevice: {
          ...(state.cloudLabByDevice ?? {}),
          [cleanId]: { ...existing, lastHealthReport: report },
        },
        updatedAt: Date.now(),
      });

      res.json({ ok: true, report });
    } catch (err) {
      res.status(502).json({ ok: false, error: formatGeminiError(err) });
    }
  });

  /* 2. AI Weather-Grounded Solar Forecast & Load Shifter (Google Search Grounding) */
  app.post('/api/ai/solar-forecast', async (req, res) => {
    const cleanId = String(req.body?.deviceId || 'BCDDC277F175')
      .trim()
      .toUpperCase();
    const location = String(req.body?.location || 'Lahore, Pakistan').trim();
    try {
      const { diagnostics, audit } = await buildDeviceCloudPromptContext(cleanId);
      const rateRs = toNum(diagnostics.electricityRateRs, audit.rateRs || 40);
      const pvInstalledW = toNum(diagnostics.pvInstalledW, 7020);

      const prompt = `Search tomorrow's weather, cloud cover, haze/dust, and sunshine hours for "${location}".
Then calculate tomorrow's realistic solar generation forecast and heavy-appliance load shifting schedule for this solar system:
- Installed PV Array: ${pvInstalledW} W (${diagnostics.panelCount}x ${diagnostics.panelWatts}W ${diagnostics.panelCompany})
- Historical Average Daily Solar Yield on Cloud: ${audit.avgDailySolarKwh} kWh/day (Peak Day: ${audit.peakSolarDay?.solarKwh ?? 18} kWh)
- Operating Mode: ${diagnostics.outputSource} (${toNum(diagnostics.battV) < 1 ? 'Batteryless solar+grid sharing — solar must be consumed live during daylight!' : 'Hybrid battery-backed'})
- Electricity Tariff: Rs ${rateRs}/kWh

Respond ONLY with a single raw JSON object (no markdown code fences) matching these exact keys:
{
  "forecastSummary": "1-2 sentence headline of tomorrow's sky conditions and solar outlook",
  "expectedSolarKwh": 16.5,
  "peakSunWindow": "10:00 AM - 02:30 PM",
  "weatherNotes": "Specific temperature, cloud cover %, haze/UV details for ${location} tomorrow",
  "applianceSchedule": [
    { "timeWindow": "10:00 AM - 12:00 PM", "appliance": "Water Pump & Washing Machine", "reason": "PV1+PV2 ramp above 2.5 kW" }
  ]
}`;

      const response = await generateGeminiResilient(prompt, {
        tools: [{ googleSearch: {} }],
      });

      const rawText = (response.text ?? '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      let parsed: Record<string, unknown> = {};
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      }

      const expectedSolarKwh = Math.max(
        1,
        Number(toNum(parsed.expectedSolarKwh, audit.avgDailySolarKwh || 14.5).toFixed(1))
      );
      const expectedSavingsRs = Math.round(expectedSolarKwh * rateRs);

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: Array<{ title: string; uri: string }> = [];
      for (const ch of chunks) {
        const web = (ch as { web?: { uri?: string; title?: string } }).web;
        if (web?.uri && !sources.some((s) => s.uri === web.uri)) {
          sources.push({
            title: web.title || new URL(web.uri).hostname,
            uri: web.uri,
          });
        }
      }

      const forecast = {
        location,
        forecastSummary: String(
          parsed.forecastSummary ||
            `Projected ${expectedSolarKwh} kWh solar harvest for ${location} tomorrow.`
        ),
        expectedSolarKwh,
        expectedSavingsRs,
        peakSunWindow: String(parsed.peakSunWindow || '10:00 AM – 02:30 PM'),
        weatherNotes: String(
          parsed.weatherNotes || rawText.replace(/\{[\s\S]*\}/, '').trim() || 'Grounded in local forecast.'
        ),
        applianceSchedule: Array.isArray(parsed.applianceSchedule)
          ? parsed.applianceSchedule.slice(0, 5).map((s: Record<string, unknown>) => ({
              timeWindow: String(s.timeWindow || '11:00 AM – 02:00 PM'),
              appliance: String(s.appliance || 'Heavy Daytime Load'),
              reason: String(s.reason || 'Direct PV self-consumption'),
            }))
          : [
              {
                timeWindow: '09:30 AM – 11:30 AM',
                appliance: 'Water Motor & Laundry',
                reason: 'Utilize morning MPPT ramp without grid import',
              },
              {
                timeWindow: '11:30 AM – 02:30 PM',
                appliance: 'Inverter AC / Ironing',
                reason: 'Peak PV1 + PV2 solar output window',
              },
            ],
        sources: sources.slice(0, 5),
        generatedAt: Date.now(),
      };

      const state = readPersistedState();
      const existing = state.cloudLabByDevice?.[cleanId] ?? {};
      writePersistedState({
        ...state,
        cloudLabByDevice: {
          ...(state.cloudLabByDevice ?? {}),
          [cleanId]: {
            ...existing,
            locationCity: location,
            lastForecastReport: forecast,
          },
        },
        updatedAt: Date.now(),
      });

      res.json({ ok: true, forecast });
    } catch (err) {
      res.status(502).json({ ok: false, error: formatGeminiError(err) });
    }
  });

  /* 3. AI Smart Conditional Rule Generator (InverterZone SmartTimer IF-THEN) */
  app.post('/api/ai/suggest-rules', async (req, res) => {
    const cleanId = String(req.body?.deviceId || 'BCDDC277F175')
      .trim()
      .toUpperCase();
    try {
      const { contextText } = await buildDeviceCloudPromptContext(cleanId);

      const response = await generateGeminiResilient(
        `Generate 4 practical Smart Conditional Rules (IF sensor < or > threshold -> switch Mode or ChargerPriority) tailored specifically for this inverter's real hardware and cloud telemetry:\n${contextText}`,
        {
          systemInstruction:
            'Allowed metric values ONLY: solar1_voltage, solar1_watts, solar2_watts, total_solar_watts, grid_voltage, load_watts, heatsink_temp, bus_voltage. Allowed operator values ONLY: LT, GT. Allowed targetSetting values ONLY: Mode, ChargerPriority. Allowed targetValue values: SUB, SBU, SOL, USB, CSO, SNU, OSO.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                metric: { type: Type.STRING },
                operator: { type: Type.STRING },
                threshold: { type: Type.NUMBER },
                targetSetting: { type: Type.STRING },
                targetValue: { type: Type.STRING },
              },
              required: [
                'name',
                'description',
                'metric',
                'operator',
                'threshold',
                'targetSetting',
                'targetValue',
              ],
            },
          },
        }
      );

      const allowedMetrics = new Set([
        'solar1_voltage',
        'solar1_watts',
        'solar2_watts',
        'total_solar_watts',
        'grid_voltage',
        'load_watts',
        'heatsink_temp',
        'bus_voltage',
      ]);
      const rawArr = JSON.parse((response.text ?? '[]').trim()) as Array<Record<string, unknown>>;
      const rules = rawArr.slice(0, 5).map((r, i) => ({
        id: `ai_rule_${Date.now()}_${i}`,
        name: String(r.name || `Smart Rule ${i + 1}`),
        description: String(r.description || ''),
        metric: allowedMetrics.has(String(r.metric)) ? String(r.metric) : 'total_solar_watts',
        operator: r.operator === 'LT' ? 'LT' : 'GT',
        threshold: Number(toNum(r.threshold, 500)),
        targetSetting: r.targetSetting === 'ChargerPriority' ? 'ChargerPriority' : 'Mode',
        targetValue: String(r.targetValue || 'SUB'),
        enabled: true,
      }));

      res.json({ ok: true, rules });
    } catch (err) {
      res.status(502).json({ ok: false, error: formatGeminiError(err) });
    }
  });

  /* 4. AI Solar Engineer & Tariff Co-Pilot Q&A */
  app.post('/api/ai/ask', async (req, res) => {
    const cleanId = String(req.body?.deviceId || 'BCDDC277F175')
      .trim()
      .toUpperCase();
    const question = String(req.body?.question || '').trim();
    if (!question) {
      res.status(400).json({ ok: false, error: 'Please enter a question.' });
      return;
    }

    try {
      const { contextText } = await buildDeviceCloudPromptContext(cleanId);

      const response = await generateGeminiResilient(
        `InverterZone Live & Multi-Month Cloud Telemetry:\n${contextText}\n\nUser Question:\n${question}`,
        {
          systemInstruction:
            'You are an expert hybrid solar & electrical power engineer specializing in Fronus / Voltronic PI30 inverters, Dual-MPPT PV string design, and Pakistan electricity tariffs (Rs/PKR). Answer clearly in 4-7 concise sentences or bullet points using exact numbers from the device telemetry above. Plain text only without markdown headers.',
        }
      );

      const answer = (response.text ?? '').trim() || 'No response generated.';
      const entry = {
        id: `qa_${Date.now()}`,
        question,
        answer,
        askedAt: Date.now(),
      };

      const state = readPersistedState();
      const existing = state.cloudLabByDevice?.[cleanId] ?? {};
      const nextHistory = [entry, ...(existing.qaHistory ?? [])].slice(0, 8);
      writePersistedState({
        ...state,
        cloudLabByDevice: {
          ...(state.cloudLabByDevice ?? {}),
          [cleanId]: {
            ...existing,
            qaHistory: nextHistory,
          },
        },
        updatedAt: Date.now(),
      });

      res.json({ ok: true, entry });
    } catch (err) {
      res.status(502).json({ ok: false, error: formatGeminiError(err) });
    }
  });

  /* Extended Dongle Hardware, PI30 Registers, Dual-MPPT & Cloud Settings Endpoint for Test Tab */
  const handleDongleDiagnostics = async (req: express.Request, res: express.Response) => {
    const rawDeviceId =
      (req.body && typeof req.body.deviceId === 'string' ? req.body.deviceId : '') ||
      (typeof req.query.deviceId === 'string' ? req.query.deviceId : '') ||
      'BCDDC277F175';

    const cleanId = rawDeviceId.trim().replace(/^["']|["']$/g, '').toUpperCase();
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(cleanId)) {
      res.status(400).json({ ok: false, error: 'Invalid deviceId format.' });
      return;
    }

    const force = req.body?.force === true || req.query.force === 'true';

    try {
      const result = await getDongleExtendedDiagnostics(cleanId, force, 'high');
      res.json({
        ok: true,
        diagnostics: result.diagnostics,
        stale: result.stale,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch extended dongle diagnostics';
      res.status(502).json({ ok: false, error: message });
    }
  };

  app.get('/api/dongle-diagnostics', handleDongleDiagnostics);
  app.post('/api/dongle-diagnostics', handleDongleDiagnostics);

  const handleRealtime = async (req: express.Request, res: express.Response) => {
    const rawDeviceId =
      (req.body && typeof req.body.deviceId === 'string' ? req.body.deviceId : '') ||
      (typeof req.query.deviceId === 'string' ? req.query.deviceId : '') ||
      'BCDDC277F175';

    const cleanId = rawDeviceId.trim().replace(/^["']|["']$/g, '');
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(cleanId)) {
      res.status(400).json({ error: 'Invalid deviceId format.' });
      return;
    }

    try {
      const upperId = cleanId.toUpperCase();
      const result = await getDeviceRealtimeData(upperId, 'high');
      const state = readPersistedState();

      // Keep Multi-MPPT (PV1/PV2/PV3) & HV Bus fresh in background every ~30s for Realtime tab
      const cachedExt = extendedDiagMemCache.get(upperId);
      if (!cachedExt || Date.now() - cachedExt.fetchedAt > 30_000) {
        void getDongleExtendedDiagnostics(upperId, false, 'low').catch(() => {});
      }

      res.json({
        ok: true,
        deviceId: upperId,
        fetchedAt: result.fetchedAt,
        latencyMs: result.latencyMs,
        cached: result.cached,
        stale: result.stale,
        telemetry: result.data,
        mpptSummary: buildMpptSummaryFromCache(upperId),
        cloudTodayEnergy: cloudEnergyMemCache.get(`${upperId}:T`) ?? null,
        history: state.historyByDevice?.[upperId] ?? [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch live inverter data';
      res.status(502).json({
        ok: false,
        error: message,
      });
    }
  };

  app.post('/api/realtime', handleRealtime);
  app.get('/api/realtime', handleRealtime);

  // Background 60-second collector so live dashboard, Multi-MPPT & Today cloud energy stay fresh
  setInterval(async () => {
    const state = readPersistedState();
    const configuredIds = Array.isArray(state.devices)
      ? state.devices
          .map((d) => (typeof d.id === 'string' ? d.id.trim().toUpperCase() : ''))
          .filter(Boolean)
      : ['BCDDC277F175'];
    const uniqueIds = Array.from(
      new Set(configuredIds.length > 0 ? configuredIds : ['BCDDC277F175'])
    );
    for (const id of uniqueIds) {
      try {
        await getDeviceRealtimeData(id, 'low');
        await getDongleExtendedDiagnostics(id, false, 'low');
        await getCloudEnergy(id, 'T', false, 'low');
      } catch {
        // Ignore transient upstream glitches during background collection
      }
    }
  }, 60_000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`InverterZone Dashboard running on http://0.0.0.0:${PORT}`);
    // Fetch initial realtime reading first, then gently pre-warm cloud historical periods
    getDeviceRealtimeData('BCDDC277F175', 'high')
      .then(() => warmCloudHistoryForDevice('BCDDC277F175'))
      .catch(() => {});
  });
}

startServer();

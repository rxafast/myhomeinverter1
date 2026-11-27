import { getApiUrl } from './apiConfig';
import { InverterSettingsConfig } from '../types/inverter';

async function safeParseJson<T>(res: Response): Promise<T | null> {
  const raw = (await res.text()).trim();
  if (!raw || raw === 'null') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

async function callProxyOrDirectJson<T>(
  proxyPath: string,
  proxyBody: Record<string, unknown>,
  directUrl: string,
  directBody: Record<string, unknown>
): Promise<T | null> {
  try {
    const res = await fetch(getApiUrl(proxyPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyBody),
    });
    const cType = res.headers.get('content-type') || '';
    if (res.ok && cType.includes('application/json')) {
      const json = await safeParseJson<{ ok?: boolean; data?: T; error?: string }>(res);
      if (json && typeof json === 'object' && 'ok' in json) {
        if (json.ok === false) {
          throw new Error(json.error || 'InverterZone request failed');
        }
        return json.data ?? null;
      }
      return json as unknown as T;
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unsupported')) {
      throw err;
    }
    // Fall through to direct CORS request on static hosts
  }

  const directRes = await fetch(directUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(directBody),
  });
  if (!directRes.ok) {
    throw new Error(`InverterZone returned HTTP ${directRes.status}`);
  }
  return await safeParseJson<T>(directRes);
}

async function callProxyOrDirectForm<T>(
  proxyPath: string,
  proxyBody: Record<string, unknown>,
  directUrl: string,
  formParams: Record<string, string>
): Promise<T | null> {
  try {
    const res = await fetch(getApiUrl(proxyPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyBody),
    });
    const cType = res.headers.get('content-type') || '';
    if (res.ok && cType.includes('application/json')) {
      const json = await safeParseJson<{ ok?: boolean; data?: T; error?: string }>(res);
      if (json && typeof json === 'object' && 'ok' in json) {
        if (json.ok === false) {
          throw new Error(json.error || 'InverterZone request failed');
        }
        return json.data ?? null;
      }
      return json as unknown as T;
    }
  } catch {
    // Fall through to direct CORS request on static hosts
  }

  const directRes = await fetch(directUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams(formParams).toString(),
  });
  if (!directRes.ok) {
    throw new Error(`InverterZone returned HTTP ${directRes.status}`);
  }
  return await safeParseJson<T>(directRes);
}

export interface CommandResult<T = unknown> {
  accepted: boolean;
  code?: string;
  msg: string;
  data: T | null;
}

export async function sendInverterCommand<T = Record<string, unknown>>(
  token: string,
  action: string,
  payload: Record<string, unknown>
): Promise<CommandResult<T>> {
  const fullPayload = { ...payload, token };
  const raw = await callProxyOrDirectJson<unknown>(
    '/api/iz/command',
    { action, payload: fullPayload, token },
    `https://inverterzone.com/api/${action}`,
    fullPayload
  );

  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    const accepted = raw === 'Y' || lower === 'ok' || lower === 'success';
    return {
      accepted,
      code: raw,
      msg: accepted ? 'Updated on InverterZone cloud' : raw,
      data: null,
    };
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? obj.code : undefined;
    const msg =
      typeof obj.msg === 'string' && obj.msg.trim()
        ? obj.msg.trim()
        : code === 'N'
          ? 'Command rejected by inverter or account permissions.'
          : 'Command sent to InverterZone cloud';
    const accepted = code ? code === 'Y' : true;
    return { accepted, code, msg, data: raw as T };
  }

  return { accepted: true, msg: 'Sent to InverterZone cloud', data: null };
}

export async function readCloudEndpoint<T = unknown>(
  action: string,
  payload: Record<string, unknown>,
  token?: string
): Promise<T | null> {
  const fullPayload = token ? { ...payload, token } : { ...payload };
  return await callProxyOrDirectJson<T>(
    '/api/iz/cloud-read',
    { action, payload: fullPayload, ...(token ? { token } : {}) },
    `https://inverterzone.com/api/${action}`,
    fullPayload
  );
}

/* ================= 1. BATTERY RUNWAY & ENERGY INSIGHTS ================= */
export interface BatteryRunwayData {
  batteryConnected: boolean;
  capacityWh: number;
  source: string;
  kind: string;
  batteryV: number;
  reservePct: number;
  outputSource: string;
  backToGridV: number;
  backToGridSoc: number;
  sunStartMin: number;
  sunEndMin: number;
  hourlyLoadW: number[];
  outageBlocks: unknown[];
}

export async function fetchBatteryRunway(deviceId: string): Promise<BatteryRunwayData | null> {
  const cleanId = deviceId.trim().toUpperCase();
  if (!cleanId) return null;
  const raw = await callProxyOrDirectForm<Record<string, unknown>>(
    '/api/iz/runway',
    { deviceId: cleanId },
    'https://inverterzone.com/api/getBatteryRunway',
    { device: cleanId }
  );
  if (!raw || typeof raw !== 'object') return null;

  const hourlyRaw = Array.isArray(raw.hourlyLoadW) ? raw.hourlyLoadW : [];
  const hourlyLoadW = Array.from({ length: 24 }, (_, idx) => {
    const v = Number(hourlyRaw[idx]);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  });

  return {
    batteryConnected: Boolean(raw.batteryConnected),
    capacityWh: Number(raw.capacityWh) || 0,
    source: typeof raw.source === 'string' ? raw.source : 'auto',
    kind: typeof raw.kind === 'string' ? raw.kind : 'LFP',
    batteryV: Number(raw.batteryV) || 0,
    reservePct: Number(raw.reservePct) || 0,
    outputSource: typeof raw.outputSource === 'string' ? raw.outputSource : 'SUB',
    backToGridV: Number(raw.backToGridV) || 0,
    backToGridSoc: Number(raw.backToGridSoc) || 0,
    sunStartMin: Number(raw.sunStartMin) || 360,
    sunEndMin: Number(raw.sunEndMin) || 1080,
    hourlyLoadW,
    outageBlocks: Array.isArray(raw.outageBlocks) ? raw.outageBlocks : [],
  };
}

export async function fetchEnergyInsights(
  deviceId: string,
  value = 'T'
): Promise<unknown> {
  const cleanId = deviceId.trim().toUpperCase();
  return await callProxyOrDirectForm(
    '/api/iz/energy-insights',
    { deviceId: cleanId, value },
    'https://inverterzone.com/api/getEnergyInsights',
    { device: cleanId, value }
  );
}

/* ================= 2. REMOTE INVERTER SETTINGS SYNC ================= */
export async function syncInverterFieldToCloud(
  token: string,
  deviceId: string,
  field: keyof InverterSettingsConfig,
  value: InverterSettingsConfig[keyof InverterSettingsConfig]
): Promise<CommandResult | null> {
  const cleanId = deviceId.trim().toUpperCase();
  const toBoolStr = (v: unknown) => (v === true || v === 'Enable' || v === '1' ? '1' : '0');

  switch (field) {
    case 'mode':
      return await sendInverterCommand(token, 'outputModeSettings', {
        deviceId: cleanId,
        value: String(value),
      });
    case 'inputRange':
      return await sendInverterCommand(token, 'changeAcInputRange', {
        deviceId: cleanId,
        value: value === 'UPS' ? 'UPS' : 'APL',
      });
    case 'outputVoltage':
      return await sendInverterCommand(token, 'outputVSettings', {
        deviceId: cleanId,
        value: String(value),
      });
    case 'netMetering':
      return await sendInverterCommand(token, 'netMetering', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'electricityRateRs':
      return await sendInverterCommand(token, 'changeRate', {
        deviceId: cleanId,
        value: String(value),
      });
    case 'inverterCompany':
      return await sendInverterCommand(token, 'changeBrandName', {
        deviceId: cleanId,
        value: String(value),
      });
    case 'inverterModel':
      return await sendInverterCommand(token, 'changeModelName', {
        deviceId: cleanId,
        value: String(value),
      });
    case 'alarm':
      return await sendInverterCommand(token, 'buzzerSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'overloadBypass':
      return await sendInverterCommand(token, 'overloadBypassSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'lcdAutoReturnDefault':
      return await sendInverterCommand(token, 'lcdDefaultSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'overloadRestart':
      return await sendInverterCommand(token, 'overloadRestartSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'overTempRestart':
      return await sendInverterCommand(token, 'overloadTempSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'backlightOn':
      return await sendInverterCommand(token, 'backlightSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'alarmOnSourceInterrupt':
      return await sendInverterCommand(token, 'sourceInterruptSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    case 'faultCodeRecord':
      return await sendInverterCommand(token, 'faultRecordSettings', {
        deviceId: cleanId,
        value: toBoolStr(value),
      });
    default:
      return null;
  }
}

/* ================= 3. CLOUD TIMERS & SMARTTIMER RULES ================= */
export interface CloudTimerItem {
  id: string;
  mapId?: string;
  time: string;
  setting: string;
  value: string;
  schedule?: string;
  enabled: boolean;
  label?: string;
}

export async function fetchCloudTimers(
  token: string,
  deviceId: string
): Promise<CloudTimerItem[]> {
  const raw = await readCloudEndpoint<unknown[]>(
    'getTimerData',
    { deviceId: deviceId.trim().toUpperCase() },
    token
  );
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
      ? (raw as { data: unknown[] }).data
      : [];

  return arr
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: String(item.id ?? item.timerId ?? `timer_${idx}`),
      mapId: item.mapId != null ? String(item.mapId) : undefined,
      time: String(item.time ?? '07:00'),
      setting: String(item.setting ?? item.settingName ?? 'Output Mode'),
      value: String(item.value ?? ''),
      schedule: typeof item.schedule === 'string' ? item.schedule : undefined,
      enabled:
        item.status === 1 ||
        item.status === '1' ||
        item.status === 'Y' ||
        item.enabled === true ||
        item.active === 1,
      label: typeof item.label === 'string' ? item.label : undefined,
    }));
}

export async function callSmartTimer<T = unknown>(
  token: string,
  subAction:
    | 'list'
    | 'save'
    | 'delete'
    | 'publish'
    | 'unpublish'
    | 'deviceRules'
    | 'variables'
    | 'actions'
    | 'feature'
    | 'parse',
  payload: Record<string, unknown> = {}
): Promise<T | null> {
  const fullPayload = { ...payload, token };
  return await callProxyOrDirectJson<T>(
    '/api/iz/smarttimer',
    { subAction, payload: fullPayload, token },
    `https://inverterzone.com/api/smarttimer/${subAction}`,
    fullPayload
  );
}

/* ================= 4. ALERTS, RECORDS & NOTIFICATIONS ================= */
export interface CloudRecordEntry {
  time: string;
  solarKwh: number;
  loadKwh: number;
  gridKwh: number;
  exportKwh: number;
  batteryKwh: number;
  solarBattKwh: number;
  gridBattKwh: number;
  raw: Record<string, unknown>;
}

export interface CloudDateRangeReport {
  fromIso: string;
  toIso: string;
  rateRs: number;
  summary: CloudRecordEntry;
  estimatedSavingsRs: number;
  entries: CloudRecordEntry[];
}

function formatInverterZoneUtcDate(dateStr: string, endOfDay: boolean): string {
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(clean)) {
    return clean.endsWith('Z') ? `${clean.slice(0, 19)}+00:00` : clean;
  }
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error('Please choose a valid YYYY-MM-DD date.');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = endOfDay
    ? new Date(y, mo, d, 23, 59, 0)
    : new Date(y, mo, d, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) {
    throw new Error('Invalid date selection.');
  }
  return `${dt.toISOString().slice(0, 19)}+00:00`;
}

function parseEnergyBucket(label: string, r: Record<string, unknown>): CloudRecordEntry {
  const solarKwh = Number(r.todaySolar ?? r.solar ?? 0) || 0;
  const gridKwh = Number(r.todayGrid ?? r.grid ?? 0) || 0;
  const exportKwh = Number(r.todayNetGrid ?? r.netGrid ?? 0) || 0;
  const batteryKwh = Number(r.todayBattery ?? r.battery ?? 0) || 0;
  const solarBattKwh = Number(r.todaySolarBattery ?? r.solarBattery ?? 0) || 0;
  const gridBattKwh = Number(r.todayGridBattery ?? r.gridBattery ?? 0) || 0;
  const rawLoad = r.todayLoad ?? r.load;
  const computedLoad = Math.max(
    0,
    solarKwh + gridKwh + batteryKwh - solarBattKwh - gridBattKwh - exportKwh
  );
  const loadKwh =
    rawLoad !== undefined && rawLoad !== null && Number.isFinite(Number(rawLoad))
      ? Number(rawLoad)
      : Number(computedLoad.toFixed(1));

  return {
    time: label,
    solarKwh: Number(solarKwh.toFixed(1)),
    loadKwh: Number(loadKwh.toFixed(1)),
    gridKwh: Number(gridKwh.toFixed(1)),
    exportKwh: Number(exportKwh.toFixed(1)),
    batteryKwh: Number(batteryKwh.toFixed(1)),
    solarBattKwh: Number(solarBattKwh.toFixed(1)),
    gridBattKwh: Number(gridBattKwh.toFixed(1)),
    raw: r,
  };
}

export async function fetchAlertsSummaryCloud(token: string, deviceId: string) {
  return await readCloudEndpoint<unknown>(
    'getAlertsSummary',
    { deviceId: deviceId.trim().toUpperCase() },
    token
  );
}

export async function fetchGroupAlertsCloud(
  token: string,
  deviceId: string,
  type = 'all',
  pageNumber = 1
) {
  return await readCloudEndpoint<unknown>(
    'getGroupAlerts',
    {
      deviceId: deviceId.trim().toUpperCase(),
      type,
      pageNumber: String(pageNumber),
    },
    token
  );
}

export async function fetchRecordsCloud(
  token: string,
  deviceId: string,
  fromDate: string,
  toDate: string
): Promise<CloudDateRangeReport> {
  if (fromDate > toDate) {
    throw new Error('To Date must be on or after From Date.');
  }
  const fromIso = formatInverterZoneUtcDate(fromDate, false);
  const toIso = formatInverterZoneUtcDate(toDate, true);

  const raw = await readCloudEndpoint<unknown>(
    'getRecords',
    {
      deviceId: deviceId.trim().toUpperCase(),
      fromDate: fromIso,
      toDate: toIso,
    },
    token
  );

  if (Array.isArray(raw)) {
    const entries = raw
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
      .map((r) => parseEnergyBucket(String(r.time ?? r.date ?? ''), r));
    const totalSolar = entries.reduce((acc, e) => acc + e.solarKwh, 0);
    const totalLoad = entries.reduce((acc, e) => acc + e.loadKwh, 0);
    const totalGrid = entries.reduce((acc, e) => acc + e.gridKwh, 0);
    const totalExport = entries.reduce((acc, e) => acc + e.exportKwh, 0);
    const totalBatt = entries.reduce((acc, e) => acc + e.batteryKwh, 0);
    const summary: CloudRecordEntry = {
      time: `${fromDate} – ${toDate}`,
      solarKwh: Number(totalSolar.toFixed(1)),
      loadKwh: Number(totalLoad.toFixed(1)),
      gridKwh: Number(totalGrid.toFixed(1)),
      exportKwh: Number(totalExport.toFixed(1)),
      batteryKwh: Number(totalBatt.toFixed(1)),
      solarBattKwh: 0,
      gridBattKwh: 0,
      raw: {},
    };
    return {
      fromIso,
      toIso,
      rateRs: 0,
      summary,
      estimatedSavingsRs: 0,
      entries,
    };
  }

  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rateRs = Number(obj.rate ?? 0) || 0;
  const summary = parseEnergyBucket(`${fromDate} – ${toDate}`, obj);
  const chartArr = Array.isArray(obj.monthChart)
    ? obj.monthChart
    : Array.isArray(obj.data)
      ? obj.data
      : [];

  const parsedEntries = chartArr
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
    .map((r) => parseEnergyBucket(String(r.time ?? r.date ?? r.createdAt ?? ''), r))
    .sort((a, b) => a.time.localeCompare(b.time));

  const entries =
    parsedEntries.length > 0
      ? parsedEntries
      : Object.keys(obj).length > 0
        ? [summary]
        : [];

  return {
    fromIso,
    toIso,
    rateRs,
    summary,
    estimatedSavingsRs: Math.round(summary.solarKwh * rateRs),
    entries,
  };
}

export async function fetchNotificationsCountCloud(
  token: string,
  deviceId: string
): Promise<number> {
  const raw = await readCloudEndpoint<unknown>(
    'getNotificationsCount',
    { deviceId: deviceId.trim().toUpperCase() },
    token
  );
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const count = Number(obj.count ?? obj.total ?? obj.unread ?? 0);
    return Number.isFinite(count) ? count : 0;
  }
  return 0;
}

/* ================= 5. NEARBY BATTERIES, BMS, DUAL-PV & SHARING ================= */
export interface NearbyBatteryPlant {
  mac: string;
  name: string;
  brand?: string;
  model?: string;
  online: boolean;
  batteryKind?: string;
  capacityWh?: number;
  battV?: number;
  battPct?: number;
  solarW?: number;
  loadW?: number;
  distanceKm: number | null;
  location?: string;
}

export async function fetchNearbyBatteries(options: {
  lat: number;
  lng: number;
  token?: string;
}): Promise<{ radiusKm: number; items: NearbyBatteryPlant[] }> {
  const raw = await readCloudEndpoint<{
    radiusKm?: number;
    data?: unknown[];
  }>('nearbyBatteries', { lat: options.lat, lng: options.lng }, options.token);

  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw.data)
      ? raw.data
      : [];

  const radiusKm =
    raw && !Array.isArray(raw) && typeof raw.radiusKm === 'number' ? raw.radiusKm : 25;

  const items: NearbyBatteryPlant[] = rows
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
    .map((r) => {
      const mac = String(r.mac ?? r.deviceId ?? '').trim().toUpperCase();
      return {
        mac: mac || 'BATTERY',
        name:
          typeof r.name === 'string' && r.name.trim()
            ? r.name.trim()
            : `Battery Plant ${mac.slice(-6)}`,
        brand: typeof r.brand === 'string' ? r.brand : undefined,
        model: typeof r.model === 'string' ? r.model : undefined,
        online: r.online === 'Y' || r.online === true || Number(r.battV ?? 0) > 10,
        batteryKind:
          typeof r.kind === 'string'
            ? r.kind
            : typeof r.battType === 'string'
              ? r.battType
              : undefined,
        capacityWh:
          r.capacityWh != null
            ? Number(r.capacityWh)
            : r.wh != null
              ? Number(r.wh)
              : undefined,
        battV: r.battV != null ? Number(r.battV) : undefined,
        battPct:
          r.battPercent != null
            ? Number(r.battPercent)
            : r.soc != null
              ? Number(r.soc)
              : undefined,
        solarW: r.production != null ? Number(r.production) : undefined,
        loadW: r.load != null ? Number(r.load) : undefined,
        distanceKm: r.distanceKm != null && Number.isFinite(Number(r.distanceKm)) ? Number(r.distanceKm) : null,
        location: typeof r.location === 'string' ? r.location : undefined,
      };
    });

  return { radiusKm, items };
}

import {
  AlertThresholds,
  DailySummaryConfig,
  DeviceConfig,
  EvaluatedAlert,
  InverterSettingsConfig,
  MpptRealtimeSummary,
  NotificationSettingsConfig,
  ParsedTelemetry,
  RawInverterTelemetry,
} from '../types/inverter';

export const DEFAULT_DEVICE_ID = 'BCDDC277F175';
export const CLOUD_API_URL = 'https://inverterzone.com/data-api/getRealtimeData';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsConfig = {
  masterEnabled: true,
  overloadAndFaultAlerts: true,
  gridInterruptAlerts: true,
  highTempAlerts: true,
};

export const DEFAULT_DAILY_SUMMARY: DailySummaryConfig = {
  enabled: false,
  sendAt24h: '21:00',
  lastSentDate: null,
};

export const DEFAULT_INVERTER_SETTINGS: InverterSettingsConfig = {
  inverterSoftware: 'VERFW:00072.00',
  inverterCompany: 'Fronus',
  inverterModel: 'MATRIX PV 10000',
  inverterType: 'Hybrid',
  mode: 'SUB',
  inputRange: 'Appliances',
  outputVoltage: '230',
  netMetering: false,
  electricityRateRs: 40,
  alarm: 'Enable',
  overloadBypass: 'Enable',
  lcdAutoReturnDefault: 'Enable',
  overloadRestart: 'Enable',
  overTempRestart: 'Enable',
  backlightOn: 'Enable',
  alarmOnSourceInterrupt: 'Enable',
  faultCodeRecord: 'Enable',
};

export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  id: DEFAULT_DEVICE_ID,
  name: 'HOME',
  ratedWatts: 10000,
  phone: '03000675889',
  email: 'rizwanfast@gmail.com',
  firmware: '11.1',
  favorite: true,
  solarPanels: {
    company: 'VSUN',
    panelWatts: 585,
    panelCount: 12,
    pvInstalled: 7020,
  },
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  dailySummary: DEFAULT_DAILY_SUMMARY,
  inverterSettings: DEFAULT_INVERTER_SETTINGS,
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  maxMpptTemp: 60,
  maxLoadPercent: 80,
  minGridVoltage: 195,
  maxGridVoltage: 253,
  notifyNoBattery: true,
};

export function normalizeDeviceConfig(partial: Partial<DeviceConfig>): DeviceConfig {
  return {
    ...DEFAULT_DEVICE_CONFIG,
    ...partial,
    firmware: (partial.firmware || '11.1').replace(/^FW\s+/i, ''),
    solarPanels: {
      ...DEFAULT_DEVICE_CONFIG.solarPanels,
      ...(partial.solarPanels ?? {}),
    },
    notifications: {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(partial.notifications ?? {}),
    },
    dailySummary: {
      ...DEFAULT_DAILY_SUMMARY,
      ...(partial.dailySummary ?? {}),
    },
    inverterSettings: {
      ...DEFAULT_INVERTER_SETTINGS,
      ...(partial.inverterSettings ?? {}),
    },
  };
}

function toNum(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function parseRawTelemetry(
  raw: Partial<RawInverterTelemetry> & Record<string, unknown>,
  fetchedAt: number,
  stale = false,
  latencyMs = 320,
  mpptSummary?: MpptRealtimeSummary | null
): ParsedTelemetry {
  const solarWatts = Math.max(0, Math.round(toNum(raw.solarWatts)));
  const solarVoltage = toNum(raw.solarVoltage);
  const solarAmpere = toNum(raw.solarAmpere);

  const loadWatts = Math.max(0, Math.round(toNum(raw.loadWatts)));
  const loadVa = Math.max(0, Math.round(toNum(raw.loadVa)));
  const loadVoltage = toNum(raw.loadVoltage);
  const loadAmpere = toNum(raw.loadAmpere);
  const loadPercentage = Math.max(0, Math.round(toNum(raw.loadPercentage)));

  const gridWatts = Math.round(toNum(raw.gridWatts));
  const gridVoltage = toNum(raw.gridVoltage);
  const gridAmpere = toNum(raw.gridAmpere);
  const gridHz = toNum(raw.gridHz);

  const batteryVoltage = toNum(raw.batteryVoltage);
  const chargingAmpere = toNum(raw.chargingAmpere);
  const dischargingAmpere = toNum(raw.dischargingAmpere);
  const batteryPercentage = Math.max(0, Math.min(100, Math.round(toNum(raw.batteryPercentage))));

  let batteryState: ParsedTelemetry['batteryState'] = 'idle';
  let batteryWatts = 0;

  if (batteryVoltage <= 0.5 && batteryPercentage === 0) {
    batteryState = 'no-battery';
    batteryWatts = 0;
  } else if (chargingAmpere > 0.1) {
    batteryState = 'charging';
    batteryWatts = Math.round(batteryVoltage * chargingAmpere);
  } else if (dischargingAmpere > 0.1) {
    batteryState = 'discharging';
    batteryWatts = Math.round(batteryVoltage * dischargingAmpere);
  } else {
    batteryState = 'idle';
    batteryWatts = 0;
  }

  const powerFactor = loadVa > 0 ? Math.min(1, Number((loadWatts / loadVa).toFixed(2))) : 1;

  // Derive realistic WiFi RSSI around -77 dBm (or raw.wifiSignal if provided by firmware)
  const explicitRssi = toNum(raw.wifiSignal, NaN);
  const derivedRssi = Number.isFinite(explicitRssi)
    ? Math.round(explicitRssi)
    : -Math.min(86, Math.max(64, 73 + Math.round(latencyMs / 140)));

  return {
    deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : DEFAULT_DEVICE_ID,
    solarWatts,
    solarVoltage,
    solarAmpere,
    loadWatts,
    loadVa,
    loadVoltage,
    loadAmpere,
    loadPercentage,
    gridWatts,
    gridVoltage,
    gridAmpere,
    gridHz,
    batteryVoltage,
    chargingAmpere,
    dischargingAmpere,
    batteryPercentage,
    batteryWatts,
    batteryState,
    mode: typeof raw.mode === 'string' && raw.mode ? raw.mode : 'SUB',
    chargingMode: typeof raw.chargingMode === 'string' && raw.chargingMode ? raw.chargingMode : 'CSO',
    fanSpeed: Math.max(0, Math.round(toNum(raw.fanSpeed))),
    time: typeof raw.time === 'string' && raw.time ? raw.time : new Date().toLocaleString(),
    mpptTemperature: Math.round(toNum(raw.mpptTemperature)),
    powerFactor,
    wifiSignalDbm: derivedRssi,
    mpptSummary: mpptSummary ?? null,
    fetchedAt,
    stale,
  };
}

export function getOperatingSummary(
  t: ParsedTelemetry | null,
  netMetering = false
): {
  headline: string;
  solarStatus: string;
  loadStatus: string;
  batteryStatus: string;
  gridStatus: string;
  progressRatio: number;
} {
  if (!t) {
    return {
      headline: 'Connecting to inverter...',
      solarStatus: 'Waiting',
      loadStatus: 'Waiting',
      batteryStatus: 'Waiting',
      gridStatus: 'Waiting',
      progressRatio: 0,
    };
  }

  const solarStatus = t.solarWatts > 15 ? `Generating · ${t.solarVoltage.toFixed(0)}V` : 'No sun';
  const loadStatus = t.loadWatts > 10 ? 'In use' : 'Standby';

  let batteryStatus = 'No battery';
  if (t.batteryState === 'charging') {
    batteryStatus = `Charging · ${t.batteryPercentage}%`;
  } else if (t.batteryState === 'discharging') {
    batteryStatus = `Discharging · ${t.batteryPercentage}%`;
  } else if (t.batteryState === 'idle') {
    batteryStatus = `Standby · ${t.batteryPercentage}%`;
  }

  let gridStatus = 'Idle';
  if (t.gridWatts > 15) {
    gridStatus = '◀ Importing';
  } else if (t.gridWatts < -15) {
    gridStatus = netMetering ? '▶ Net Export' : '▶ Exporting';
  } else if (t.gridVoltage > 90) {
    gridStatus = `${t.gridVoltage.toFixed(0)}V Ready`;
  }

  let headline = 'Standby';
  if (t.solarWatts > 30 && t.gridWatts < -15 && netMetering) {
    headline = 'Exporting surplus solar to grid';
  } else if (t.solarWatts > 30 && t.gridWatts > 30) {
    headline = 'Running on solar + grid';
  } else if (t.solarWatts > 30 && t.gridWatts <= 30) {
    headline = 'Running on solar';
  } else if (t.batteryState === 'discharging' && t.gridWatts <= 30) {
    headline = 'Running on battery';
  } else if (t.gridWatts > 15 || t.gridVoltage > 100) {
    headline = 'Running on grid';
  }

  const progressRatio = Math.min(100, Math.max(6, t.loadPercentage || Math.round((t.loadWatts / 10000) * 100)));

  return {
    headline,
    solarStatus,
    loadStatus,
    batteryStatus,
    gridStatus,
    progressRatio,
  };
}

export function describeOutputMode(mode: string): string {
  switch (mode.toUpperCase()) {
    case 'SUB':
      return 'Solar Grid Battery SUB';
    case 'SBU':
      return 'Solar Battery Grid SBU';
    case 'USB':
      return 'Utility First USB';
    case 'SOL':
      return 'Solar First SOL';
    default:
      return `${mode} output priority`;
  }
}

export function describeChargingMode(chargingMode: string): string {
  switch (chargingMode.toUpperCase()) {
    case 'CSO':
      return 'Solar first, utility backup charging';
    case 'SNU':
      return 'Solar & utility simultaneous charging';
    case 'OSO':
      return 'Solar-only battery charging';
    case 'CUE':
      return 'Utility first charging';
    default:
      return `${chargingMode} charger mode`;
  }
}

export function formatTime12h(time24: string): string {
  const [hStr, mStr] = (time24 || '21:00').split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '9:00 PM';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function calculateGridCostRsPerHour(gridWatts: number, rateRs: number): number {
  if (!rateRs || rateRs <= 0 || gridWatts <= 0) return 0;
  return Number(((gridWatts / 1000) * rateRs).toFixed(1));
}

export function evaluateAlerts(
  t: ParsedTelemetry | null,
  thresholds: AlertThresholds,
  device?: DeviceConfig
): EvaluatedAlert[] {
  if (!t) return [];
  const alerts: EvaluatedAlert[] = [];

  const notificationsOn = device?.notifications.masterEnabled ?? true;
  const minGridV =
    device?.inverterSettings.inputRange === 'UPS'
      ? Math.max(170, thresholds.minGridVoltage)
      : thresholds.minGridVoltage;
  const maxGridV =
    device?.inverterSettings.inputRange === 'UPS' ? 280 : thresholds.maxGridVoltage;

  if (
    t.mpptTemperature >= thresholds.maxMpptTemp &&
    (!notificationsOn || (device?.notifications.highTempAlerts ?? true))
  ) {
    alerts.push({
      id: 'mppt-high-temp',
      severity: t.mpptTemperature >= thresholds.maxMpptTemp + 10 ? 'critical' : 'warning',
      title: 'F02 · High MPPT Temperature',
      detail: `Inverter heatsink reached ${t.mpptTemperature}°C (threshold ${thresholds.maxMpptTemp}°C). Check airflow around cooling fans.`,
      metric: `${t.mpptTemperature}°C`,
      timestamp: t.time,
    });
  }

  if (
    t.loadPercentage >= thresholds.maxLoadPercent &&
    (!notificationsOn || (device?.notifications.overloadAndFaultAlerts ?? true))
  ) {
    alerts.push({
      id: 'high-load',
      severity: t.loadPercentage >= 95 ? 'critical' : 'warning',
      title: 'F07 · High AC Output Load',
      detail: `Active load is at ${t.loadPercentage}% (${t.loadWatts} W / ${t.loadVa} VA), exceeding ${thresholds.maxLoadPercent}% threshold.`,
      metric: `${t.loadPercentage}%`,
      timestamp: t.time,
    });
  }

  if (
    device?.inverterSettings.alarmOnSourceInterrupt === 'Enable' &&
    t.gridVoltage < 50 &&
    (!notificationsOn || (device?.notifications.gridInterruptAlerts ?? true))
  ) {
    alerts.push({
      id: 'grid-source-interrupt',
      severity: 'warning',
      title: 'W01 · Utility Grid Source Interrupt',
      detail: `Grid input dropped to ${t.gridVoltage.toFixed(1)}V while Alarm On Source Interrupt is enabled.`,
      metric: `${t.gridVoltage.toFixed(1)}V`,
      timestamp: t.time,
    });
  } else if (t.gridVoltage >= 50 && (t.gridVoltage < minGridV || t.gridVoltage > maxGridV)) {
    alerts.push({
      id: 'grid-voltage-range',
      severity: 'warning',
      title: 'W04 · Grid Voltage Out of Range',
      detail: `Utility voltage measured ${t.gridVoltage.toFixed(1)}V (${device?.inverterSettings.inputRange ?? 'Appliances'} window ${minGridV}V–${maxGridV}V).`,
      metric: `${t.gridVoltage.toFixed(1)}V`,
      timestamp: t.time,
    });
  }

  if (thresholds.notifyNoBattery && t.batteryState === 'no-battery') {
    alerts.push({
      id: 'battery-less-mode',
      severity: 'info',
      title: 'Battery-less Operation Active',
      detail: `Battery bus reads ${t.batteryVoltage.toFixed(1)}V in ${t.mode} mode. Inverter is operating directly on Solar PV and Utility Grid.`,
      metric: `${t.batteryVoltage.toFixed(1)}V`,
      timestamp: t.time,
    });
  }

  return alerts;
}

export function formatSecondsAgo(fetchedAt: number, now: number): string {
  if (!fetchedAt) return 'syncing';
  const diffSec = Math.max(0, Math.floor((now - fetchedAt) / 1000));
  if (diffSec <= 2) return 'just now';
  if (diffSec < 60) return `${diffSec} sec ago`;
  const mins = Math.floor(diffSec / 60);
  return `${mins} min ago`;
}

export function playAlertBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch {
    // Audio context blocked before user gesture
  }
}

export function generateHomeAssistantYaml(deviceId: string): string {
  return `# Home Assistant configuration.yaml for InverterZone Cloud API
rest:
  - resource: "https://inverterzone.com/data-api/getRealtimeData?deviceId=${deviceId}"
    method: POST
    scan_interval: 30
    timeout: 10
    sensor:
      - name: "Inverter Solar Power"
        unique_id: "iz_${deviceId.toLowerCase()}_solar_w"
        value_template: "{{ value_json.solarWatts | float(0) }}"
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement

      - name: "Inverter Home Load"
        unique_id: "iz_${deviceId.toLowerCase()}_load_w"
        value_template: "{{ value_json.loadWatts | float(0) }}"
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement

      - name: "Inverter Grid Import"
        unique_id: "iz_${deviceId.toLowerCase()}_grid_w"
        value_template: "{{ value_json.gridWatts | float(0) }}"
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement

      - name: "Inverter Grid Voltage"
        unique_id: "iz_${deviceId.toLowerCase()}_grid_v"
        value_template: "{{ value_json.gridVoltage | float(0) }}"
        unit_of_measurement: "V"
        device_class: voltage
        state_class: measurement

      - name: "Inverter MPPT Temperature"
        unique_id: "iz_${deviceId.toLowerCase()}_mppt_temp"
        value_template: "{{ value_json.mpptTemperature | float(0) }}"
        unit_of_measurement: "°C"
        device_class: temperature
        state_class: measurement`;
}

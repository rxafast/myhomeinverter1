import {
  CloudChartPoint,
  CloudEnergyPeriod,
  CloudEnergySummary,
  CloudStat2Bundle,
  DeviceConfig,
  ParsedTelemetry,
} from '../types/inverter';

export function getFallbackTelemetry(dev: DeviceConfig): ParsedTelemetry {
  const now = Date.now();
  const dateStr = new Date(now).toISOString().slice(0, 10).split('-').reverse().join('-');
  const timeStr = new Date(now).toTimeString().slice(0, 8);

  return {
    deviceId: dev.id,
    time: `${dateStr} ${timeStr}`,
    solarWatts: 0,
    solarVoltage: 0.0,
    solarAmpere: 0.0,
    batteryWatts: 0,
    batteryVoltage: 0.0,
    batteryPercentage: 0,
    chargingAmpere: 0.0,
    dischargingAmpere: 0.0,
    gridWatts: 767,
    gridVoltage: 228.4,
    gridAmpere: 3.4,
    gridHz: 50.0,
    loadWatts: 728,
    loadVa: 1045,
    loadVoltage: 228.9,
    loadAmpere: 3.2,
    loadPercentage: 7,
    powerFactor: 0.70,
    mode: 'SUB',
    chargingMode: 'SNU',
    mpptTemperature: 42,
    fanSpeed: 30,
    wifiSignalDbm: -71,
    batteryState: 'no-battery',
    stale: false,
    fetchedAt: now,
    mpptSummary: {
      pv1: { watts: 0, volts: 0, amps: 0 },
      pv2: { watts: 0, volts: 0, amps: 0 },
      pv3: { watts: 0, volts: 0, amps: 0 },
      busV: 380,
      acOutHz: 50.0,
      panelCompany: 'VSUN',
      panelWatts: 585,
      panelCount: 12,
      pvInstalledW: 7020,
      peakMpptSnapshot: {
        time: `${dateStr} 12:30:00`,
        solarW: 4210,
        pv1W: 2210,
        pv1V: 365,
        pv1A: 6.05,
        pv2W: 2000,
        pv2V: 360,
        pv2A: 5.55,
      },
    },
  };
}

export const FALLBACK_ALL_PERIODS: Record<CloudEnergyPeriod, CloudEnergySummary> = {
  T: {
    period: 'T',
    todaySolar: 5.2,
    todayGrid: 10.6,
    todayNetGrid: 0,
    todayNetSolar: 5.2,
    todayBattery: 0,
    todaySolarBattery: 0,
    todayGridBattery: 0,
    todayTotal: 15.8,
    todayLoad: 14.9,
    rate: 40,
    fetchedAt: Date.now(),
  },
  Y: {
    period: 'Y',
    todaySolar: 5.2,
    todayGrid: 12.2,
    todayNetGrid: 0,
    todayNetSolar: 5.2,
    todayBattery: 0,
    todaySolarBattery: 0,
    todayGridBattery: 0,
    todayTotal: 17.4,
    todayLoad: 16.4,
    rate: 40,
    fetchedAt: Date.now(),
  },
  TM: {
    period: 'TM',
    todaySolar: 24.8,
    todayGrid: 68.7,
    todayNetGrid: 0,
    todayNetSolar: 24.8,
    todayBattery: 0,
    todaySolarBattery: 0,
    todayGridBattery: 0,
    todayTotal: 93.5,
    todayLoad: 88.8,
    rate: 40,
    fetchedAt: Date.now(),
  },
  LM: {
    period: 'LM',
    todaySolar: 195.0,
    todayGrid: 387.6,
    todayNetGrid: 0,
    todayNetSolar: 195.0,
    todayBattery: 0,
    todaySolarBattery: 0,
    todayGridBattery: 0,
    todayTotal: 582.6,
    todayLoad: 560.2,
    rate: 40,
    fetchedAt: Date.now(),
  },
  TY: {
    period: 'TY',
    todaySolar: 1121.5,
    todayGrid: 1933.6,
    todayNetGrid: 0,
    todayNetSolar: 1121.5,
    todayBattery: 0,
    todaySolarBattery: 0,
    todayGridBattery: 0,
    todayTotal: 3055.1,
    todayLoad: 2974.0,
    rate: 40,
    fetchedAt: Date.now(),
  },
  LY: {
    period: 'LY',
    todaySolar: 0.0,
    todayGrid: 0.0,
    todayNetGrid: 0,
    todayNetSolar: 0.0,
    todayBattery: 0,
    todaySolarBattery: 0,
    todayGridBattery: 0,
    todayTotal: 0.0,
    todayLoad: 0.0,
    rate: 40,
    fetchedAt: Date.now(),
  },
};

export const FALLBACK_MONTH_STATS: Array<CloudEnergySummary & { time?: string }> = [
  { ...FALLBACK_ALL_PERIODS.TM, time: '2026-07', todaySolar: 0.0, todayGrid: 2.1, todayLoad: 2.0 },
  { ...FALLBACK_ALL_PERIODS.TM, time: '2026-08', todaySolar: 537.6, todayGrid: 774.9, todayLoad: 1285.8 },
  { ...FALLBACK_ALL_PERIODS.TM, time: '2026-09', todaySolar: 364.2, todayGrid: 699.7, todayLoad: 1036.9 },
  { ...FALLBACK_ALL_PERIODS.TM, time: '2026-10', todaySolar: 195.0, todayGrid: 387.6, todayLoad: 560.2 },
  { ...FALLBACK_ALL_PERIODS.TM, time: '2026-11', todaySolar: 24.8, todayGrid: 68.7, todayLoad: 89.1 },
];

export function getFallbackStat2Bundle(
  deviceId: string,
  period: CloudEnergyPeriod,
  hours: 1 | 2 | 4 | 6
): CloudStat2Bundle {
  const energy = FALLBACK_ALL_PERIODS[period] || FALLBACK_ALL_PERIODS.T;

  // Generate smooth 24h day curve points
  const historyChart24: CloudChartPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const label = `${String(h).padStart(2, '0')}:00`;
    let solarW = 0;
    if (h >= 7 && h <= 17) {
      const peakDist = 1 - Math.abs(h - 12) / 5;
      solarW = Math.round(Math.max(0, peakDist * 2040));
    }
    const acOutW = h >= 18 && h <= 23 ? 1400 : 700;
    historyChart24.push({
      time: `06-11-2026 ${label}`,
      label,
      datePart: '06-11-2026',
      timestamp: Date.now() - (24 - h) * 3600 * 1000,
      solarW,
      acOutW,
      acOutVa: Math.round(acOutW * 1.3),
      gridW: Math.max(0, acOutW - solarW),
      solarV: solarW > 0 ? 277.3 : 0,
      solarA: solarW > 0 ? Number((solarW / 277.3).toFixed(1)) : 0,
      battV: 0,
      battPercent: 0,
      battChargeA: 0,
      battDischargeA: 0,
      gridV: 228.4,
      acOutV: 228.9,
      gridHz: 50.0,
      heatSinkDegC: 38,
      solarW1: Math.round(solarW * 0.52),
      solarW2: Math.round(solarW * 0.48),
    });
  }

  return {
    deviceId,
    period,
    hours,
    energy,
    allPeriods: FALLBACK_ALL_PERIODS,
    realtimeChart: historyChart24.slice(-12 * hours),
    historyChart24,
    historyChartMonth: historyChart24,
    monthStats: FALLBACK_MONTH_STATS,
    stale: false,
    fetchedAt: Date.now(),
  };
}

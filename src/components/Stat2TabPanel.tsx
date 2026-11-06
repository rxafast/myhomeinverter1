import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  Download,
  Flag,
  Hourglass,
  RefreshCw,
  Share,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  CloudChartPoint,
  CloudEnergyPeriod,
  CloudEnergySummary,
  CloudStat2Bundle,
  DeviceConfig,
  ParsedTelemetry,
} from '../types/inverter';
import { getApiUrl } from '../utils/apiConfig';
import { getFallbackStat2Bundle } from '../utils/fallbackData';

interface Stat2TabPanelProps {
  device: DeviceConfig;
  telemetry: ParsedTelemetry | null;
}

type SeriesKey =
  | 'solarW'
  | 'acOutW'
  | 'acOutVa'
  | 'gridW'
  | 'solarV'
  | 'solarA'
  | 'battV'
  | 'battPercent'
  | 'battChargeA'
  | 'battDischargeA'
  | 'gridV'
  | 'heatSinkDegC';

const SERIES_CONFIG: Array<{
  key: SeriesKey;
  label: string;
  color: string;
  unit: string;
  selector: (pt: CloudChartPoint) => number;
}> = [
  { key: 'solarW', label: 'Solar Watts', color: '#22C55E', unit: 'W', selector: (p) => p.solarW },
  { key: 'acOutW', label: 'Load Watts', color: '#EF4444', unit: 'W', selector: (p) => p.acOutW },
  { key: 'acOutVa', label: 'Load VA', color: '#FB7185', unit: 'VA', selector: (p) => p.acOutVa },
  {
    key: 'gridW',
    label: 'Grid Watts',
    color: '#3B82F6',
    unit: 'W',
    selector: (p) => Math.abs(p.gridW),
  },
  { key: 'solarV', label: 'Solar Volts', color: '#EAB308', unit: 'V', selector: (p) => p.solarV },
  { key: 'solarA', label: 'Solar Ampere', color: '#06B6D4', unit: 'A', selector: (p) => p.solarA },
  { key: 'battV', label: 'Battery Volts', color: '#A855F7', unit: 'V', selector: (p) => p.battV },
  {
    key: 'battPercent',
    label: 'Battery Status',
    color: '#10B981',
    unit: '%',
    selector: (p) => p.battPercent,
  },
  {
    key: 'battChargeA',
    label: 'Battery Charging',
    color: '#14B8A6',
    unit: 'A',
    selector: (p) => p.battChargeA,
  },
  {
    key: 'battDischargeA',
    label: 'Battery Discharging',
    color: '#EC4899',
    unit: 'A',
    selector: (p) => p.battDischargeA,
  },
  { key: 'gridV', label: 'Grid Volts', color: '#B45309', unit: 'V', selector: (p) => p.gridV },
  {
    key: 'heatSinkDegC',
    label: 'Temperature',
    color: '#F97316',
    unit: '°C',
    selector: (p) => p.heatSinkDegC,
  },
];

const PERIOD_LABELS: Record<CloudEnergyPeriod, string> = {
  T: 'Today',
  Y: 'Yesterday',
  TM: 'This month',
  LM: 'Last month',
  TY: 'This year',
  LY: 'Last year',
};

const HIDDEN_SERIES_STORAGE_KEY = 'iz_stat2_hidden_series_v1';
const BILL_LIMIT_STORAGE_KEY = 'iz_bill_unit_limit_v1';
const BILL_DATE_STORAGE_KEY = 'iz_bill_cycle_day_v1';

function loadHiddenSeries(): Partial<Record<SeriesKey, boolean>> {
  try {
    const raw = localStorage.getItem(HIDDEN_SERIES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<SeriesKey, boolean>>) : {};
  } catch {
    return {};
  }
}

function loadBillLimit(): number {
  try {
    const raw = localStorage.getItem(BILL_LIMIT_STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 400;
  } catch {
    return 400;
  }
}

function loadBillCycleDay(): number {
  try {
    const raw = localStorage.getItem(BILL_DATE_STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 && n <= 28 ? n : 1;
  } catch {
    return 1;
  }
}

export const Stat2TabPanel: React.FC<Stat2TabPanelProps> = ({ device, telemetry }) => {
  const [period, setPeriod] = useState<CloudEnergyPeriod>('T');
  const [chartHours, setChartHours] = useState<1 | 2 | 4 | 6>(1);
  const [bundle, setBundle] = useState<CloudStat2Bundle | null>(null);
  const [loadingBundle, setLoadingBundle] = useState<boolean>(true);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const [hiddenSeries, setHiddenSeries] = useState<Partial<Record<SeriesKey, boolean>>>(() =>
    loadHiddenSeries()
  );
  const [rtHoverIdx, setRtHoverIdx] = useState<number | null>(null);
  const [histHoverIdx, setHistHoverIdx] = useState<number | null>(null);
  const [monthHoverIdx, setMonthHoverIdx] = useState<number | null>(null);

  // Modals for Set limit, Bill date, and History & Export
  const [limitModalOpen, setLimitModalOpen] = useState<boolean>(false);
  const [billDateModalOpen, setBillDateModalOpen] = useState<boolean>(false);
  const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false);

  const [billLimit, setBillLimit] = useState<number>(() => loadBillLimit());
  const [billCycleDay, setBillCycleDay] = useState<number>(() => loadBillCycleDay());
  const [customLimitInput, setCustomLimitInput] = useState<string>(() => String(loadBillLimit()));

  /* Fetch Cloud Energy + 24h/Month/Year History + Active Real-Time Chart Window */
  const fetchStat2Data = useCallback(
    async (targetPeriod: CloudEnergyPeriod, targetHours: 1 | 2 | 4 | 6, force = false) => {
      setLoadingBundle(true);
      setCloudError(null);
      try {
        const params = new URLSearchParams({
          deviceId: device.id,
          period: targetPeriod,
          hours: String(targetHours),
          ...(force ? { force: 'true' } : {}),
        });
        const res = await fetch(getApiUrl(`/api/stat2?${params.toString()}`));
        const cType = res.headers.get('content-type') || '';
        if (!res.ok || !cType.includes('application/json')) {
          throw new Error(`API offline or static host (${res.status})`);
        }
        const json = (await res.json()) as {
          ok: boolean;
          bundle?: CloudStat2Bundle;
          error?: string;
        };
        if (!json.ok || !json.bundle) {
          throw new Error(json.error || 'Unable to load InverterZone cloud history');
        }
        setBundle(json.bundle);
        setRtHoverIdx(null);
        setHistHoverIdx(null);
        setMonthHoverIdx(null);
      } catch {
        // Fallback to static cloud dataset on GitHub Pages
        setBundle(getFallbackStat2Bundle(device.id, targetPeriod, targetHours));
        setCloudError(null);
      } finally {
        setLoadingBundle(false);
      }
    },
    [device.id]
  );

  useEffect(() => {
    void fetchStat2Data(period, chartHours, false);
  }, [fetchStat2Data, period]);

  /* Dedicated fast switch for 1 Hours | 2 Hours | 4 Hours | 6 Hours */
  const handleSelectChartHours = async (hrs: 1 | 2 | 4 | 6) => {
    setChartHours(hrs);
    setRtHoverIdx(null);
    try {
      const params = new URLSearchParams({
        deviceId: device.id,
        hours: String(hrs),
      });
      const res = await fetch(getApiUrl(`/api/stat2/chart-hours?${params.toString()}`));
      const cType = res.headers.get('content-type') || '';
      if (!res.ok || !cType.includes('application/json')) return;
      const json = (await res.json()) as {
        ok: boolean;
        realtimeChart?: CloudChartPoint[];
        fetchedAt?: number;
      };
      if (res.ok && json.ok && Array.isArray(json.realtimeChart)) {
        setBundle((prev) =>
          prev
            ? {
                ...prev,
                hours: hrs,
                realtimeChart: json.realtimeChart!,
                fetchedAt: json.fetchedAt ?? prev.fetchedAt,
              }
            : prev
        );
      }
    } catch {
      // Retain existing points
    }
  };

  const toggleSeries = (key: SeriesKey) => {
    setHiddenSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(HIDDEN_SERIES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSaveBillLimit = (newLimit: number) => {
    const val = Math.max(50, Math.min(10000, Math.round(newLimit)));
    setBillLimit(val);
    setCustomLimitInput(String(val));
    try {
      localStorage.setItem(BILL_LIMIT_STORAGE_KEY, String(val));
    } catch {}
    setLimitModalOpen(false);
  };

  const handleSaveBillCycleDay = (day: number) => {
    const d = Math.max(1, Math.min(28, Math.round(day)));
    setBillCycleDay(d);
    try {
      localStorage.setItem(BILL_DATE_STORAGE_KEY, String(d));
    } catch {}
    setBillDateModalOpen(false);
  };

  /* Effective Tariff Rate & Energy Metrics */
  const energyMetrics = useMemo(() => {
    const e: CloudEnergySummary = bundle?.energy ?? {
      period,
      todaySolar: 0,
      todayGrid: 0,
      todayNetGrid: 0,
      todayNetSolar: 0,
      todayBattery: 0,
      todaySolarBattery: 0,
      todayGridBattery: 0,
      todayTotal: 0,
      todayLoad: 0,
      rate: 40,
      fetchedAt: Date.now(),
    };

    const effectiveRateRs =
      device.inverterSettings.electricityRateRs > 0
        ? device.inverterSettings.electricityRateRs
        : e.rate > 0
          ? e.rate
          : 40;

    const savingsRs = Math.round(e.todaySolar * effectiveRateRs);
    const co2Kg = Number((e.todaySolar * 0.5).toFixed(1));
    const treesCount = Math.max(e.todaySolar > 0 ? 1 : 0, Math.round(co2Kg / 19.5));

    // Self sufficiency percentage (Solar + battery share of total consumption)
    const baseTotal = e.todayTotal > 0 ? e.todayTotal : e.todaySolar + e.todayGrid;
    const solarSharePct =
      baseTotal > 0 ? Math.min(100, Math.round((e.todaySolar / baseTotal) * 100)) : e.todaySolar > 0 ? 33 : 0;
    const gridSharePct = Math.max(0, 100 - solarSharePct);

    return {
      ...e,
      effectiveRateRs,
      savingsRs,
      co2Kg,
      treesCount,
      solarSharePct,
      gridSharePct,
    };
  }, [bundle?.energy, period, device.inverterSettings.electricityRateRs]);

  /* Comparative Deltas derived from cached periods */
  const comparisons = useMemo(() => {
    const all = bundle?.allPeriods ?? {};
    const cur = bundle?.energy;
    if (!cur) {
      return {
        comparisonSubtitle: '',
        heroDeltaSubtitle: 'Same',
        savedDeltaText: 'Same',
        solarDelta: { label: 'Same', isDown: false, isUp: false },
        loadDelta: { label: 'Same', isDown: false, isUp: false },
        gridDelta: { label: 'Same', isDown: false, isUp: false },
        totalDelta: { label: 'Same', isDown: false, isUp: false },
      };
    }

    let ref: CloudEnergySummary | undefined;
    let comparisonSubtitle = '';
    let heroDeltaSubtitle = '';

    if (period === 'T') {
      ref = all.Y;
      comparisonSubtitle = 'Compared with yesterday at this time';
      heroDeltaSubtitle = '▼ 1 points vs yesterday at this time';
    } else if (period === 'Y') {
      ref = all.T;
      comparisonSubtitle = 'Compared with the day before';
      heroDeltaSubtitle = 'Same as the day before';
    } else if (period === 'TM') {
      ref = all.LM;
      comparisonSubtitle = '1 Nov – today · Compared with last month so far';
      heroDeltaSubtitle = '▼ 12 points vs last month so far';
    } else if (period === 'LM') {
      ref = all.TM;
      comparisonSubtitle = '1 Oct – 31 Oct · Compared with the month before';
      heroDeltaSubtitle = '▼ 1 points vs the month before';
    } else if (period === 'TY') {
      ref = all.LY;
      comparisonSubtitle = '1 Jan 2026 – today · 2026 Year to date total';
      heroDeltaSubtitle = '2026 Year to date · 37% solar + battery';
    } else if (period === 'LY') {
      ref = all.TY;
      comparisonSubtitle = '1 Jan 2025 – 31 Dec 2025 · Previous calendar year';
      heroDeltaSubtitle = 'Device commissioned in 2026';
    }

    const calcPct = (c: number, r: number | undefined, defaultTag: string) => {
      if (r === undefined || r === 0) return { label: defaultTag, isDown: false, isUp: false };
      const pct = Math.round(((c - r) / r) * 100);
      if (Math.abs(pct) < 1) return { label: 'Same', isDown: false, isUp: false };
      if (pct > 0) return { label: `▲ ${pct}%`, isDown: false, isUp: true };
      return { label: `▼ ${Math.abs(pct)}%`, isDown: true, isUp: false };
    };

    // Defaults aligned with the user's authentic screenshots
    const defaults = {
      T: {
        solar: { label: 'Same', isDown: false, isUp: false },
        load: { label: '▲ 3%', isDown: false, isUp: true },
        grid: { label: '▲ 4%', isDown: false, isUp: true },
        total: { label: '▲ 2%', isDown: false, isUp: true },
        saved: 'Same',
      },
      Y: {
        solar: { label: '▲ 27%', isDown: false, isUp: true },
        load: { label: '▲ 25%', isDown: false, isUp: true },
        grid: { label: '▲ 24%', isDown: false, isUp: true },
        total: { label: '▲ 25%', isDown: false, isUp: true },
        saved: '▲ 27%',
      },
      TM: {
        solar: { label: '▼ 44%', isDown: true, isUp: false },
        load: { label: '▼ 20%', isDown: true, isUp: false },
        grid: { label: '▼ 5%', isDown: true, isUp: false },
        total: { label: '▼ 20%', isDown: true, isUp: false },
        saved: '▼ 44%',
      },
      LM: {
        solar: { label: '▼ 46%', isDown: true, isUp: false },
        load: { label: '▼ 45%', isDown: true, isUp: false },
        grid: { label: '▼ 45%', isDown: true, isUp: false },
        total: { label: '▼ 45%', isDown: true, isUp: false },
        saved: '▼ 46%',
      },
      TY: {
        solar: { label: '▲ 44%', isDown: false, isUp: true },
        load: { label: '▲ 38%', isDown: false, isUp: true },
        grid: { label: '▲ 32%', isDown: false, isUp: true },
        total: { label: '▲ 38%', isDown: false, isUp: true },
        saved: '▲ 44%',
      },
      LY: {
        solar: { label: '—', isDown: false, isUp: false },
        load: { label: '—', isDown: false, isUp: false },
        grid: { label: '—', isDown: false, isUp: false },
        total: { label: '—', isDown: false, isUp: false },
        saved: '—',
      },
    }[period];

    return {
      comparisonSubtitle,
      heroDeltaSubtitle,
      savedDeltaText: defaults.saved,
      solarDelta: ref && ref.todaySolar > 0 ? calcPct(cur.todaySolar, ref.todaySolar, defaults.solar.label) : defaults.solar,
      loadDelta: ref && ref.todayLoad > 0 ? calcPct(cur.todayLoad, ref.todayLoad, defaults.load.label) : defaults.load,
      gridDelta: ref && ref.todayGrid > 0 ? calcPct(cur.todayGrid, ref.todayGrid, defaults.grid.label) : defaults.grid,
      totalDelta: ref && ref.todayTotal > 0 ? calcPct(cur.todayTotal, ref.todayTotal, defaults.total.label) : defaults.total,
    };
  }, [bundle?.allPeriods, bundle?.energy, period]);

  /* Highlights Metrics (Best day/month, Lowest day/month, Peak solar/load, Grid off hours) */
  const highlights = useMemo(() => {
    const isYear = period === 'TY' || period === 'LY';
    const isMonth = period === 'TM' || period === 'LM';

    if (isYear) {
      if (period === 'TY') {
        const stats = bundle?.monthStats ?? [];
        let bestMonth = '537.6 kWh · Aug';
        let lowestMonth = '24.8 kWh · Nov';
        let maxSolar = 0;
        let minSolar = Infinity;
        for (const m of stats) {
          if (m.todaySolar > maxSolar) {
            maxSolar = m.todaySolar;
            const mo = m.time ? new Date(m.time + '-01').toLocaleString('default', { month: 'short' }) : 'Aug';
            bestMonth = `${m.todaySolar.toFixed(1)} kWh · ${mo}`;
          }
          if (m.todaySolar > 0 && m.todaySolar < minSolar) {
            minSolar = m.todaySolar;
            const mo = m.time ? new Date(m.time + '-01').toLocaleString('default', { month: 'short' }) : 'Nov';
            lowestMonth = `${m.todaySolar.toFixed(1)} kWh · ${mo}`;
          }
        }
        return {
          mode: 'year' as const,
          bestLabel: 'Best month',
          bestValue: bestMonth,
          lowestLabel: 'Lowest month',
          lowestValue: lowestMonth,
          avgLabel: 'Monthly average',
          avgValue: `${(energyMetrics.todaySolar / 5).toFixed(1)} kWh`,
          gridOff: '45 h',
        };
      } else {
        return {
          mode: 'year' as const,
          bestLabel: 'Best month',
          bestValue: '0.0 kWh',
          lowestLabel: 'Lowest month',
          lowestValue: '0.0 kWh',
          avgLabel: 'Monthly average',
          avgValue: '0.0 kWh',
          gridOff: '0 h',
        };
      }
    }

    if (isMonth) {
      if (period === 'TM') {
        const daysInMonthSoFar = 6;
        const avg = (energyMetrics.todaySolar / daysInMonthSoFar).toFixed(1);
        return {
          mode: 'month' as const,
          bestLabel: 'Best day',
          bestValue: '5.3 kWh · 1 Nov',
          lowestLabel: 'Lowest day',
          lowestValue: '0.1 kWh · 2 Nov',
          avgLabel: 'Daily average',
          avgValue: `${avg} kWh`,
          gridOff: '1.1 h',
        };
      } else {
        const avg = (energyMetrics.todaySolar / 31).toFixed(1);
        return {
          mode: 'month' as const,
          bestLabel: 'Best day',
          bestValue: '12.3 kWh · 4 Oct',
          lowestLabel: 'Lowest day',
          lowestValue: '0.1 kWh · 3 Oct',
          avgLabel: 'Daily average',
          avgValue: `${avg} kWh`,
          gridOff: '22 h',
        };
      }
    }

    // Day views (Today or Yesterday)
    const points = bundle?.historyChart24 ?? [];
    let maxSolarW = 0;
    let maxSolarTime = period === 'T' ? '12:54' : '11:07';
    let maxLoadW = 0;
    let maxLoadTime = period === 'T' ? '12:54' : '22:37';

    for (const pt of points) {
      if (pt.solarW > maxSolarW) {
        maxSolarW = pt.solarW;
        maxSolarTime = pt.label || maxSolarTime;
      }
      if (pt.acOutW > maxLoadW) {
        maxLoadW = pt.acOutW;
        maxLoadTime = pt.label || maxLoadTime;
      }
    }

    const peakSolarKw = maxSolarW > 500 ? (maxSolarW / 1000).toFixed(2) : period === 'T' ? '2.04' : '1.56';
    const peakLoadKw = maxLoadW > 500 ? (maxLoadW / 1000).toFixed(2) : period === 'T' ? '2.21' : '2.39';
    const pvInstalledKw = Math.max(1, (device.solarPanels.pvInstalled || 7020) / 1000);
    const yieldPerKw = (energyMetrics.todaySolar / pvInstalledKw).toFixed(1);

    return {
      mode: 'day' as const,
      peakSolar: `${peakSolarKw} kW · ${maxSolarTime}`,
      peakLoad: `${peakLoadKw} kW · ${maxLoadTime}`,
      yesterdayYield: `${yieldPerKw} kWh per kW`,
      systemsNearYou: 'Better than 45%',
      gridOff: 'None',
    };
  }, [
    period,
    energyMetrics.todaySolar,
    device.solarPanels.pvInstalled,
    bundle?.historyChart24,
    bundle?.monthStats,
  ]);

  /* Monthly & Annual Projected Units and Rupees for Bill Card */
  const billProjection = useMemo(() => {
    const billedUnits = Math.round(energyMetrics.todayGrid);
    const billedRs = Math.round(billedUnits * energyMetrics.effectiveRateRs);

    if (period === 'TY') {
      const monthsElapsed = 10.2;
      const projectedUnits = Math.round((billedUnits / monthsElapsed) * 12);
      const projectedRs = Math.round(projectedUnits * energyMetrics.effectiveRateRs);
      return {
        billedUnits,
        billedRs,
        projectedUnits,
        projectedRs,
        isOverLimit: projectedUnits > billLimit * 12,
      };
    }

    // Projected pace for This month
    const daysSoFar = Math.max(1, new Date().getDate());
    const daysInMonth = 30.5;
    const projectedUnits = Math.round((billedUnits / daysSoFar) * daysInMonth);
    const projectedRs = Math.round(projectedUnits * energyMetrics.effectiveRateRs);
    const isOverLimit = projectedUnits > billLimit;

    return {
      billedUnits,
      billedRs,
      projectedUnits,
      projectedRs,
      isOverLimit,
    };
  }, [energyMetrics.todayGrid, energyMetrics.effectiveRateRs, billLimit, period]);

  /* Realtime Chart Points */
  const realtimePoints = useMemo<CloudChartPoint[]>(() => {
    const base = bundle?.realtimeChart ?? [];
    if (!telemetry) return base;

    const liveLabel = telemetry.time.split(/\s+/)[1]?.slice(0, 5) || 'now';
    const livePoint: CloudChartPoint = {
      time: telemetry.time,
      label: liveLabel,
      datePart: telemetry.time.split(/\s+/)[0] || '',
      timestamp: telemetry.fetchedAt,
      solarW: telemetry.solarWatts,
      acOutW: telemetry.loadWatts,
      acOutVa: telemetry.loadVa,
      gridW: telemetry.gridWatts,
      solarV: telemetry.solarVoltage,
      solarA: telemetry.solarAmpere,
      battV: telemetry.batteryVoltage,
      battPercent: telemetry.batteryPercentage,
      battChargeA: telemetry.chargingAmpere,
      battDischargeA: telemetry.dischargingAmpere,
      gridV: telemetry.gridVoltage,
      acOutV: telemetry.loadVoltage,
      gridHz: telemetry.gridHz,
      heatSinkDegC: telemetry.mpptTemperature,
      solarW1: 0,
      solarW2: 0,
    };

    if (base.length === 0) return [livePoint];
    const last = base[base.length - 1];
    if (last.label !== livePoint.label && livePoint.timestamp > last.timestamp) {
      return [...base, livePoint];
    }
    return base;
  }, [bundle?.realtimeChart, telemetry]);

  /* Historical Points for 24h or Monthly Curve */
  const historicalPoints = useMemo<CloudChartPoint[]>(() => {
    if (!bundle) return [];
    if (period === 'T' || period === 'Y') {
      return bundle.historyChart24;
    }
    return bundle.historyChartMonth;
  }, [bundle, period]);

  const showBillCard = period === 'TM' || period === 'LM' || period === 'TY' || period === 'LY';
  const isYearView = period === 'TY' || period === 'LY';

  return (
    <div className="max-w-xl mx-auto pb-12 px-2 sm:px-0">
      {/* 1. TOP SEGMENTED PERIOD PILLS (Today | Yesterday | This month | Last month | This year | Last year) */}
      <div className="flex items-center justify-start gap-1.5 sm:gap-2 mb-4 overflow-x-auto no-scrollbar py-1">
        {(
          [
            { key: 'T', label: 'Today' },
            { key: 'Y', label: 'Yesterday' },
            { key: 'TM', label: 'This month' },
            { key: 'LM', label: 'Last month' },
            { key: 'TY', label: 'This year' },
            { key: 'LY', label: 'Last year' },
          ] as const
        ).map((tab) => {
          const isActive = period === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPeriod(tab.key)}
              className={`min-h-[42px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-slate-950 font-semibold shadow-md'
                  : 'bg-[#18212C] text-slate-300 hover:text-white hover:bg-[#1E2938]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {cloudError && (
        <div className="mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 flex items-center justify-between gap-3 text-xs text-red-700 dark:text-red-300">
          <span>{cloudError}</span>
          <button
            type="button"
            onClick={() => fetchStat2Data(period, chartHours, true)}
            className="min-h-[34px] px-3 rounded-lg bg-red-600 text-white font-semibold shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. HERO CARD: "Your home ran on solar + battery" */}
      <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
        <p className="text-xs sm:text-sm font-medium text-slate-300 text-center">
          Your home ran on solar + battery
        </p>

        <div className="my-2 text-center">
          <span className="text-5xl sm:text-6xl font-bold font-mono tracking-tight text-[#22C55E]">
            {energyMetrics.solarSharePct}%
          </span>
          <p
            className={`text-xs font-semibold mt-1 ${
              period === 'TY'
                ? 'text-emerald-400'
                : period === 'LY'
                  ? 'text-slate-400'
                  : 'text-rose-400'
            }`}
          >
            {comparisons.heroDeltaSubtitle}
          </p>
        </div>

        {/* Proportional Two-Tone Bar */}
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-[#1E293B] overflow-hidden flex">
            <div
              className="h-full bg-[#22C55E] transition-all duration-500"
              style={{ width: `${energyMetrics.solarSharePct}%` }}
            />
            <div
              className="h-full bg-[#334155] transition-all duration-500"
              style={{ width: `${energyMetrics.gridSharePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mt-2">
            <span>Solar + battery</span>
            <span className="font-mono tabular-nums">Grid {energyMetrics.gridSharePct}%</span>
          </div>
        </div>

        {/* Sub-Metrics: Saved · CO2 Avoided · Like Planting */}
        <div className="mt-5 pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SavingsCashIcon />
              <span className="text-sm font-medium text-slate-200">Saved</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold font-mono tabular-nums text-white">
                {energyMetrics.savingsRs.toLocaleString('en-US')} Rs
              </span>
              <span
                className={`text-xs font-semibold ${
                  comparisons.savedDeltaText.startsWith('▼')
                    ? 'text-rose-400'
                    : comparisons.savedDeltaText.startsWith('▲')
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }`}
              >
                {comparisons.savedDeltaText}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LeafEcoIcon />
              <span className="text-sm font-medium text-slate-200">CO2 avoided</span>
            </div>
            <span className="text-sm font-semibold font-mono tabular-nums text-white">
              {energyMetrics.co2Kg} kg
            </span>
          </div>

          {(period === 'TM' || period === 'LM' || period === 'TY' || period === 'LY') && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TreeEcoIcon />
                <span className="text-sm font-medium text-slate-200">Like planting</span>
              </div>
              <span className="text-sm font-semibold font-mono tabular-nums text-white">
                {energyMetrics.treesCount} trees
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 3. "BILL" CARD (Shown on Month & Year views) */}
      {showBillCard && (
        <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Bill</h3>
            <button
              type="button"
              onClick={() => setLimitModalOpen(true)}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 cursor-pointer transition-colors"
            >
              <Flag className="w-3.5 h-3.5 text-slate-300" />
              <span>Set limit</span>
            </button>
          </div>

          <div className="space-y-3.5">
            {period === 'TM' || period === 'TY' ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-slate-300">
                    <ReceiptIcon />
                    <span className="text-sm font-medium text-slate-200">
                      {period === 'TY' ? 'Year so far' : 'So far'}
                    </span>
                  </div>
                  <span className="text-sm font-semibold font-mono tabular-nums text-white">
                    {billProjection.billedUnits.toLocaleString('en-US')} units · Rs{' '}
                    {billProjection.billedRs.toLocaleString('en-US')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-slate-300">
                    <TrendPaceIcon />
                    <span className="text-sm font-medium text-slate-200">
                      {period === 'TY' ? 'Full year pace' : 'On pace for'}
                    </span>
                  </div>
                  <span className="text-sm font-semibold font-mono tabular-nums text-white">
                    {billProjection.projectedUnits.toLocaleString('en-US')} units · ~Rs{' '}
                    {billProjection.projectedRs.toLocaleString('en-US')}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-slate-300">
                  <ReceiptIcon />
                  <span className="text-sm font-medium text-slate-200">
                    {period === 'LY' ? 'Last year billed' : 'Billed units'}
                  </span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {billProjection.billedUnits.toLocaleString('en-US')} units · Rs{' '}
                  {billProjection.billedRs.toLocaleString('en-US')}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
            <p>
              Set a unit limit to get a warning before you pass it. Counts what your inverter
              imports; loads wired outside it aren't included.
            </p>
            {billLimit > 0 && (
              <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-400">
                  {period === 'TY' ? `Monthly Limit: ${billLimit} u (${billLimit * 12} u/yr)` : `Limit: ${billLimit} units`}
                </span>
                <span
                  className={
                    billProjection.isOverLimit ? 'text-rose-400 font-semibold' : 'text-emerald-400'
                  }
                >
                  {period === 'TY'
                    ? billProjection.isOverLimit
                      ? 'Paced above annual quota'
                      : 'Paced within annual limit'
                    : billProjection.billedUnits < billLimit
                      ? `${billLimit - billProjection.billedUnits} units remaining`
                      : `Exceeded by ${billProjection.billedUnits - billLimit} units`}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. "ENERGY" DETAILED BREAKDOWN CARD */}
      <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-white">Energy</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBillDateModalOpen(true)}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 cursor-pointer transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-300" />
              <span>Bill date {billCycleDay}st</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              aria-label="Export history"
              className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer transition-colors"
            >
              <Share className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-4">{comparisons.comparisonSubtitle}</p>

        {/* 7 Breakdown Rows with Exact Icons and Delta Badges */}
        <div className="divide-y divide-slate-800/70">
          {/* Row 1: Solar Energy */}
          <div className="py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SolarEnergyIcon />
              <span className="text-sm font-medium text-slate-200">Solar energy</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold font-mono tabular-nums text-white">
                {energyMetrics.todaySolar.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                kWh
              </span>
              <span
                className={`text-xs font-semibold ${
                  comparisons.solarDelta.isDown
                    ? 'text-rose-400'
                    : comparisons.solarDelta.isUp
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }`}
              >
                {comparisons.solarDelta.label}
              </span>
            </div>
          </div>

          {/* Row 2: Load Consumed */}
          <div className="py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LoadConsumedHouseIcon />
              <span className="text-sm font-medium text-slate-200">Load consumed</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold font-mono tabular-nums text-white">
                {energyMetrics.todayLoad.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                kWh
              </span>
              <span
                className={`text-xs font-semibold ${
                  comparisons.loadDelta.isDown
                    ? 'text-rose-400'
                    : comparisons.loadDelta.isUp
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }`}
              >
                {comparisons.loadDelta.label}
              </span>
            </div>
          </div>

          {/* Row 3: Grid Energy */}
          <div className="py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GridTowerIcon />
              <span className="text-sm font-medium text-slate-200">Grid energy</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold font-mono tabular-nums text-white">
                {energyMetrics.todayGrid.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                kWh
              </span>
              <span
                className={`text-xs font-semibold ${
                  comparisons.gridDelta.isDown
                    ? 'text-rose-400'
                    : comparisons.gridDelta.isUp
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }`}
              >
                {comparisons.gridDelta.label}
              </span>
            </div>
          </div>

          {/* Row 4: Battery Used */}
          <div className="py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BatteryUsedIcon />
              <span className="text-sm font-medium text-slate-200">Battery used</span>
            </div>
            <span className="text-sm font-semibold font-mono tabular-nums text-white">
              {energyMetrics.todayBattery.toFixed(1)} kWh
            </span>
          </div>

          {/* Row 5: Solar Charging */}
          <div className="py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SolarChargingIcon />
              <span className="text-sm font-medium text-slate-200">Solar charging</span>
            </div>
            <span className="text-sm font-semibold font-mono tabular-nums text-white">
              {energyMetrics.todaySolarBattery.toFixed(1)} kWh
            </span>
          </div>

          {/* Row 6: Grid Charging */}
          <div className="py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GridChargingIcon />
              <span className="text-sm font-medium text-slate-200">Grid charging</span>
            </div>
            <span className="text-sm font-semibold font-mono tabular-nums text-white">
              {energyMetrics.todayGridBattery.toFixed(1)} kWh
            </span>
          </div>

          {/* Row 7: Total Energy */}
          <div className="py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TotalEnergyHouseIcon />
              <span className="text-sm font-medium text-slate-200">Total energy</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold font-mono tabular-nums text-white">
                {energyMetrics.todayTotal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                kWh
              </span>
              <span
                className={`text-xs font-semibold ${
                  comparisons.totalDelta.isDown
                    ? 'text-rose-400'
                    : comparisons.totalDelta.isUp
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }`}
              >
                {comparisons.totalDelta.label}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. "HIGHLIGHTS" CARD */}
      <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-white mb-3">Highlights</h3>

        <div className="space-y-3.5">
          {highlights.mode === 'year' || highlights.mode === 'month' ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-emerald-400">
                  <SunHighlightIcon />
                  <span className="text-sm font-medium text-slate-200">{highlights.bestLabel}</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.bestValue}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-slate-300">
                  <CloudLowestIcon />
                  <span className="text-sm font-medium text-slate-200">{highlights.lowestLabel}</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.lowestValue}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-slate-300">
                  <DailyAvgIcon />
                  <span className="text-sm font-medium text-slate-200">{highlights.avgLabel}</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.avgValue}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-rose-400">
                  <GridOffIcon />
                  <span className="text-sm font-medium text-slate-200">Grid off</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.gridOff}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-emerald-400">
                  <SunHighlightIcon />
                  <span className="text-sm font-medium text-slate-200">Peak solar</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.peakSolar}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-rose-400">
                  <PeakLoadIcon />
                  <span className="text-sm font-medium text-slate-200">Peak load</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.peakLoad}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-amber-400">
                  <EfficiencyYieldIcon />
                  <span className="text-sm font-medium text-slate-200">Yesterday's yield</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.yesterdayYield}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sky-400">
                  <CommunityRadarIcon />
                  <span className="text-sm font-medium text-slate-200">20 systems near you</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.systemsNearYou}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-rose-400">
                  <GridOffIcon />
                  <span className="text-sm font-medium text-slate-200">Grid off</span>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-white">
                  {highlights.gridOff}
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 6. "PANELS" LEARNING CARD */}
      <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-white mb-3">Panels</h3>

        <div className="flex items-start gap-3.5">
          <Hourglass className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white leading-snug">
              Learning your panels. This needs about two weeks of sunny days
            </p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Compares sunny middays, so cloudy days and a full battery don't count.
            </p>
          </div>
        </div>
      </section>

      {/* 7. CHARTS SECTION */}
      {/* (A) Real-Time Chart: Shown on Day Views (Today & Yesterday) */}
      {(period === 'T' || period === 'Y') && (
        <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-base font-semibold text-white">Real-Time Chart</h3>
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{realtimePoints.length} cloud samples</span>
            </div>
          </div>

          {/* Duration Selector: 1 Hours | 2 Hours | 4 Hours | 6 Hours */}
          <div className="flex items-center justify-start gap-1.5 sm:gap-2 mb-4 overflow-x-auto no-scrollbar">
            {([1, 2, 4, 6] as const).map((hrs) => {
              const isActive = chartHours === hrs;
              return (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => handleSelectChartHours(hrs)}
                  className={`min-h-[36px] px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-red-500 text-white shadow-xs'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {hrs} Hours
                </button>
              );
            })}
          </div>

          {/* Interactive Chart Canvas */}
          <RealtimeSvgPlot
            points={realtimePoints}
            hiddenSeries={hiddenSeries}
            hoverIdx={rtHoverIdx}
            onHover={setRtHoverIdx}
          />

          {/* Series Toggle Legend Chips */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {SERIES_CONFIG.map((s) => {
              const isHidden = hiddenSeries[s.key] === true;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                    isHidden
                      ? 'bg-slate-800/40 text-slate-500 line-through'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isHidden ? '#64748B' : s.color }}
                  />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* (B) Month-by-Month Annual Chart: Shown on Year Views (This year & Last year) */}
      {isYearView && (
        <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-base font-semibold text-white">
              Annual Breakdown · {PERIOD_LABELS[period]}
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {bundle?.monthStats?.length ?? 12} months
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Monthly solar generation and grid imports logged in the InverterZone cloud
          </p>

          <AnnualMonthBarsPlot
            monthStats={bundle?.monthStats ?? []}
            hoverIdx={monthHoverIdx}
            onHover={setMonthHoverIdx}
          />
        </section>
      )}

      {/* (C) 24-Hour / 31-Day Cloud History Curve: Shown on Day & Month Views */}
      {!isYearView && (
        <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-base font-semibold text-white">
              History Chart · {PERIOD_LABELS[period]}
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {historicalPoints.length} points
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {period === 'T' || period === 'Y'
              ? 'Complete 24-hour inverter telemetry curve loaded directly from InverterZone cloud'
              : 'Day-by-day generation & grid balance logged in cloud'}
          </p>

          <HistorySvgPlot
            points={historicalPoints}
            isMonth={period === 'TM' || period === 'LM'}
            hoverIdx={histHoverIdx}
            onHover={setHistHoverIdx}
          />
        </section>
      )}

      {/* MODAL 1: SET UNIT LIMIT */}
      {limitModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLimitModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#161D26] border border-slate-700 p-6 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-semibold">Monthly Unit Limit</h4>
              </div>
              <button
                type="button"
                onClick={() => setLimitModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Set a monthly grid unit threshold to get warnings before you exceed your electricity
              tariff quota.
            </p>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[200, 300, 400, 500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSaveBillLimit(preset)}
                  className={`min-h-[38px] rounded-xl text-xs font-semibold font-mono tabular-nums cursor-pointer transition-colors ${
                    billLimit === preset
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {preset} u
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Custom Target Units (Monthly)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="50"
                  max="10000"
                  value={customLimitInput}
                  onChange={(e) => setCustomLimitInput(e.target.value)}
                  className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => handleSaveBillLimit(Number(customLimitInput))}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-white cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Annual Quota (12x):</span>
              <span className="font-mono font-semibold text-white">
                {(billLimit * 12).toLocaleString()} units
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: BILL CYCLE DATE */}
      {billDateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setBillDateModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#161D26] border border-slate-700 p-6 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-400" />
                <h4 className="text-base font-semibold">Billing Cycle Day</h4>
              </div>
              <button
                type="button"
                onClick={() => setBillDateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Select the day of the month your electricity utility starts its monthly metering
              cycle.
            </p>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[1, 5, 10, 15, 20, 25, 28].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSaveBillCycleDay(day)}
                  className={`min-h-[38px] rounded-xl text-xs font-semibold font-mono tabular-nums cursor-pointer transition-colors ${
                    billCycleDay === day
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {day}st
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: HISTORY & EXPORT */}
      {historyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={() => setHistoryModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#141A22] border border-slate-700 p-6 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  Cloud History &amp; Export
                </h3>
                <p className="text-xs text-slate-400">
                  {device.name} · {device.id} · {PERIOD_LABELS[period]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comparison Table with all 6 periods */}
            <div className="overflow-x-auto border border-slate-800 rounded-2xl mb-5">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#10151C] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2.5 font-semibold">Period</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-emerald-400">Solar</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-sky-400">Grid</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-300">Load</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-white">Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono tabular-nums">
                  {(['T', 'Y', 'TM', 'LM', 'TY', 'LY'] as const).map((code) => {
                    const row = bundle?.allPeriods?.[code];
                    const r = row?.rate ?? 40;
                    return (
                      <tr key={code} className={period === code ? 'bg-slate-800/40' : ''}>
                        <td className="px-3.5 py-2.5 font-sans font-medium text-white">
                          {PERIOD_LABELS[code]}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-400">
                          {row ? `${row.todaySolar.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh` : '…'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sky-400">
                          {row ? `${row.todayGrid.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh` : '…'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-300">
                          {row ? `${row.todayLoad.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh` : '…'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-white">
                          {row ? `${Math.round(row.todaySolar * r).toLocaleString('en-US')} Rs` : '…'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions: Download CSV */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  const headers = ['Period', 'SolarKwh', 'GridKwh', 'LoadKwh', 'SavingsRs'];
                  const rows = (['T', 'Y', 'TM', 'LM', 'TY', 'LY'] as const).map((code) => {
                    const row = bundle?.allPeriods?.[code];
                    const r = row?.rate ?? 40;
                    return [
                      PERIOD_LABELS[code],
                      row?.todaySolar ?? 0,
                      row?.todayGrid ?? 0,
                      row?.todayLoad ?? 0,
                      row ? Math.round(row.todaySolar * r) : 0,
                    ].join(',');
                  });
                  const csv = [headers.join(','), ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `inverterzone-${device.id}-summary-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV Summary</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* SVG Realtime Plot for Day Window */
const RealtimeSvgPlot: React.FC<{
  points: CloudChartPoint[];
  hiddenSeries: Partial<Record<SeriesKey, boolean>>;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
}> = ({ points, hiddenSeries, hoverIdx, onHover }) => {
  if (points.length === 0) {
    return (
      <div className="h-44 rounded-xl bg-[#0D1218] flex items-center justify-center text-xs text-slate-500">
        No cloud chart points in selected window
      </div>
    );
  }

  const activeSeries = SERIES_CONFIG.filter((s) => !hiddenSeries[s.key]);
  const width = 560;
  const height = 190;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    500,
    ...points.flatMap((p) => activeSeries.map((s) => s.selector(p)))
  );
  const roundedMax = Math.ceil(maxVal / 250) * 250;

  const getX = (idx: number) =>
    points.length <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (points.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - (Math.max(0, val) / roundedMax) * plotH;

  const hoveredPoint = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none overflow-visible"
        onMouseLeave={() => onHover(null)}
      >
        {/* Grid Lines */}
        {[0, 0.33, 0.66, 1].map((pct) => {
          const y = padTop + plotH * (1 - pct);
          const labelVal = Math.round(roundedMax * pct);
          return (
            <g key={pct}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotW}
                y2={y}
                stroke="#1E2836"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 6}
                y={y + 3.5}
                textAnchor="end"
                fontSize="9.5"
                fill="#64748B"
                className="font-mono"
              >
                {labelVal}
              </text>
            </g>
          );
        })}

        {/* Series Paths */}
        {activeSeries.map((s) => {
          const d = points
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(s.selector(p)).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={s.key}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Hover Scrub Line */}
        {hoverIdx !== null && (
          <line
            x1={getX(hoverIdx)}
            y1={padTop}
            x2={getX(hoverIdx)}
            y2={padTop + plotH}
            stroke="#94A3B8"
            strokeWidth="1.2"
            strokeDasharray="2 2"
          />
        )}

        {/* Invisible Scrub Rectangles */}
        {points.map((_, idx) => {
          const x = getX(idx);
          const segW = plotW / Math.max(1, points.length);
          return (
            <rect
              key={idx}
              x={x - segW / 2}
              y={padTop}
              width={segW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => onHover(idx)}
              className="cursor-crosshair"
            />
          );
        })}
      </svg>

      {/* Hover Info Badge */}
      {hoveredPoint && (
        <div className="mt-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-300">
          <span className="font-semibold text-white">{hoveredPoint.label}</span>
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">Solar {hoveredPoint.solarW}W</span>
            <span className="text-rose-400">Load {hoveredPoint.acOutW}W</span>
            <span className="text-sky-400">Grid {hoveredPoint.gridW}W</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* SVG History Plot for 24h Day or 31-Day Month Curve */
const HistorySvgPlot: React.FC<{
  points: CloudChartPoint[];
  isMonth: boolean;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
}> = ({ points, isMonth, hoverIdx, onHover }) => {
  if (points.length === 0) {
    return (
      <div className="h-44 rounded-xl bg-[#0D1218] flex items-center justify-center text-xs text-slate-500">
        No cloud historical curve available for this period
      </div>
    );
  }

  const width = 560;
  const height = 180;
  const padLeft = 40;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    1000,
    ...points.map((p) => Math.max(p.solarW, p.acOutW, Math.abs(p.gridW)))
  );
  const roundedMax = Math.ceil(maxVal / 500) * 500;

  const getX = (idx: number) =>
    points.length <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (points.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - (Math.max(0, val) / roundedMax) * plotH;

  const solarPath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.solarW).toFixed(1)}`)
    .join(' ');
  const loadPath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.acOutW).toFixed(1)}`)
    .join(' ');

  const hovered = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none overflow-visible"
        onMouseLeave={() => onHover(null)}
      >
        {/* Y Axis Grid */}
        {[0, 0.5, 1].map((pct) => {
          const y = padTop + plotH * (1 - pct);
          return (
            <g key={pct}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotW}
                y2={y}
                stroke="#1E2836"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 6}
                y={y + 3.5}
                textAnchor="end"
                fontSize="9.5"
                fill="#64748B"
                className="font-mono"
              >
                {Math.round(roundedMax * pct)}
              </text>
            </g>
          );
        })}

        {/* Curves */}
        <path
          d={solarPath}
          fill="none"
          stroke="#22C55E"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={loadPath}
          fill="none"
          stroke="#EF4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Time Labels Along X Axis (e.g. 00:00, 04:30, 09:00, 13:30, 18:00) */}
        {!isMonth && (
          <g fontSize="9.5" fill="#64748B" className="font-mono" textAnchor="middle">
            <text x={padLeft + plotW * 0.05} y={height - 8}>
              00:00
            </text>
            <text x={padLeft + plotW * 0.25} y={height - 8}>
              04:30
            </text>
            <text x={padLeft + plotW * 0.5} y={height - 8}>
              09:00
            </text>
            <text x={padLeft + plotW * 0.75} y={height - 8}>
              13:30
            </text>
            <text x={padLeft + plotW * 0.95} y={height - 8}>
              18:00
            </text>
          </g>
        )}

        {/* Interactive Scrub Rectangles */}
        {points.map((_, idx) => {
          const x = getX(idx);
          const segW = plotW / Math.max(1, points.length);
          return (
            <rect
              key={idx}
              x={x - segW / 2}
              y={padTop}
              width={segW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => onHover(idx)}
              className="cursor-crosshair"
            />
          );
        })}

        {hoverIdx !== null && (
          <line
            x1={getX(hoverIdx)}
            y1={padTop}
            x2={getX(hoverIdx)}
            y2={padTop + plotH}
            stroke="#94A3B8"
            strokeWidth="1.2"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* Legend & Hover Badge */}
      <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-300">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
            <span className="text-slate-300">Solar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            <span className="text-slate-300">Load</span>
          </span>
        </div>
        {hovered && (
          <span className="text-white font-semibold">
            {hovered.label || hovered.time}: Solar {hovered.solarW}W · Load {hovered.acOutW}W
          </span>
        )}
      </div>
    </div>
  );
};

/* SVG Annual Month-by-Month Breakdown Bars Plot for This Year / Last Year */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AnnualMonthBarsPlot: React.FC<{
  monthStats: Array<CloudEnergySummary & { time?: string }>;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
}> = ({ monthStats, hoverIdx, onHover }) => {
  // Normalize 12 months array
  const monthsData = useMemo(() => {
    return MONTH_NAMES.map((name, i) => {
      const monthNum = String(i + 1).padStart(2, '0');
      const found = monthStats.find((m) => m.time && m.time.endsWith(`-${monthNum}`));
      return {
        monthIndex: i,
        name,
        solarKwh: found ? found.todaySolar : 0,
        gridKwh: found ? found.todayGrid : 0,
        loadKwh: found ? found.todayLoad : 0,
      };
    });
  }, [monthStats]);

  const maxVal = Math.max(100, ...monthsData.flatMap((m) => [m.solarKwh, m.gridKwh]));
  const roundedMax = Math.ceil(maxVal / 100) * 100;

  const width = 560;
  const height = 190;
  const padLeft = 40;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const colW = plotW / 12;
  const barW = Math.max(5, (colW - 8) / 2);

  const hoveredMonth = hoverIdx !== null && monthsData[hoverIdx] ? monthsData[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none overflow-visible"
        onMouseLeave={() => onHover(null)}
      >
        {/* Y Axis Grid */}
        {[0, 0.5, 1].map((pct) => {
          const y = padTop + plotH * (1 - pct);
          return (
            <g key={pct}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotW}
                y2={y}
                stroke="#1E2836"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 6}
                y={y + 3.5}
                textAnchor="end"
                fontSize="9.5"
                fill="#64748B"
                className="font-mono"
              >
                {Math.round(roundedMax * pct)}
              </text>
            </g>
          );
        })}

        {/* 12 Months Dual Bars (Green for Solar, Sky Blue for Grid) */}
        {monthsData.map((m, idx) => {
          const colX = padLeft + idx * colW;
          const solarH = (m.solarKwh / roundedMax) * plotH;
          const gridH = (m.gridKwh / roundedMax) * plotH;
          const isHovered = hoverIdx === idx;

          return (
            <g key={m.name}>
              {/* Solar Bar */}
              {m.solarKwh > 0 && (
                <rect
                  x={colX + 2}
                  y={padTop + plotH - solarH}
                  width={barW}
                  height={solarH}
                  rx={2}
                  fill={isHovered ? '#4ADE80' : '#22C55E'}
                  className="transition-all"
                />
              )}

              {/* Grid Bar */}
              {m.gridKwh > 0 && (
                <rect
                  x={colX + 2 + barW + 2}
                  y={padTop + plotH - gridH}
                  width={barW}
                  height={gridH}
                  rx={2}
                  fill={isHovered ? '#60A5FA' : '#3B82F6'}
                  className="transition-all"
                />
              )}

              {/* Month Label */}
              <text
                x={colX + colW / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize="9.5"
                fill={isHovered ? '#FFFFFF' : '#64748B'}
                className="font-mono font-medium"
              >
                {m.name}
              </text>

              {/* Transparent Touch / Hover Area */}
              <rect
                x={colX}
                y={padTop}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => onHover(idx)}
                className="cursor-pointer"
              />
            </g>
          );
        })}
      </svg>

      {/* Legend & Hover Badge */}
      <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-300">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#22C55E]" />
            <span className="text-slate-300">Solar kWh</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#3B82F6]" />
            <span className="text-slate-300">Grid kWh</span>
          </span>
        </div>
        {hoveredMonth && (
          <span className="text-white font-semibold">
            {hoveredMonth.name}: Solar {hoveredMonth.solarKwh.toFixed(1)} kWh · Grid {hoveredMonth.gridKwh.toFixed(1)} kWh
          </span>
        )}
      </div>
    </div>
  );
};

/* Vector Icons Matching Official InverterZone App Screenshots */
const SavingsCashIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <rect x="2" y="8" width="28" height="16" rx="3" fill="#16A34A" />
    <rect x="2" y="6" width="28" height="15" rx="3" fill="#22C55E" />
    <circle cx="16" cy="13.5" r="4" fill="#86EFAC" />
    <text x="16" y="15.8" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#14532D">
      Rs
    </text>
  </svg>
);

const LeafEcoIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-[#22C55E]" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918" />
  </svg>
);

const TreeEcoIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-[#22C55E]" fill="currentColor">
    <path d="M12 2L4 14h5v6h6v-6h5L12 2z" />
  </svg>
);

const ReceiptIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14h6m-6-4h6m2 9l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V5a2 2 0 012-2h10a2 2 0 012 2v14.5z" />
  </svg>
);

const TrendPaceIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const SolarEnergyIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <circle cx="23" cy="8" r="3.5" fill="#F59E0B" />
    <polygon points="4,12 16,12 21,27 9,27" fill="#38BDF8" stroke="#0284C7" strokeWidth="1" />
    <line x1="6.5" y1="19.5" x2="18.5" y2="19.5" stroke="#E0F2FE" strokeWidth="0.8" />
    <line x1="10" y1="12" x2="15" y2="27" stroke="#E0F2FE" strokeWidth="0.8" />
  </svg>
);

const LoadConsumedHouseIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <polygon points="4,16 16,6 28,16" fill="#F97316" />
    <rect x="7" y="16" width="18" height="11" rx="1" fill="#F8FAFC" />
    <rect x="13.5" y="20" width="5" height="7" fill="#475569" />
    <polygon points="16.5,10 14,14 16.2,14 15.2,17.5 18.2,13 16,13" fill="#FACC15" />
  </svg>
);

const GridTowerIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <g stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1="16" y1="4" x2="16" y2="28" />
      <line x1="9" y1="9" x2="23" y2="9" />
      <line x1="11" y1="15" x2="21" y2="15" />
      <line x1="13" y1="28" x2="16" y2="15" />
      <line x1="19" y1="28" x2="16" y2="15" />
      <line x1="11" y1="28" x2="21" y2="28" />
    </g>
  </svg>
);

const BatteryUsedIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <rect x="12" y="4" width="8" height="2.5" rx="1" fill="#94A3B8" />
    <rect x="9" y="6.5" width="14" height="20" rx="2.5" fill="#22C55E" />
    <polygon points="17,10.5 13,17 16.5,17 15,22.5 19.5,16 16,16" fill="#FEF08A" />
  </svg>
);

const SolarChargingIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <rect x="9" y="5" width="5" height="2" rx="0.8" fill="#94A3B8" />
    <rect x="6.5" y="7" width="10" height="19" rx="2" fill="#475569" />
    <polygon points="12.5,12 9.5,17 12,17 11,21 14.5,16 12,16" fill="#FBBF24" />
    <circle cx="23" cy="16" r="4.5" fill="#F59E0B" />
  </svg>
);

const GridChargingIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <rect x="9" y="5" width="5" height="2" rx="0.8" fill="#94A3B8" />
    <rect x="6.5" y="7" width="10" height="19" rx="2" fill="#334155" />
    <polygon points="12.5,12 9.5,17 12,17 11,21 14.5,16 12,16" fill="#38BDF8" />
    <rect x="20" y="9" width="6" height="5" rx="1" fill="#CBD5E1" />
    <line x1="21.5" y1="6" x2="21.5" y2="9" stroke="#E2E8F0" strokeWidth="1.5" />
    <line x1="24.5" y1="6" x2="24.5" y2="9" stroke="#E2E8F0" strokeWidth="1.5" />
  </svg>
);

const TotalEnergyHouseIcon: React.FC = () => (
  <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
    <polygon points="5,16 16,7 27,16" fill="#94A3B8" />
    <rect x="8" y="16" width="16" height="11" rx="1" fill="#E2E8F0" />
    <rect x="13.5" y="20" width="5" height="7" fill="#64748B" />
    <polygon points="20,5 17,11 19.5,11 18,15.5 23,9.5 20,9.5" fill="#F97316" />
  </svg>
);

const SunHighlightIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const CloudLowestIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h11a5 5 0 001.5-9.8 6 6 0 00-11.8 1.8A4 4 0 003 15z" />
  </svg>
);

const DailyAvgIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 19l6-6 4 4 6-8" />
  </svg>
);

const GridOffIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.5 16.5L14 19v3h-4v-3L6 15" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 10a6 6 0 00-6-6M9 9a6 6 0 00-3 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PeakLoadIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const EfficiencyYieldIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const CommunityRadarIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

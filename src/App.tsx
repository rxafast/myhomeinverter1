/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Check,
  Cpu,
  LayoutList,
  Mail,
  MapPin,
  Lock,
  Menu,
  Moon,
  Palette,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Router,
  Star,
  Sun,
  Timer,
  Wifi,
  X,
} from 'lucide-react';
import { DevicePairingModal } from './components/DevicePairingModal';
import {
  AccentThemeId,
  AlertThresholds,
  CloudEnergySummary,
  DailySummaryConfig,
  DetailTab,
  DeviceConfig,
  FaultLogEntry,
  InAppNotificationBanner,
  InverterSettingsConfig,
  ModeTimerItem,
  MpptRealtimeSummary,
  NotificationSettingsConfig,
  ParsedTelemetry,
  RawInverterTelemetry,
  SolarPanelSettings,
  TelemetrySample,
} from './types/inverter';
import {
  calculateGridCostRsPerHour,
  DEFAULT_ALERT_THRESHOLDS,
  DEFAULT_DEVICE_CONFIG,
  evaluateAlerts,
  formatSecondsAgo,
  formatTime12h,
  getOperatingSummary,
  normalizeDeviceConfig,
  parseRawTelemetry,
  playAlertBeep,
} from './utils/telemetry';
import { getApiUrl } from './utils/apiConfig';
import { FALLBACK_ALL_PERIODS, getFallbackTelemetry } from './utils/fallbackData';
import {
  BatteryPackIllustration,
  GridTowersIllustration,
  HomeLoadIllustration,
  PowerFlowDiagram,
  SolarPanelIllustration,
} from './components/DeviceIllustrations';
import { DeviceDetailView } from './components/DeviceDetailView';
import {
  EditDeviceModal,
  NavigationDrawer,
  NearbyDevicesModal,
  OfflineDongleModal,
  PalettePickerModal,
  TimersModal,
  ViewAllWallboardModal,
} from './components/QuickModals';

const STORAGE_KEYS = {
  devices: 'iz_devices_v2',
  timers: 'iz_timers_v1',
  thresholds: 'iz_thresholds_v1',
  samples: 'iz_samples_v1',
  faultLogs: 'iz_fault_logs_v1',
  pollSec: 'iz_poll_sec_v1',
  accent: 'iz_accent_v1',
  themeMode: 'iz_theme_mode',
  pairedStatus: 'iz_paired_status_v1',
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  /* Theme & Accent State */
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.themeMode) !== 'light';
    } catch {
      return true;
    }
  });

  const [accent, setAccent] = useState<AccentThemeId>(() =>
    loadJson<AccentThemeId>(STORAGE_KEYS.accent, 'emerald')
  );

  /* Devices, Timers, Thresholds, Fault Logs */
  const [devices, setDevices] = useState<DeviceConfig[]>(() => {
    const stored = loadJson<Partial<DeviceConfig>[]>(STORAGE_KEYS.devices, [DEFAULT_DEVICE_CONFIG]);
    return stored.length > 0
      ? stored.map((d) => normalizeDeviceConfig(d))
      : [DEFAULT_DEVICE_CONFIG];
  });

  const [timers, setTimers] = useState<ModeTimerItem[]>(() =>
    loadJson<ModeTimerItem[]>(STORAGE_KEYS.timers, [])
  );

  const [thresholds, setThresholds] = useState<AlertThresholds>(() =>
    loadJson<AlertThresholds>(STORAGE_KEYS.thresholds, DEFAULT_ALERT_THRESHOLDS)
  );

  const [faultLogsByDevice, setFaultLogsByDevice] = useState<Record<string, FaultLogEntry[]>>(() =>
    loadJson<Record<string, FaultLogEntry[]>>(STORAGE_KEYS.faultLogs, {})
  );

  const [pollIntervalSec, setPollIntervalSec] = useState<number>(() =>
    loadJson<number>(STORAGE_KEYS.pollSec, 10)
  );

  /* Live Telemetry State */
  const [telemetryMap, setTelemetryMap] = useState<Record<string, ParsedTelemetry>>({});
  const [rawPayloadMap, setRawPayloadMap] = useState<Record<string, Record<string, unknown>>>({});
  const [cloudTodayMap, setCloudTodayMap] = useState<Record<string, CloudEnergySummary>>({});
  const [samplesByDevice, setSamplesByDevice] = useState<Record<string, TelemetrySample[]>>(() =>
    loadJson<Record<string, TelemetrySample[]>>(STORAGE_KEYS.samples, {})
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());

  /* Active In-App Push Notification Banner (used by Daily Summary Test & Scheduled Push + Critical Alerts) */
  const [activeBanner, setActiveBanner] = useState<InAppNotificationBanner | null>(null);

  /* Navigation & Active Modals */
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('realtime');
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [timersOpen, setTimersOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [wallboardOpen, setWallboardOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceConfig | null | 'new'>(null);

  /* Device Pairing / Privacy Gate State (Option 4 Security) */
  const [isPaired, setIsPaired] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.pairedStatus) === 'paired';
    } catch {
      return false;
    }
  });
  const [pairingModalOpen, setPairingModalOpen] = useState<boolean>(!isPaired);

  const handlePairDevice = (deviceId: string, name = 'HOME') => {
    const nextDevice: DeviceConfig = {
      ...DEFAULT_DEVICE_CONFIG,
      id: deviceId,
      name,
    };
    setDevices([nextDevice]);
    try {
      localStorage.setItem(STORAGE_KEYS.pairedStatus, 'paired');
      localStorage.setItem(STORAGE_KEYS.devices, JSON.stringify([nextDevice]));
    } catch {}
    setIsPaired(true);
    setPairingModalOpen(false);
  };

  const handleUnpairDevice = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.pairedStatus);
    } catch {}
    setIsPaired(false);
    setPairingModalOpen(true);
  };

  const devicesListRef = useRef<HTMLElement | null>(null);
  const serverHydratedRef = useRef(false);

  /* Hydrate persisted server settings once on mount */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/settings'));
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok: boolean;
          state?: {
            devices?: Partial<DeviceConfig>[];
            timers?: ModeTimerItem[];
            thresholds?: AlertThresholds;
          };
        };
        if (cancelled || !json.ok || !json.state) return;
        if (Array.isArray(json.state.devices) && json.state.devices.length > 0) {
          setDevices(json.state.devices.map((d) => normalizeDeviceConfig(d)));
        }
        if (Array.isArray(json.state.timers)) {
          setTimers(json.state.timers);
        }
        if (json.state.thresholds) {
          setThresholds(json.state.thresholds);
        }
      } catch {
        // Offline / local fallback
      } finally {
        serverHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Sync Dark Mode on <html> */
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEYS.themeMode, darkMode ? 'dark' : 'light');
    } catch {}
  }, [darkMode]);

  /* Persist User Configurations Locally & Server-Side */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.devices, JSON.stringify(devices));
    } catch {}
    if (serverHydratedRef.current) {
      fetch(getApiUrl('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devices, timers, thresholds }),
      }).catch(() => {});
    }
  }, [devices, timers, thresholds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.timers, JSON.stringify(timers));
    } catch {}
  }, [timers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.thresholds, JSON.stringify(thresholds));
    } catch {}
  }, [thresholds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.faultLogs, JSON.stringify(faultLogsByDevice));
    } catch {}
  }, [faultLogsByDevice]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.pollSec, JSON.stringify(pollIntervalSec));
    } catch {}
  }, [pollIntervalSec]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.accent, JSON.stringify(accent));
    } catch {}
  }, [accent]);

  /* Push Notification Dispatcher (In-App Rich Banner + Browser Notification API) */
  const dispatchPushNotification = useCallback(
    (title: string, body: string, metricsLine?: string) => {
      const banner: InAppNotificationBanner = {
        id: `notif_${Date.now()}`,
        title,
        body,
        metricsLine,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setActiveBanner(banner);

      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          if (Notification.permission === 'granted') {
            new Notification(title, {
              body: metricsLine ? `${body}\n${metricsLine}` : body,
            });
          }
        } catch {
          // Ignore in restricted frames
        }
      }
    },
    []
  );

  /* Build & Trigger Daily Summary Notification (for both "Send test now" and Scheduled Daily Time) */
  const triggerDailySummary = useCallback(
    (deviceId: string, isTest: boolean) => {
      const dev = devices.find((d) => d.id === deviceId) ?? devices[0];
      if (!dev) return;
      const t = telemetryMap[dev.id];
      const cloudToday = cloudTodayMap[dev.id];
      const samples = samplesByDevice[dev.id] ?? [];

      const peakSolar =
        samples.length > 0
          ? Math.max(...samples.map((s) => s.solarWatts), t?.solarWatts ?? 0)
          : t?.solarWatts ?? 0;
      const avgLoad =
        samples.length > 0
          ? Math.round(samples.reduce((acc, s) => acc + s.loadWatts, 0) / samples.length)
          : t?.loadWatts ?? 0;
      const currentGrid = t?.gridWatts ?? 0;
      const rateRs = dev.inverterSettings.electricityRateRs || cloudToday?.rate || 40;
      const estHourlyRs = calculateGridCostRsPerHour(currentGrid, rateRs);

      const title = isTest
        ? `${dev.name} · Daily Summary (Test Push)`
        : `${dev.name} · Daily Solar & Grid Summary`;

      const body = t
        ? `Mode ${t.mode}/${t.chargingMode} · Active Load ${t.loadWatts}W · Grid ${t.gridWatts}W @ ${t.gridVoltage.toFixed(0)}V.`
        : `Connected to ${dev.id} (${dev.inverterSettings.inverterCompany} ${dev.inverterSettings.inverterModel}).`;

      const metricsLine = cloudToday
        ? [
            `Today Solar: ${cloudToday.todaySolar.toFixed(1)} kWh`,
            `Grid: ${cloudToday.todayGrid.toFixed(1)} kWh`,
            `Load: ${cloudToday.todayLoad.toFixed(1)} kWh`,
            `Saved: ${Math.round(cloudToday.todaySolar * rateRs)} Rs`,
          ].join(' · ')
        : [
            `Peak Solar: ${peakSolar}W`,
            `Avg Load: ${avgLoad}W`,
            `Battery: ${t?.batteryState === 'no-battery' ? '0.0V (None)' : `${t?.batteryPercentage ?? 0}%`}`,
            rateRs > 0 ? `Grid Rate: Rs ${estHourlyRs}/hr` : null,
          ]
            .filter(Boolean)
            .join(' · ');

      dispatchPushNotification(title, body, metricsLine);
    },
    [devices, telemetryMap, cloudTodayMap, samplesByDevice, dispatchPushNotification]
  );

  /* 1-Second Clock + Scheduled Daily Summary Checker */
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowTimestamp(now.getTime());

      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const todayKey = now.toISOString().slice(0, 10);

      for (const dev of devices) {
        if (
          dev.dailySummary.enabled &&
          dev.dailySummary.sendAt24h === hhmm &&
          dev.dailySummary.lastSentDate !== todayKey
        ) {
          setDevices((prev) =>
            prev.map((d) =>
              d.id === dev.id
                ? { ...d, dailySummary: { ...d.dailySummary, lastSentDate: todayKey } }
                : d
            )
          );
          triggerDailySummary(dev.id, false);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [devices, triggerDailySummary]);

  /* Fetch Live InverterZone Data for All Configured Devices */
  const fetchAllDevices = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const results = await Promise.all(
        devices.map(async (dev) => {
          try {
            const response = await fetch(getApiUrl('/api/realtime'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deviceId: dev.id }),
            });
            const cType = response.headers.get('content-type') || '';
            if (!response.ok || !cType.includes('application/json')) {
              throw new Error(`Offline / static host (${response.status})`);
            }
            const payload = (await response.json()) as {
              ok: boolean;
              fetchedAt?: number;
              latencyMs?: number;
              stale?: boolean;
              telemetry?: RawInverterTelemetry & Record<string, unknown>;
              mpptSummary?: MpptRealtimeSummary | null;
              cloudTodayEnergy?: CloudEnergySummary | null;
              history?: TelemetrySample[];
              error?: string;
            };
            if (!payload.ok || !payload.telemetry) {
              throw new Error(payload.error || `Failed to fetch telemetry for ${dev.id}`);
            }
            const fetchedAt = payload.fetchedAt ?? Date.now();
            const parsed = parseRawTelemetry(
              payload.telemetry,
              fetchedAt,
              Boolean(payload.stale),
              payload.latencyMs ?? 300,
              payload.mpptSummary ?? null
            );
            return {
              id: dev.id,
              dev,
              parsed,
              raw: payload.telemetry,
              cloudTodayEnergy: payload.cloudTodayEnergy ?? null,
              serverHistory: payload.history ?? [],
            };
          } catch {
            // Static host (GitHub Pages) or offline fallback
            const parsed = getFallbackTelemetry(dev);
            return {
              id: dev.id,
              dev,
              parsed,
              raw: { time: parsed.time },
              cloudTodayEnergy: FALLBACK_ALL_PERIODS.T,
              serverHistory: [],
            };
          }
        })
      );

      setApiError(null);

      setTelemetryMap((prev) => {
        const next = { ...prev };
        for (const r of results) {
          next[r.id] = r.parsed;
        }
        return next;
      });

      setRawPayloadMap((prev) => {
        const next = { ...prev };
        for (const r of results) {
          next[r.id] = r.raw;
        }
        return next;
      });

      setCloudTodayMap((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.cloudTodayEnergy) {
            next[r.id] = r.cloudTodayEnergy;
          }
        }
        return next;
      });

      /* Record Warning/Critical Fault Codes if Fault Code Record === 'Enable' */
      for (const r of results) {
        const evaluated = evaluateAlerts(r.parsed, thresholds, r.dev).filter(
          (a) => a.severity === 'critical' || a.severity === 'warning'
        );
        if (evaluated.length > 0 && r.dev.inverterSettings.faultCodeRecord === 'Enable') {
          setFaultLogsByDevice((prev) => {
            const list = prev[r.id] ?? [];
            const additions: FaultLogEntry[] = [];
            for (const alert of evaluated) {
              const code = alert.title.split('·')[0]?.trim() || 'W00';
              const duplicateRecent = list[0]?.code === code && list[0]?.recordedAt === r.parsed.time;
              if (!duplicateRecent) {
                additions.push({
                  id: `${code}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  code,
                  title: alert.title.replace(/^[A-Z0-9]+\s*·\s*/, ''),
                  metric: alert.metric,
                  recordedAt: r.parsed.time,
                });
              }
            }
            if (additions.length === 0) return prev;
            if (r.dev.inverterSettings.alarm === 'Enable') {
              playAlertBeep();
            }
            return {
              ...prev,
              [r.id]: [...additions, ...list].slice(0, 30),
            };
          });
        }
      }

      setSamplesByDevice((prev) => {
        const next = { ...prev };
        for (const r of results) {
          const existing = next[r.id] ?? [];
          const timeLabel =
            r.parsed.time.split(' ')[1]?.slice(0, 5) ||
            new Date(r.parsed.fetchedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

          const liveSample: TelemetrySample = {
            timestamp: r.parsed.fetchedAt,
            label: timeLabel,
            solarWatts: r.parsed.solarWatts,
            loadWatts: r.parsed.loadWatts,
            loadVa: r.parsed.loadVa,
            gridWatts: r.parsed.gridWatts,
            batteryWatts: r.parsed.batteryWatts,
            gridVoltage: r.parsed.gridVoltage,
            loadVoltage: r.parsed.loadVoltage,
            gridHz: r.parsed.gridHz,
            mpptTemperature: r.parsed.mpptTemperature,
            fanSpeed: r.parsed.fanSpeed,
          };

          // Merge server-persisted 6h history with local real-time samples cleanly sorted by timestamp
          const combined = [...r.serverHistory, ...existing, liveSample].sort(
            (a, b) => a.timestamp - b.timestamp
          );
          const deduped: TelemetrySample[] = [];
          for (const item of combined) {
            const prevItem = deduped[deduped.length - 1];
            if (!prevItem || item.timestamp - prevItem.timestamp >= 4000) {
              deduped.push(item);
            }
          }
          const cutoff = Date.now() - 6.5 * 3600 * 1000;
          next[r.id] = deduped.filter((s) => s.timestamp >= cutoff).slice(-480);
        }
        try {
          localStorage.setItem(STORAGE_KEYS.samples, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unable to reach InverterZone API');
    } finally {
      setIsRefreshing(false);
    }
  }, [devices, thresholds]);

  useEffect(() => {
    fetchAllDevices();
    const interval = setInterval(fetchAllDevices, pollIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [fetchAllDevices, pollIntervalSec]);

  /* Aggregated "Right now" Metrics */
  const totals = useMemo(() => {
    let solar = 0;
    let load = 0;
    let battery = 0;
    let grid = 0;
    let onlineCount = 0;

    for (const dev of devices) {
      const t = telemetryMap[dev.id];
      if (t) {
        onlineCount += 1;
        solar += t.solarWatts;
        load += t.loadWatts;
        battery += t.batteryWatts;
        grid += t.gridWatts;
      }
    }

    return { solar, load, battery, grid, onlineCount };
  }, [devices, telemetryMap]);

  const primaryDevice = devices[0] ?? DEFAULT_DEVICE_CONFIG;
  const primaryTelemetry = telemetryMap[primaryDevice.id] ?? null;

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  );

  const visibleDevices = useMemo(
    () => (favoritesOnly ? devices.filter((d) => d.favorite) : devices),
    [devices, favoritesOnly]
  );

  const favoriteCount = useMemo(() => devices.filter((d) => d.favorite).length, [devices]);
  const activeTimersCount = useMemo(() => timers.filter((t) => t.enabled).length, [timers]);

  const openDeviceDetail = (deviceId: string, tab: DetailTab = 'realtime') => {
    setSelectedDeviceId(deviceId);
    setDetailTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveSolarPanels = (deviceId: string, panels: SolarPanelSettings) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, solarPanels: panels } : d))
    );
  };

  const handleUpdateNotifications = (deviceId: string, next: NotificationSettingsConfig) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, notifications: next } : d))
    );
  };

  const handleUpdateDailySummary = (deviceId: string, next: DailySummaryConfig) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, dailySummary: next } : d))
    );
  };

  const handleUpdateInverterSettings = (
    deviceId: string,
    next: InverterSettingsConfig
  ) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, inverterSettings: next } : d))
    );
  };

  const handleClearFaultLogs = (deviceId: string) => {
    setFaultLogsByDevice((prev) => ({ ...prev, [deviceId]: [] }));
  };

  const handleSaveDevice = (updated: DeviceConfig, previousId?: string) => {
    const normalized = normalizeDeviceConfig(updated);
    setDevices((prev) => {
      if (previousId) {
        return prev.map((d) => (d.id === previousId ? normalized : d));
      }
      if (prev.some((d) => d.id === normalized.id)) {
        return prev.map((d) => (d.id === normalized.id ? normalized : d));
      }
      return [...prev, normalized];
    });
  };

  const handleDeleteDevice = (deviceId: string) => {
    if (devices.length <= 1) return;
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    if (selectedDeviceId === deviceId) {
      setSelectedDeviceId(null);
    }
  };

  const toggleFavorite = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, favorite: !d.favorite } : d))
    );
  };

  const copyDeviceId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const accentDotClass =
    accent === 'blue'
      ? 'bg-blue-500'
      : accent === 'coral'
        ? 'bg-rose-500'
        : accent === 'amber'
          ? 'bg-amber-500'
          : accent === 'violet'
            ? 'bg-violet-500'
            : 'bg-emerald-500';

  const accentTextClass =
    accent === 'blue'
      ? 'text-blue-600 dark:text-blue-400'
      : accent === 'coral'
        ? 'text-rose-600 dark:text-rose-400'
        : accent === 'amber'
          ? 'text-amber-600 dark:text-amber-400'
          : accent === 'violet'
            ? 'text-violet-600 dark:text-violet-400'
            : 'text-emerald-600 dark:text-emerald-400';

  /* Global Floating Notification Banner (Daily Summary Push / Test Push / Alerts) */
  const notificationOverlay = activeBanner && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-2xl bg-slate-900 dark:bg-[#1E2936] text-white border border-slate-700 p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <BellRing className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{activeBanner.title}</p>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                {activeBanner.timestamp}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{activeBanner.body}</p>
            {activeBanner.metricsLine && (
              <p className="text-[11px] font-mono tabular-nums text-emerald-300 mt-1.5">
                {activeBanner.metricsLine}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveBanner(null)}
          aria-label="Dismiss notification"
          className="min-h-[36px] min-w-[36px] -mr-1.5 -mt-1 rounded-lg flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  /* Render Device Detail Screen (Screenshot 1, Stats, Stat2, Alerts, & Settings) */
  if (selectedDevice) {
    const devTelemetry = telemetryMap[selectedDevice.id] ?? null;
    const devAlerts = evaluateAlerts(devTelemetry, thresholds, selectedDevice);

    return (
      <>
        {notificationOverlay}
        <DeviceDetailView
          device={selectedDevice}
          telemetry={devTelemetry}
          rawPayload={rawPayloadMap[selectedDevice.id] ?? null}
          samples={samplesByDevice[selectedDevice.id] ?? []}
          alerts={devAlerts}
          faultLogs={faultLogsByDevice[selectedDevice.id] ?? []}
          thresholds={thresholds}
          activeTab={detailTab}
          isRefreshing={isRefreshing}
          nowTimestamp={nowTimestamp}
          onChangeTab={setDetailTab}
          onBack={() => setSelectedDeviceId(null)}
          onRefresh={fetchAllDevices}
          onOpenPalette={() => setPaletteOpen(true)}
          onSaveSolarPanels={handleSaveSolarPanels}
          onUpdateNotifications={handleUpdateNotifications}
          onUpdateDailySummary={handleUpdateDailySummary}
          onSendDailySummaryTest={(id) => triggerDailySummary(id, true)}
          onUpdateInverterSettings={handleUpdateInverterSettings}
          onClearFaultLogs={handleClearFaultLogs}
          onUpdateThresholds={setThresholds}
        />

        <PalettePickerModal
          open={paletteOpen}
          accent={accent}
          onSelectAccent={setAccent}
          onClose={() => setPaletteOpen(false)}
        />

        <DevicePairingModal
          isOpen={pairingModalOpen}
          onPair={handlePairDevice}
          onClose={() => setPairingModalOpen(false)}
          canCancel={isPaired}
        />
      </>
    );
  }

  /* Render Main Mobile-First Dashboard */
  return (
    <div className="min-h-screen bg-[#F3F5F8] dark:bg-[#131920] text-slate-900 dark:text-slate-100 pb-12">
      {notificationOverlay}

      {/* Top App Bar */}
      <header className="sticky top-0 z-30 h-14 bg-[#F3F5F8]/90 dark:bg-[#131920]/90 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto h-full px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="min-h-[44px] min-w-[44px] -ml-2 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDeviceId(null)}
              className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white font-brand whitespace-nowrap shrink-0 cursor-pointer"
            >
              inverterzone
            </button>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={() => openDeviceDetail(primaryDevice.id, 'realtime')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Realtime
            </button>
            <button
              type="button"
              onClick={() => openDeviceDetail(primaryDevice.id, 'stats')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Stats
            </button>
            <button
              type="button"
              onClick={() => openDeviceDetail(primaryDevice.id, 'stat2')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Stat2
            </button>
            <button
              type="button"
              onClick={() => openDeviceDetail(primaryDevice.id, 'alerts')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Alerts
            </button>
            <button
              type="button"
              onClick={() => openDeviceDetail(primaryDevice.id, 'settings')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => openDeviceDetail(primaryDevice.id, 'test')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Test
            </button>
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setPairingModalOpen(true)}
              aria-label="Device Lock & Pairing"
              title={isPaired ? `Paired device: ${devices[0]?.id || ''}` : 'Pair Inverter Device'}
              className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer relative"
            >
              <Lock className={`w-5 h-5 ${isPaired ? 'text-emerald-500' : 'text-amber-500'}`} />
              {isPaired && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Choose accent color"
              className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Palette className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto px-4 pt-4">
        {apiError && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{apiError}</span>
            </div>
            <button
              type="button"
              onClick={fetchAllDevices}
              className="min-h-[38px] px-3.5 rounded-xl bg-red-600 text-white text-xs font-semibold shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left / Primary Mobile Stream */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. "Right now" Hero Telemetry Card */}
            <section
              aria-label="Right now summary"
              className="rounded-3xl bg-white dark:bg-[#11151B] border border-slate-200/90 dark:border-slate-800/80 p-5 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2 mb-5">
                <h1 className="text-lg font-medium text-slate-900 dark:text-white">
                  Right now
                </h1>
                <button
                  type="button"
                  onClick={fetchAllDevices}
                  className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:opacity-85 transition-opacity cursor-pointer"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      totals.onlineCount > 0 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className="tabular-nums">
                    {totals.onlineCount} of {devices.length} online
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-4 divide-x divide-slate-200 dark:divide-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => openDeviceDetail(primaryDevice.id, 'realtime')}
                  className="px-1.5 py-1 flex flex-col items-center cursor-pointer group"
                >
                  <span className="text-xs sm:text-sm font-medium text-emerald-600 dark:text-[#4ADE80]">
                    Solar
                  </span>
                  <span className="mt-2 text-lg sm:text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                    {totals.solar}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-0.5">
                      W
                    </span>
                  </span>
                  <span className="mt-3 w-8 h-1 rounded-full bg-[#22C55E] group-hover:scale-x-110 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => openDeviceDetail(primaryDevice.id, 'realtime')}
                  className="px-1.5 py-1 flex flex-col items-center cursor-pointer group"
                >
                  <span className="text-xs sm:text-sm font-medium text-rose-600 dark:text-[#F87171]">
                    Load
                  </span>
                  <span className="mt-2 text-lg sm:text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                    {totals.load}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-0.5">
                      W
                    </span>
                  </span>
                  <span className="mt-3 w-8 h-1 rounded-full bg-[#F87171] group-hover:scale-x-110 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => openDeviceDetail(primaryDevice.id, 'realtime')}
                  className="px-1.5 py-1 flex flex-col items-center cursor-pointer group"
                >
                  <span className="text-xs sm:text-sm font-medium text-emerald-600 dark:text-[#4ADE80]">
                    Battery
                  </span>
                  <span className="mt-2 text-lg sm:text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                    {totals.battery}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-0.5">
                      W
                    </span>
                  </span>
                  <span className="mt-3 w-8 h-1 rounded-full bg-[#22C55E] group-hover:scale-x-110 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => openDeviceDetail(primaryDevice.id, 'realtime')}
                  className="px-1.5 py-1 flex flex-col items-center cursor-pointer group"
                >
                  <span className="text-xs sm:text-sm font-medium text-amber-600 dark:text-[#FBBF24] whitespace-nowrap">
                    {totals.grid < 0 ? 'Grid export' : 'Grid import'}
                  </span>
                  <span className="mt-2 text-lg sm:text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                    {Math.abs(totals.grid)}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-0.5">
                      W
                    </span>
                  </span>
                  <span className="mt-3 w-8 h-1 rounded-full bg-[#F59E0B] group-hover:scale-x-110 transition-transform" />
                </button>
              </div>
            </section>

            {/* 2. Six Colorful Action Tiles on Mobile (< lg) */}
            <div className="lg:hidden">
              <QuickActionTilesGrid
                devicesCount={devices.length}
                timersCount={activeTimersCount}
                favoritesCount={favoriteCount}
                favoritesOnly={favoritesOnly}
                onClickDevices={() => {
                  setFavoritesOnly(false);
                  devicesListRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                onClickTimers={() => setTimersOpen(true)}
                onClickFavorites={() => setFavoritesOnly((v) => !v)}
                onClickNearby={() => setNearbyOpen(true)}
                onClickOffline={() => setOfflineOpen(true)}
                onClickViewAll={() => setWallboardOpen(true)}
              />
            </div>

            {/* 3. "Your devices" Section & Live Device Cards */}
            <section ref={devicesListRef} aria-label="Your devices" className="space-y-3.5">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-medium text-slate-900 dark:text-white">
                    {favoritesOnly ? 'Favorite devices' : 'Your devices'}
                  </h2>
                  {favoritesOnly && (
                    <button
                      type="button"
                      onClick={() => setFavoritesOnly(false)}
                      className="text-xs text-slate-500 hover:underline cursor-pointer"
                    >
                      (Reset)
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingDevice('new')}
                    className={`min-h-[40px] px-2.5 text-xs font-semibold inline-flex items-center gap-1 ${accentTextClass} hover:opacity-80 cursor-pointer`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWallboardOpen(true)}
                    className="min-h-[40px] px-1 text-sm font-medium text-slate-700 dark:text-slate-200 hover:underline cursor-pointer"
                  >
                    See all
                  </button>
                </div>
              </div>

              {visibleDevices.map((dev) => {
                const t = telemetryMap[dev.id] ?? null;
                const summary = getOperatingSummary(t, dev.inverterSettings.netMetering);
                const rateRs = dev.inverterSettings.electricityRateRs;
                const costRsHr = t ? calculateGridCostRsPerHour(t.gridWatts, rateRs) : 0;

                const syncLabel = t
                  ? t.stale
                    ? `Cached · ${formatSecondsAgo(t.fetchedAt, nowTimestamp)}`
                    : Date.now() - t.fetchedAt < 12000
                      ? 'Live · now'
                      : `Live · ${formatSecondsAgo(t.fetchedAt, nowTimestamp)}`
                  : 'Syncing...';

                return (
                  <article
                    key={dev.id}
                    className="rounded-3xl bg-white dark:bg-[#11151B] border border-slate-200/90 dark:border-slate-800/80 p-4 sm:p-5 shadow-xs"
                  >
                    {/* Device Card Top Header */}
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-3 h-3 rounded-full shrink-0 ${
                            t ? 'bg-[#22C55E]' : 'bg-amber-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => openDeviceDetail(dev.id, 'realtime')}
                          className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-white hover:underline truncate cursor-pointer"
                        >
                          {dev.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(dev.id)}
                          aria-label={dev.favorite ? 'Remove from favorites' : 'Add to favorites'}
                          className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              dev.favorite ? 'fill-amber-400 text-amber-400' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openDeviceDetail(dev.id, 'realtime')}
                          className="text-xs font-medium text-emerald-700 dark:text-[#4ADE80] tabular-nums cursor-pointer"
                        >
                          {syncLabel}
                        </button>
                        <button
                          type="button"
                          onClick={fetchAllDevices}
                          aria-label="Refresh inverter readings now"
                          className="min-h-[40px] min-w-[40px] -mr-1.5 rounded-full flex items-center justify-center text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${
                              isRefreshing ? 'animate-spin text-emerald-500' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* 2x2 Illustrated Telemetry Cells */}
                    <div
                      onClick={() => openDeviceDetail(dev.id, 'realtime')}
                      className="grid grid-cols-2 gap-3 cursor-pointer"
                    >
                      <div className="rounded-2xl bg-slate-100/90 dark:bg-[#222830] p-3.5 flex items-center gap-3 hover:brightness-105 transition-all">
                        <SolarPanelIllustration active={(t?.solarWatts ?? 0) > 15} />
                        <div className="min-w-0">
                          <p className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                            {t ? `${t.solarWatts} W` : '— W'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            Solar · {summary.solarStatus}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-rose-50 dark:bg-[#2B191D] p-3.5 flex items-center gap-3 hover:brightness-105 transition-all">
                        <HomeLoadIllustration active={(t?.loadWatts ?? 0) > 10} />
                        <div className="min-w-0">
                          <p className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                            {t ? `${t.loadWatts} W` : '— W'}
                          </p>
                          <p className="text-xs text-rose-700 dark:text-[#F87171] truncate mt-0.5">
                            Load · <span className="font-medium">{summary.loadStatus}</span>
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-100/90 dark:bg-[#222830] p-3.5 flex items-center gap-3 hover:brightness-105 transition-all">
                        <BatteryPackIllustration state={t?.batteryState ?? 'no-battery'} />
                        <div className="min-w-0">
                          <p className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                            {t ? `${t.batteryWatts} W` : '— W'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            Battery · {summary.batteryStatus}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-amber-50 dark:bg-[#2C2112] p-3.5 flex items-center gap-3 hover:brightness-105 transition-all">
                        <GridTowersIllustration active={Math.abs(t?.gridWatts ?? 0) > 10} />
                        <div className="min-w-0">
                          <p className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                            {t ? `${Math.abs(t.gridWatts)} W` : '— W'}
                          </p>
                          <p className="text-xs text-amber-700 dark:text-[#FBBF24] truncate mt-0.5">
                            Grid · <span className="font-medium">{summary.gridStatus}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Operating Mode Status Bar */}
                    <div className="mt-4 flex items-center gap-3">
                      <Sun className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0">
                        {summary.headline}
                        {rateRs > 0 && costRsHr > 0 ? ` · Rs ${costRsHr}/hr` : ''}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-[#232A32] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${accentDotClass} transition-transform duration-300 origin-left`}
                          style={{ transform: `scaleX(${summary.progressRatio / 100})` }}
                        />
                      </div>
                    </div>

                    {/* Contact & Hardware Metadata Footer */}
                    <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          {dev.phone && (
                            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              <span>{dev.phone}</span>
                            </span>
                          )}
                          {dev.email && (
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{dev.email}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
                          <button
                            type="button"
                            onClick={() => copyDeviceId(dev.id)}
                            title="Copy Device ID"
                            className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                          >
                            {copiedId === dev.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <QrCode className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>{dev.id}</span>
                          </button>

                          <span className="inline-flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              FW {dev.firmware.replace(/^FW\s+/i, '')}
                              {t ? ` · ${t.mode}/${t.chargingMode}` : ''}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openDeviceDetail(dev.id, 'settings')}
                          className="min-h-[38px] px-3.5 inline-flex items-center justify-center rounded-full bg-slate-200/80 dark:bg-[#222B35] hover:bg-slate-300/80 dark:hover:bg-[#2B3642] text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                        >
                          Settings
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDevice(dev)}
                          className="min-h-[38px] px-4 rounded-full bg-slate-200 dark:bg-[#788089] hover:bg-slate-300 dark:hover:bg-[#8A939D] text-xs font-semibold text-slate-800 dark:text-white transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>

          {/* Right Column on Desktop */}
          <div className="hidden lg:block lg:col-span-5 space-y-5">
            <QuickActionTilesGrid
              devicesCount={devices.length}
              timersCount={activeTimersCount}
              favoritesCount={favoriteCount}
              favoritesOnly={favoritesOnly}
              onClickDevices={() => openDeviceDetail(primaryDevice.id, 'realtime')}
              onClickTimers={() => setTimersOpen(true)}
              onClickFavorites={() => setFavoritesOnly((v) => !v)}
              onClickNearby={() => setNearbyOpen(true)}
              onClickOffline={() => setOfflineOpen(true)}
              onClickViewAll={() => setWallboardOpen(true)}
            />

            {primaryTelemetry && (
              <section className="rounded-3xl bg-white dark:bg-[#11151B] border border-slate-200/90 dark:border-slate-800/80 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {primaryDevice.name} · {primaryDevice.inverterSettings.inverterCompany}{' '}
                      {primaryDevice.inverterSettings.inverterModel}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                      {primaryTelemetry.gridVoltage.toFixed(1)}V · {primaryTelemetry.gridHz.toFixed(1)}Hz ·{' '}
                      Daily Summary:{' '}
                      {primaryDevice.dailySummary.enabled
                        ? formatTime12h(primaryDevice.dailySummary.sendAt24h)
                        : 'Off'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDeviceDetail(primaryDevice.id, 'settings')}
                    className={`text-xs font-semibold ${accentTextClass} hover:underline cursor-pointer whitespace-nowrap shrink-0`}
                  >
                    All Settings →
                  </button>
                </div>

                <PowerFlowDiagram
                  telemetry={primaryTelemetry}
                  pvInstalled={primaryDevice.solarPanels.pvInstalled}
                />
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Interactive Modals & Drawers */}
      <NavigationDrawer
        open={drawerOpen}
        pollIntervalSec={pollIntervalSec}
        onChangePollInterval={setPollIntervalSec}
        onClose={() => setDrawerOpen(false)}
        onNavigateHome={() => setSelectedDeviceId(null)}
        onNavigateDeviceTab={(tab) => openDeviceDetail(primaryDevice.id, tab)}
        onOpenAddDevice={() => setEditingDevice('new')}
        onOpenPairing={() => setPairingModalOpen(true)}
      />

      <PalettePickerModal
        open={paletteOpen}
        accent={accent}
        onSelectAccent={setAccent}
        onClose={() => setPaletteOpen(false)}
      />

      <TimersModal
        open={timersOpen}
        timers={timers}
        onAddTimer={(t) =>
          setTimers((prev) => [...prev, { ...t, id: `tm_${Date.now()}` }])
        }
        onToggleTimer={(id) =>
          setTimers((prev) =>
            prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
          )
        }
        onDeleteTimer={(id) => setTimers((prev) => prev.filter((item) => item.id !== id))}
        onClose={() => setTimersOpen(false)}
      />

      <OfflineDongleModal
        open={offlineOpen}
        deviceId={primaryDevice.id}
        onClose={() => setOfflineOpen(false)}
      />

      <NearbyDevicesModal
        open={nearbyOpen}
        telemetry={primaryTelemetry}
        pvInstalled={primaryDevice.solarPanels.pvInstalled}
        onClose={() => setNearbyOpen(false)}
      />

      <ViewAllWallboardModal
        open={wallboardOpen}
        devices={devices}
        telemetryMap={telemetryMap}
        onSelectDevice={(id) => openDeviceDetail(id, 'realtime')}
        onClose={() => setWallboardOpen(false)}
      />

      <EditDeviceModal
        open={editingDevice !== null}
        initialDevice={editingDevice === 'new' ? null : editingDevice}
        onSave={handleSaveDevice}
        onDelete={devices.length > 1 ? handleDeleteDevice : undefined}
        onClose={() => setEditingDevice(null)}
      />

      <DevicePairingModal
        isOpen={pairingModalOpen}
        onPair={handlePairDevice}
        onClose={() => setPairingModalOpen(false)}
        canCancel={isPaired}
      />
    </div>
  );
}

const QuickActionTilesGrid: React.FC<{
  devicesCount: number;
  timersCount: number;
  favoritesCount: number;
  favoritesOnly: boolean;
  onClickDevices: () => void;
  onClickTimers: () => void;
  onClickFavorites: () => void;
  onClickNearby: () => void;
  onClickOffline: () => void;
  onClickViewAll: () => void;
}> = ({
  devicesCount,
  timersCount,
  favoritesCount,
  favoritesOnly,
  onClickDevices,
  onClickTimers,
  onClickFavorites,
  onClickNearby,
  onClickOffline,
  onClickViewAll,
}) => (
  <section aria-label="Quick actions" className="grid grid-cols-2 gap-3.5">
    <button
      type="button"
      onClick={onClickDevices}
      className="min-h-[86px] rounded-[22px] bg-[#5574FF] hover:brightness-105 active:scale-[0.98] p-4 text-left text-white flex items-center gap-3.5 transition-all cursor-pointer shadow-xs"
    >
      <Wifi className="w-8 h-8 text-white shrink-0" />
      <div className="min-w-0">
        <p className="text-sm sm:text-base font-medium leading-snug truncate">Devices</p>
        <p className="text-base sm:text-lg font-semibold font-mono tabular-nums mt-0.5">
          {devicesCount}
        </p>
      </div>
    </button>

    <button
      type="button"
      onClick={onClickTimers}
      className="min-h-[86px] rounded-[22px] bg-[#FF5751] hover:brightness-105 active:scale-[0.98] p-4 text-left text-white flex items-center gap-3.5 transition-all cursor-pointer shadow-xs"
    >
      <Timer className="w-8 h-8 text-white shrink-0" />
      <div className="min-w-0">
        <p className="text-sm sm:text-base font-medium leading-snug truncate">Timers</p>
        <p className="text-base sm:text-lg font-semibold font-mono tabular-nums mt-0.5">
          {timersCount}
        </p>
      </div>
    </button>

    <button
      type="button"
      onClick={onClickFavorites}
      className={`min-h-[86px] rounded-[22px] bg-[#FFA83E] hover:brightness-105 active:scale-[0.98] p-4 text-left text-white flex items-center gap-3.5 transition-all cursor-pointer shadow-xs ${
        favoritesOnly ? 'ring-2 ring-white' : ''
      }`}
    >
      <Star className="w-8 h-8 text-white fill-white shrink-0" />
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-medium leading-snug truncate">Your Favorites</p>
        <p className="text-base sm:text-lg font-semibold font-mono tabular-nums mt-0.5">
          {favoritesCount}
        </p>
      </div>
    </button>

    <button
      type="button"
      onClick={onClickNearby}
      className="min-h-[86px] rounded-[22px] bg-[#4AAF68] hover:brightness-105 active:scale-[0.98] p-4 text-left text-white flex items-center gap-3.5 transition-all cursor-pointer shadow-xs"
    >
      <MapPin className="w-8 h-8 text-white shrink-0" />
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-medium leading-snug truncate">Nearby Devices</p>
        <p className="text-base sm:text-lg font-semibold font-mono tabular-nums mt-0.5">
          14104
        </p>
      </div>
    </button>

    <button
      type="button"
      onClick={onClickOffline}
      className="min-h-[96px] rounded-[22px] bg-[#969DA3] dark:bg-[#9CA3AF] hover:brightness-105 active:scale-[0.98] p-4 text-left text-white flex items-center gap-3 transition-all cursor-pointer shadow-xs"
    >
      <Router className="w-8 h-8 text-white shrink-0" />
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-semibold leading-snug">Connect Offline</p>
        <p className="text-[11px] sm:text-xs text-white/90 leading-snug mt-0.5">
          View solar with dongle hotspot
        </p>
      </div>
    </button>

    <button
      type="button"
      onClick={onClickViewAll}
      className="min-h-[96px] rounded-[22px] bg-[#7A5AF8] hover:brightness-105 active:scale-[0.98] p-4 text-left text-white flex items-center gap-3 transition-all cursor-pointer shadow-xs"
    >
      <LayoutList className="w-8 h-8 text-white shrink-0" />
      <div className="min-w-0">
        <p className="text-sm sm:text-base font-semibold leading-snug">View All</p>
        <p className="text-[11px] sm:text-xs text-white/90 leading-snug mt-0.5">
          Live view of all your devices
        </p>
      </div>
    </button>
  </section>
);

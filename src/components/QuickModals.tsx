import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Globe,
  Loader2,
  LogIn,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Router,
  Settings,
  Trash2,
  Wifi,
  X,
  Search,
  Zap,
  ChevronRight,
} from 'lucide-react';
import {
  AccentThemeId,
  DetailTab,
  DeviceConfig,
  ModeTimerItem,
  ParsedTelemetry,
} from '../types/inverter';
import {
  fetchInverterZoneNearbyDevices,
  InverterZoneAccountSession,
  InverterZoneDashboardStats,
  InverterZoneNearbyItem,
  loadSavedGeoCenter,
  REGION_PRESETS,
  saveGeoCenter,
} from '../utils/inverterzoneAuth';
import { DEFAULT_DEVICE_CONFIG } from '../utils/telemetry';

/* 1. Navigation Drawer (Hamburger Menu) */
export const NavigationDrawer: React.FC<{
  open: boolean;
  pollIntervalSec: number;
  onChangePollInterval: (sec: number) => void;
  onClose: () => void;
  onNavigateHome: () => void;
  onNavigateDeviceTab: (tab: DetailTab) => void;
  onOpenAddDevice: () => void;
  onOpenPairing?: () => void;
}> = ({
  open,
  pollIntervalSec,
  onChangePollInterval,
  onClose,
  onNavigateHome,
  onNavigateDeviceTab,
  onOpenAddDevice,
  onOpenPairing,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative z-10 w-72 max-w-[84vw] h-full bg-white dark:bg-[#161D25] border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white font-brand">
              inverterzone
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="mt-4 space-y-1">
            <DrawerNavBtn
              label="Dashboard Overview"
              onClick={() => {
                onNavigateHome();
                onClose();
              }}
            />
            <DrawerNavBtn
              label="Live Electrical Telemetry"
              onClick={() => {
                onNavigateDeviceTab('realtime');
                onClose();
              }}
            />
            <DrawerNavBtn
              label="Stats · Session Charts"
              onClick={() => {
                onNavigateDeviceTab('stats');
                onClose();
              }}
            />
            <DrawerNavBtn
              label="Stat2 · Energy & Savings"
              onClick={() => {
                onNavigateDeviceTab('stat2');
                onClose();
              }}
            />
            <DrawerNavBtn
              label="System Alerts & Thresholds"
              onClick={() => {
                onNavigateDeviceTab('alerts');
                onClose();
              }}
            />
            <DrawerNavBtn
              label="Solar Panels & Cloud API"
              onClick={() => {
                onNavigateDeviceTab('settings');
                onClose();
              }}
            />
            <DrawerNavBtn
              label="Test · Dongle & Hardware Lab"
              onClick={() => {
                onNavigateDeviceTab('test');
                onClose();
              }}
            />
            <DrawerNavBtn
              label="Account Login & Device Lock"
              onClick={() => {
                onClose();
                if (onOpenPairing) onOpenPairing();
              }}
            />
            <DrawerNavBtn
              label="Add Another Dongle ID"
              onClick={() => {
                onClose();
                onOpenAddDevice();
              }}
            />
          </nav>

          {/* Auto-Poll Interval Selector */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Live Refresh Cadence
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {[5, 10, 30, 60].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onChangePollInterval(sec)}
                  className={`min-h-[40px] rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors ${
                    pollIntervalSec === sec
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-[#1F2935] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Connected to InverterZone Cloud Realtime API
        </p>
      </aside>
    </div>
  );
};

const DrawerNavBtn: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#212B37] transition-colors"
  >
    {label}
  </button>
);

/* 2. Theme Accent Picker Sheet */
export const PalettePickerModal: React.FC<{
  open: boolean;
  accent: AccentThemeId;
  onSelectAccent: (accent: AccentThemeId) => void;
  onClose: () => void;
}> = ({ open, accent, onSelectAccent, onClose }) => {
  if (!open) return null;

  const themes: { id: AccentThemeId; label: string; swatch: string }[] = [
    { id: 'emerald', label: 'Solar Emerald', swatch: 'bg-emerald-500' },
    { id: 'blue', label: 'Cobalt Sky', swatch: 'bg-blue-500' },
    { id: 'coral', label: 'Warm Coral', swatch: 'bg-rose-500' },
    { id: 'amber', label: 'Sunburst Amber', swatch: 'bg-amber-500' },
    { id: 'violet', label: 'Electric Indigo', swatch: 'bg-violet-500' },
  ];

  return (
    <ModalShell title="Accent Color Theme" onClose={onClose}>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Choose the highlight accent used across active controls and indicators.
      </p>
      <div className="space-y-2">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              onSelectAccent(t.id);
              onClose();
            }}
            className="w-full min-h-[48px] px-4 rounded-xl bg-slate-100 dark:bg-[#1E2732] hover:bg-slate-200/70 dark:hover:bg-[#25303E] flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-white">
              <span className={`w-4 h-4 rounded-full ${t.swatch}`} />
              <span>{t.label}</span>
            </span>
            {accent === t.id && <Check className="w-4 h-4 text-emerald-500" />}
          </button>
        ))}
      </div>
    </ModalShell>
  );
};

/* 3. Mode & Load Timers Modal (Timers Red Tile) */
export const TimersModal: React.FC<{
  open: boolean;
  timers: ModeTimerItem[];
  onAddTimer: (timer: Omit<ModeTimerItem, 'id'>) => void;
  onToggleTimer: (id: string) => void;
  onDeleteTimer: (id: string) => void;
  onClose: () => void;
}> = ({ open, timers, onAddTimer, onToggleTimer, onDeleteTimer, onClose }) => {
  const [label, setLabel] = useState('Morning Solar Priority');
  const [time, setTime] = useState('07:00');
  const [targetMode, setTargetMode] = useState<'SUB' | 'SBU' | 'USB' | 'SOL'>('SUB');
  const [chargingMode, setChargingMode] = useState<'CSO' | 'SNU' | 'OSO'>('CSO');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    onAddTimer({
      label: label.trim(),
      time,
      targetMode,
      chargingMode,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      enabled: true,
    });
    setLabel('');
  };

  return (
    <ModalShell title={`Mode Schedule Timers (${timers.length})`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Schedule Label
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Peak Evening Grid Guard"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Trigger Time
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Output Mode
            </label>
            <select
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value as 'SUB' | 'SBU' | 'USB' | 'SOL')}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              <option value="SUB">SUB (Solar-Utility-Batt)</option>
              <option value="SBU">SBU (Solar-Batt-Utility)</option>
              <option value="USB">USB (Utility First)</option>
              <option value="SOL">SOL (Solar First)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Charger Priority
            </label>
            <select
              value={chargingMode}
              onChange={(e) => setChargingMode(e.target.value as 'CSO' | 'SNU' | 'OSO')}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              <option value="CSO">CSO (Solar First)</option>
              <option value="SNU">SNU (Solar + Grid)</option>
              <option value="OSO">OSO (Solar Only)</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FF5751] hover:bg-[#E84B45] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Mode Timer</span>
        </button>
      </form>

      <div className="mt-4 space-y-2.5 max-h-60 overflow-y-auto">
        {timers.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-6 h-6 mx-auto mb-1.5 opacity-60" />
            No scheduled timers configured yet. Add one above to track mode transitions.
          </div>
        ) : (
          timers.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-slate-100 dark:bg-[#1E2732] flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {item.label}
                </p>
                <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                  {item.time} · {item.targetMode} · {item.chargingMode}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={() => onToggleTimer(item.id)}
                  aria-label={`Enable ${item.label}`}
                  className="w-5 h-5 accent-emerald-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => onDeleteTimer(item.id)}
                  aria-label={`Delete ${item.label}`}
                  className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
};

/* 4. Connect Offline Dongle Hotspot Guide (Slate Tile) */
export const OfflineDongleModal: React.FC<{
  open: boolean;
  deviceId: string;
  onClose: () => void;
}> = ({ open, deviceId, onClose }) => {
  const [dongleIp, setDongleIp] = useState('192.168.4.1');

  if (!open) return null;

  return (
    <ModalShell title="Connect Offline via Dongle Hotspot" onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#1E2732] flex items-start gap-3">
          <Router className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            When home internet is unavailable, press the button on your InverterZone WiFi dongle once to broadcast its local hotspot AP (<span className="font-mono font-semibold">IZ-{deviceId.slice(-6)}</span>).
          </p>
        </div>

        <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-400 list-decimal list-inside">
          <li>Connect your phone WiFi to the InverterZone dongle AP network.</li>
          <li>Disable mobile cellular data routing temporarily so local LAN traffic routes to the dongle.</li>
          <li>Verify the local gateway IP below (default <span className="font-mono">192.168.4.1</span>).</li>
        </ol>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Local Dongle Gateway IP
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={dongleIp}
              onChange={(e) => setDongleIp(e.target.value)}
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 font-mono text-sm text-slate-900 dark:text-white"
            />
            <a
              href={`http://${dongleIp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Open Portal</span>
            </a>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

export interface NearbyPlantInfo {
  id: string;
  name: string;
  distance: string;
  distanceKm?: number;
  solarW: number;
  loadW?: number;
  capacity: number;
  ratedWatts?: number;
  type: 'Residential' | 'Commercial';
  status: string;
  brand?: string;
  model?: string;
  version?: string;
  location?: string;
  online?: boolean;
  latitude?: number;
  longitude?: number;
  liveTelemetry?: ParsedTelemetry | null;
}

/* 5. Nearby Community Solar Installations Modal (Green Tile) */
export const NearbyDevicesModal: React.FC<{
  open: boolean;
  telemetry: ParsedTelemetry | null;
  pvInstalled: number;
  primaryDeviceId: string;
  accountSession: InverterZoneAccountSession | null;
  accountStats: InverterZoneDashboardStats | null;
  preferredCenter?: { lat: number; lon: number } | null;
  onOpenAccountLogin: () => void;
  onClose: () => void;
  onSelectDevice?: (plant: NearbyPlantInfo) => void;
}> = ({
  open,
  telemetry,
  pvInstalled,
  primaryDeviceId,
  accountSession,
  accountStats,
  preferredCenter,
  onOpenAccountLogin,
  onClose,
  onSelectDevice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'generating' | 'commercial'>('all');
  const [sortMode, setSortMode] = useState<'distance' | 'production'>('distance');
  const [geoCenter, setGeoCenter] = useState<{ lat: number; lon: number; label: string }>(() =>
    loadSavedGeoCenter()
  );
  const [realNearbyPlants, setRealNearbyPlants] = useState<NearbyPlantInfo[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  useEffect(() => {
    if (preferredCenter && Number.isFinite(preferredCenter.lat) && Number.isFinite(preferredCenter.lon)) {
      setGeoCenter((prev) => ({
        lat: preferredCenter.lat,
        lon: preferredCenter.lon,
        label: prev.label === 'GPS Location' ? 'GPS Location' : 'My Inverter Location',
      }));
    }
  }, [preferredCenter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const mapNearbyItem = useCallback(
    (d: InverterZoneNearbyItem): NearbyPlantInfo => {
      const isPrimary = d.mac === primaryDeviceId;
      const capacity = isPrimary ? pvInstalled : Math.max(1000, d.pvCapacityW || d.acRatingW || 10000);
      const solarW = isPrimary && telemetry ? telemetry.solarWatts : d.productionW;
      const loadW = isPrimary && telemetry ? telemetry.loadWatts : d.loadW;
      const distLabel =
        d.distanceKm !== null && Number.isFinite(d.distanceKm)
          ? `${d.distanceKm.toFixed(1)} km`
          : 'Nearby';
      const formattedLocation = d.location
        ? d.location.replace(/\b\w/g, (ch) => ch.toUpperCase())
        : undefined;

      return {
        id: d.mac,
        name: isPrimary ? `${d.name} (Yours)` : d.name,
        distance: distLabel,
        distanceKm: d.distanceKm ?? undefined,
        solarW,
        loadW,
        capacity,
        ratedWatts: d.acRatingW,
        type: capacity >= 12000 || d.acRatingW >= 12000 ? 'Commercial' : 'Residential',
        status: !d.online
          ? 'Offline'
          : solarW > 0
            ? 'Generating · Online'
            : 'Standby · Online',
        brand: d.brand,
        model: d.model,
        version: d.version,
        location: formattedLocation,
        online: d.online,
        liveTelemetry: isPrimary ? telemetry : null,
      };
    },
    [primaryDeviceId, pvInstalled, telemetry]
  );

  const loadRealNearby = useCallback(
    async (page = 1, append = false) => {
      if (!accountSession?.token) return;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoadingNearby(true);
      }
      setNearbyError(null);

      try {
        const { items, nextPage: upcomingPage } = await fetchInverterZoneNearbyDevices({
          token: accountSession.token,
          lat: geoCenter.lat,
          lng: geoCenter.lon,
          pageNumber: page,
          sort: sortMode,
          search: debouncedSearch,
        });

        const mapped = items.map(mapNearbyItem);
        setNextPage(upcomingPage);

        if (append) {
          setRealNearbyPlants((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const merged = [...prev];
            for (const item of mapped) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                merged.push(item);
              }
            }
            return merged;
          });
        } else {
          setRealNearbyPlants(mapped);
        }
      } catch (err) {
        setNearbyError(
          err instanceof Error ? err.message : 'Unable to fetch nearby fleet from InverterZone.'
        );
      } finally {
        setLoadingNearby(false);
        setLoadingMore(false);
      }
    },
    [accountSession?.token, geoCenter.lat, geoCenter.lon, sortMode, debouncedSearch, mapNearbyItem]
  );

  useEffect(() => {
    if (open && accountSession?.token) {
      void loadRealNearby(1, false);
    }
  }, [open, accountSession?.token, loadRealNearby]);

  if (!open) return null;

  const handleUseBrowserGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('GPS not supported in this browser.');
      return;
    }
    setGpsStatus('Locating...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lon: Number(pos.coords.longitude.toFixed(5)),
          label: 'GPS Location',
        };
        setGeoCenter(next);
        saveGeoCenter(next);
        setGpsStatus(null);
      },
      () => {
        setGpsStatus('Location permission denied — pick a city below.');
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const sampleList: NearbyPlantInfo[] = [
    { id: primaryDeviceId, name: 'HOME (You)', distance: '0.0 km', solarW: telemetry?.solarWatts ?? 0, loadW: telemetry?.loadWatts ?? 0, capacity: pvInstalled, type: 'Residential', status: 'Your Live Inverter', liveTelemetry: telemetry },
    { id: 'ALFA8821B901', name: 'Model Town Sector H Hub', distance: '0.4 km', solarW: 8450, loadW: 2140, capacity: 10000, type: 'Commercial', status: 'Sample Fleet' },
    { id: 'GULF3392X774', name: 'Gulberg Phase 3 Array', distance: '1.2 km', solarW: 6200, loadW: 1680, capacity: 8000, type: 'Residential', status: 'Sample Fleet' },
    { id: 'DHA5510M4482', name: 'DHA Phase 5 Commercial PV', distance: '2.5 km', solarW: 14200, loadW: 4100, capacity: 15000, type: 'Commercial', status: 'Sample Fleet' },
    { id: 'F7SEC9931K12', name: 'F-7 Sector Microgrid', distance: '3.1 km', solarW: 0, loadW: 920, capacity: 12000, type: 'Commercial', status: 'Sample Fleet' },
    { id: 'JOHAR7118P553', name: 'Johar Town Solar Farm', distance: '4.8 km', solarW: 9800, loadW: 3250, capacity: 14000, type: 'Commercial', status: 'Sample Fleet' },
    { id: 'BAHRIA2049S881', name: 'Bahria Heights Block 4', distance: '5.6 km', solarW: 3450, loadW: 1120, capacity: 5000, type: 'Residential', status: 'Sample Fleet' },
    { id: 'CANAL8812V339', name: 'Canal View Villas #42', distance: '6.3 km', solarW: 4100, loadW: 1380, capacity: 6000, type: 'Residential', status: 'Sample Fleet' },
  ];

  const activeList = accountSession ? realNearbyPlants : sampleList;

  const filtered = activeList.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.location?.toLowerCase().includes(q) ?? false) ||
      (item.brand?.toLowerCase().includes(q) ?? false);
    if (filterType === 'generating') return matchSearch && item.solarW > 0;
    if (filterType === 'commercial') return matchSearch && item.type === 'Commercial';
    return matchSearch;
  });

  const modalTitle = accountSession
    ? `Nearby Solar Fleet (${realNearbyPlants.length} loaded${
        accountStats?.nearByCount ? ` · ${accountStats.nearByCount.toLocaleString()} Total` : ''
      })`
    : `Nearby Solar Fleet (${sampleList.length} Sample Preview)`;

  return (
    <ModalShell title={modalTitle} onClose={onClose} wide>
      <div className="space-y-4">
        {!accountSession ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Sign in with your InverterZone account for real nearby plants
                </p>
                <p className="mt-0.5">
                  Showing {sampleList.length} preview items right now. Sign in with your company app login to load all real nearby inverters around you.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAccountLogin();
              }}
              className="min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in Now</span>
            </button>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#1B232D] border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {geoCenter.label}
                </span>
                <span className="mx-1.5 text-slate-400">·</span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {geoCenter.lat.toFixed(3)}, {geoCenter.lon.toFixed(3)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleUseBrowserGps}
                  className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#131920] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500/50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Use GPS</span>
                </button>
                <button
                  type="button"
                  onClick={() => void loadRealNearby(1, false)}
                  disabled={loadingNearby}
                  className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingNearby ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                aria-label="Select region center"
                value={
                  REGION_PRESETS.find(
                    (p) => Math.abs(p.lat - geoCenter.lat) < 0.01 && Math.abs(p.lon - geoCenter.lon) < 0.01
                  )?.id || ''
                }
                onChange={(e) => {
                  const preset = REGION_PRESETS.find((p) => p.id === e.target.value);
                  if (preset) {
                    const next = { lat: preset.lat, lon: preset.lon, label: preset.label };
                    setGeoCenter(next);
                    saveGeoCenter(next);
                    setGpsStatus(null);
                  }
                }}
                className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#131920] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="" disabled>
                  Select City ({geoCenter.label})
                </option>
                {REGION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSortMode('distance')}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    sortMode === 'distance'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-[#131920] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Nearest
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('production')}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    sortMode === 'production'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-[#131920] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Top Production
                </button>
              </div>
            </div>

            {gpsStatus && <p className="text-xs text-amber-600 dark:text-amber-400">{gpsStatus}</p>}
            {nearbyError && <p className="text-xs font-medium text-rose-500">{nearbyError}</p>}
          </div>
        )}

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={
                accountSession
                  ? 'Search plant name, city, brand or MAC ID...'
                  : 'Filter preview plant name or MAC ID...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                filterType === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1A222C] text-slate-700 dark:text-slate-300'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType('generating')}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                filterType === 'generating'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1A222C] text-slate-700 dark:text-slate-300'
              }`}
            >
              Generating
            </button>
            <button
              type="button"
              onClick={() => setFilterType('commercial')}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                filterType === 'commercial'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1A222C] text-slate-700 dark:text-slate-300'
              }`}
            >
              Commercial
            </button>
          </div>
        </div>

        {/* Nearby Device List */}
        <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
          {loadingNearby ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span>
                {debouncedSearch
                  ? `Searching InverterZone fleet for "${debouncedSearch}"...`
                  : `Loading nearby inverters around ${geoCenter.label}...`}
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              {accountSession
                ? debouncedSearch
                  ? `No nearby InverterZone plants matched "${debouncedSearch}".`
                  : `No nearby InverterZone installations returned for ${geoCenter.label}. Try tapping Refresh or switching city/GPS.`
                : 'No installations found matching your filter.'}
            </div>
          ) : (
            <>
              {filtered.map((item) => {
                const pct =
                  item.capacity > 0
                    ? Math.min(100, Math.round((item.solarW / item.capacity) * 100))
                    : 0;
                const loadW = item.liveTelemetry?.loadWatts ?? item.loadW;
                const brandModel = [item.brand, item.model].filter(Boolean).join(' ').trim();

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-slate-100 dark:bg-[#1B232D] border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Zap
                          className={`w-4 h-4 shrink-0 ${
                            item.solarW > 0 ? 'text-emerald-500' : 'text-slate-400'
                          }`}
                        />
                        <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.name}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          · {item.distance}
                        </span>
                        {item.location && (
                          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 truncate">
                            · {item.location}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span>{item.id}</span>
                        <span>·</span>
                        <span
                          className={
                            item.solarW > 0
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          Solar: {item.solarW} W ({pct}%)
                        </span>
                        {loadW !== undefined && (
                          <>
                            <span>·</span>
                            <span>Load: {loadW} W</span>
                          </>
                        )}
                        {brandModel && (
                          <>
                            <span>·</span>
                            <span className="uppercase">{brandModel}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{item.status}</span>
                      </div>
                    </div>

                    {onSelectDevice && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectDevice(item);
                        }}
                        className="min-h-[42px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <span>View</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {accountSession && nextPage !== null && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadRealNearby(nextPage, true)}
                    className="min-h-[42px] px-5 rounded-xl bg-slate-200 dark:bg-[#212B37] hover:bg-slate-300 dark:hover:bg-[#293545] disabled:opacity-60 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{loadingMore ? 'Loading more...' : 'Load More Inverters'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

/* 6. View All Live Wallboard Modal (Violet Tile) */
export const ViewAllWallboardModal: React.FC<{
  open: boolean;
  devices: DeviceConfig[];
  telemetryMap: Record<string, ParsedTelemetry>;
  onSelectDevice: (deviceId: string) => void;
  onClose: () => void;
}> = ({ open, devices, telemetryMap, onSelectDevice, onClose }) => {
  if (!open) return null;

  return (
    <ModalShell title="Live Multi-Metric Wallboard" onClose={onClose} wide>
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
        {devices.map((dev) => {
          const t = telemetryMap[dev.id];
          return (
            <div
              key={dev.id}
              className="p-4 rounded-2xl bg-slate-100 dark:bg-[#1B232D] border border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">{dev.name}</span>
                  <span className="text-xs font-mono text-slate-500">· {dev.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectDevice(dev.id);
                  }}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Full Detail</span>
                </button>
              </div>

              {t ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <WallStat label="Solar Power" value={`${t.solarWatts} W`} sub={`${t.solarVoltage.toFixed(1)}V · ${t.solarAmpere.toFixed(1)}A`} />
                  <WallStat label="Home Load" value={`${t.loadWatts} W`} sub={`${t.loadVa} VA · ${t.loadPercentage}%`} />
                  <WallStat label="Grid Import" value={`${t.gridWatts} W`} sub={`${t.gridVoltage.toFixed(1)}V · ${t.gridHz.toFixed(1)}Hz`} />
                  <WallStat label="Inverter Thermal" value={`${t.mpptTemperature} °C`} sub={`Fan ${t.fanSpeed}% · ${t.mode}/${t.chargingMode}`} />
                </div>
              ) : (
                <p className="text-xs text-slate-500">Syncing live data...</p>
              )}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
};

const WallStat: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="p-3 rounded-xl bg-white dark:bg-[#131920]">
    <p className="text-slate-500 dark:text-slate-400">{label}</p>
    <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
      {value}
    </p>
    <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
      {sub}
    </p>
  </div>
);

/* 7. Edit / Add Device Modal */
export const EditDeviceModal: React.FC<{
  open: boolean;
  initialDevice: DeviceConfig | null;
  onSave: (device: DeviceConfig, previousId?: string) => void;
  onDelete?: (deviceId: string) => void;
  onClose: () => void;
}> = ({ open, initialDevice, onSave, onDelete, onClose }) => {
  const isNew = !initialDevice;
  const [name, setName] = useState(initialDevice?.name ?? 'SOLAR 2');
  const [deviceId, setDeviceId] = useState(initialDevice?.id ?? '');
  const [ratedWatts, setRatedWatts] = useState(String(initialDevice?.ratedWatts ?? 10000));
  const [phone, setPhone] = useState(initialDevice?.phone ?? DEFAULT_DEVICE_CONFIG.phone);
  const [email, setEmail] = useState(initialDevice?.email ?? DEFAULT_DEVICE_CONFIG.email);
  const [firmware, setFirmware] = useState(initialDevice?.firmware ?? 'FW 11.1');

  React.useEffect(() => {
    if (open) {
      setName(initialDevice?.name ?? 'OFFICE');
      setDeviceId(initialDevice?.id ?? '');
      setRatedWatts(String(initialDevice?.ratedWatts ?? 10000));
      setPhone(initialDevice?.phone ?? DEFAULT_DEVICE_CONFIG.phone);
      setEmail(initialDevice?.email ?? DEFAULT_DEVICE_CONFIG.email);
      setFirmware(initialDevice?.firmware ?? 'FW 11.1');
    }
  }, [open, initialDevice]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = deviceId.trim().toUpperCase().replace(/^["']|["']$/g, '');
    if (!cleanId) return;
    onSave(
      {
        id: cleanId,
        name: name.trim() || 'HOME',
        ratedWatts: Math.max(500, parseInt(ratedWatts, 10) || 10000),
        phone: phone.trim(),
        email: email.trim(),
        firmware: (firmware.trim() || '11.1').replace(/^FW\s+/i, ''),
        favorite: initialDevice?.favorite ?? true,
        solarPanels: initialDevice?.solarPanels ?? DEFAULT_DEVICE_CONFIG.solarPanels,
        notifications: initialDevice?.notifications ?? DEFAULT_DEVICE_CONFIG.notifications,
        dailySummary: initialDevice?.dailySummary ?? DEFAULT_DEVICE_CONFIG.dailySummary,
        inverterSettings:
          initialDevice?.inverterSettings ?? DEFAULT_DEVICE_CONFIG.inverterSettings,
      },
      initialDevice?.id
    );
    onClose();
  };

  return (
    <ModalShell title={isNew ? 'Add InverterZone Device' : `Edit ${initialDevice.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Site / Device Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              InverterZone Device ID
            </label>
            <input
              type="text"
              required
              placeholder="BCDDC277F175"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Rated Capacity (W)
            </label>
            <input
              type="number"
              min={500}
              max={100000}
              value={ratedWatts}
              onChange={(e) => setRatedWatts(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Firmware Label
            </label>
            <input
              type="text"
              value={firmware}
              onChange={(e) => setFirmware(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Contact Phone
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between gap-3">
          {!isNew && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete(initialDevice.id);
                onClose();
              }}
              className="min-h-[44px] px-4 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
            >
              Remove Device
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
            >
              Save Device
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
};

/* Shared Accessible Bottom-Sheet / Centered Modal Wrapper */
const ModalShell: React.FC<{
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ title, onClose, wide = false, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-xs"
      onClick={onClose}
      aria-hidden="true"
    />
    <div
      role="dialog"
      aria-modal="true"
      className={`relative z-10 w-full ${
        wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
      } rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#161D25] border-t sm:border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl`}
    >
      <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" />
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

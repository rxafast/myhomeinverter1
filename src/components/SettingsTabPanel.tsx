import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Barcode,
  Bell,
  Building2,
  Check,
  Clock,
  Code2,
  Contrast,
  Copy,
  Cpu,
  Database,
  Factory,
  Gauge,
  Globe,
  Grid,
  HardDrive,
  Layers,
  Link2,
  Play,
  Plug,
  RotateCcw,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  Thermometer,
  TrendingUp,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
  Server,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  DailySummaryConfig,
  DeviceConfig,
  EnableDisable,
  InverterSettingsConfig,
  NotificationSettingsConfig,
  ParsedTelemetry,
  SolarPanelSettings,
} from '../types/inverter';
import {
  CLOUD_API_URL,
  formatTime12h,
  generateHomeAssistantYaml,
  playAlertBeep,
} from '../utils/telemetry';

interface SettingsTabPanelProps {
  device: DeviceConfig;
  telemetry: ParsedTelemetry | null;
  rawPayload: Record<string, unknown> | null;
  onUpdateNotifications: (next: NotificationSettingsConfig) => void;
  onUpdateDailySummary: (next: DailySummaryConfig) => void;
  onSendDailySummaryTest: () => void;
  onUpdateInverterSettings: (next: InverterSettingsConfig, summaryLabel?: string) => void;
  onSaveSolarPanels: (panels: SolarPanelSettings) => void;
}

const INVERTER_COMPANIES = [
  'Fronus',
  'Inverex',
  'Crown',
  'Maxpower',
  'Knox',
  'Tesla',
  'SolarMax',
  'Growatt',
  'Solis',
  'Voltronic',
];

const PANEL_COMPANIES = [
  'VSUN',
  'Longi Solar',
  'Jinko Solar',
  'Canadian Solar',
  'JA Solar',
  'Trina Solar',
  'Astronergy',
  'REC Solar',
  'Custom',
];

export const SettingsTabPanel: React.FC<SettingsTabPanelProps> = ({
  device,
  telemetry,
  rawPayload,
  onUpdateNotifications,
  onUpdateDailySummary,
  onSendDailySummaryTest,
  onUpdateInverterSettings,
  onSaveSolarPanels,
}) => {
  /* Local controlled inputs for fields with explicit Save / Change actions */
  const [modelInput, setModelInput] = useState(device.inverterSettings.inverterModel);
  const [rateInput, setRateInput] = useState(
    device.inverterSettings.electricityRateRs > 0
      ? String(device.inverterSettings.electricityRateRs)
      : ''
  );
  const [editingSummaryTime, setEditingSummaryTime] = useState(false);
  const [summaryTimeDraft, setSummaryTimeDraft] = useState(device.dailySummary.sendAt24h);

  /* Solar Panels form state */
  const [company, setCompany] = useState(device.solarPanels.company);
  const [panelWatts, setPanelWatts] = useState(String(device.solarPanels.panelWatts));
  const [panelCount, setPanelCount] = useState(String(device.solarPanels.panelCount));
  const [pvInstalled, setPvInstalled] = useState(String(device.solarPanels.pvInstalled));

  /* Transient feedback badges */
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<
    'code' | 'url' | 'param' | 'json' | 'yaml' | 'deploy' | 'backend' | null
  >(null);
  const [showDeveloperDrawer, setShowDeveloperDrawer] = useState(false);

  /* GitHub Pages / Custom Backend URL state */
  const [customApiUrl, setCustomApiUrl] = useState(() => {
    try {
      return localStorage.getItem('iz_backend_api_url') || '';
    } catch {
      return '';
    }
  });
  const [testingBackend, setTestingBackend] = useState(false);
  const [backendTestResult, setBackendTestResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  useEffect(() => {
    setModelInput(device.inverterSettings.inverterModel);
    setRateInput(
      device.inverterSettings.electricityRateRs > 0
        ? String(device.inverterSettings.electricityRateRs)
        : ''
    );
    setSummaryTimeDraft(device.dailySummary.sendAt24h);
    setCompany(device.solarPanels.company);
    setPanelWatts(String(device.solarPanels.panelWatts));
    setPanelCount(String(device.solarPanels.panelCount));
    setPvInstalled(String(device.solarPanels.pvInstalled));
  }, [device]);

  const flashSaved = (label: string) => {
    setSavedToast(label);
    setTimeout(() => {
      setSavedToast((prev) => (prev === label ? null : prev));
    }, 2200);
  };

  const copyToClipboard = async (
    text: string,
    key: 'code' | 'url' | 'param' | 'json' | 'yaml' | 'deploy' | 'backend'
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Restricted clipboard context
    }
  };

  const handleSaveCustomBackend = () => {
    const trimmed = customApiUrl.trim().replace(/\/+$/, '');
    setCustomApiUrl(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem('iz_backend_api_url', trimmed);
        flashSaved('Custom backend proxy saved');
      } else {
        localStorage.removeItem('iz_backend_api_url');
        flashSaved('Reset to default backend');
      }
    } catch {
      flashSaved('Saved locally');
    }
  };

  const handleTestBackend = async () => {
    const trimmed = customApiUrl.trim().replace(/\/+$/, '');
    const target = trimmed || window.location.origin;
    setTestingBackend(true);
    setBackendTestResult({ status: 'idle', message: '' });
    try {
      const res = await fetch(`${target}/api/realtime?deviceId=${encodeURIComponent(device.id)}`);
      if (res.ok) {
        const cType = res.headers.get('content-type') || '';
        if (cType.includes('application/json')) {
          const json = await res.json();
          if (json && (json.success || json.data)) {
            setBackendTestResult({
              status: 'success',
              message: 'Connected successfully to live inverter backend!',
            });
            flashSaved('Backend connection verified');
            return;
          }
        }
      }
      setBackendTestResult({
        status: 'error',
        message: `HTTP ${res.status}: Connected, but response wasn't InverterZone JSON.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setBackendTestResult({
        status: 'error',
        message: `Connection failed: ${msg}. If using GitHub Pages, ensure your proxy server enables CORS (Access-Control-Allow-Origin: *).`,
      });
    } finally {
      setTestingBackend(false);
    }
  };

  const handleToggleMasterNotifications = async (checked: boolean) => {
    if (checked && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch {
        // Ignore in sandboxed iframe
      }
    }
    onUpdateNotifications({
      ...device.notifications,
      masterEnabled: checked,
    });
    flashSaved(checked ? 'Notifications enabled' : 'Notifications muted');
  };

  const handleSaveModel = () => {
    const trimmed = modelInput.trim() || 'MATRIX PV 10000';
    setModelInput(trimmed);
    onUpdateInverterSettings(
      { ...device.inverterSettings, inverterModel: trimmed },
      'Inverter model saved'
    );
    flashSaved('Inverter model saved');
  };

  const handleSaveRate = () => {
    const parsed = Math.max(0, parseFloat(rateInput) || 0);
    setRateInput(parsed > 0 ? String(parsed) : '');
    onUpdateInverterSettings(
      { ...device.inverterSettings, electricityRateRs: parsed },
      'Electricity rate saved'
    );
    flashSaved(parsed > 0 ? `Electricity rate set to Rs ${parsed}/kWh` : 'Electricity rate cleared');
  };

  const handleInverterField = <K extends keyof InverterSettingsConfig>(
    key: K,
    value: InverterSettingsConfig[K],
    label: string
  ) => {
    if (key === 'alarm' && value === 'Enable') {
      playAlertBeep();
    }
    onUpdateInverterSettings({ ...device.inverterSettings, [key]: value }, label);
    flashSaved(`${label} updated`);
  };

  const handleWattsChange = (val: string) => {
    setPanelWatts(val);
    const w = parseInt(val, 10);
    const n = parseInt(panelCount, 10);
    if (Number.isFinite(w) && Number.isFinite(n) && w >= 0 && n >= 0) {
      setPvInstalled(String(w * n));
    }
  };

  const handleCountChange = (val: string) => {
    setPanelCount(val);
    const w = parseInt(panelWatts, 10);
    const n = parseInt(val, 10);
    if (Number.isFinite(w) && Number.isFinite(n) && w >= 0 && n >= 0) {
      setPvInstalled(String(w * n));
    }
  };

  const handleSavePanelsForm = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Math.max(0, parseInt(panelWatts, 10) || 0);
    const n = Math.max(0, parseInt(panelCount, 10) || 0);
    const total = Math.max(0, parseInt(pvInstalled, 10) || w * n);
    onSaveSolarPanels({
      company: company || 'VSUN',
      panelWatts: w,
      panelCount: n,
      pvInstalled: total,
    });
    flashSaved('Solar panel details saved');
  };

  const inv = device.inverterSettings;
  const wifiDbm = telemetry ? telemetry.wifiSignalDbm : -77;
  const liveFreq = telemetry ? telemetry.gridHz.toFixed(1) : '50.3';

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-8">
      {/* Floating / Sticky Subtle Save Feedback Banner */}
      {savedToast && (
        <div className="sticky top-3 z-20 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-semibold shadow-md flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{savedToast}</span>
          </span>
          <span className="text-[11px] text-emerald-100 font-mono">Synced</span>
        </div>
      )}

      {/* 1. SOLAR DONGLE CARD */}
      <section className="rounded-2xl bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Solar Dongle
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">
          Information of solar dongle
        </p>

        <div className="space-y-5">
          {/* Wifi Signals */}
          <div className="flex items-start gap-3.5">
            <Wifi className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Wifi Signals
              </p>
              <p className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-white mt-0.5">
                {wifiDbm}
              </p>
            </div>
          </div>

          {/* Firmware Version */}
          <div className="flex items-start gap-3.5">
            <Settings className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Firmware Version
              </p>
              <p className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-white mt-0.5">
                {device.firmware.replace(/^FW\s+/i, '')}
              </p>
            </div>
          </div>

          {/* Device Code */}
          <div className="flex items-start gap-3.5">
            <Barcode className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Device Code
              </p>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-white truncate">
                  {device.id}
                </p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(device.id, 'code')}
                  aria-label="Copy Device Code"
                  className="min-h-[44px] min-w-[44px] -mr-2 -my-2 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  {copiedKey === 'code' ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. NOTIFICATIONS SETTINGS CARD */}
      <section className="rounded-2xl bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Notifications Settings
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5">
          Turn specific notifications on/off
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Notifications
              </span>
            </div>
            <ToggleSwitch
              checked={device.notifications.masterEnabled}
              onChange={handleToggleMasterNotifications}
              ariaLabel="Enable master notifications"
            />
          </div>

          {device.notifications.masterEnabled && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 pl-8">
                  Overload & Fault Code Alerts
                </span>
                <ToggleSwitch
                  checked={device.notifications.overloadAndFaultAlerts}
                  onChange={(checked) => {
                    onUpdateNotifications({
                      ...device.notifications,
                      overloadAndFaultAlerts: checked,
                    });
                    flashSaved('Overload alerts preference saved');
                  }}
                  ariaLabel="Toggle overload and fault alerts"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 pl-8">
                  Grid Source Interrupt Alerts
                </span>
                <ToggleSwitch
                  checked={device.notifications.gridInterruptAlerts}
                  onChange={(checked) => {
                    onUpdateNotifications({
                      ...device.notifications,
                      gridInterruptAlerts: checked,
                    });
                    flashSaved('Grid interrupt alerts preference saved');
                  }}
                  ariaLabel="Toggle grid source interrupt alerts"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 pl-8">
                  High MPPT Temperature Alerts
                </span>
                <ToggleSwitch
                  checked={device.notifications.highTempAlerts}
                  onChange={(checked) => {
                    onUpdateNotifications({
                      ...device.notifications,
                      highTempAlerts: checked,
                    });
                    flashSaved('Temperature alerts preference saved');
                  }}
                  ariaLabel="Toggle high temperature alerts"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. DAILY SUMMARY CARD */}
      <section className="rounded-2xl bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Daily Summary
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5 leading-relaxed">
          Get today&apos;s solar, battery and grid use as a push notification
        </p>

        <div className="space-y-4">
          {/* Daily Summary Push Toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Daily Summary Push
              </span>
            </div>
            <ToggleSwitch
              checked={device.dailySummary.enabled}
              onChange={(checked) => {
                onUpdateDailySummary({ ...device.dailySummary, enabled: checked });
                flashSaved(
                  checked
                    ? `Daily summary scheduled for ${formatTime12h(device.dailySummary.sendAt24h)}`
                    : 'Daily summary turned off'
                );
              }}
              ariaLabel="Enable Daily Summary Push"
            />
          </div>

          {/* Send at Row */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  Send at
                </p>
                {editingSummaryTime ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      type="time"
                      value={summaryTimeDraft}
                      onChange={(e) => setSummaryTimeDraft(e.target.value)}
                      className="min-h-[40px] px-3 rounded-lg bg-slate-100 dark:bg-[#182029] border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDailySummary({
                          ...device.dailySummary,
                          sendAt24h: summaryTimeDraft || '21:00',
                        });
                        setEditingSummaryTime(false);
                        flashSaved(`Summary time updated to ${formatTime12h(summaryTimeDraft)}`);
                      }}
                      className="min-h-[40px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-white mt-0.5">
                    {formatTime12h(device.dailySummary.sendAt24h)}
                  </p>
                )}
              </div>
            </div>

            {!editingSummaryTime && (
              <button
                type="button"
                onClick={() => setEditingSummaryTime(true)}
                className="min-h-[44px] px-2 text-xs sm:text-sm font-semibold text-emerald-600 dark:text-[#34D399] hover:underline cursor-pointer shrink-0"
              >
                Change
              </button>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {device.dailySummary.enabled
              ? `On: Scheduled every day at ${formatTime12h(device.dailySummary.sendAt24h)}.`
              : 'Off: Turn ON to get the summary every day.'}
          </p>

          {/* Send test now Action */}
          <div className="pt-1">
            <button
              type="button"
              onClick={onSendDailySummaryTest}
              className="min-h-[44px] -ml-2 px-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-[#34D399] hover:opacity-85 active:scale-[0.99] transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Send test now</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4. INVERTER SETTINGS CARD (All 19 Parameters from Screenshot) */}
      <section className="rounded-2xl bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Inverter Settings
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">
          Adjust your inverter settings
        </p>

        <div className="space-y-5">
          {/* 1. Output Capacity */}
          <div className="flex items-start gap-3.5">
            <Zap className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Output Capacity
              </p>
              <p className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                {device.ratedWatts}W
              </p>
            </div>
          </div>

          {/* 2. Inverter Software */}
          <div className="flex items-start gap-3.5">
            <HardDrive className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Inverter Software
              </p>
              <p className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                {inv.inverterSoftware}
              </p>
            </div>
          </div>

          {/* 3. Inverter Company */}
          <StackedSelectField
            icon={<Building2 className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Inverter Company"
            value={inv.inverterCompany}
            options={INVERTER_COMPANIES.map((c) => ({ value: c, label: c }))}
            onChange={(val) => handleInverterField('inverterCompany', val, 'Inverter Company')}
          />

          {/* 4. Inverter Model (with inline Save button) */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
              <label
                htmlFor="inverter-model-input"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                Inverter Model
              </label>
            </div>
            <div className="relative flex items-center">
              <input
                id="inverter-model-input"
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveModel();
                  }
                }}
                className="w-full min-h-[48px] pl-3.5 pr-16 rounded-lg bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleSaveModel}
                className="absolute right-2 min-h-[38px] px-2.5 text-xs font-semibold text-emerald-600 dark:text-[#34D399] hover:underline cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>

          {/* 5. Frequency */}
          <div className="flex items-start gap-3.5">
            <Globe className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Frequency
              </p>
              <p className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                {liveFreq}
              </p>
            </div>
          </div>

          {/* 6. Inverter Type */}
          <div className="flex items-start gap-3.5">
            <Smartphone className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Inverter Type
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">
                {inv.inverterType}
              </p>
            </div>
          </div>

          {/* 7. Mode */}
          <StackedSelectField
            icon={<Shuffle className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Mode"
            value={inv.mode}
            options={[
              { value: 'SUB', label: 'Solar Grid Battery SUB' },
              { value: 'SBU', label: 'Solar Battery Grid SBU' },
              { value: 'SOL', label: 'Solar First SOL' },
              { value: 'USB', label: 'Utility First USB' },
            ]}
            onChange={(val) =>
              handleInverterField('mode', val as InverterSettingsConfig['mode'], 'Inverter Mode')
            }
          />

          {/* 8. Input Range */}
          <StackedSelectField
            icon={
              <SlidersHorizontal className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
            }
            label="Input Range"
            value={inv.inputRange}
            options={[
              { value: 'Appliances', label: 'Appliances' },
              { value: 'UPS', label: 'UPS' },
            ]}
            onChange={(val) =>
              handleInverterField(
                'inputRange',
                val as InverterSettingsConfig['inputRange'],
                'Input Range'
              )
            }
          />

          {/* 9. Output Voltage */}
          <StackedSelectField
            icon={<Zap className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Output Voltage"
            value={inv.outputVoltage}
            options={[
              { value: '220', label: '220' },
              { value: '230', label: '230' },
              { value: '240', label: '240' },
            ]}
            onChange={(val) =>
              handleInverterField(
                'outputVoltage',
                val as InverterSettingsConfig['outputVoltage'],
                'Output Voltage'
              )
            }
          />

          {/* 10. Net Metering Toggle */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <Plug className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Net Metering
              </span>
            </div>
            <ToggleSwitch
              checked={inv.netMetering}
              onChange={(checked) => handleInverterField('netMetering', checked, 'Net Metering')}
              ariaLabel="Toggle Net Metering"
            />
          </div>

          {/* 11. Electricity Rate (Inline Rs + Save) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Banknote className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
              <label
                htmlFor="electricity-rate-input"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                Electricity Rate
              </label>
            </div>
            <div className="relative w-44 sm:w-48 flex items-center">
              <span className="absolute left-3 text-xs font-medium text-slate-400 pointer-events-none">
                Rs
              </span>
              <input
                id="electricity-rate-input"
                type="number"
                min={0}
                step="0.5"
                placeholder="..."
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveRate();
                  }
                }}
                className="w-full min-h-[48px] pl-9 pr-14 rounded-lg bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-600 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleSaveRate}
                className="absolute right-2 min-h-[38px] px-2 text-xs font-semibold text-emerald-600 dark:text-[#34D399] hover:underline cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>

          {/* 12. Alarm */}
          <StackedEnableSelect
            icon={
              inv.alarm === 'Enable' ? (
                <Volume2 className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />
              )
            }
            label="Alarm"
            value={inv.alarm}
            onChange={(val) => handleInverterField('alarm', val, 'Alarm')}
          />

          {/* 13. Overload Bypass */}
          <StackedEnableSelect
            icon={<Gauge className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Overload Bypass"
            value={inv.overloadBypass}
            onChange={(val) => handleInverterField('overloadBypass', val, 'Overload Bypass')}
          />

          {/* 14. LCD Display Go To Default */}
          <StackedEnableSelect
            icon={<Smartphone className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="LCD Display Go To Default"
            value={inv.lcdAutoReturnDefault}
            onChange={(val) =>
              handleInverterField('lcdAutoReturnDefault', val, 'LCD Display Go To Default')
            }
          />

          {/* 15. Overload Restart */}
          <StackedEnableSelect
            icon={<RotateCcw className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Overload Restart"
            value={inv.overloadRestart}
            onChange={(val) => handleInverterField('overloadRestart', val, 'Overload Restart')}
          />

          {/* 16. Over Temperature Restart */}
          <StackedEnableSelect
            icon={<Thermometer className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Over Temperature Restart"
            value={inv.overTempRestart}
            onChange={(val) =>
              handleInverterField('overTempRestart', val, 'Over Temperature Restart')
            }
          />

          {/* 17. Backlight On */}
          <StackedEnableSelect
            icon={<Contrast className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Backlight On"
            value={inv.backlightOn}
            onChange={(val) => handleInverterField('backlightOn', val, 'Backlight On')}
          />

          {/* 18. Alarm On Source Interrupt */}
          <StackedEnableSelect
            icon={<Volume2 className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Alarm On Source Interrupt"
            value={inv.alarmOnSourceInterrupt}
            onChange={(val) =>
              handleInverterField('alarmOnSourceInterrupt', val, 'Alarm On Source Interrupt')
            }
          />

          {/* 19. Fault Code Record */}
          <StackedEnableSelect
            icon={<AlertCircle className="w-5 h-5 text-slate-700 dark:text-white shrink-0" />}
            label="Fault Code Record"
            value={inv.faultCodeRecord}
            onChange={(val) => handleInverterField('faultCodeRecord', val, 'Fault Code Record')}
          />
        </div>
      </section>

      {/* 5. SOLAR PANELS CARD */}
      <form
        onSubmit={handleSavePanelsForm}
        className="rounded-2xl bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 shadow-xs"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Solar Panels
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">
          Details of your installed solar panels
        </p>

        <div className="space-y-4">
          {/* Panels Company */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Factory className="w-5 h-5 text-slate-600 dark:text-white shrink-0" />
              <label
                htmlFor="panels-company"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                Panels Company
              </label>
            </div>
            <select
              id="panels-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-40 sm:w-44 min-h-[48px] px-3.5 rounded-lg bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {PANEL_COMPANIES.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>

          {/* Panel Watts */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Grid className="w-5 h-5 text-slate-600 dark:text-white shrink-0" />
              <label
                htmlFor="panel-watts"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                Panel Watts
              </label>
            </div>
            <div className="relative w-40 sm:w-44">
              <input
                id="panel-watts"
                type="number"
                min={0}
                max={1500}
                value={panelWatts}
                onChange={(e) => handleWattsChange(e.target.value)}
                className="w-full min-h-[48px] pl-3.5 pr-9 rounded-lg bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-600 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">
                W
              </span>
            </div>
          </div>

          {/* No of Panels Installed */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Layers className="w-5 h-5 text-slate-600 dark:text-white shrink-0" />
              <label
                htmlFor="panel-count"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                No of Panels Installed
              </label>
            </div>
            <input
              id="panel-count"
              type="number"
              min={0}
              max={500}
              value={panelCount}
              onChange={(e) => handleCountChange(e.target.value)}
              className="w-40 sm:w-44 min-h-[48px] px-3.5 rounded-lg bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-600 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* PV Installed */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Zap className="w-5 h-5 text-slate-600 dark:text-white shrink-0" />
              <label
                htmlFor="pv-installed"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                PV Installed
              </label>
            </div>
            <div className="relative w-40 sm:w-44">
              <input
                id="pv-installed"
                type="number"
                min={0}
                value={pvInstalled}
                onChange={(e) => setPvInstalled(e.target.value)}
                className="w-full min-h-[48px] pl-3.5 pr-9 rounded-lg bg-slate-100 dark:bg-[#151A21] border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">
                W
              </span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="mt-6 w-full min-h-[48px] px-5 py-3 rounded-full bg-slate-900 dark:bg-[#1B222A] hover:bg-slate-800 dark:hover:bg-[#232C37] border border-transparent dark:border-slate-700/80 text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Save Panel Details</span>
        </button>
      </form>

      {/* 6. CLOUD API CARD */}
      <section className="rounded-2xl bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Cloud API
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">
          Get your solar data into HomeAssistant or any platform
        </p>

        <div className="space-y-5">
          {/* POST API URL */}
          <div className="flex items-start gap-3.5">
            <Link2 className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-1" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                POST API URL
              </p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-sm font-mono text-slate-900 dark:text-slate-100 truncate">
                  {CLOUD_API_URL}
                </p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(CLOUD_API_URL, 'url')}
                  aria-label="Copy POST API URL"
                  className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  {copiedKey === 'url' ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Parameter */}
          <div className="flex items-start gap-3.5">
            <Database className="w-5 h-5 text-slate-700 dark:text-white shrink-0 mt-1" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Parameter
              </p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-sm font-mono text-slate-900 dark:text-slate-100 truncate">
                  deviceId=&quot;{device.id}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`deviceId="${device.id}"`, 'param')}
                  aria-label="Copy deviceId parameter"
                  className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  {copiedKey === 'param' ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Home Assistant YAML & Raw JSON Inspector */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowDeveloperDrawer((v) => !v)}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#182029] hover:bg-slate-200/80 dark:hover:bg-[#1F2935] text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-500" />
              <span>Home Assistant YAML & Live JSON Inspector</span>
            </span>
            <span>{showDeveloperDrawer ? 'Hide' : 'Show'}</span>
          </button>

          {showDeveloperDrawer && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Latest Raw JSON Response
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(JSON.stringify(rawPayload ?? {}, null, 2), 'json')
                    }
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {copiedKey === 'json' ? 'Copied JSON' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-48">
                  {rawPayload
                    ? JSON.stringify(rawPayload, null, 2)
                    : 'Waiting for API response...'}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Home Assistant configuration.yaml
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generateHomeAssistantYaml(device.id), 'yaml')}
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {copiedKey === 'yaml' ? 'Copied YAML' : 'Copy YAML'}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-52">
                  {generateHomeAssistantYaml(device.id)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 7. GITHUB PAGES & STATIC HOSTING CONFIGURATION CARD */}
      <section className="rounded-2xl bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                GitHub Pages & Static Hosting
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                White Page Fixed
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Configuration, relative asset base (<code className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">base: &apos;./&apos;</code>), and backend sync
            </p>
          </div>
          <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
        </div>

        <div className="mt-5 space-y-4">
          {/* Explanation of Why the White Screen Happened & How It Was Resolved */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#182029] border border-slate-200 dark:border-slate-700/70 text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
            <p className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Why GitHub Pages was previously showing a white page:</span>
            </p>
            <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-slate-600 dark:text-slate-400">
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Absolute Asset Paths:</strong> Default Vite builds generate root-relative paths like <code className="font-mono text-emerald-600 dark:text-emerald-400">&lt;script src=&quot;/assets/...&quot;&gt;</code>. When hosted on GitHub Pages at <code className="font-mono">github.io/your-repo/</code>, the browser 404s trying to find files at domain root. We fixed this by setting <code className="font-mono text-emerald-600 dark:text-emerald-400">base: &apos;./&apos;</code> in <code className="font-mono">vite.config.ts</code> so all asset links are now safely relative.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Missing Error Boundary:</strong> Uncaught errors would unmount React. We added a global dark-mode Error Boundary in <code className="font-mono">main.tsx</code> that gracefully traps any issue.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Static Host API 404s:</strong> GitHub Pages cannot execute Node.js Express routes (<code className="font-mono">server.ts</code>). We built safe content-type parsing and offline fallback telemetry so the dashboard always renders immediately without crashing.
              </li>
            </ol>
          </div>

          {/* Custom Backend Proxy URL for Live Cloud Sync on GitHub Pages */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="custom-backend-url"
                className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"
              >
                <Server className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <span>Backend Proxy URL (Optional for GitHub Pages)</span>
              </label>
              {customApiUrl ? (
                <span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  Custom Proxy Active
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Default (Local / Fallback)
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              If deploying this UI statically on GitHub Pages and you want live cloud telemetry from InverterZone without CORS errors, enter your deployed <code className="font-mono">server.ts</code> URL (e.g. on Render, Fly.io, or Railway):
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="custom-backend-url"
                type="url"
                placeholder="https://my-inverter-proxy.onrender.com"
                value={customApiUrl}
                onChange={(e) => setCustomApiUrl(e.target.value)}
                className="flex-1 min-h-[44px] px-3.5 rounded-lg bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-600 text-xs sm:text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCustomBackend}
                  className="min-h-[44px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleTestBackend}
                  disabled={testingBackend}
                  className="min-h-[44px] px-3.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingBackend ? 'animate-spin' : ''}`} />
                  <span>{testingBackend ? 'Testing...' : 'Test'}</span>
                </button>
              </div>
            </div>

            {/* Test result status badge */}
            {backendTestResult.message && (
              <div
                className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                  backendTestResult.status === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}
              >
                {backendTestResult.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{backendTestResult.message}</span>
              </div>
            )}
          </div>

          {/* Quick GitHub Pages Deploy snippet */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                1-Step Build for GitHub Pages
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    'npm run build\n# Push the dist/ directory to your gh-pages branch or use GitHub Actions',
                    'deploy'
                  )
                }
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                {copiedKey === 'deploy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'deploy' ? 'Copied' : 'Copy Command'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto">
              npm run build
            </pre>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              The built files in <code className="font-mono text-slate-700 dark:text-slate-300">dist/</code> will have relative asset references (<code className="font-mono text-emerald-600 dark:text-emerald-400">./assets/index-*.js</code>) ready for GitHub Pages hosting!
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

/* Accessible Smooth Green Toggle Switch (Matches InverterZone Android Switch) */
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`relative min-h-[34px] w-[54px] rounded-full transition-colors duration-200 flex items-center px-1 shrink-0 cursor-pointer ${
      checked
        ? 'bg-[#22C55E]'
        : 'bg-slate-300 dark:bg-[#27303B] border border-slate-400/50 dark:border-slate-600'
    }`}
  >
    <span
      className={`w-6 h-6 rounded-full shadow-xs transition-transform duration-200 ${
        checked
          ? 'translate-x-[21px] bg-white'
          : 'translate-x-0 bg-white dark:bg-slate-400'
      }`}
    />
  </button>
);

/* Full-width Stacked Label + Dropdown Select Row (Matches Inverter Settings Screenshot) */
const StackedSelectField: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}> = ({ icon, label, value, options, onChange }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-3">
      {icon}
      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
    </div>
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-[48px] px-3.5 rounded-lg bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

const StackedEnableSelect: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: EnableDisable;
  onChange: (value: EnableDisable) => void;
}> = ({ icon, label, value, onChange }) => (
  <StackedSelectField
    icon={icon}
    label={label}
    value={value}
    options={[
      { value: 'Enable', label: 'Enable' },
      { value: 'Disable', label: 'Disable' },
    ]}
    onChange={(v) => onChange(v as EnableDisable)}
  />
);

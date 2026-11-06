import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Code2,
  Copy,
  Cpu,
  Gauge,
  Network,
  Radio,
  RefreshCw,
  Sliders,
  Sun,
  Terminal,
  Wifi,
  Zap,
} from 'lucide-react';
import { DeviceConfig, DongleExtendedDiagnostics } from '../types/inverter';
import { AiCloudSuitePanel } from './AiCloudSuitePanel';
import { getApiUrl } from '../utils/apiConfig';

interface TestTabPanelProps {
  device: DeviceConfig;
  onSyncHardwareSettingsToProfile?: (diag: DongleExtendedDiagnostics) => void;
}

interface LabWorkbenchConfig {
  eqEnabled: boolean;
  eqVoltage: string;
  eqTimeMin: string;
  eqIntervalDays: string;
  dualOutputEnabled: boolean;
  dualOutputCutOffV: string;
  gridFeedEnabled: boolean;
  maxAcChargeA: string;
  maxTotalChargeA: string;
}

const LAB_STORAGE_PREFIX = 'iz_dongle_lab_v1_';

function decodeIvMode(code: string): { label: string; description: string } {
  switch (code.trim().toUpperCase()) {
    case 'P':
      return { label: 'Power-On Mode (P)', description: 'DSP initializing internal bus' };
    case 'S':
      return { label: 'Standby Mode (S)', description: 'AC output off, monitoring inputs' };
    case 'L':
      return {
        label: 'Line Mode (L)',
        description: 'Utility grid synchronized with solar PV blending',
      };
    case 'B':
      return {
        label: 'Battery / Inverter Mode (B)',
        description: 'DC-to-AC inversion active from PV / Battery bus',
      };
    case 'F':
      return { label: 'Fault Mode (F)', description: 'Protection latch active; inspect fault code' };
    case 'H':
      return { label: 'Power Saving Mode (H)', description: 'Low-load sensing sleep active' };
    default:
      return { label: `Mode ${code}`, description: 'Active inverter operating state' };
  }
}

function rssiToQualityPct(dbm: number): number {
  if (dbm >= -50) return 100;
  if (dbm <= -95) return 8;
  return Math.round(((dbm + 95) / 45) * 92 + 8);
}

function buildPi30Frames(d: DongleExtendedDiagnostics): {
  qmod: string;
  qflag: string;
  qpigs: string;
  qpigs2: string;
  qpiri: string;
} {
  const f = d.flags;
  const enabledFlags: string[] = [];
  const disabledFlags: string[] = [];

  (f.inverterBuzzer ? enabledFlags : disabledFlags).push('a');
  (f.overloadBypass ? enabledFlags : disabledFlags).push('b');
  (f.powerSaving ? enabledFlags : disabledFlags).push('j');
  (f.defaultLcdPage ? enabledFlags : disabledFlags).push('k');
  (f.overloadRestart ? enabledFlags : disabledFlags).push('u');
  (f.temperatureRestart ? enabledFlags : disabledFlags).push('v');
  (f.lcdBacklight ? enabledFlags : disabledFlags).push('x');
  (f.alarmInterrupt ? enabledFlags : disabledFlags).push('y');
  (f.faultRecord ? enabledFlags : disabledFlags).push('z');

  const qmod = `(${d.ivModeCode}`;
  const qflag = `(E${enabledFlags.join('')}D${disabledFlags.join('')}`;

  const qpigs = [
    `(${d.gridV.toFixed(1)}`,
    d.gridHz.toFixed(1),
    d.acOutV.toFixed(1),
    d.acOutHz.toFixed(1),
    String(d.acOutVa).padStart(4, '0'),
    String(d.acOutW).padStart(4, '0'),
    String(d.acOutPercent).padStart(3, '0'),
    String(Math.round(d.busV)).padStart(3, '0'),
    d.battV.toFixed(2),
    String(Math.round(d.battChargeA)).padStart(3, '0'),
    String(d.battPercent).padStart(3, '0'),
    String(d.heatSinkDegC).padStart(4, '0'),
    d.pv1.amps.toFixed(1),
    d.pv1.volts.toFixed(1),
    '00.00',
    String(Math.round(d.battDischargeA)).padStart(5, '0'),
    `${f.gridPresent ? '1' : '0'}0010110`,
    '00',
    '00',
    String(d.pv1.watts).padStart(5, '0'),
    '010',
  ].join(' ');

  const qpigs2 = `(${d.pv2.amps.toFixed(1)} ${d.pv2.volts.toFixed(1)} ${String(
    d.pv2.watts
  ).padStart(5, '0')}`;

  const batCode = d.battType === 'AGM' ? '0' : d.battType === 'FLD' ? '1' : '2';
  const rangeCode = d.inputVoltType === 'UPS' ? '1' : '0';
  const outCode =
    d.outputSource === 'USB' ? '0' : d.outputSource === 'SOL' ? '1' : d.outputSource === 'SBU' ? '2' : '3';
  const chgCode =
    d.chargeSource === 'CSO' ? '1' : d.chargeSource === 'SNU' ? '2' : d.chargeSource === 'OSO' ? '3' : '0';

  const qpiri = [
    `(${d.acOutRatingV.toFixed(1)}`,
    (d.acOutRatingW / Math.max(1, d.acOutRatingV)).toFixed(1),
    d.acOutRatingV.toFixed(1),
    d.acOutRatingHz.toFixed(1),
    (d.acOutRatingW / Math.max(1, d.acOutRatingV)).toFixed(1),
    String(d.acOutRatingW),
    String(d.acOutRatingW),
    d.battRatingV.toFixed(1),
    d.backToGridV.toFixed(1),
    d.cutOffVolts.toFixed(1),
    d.battBulkV.toFixed(1),
    d.battFloatV.toFixed(1),
    batCode,
    String(d.battMaxAcChrgA).padStart(2, '0'),
    String(d.battMaxChrgA).padStart(3, '0'),
    rangeCode,
    outCode,
    chgCode,
  ].join(' ');

  return { qmod, qflag, qpigs, qpigs2, qpiri };
}

function buildExtendedHomeAssistantYaml(deviceId: string): string {
  return `# Extended InverterZone Dongle Sensors (PI30 / HV Bus / Dual MPPT / ESP RAM)
rest:
  - resource: "https://inverterzone.com/api/getRealtimeData"
    method: POST
    headers:
      Content-Type: "application/x-www-form-urlencoded"
    payload: "deviceId=${deviceId}"
    scan_interval: 30
    timeout: 10
    sensor:
      - name: "Inverter HV DC Bus Voltage"
        unique_id: "iz_${deviceId.toLowerCase()}_bus_v"
        value_template: "{{ value_json.dataDTO.busV | float(0) }}"
        unit_of_measurement: "V"
        device_class: voltage

      - name: "Solar MPPT 1 Power"
        unique_id: "iz_${deviceId.toLowerCase()}_pv1_w"
        value_template: "{{ value_json.dataDTO.solarW1 | int(0) }}"
        unit_of_measurement: "W"
        device_class: power

      - name: "Solar MPPT 2 Power"
        unique_id: "iz_${deviceId.toLowerCase()}_pv2_w"
        value_template: "{{ value_json.dataDTO.solarW2 | int(0) }}"
        unit_of_measurement: "W"
        device_class: power

      - name: "Dongle WiFi Signal RSSI"
        unique_id: "iz_${deviceId.toLowerCase()}_rssi"
        value_template: "{{ value_json.dataDTO.signal | int(-70) }}"
        unit_of_measurement: "dBm"
        device_class: signal_strength

      - name: "Dongle ESP Free Heap"
        unique_id: "iz_${deviceId.toLowerCase()}_free_heap"
        value_template: "{{ value_json.dataDTO.freeHeap | int(0) }}"
        unit_of_measurement: "B"

      - name: "Cloud Peak Solar Record"
        unique_id: "iz_${deviceId.toLowerCase()}_peak_solar"
        value_template: "{{ value_json.dataDTO.peakSolar | int(0) }}"
        unit_of_measurement: "W"
        device_class: power`;
}

export const TestTabPanel: React.FC<TestTabPanelProps> = ({
  device,
  onSyncHardwareSettingsToProfile,
}) => {
  const [diag, setDiag] = useState<DongleExtendedDiagnostics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [syncedProfileNotice, setSyncedProfileNotice] = useState<boolean>(false);

  /* Local Dongle AP / LAN Bridge State */
  const [dongleTargetMode, setDongleTargetMode] = useState<'lan' | 'ap' | 'custom'>('lan');
  const [customDongleIp, setCustomDongleIp] = useState<string>('192.168.1.4');
  const [localProbeState, setLocalProbeState] = useState<{
    status: 'idle' | 'probing' | 'connected' | 'unreachable';
    message: string;
    payload: Record<string, unknown> | null;
  }>({
    status: 'idle',
    message: '',
    payload: null,
  });

  /* Advanced Charger / Equalization / Dual-Output Lab Workbench */
  const [labConfig, setLabConfig] = useState<LabWorkbenchConfig>(() => {
    try {
      const raw = localStorage.getItem(`${LAB_STORAGE_PREFIX}${device.id}`);
      if (raw) return JSON.parse(raw) as LabWorkbenchConfig;
    } catch {}
    return {
      eqEnabled: false,
      eqVoltage: '14.6',
      eqTimeMin: '60',
      eqIntervalDays: '30',
      dualOutputEnabled: false,
      dualOutputCutOffV: '44.0',
      gridFeedEnabled: false,
      maxAcChargeA: '40',
      maxTotalChargeA: '80',
    };
  });
  const [labSavedNotice, setLabSavedNotice] = useState<boolean>(false);

  const fetchDiagnostics = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          deviceId: device.id,
          ...(force ? { force: 'true' } : {}),
        });
        const res = await fetch(getApiUrl(`/api/dongle-diagnostics?${params.toString()}`));
        const cType = res.headers.get('content-type') || '';
        if (!res.ok || !cType.includes('application/json')) {
          throw new Error(`API offline or static host (${res.status})`);
        }
        const json = (await res.json()) as {
          ok: boolean;
          diagnostics?: DongleExtendedDiagnostics;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.diagnostics) {
          throw new Error(json.error || 'Failed to read extended dongle diagnostics');
        }
        setDiag(json.diagnostics);
        if (json.diagnostics.localIp) {
          setCustomDongleIp(json.diagnostics.localIp);
        }
        setLabConfig((prev) => ({
          ...prev,
          eqEnabled: json.diagnostics!.eqStatus === 1 || prev.eqEnabled,
          eqTimeMin: String(json.diagnostics!.eqTimeMin || 60),
          eqIntervalDays: String(json.diagnostics!.eqIntervalDays || 30),
          dualOutputEnabled: json.diagnostics!.dualOutput === 1 || prev.dualOutputEnabled,
          gridFeedEnabled: json.diagnostics!.gridFeed === 1 || prev.gridFeedEnabled,
          maxAcChargeA: String(json.diagnostics!.battMaxAcChrgA || 40),
          maxTotalChargeA: String(json.diagnostics!.battMaxChrgA || 80),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to reach InverterZone Cloud');
      } finally {
        setLoading(false);
      }
    },
    [device.id]
  );

  useEffect(() => {
    void fetchDiagnostics(false);
  }, [fetchDiagnostics]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {}
  };

  const resolvedDongleIp =
    dongleTargetMode === 'ap'
      ? '192.168.4.1'
      : dongleTargetMode === 'lan'
        ? diag?.localIp || '192.168.1.4'
        : customDongleIp.trim() || '192.168.4.1';

  const probeLocalDongleHttp = async () => {
    const url = `http://${resolvedDongleIp}/data`;
    setLocalProbeState({ status: 'probing', message: `Probing ${url}...`, payload: null });

    const isHttpsPage =
      typeof window !== 'undefined' && window.location.protocol === 'https:';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as Record<string, unknown>;
      setLocalProbeState({
        status: 'connected',
        message: `Connected directly to dongle ${resolvedDongleIp}/data`,
        payload: json,
      });
    } catch {
      setLocalProbeState({
        status: 'unreachable',
        message: isHttpsPage
          ? `Browser blocked HTTPS → HTTP local request to ${url} (Mixed Content) or phone is not on the ${
              dongleTargetMode === 'ap' ? `Solar_${device.id} AP hotspot` : 'same home WiFi LAN'
            }. Copy the URL below in a local HTTP tab or terminal while on the same network.`
          : `Could not reach ${url}. Verify your device is connected to ${
              dongleTargetMode === 'ap'
                ? `hotspot Solar_${device.id} (192.168.4.1)`
                : `the same WiFi router (${resolvedDongleIp})`
            }.`,
        payload: null,
      });
    }
  };

  const handleSaveLabWorkbench = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(`${LAB_STORAGE_PREFIX}${device.id}`, JSON.stringify(labConfig));
    } catch {}
    setLabSavedNotice(true);
    setTimeout(() => setLabSavedNotice(false), 2000);
  };

  const pi30Frames = useMemo(() => (diag ? buildPi30Frames(diag) : null), [diag]);
  const extendedHaYaml = useMemo(() => buildExtendedHomeAssistantYaml(device.id), [device.id]);

  if (loading && !diag) {
    return (
      <div className="max-w-3xl mx-auto py-14 text-center">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Querying extended dongle firmware &amp; PI30 hardware registers...
        </p>
      </div>
    );
  }

  if (error && !diag) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl bg-red-500/10 border border-red-500/30 p-5 text-center space-y-3">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => fetchDiagnostics(true)}
          className="min-h-[44px] px-5 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
        >
          Retry Dongle Probe
        </button>
      </div>
    );
  }

  if (!diag) return null;

  const modeDecoded = decodeIvMode(diag.ivModeCode);
  const wifiQualityPct = rssiToQualityPct(diag.signalDbm);
  const freeHeapKb = (diag.freeHeapBytes / 1024).toFixed(1);
  const heapUsedRatio = Math.min(100, Math.max(8, Math.round(100 - (diag.freeHeapBytes / 48000) * 100)));

  const peakSnap = diag.peakMpptSnapshot;
  const snapTotalPv = peakSnap ? Math.max(1, peakSnap.pv1W + peakSnap.pv2W) : 1;
  const snapPv1Pct = peakSnap ? Math.round((peakSnap.pv1W / snapTotalPv) * 100) : 50;
  const snapPv2Pct = peakSnap ? 100 - snapPv1Pct : 50;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      {/* Top Diagnostic Header Bar */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-500 shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              Dongle Firmware &amp; Cloud Hardware Lab
            </h2>
          </div>
          <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
            {diag.brandName.toUpperCase()} · {diag.modelName} · Protocol {diag.protocol} · DSP{' '}
            {diag.inverterSoftware}
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchDiagnostics(true)}
          disabled={loading}
          className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-opacity cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Syncing...' : 'Sync Dongle & Cloud'}</span>
        </button>
      </section>

      {/* AI & Cloud Intelligence Suite (Cloud 30-Day Audit, AI Health Doctor, Weather Forecast, SmartTimer Rules & AI Engineer) */}
      <AiCloudSuitePanel device={device} diag={diag} />

      {/* 1. Dongle ESP MCU, LAN IP, True RSSI & Cloud Package Validity */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-sky-500" />
              <span>ESP Solar Dongle Telemetry &amp; Cloud Subscription</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Hidden MCU memory, LAN address, and cloud subscription fields reported by FW{' '}
              {diag.firmwareVersion} (HW v{diag.hardwareModel})
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
            {diag.packageValidity}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Dongle LAN IP</p>
            <div className="mt-1 flex items-center justify-between gap-1">
              <span className="text-sm sm:text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                {diag.localIp}
              </span>
              <button
                type="button"
                onClick={() => copyText('lan_ip', diag.localIp)}
                aria-label="Copy LAN IP"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {copiedKey === 'lan_ip' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Home WiFi DHCP</p>
          </div>

          <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">True WiFi RSSI</p>
            <p className="mt-1 text-sm sm:text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
              {diag.signalDbm} dBm
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${wifiQualityPct}%` }}
              />
            </div>
            <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
              Link quality {wifiQualityPct}%
            </p>
          </div>

          <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">ESP Free Heap</p>
            <p className="mt-1 text-sm sm:text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
              {freeHeapKb} KB
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${100 - heapUsedRatio}%` }}
              />
            </div>
            <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
              {diag.freeHeapBytes.toLocaleString()} B free
            </p>
          </div>

          <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Heap Frag &amp; JSON</p>
            <p className="mt-1 text-sm sm:text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
              {diag.heapFragPct}% · {diag.jsonMemBytes}B
            </p>
            <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-2">
              Clock {diag.realTime.split(' ')[1] || 'Synced'}
            </p>
          </div>
        </div>
      </section>

      {/* 2. Internal HV DC Bus, Power Triangle (W / VA / VAR) & Cloud Peak Records */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>HV DC Bus, Reactive Power &amp; Cloud Peak Records</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Internal inverter DC link capacitor voltage, AC phase sync, and cloud-stored peak demand
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="HV DC Link Bus"
            value={`${diag.busV.toFixed(1)} V`}
            sub="Internal DC capacitor"
            accent="text-amber-600 dark:text-amber-400"
          />
          <MetricTile
            label="Reactive Power"
            value={`${diag.reactiveVar} VAR`}
            sub={`${diag.acOutW}W / ${diag.acOutVa}VA`}
            accent="text-rose-600 dark:text-rose-400"
          />
          <MetricTile
            label="Cloud Peak Solar"
            value={`${diag.peakSolarW} W`}
            sub={`${Math.round((diag.peakSolarW / Math.max(1, diag.pvInstalledW)) * 100)}% of ${diag.pvInstalledW}W PV`}
            accent="text-emerald-600 dark:text-emerald-400"
          />
          <MetricTile
            label="Cloud Peak Load"
            value={`${diag.peakLoadW} W`}
            sub={`${Math.round((diag.peakLoadW / Math.max(1, diag.acOutRatingW)) * 100)}% of ${diag.acOutRatingW}W`}
            accent="text-sky-600 dark:text-sky-400"
          />
        </div>

        <div className="pt-2 divide-y divide-slate-100 dark:divide-slate-800/80 text-xs sm:text-sm">
          <DiagRow
            label="AC Input vs AC Output Sync"
            value={`In ${diag.gridV.toFixed(1)}V @ ${diag.gridHz.toFixed(1)}Hz → Out ${diag.acOutV.toFixed(1)}V @ ${diag.acOutHz.toFixed(1)}Hz`}
          />
          <DiagRow
            label="Inverter Operating Mode (QMOD)"
            value={`${modeDecoded.label} · ${modeDecoded.description}`}
          />
          <DiagRow
            label="Rated AC Output Specification"
            value={`${diag.acOutRatingW} W · ${diag.acOutRatingV} V · ${diag.acOutRatingHz.toFixed(1)} Hz`}
          />
        </div>
      </section>

      {/* 3. Multi-MPPT String Splitter (PV1 / PV2 / PV3) & Daytime String Balance */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sun className="w-4 h-4 text-emerald-500" />
              <span>Multi-MPPT String Analyzer (PV1 · PV2 · PV3)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Individual MPPT string telemetry from QPIGS / QPIGS2 registers ({diag.panelCount} ×{' '}
              {diag.panelWatts}W {diag.panelCompany})
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
            Live {diag.solarW} W
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MpptStringCard title="MPPT String 1 (PV1)" data={diag.pv1} color="emerald" />
          <MpptStringCard title="MPPT String 2 (PV2)" data={diag.pv2} color="sky" />
          <MpptStringCard title="MPPT String 3 (PV3)" data={diag.pv3} color="slate" />
        </div>

        {/* Cloud Peak Daytime Dual-MPPT Balance Snapshot (Super helpful at night!) */}
        {peakSnap && (
          <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Cloud Daytime String Balance Snapshot ({peakSnap.time})
              </span>
              <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                Total {peakSnap.solarW} W
              </span>
            </div>

            <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${snapPv1Pct}%` }}
                title={`PV1: ${peakSnap.pv1W}W`}
              />
              <div
                className="h-full bg-sky-500"
                style={{ width: `${snapPv2Pct}%` }}
                title={`PV2: ${peakSnap.pv2W}W`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
              <span>
                PV1: {peakSnap.pv1W}W ({peakSnap.pv1V.toFixed(1)}V · {peakSnap.pv1A.toFixed(1)}A ·{' '}
                {snapPv1Pct}%)
              </span>
              <span>
                PV2: {peakSnap.pv2W}W ({peakSnap.pv2V.toFixed(1)}V · {peakSnap.pv2A.toFixed(1)}A ·{' '}
                {snapPv2Pct}%)
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 4. Live PI30 Hardware EEPROM Flags (QFLAG) & Raw Serial Frame Inspector */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-violet-500" />
              <span>Live Hardware Registers (QFLAG) &amp; PI30 Serial Frames</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Actual EEPROM flags reported by the inverter DSP ({diag.settingsWritable ? 'Writable' : 'Read-Only'})
            </p>
          </div>

          {onSyncHardwareSettingsToProfile && (
            <button
              type="button"
              onClick={() => {
                onSyncHardwareSettingsToProfile(diag);
                setSyncedProfileNotice(true);
                setTimeout(() => setSyncedProfileNotice(false), 2000);
              }}
              className="min-h-[40px] px-3.5 rounded-xl bg-slate-100 dark:bg-[#222C38] hover:bg-slate-200 dark:hover:bg-[#2B3746] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {syncedProfileNotice ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Synced to Settings Tab</span>
                </>
              ) : (
                <span>Import Hardware State to Settings</span>
              )}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          <HardwareFlagItem label="Buzzer (Flag a)" active={diag.flags.inverterBuzzer} />
          <HardwareFlagItem label="Overload Bypass (Flag b)" active={diag.flags.overloadBypass} />
          <HardwareFlagItem label="Power Saving (Flag j)" active={diag.flags.powerSaving} />
          <HardwareFlagItem label="LCD Auto-Return (Flag k)" active={diag.flags.defaultLcdPage} />
          <HardwareFlagItem label="Overload Restart (Flag u)" active={diag.flags.overloadRestart} />
          <HardwareFlagItem
            label="Over-Temp Restart (Flag v)"
            active={diag.flags.temperatureRestart}
          />
          <HardwareFlagItem label="LCD Backlight (Flag x)" active={diag.flags.lcdBacklight} />
          <HardwareFlagItem label="Source Alarm (Flag y)" active={diag.flags.alarmInterrupt} />
          <HardwareFlagItem label="Fault Record (Flag z)" active={diag.flags.faultRecord} />
          <HardwareFlagItem label="Utility Grid Present" active={diag.flags.gridPresent} />
          <HardwareFlagItem label="Heavy Load Flag" active={diag.flags.heavyLoad} warnWhenActive />
          <HardwareFlagItem
            label={`Fault Code (${diag.flags.faultCode})`}
            active={diag.flags.faultCode !== 'NO' && diag.flags.faultCode !== '0'}
            warnWhenActive
          />
        </div>

        {/* Reconstructed PI30 RS232 Frames */}
        {pi30Frames && (
          <div className="rounded-xl bg-slate-950 text-slate-200 p-4 space-y-2 font-mono text-[11px] overflow-x-auto">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-800">
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Terminal className="w-3.5 h-3.5" />
                <span>PI30 RS232 Frame Monitor</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    'pi30',
                    `QMOD: ${pi30Frames.qmod}\nQFLAG: ${pi30Frames.qflag}\nQPIGS: ${pi30Frames.qpigs}\nQPIGS2: ${pi30Frames.qpigs2}\nQPIRI: ${pi30Frames.qpiri}`
                  )
                }
                className="text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'pi30' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Frames</span>
                  </>
                )}
              </button>
            </div>
            <div>
              <span className="text-slate-500">QMOD  → </span>
              <span className="text-amber-300">{pi30Frames.qmod}</span>
            </div>
            <div>
              <span className="text-slate-500">QFLAG → </span>
              <span className="text-sky-300">{pi30Frames.qflag}</span>
            </div>
            <div className="whitespace-nowrap">
              <span className="text-slate-500">QPIGS → </span>
              <span className="text-emerald-300">{pi30Frames.qpigs}</span>
            </div>
            <div>
              <span className="text-slate-500">QPIGS2→ </span>
              <span className="text-emerald-300">{pi30Frames.qpigs2}</span>
            </div>
            <div className="whitespace-nowrap">
              <span className="text-slate-500">QPIRI → </span>
              <span className="text-violet-300">{pi30Frames.qpiri}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowRawJson((v) => !v)}
          className="min-h-[40px] text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Code2 className="w-4 h-4" />
          <span>
            {showRawJson
              ? 'Hide Raw Cloud JSON (dataDTO & getSettingsData)'
              : 'Inspect Full Raw Cloud JSON (70+ Dongle Fields)'}
          </span>
        </button>

        {showRawJson && (
          <pre className="p-3.5 rounded-xl bg-slate-950 text-emerald-300 text-[11px] font-mono overflow-x-auto max-h-72">
            {JSON.stringify(
              { dataDTO: diag.rawExtendedDto, cloudSettings: diag.rawCloudSettings },
              null,
              2
            )}
          </pre>
        )}
      </section>

      {/* 5. Charger Thresholds (QPIRI), Battery Equalization (QBEQI), Dual Output & Grid-Feed Lab */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-500" />
            <span>Charger Stages (QPIRI), Equalization (QBEQI) &amp; Smart Load Lab</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hardware battery charger parameters, battery equalization schedule, L2 dual output, and grid-feed export
          </p>
        </div>

        {/* Read-only Hardware EEPROM Charger Values */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <CompactKv label="Battery Chemistry" value={diag.battType} />
          <CompactKv label="Bulk Charge (C.V.)" value={`${diag.battBulkV.toFixed(1)} V`} />
          <CompactKv label="Float Charge" value={`${diag.battFloatV.toFixed(1)} V`} />
          <CompactKv label="Low DC Cut-Off" value={`${diag.cutOffVolts.toFixed(1)} V`} />
          <CompactKv label="Max Total Charge" value={`${diag.battMaxChrgA} A`} />
          <CompactKv label="Max AC Grid Charge" value={`${diag.battMaxAcChrgA} A`} />
          <CompactKv label="Back-to-Grid V" value={`${diag.backToGridV.toFixed(1)} V`} />
          <CompactKv label="Charge Priority" value={`HW ${diag.chargeSource} / Cloud ${diag.cloudChargeMode}`} />
        </div>

        {/* Interactive Equalization, Dual Output & Grid-Feed Workbench */}
        <form onSubmit={handleSaveLabWorkbench} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3.5 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5 flex items-center justify-between gap-2 cursor-pointer">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Battery Equalization</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">QBEQI desulfation</p>
              </div>
              <input
                type="checkbox"
                checked={labConfig.eqEnabled}
                onChange={(e) => setLabConfig((p) => ({ ...p, eqEnabled: e.target.checked }))}
                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
              />
            </label>

            <label className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5 flex items-center justify-between gap-2 cursor-pointer">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Dual AC Output (L2)</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  HW: {diag.dualOutput === 1 ? 'Supported' : 'Single Main Out'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={labConfig.dualOutputEnabled}
                onChange={(e) =>
                  setLabConfig((p) => ({ ...p, dualOutputEnabled: e.target.checked }))
                }
                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
              />
            </label>

            <label className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5 flex items-center justify-between gap-2 cursor-pointer">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Solar Grid-Feed</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Capable: {diag.gridFeedCapable === 1 ? 'Yes' : 'Disabled (0)'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={labConfig.gridFeedEnabled}
                onChange={(e) =>
                  setLabConfig((p) => ({ ...p, gridFeedEnabled: e.target.checked }))
                }
                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <LabInput
              label="Eq Voltage (V)"
              value={labConfig.eqVoltage}
              onChange={(v) => setLabConfig((p) => ({ ...p, eqVoltage: v }))}
            />
            <LabInput
              label="Eq Duration (min)"
              value={labConfig.eqTimeMin}
              onChange={(v) => setLabConfig((p) => ({ ...p, eqTimeMin: v }))}
            />
            <LabInput
              label="Eq Interval (days)"
              value={labConfig.eqIntervalDays}
              onChange={(v) => setLabConfig((p) => ({ ...p, eqIntervalDays: v }))}
            />
            <LabInput
              label="L2 Cut-Off (V)"
              value={labConfig.dualOutputCutOffV}
              onChange={(v) => setLabConfig((p) => ({ ...p, dualOutputCutOffV: v }))}
            />
          </div>

          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-[#232E3C] hover:opacity-90 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            {labSavedNotice ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Saved Advanced Charger &amp; Equalization Profile</span>
              </>
            ) : (
              <span>Save Charger &amp; Equalization Test Profile</span>
            )}
          </button>
        </form>
      </section>

      {/* 6. Direct Local Dongle AP / LAN Hotspot Bridge (192.168.1.4 & 192.168.4.1/data) */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-sky-500" />
            <span>Direct Local Dongle AP &amp; LAN HTTP Bridge (/data)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Dongle firmware {diag.firmwareVersion} serves raw <code className="font-mono">EspData</code>,{' '}
            <code className="font-mono">DeviceData</code>, and <code className="font-mono">LiveData</code>{' '}
            on port 80 at <code className="font-mono">/data</code>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setDongleTargetMode('lan')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              dongleTargetMode === 'lan'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-[#11161D] text-slate-700 dark:text-slate-300'
            }`}
          >
            LAN ({diag.localIp})
          </button>
          <button
            type="button"
            onClick={() => setDongleTargetMode('ap')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              dongleTargetMode === 'ap'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-[#11161D] text-slate-700 dark:text-slate-300'
            }`}
          >
            Hotspot (192.168.4.1)
          </button>
          <button
            type="button"
            onClick={() => setDongleTargetMode('custom')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              dongleTargetMode === 'custom'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-[#11161D] text-slate-700 dark:text-slate-300'
            }`}
          >
            Custom IP
          </button>
        </div>

        {dongleTargetMode === 'custom' && (
          <input
            type="text"
            value={customDongleIp}
            onChange={(e) => setCustomDongleIp(e.target.value)}
            placeholder="e.g. 192.168.1.4"
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-100 dark:bg-[#11161D] border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100/80 dark:bg-[#11161D] px-3.5 py-2.5">
          <code className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
            GET http://{resolvedDongleIp}:80/data
          </code>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyText('dongle_url', `http://${resolvedDongleIp}/data`)}
              className="min-h-[38px] px-3 rounded-lg bg-white dark:bg-[#1E2733] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedKey === 'dongle_url' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy URL</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={probeLocalDongleHttp}
              disabled={localProbeState.status === 'probing'}
              className="min-h-[38px] px-3.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>
                {localProbeState.status === 'probing' ? 'Probing...' : 'Test Local /data'}
              </span>
            </button>
          </div>
        </div>

        {localProbeState.status !== 'idle' && (
          <div
            className={`rounded-xl p-3.5 text-xs ${
              localProbeState.status === 'connected'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200'
            }`}
          >
            <p className="leading-relaxed">{localProbeState.message}</p>
            {localProbeState.payload && (
              <pre className="mt-2 p-2.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-52">
                {JSON.stringify(localProbeState.payload, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>

      {/* 7. Extended Home Assistant YAML & Cloud Panel Manufacturers Directory */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-500" />
              <span>Extended Home Assistant Sensors &amp; Cloud Panel Catalog</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Exposes HV DC Bus, Dual MPPT Strings, WiFi RSSI, Free Heap, and Peak Solar to Home Assistant
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyText('ha_ext', extendedHaYaml)}
            className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedKey === 'ha_ext' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>YAML Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Extended YAML</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-3.5 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-56">
          {extendedHaYaml}
        </pre>

        {diag.panelCompanies.length > 0 && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Cloud Supported Solar Panel Brands ({diag.panelCompanies.length} registered on InverterZone):
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {diag.panelCompanies.map((c) => c.label).join(' · ')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

const MetricTile: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent: string;
}> = ({ label, value, sub, accent }) => (
  <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    <p className={`mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums ${accent}`}>
      {value}
    </p>
    <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1 truncate">
      {sub}
    </p>
  </div>
);

const DiagRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="py-2.5 flex flex-wrap items-center justify-between gap-2">
    <span className="text-slate-600 dark:text-slate-400">{label}</span>
    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 text-right">
      {value}
    </span>
  </div>
);

const MpptStringCard: React.FC<{
  title: string;
  data: { watts: number; volts: number; amps: number };
  color: 'emerald' | 'sky' | 'slate';
}> = ({ title, data, color }) => {
  const accentText =
    color === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : color === 'sky'
        ? 'text-sky-600 dark:text-sky-400'
        : 'text-slate-700 dark:text-slate-300';

  return (
    <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{title}</p>
      <p className={`mt-1 text-lg font-semibold font-mono tabular-nums ${accentText}`}>
        {data.watts} W
      </p>
      <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
        {data.volts.toFixed(1)} V · {data.amps.toFixed(1)} A
      </p>
    </div>
  );
};

const HardwareFlagItem: React.FC<{
  label: string;
  active: boolean;
  warnWhenActive?: boolean;
}> = ({ label, active, warnWhenActive }) => {
  const dotColor = active
    ? warnWhenActive
      ? 'bg-red-500'
      : 'bg-emerald-500'
    : 'bg-slate-400 dark:bg-slate-600';
  const textColor = active
    ? warnWhenActive
      ? 'text-red-600 dark:text-red-400'
      : 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-500 dark:text-slate-400';

  return (
    <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] px-3 py-2.5 flex items-center justify-between gap-2">
      <span className="text-slate-700 dark:text-slate-200 truncate">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-mono tabular-nums font-semibold shrink-0 ${textColor}`}>
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span>{active ? 'ON' : 'OFF'}</span>
      </span>
    </div>
  );
};

const CompactKv: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3">
    <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-xs sm:text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-white truncate">
      {value}
    </p>
  </div>
);

const LabInput: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
}> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
    <input
      type="number"
      step="0.1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full min-h-[40px] px-3 rounded-lg bg-slate-100 dark:bg-[#11161D] border border-slate-300 dark:border-slate-700 font-mono tabular-nums text-slate-900 dark:text-white"
    />
  </label>
);

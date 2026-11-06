import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  History,
  Info,
  Palette,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  AlertThresholds,
  DailySummaryConfig,
  DetailTab,
  DeviceConfig,
  DongleExtendedDiagnostics,
  EvaluatedAlert,
  FaultLogEntry,
  InverterSettingsConfig,
  NotificationSettingsConfig,
  ParsedTelemetry,
  SolarPanelSettings,
  TelemetrySample,
} from '../types/inverter';
import {
  calculateGridCostRsPerHour,
  describeChargingMode,
  describeOutputMode,
  formatSecondsAgo,
} from '../utils/telemetry';
import { PowerFlowDiagram, SolarArrayHeaderBackdrop } from './DeviceIllustrations';
import { MpptStringAnalyzerCard } from './MpptStringAnalyzerCard';
import { SettingsTabPanel } from './SettingsTabPanel';
import { Stat2TabPanel } from './Stat2TabPanel';
import { TelemetryCharts } from './TelemetryCharts';
import { TestTabPanel } from './TestTabPanel';

interface DeviceDetailViewProps {
  device: DeviceConfig;
  telemetry: ParsedTelemetry | null;
  rawPayload: Record<string, unknown> | null;
  samples: TelemetrySample[];
  alerts: EvaluatedAlert[];
  faultLogs: FaultLogEntry[];
  thresholds: AlertThresholds;
  activeTab: DetailTab;
  isRefreshing: boolean;
  nowTimestamp: number;
  onChangeTab: (tab: DetailTab) => void;
  onBack: () => void;
  onRefresh: () => void;
  onOpenPalette: () => void;
  onSaveSolarPanels: (deviceId: string, panels: SolarPanelSettings) => void;
  onUpdateNotifications: (deviceId: string, next: NotificationSettingsConfig) => void;
  onUpdateDailySummary: (deviceId: string, next: DailySummaryConfig) => void;
  onSendDailySummaryTest: (deviceId: string) => void;
  onUpdateInverterSettings: (
    deviceId: string,
    next: InverterSettingsConfig,
    summaryLabel?: string
  ) => void;
  onClearFaultLogs: (deviceId: string) => void;
  onUpdateThresholds: (next: AlertThresholds) => void;
}

export const DeviceDetailView: React.FC<DeviceDetailViewProps> = ({
  device,
  telemetry,
  rawPayload,
  samples,
  alerts,
  faultLogs,
  thresholds,
  activeTab,
  isRefreshing,
  nowTimestamp,
  onChangeTab,
  onBack,
  onRefresh,
  onOpenPalette,
  onSaveSolarPanels,
  onUpdateNotifications,
  onUpdateDailySummary,
  onSendDailySummaryTest,
  onUpdateInverterSettings,
  onClearFaultLogs,
  onUpdateThresholds,
}) => {
  const battVoltStr = telemetry ? `${telemetry.batteryVoltage.toFixed(1)}V` : '0.0V';
  const syncAgeText = telemetry ? formatSecondsAgo(telemetry.fetchedAt, nowTimestamp) : 'syncing';
  const pvUtilization =
    telemetry && device.solarPanels.pvInstalled > 0
      ? Math.min(
          100,
          Number(((telemetry.solarWatts / device.solarPanels.pvInstalled) * 100).toFixed(1))
        )
      : 0;

  const rateRs = device.inverterSettings.electricityRateRs;
  const hourlyGridCostRs = telemetry
    ? calculateGridCostRsPerHour(telemetry.gridWatts, rateRs)
    : 0;
  const [statsViewMode, setStatsViewMode] = useState<'cloud' | 'telemetry'>('cloud');

  return (
    <div className="min-h-screen bg-[#F3F5F8] dark:bg-[#131920] pb-12">
      {/* Solar Array Atmospheric Header Banner */}
      <div className="relative overflow-hidden bg-slate-900 text-white border-b border-slate-800">
        <SolarArrayHeaderBackdrop />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/65 to-[#131920]/95 pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 pt-4">
          {/* Top Row: Back + Device Headline + Actions */}
          <div className="flex items-start justify-between gap-3 pb-5">
            <div className="flex items-start gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to dashboard"
                className="min-h-[44px] min-w-[44px] -ml-2 rounded-xl flex items-center justify-center text-white/90 hover:bg-white/10 active:scale-95 transition-all shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0 pt-1">
                <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white truncate font-mono tabular-nums">
                  {device.name} {battVoltStr} {device.ratedWatts}W
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 font-mono tabular-nums mt-0.5 truncate">
                  {telemetry
                    ? `${telemetry.time} (${syncAgeText})`
                    : 'Connecting to InverterZone...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onRefresh}
                aria-label="Refresh telemetry"
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-white/90 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={onOpenPalette}
                aria-label="Customize theme accent"
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-white/90 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <Palette className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 6-Tab Bar: Realtime | Stats | Stat2 | Alerts | Settings | Test */}
          <div
            className="flex items-center justify-between overflow-x-auto no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-6 text-center"
            role="tablist"
          >
            {(
              [
                { id: 'realtime', label: 'Realtime', count: 0 },
                { id: 'stats', label: 'Stats', count: 0 },
                { id: 'stat2', label: 'Stat2', count: 0 },
                { id: 'alerts', label: 'Alerts', count: alerts.length },
                { id: 'settings', label: 'Settings', count: 0 },
                { id: 'test', label: 'Test', count: 0 },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => onChangeTab(tab.id)}
                  className={`relative min-h-[46px] px-2 sm:px-1 py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1 cursor-pointer ${
                    isActive ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-[11px] font-bold rounded-full bg-red-500 text-white font-mono tabular-nums">
                      {tab.count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-1.5 right-1.5 sm:left-2 sm:right-2 h-[3px] rounded-t-full bg-[#EF4444]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content Viewport */}
      <main className="max-w-5xl mx-auto px-4 pt-5">
        {/* TAB 1: REALTIME */}
        {activeTab === 'realtime' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Live Power Routing
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {device.inverterSettings.inverterCompany} ·{' '}
                    {device.inverterSettings.inverterModel}
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {telemetry?.stale ? 'Cached' : 'Live'}
                </span>
              </div>

              {telemetry ? (
                <>
                  <PowerFlowDiagram
                    telemetry={telemetry}
                    pvInstalled={device.solarPanels.pvInstalled}
                  />

                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Output Mode ({telemetry.mode})</span>
                      <span className="font-medium text-slate-900 dark:text-slate-200">
                        {describeOutputMode(telemetry.mode)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Charger Priority ({telemetry.chargingMode})</span>
                      <span className="font-medium text-slate-900 dark:text-slate-200">
                        {describeChargingMode(telemetry.chargingMode)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Input Range · Nominal Out</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-200">
                        {device.inverterSettings.inputRange} ·{' '}
                        {device.inverterSettings.outputVoltage}V
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Installed PV ({device.solarPanels.company})</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-200">
                        {device.solarPanels.panelCount} × {device.solarPanels.panelWatts}W ={' '}
                        {device.solarPanels.pvInstalled}W
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-52 flex items-center justify-center text-sm text-slate-500">
                  Loading live inverter telemetry...
                </div>
              )}
            </section>

            <div className="lg:col-span-7 space-y-4">
              {/* Multi-MPPT String Analyzer (PV1 · PV2 · PV3) */}
              <MpptStringAnalyzerCard
                device={device}
                liveSolarWatts={telemetry?.solarWatts ?? 0}
                mpptSummary={telemetry?.mpptSummary ?? null}
              />

              <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">
                  AC Output &amp; Utility Grid
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  <MetricRow
                    label="Home Active Load"
                    value={telemetry ? `${telemetry.loadWatts} W` : '—'}
                    accent="text-rose-600 dark:text-rose-400"
                  />
                  <MetricRow
                    label="Home Apparent Power"
                    value={
                      telemetry
                        ? `${telemetry.loadVa} VA (PF ${telemetry.powerFactor.toFixed(2)})`
                        : '—'
                    }
                  />
                  <MetricRow
                    label="AC Output Voltage & Current"
                    value={
                      telemetry
                        ? `${telemetry.loadVoltage.toFixed(1)} V · ${telemetry.loadAmpere.toFixed(1)} A`
                        : '—'
                    }
                  />
                  <MetricRow
                    label="Inverter Load Capacity"
                    value={telemetry ? `${telemetry.loadPercentage}% of ${device.ratedWatts} W` : '—'}
                  />
                  <MetricRow
                    label={
                      device.inverterSettings.netMetering && (telemetry?.gridWatts ?? 0) < 0
                        ? 'Net Metering Grid Export'
                        : 'Utility Grid Import Power'
                    }
                    value={telemetry ? `${Math.abs(telemetry.gridWatts)} W` : '—'}
                    accent="text-amber-600 dark:text-amber-400"
                  />
                  {rateRs > 0 && telemetry && (
                    <MetricRow
                      label={`Estimated Grid Cost (@ Rs ${rateRs}/kWh)`}
                      value={`Rs ${hourlyGridCostRs}/hr · ~Rs ${Math.round(hourlyGridCostRs * 24)}/day`}
                      accent="text-amber-600 dark:text-amber-400"
                    />
                  )}
                  <MetricRow
                    label="Utility Grid Voltage & Current"
                    value={
                      telemetry
                        ? `${telemetry.gridVoltage.toFixed(1)} V · ${telemetry.gridAmpere.toFixed(1)} A`
                        : '—'
                    }
                  />
                  <MetricRow
                    label="Grid Frequency"
                    value={telemetry ? `${telemetry.gridHz.toFixed(1)} Hz` : '—'}
                  />
                </div>
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">
                  Solar PV, Battery Bus &amp; Dongle
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  <MetricRow
                    label="Solar PV Power"
                    value={
                      telemetry
                        ? `${telemetry.solarWatts} W (${pvUtilization}% of ${device.solarPanels.pvInstalled}W)`
                        : '—'
                    }
                    accent="text-emerald-600 dark:text-emerald-400"
                  />
                  <MetricRow
                    label="PV Array Voltage & Current"
                    value={
                      telemetry
                        ? `${telemetry.solarVoltage.toFixed(1)} V · ${telemetry.solarAmpere.toFixed(1)} A`
                        : '—'
                    }
                  />
                  <MetricRow
                    label="Battery Bus Voltage & SOC"
                    value={
                      telemetry
                        ? telemetry.batteryState === 'no-battery'
                          ? `${telemetry.batteryVoltage.toFixed(1)} V · No battery connected`
                          : `${telemetry.batteryVoltage.toFixed(1)} V · ${telemetry.batteryPercentage}%`
                        : '—'
                    }
                  />
                  <MetricRow
                    label="MPPT Heatsink Temp & Fan"
                    value={
                      telemetry
                        ? `${telemetry.mpptTemperature} °C · Fan ${telemetry.fanSpeed}%`
                        : '—'
                    }
                  />
                  <MetricRow
                    label="Dongle WiFi Signal & Firmware"
                    value={
                      telemetry
                        ? `${telemetry.wifiSignalDbm} dBm · FW ${device.firmware.replace(/^FW\s+/i, '')}`
                        : `FW ${device.firmware}`
                    }
                  />
                  <MetricRow
                    label="Inverter Software"
                    value={device.inverterSettings.inverterSoftware}
                  />
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: STATS (Official InverterZone Cloud Stats matching app screenshots + Session Telemetry option) */}
        {activeTab === 'stats' && (
          <div>
            <div className="max-w-xl mx-auto mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() =>
                  setStatsViewMode((prev: 'cloud' | 'telemetry') =>
                    prev === 'cloud' ? 'telemetry' : 'cloud'
                  )
                }
                className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded-xl bg-slate-800/60 border border-slate-700/60 cursor-pointer transition-colors"
              >
                {statsViewMode === 'cloud'
                  ? 'Switch to Live Session Charts'
                  : 'Switch to Official Cloud Stats'}
              </button>
            </div>
            {statsViewMode === 'cloud' ? (
              <Stat2TabPanel device={device} telemetry={telemetry} />
            ) : (
              <TelemetryCharts samples={samples} deviceName={device.name} />
            )}
          </div>
        )}

        {/* TAB 3: STAT2 (Dedicated InverterZone Cloud Energy & Analytics View) */}
        {activeTab === 'stat2' && <Stat2TabPanel device={device} telemetry={telemetry} />}

        {/* TAB 4: ALERTS & FAULT CODE RECORD */}
        {activeTab === 'alerts' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-7 space-y-5">
              <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  Active System Notices ({alerts.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Evaluated from live InverterZone readings and your Inverter Settings profile.
                </p>

                {alerts.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      All electrical &amp; thermal parameters nominal
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      No active warnings or threshold excursions detected.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
                        {alert.severity === 'info' ? (
                          <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle
                            className={`w-5 h-5 shrink-0 mt-0.5 ${
                              alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                            }`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {alert.title}
                            </p>
                            <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                              {alert.metric}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                            {alert.detail}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 mt-1">
                            Observed at {alert.timestamp}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Fault Code Record ({device.inverterSettings.faultCodeRecord})
                    </h3>
                  </div>
                  {faultLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onClearFaultLogs(device.id)}
                      className="text-xs text-slate-500 hover:text-red-500 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {faultLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {device.inverterSettings.faultCodeRecord === 'Enable'
                      ? 'Fault Code Record is enabled. Any warning or fault codes will be logged here automatically.'
                      : 'Fault Code Record is currently disabled in Inverter Settings.'}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {faultLogs.slice(0, 12).map((entry) => (
                      <div key={entry.id} className="py-2 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                            {entry.code}
                          </span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className="text-slate-800 dark:text-slate-200">{entry.title}</span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-500 shrink-0">
                          {entry.metric} · {entry.recordedAt}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Alert Thresholds
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Customize warning limits for this inverter.
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-300">Max MPPT Temp (°C)</span>
                  <input
                    type="number"
                    min={35}
                    max={95}
                    value={thresholds.maxMpptTemp}
                    onChange={(e) =>
                      onUpdateThresholds({
                        ...thresholds,
                        maxMpptTemp: Number(e.target.value) || 60,
                      })
                    }
                    className="w-24 min-h-[42px] px-3 rounded-lg bg-slate-100 dark:bg-[#11171D] border border-slate-300 dark:border-slate-700 text-right font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-300">Max AC Load (%)</span>
                  <input
                    type="number"
                    min={20}
                    max={100}
                    value={thresholds.maxLoadPercent}
                    onChange={(e) =>
                      onUpdateThresholds({
                        ...thresholds,
                        maxLoadPercent: Number(e.target.value) || 80,
                      })
                    }
                    className="w-24 min-h-[42px] px-3 rounded-lg bg-slate-100 dark:bg-[#11171D] border border-slate-300 dark:border-slate-700 text-right font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-300">Min Grid Voltage (V)</span>
                  <input
                    type="number"
                    min={90}
                    max={230}
                    value={thresholds.minGridVoltage}
                    onChange={(e) =>
                      onUpdateThresholds({
                        ...thresholds,
                        minGridVoltage: Number(e.target.value) || 195,
                      })
                    }
                    className="w-24 min-h-[42px] px-3 rounded-lg bg-slate-100 dark:bg-[#11171D] border border-slate-300 dark:border-slate-700 text-right font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-slate-700 dark:text-slate-300">Show 0.0V Battery Notice</span>
                  <input
                    type="checkbox"
                    checked={thresholds.notifyNoBattery}
                    onChange={(e) =>
                      onUpdateThresholds({
                        ...thresholds,
                        notifyNoBattery: e.target.checked,
                      })
                    }
                    className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: FULL SETTINGS TAB */}
        {activeTab === 'settings' && (
          <SettingsTabPanel
            device={device}
            telemetry={telemetry}
            rawPayload={rawPayload}
            onUpdateNotifications={(next) => onUpdateNotifications(device.id, next)}
            onUpdateDailySummary={(next) => onUpdateDailySummary(device.id, next)}
            onSendDailySummaryTest={() => onSendDailySummaryTest(device.id)}
            onUpdateInverterSettings={(next, label) =>
              onUpdateInverterSettings(device.id, next, label)
            }
            onSaveSolarPanels={(panels) => onSaveSolarPanels(device.id, panels)}
          />
        )}

        {/* TAB 6: TEST TAB (Extended Dongle FW 11.1, PI30 Hardware Registers, Multi-MPPT, HV Bus & Local AP Bridge) */}
        {activeTab === 'test' && (
          <TestTabPanel
            device={device}
            onSyncHardwareSettingsToProfile={(diag: DongleExtendedDiagnostics) => {
              const rawMode = diag.outputSource.trim().toUpperCase();
              const validMode =
                rawMode === 'SUB' || rawMode === 'SBU' || rawMode === 'SOL' || rawMode === 'USB'
                  ? rawMode
                  : device.inverterSettings.mode;

              const ratedVStr = String(Math.round(diag.acOutRatingV));
              const validOutV =
                ratedVStr === '220' || ratedVStr === '230' || ratedVStr === '240'
                  ? ratedVStr
                  : device.inverterSettings.outputVoltage;

              const syncedSettings: InverterSettingsConfig = {
                ...device.inverterSettings,
                inverterSoftware:
                  diag.inverterSoftware || device.inverterSettings.inverterSoftware,
                inverterModel: diag.modelName || device.inverterSettings.inverterModel,
                mode: validMode,
                inputRange: diag.inputVoltType.toLowerCase().includes('ups')
                  ? 'UPS'
                  : 'Appliances',
                outputVoltage: validOutV,
                netMetering:
                  diag.netMetering === '1' ||
                  diag.netMetering.toLowerCase() === 'enable' ||
                  diag.gridFeed === 1,
                electricityRateRs:
                  diag.electricityRateRs > 0
                    ? diag.electricityRateRs
                    : device.inverterSettings.electricityRateRs,
                alarm: diag.flags.inverterBuzzer ? 'Enable' : 'Disable',
                overloadBypass: diag.flags.overloadBypass ? 'Enable' : 'Disable',
                lcdAutoReturnDefault: diag.flags.defaultLcdPage ? 'Enable' : 'Disable',
                overloadRestart: diag.flags.overloadRestart ? 'Enable' : 'Disable',
                overTempRestart: diag.flags.temperatureRestart ? 'Enable' : 'Disable',
                backlightOn: diag.flags.lcdBacklight ? 'Enable' : 'Disable',
                alarmOnSourceInterrupt: diag.flags.alarmInterrupt ? 'Enable' : 'Disable',
                faultCodeRecord: diag.flags.faultRecord ? 'Enable' : 'Disable',
              };

              onUpdateInverterSettings(
                device.id,
                syncedSettings,
                'Imported live PI30 hardware state from Dongle'
              );

              if (diag.panelWatts > 0 && diag.panelCount > 0) {
                onSaveSolarPanels(device.id, {
                  company: diag.panelCompany
                    ? diag.panelCompany.toUpperCase()
                    : device.solarPanels.company,
                  panelWatts: diag.panelWatts,
                  panelCount: diag.panelCount,
                  pvInstalled: diag.panelWatts * diag.panelCount,
                });
              }
            }}
          />
        )}
      </main>
    </div>
  );
};

const MetricRow: React.FC<{
  label: string;
  value: string;
  accent?: string;
}> = ({ label, value, accent }) => (
  <div className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
    <span className="text-slate-600 dark:text-slate-400">{label}</span>
    <span
      className={`font-mono tabular-nums font-semibold text-right ${
        accent ?? 'text-slate-900 dark:text-slate-100'
      }`}
    >
      {value}
    </span>
  </div>
);

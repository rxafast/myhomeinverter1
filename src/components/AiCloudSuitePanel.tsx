import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CloudSun,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  AiHealthDiagnosticReport,
  AiSolarForecastReport,
  CloudAiLabBundle,
  CloudAiQaEntry,
  DeviceConfig,
  DongleExtendedDiagnostics,
  SmartConditionalRule,
  SmartRuleMetric,
} from '../types/inverter';
import { getApiUrl } from '../utils/apiConfig';

interface AiCloudSuitePanelProps {
  device: DeviceConfig;
  diag: DongleExtendedDiagnostics;
}

const METRIC_LABELS: Record<SmartRuleMetric, { label: string; unit: string }> = {
  solar1_voltage: { label: 'PV1 Voltage', unit: 'V' },
  solar1_watts: { label: 'PV1 Power', unit: 'W' },
  solar2_watts: { label: 'PV2 Power', unit: 'W' },
  total_solar_watts: { label: 'Total Solar PV', unit: 'W' },
  grid_voltage: { label: 'Utility Grid Voltage', unit: 'V' },
  load_watts: { label: 'Home Active Load', unit: 'W' },
  heatsink_temp: { label: 'MPPT Heatsink Temp', unit: '°C' },
  bus_voltage: { label: 'HV DC Link Bus', unit: 'V' },
};

function readLiveMetricValue(diag: DongleExtendedDiagnostics, metric: SmartRuleMetric): number {
  switch (metric) {
    case 'solar1_voltage':
      return diag.pv1.volts;
    case 'solar1_watts':
      return diag.pv1.watts;
    case 'solar2_watts':
      return diag.pv2.watts;
    case 'total_solar_watts':
      return diag.solarW;
    case 'grid_voltage':
      return diag.gridV;
    case 'load_watts':
      return diag.acOutW;
    case 'heatsink_temp':
      return diag.heatSinkDegC;
    case 'bus_voltage':
      return diag.busV;
    default:
      return 0;
  }
}

function evaluateRuleCondition(
  diag: DongleExtendedDiagnostics,
  rule: SmartConditionalRule
): { liveValue: number; matched: boolean } {
  const liveValue = readLiveMetricValue(diag, rule.metric);
  const matched =
    rule.operator === 'GT' ? liveValue > rule.threshold : liveValue < rule.threshold;
  return { liveValue, matched };
}

export const AiCloudSuitePanel: React.FC<AiCloudSuitePanelProps> = ({ device, diag }) => {
  const [bundle, setBundle] = useState<CloudAiLabBundle | null>(null);
  const [loadingBundle, setLoadingBundle] = useState<boolean>(true);

  /* AI Diagnostics State */
  const [runningDiag, setRunningDiag] = useState<boolean>(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  /* AI Solar Forecast State */
  const [locationInput, setLocationInput] = useState<string>('Lahore, Pakistan');
  const [runningForecast, setRunningForecast] = useState<boolean>(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  /* Smart Rules State */
  const [suggestingRules, setSuggestingRules] = useState<boolean>(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [showAddRule, setShowAddRule] = useState<boolean>(false);
  const [newRuleName, setNewRuleName] = useState<string>('');
  const [newRuleMetric, setNewRuleMetric] = useState<SmartRuleMetric>('solar1_watts');
  const [newRuleOp, setNewRuleOp] = useState<'GT' | 'LT'>('GT');
  const [newRuleThreshold, setNewRuleThreshold] = useState<string>('1500');
  const [newRuleTargetValue, setNewRuleTargetValue] = useState<string>('SUB');

  /* AI Solar Engineer Q&A State */
  const [questionInput, setQuestionInput] = useState<string>('');
  const [askingAi, setAskingAi] = useState<boolean>(false);
  const [askError, setAskError] = useState<string | null>(null);

  const loadCloudLabBundle = useCallback(async () => {
    setLoadingBundle(true);
    try {
      const res = await fetch(
        `/api/cloud-lab-state?deviceId=${encodeURIComponent(device.id)}`
      );
      const json = (await res.json()) as {
        ok: boolean;
        bundle?: CloudAiLabBundle;
      };
      if (res.ok && json.ok && json.bundle) {
        setBundle(json.bundle);
        if (json.bundle.locationCity) {
          setLocationInput(json.bundle.locationCity);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingBundle(false);
    }
  }, [device.id]);

  useEffect(() => {
    void loadCloudLabBundle();
  }, [loadCloudLabBundle]);

  const persistSmartRules = async (nextRules: SmartConditionalRule[], nextCity?: string) => {
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            smartRules: nextRules,
            locationCity: nextCity ?? prev.locationCity,
          }
        : prev
    );
    try {
      await fetch('/api/cloud-lab-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.id,
          smartRules: nextRules,
          locationCity: nextCity ?? locationInput,
        }),
      });
    } catch {}
  };

  const handleRunHealthDiagnostics = async () => {
    setRunningDiag(true);
    setDiagError(null);
    try {
      const res = await fetch('/api/ai/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        report?: AiHealthDiagnosticReport;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.report) {
        throw new Error(json.error || 'AI Diagnostics failed');
      }
      setBundle((prev) => (prev ? { ...prev, lastHealthReport: json.report! } : prev));
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : 'Unable to generate AI diagnostics');
    } finally {
      setRunningDiag(false);
    }
  };

  const handleRunSolarForecast = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCity = locationInput.trim() || 'Lahore, Pakistan';
    setRunningForecast(true);
    setForecastError(null);
    try {
      const res = await fetch('/api/ai/solar-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.id,
          location: cleanCity,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        forecast?: AiSolarForecastReport;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.forecast) {
        throw new Error(json.error || 'Solar forecast failed');
      }
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              locationCity: cleanCity,
              lastForecastReport: json.forecast!,
            }
          : prev
      );
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : 'Unable to generate solar forecast');
    } finally {
      setRunningForecast(false);
    }
  };

  const handleSuggestSmartRules = async () => {
    setSuggestingRules(true);
    setRulesError(null);
    try {
      const res = await fetch('/api/ai/suggest-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        rules?: SmartConditionalRule[];
        error?: string;
      };
      if (!res.ok || !json.ok || !Array.isArray(json.rules)) {
        throw new Error(json.error || 'Failed to generate AI smart rules');
      }
      await persistSmartRules(json.rules);
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : 'Unable to suggest smart rules');
    } finally {
      setSuggestingRules(false);
    }
  };

  const handleAddCustomRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundle) return;
    const thresholdNum = Number(newRuleThreshold);
    if (!Number.isFinite(thresholdNum)) return;
    const meta = METRIC_LABELS[newRuleMetric];
    const cleanName =
      newRuleName.trim() ||
      `IF ${meta.label} ${newRuleOp === 'GT' ? '>' : '<'} ${thresholdNum}${meta.unit}`;

    const created: SmartConditionalRule = {
      id: `rule_${Date.now()}`,
      name: cleanName,
      description: `Automatically switch ${
        newRuleTargetValue === 'CSO' || newRuleTargetValue === 'SNU' || newRuleTargetValue === 'OSO'
          ? 'Charger Priority'
          : 'Output Mode'
      } to ${newRuleTargetValue} when ${meta.label} is ${
        newRuleOp === 'GT' ? 'above' : 'below'
      } ${thresholdNum} ${meta.unit}.`,
      metric: newRuleMetric,
      operator: newRuleOp,
      threshold: thresholdNum,
      targetSetting:
        newRuleTargetValue === 'CSO' || newRuleTargetValue === 'SNU' || newRuleTargetValue === 'OSO'
          ? 'ChargerPriority'
          : 'Mode',
      targetValue: newRuleTargetValue,
      enabled: true,
    };

    const next = [created, ...bundle.smartRules];
    void persistSmartRules(next);
    setNewRuleName('');
    setShowAddRule(false);
  };

  const handleAskQuestion = async (promptText?: string) => {
    const cleanQ = (promptText ?? questionInput).trim();
    if (!cleanQ) return;
    setAskingAi(true);
    setAskError(null);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.id,
          question: cleanQ,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        entry?: CloudAiQaEntry;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.entry) {
        throw new Error(json.error || 'Failed to answer question');
      }
      setQuestionInput('');
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              qaHistory: [json.entry!, ...prev.qaHistory].slice(0, 8),
            }
          : prev
      );
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Unable to reach AI Solar Engineer');
    } finally {
      setAskingAi(false);
    }
  };

  const handleExportCloudAuditCsv = () => {
    if (!bundle) return;
    const a = bundle.audit30Day;
    const rows = [
      ['Device ID', device.id],
      ['Model', `${diag.brandName.toUpperCase()} ${diag.modelName}`],
      ['Cloud Days Analyzed', String(a.daysCount)],
      ['Total Solar Energy (kWh)', a.totalSolarKwh.toFixed(1)],
      ['Total Utility Grid Energy (kWh)', a.totalGridKwh.toFixed(1)],
      ['Total Load Consumed (kWh)', a.totalLoadKwh.toFixed(1)],
      ['Solar Self-Sufficiency (%)', `${a.solarSelfSufficiencyPct}%`],
      ['Average Daily Solar Yield (kWh)', a.avgDailySolarKwh.toFixed(2)],
      ['Tariff Rate (Rs/kWh)', String(a.rateRs)],
      ['Total Solar Savings (Rs)', String(a.totalSavingsRs)],
      [
        'Peak Solar Day',
        a.peakSolarDay ? `${a.peakSolarDay.date} (${a.peakSolarDay.solarKwh} kWh)` : 'N/A',
      ],
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inverterzone_cloud_audit_${device.id}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const audit = bundle?.audit30Day;
  const healthReport = bundle?.lastHealthReport ?? null;
  const forecastReport = bundle?.lastForecastReport ?? null;
  const smartRules = bundle?.smartRules ?? [];

  return (
    <div className="space-y-5">
      {/* A. 30-Day InverterZone Cloud Performance & Self-Sufficiency Audit */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Cloud Multi-Month Self-Sufficiency &amp; ROI Audit</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Aggregated directly from InverterZone Cloud historical daily records
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCloudAuditCsv}
            disabled={!audit}
            className="min-h-[40px] px-3.5 rounded-xl bg-slate-100 dark:bg-[#222C38] hover:bg-slate-200 dark:hover:bg-[#2B3746] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Cloud Audit CSV</span>
          </button>
        </div>

        {loadingBundle && !audit ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Loading saved InverterZone Cloud historical audit...
          </div>
        ) : audit ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <AuditTile
                label="Solar Self-Sufficiency"
                value={`${audit.solarSelfSufficiencyPct}%`}
                sub={`${audit.daysCount} cloud days`}
                accent="text-emerald-600 dark:text-emerald-400"
              />
              <AuditTile
                label="Cloud Solar Yield"
                value={`${audit.totalSolarKwh.toFixed(1)} kWh`}
                sub={`Avg ${audit.avgDailySolarKwh.toFixed(1)} kWh/day`}
                accent="text-emerald-600 dark:text-emerald-400"
              />
              <AuditTile
                label="Cloud Grid Import"
                value={`${audit.totalGridKwh.toFixed(1)} kWh`}
                sub={`Load ${audit.totalLoadKwh.toFixed(1)} kWh`}
                accent="text-amber-600 dark:text-amber-400"
              />
              <AuditTile
                label="Cloud Bill Savings"
                value={`Rs ${audit.totalSavingsRs.toLocaleString()}`}
                sub={`@ Rs ${audit.rateRs}/kWh`}
                accent="text-sky-600 dark:text-sky-400"
              />
            </div>

            {/* Solar vs Grid Proportion Bar */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <span>
                  Solar Share {audit.solarSelfSufficiencyPct}% vs Grid{' '}
                  {Math.max(0, 100 - audit.solarSelfSufficiencyPct)}%
                </span>
                {audit.peakSolarDay && (
                  <span>
                    Best Cloud Day: {audit.peakSolarDay.date} ({audit.peakSolarDay.solarKwh.toFixed(1)}{' '}
                    kWh)
                  </span>
                )}
              </div>
              <div className="h-2.5 w-full rounded-sm bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${audit.solarSelfSufficiencyPct}%` }}
                />
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.max(0, 100 - audit.solarSelfSufficiencyPct)}%` }}
                />
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* B. AI Inverter, Dual-MPPT & PI30 Health Doctor */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>AI Inverter &amp; Dual-MPPT Cloud Health Doctor</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Analyzes live PI30 registers, HV DC bus ({diag.busV.toFixed(1)}V), PV1/PV2 string symmetry, and 30-day cloud yield
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunHealthDiagnostics}
            disabled={runningDiag}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {runningDiag ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{runningDiag ? 'Analyzing Cloud Data...' : 'Run AI Cloud Diagnostics'}</span>
          </button>
        </div>

        {diagError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 text-xs text-red-700 dark:text-red-300">
            {diagError}
          </div>
        )}

        {healthReport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">System Health Score</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {healthReport.healthScore}/100
                </p>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                  {healthReport.overallStatus}
                </p>
              </div>

              <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5 sm:col-span-2 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Executive Summary
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {healthReport.summary}
                  </p>
                </div>
                <p className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-2">
                  Estimated Extra Optimization Potential: +Rs{' '}
                  {healthReport.estimatedMonthlySavingsPotentialRs.toLocaleString()}/month
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  MPPT String Symmetry (PV1 vs PV2)
                </p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {healthReport.mpptStringVerdict}
                </p>
              </div>

              <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5">
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  HV DC Bus &amp; Grid Power Quality
                </p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {healthReport.busAndGridVerdict}
                </p>
              </div>
            </div>

            {healthReport.recommendations.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {healthReport.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50/70 dark:bg-[#131A22] flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded-sm font-mono text-[10px] font-bold uppercase ${
                            rec.priority === 'High'
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : rec.priority === 'Medium'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                : 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
                          }`}
                        >
                          {rec.priority}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {rec.title}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {rec.action}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                      {rec.impact}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tap <strong>Run AI Cloud Diagnostics</strong> to audit your {diag.panelCount} ×{' '}
            {diag.panelWatts}W {diag.panelCompany} array, PV1/PV2 balance, HV DC bus, and PI30 settings.
          </p>
        )}
      </section>

      {/* C. AI Weather-Grounded Solar Yield & Load-Shifting Planner */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <CloudSun className="w-4 h-4 text-amber-500 shrink-0" />
            <span>AI Weather-Grounded Solar Forecast &amp; Load Shifter</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Uses live Google Search weather &amp; cloud-cover grounding + your {diag.pvInstalledW}W PV array to schedule heavy appliances
          </p>
        </div>

        <form onSubmit={handleRunSolarForecast} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            placeholder="Enter city (e.g. Lahore, Pakistan)"
            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-slate-100 dark:bg-[#11161D] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={runningForecast}
            className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-sky-600 hover:opacity-90 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {runningForecast ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CloudSun className="w-4 h-4" />
            )}
            <span>
              {runningForecast ? 'Checking Live Weather...' : 'Forecast Tomorrow & Load Plan'}
            </span>
          </button>
        </form>

        {forecastError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 text-xs text-red-700 dark:text-red-300">
            {forecastError}
          </div>
        )}

        {forecastReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <AuditTile
                label="Predicted Solar Yield"
                value={`${forecastReport.expectedSolarKwh.toFixed(1)} kWh`}
                sub={forecastReport.location}
                accent="text-emerald-600 dark:text-emerald-400"
              />
              <AuditTile
                label="Predicted Bill Offset"
                value={`Rs ${Math.round(forecastReport.expectedSavingsRs).toLocaleString()}`}
                sub={`@ Rs ${diag.electricityRateRs}/kWh`}
                accent="text-sky-600 dark:text-sky-400"
              />
              <div className="col-span-2 sm:col-span-1">
                <AuditTile
                  label="Peak Generation Window"
                  value={forecastReport.peakSunWindow}
                  sub="Best heavy-load slot"
                  accent="text-amber-600 dark:text-amber-400"
                />
              </div>
            </div>

            <div className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-3.5 text-xs space-y-1.5">
              <p className="font-semibold text-slate-900 dark:text-white">
                {forecastReport.forecastSummary}
              </p>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {forecastReport.weatherNotes}
              </p>
            </div>

            {forecastReport.applianceSchedule.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Recommended Appliance Shift Schedule (Zero-Battery SUB Mode):
                </p>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                  {forecastReport.applianceSchedule.map((slot, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50/70 dark:bg-[#131A22] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                          {slot.timeWindow}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {slot.appliance}
                        </span>
                      </div>
                      <span className="text-slate-600 dark:text-slate-400">{slot.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {forecastReport.sources.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Live Grounded Weather Sources:
                </p>
                <div className="flex flex-wrap gap-2">
                  {forecastReport.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#11161D] text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      <span className="truncate max-w-[200px]">{src.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* D. Cloud Smart Conditional Rules Engine (InverterZone SmartTimer IF-THEN) */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-500 shrink-0" />
              <span>Cloud Smart Conditional Rules (SmartTimer IF → THEN)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sensor-triggered mode switching evaluated live against your InverterZone Cloud stream
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddRule((v) => !v)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-[#222C38] hover:bg-slate-200 dark:hover:bg-[#2B3746] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Rule</span>
            </button>
            <button
              type="button"
              onClick={handleSuggestSmartRules}
              disabled={suggestingRules}
              className="min-h-[40px] px-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {suggestingRules ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{suggestingRules ? 'Generating...' : 'AI Suggest Rules'}</span>
            </button>
          </div>
        </div>

        {rulesError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-700 dark:text-red-300">
            {rulesError}
          </div>
        )}

        {showAddRule && (
          <form
            onSubmit={handleAddCustomRule}
            className="rounded-xl bg-slate-100/90 dark:bg-[#11161D] p-4 space-y-3 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input
                type="text"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="Rule label (optional)"
                className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#171E26] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <select
                value={newRuleMetric}
                onChange={(e) => setNewRuleMetric(e.target.value as SmartRuleMetric)}
                className="min-h-[40px] px-2.5 rounded-lg bg-white dark:bg-[#171E26] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                {Object.entries(METRIC_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    IF {v.label} ({v.unit})
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <select
                  value={newRuleOp}
                  onChange={(e) => setNewRuleOp(e.target.value as 'GT' | 'LT')}
                  className="min-h-[40px] px-2.5 rounded-lg bg-white dark:bg-[#171E26] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                >
                  <option value="GT">&gt;</option>
                  <option value="LT">&lt;</option>
                </select>
                <input
                  type="number"
                  step="0.1"
                  value={newRuleThreshold}
                  onChange={(e) => setNewRuleThreshold(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 rounded-lg bg-white dark:bg-[#171E26] border border-slate-300 dark:border-slate-700 font-mono tabular-nums text-slate-900 dark:text-white"
                />
              </div>
              <select
                value={newRuleTargetValue}
                onChange={(e) => setNewRuleTargetValue(e.target.value)}
                className="min-h-[40px] px-2.5 rounded-lg bg-white dark:bg-[#171E26] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="SUB">→ Mode = SUB (Solar+Grid)</option>
                <option value="SBU">→ Mode = SBU (Solar+Batt)</option>
                <option value="SOL">→ Mode = SOL (Solar First)</option>
                <option value="USB">→ Mode = USB (Utility First)</option>
                <option value="CSO">→ Charger = CSO (Solar First)</option>
                <option value="SNU">→ Charger = SNU (Solar+Grid)</option>
                <option value="OSO">→ Charger = OSO (Only Solar)</option>
              </select>
            </div>
            <button
              type="submit"
              className="min-h-[40px] px-4 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
            >
              Save Conditional Rule
            </button>
          </form>
        )}

        <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {smartRules.map((rule) => {
            const meta = METRIC_LABELS[rule.metric] ?? { label: rule.metric, unit: '' };
            const evalRes = evaluateRuleCondition(diag, rule);
            return (
              <div
                key={rule.id}
                className="p-3.5 bg-slate-50/60 dark:bg-[#131A22] flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold ${
                        !rule.enabled
                          ? 'text-slate-400'
                          : evalRes.matched
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          !rule.enabled
                            ? 'bg-slate-400'
                            : evalRes.matched
                              ? 'bg-emerald-500'
                              : 'bg-slate-500'
                        }`}
                      />
                      <span>
                        {!rule.enabled
                          ? 'PAUSED'
                          : evalRes.matched
                            ? 'CONDITION MET'
                            : 'MONITORING'}
                      </span>
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {rule.name}
                    </span>
                  </div>

                  <p className="font-mono tabular-nums text-[11px] text-sky-700 dark:text-sky-400">
                    IF {meta.label} {rule.operator === 'GT' ? '>' : '<'} {rule.threshold}{' '}
                    {meta.unit} → {rule.targetSetting} = {rule.targetValue} (Live:{' '}
                    {evalRes.liveValue} {meta.unit})
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {rule.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => {
                      const next = smartRules.map((r) =>
                        r.id === rule.id ? { ...r, enabled: e.target.checked } : r
                      );
                      void persistSmartRules(next);
                    }}
                    className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = smartRules.filter((r) => r.id !== rule.id);
                      void persistSmartRules(next);
                    }}
                    aria-label="Delete rule"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* E. AI Solar Engineer & Electricity Bill Co-Pilot */}
      <section className="rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>AI Solar Engineer &amp; Tariff Co-Pilot</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ask anything about your live PI30 registers, PV1/PV2 string voltage difference, battery sizing ROI, or WAPDA/LESCO bill
          </p>
        </div>

        {/* Quick Engineering Prompts */}
        <div className="flex flex-wrap gap-2">
          {[
            'Why is PV1 voltage higher than PV2 at peak sun?',
            'Calculate ROI if I add a 5kWh LiFePO4 battery',
            'Is 368V HV DC bus healthy in batteryless SUB mode?',
            'How can I cut evening grid import on this inverter?',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={askingAi}
              onClick={() => void handleAskQuestion(preset)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#11161D] hover:bg-slate-200 dark:hover:bg-[#1F2935] text-xs text-slate-700 dark:text-slate-300 text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              {preset}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAskQuestion();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Ask about your inverter, MPPT strings, fault codes, or paste bill units..."
            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-slate-100 dark:bg-[#11161D] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={askingAi || !questionInput.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {askingAi ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>{askingAi ? 'Thinking...' : 'Ask AI'}</span>
          </button>
        </form>

        {askError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-700 dark:text-red-300">
            {askError}
          </div>
        )}

        {bundle && bundle.qaHistory.length > 0 && (
          <div className="space-y-3 pt-1">
            {bundle.qaHistory.map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-slate-100/80 dark:bg-[#11161D] p-4 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Q: {item.question}
                  </p>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                    {new Date(item.askedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const AuditTile: React.FC<{
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

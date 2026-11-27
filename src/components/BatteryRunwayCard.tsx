import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BatteryCharging, Clock, RefreshCw, Save, Sun, Zap } from 'lucide-react';
import {
  BatteryRunwayData,
  fetchBatteryRunway,
  fetchEnergyInsights,
  sendInverterCommand,
} from '../utils/inverterzoneApi';
import { InverterZoneAccountSession } from '../utils/inverterzoneAuth';
import { ParsedTelemetry } from '../types/inverter';

interface BatteryRunwayCardProps {
  deviceId: string;
  telemetry: ParsedTelemetry | null;
  accountSession: InverterZoneAccountSession | null;
}

function minutesToTimeLabel(totalMin: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(totalMin)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const BatteryRunwayCard: React.FC<BatteryRunwayCardProps> = ({
  deviceId,
  telemetry,
  accountSession,
}) => {
  const [runway, setRunway] = useState<BatteryRunwayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simLoadW, setSimLoadW] = useState<number>(600);
  const [insightsSummary, setInsightsSummary] = useState<string | null>(null);

  // Battery config editor (uses /api/setBatteryInfo when signed in)
  const [editingBatt, setEditingBatt] = useState(false);
  const [whInput, setWhInput] = useState('5120');
  const [kindInput, setKindInput] = useState('LFP');
  const [savingBatt, setSavingBatt] = useState(false);
  const [battFeedback, setBattFeedback] = useState<string | null>(null);

  const loadRunway = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rw, ins] = await Promise.all([
        fetchBatteryRunway(deviceId),
        fetchEnergyInsights(deviceId, 'T').catch(() => null),
      ]);
      setRunway(rw);
      if (rw) {
        if (rw.capacityWh > 0) setWhInput(String(rw.capacityWh));
        if (rw.kind) setKindInput(rw.kind);
        const nonZero = rw.hourlyLoadW.filter((v) => v > 0);
        if (nonZero.length > 0) {
          const avg = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
          setSimLoadW(Math.max(150, avg));
        } else if (telemetry && telemetry.loadWatts > 100) {
          setSimLoadW(telemetry.loadWatts);
        }
      }
      if (ins && typeof ins === 'object') {
        const obj = ins as Record<string, unknown>;
        const txt =
          typeof obj.summary === 'string'
            ? obj.summary
            : typeof obj.msg === 'string'
              ? obj.msg
              : typeof obj.insight === 'string'
                ? obj.insight
                : null;
        if (txt) setInsightsSummary(txt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch battery runway');
    } finally {
      setLoading(false);
    }
  }, [deviceId, telemetry]);

  useEffect(() => {
    void loadRunway();
  }, [loadRunway]);

  const estimatedHours = useMemo(() => {
    if (!runway || runway.capacityWh <= 0 || simLoadW <= 0) return 0;
    const currentPct =
      telemetry && telemetry.batteryPercentage > 0 ? telemetry.batteryPercentage : 100;
    const usablePct = Math.max(0, currentPct - (runway.reservePct || 15));
    const usableWh = runway.capacityWh * (usablePct / 100);
    return Number((usableWh / simLoadW).toFixed(1));
  }, [runway, simLoadW, telemetry]);

  const maxHourlyW = useMemo(() => {
    if (!runway) return 1000;
    return Math.max(400, ...runway.hourlyLoadW);
  }, [runway]);

  const handleSaveBatteryInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountSession?.token) return;
    setSavingBatt(true);
    setBattFeedback(null);
    try {
      const whNum = Math.max(0, Math.round(Number(whInput) || 0));
      const res = await sendInverterCommand(accountSession.token, 'setBatteryInfo', {
        deviceId: deviceId.toUpperCase(),
        wh: whNum,
        kind: kindInput,
      });
      setBattFeedback(res.msg);
      if (res.accepted) {
        setEditingBatt(false);
        void loadRunway();
      }
    } catch (err) {
      setBattFeedback(err instanceof Error ? err.message : 'Failed to save battery specs');
    } finally {
      setSavingBatt(false);
    }
  };

  return (
    <section className="mb-4 rounded-3xl bg-[#111720] border border-slate-800/80 p-5 shadow-sm text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <BatteryCharging className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Battery Runway &amp; Outage Estimator</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Live cloud 24h load profile, solar window &amp; backup runtime calculation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accountSession && (
            <button
              type="button"
              onClick={() => setEditingBatt((v) => !v)}
              className="min-h-[38px] px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-xs font-medium text-slate-200 cursor-pointer"
            >
              {editingBatt ? 'Close Setup' : 'Configure Pack'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadRunway()}
            disabled={loading}
            aria-label="Refresh battery runway"
            className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 flex items-center justify-center text-slate-300 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {editingBatt && accountSession && (
        <form
          onSubmit={handleSaveBatteryInfo}
          className="mb-4 p-3.5 rounded-2xl bg-[#161F2B] border border-slate-700/80 space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="block">
              <span className="text-slate-400">Pack Capacity (Wh)</span>
              <input
                type="number"
                min={0}
                max={100000}
                step={100}
                value={whInput}
                onChange={(e) => setWhInput(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 rounded-lg bg-[#0D1218] border border-slate-700 font-mono text-white"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Chemistry Type</span>
              <select
                value={kindInput}
                onChange={(e) => setKindInput(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 rounded-lg bg-[#0D1218] border border-slate-700 text-white"
              >
                <option value="LFP">LiFePO4 (LFP)</option>
                <option value="AGM">AGM / Sealed</option>
                <option value="FLD">Flooded / Tubular</option>
                <option value="LION">Lithium-Ion</option>
                <option value="NONE">Batteryless (0 Wh)</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={savingBatt}
                className="w-full min-h-[40px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingBatt ? 'Saving...' : 'Sync Pack to Cloud'}</span>
              </button>
            </div>
          </div>
          {battFeedback && (
            <p className="text-xs text-emerald-400 font-medium">{battFeedback}</p>
          )}
        </form>
      )}

      {error ? (
        <p className="text-xs text-rose-400 py-3">{error}</p>
      ) : !runway ? (
        <p className="text-xs text-slate-400 py-4 text-center">
          {loading ? 'Loading cloud runway curve...' : 'No battery runway data returned for this MAC.'}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-2xl bg-[#18212C] p-3">
              <p className="text-slate-400">Pack / Bus</p>
              <p className="mt-1 font-mono tabular-nums font-semibold text-white">
                {runway.capacityWh > 0 ? `${(runway.capacityWh / 1000).toFixed(1)} kWh` : 'Batteryless'}
              </p>
              <p className="mt-0.5 text-[11px] font-mono text-slate-400">
                {runway.kind} · {runway.batteryV.toFixed(1)}V
              </p>
            </div>

            <div className="rounded-2xl bg-[#18212C] p-3">
              <p className="text-slate-400">Reserve / Back-Grid</p>
              <p className="mt-1 font-mono tabular-nums font-semibold text-white">
                {runway.reservePct}% · {runway.backToGridV.toFixed(1)}V
              </p>
              <p className="mt-0.5 text-[11px] font-mono text-slate-400">
                Mode {runway.outputSource} · {runway.source}
              </p>
            </div>

            <div className="rounded-2xl bg-[#18212C] p-3">
              <p className="text-slate-400 flex items-center gap-1">
                <Sun className="w-3 h-3 text-amber-400" />
                <span>Solar Window</span>
              </p>
              <p className="mt-1 font-mono tabular-nums font-semibold text-amber-300">
                {minutesToTimeLabel(runway.sunStartMin)} – {minutesToTimeLabel(runway.sunEndMin)}
              </p>
              <p className="mt-0.5 text-[11px] font-mono text-slate-400">
                {((runway.sunEndMin - runway.sunStartMin) / 60).toFixed(1)} hrs daylight
              </p>
            </div>

            <div className="rounded-2xl bg-[#18212C] p-3">
              <p className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Est. Backup</span>
              </p>
              <p className="mt-1 font-mono tabular-nums font-semibold text-emerald-400">
                {runway.capacityWh > 0 ? `${estimatedHours} hrs` : 'PV Direct Only'}
              </p>
              <p className="mt-0.5 text-[11px] font-mono text-slate-400">
                @ {simLoadW} W load
              </p>
            </div>
          </div>

          {/* 24-Hour Hourly Load Curve */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-medium">24-Hour Typical Load Profile (W)</span>
              <span className="font-mono tabular-nums text-slate-400">
                Peak {Math.max(...runway.hourlyLoadW)} W
              </span>
            </div>
            <div className="h-20 rounded-xl bg-[#0D1218] px-2.5 py-2 flex items-end gap-1">
              {runway.hourlyLoadW.map((watts, hr) => {
                const hPct = Math.max(6, Math.round((watts / maxHourlyW) * 100));
                const isSunHour =
                  hr * 60 >= runway.sunStartMin && hr * 60 <= runway.sunEndMin;
                return (
                  <div
                    key={hr}
                    title={`${String(hr).padStart(2, '0')}:00 · ${watts} W`}
                    className="flex-1 h-full flex items-end"
                  >
                    <div
                      className={`w-full rounded-t-xs transition-all ${
                        isSunHour ? 'bg-emerald-500/85' : 'bg-sky-500/75'
                      }`}
                      style={{ height: `${hPct}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1 px-1">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00 (Solar)</span>
              <span>18:00</span>
              <span>23:00</span>
            </div>
          </div>

          {/* Interactive Outage Load Simulator */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Outage Load Simulator:</span>
              <span className="font-mono tabular-nums font-semibold text-white">{simLoadW} W</span>
            </div>
            <input
              type="range"
              min={100}
              max={6000}
              step={50}
              value={simLoadW}
              onChange={(e) => setSimLoadW(Number(e.target.value))}
              aria-label="Simulate outage load watts"
              className="w-full sm:w-56 accent-emerald-500 cursor-pointer"
            />
          </div>

          {insightsSummary && (
            <p className="text-xs text-slate-300 leading-relaxed border-t border-slate-800/80 pt-3">
              {insightsSummary}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

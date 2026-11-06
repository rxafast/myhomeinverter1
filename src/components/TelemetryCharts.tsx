import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { TelemetrySample } from '../types/inverter';

interface TelemetryChartsProps {
  samples: TelemetrySample[];
  deviceName: string;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({ samples, deviceName }) => {
  const [metricGroup, setMetricGroup] = useState<'power' | 'voltage' | 'thermal'>('power');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const exportCsv = () => {
    if (samples.length === 0) return;
    const headers = [
      'Timestamp',
      'TimeLabel',
      'SolarWatts',
      'LoadWatts',
      'GridWatts',
      'BatteryWatts',
      'GridVoltage',
      'LoadVoltage',
      'GridHz',
      'MpptTempC',
      'FanSpeedPct',
    ];
    const rows = samples.map((s) =>
      [
        new Date(s.timestamp).toISOString(),
        `"${s.label}"`,
        s.solarWatts,
        s.loadWatts,
        s.gridWatts,
        s.batteryWatts,
        s.gridVoltage,
        s.loadVoltage,
        s.gridHz,
        s.mpptTemperature,
        s.fanSpeed,
      ].join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${deviceName.toLowerCase()}-telemetry-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (samples.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#1A222B] border border-slate-200 dark:border-slate-800 p-6 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Collecting live telemetry samples from your inverter. Charts populate automatically as data streams in.
        </p>
      </div>
    );
  }

  const displaySamples = samples.slice(-36);
  const activeSample =
    hoverIdx !== null && displaySamples[hoverIdx]
      ? displaySamples[hoverIdx]
      : displaySamples[displaySamples.length - 1];

  const width = 560;
  const height = 190;
  const padLeft = 42;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (idx: number) => {
    if (displaySamples.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (displaySamples.length - 1)) * plotW;
  };

  let minVal = 0;
  let maxVal = 1000;
  let unit = 'W';

  if (metricGroup === 'power') {
    const allWatts = displaySamples.flatMap((s) => [s.solarWatts, s.loadWatts, s.gridWatts]);
    maxVal = Math.max(500, Math.ceil((Math.max(...allWatts) * 1.15) / 100) * 100);
    minVal = 0;
    unit = 'W';
  } else if (metricGroup === 'voltage') {
    const allVolts = displaySamples.flatMap((s) => [s.gridVoltage, s.loadVoltage]);
    const rawMin = Math.min(...allVolts);
    const rawMax = Math.max(...allVolts);
    minVal = Math.max(0, Math.floor((rawMin - 8) / 5) * 5);
    maxVal = Math.ceil((rawMax + 8) / 5) * 5;
    if (maxVal - minVal < 20) maxVal = minVal + 20;
    unit = 'V';
  } else {
    const allThermal = displaySamples.flatMap((s) => [s.mpptTemperature, s.fanSpeed]);
    minVal = 0;
    maxVal = Math.max(80, Math.ceil((Math.max(...allThermal) + 10) / 10) * 10);
    unit = '';
  }

  const getY = (val: number) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    return padTop + plotH - ((clamped - minVal) / (maxVal - minVal || 1)) * plotH;
  };

  const buildPath = (selector: (s: TelemetrySample) => number) => {
    if (displaySamples.length === 1) {
      const y = getY(selector(displaySamples[0]));
      return `M ${padLeft} ${y} L ${padLeft + plotW} ${y}`;
    }
    return displaySamples
      .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(selector(s)).toFixed(1)}`)
      .join(' ');
  };

  const peakLoad = Math.max(...samples.map((s) => s.loadWatts));
  const avgLoad = Math.round(samples.reduce((acc, s) => acc + s.loadWatts, 0) / samples.length);
  const peakGrid = Math.max(...samples.map((s) => s.gridWatts));
  const peakSolar = Math.max(...samples.map((s) => s.solarWatts));

  return (
    <div className="space-y-4">
      {/* Segmented Metric Filter + CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/80 dark:bg-[#131920]">
          <button
            type="button"
            onClick={() => setMetricGroup('power')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              metricGroup === 'power'
                ? 'bg-white dark:bg-[#232E3A] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Power (W)
          </button>
          <button
            type="button"
            onClick={() => setMetricGroup('voltage')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              metricGroup === 'voltage'
                ? 'bg-white dark:bg-[#232E3A] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            AC Voltage (V)
          </button>
          <button
            type="button"
            onClick={() => setMetricGroup('thermal')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              metricGroup === 'thermal'
                ? 'bg-white dark:bg-[#232E3A] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Temp & Fan
          </button>
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-200/70 dark:bg-[#232E3A] hover:bg-slate-300/70 dark:hover:bg-[#2C3A48] text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV
        </button>
      </div>

      {/* Main Chart Surface */}
      <div className="rounded-2xl bg-white dark:bg-[#1A222B] border border-slate-200 dark:border-slate-800/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {metricGroup === 'power'
                ? 'Live Power Trend'
                : metricGroup === 'voltage'
                  ? 'Grid vs Output Voltage Stability'
                  : 'MPPT Heatsink Temperature & Fan Speed'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              Sample @ {activeSample.label} · {samples.length} live reading{samples.length === 1 ? '' : 's'}
            </p>
          </div>

          {/* Active Sample Legend Readout */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
            {metricGroup === 'power' && (
              <>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Solar {activeSample.solarWatts}W
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-rose-600 dark:text-rose-400">
                  Load {activeSample.loadWatts}W
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-amber-600 dark:text-amber-400">
                  Grid {activeSample.gridWatts}W
                </span>
              </>
            )}
            {metricGroup === 'voltage' && (
              <>
                <span className="text-amber-600 dark:text-amber-400">
                  Grid {activeSample.gridVoltage.toFixed(1)}V
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-sky-600 dark:text-sky-400">
                  Load {activeSample.loadVoltage.toFixed(1)}V
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {activeSample.gridHz.toFixed(1)}Hz
                </span>
              </>
            )}
            {metricGroup === 'thermal' && (
              <>
                <span className="text-orange-600 dark:text-orange-400">
                  MPPT {activeSample.mpptTemperature}°C
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  Fan {activeSample.fanSpeed}%
                </span>
              </>
            )}
          </div>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible touch-pan-y"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Horizontal Grid Lines */}
          {[0, 0.5, 1].map((ratio) => {
            const val = minVal + (maxVal - minVal) * ratio;
            const y = getY(val);
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                >
                  {Math.round(val)}
                  {unit}
                </text>
              </g>
            );
          })}

          {/* Series Lines */}
          {metricGroup === 'power' && (
            <>
              <path
                d={buildPath((s) => s.gridWatts)}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildPath((s) => s.loadWatts)}
                fill="none"
                stroke="#F87171"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildPath((s) => s.solarWatts)}
                fill="none"
                stroke="#22C55E"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {metricGroup === 'voltage' && (
            <>
              <path
                d={buildPath((s) => s.gridVoltage)}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildPath((s) => s.loadVoltage)}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {metricGroup === 'thermal' && (
            <>
              <path
                d={buildPath((s) => s.mpptTemperature)}
                fill="none"
                stroke="#FB923C"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildPath((s) => s.fanSpeed)}
                fill="none"
                stroke="#818CF8"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Hover Scrubbing Targets */}
          {displaySamples.map((s, idx) => {
            const x = getX(idx);
            const colW = plotW / Math.max(1, displaySamples.length);
            return (
              <g key={s.timestamp}>
                {hoverIdx === idx && (
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={height - padBottom}
                    stroke="currentColor"
                    className="text-slate-400 dark:text-slate-500"
                    strokeWidth="1"
                  />
                )}
                <rect
                  x={x - colW / 2}
                  y={padTop}
                  width={Math.max(12, colW)}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(idx)}
                  onClick={() => setHoverIdx(idx)}
                  className="cursor-pointer"
                />
              </g>
            );
          })}

          {/* X-axis Start & Latest Labels */}
          <text
            x={padLeft}
            y={height - 6}
            textAnchor="start"
            className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
          >
            {displaySamples[0]?.label}
          </text>
          <text
            x={width - padRight}
            y={height - 6}
            textAnchor="end"
            className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
          >
            {displaySamples[displaySamples.length - 1]?.label}
          </text>
        </svg>

        {/* Session Summary Strip */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Peak Load</p>
            <p className="text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
              {peakLoad} W
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Average Load</p>
            <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {avgLoad} W
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Peak Grid Import</p>
            <p className="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
              {peakGrid} W
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Peak Solar PV</p>
            <p className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              {peakSolar} W
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

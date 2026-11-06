import React from 'react';
import { ParsedTelemetry } from '../types/inverter';

export const SolarPanelIllustration: React.FC<{ active?: boolean }> = ({ active = false }) => (
  <svg viewBox="0 0 64 64" className="w-11 h-11 shrink-0" aria-hidden="true">
    {active && (
      <circle cx="50" cy="14" r="6" className="fill-amber-400" />
    )}
    {/* Stand */}
    <path d="M29 44 L35 44 L37 54 L27 54 Z" fill="#94A3B8" />
    <rect x="22" y="53" width="20" height="3" rx="1.5" fill="#CBD5E1" />
    {/* Isometric Solar Panel Frame */}
    <polygon
      points="10,36 26,16 54,24 38,45"
      fill={active ? '#0284C7' : '#334155'}
      stroke="#E2E8F0"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {/* Grid Lines */}
    <line x1="18" y1="26" x2="46" y2="34.5" stroke="#94A3B8" strokeWidth="1.2" />
    <line x1="22" y1="21" x2="50" y2="29.5" stroke="#94A3B8" strokeWidth="1.2" />
    <line x1="14" y1="31" x2="42" y2="39.5" stroke="#94A3B8" strokeWidth="1.2" />
    <line x1="20" y1="39" x2="35" y2="18.5" stroke="#94A3B8" strokeWidth="1.2" />
    <line x1="29" y1="42" x2="44.5" y2="21.5" stroke="#94A3B8" strokeWidth="1.2" />
  </svg>
);

export const HomeLoadIllustration: React.FC<{ active?: boolean }> = ({ active = true }) => (
  <svg viewBox="0 0 64 64" className="w-11 h-11 shrink-0" aria-hidden="true">
    {/* Left Wall */}
    <polygon points="12,30 32,40 32,55 12,45" fill="#E2E8F0" />
    {/* Right Wall */}
    <polygon points="32,40 52,30 52,45 32,55" fill="#CBD5E1" />
    {/* Left Roof Slope */}
    <polygon points="8,29 28,14 34,39" fill={active ? '#EF4444' : '#64748B'} />
    {/* Right Roof Slope */}
    <polygon points="28,14 56,28 32,40" fill={active ? '#DC2626' : '#475569'} />
    {/* Chimney */}
    <rect x="40" y="16" width="5" height="9" rx="1" fill="#94A3B8" />
    {/* Lit Windows */}
    <polygon
      points="17,36 24,39.5 24,45.5 17,42"
      fill={active ? '#FBBF24' : '#475569'}
    />
    <polygon
      points="38,40 46,36 46,42 38,46"
      fill={active ? '#F59E0B' : '#475569'}
    />
  </svg>
);

export const BatteryPackIllustration: React.FC<{
  state?: 'no-battery' | 'charging' | 'discharging' | 'idle';
}> = ({ state = 'no-battery' }) => {
  const topFill =
    state === 'charging'
      ? '#10B981'
      : state === 'discharging'
        ? '#3B82F6'
        : '#334155';
  return (
    <svg viewBox="0 0 64 64" className="w-11 h-11 shrink-0" aria-hidden="true">
      {/* Battery Body Left */}
      <polygon points="12,28 32,38 32,54 12,44" fill="#CBD5E1" />
      {/* Battery Body Right */}
      <polygon points="32,38 52,28 52,44 32,54" fill="#E2E8F0" />
      {/* Battery Top Lid */}
      <polygon points="12,28 32,18 52,28 32,38" fill={topFill} />
      {/* Terminals */}
      <ellipse cx="25" cy="27" rx="3.2" ry="2" fill="#EF4444" />
      <ellipse cx="38" cy="27" rx="3.2" ry="2" fill="#94A3B8" />
      {/* Status Accent */}
      <circle
        cx="42"
        cy="42"
        r="3.2"
        fill={state === 'no-battery' ? '#EF4444' : '#10B981'}
      />
    </svg>
  );
};

export const GridTowersIllustration: React.FC<{ active?: boolean }> = ({ active = true }) => (
  <svg viewBox="0 0 64 64" className="w-11 h-11 shrink-0" aria-hidden="true">
    {/* Base Ground Platform */}
    <polygon
      points="8,48 44,30 56,36 20,54"
      fill={active ? '#B45309' : '#475569'}
      opacity="0.85"
    />
    {/* Power Wires */}
    <path
      d="M22,25 Q33,31 44,18"
      fill="none"
      stroke={active ? '#FCD34D' : '#94A3B8'}
      strokeWidth="1.3"
    />
    <path
      d="M18,30 Q30,36 41,23"
      fill="none"
      stroke={active ? '#FCD34D' : '#94A3B8'}
      strokeWidth="1.3"
    />
    {/* Rear Tower */}
    <g stroke="#E2E8F0" strokeWidth="1.6" strokeLinecap="round">
      <line x1="42" y1="13" x2="39" y2="35" />
      <line x1="42" y1="13" x2="46" y2="35" />
      <line x1="37" y1="18" x2="47" y2="18" />
      <line x1="38" y1="24" x2="46" y2="24" />
    </g>
    {/* Front Tower */}
    <g stroke="#F8FAFC" strokeWidth="1.8" strokeLinecap="round">
      <line x1="22" y1="21" x2="18" y2="46" />
      <line x1="22" y1="21" x2="26" y2="46" />
      <line x1="15" y1="27" x2="29" y2="27" />
      <line x1="16" y1="33" x2="28" y2="33" />
      <line x1="19" y1="38" x2="25" y2="38" />
    </g>
  </svg>
);

export const SolarArrayHeaderBackdrop: React.FC = () => (
  <svg
    viewBox="0 0 800 240"
    preserveAspectRatio="xMidYMid slice"
    className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="skyHorizon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="55%" stopColor="#0F172A" />
        <stop offset="100%" stopColor="#090D14" />
      </linearGradient>
      <radialGradient id="sunGlow" cx="18%" cy="12%" r="48%">
        <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.42" />
        <stop offset="50%" stopColor="#EA580C" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="pvCellSurface" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#0F1E36" stopOpacity="0.95" />
      </linearGradient>
    </defs>

    <rect width="800" height="240" fill="url(#skyHorizon)" />
    <rect width="800" height="240" fill="url(#sunGlow)" />

    {/* Distant Horizon Hills */}
    <path d="M0,115 Q190,82 410,106 T800,92 L800,240 L0,240 Z" fill="#0B1320" />

    {/* Perspective Solar PV Array Rows */}
    <g stroke="#475569" strokeWidth="1" opacity="0.68">
      <polygon points="40,240 240,112 540,112 460,240" fill="url(#pvCellSurface)" />
      <polygon points="490,240 570,112 800,112 800,240" fill="url(#pvCellSurface)" />
      {/* Panel Grid Lines */}
      <line x1="115" y1="192" x2="512" y2="192" stroke="#64748B" strokeOpacity="0.5" />
      <line x1="168" y1="158" x2="525" y2="158" stroke="#64748B" strokeOpacity="0.45" />
      <line x1="208" y1="132" x2="534" y2="132" stroke="#64748B" strokeOpacity="0.4" />
      <line x1="170" y1="240" x2="320" y2="112" stroke="#64748B" strokeOpacity="0.45" />
      <line x1="295" y1="240" x2="405" y2="112" stroke="#64748B" strokeOpacity="0.45" />
      <line x1="400" y1="240" x2="482" y2="112" stroke="#64748B" strokeOpacity="0.45" />
      <line x1="525" y1="192" x2="800" y2="192" stroke="#64748B" strokeOpacity="0.45" />
      <line x1="550" y1="152" x2="800" y2="152" stroke="#64748B" strokeOpacity="0.4" />
      <line x1="635" y1="240" x2="685" y2="112" stroke="#64748B" strokeOpacity="0.45" />
    </g>
  </svg>
);

export const PowerFlowDiagram: React.FC<{
  telemetry: ParsedTelemetry;
  pvInstalled: number;
}> = ({ telemetry, pvInstalled }) => {
  const solarActive = telemetry.solarWatts > 10;
  const gridImporting = telemetry.gridWatts > 10;
  const gridExporting = telemetry.gridWatts < -10;
  const loadActive = telemetry.loadWatts > 10;
  const battCharging = telemetry.batteryState === 'charging';
  const battDischarging = telemetry.batteryState === 'discharging';

  return (
    <div className="w-full py-2">
      <svg
        viewBox="0 0 380 230"
        className="w-full max-w-[440px] mx-auto h-auto select-none"
        role="img"
        aria-label="Live Inverter Power Flow Schematic"
      >
        {/* Connection Tracks (Base) */}
        <path
          d="M92,52 L162,98"
          fill="none"
          stroke="currentColor"
          className="text-slate-300 dark:text-slate-700"
          strokeWidth="2.5"
        />
        <path
          d="M288,52 L218,98"
          fill="none"
          stroke="currentColor"
          className="text-slate-300 dark:text-slate-700"
          strokeWidth="2.5"
        />
        <path
          d="M162,132 L92,178"
          fill="none"
          stroke="currentColor"
          className="text-slate-300 dark:text-slate-700"
          strokeWidth="2.5"
        />
        <path
          d="M218,132 L288,178"
          fill="none"
          stroke="currentColor"
          className="text-slate-300 dark:text-slate-700"
          strokeWidth="2.5"
        />

        {/* Animated Flow Paths */}
        {solarActive && (
          <path
            d="M92,52 L162,98"
            fill="none"
            stroke="#22C55E"
            strokeWidth="3"
            className="animate-flow-line"
          />
        )}
        {gridImporting && (
          <path
            d="M92,178 L162,132"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="3"
            className="animate-flow-line"
          />
        )}
        {gridExporting && (
          <path
            d="M162,132 L92,178"
            fill="none"
            stroke="#10B981"
            strokeWidth="3"
            className="animate-flow-line"
          />
        )}
        {loadActive && (
          <path
            d="M218,98 L288,52"
            fill="none"
            stroke="#F87171"
            strokeWidth="3"
            className="animate-flow-line"
          />
        )}
        {battCharging && (
          <path
            d="M218,132 L288,178"
            fill="none"
            stroke="#10B981"
            strokeWidth="3"
            className="animate-flow-line"
          />
        )}
        {battDischarging && (
          <path
            d="M288,178 L218,132"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="3"
            className="animate-flow-line"
          />
        )}

        {/* Top-Left Node: Solar PV */}
        <g transform="translate(14, 14)">
          <rect
            width="92"
            height="58"
            rx="14"
            className="fill-slate-100 dark:fill-[#1F2933] stroke-slate-200 dark:stroke-slate-700/80"
            strokeWidth="1.2"
          />
          <text x="46" y="21" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-[10px] font-semibold">
            Solar PV
          </text>
          <text x="46" y="38" textAnchor="middle" className="fill-slate-900 dark:fill-white text-[13px] font-bold font-mono">
            {telemetry.solarWatts} W
          </text>
          <text x="46" y="51" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono">
            {telemetry.solarVoltage.toFixed(1)}V · {(pvInstalled / 1000).toFixed(1)}kWp
          </text>
        </g>

        {/* Top-Right Node: Home Load */}
        <g transform="translate(274, 14)">
          <rect
            width="92"
            height="58"
            rx="14"
            className="fill-rose-50/80 dark:fill-[#2B1D20] stroke-rose-200 dark:stroke-rose-900/60"
            strokeWidth="1.2"
          />
          <text x="46" y="21" textAnchor="middle" className="fill-rose-600 dark:fill-rose-400 text-[10px] font-semibold">
            Home Load
          </text>
          <text x="46" y="38" textAnchor="middle" className="fill-slate-900 dark:fill-white text-[13px] font-bold font-mono">
            {telemetry.loadWatts} W
          </text>
          <text x="46" y="51" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono">
            {telemetry.loadVoltage.toFixed(0)}V · {telemetry.loadPercentage}%
          </text>
        </g>

        {/* Center Node: Hybrid Inverter */}
        <g transform="translate(148, 82)">
          <rect
            width="84"
            height="66"
            rx="16"
            className="fill-slate-900 dark:fill-[#0F141A] stroke-slate-700 dark:stroke-slate-600"
            strokeWidth="1.5"
          />
          <text x="42" y="22" textAnchor="middle" className="fill-slate-300 text-[9.5px] font-semibold">
            INVERTER
          </text>
          <text x="42" y="38" textAnchor="middle" className="fill-emerald-400 text-[12px] font-bold font-mono">
            {telemetry.mode} · {telemetry.chargingMode}
          </text>
          <text x="42" y="53" textAnchor="middle" className="fill-slate-400 text-[9px] font-mono">
            {telemetry.mpptTemperature}°C · Fan {telemetry.fanSpeed}%
          </text>
        </g>

        {/* Bottom-Left Node: Utility Grid */}
        <g transform="translate(14, 158)">
          <rect
            width="92"
            height="58"
            rx="14"
            className="fill-amber-50/80 dark:fill-[#2B2418] stroke-amber-200 dark:stroke-amber-900/60"
            strokeWidth="1.2"
          />
          <text x="46" y="21" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400 text-[10px] font-semibold">
            Utility Grid
          </text>
          <text x="46" y="38" textAnchor="middle" className="fill-slate-900 dark:fill-white text-[13px] font-bold font-mono">
            {telemetry.gridWatts} W
          </text>
          <text x="46" y="51" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono">
            {telemetry.gridVoltage.toFixed(0)}V · {telemetry.gridHz.toFixed(1)}Hz
          </text>
        </g>

        {/* Bottom-Right Node: Battery Bank */}
        <g transform="translate(274, 158)">
          <rect
            width="92"
            height="58"
            rx="14"
            className="fill-slate-100 dark:fill-[#1F2933] stroke-slate-200 dark:stroke-slate-700/80"
            strokeWidth="1.2"
          />
          <text x="46" y="21" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-[10px] font-semibold">
            Battery
          </text>
          <text x="46" y="38" textAnchor="middle" className="fill-slate-900 dark:fill-white text-[13px] font-bold font-mono">
            {telemetry.batteryWatts} W
          </text>
          <text x="46" y="51" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono">
            {telemetry.batteryState === 'no-battery'
              ? 'No battery'
              : `${telemetry.batteryVoltage.toFixed(1)}V · ${telemetry.batteryPercentage}%`}
          </text>
        </g>
      </svg>
    </div>
  );
};

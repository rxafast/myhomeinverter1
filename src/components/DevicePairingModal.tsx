import React, { useState } from 'react';
import {
  Check,
  Cpu,
  Key,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Eye,
  EyeOff,
} from 'lucide-react';
import { DEFAULT_DEVICE_ID } from '../utils/telemetry';

interface DevicePairingModalProps {
  isOpen: boolean;
  onPair: (deviceId: string, name?: string) => void;
  onClose?: () => void;
  canCancel?: boolean;
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({
  isOpen,
  onPair,
  onClose,
  canCancel = false,
}) => {
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('HOME');
  const [showMaskedId, setShowMaskedId] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = deviceIdInput.trim().toUpperCase();
    if (!trimmed) {
      setErrorMsg('Please enter a valid Inverter Device ID.');
      return;
    }
    if (trimmed.length < 6) {
      setErrorMsg('Device ID should be at least 6 characters.');
      return;
    }
    setErrorMsg('');
    onPair(trimmed, deviceNameInput.trim() || 'HOME');
  };

  const handleQuickPairDefault = () => {
    onPair(DEFAULT_DEVICE_ID, 'HOME');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow ambient accent */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
              <span>Pair Your Inverter</span>
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              This dashboard is locked for privacy. Enter your Inverter Dongle Device ID to access live solar telemetry on this device.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Device ID Input */}
          <div>
            <label
              htmlFor="pair-device-id"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
            >
              Inverter Dongle Device ID
            </label>
            <div className="relative flex items-center">
              <Key className="w-4 h-4 absolute left-3.5 text-slate-400" />
              <input
                id="pair-device-id"
                type={showMaskedId ? 'text' : 'password'}
                placeholder="e.g. BCDDC277F175"
                value={deviceIdInput}
                onChange={(e) => {
                  setDeviceIdInput(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full min-h-[48px] pl-10 pr-12 rounded-xl bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-700 text-sm font-mono tracking-wider text-slate-900 dark:text-white uppercase placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowMaskedId((v) => !v)}
                className="absolute right-3 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                title={showMaskedId ? 'Hide Device ID' : 'Show Device ID'}
              >
                {showMaskedId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errorMsg && (
              <p className="text-xs font-medium text-rose-500 mt-1.5">{errorMsg}</p>
            )}
          </div>

          {/* Device Name Input */}
          <div>
            <label
              htmlFor="pair-device-name"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
            >
              Inverter Name (Optional)
            </label>
            <div className="relative flex items-center">
              <Cpu className="w-4 h-4 absolute left-3.5 text-slate-400" />
              <input
                id="pair-device-name"
                type="text"
                placeholder="e.g. HOME"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                className="w-full min-h-[48px] pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2.5">
            <button
              type="submit"
              className="w-full min-h-[48px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <Check className="w-4 h-4" />
              <span>Unlock Dashboard</span>
            </button>

            <button
              type="button"
              onClick={handleQuickPairDefault}
              className="w-full min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-[#182029] hover:bg-slate-200 dark:hover:bg-[#202A36] text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-800"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <span>Quick Pair Owner Device ({DEFAULT_DEVICE_ID.slice(0, 4)}...{DEFAULT_DEVICE_ID.slice(-4)})</span>
            </button>

            {canCancel && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Security badge note */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Device credentials stay saved locally in your browser.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

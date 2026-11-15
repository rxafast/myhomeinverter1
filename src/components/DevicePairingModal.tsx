import React, { useEffect, useState } from 'react';
import {
  Check,
  Cpu,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { InverterZoneAccountSession } from '../utils/inverterzoneAuth';
import { DEFAULT_DEVICE_ID } from '../utils/telemetry';

interface DevicePairingModalProps {
  isOpen: boolean;
  onPair: (deviceId: string, name?: string) => void;
  onAccountLogin: (email: string, password: string) => Promise<void>;
  accountSession: InverterZoneAccountSession | null;
  onAccountLogout: () => void;
  onSyncAccount?: () => Promise<void>;
  onClose?: () => void;
  canCancel?: boolean;
  initialMode?: 'account' | 'device';
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({
  isOpen,
  onPair,
  onAccountLogin,
  accountSession,
  onAccountLogout,
  onSyncAccount,
  onClose,
  canCancel = false,
  initialMode = 'account',
}) => {
  const [authTab, setAuthTab] = useState<'account' | 'device'>(initialMode);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('HOME');
  const [showMaskedId, setShowMaskedId] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAuthTab(initialMode);
      setErrorMsg('');
      if (accountSession?.email && !emailInput) {
        setEmailInput(accountSession.email);
      }
    }
  }, [isOpen, initialMode, accountSession?.email, emailInput]);

  if (!isOpen) return null;

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your InverterZone email or phone.');
      return;
    }
    if (!passwordInput) {
      setErrorMsg('Please enter your InverterZone password.');
      return;
    }
    setErrorMsg('');
    setAuthLoading(true);
    try {
      await onAccountLogin(cleanEmail, passwordInput);
      setPasswordInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in to InverterZone.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDeviceSubmit = (e: React.FormEvent) => {
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

  const handleSyncNow = async () => {
    if (!onSyncAccount) return;
    setSyncLoading(true);
    setErrorMsg('');
    try {
      await onSyncAccount();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-white dark:bg-[#12161B] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {accountSession ? <UserCheck className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
              <span>{accountSession ? 'InverterZone Account' : 'Connect InverterZone'}</span>
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              {accountSession
                ? 'Signed in to InverterZone Cloud. Sync your registered inverters and real nearby fleet.'
                : 'Sign in with your company app account to unlock your inverters and real nearby fleet, or pair directly by Device ID.'}
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="mt-5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#182029] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setAuthTab('account');
              setErrorMsg('');
            }}
            className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              authTab === 'account'
                ? 'bg-white dark:bg-[#12161B] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Company App Login
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthTab('device');
              setErrorMsg('');
            }}
            className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              authTab === 'device'
                ? 'bg-white dark:bg-[#12161B] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Device ID Only
          </button>
        </div>

        {authTab === 'account' ? (
          accountSession ? (
            <div className="mt-5 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#171C23] border border-slate-200 dark:border-slate-800 space-y-1.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">Signed-in Account</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {accountSession.userName || accountSession.email}
                </p>
                {accountSession.userName && accountSession.email && (
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {accountSession.email}
                  </p>
                )}
              </div>

              {errorMsg && (
                <p className="text-xs font-medium text-rose-500">{errorMsg}</p>
              )}

              <div className="space-y-2.5">
                {onSyncAccount && (
                  <button
                    type="button"
                    disabled={syncLoading}
                    onClick={handleSyncNow}
                    className="w-full min-h-[46px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />
                    <span>{syncLoading ? 'Syncing Devices & Fleet...' : 'Sync Account Devices & Nearby'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onAccountLogout}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out of Account</span>
                </button>

                {canCancel && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full min-h-[40px] py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleAccountSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="iz-login-email"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  InverterZone Email or Username
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 absolute left-3.5 text-slate-400" />
                  <input
                    id="iz-login-email"
                    type="text"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setErrorMsg('');
                    }}
                    className="w-full min-h-[48px] pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="iz-login-password"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Password
                </label>
                <div className="relative flex items-center">
                  <Key className="w-4 h-4 absolute left-3.5 text-slate-400" />
                  <input
                    id="iz-login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter company app password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setErrorMsg('');
                    }}
                    className="w-full min-h-[48px] pl-10 pr-12 rounded-xl bg-slate-50 dark:bg-[#171C23] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {errorMsg && <p className="text-xs font-medium text-rose-500">{errorMsg}</p>}

              <div className="pt-1 space-y-2.5">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full min-h-[48px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign in &amp; Load My Fleet</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleQuickPairDefault}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-[#182029] hover:bg-slate-200 dark:hover:bg-[#202A36] text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-800"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>
                    Quick Unlock Owner Device ({DEFAULT_DEVICE_ID.slice(0, 4)}...
                    {DEFAULT_DEVICE_ID.slice(-4)})
                  </span>
                </button>

                {canCancel && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full min-h-[40px] py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleDeviceSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="pair-device-id"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
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
                  aria-label={showMaskedId ? 'Hide Device ID' : 'Show Device ID'}
                >
                  {showMaskedId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errorMsg && <p className="text-xs font-medium text-rose-500 mt-1.5">{errorMsg}</p>}
            </div>

            <div>
              <label
                htmlFor="pair-device-name"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
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

            <div className="pt-1 space-y-2.5">
              <button
                type="submit"
                className="w-full min-h-[48px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Unlock with Device ID</span>
              </button>

              <button
                type="button"
                onClick={handleQuickPairDefault}
                className="w-full min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-[#182029] hover:bg-slate-200 dark:hover:bg-[#202A36] text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-800"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  Quick Pair Owner Device ({DEFAULT_DEVICE_ID.slice(0, 4)}...
                  {DEFAULT_DEVICE_ID.slice(-4)})
                </span>
              </button>

              {canCancel && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[40px] py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Credentials authenticate directly with InverterZone; session stays local.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

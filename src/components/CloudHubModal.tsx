import React, { useCallback, useEffect, useState } from 'react';
import {
  BatteryCharging,
  GitMerge,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { readCloudEndpoint, sendInverterCommand } from '../utils/inverterzoneApi';
import { InverterZoneAccountSession } from '../utils/inverterzoneAuth';

interface CloudHubModalProps {
  open: boolean;
  deviceId: string;
  accountSession: InverterZoneAccountSession | null;
  onOpenAccountLogin: () => void;
  onClose: () => void;
}

type HubTab = 'sharing' | 'bms' | 'dualpv';

export const CloudHubModal: React.FC<CloudHubModalProps> = ({
  open,
  deviceId,
  accountSession,
  onOpenAccountLogin,
  onClose,
}) => {
  const [tab, setTab] = useState<HubTab>('sharing');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Sharing state
  const [sharedList, setSharedList] = useState<Array<Record<string, unknown>>>([]);
  const [shareEmail, setShareEmail] = useState('');
  const [shareLevel, setShareLevel] = useState('1');
  const [ownerStatus, setOwnerStatus] = useState<string | null>(null);

  // BMS state
  const [bmsDevices, setBmsDevices] = useState<Array<Record<string, unknown>>>([]);

  // Dual-PV state
  const [dualPvDevices, setDualPvDevices] = useState<Array<Record<string, unknown>>>([]);
  const [dualPvQuery, setDualPvQuery] = useState('');
  const [dualPvSearchRes, setDualPvSearchRes] = useState<Array<Record<string, unknown>>>([]);

  const loadTabData = useCallback(async () => {
    if (!accountSession?.token) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      if (tab === 'sharing') {
        const [shares, owner] = await Promise.all([
          readCloudEndpoint<unknown>('accessShareDevices', {}, accountSession.token),
          readCloudEndpoint<Record<string, unknown>>(
            'checkOwnerAccess',
            { deviceId: deviceId.toUpperCase() },
            accountSession.token
          ).catch(() => null),
        ]);
        const rows = Array.isArray(shares)
          ? shares
          : shares && typeof shares === 'object' && Array.isArray((shares as { data?: unknown[] }).data)
            ? (shares as { data: unknown[] }).data
            : [];
        setSharedList(
          rows.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        );
        if (owner && typeof owner === 'object') {
          setOwnerStatus(
            typeof owner.msg === 'string'
              ? owner.msg
              : owner.code === 'Y'
                ? 'Account verified as device owner'
                : 'Shared / guest access'
          );
        }
      } else if (tab === 'bms') {
        const raw = await readCloudEndpoint<unknown>('getBmsDevices', {}, accountSession.token);
        const rows = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
            ? (raw as { data: unknown[] }).data
            : [];
        setBmsDevices(
          rows.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        );
      } else {
        const raw = await readCloudEndpoint<unknown>(
          'getDualPVDevices',
          { pageNumber: '1' },
          accountSession.token
        );
        const rows = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
            ? (raw as { data: unknown[] }).data
            : [];
        setDualPvDevices(
          rows.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        );
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to fetch cloud fleet data');
    } finally {
      setLoading(false);
    }
  }, [accountSession?.token, tab, deviceId]);

  useEffect(() => {
    if (open && accountSession?.token) {
      void loadTabData();
    }
  }, [open, accountSession?.token, loadTabData]);

  if (!open) return null;

  const handleAddAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountSession?.token || !shareEmail.trim()) return;
    setLoading(true);
    try {
      const res = await sendInverterCommand(accountSession.token, 'addAccess', {
        deviceId: deviceId.toUpperCase(),
        email: shareEmail.trim(),
        value: shareLevel,
      });
      setStatusMsg(res.msg);
      setShareEmail('');
      void loadTabData();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to grant access');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccess = async (accessId: string) => {
    if (!accountSession?.token) return;
    try {
      const res = await sendInverterCommand(accountSession.token, 'removeAcess', {
        value: accessId,
      });
      setStatusMsg(res.msg);
      void loadTabData();
    } catch {}
  };

  const handleLeaveShared = async (accessId: string) => {
    if (!accountSession?.token) return;
    try {
      const res = await sendInverterCommand(accountSession.token, 'leaveSharedDevice', {
        value: accessId,
      });
      setStatusMsg(res.msg);
      void loadTabData();
    } catch {}
  };

  const handleSearchDualPv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountSession?.token || !dualPvQuery.trim()) return;
    setLoading(true);
    try {
      const raw = await readCloudEndpoint<unknown>(
        'searchDualPvDevice',
        { deviceId: dualPvQuery.trim().toUpperCase() },
        accountSession.token
      );
      const rows = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
          ? (raw as { data: unknown[] }).data
          : raw && typeof raw === 'object'
            ? [raw]
            : [];
      setDualPvSearchRes(
        rows.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkDualPv = async (targetMac: string) => {
    if (!accountSession?.token) return;
    try {
      const res = await sendInverterCommand(accountSession.token, 'addDualPvDevice', {
        deviceId: deviceId.toUpperCase(),
        value: targetMac.trim().toUpperCase(),
      });
      setStatusMsg(res.msg);
      setDualPvSearchRes([]);
      setDualPvQuery('');
      void loadTabData();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to link Dual-PV device');
    }
  };

  const handleUnlinkDualPv = async (targetMac: string) => {
    if (!accountSession?.token) return;
    try {
      const res = await sendInverterCommand(accountSession.token, 'removeDualPv', {
        deviceId: targetMac.trim().toUpperCase(),
      });
      setStatusMsg(res.msg);
      void loadTabData();
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/55 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#161D25] border-t sm:border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Cloud Fleet · BMS · Dual-PV &amp; Sharing
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Cloud Hub"
            className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!accountSession ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Sign in with your InverterZone account to manage shared device access, BMS packs, and Dual-PV links.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAccountLogin();
              }}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in to InverterZone</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'sharing', label: 'Sharing', Icon: Share2 },
                    { id: 'bms', label: 'BMS Packs', Icon: BatteryCharging },
                    { id: 'dualpv', label: 'Dual-PV', Icon: GitMerge },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      tab === item.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-[#1E2732] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <item.Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void loadTabData()}
                disabled={loading}
                aria-label="Refresh hub"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-[#1E2732] flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {statusMsg && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {statusMsg}
              </p>
            )}

            {tab === 'sharing' && (
              <div className="space-y-4">
                {ownerStatus && (
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>
                      {deviceId}: {ownerStatus}
                    </span>
                  </p>
                )}

                <form onSubmit={handleAddAccess} className="flex flex-col sm:flex-row gap-2 text-xs">
                  <input
                    type="email"
                    required
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Share inverter with user email..."
                    className="flex-1 min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <select
                    value={shareLevel}
                    onChange={(e) => setShareLevel(e.target.value)}
                    aria-label="Access permission"
                    className="min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="1">View &amp; Monitor</option>
                    <option value="2">Full Remote Control</option>
                  </select>
                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Grant Access</span>
                  </button>
                </form>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-56 overflow-y-auto text-xs">
                  {sharedList.length === 0 ? (
                    <p className="py-6 text-center text-slate-500">
                      {loading ? 'Loading shared devices...' : 'No shared access links configured.'}
                    </p>
                  ) : (
                    sharedList.map((item, idx) => {
                      const accessId = String(item.id ?? item.value ?? idx);
                      const label = String(item.email ?? item.name ?? item.mac ?? item.deviceId ?? accessId);
                      const sub = String(item.mac ?? item.deviceId ?? '');
                      const isOwner = item.isOwner === true || item.owner === true;
                      return (
                        <div key={accessId} className="py-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">{label}</p>
                            {sub && (
                              <p className="font-mono text-slate-500 dark:text-slate-400">{sub}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void (isOwner ? handleRemoveAccess(accessId) : handleLeaveShared(accessId))
                            }
                            className="min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-[#1E2732] hover:text-rose-500 font-semibold cursor-pointer shrink-0"
                          >
                            {isOwner ? 'Revoke' : 'Leave'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {tab === 'bms' && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto text-xs">
                {loading && bmsDevices.length === 0 ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  </div>
                ) : bmsDevices.length === 0 ? (
                  <p className="py-6 text-center text-slate-500">
                    No dedicated cloud BMS battery packs linked to this account.
                  </p>
                ) : (
                  bmsDevices.map((bms, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {String(bms.name ?? bms.mac ?? bms.deviceId ?? `BMS Pack ${idx + 1}`)}
                        </p>
                        <p className="font-mono tabular-nums text-slate-500 mt-0.5">
                          {String(bms.mac ?? bms.deviceId ?? '')}
                          {bms.battType ? ` · ${String(bms.battType)}` : ''}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                        {bms.battPercent != null ? `${bms.battPercent}% · ` : ''}
                        {bms.battV != null ? `${bms.battV}V` : 'Linked'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'dualpv' && (
              <div className="space-y-4">
                <form onSubmit={handleSearchDualPv} className="flex gap-2 text-xs">
                  <input
                    type="text"
                    value={dualPvQuery}
                    onChange={(e) => setDualPvQuery(e.target.value)}
                    placeholder="Enter companion Dual-PV MAC ID..."
                    className="flex-1 min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-sky-600 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Find MAC</span>
                  </button>
                </form>

                {dualPvSearchRes.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#1E2732] space-y-2 text-xs">
                    {dualPvSearchRes.map((resItem, idx) => {
                      const mac = String(resItem.mac ?? resItem.deviceId ?? dualPvQuery).toUpperCase();
                      return (
                        <div key={idx} className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {String(resItem.name ?? mac)} ({mac})
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleLinkDualPv(mac)}
                            className="min-h-[36px] px-3 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                          >
                            Link Dual-PV
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-56 overflow-y-auto text-xs">
                  {dualPvDevices.length === 0 ? (
                    <p className="py-6 text-center text-slate-500">
                      {loading ? 'Loading Dual-PV inverters...' : 'No Dual-PV companion groups configured.'}
                    </p>
                  ) : (
                    dualPvDevices.map((dp, idx) => {
                      const mac = String(dp.mac ?? dp.deviceId ?? idx);
                      return (
                        <div key={mac} className="py-2.5 flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {String(dp.name ?? mac)}
                            </p>
                            <p className="font-mono text-slate-500">{mac}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleUnlinkDualPv(mac)}
                            aria-label={`Remove ${mac}`}
                            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

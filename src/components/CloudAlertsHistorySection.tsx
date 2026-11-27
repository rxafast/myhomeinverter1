import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CalendarRange,
  CheckCheck,
  Download,
  Loader2,
  LogIn,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  CloudRecordEntry,
  fetchAlertsSummaryCloud,
  fetchGroupAlertsCloud,
  fetchNotificationsCountCloud,
  fetchRecordsCloud,
  sendInverterCommand,
} from '../utils/inverterzoneApi';
import { InverterZoneAccountSession } from '../utils/inverterzoneAuth';

interface CloudAlertsHistorySectionProps {
  deviceId: string;
  accountSession: InverterZoneAccountSession | null;
  onOpenAccountLogin: () => void;
}

function getIsoDateOffset(daysOffset: number): string {
  const d = new Date(Date.now() + daysOffset * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

export const CloudAlertsHistorySection: React.FC<CloudAlertsHistorySectionProps> = ({
  deviceId,
  accountSession,
  onOpenAccountLogin,
}) => {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [alertsSummary, setAlertsSummary] = useState<Array<Record<string, unknown>>>([]);
  const [groupAlerts, setGroupAlerts] = useState<Array<Record<string, unknown>>>([]);
  const [alertTypeFilter, setAlertTypeFilter] = useState<string>('all');
  const [loadingCloudAlerts, setLoadingCloudAlerts] = useState(false);
  const [alertActionFeedback, setAlertActionFeedback] = useState<string | null>(null);

  // Date-range historical telemetry records (/api/getRecords)
  const [fromDate, setFromDate] = useState<string>(() => getIsoDateOffset(-3));
  const [toDate, setToDate] = useState<string>(() => getIsoDateOffset(0));
  const [records, setRecords] = useState<CloudRecordEntry[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [hasLoadedRecords, setHasLoadedRecords] = useState(false);

  const loadCloudAlerts = useCallback(async () => {
    if (!accountSession?.token) return;
    setLoadingCloudAlerts(true);
    try {
      const [cnt, summaryRaw, groupRaw] = await Promise.all([
        fetchNotificationsCountCloud(accountSession.token, deviceId).catch(() => 0),
        fetchAlertsSummaryCloud(accountSession.token, deviceId).catch(() => null),
        fetchGroupAlertsCloud(accountSession.token, deviceId, alertTypeFilter, 1).catch(() => null),
      ]);
      setUnreadCount(cnt);

      const sumArr = Array.isArray(summaryRaw)
        ? summaryRaw
        : summaryRaw &&
            typeof summaryRaw === 'object' &&
            Array.isArray((summaryRaw as { data?: unknown[] }).data)
          ? (summaryRaw as { data: unknown[] }).data
          : [];
      setAlertsSummary(
        sumArr.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
      );

      const grpArr = Array.isArray(groupRaw)
        ? groupRaw
        : groupRaw &&
            typeof groupRaw === 'object' &&
            Array.isArray((groupRaw as { data?: unknown[] }).data)
          ? (groupRaw as { data: unknown[] }).data
          : [];
      setGroupAlerts(
        grpArr.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
      );
    } finally {
      setLoadingCloudAlerts(false);
    }
  }, [accountSession?.token, deviceId, alertTypeFilter]);

  useEffect(() => {
    if (accountSession?.token) {
      void loadCloudAlerts();
    }
  }, [accountSession?.token, loadCloudAlerts]);

  const handleMarkNotificationsRead = async () => {
    if (!accountSession?.token) return;
    try {
      const res = await sendInverterCommand(accountSession.token, 'readNotifications', {
        deviceId: deviceId.toUpperCase(),
      });
      setUnreadCount(0);
      setAlertActionFeedback(res.msg || 'Marked cloud notifications read');
      void loadCloudAlerts();
    } catch (err) {
      setAlertActionFeedback(err instanceof Error ? err.message : 'Failed to update notifications');
    }
  };

  const handleClearCloudNotifications = async () => {
    if (!accountSession?.token) return;
    try {
      const res = await sendInverterCommand(accountSession.token, 'clearNotifications', {
        deviceId: deviceId.toUpperCase(),
      });
      setUnreadCount(0);
      setGroupAlerts([]);
      setAlertActionFeedback(res.msg || 'Cloud notification history cleared');
    } catch (err) {
      setAlertActionFeedback(err instanceof Error ? err.message : 'Failed to clear notifications');
    }
  };

  const handleRemoveSingleAlert = async (alertId: string) => {
    if (!accountSession?.token) return;
    try {
      await sendInverterCommand(accountSession.token, 'removeAlert', {
        value: alertId,
      });
      setGroupAlerts((prev) => prev.filter((item) => String(item.id ?? item._id ?? '') !== alertId));
    } catch {}
  };

  const handleFetchRecords = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!accountSession?.token) return;
    setLoadingRecords(true);
    setRecordsError(null);
    setHasLoadedRecords(true);
    try {
      const data = await fetchRecordsCloud(accountSession.token, deviceId, fromDate, toDate);
      setRecords(data);
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : 'Failed to query cloud records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleExportRecordsCsv = () => {
    if (records.length === 0) return;
    const header = ['Timestamp', 'Solar_W', 'Load_W', 'Grid_W', 'Grid_V', 'Batt_V', 'Batt_Pct', 'Temp_C', 'Mode'];
    const lines = records.map((r) =>
      [
        r.time,
        r.solarW ?? '',
        r.loadW ?? '',
        r.gridW ?? '',
        r.gridV ?? '',
        r.battV ?? '',
        r.battPct ?? '',
        r.tempC ?? '',
        r.mode ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inverterzone_records_${deviceId}_${fromDate}_to_${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!accountSession) {
    return (
      <section className="lg:col-span-12 rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-500" />
            <span>InverterZone Cloud Alerts &amp; Historical Telemetry Log</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Sign in with your InverterZone account to read cloud fault summaries, unread alerts, and multi-day CSV history records.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAccountLogin}
          className="min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Sign in to Sync</span>
        </button>
      </section>
    );
  }

  return (
    <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Cloud Alerts & Notification Queue */}
      <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-500" />
              <span>Cloud Alerts &amp; Notifications</span>
              {unreadCount > 0 && (
                <span className="font-mono tabular-nums text-xs font-bold text-rose-500">
                  · {unreadCount} unread
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Synced from InverterZone server queue
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCloudAlerts()}
            disabled={loadingCloudAlerts}
            aria-label="Refresh cloud alerts"
            className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-[#1E2732] flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCloudAlerts ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter cloud alert group"
            value={alertTypeFilter}
            onChange={(e) => setAlertTypeFilter(e.target.value)}
            className="min-h-[38px] px-2.5 rounded-lg bg-slate-100 dark:bg-[#11171D] border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
          >
            <option value="all">All Categories</option>
            <option value="fault">Faults</option>
            <option value="grid">Grid Events</option>
            <option value="battery">Battery</option>
          </select>

          <button
            type="button"
            onClick={() => void handleMarkNotificationsRead()}
            className="min-h-[38px] px-3 rounded-lg bg-slate-100 dark:bg-[#1E2732] hover:bg-slate-200 dark:hover:bg-[#263140] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Mark Read</span>
          </button>

          <button
            type="button"
            onClick={() => void handleClearCloudNotifications()}
            className="min-h-[38px] px-3 rounded-lg bg-slate-100 dark:bg-[#1E2732] hover:text-rose-500 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All</span>
          </button>
        </div>

        {alertActionFeedback && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {alertActionFeedback}
          </p>
        )}

        {alertsSummary.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {alertsSummary.slice(0, 4).map((s, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-slate-100/80 dark:bg-[#11171D] px-3 py-2 flex items-center justify-between gap-2"
              >
                <span className="text-slate-600 dark:text-slate-400 truncate">
                  {String(s.type ?? s.name ?? s.label ?? `Group ${idx + 1}`)}
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {String(s.count ?? s.total ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
          {groupAlerts.length === 0 ? (
            <p className="py-5 text-center text-slate-500 dark:text-slate-400">
              {loadingCloudAlerts ? 'Loading cloud alerts...' : 'No cloud alerts recorded for this filter.'}
            </p>
          ) : (
            groupAlerts.slice(0, 20).map((item, idx) => {
              const id = String(item.id ?? item._id ?? idx);
              const title = String(item.title ?? item.msg ?? item.message ?? item.code ?? 'Alert');
              const time = String(item.time ?? item.createdAt ?? item.date ?? '');
              return (
                <div key={id} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{title}</p>
                    {time && (
                      <p className="font-mono tabular-nums text-[11px] text-slate-500 mt-0.5">
                        {time}
                      </p>
                    )}
                  </div>
                  {(item.id != null || item._id != null) && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveSingleAlert(id)}
                      aria-label="Dismiss cloud alert"
                      className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Date-Range Cloud Historical Records */}
      <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#171E26] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-sky-500" />
              <span>Cloud Date-Range Telemetry Archive</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Query historical inverter snapshots between dates and export to CSV
            </p>
          </div>
          {records.length > 0 && (
            <button
              type="button"
              onClick={handleExportRecordsCsv}
              className="min-h-[38px] px-3 rounded-xl bg-slate-100 dark:bg-[#1E2732] hover:bg-slate-200 dark:hover:bg-[#263140] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV ({records.length})</span>
            </button>
          )}
        </div>

        <form onSubmit={handleFetchRecords} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400">From Date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              required
              className="mt-1 w-full min-h-[40px] px-3 rounded-lg bg-slate-100 dark:bg-[#11171D] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400">To Date</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              required
              className="mt-1 w-full min-h-[40px] px-3 rounded-lg bg-slate-100 dark:bg-[#11171D] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loadingRecords}
              className="w-full min-h-[40px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loadingRecords && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loadingRecords ? 'Querying...' : 'Load Cloud Records'}</span>
            </button>
          </div>
        </form>

        {recordsError && <p className="text-xs text-rose-500 font-medium">{recordsError}</p>}

        {hasLoadedRecords && !loadingRecords && records.length === 0 ? (
          <p className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
            No archived telemetry points returned for {fromDate} to {toDate}.
          </p>
        ) : records.length > 0 ? (
          <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-slate-100 dark:bg-[#11171D] text-slate-500 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-medium">Timestamp</th>
                  <th className="px-3 py-2 font-medium">Solar</th>
                  <th className="px-3 py-2 font-medium">Load</th>
                  <th className="px-3 py-2 font-medium">Grid</th>
                  <th className="px-3 py-2 font-medium">Batt</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                {records.slice(0, 60).map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 whitespace-nowrap">{row.time || '—'}</td>
                    <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">
                      {row.solarW !== undefined ? `${row.solarW}W` : '—'}
                    </td>
                    <td className="px-3 py-2 text-rose-600 dark:text-rose-400">
                      {row.loadW !== undefined ? `${row.loadW}W` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {row.gridW !== undefined ? `${row.gridW}W` : '—'}
                      {row.gridV !== undefined ? ` · ${row.gridV}V` : ''}
                    </td>
                    <td className="px-3 py-2">
                      {row.battV !== undefined ? `${row.battV}V` : '—'}
                      {row.battPct !== undefined ? ` (${row.battPct}%)` : ''}
                    </td>
                    <td className="px-3 py-2">{row.mode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
};

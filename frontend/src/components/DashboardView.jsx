import React, { useState, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE || 'http://localhost:3001')
  : window.location.origin;

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

function fmtCur(n) {
  if (n === null || n === undefined || n === 0) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n}`;
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dash-section">
      <button className="dash-section-header" onClick={() => setOpen(o => !o)}>
        <span>{icon} {title}</span>
        <span className="dash-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="dash-section-body">{children}</div>}
    </div>
  );
}

function KpiCard({ label, value, change, inverse = false, isPoints = false }) {
  const good = inverse ? change < 0 : change > 0;
  const cls = change === null || change === undefined ? '' : good ? 'kpi-up' : change === 0 ? 'kpi-flat' : 'kpi-down';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : null;
  const badge = change !== null && change !== undefined
    ? `${arrow ? arrow + ' ' : ''}${Math.abs(change)}${isPoints ? 'pp' : '%'}`
    : null;
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row">
        <span className="kpi-value">{value}</span>
        {badge && <span className={`kpi-badge ${cls}`}>{badge}</span>}
      </div>
    </div>
  );
}

function TaskCard({ tasks, tasksChange, overdue }) {
  const good = tasksChange > 0;
  const cls = tasksChange === null || tasksChange === undefined ? '' : good ? 'kpi-up' : tasksChange === 0 ? 'kpi-flat' : 'kpi-down';
  const arrow = tasksChange > 0 ? '▲' : tasksChange < 0 ? '▼' : null;
  const badge = tasksChange !== null && tasksChange !== undefined
    ? `${arrow ? arrow + ' ' : ''}${Math.abs(tasksChange)}%`
    : null;
  return (
    <div className="kpi-card task-kpi-card">
      <div className="kpi-label">Tasks</div>
      <div className="task-card-body">
        <div className="kpi-value-row">
          <span className="kpi-value">{fmtNum(tasks)}</span>
          {badge && <span className={`kpi-badge ${cls}`}>{badge}</span>}
        </div>
        {overdue > 0 && (
          <div className="task-overdue">
            <span className="task-overdue-count">{fmtNum(overdue)}</span>
            <span className="task-overdue-label">overdue</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactsCard({ current, change, sources }) {
  const good = change > 0;
  const cls = change === null || change === undefined ? '' : good ? 'kpi-up' : change === 0 ? 'kpi-flat' : 'kpi-down';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : null;
  const badge = change !== null && change !== undefined
    ? `${arrow ? arrow + ' ' : ''}${Math.abs(change)}%`
    : null;
  const totalNamed = sources.reduce((s, [, c]) => s + c, 0);
  const unknown = (current || 0) - totalNamed;
  const allSources = unknown > 0 ? [...sources, ['Unknown', unknown]] : sources;
  const total = current || 1;
  return (
    <div className="contacts-card">
      <div className="kpi-label">New Contacts</div>
      <div className="contacts-body">
        <div className="contacts-main">
          <div className="kpi-value-row">
            <span className="kpi-value">{fmtNum(current)}</span>
            {badge && <span className={`kpi-badge ${cls}`}>{badge}</span>}
          </div>
        </div>
        {allSources.length > 0 && (
          <div className="contacts-sources">
            {allSources.map(([src, count]) => (
              <div key={src} className="contacts-source-row">
                <span className="cs-label">{src}</span>
                <span className="cs-count">{count} <span className="cs-pct">({Math.round(count / total * 100)}%)</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Trend({ change, inverse = false, isPoints = false }) {
  if (change === null || change === undefined) return null;
  const good = inverse ? change < 0 : change > 0;
  const cls = good ? 'kpi-up' : change === 0 ? 'kpi-flat' : 'kpi-down';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '';
  return (
    <span className={`wl-trend ${cls}`}>{arrow} {Math.abs(change)}{isPoints ? 'pp' : '%'}</span>
  );
}

export default function DashboardView() {
  const [isConnected, setIsConnected] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/status`);
      const json = await res.json();
      setIsConnected(json.connected);
    } catch (e) { console.error('Status check failed', e); }
  };

  const fetchData = useCallback(async (force = false) => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const url = force ? `${API_BASE}/api/dashboard?refresh=1` : `${API_BASE}/api/dashboard`;
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => { checkStatus(); }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const d = data;
  const deals = d?.deals;
  const activity = d?.activity;
  const contacts = d?.contacts;
  const marketing = d?.marketing;

  const stages = deals?.byStage
    ? Object.entries(deals.byStage).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  const sources = contacts?.sources
    ? Object.entries(contacts.sources).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : [];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#fff' }}>
      <div className="dash-topbar" style={{ position: 'sticky', top: 0 }}>
        <span>Dashboard <span className="dash-period">· last 30d vs prior</span></span>
        <button className="dash-refresh-btn" onClick={() => fetchData(true)} disabled={loading} title="Refresh">
          <span className={loading ? 'spinning' : ''}>↻</span>
        </button>
      </div>

      {!isConnected && (
        <div className="dash-not-connected">
          Connect HubSpot from the Chat tab to see your CRM metrics here.
        </div>
      )}

      {error && <div className="dash-error">{error}</div>}

      {isConnected && !d && loading && (
        <div className="dash-skeleton">
          {[...Array(16)].map((_, i) => <div key={i} className="skel-row" />)}
        </div>
      )}

      {d && (
        <>
          <Section title="Sales" icon="💼" defaultOpen={true}>
            <div className="kpi-grid kpi-grid--4">
              <KpiCard label="New Deals" value={fmtNum(deals?.created?.current)} change={deals?.created?.change} />
              <KpiCard label="Pipeline" value={fmtCur(deals?.pipeline?.current)} change={deals?.pipeline?.change} />
              <KpiCard label="Avg Deal" value={fmtCur(deals?.avgSize?.current)} change={deals?.avgSize?.change} />
              <KpiCard label="Overdue Deals" value={fmtNum(deals?.overdueCount ?? 0)} change={null} inverse={deals?.overdueCount > 0} />
            </div>
            <div className="win-loss-row">
              <div className="wl-item">
                <span className="wl-label">Won</span>
                <span className="wl-value">{fmtNum(deals?.won?.count?.current)}</span>
                <Trend change={deals?.won?.count?.change} />
              </div>
              <div className="wl-divider" />
              <div className="wl-item">
                <span className="wl-label">Lost</span>
                <span className="wl-value">{fmtNum(deals?.lost?.current)}</span>
                <Trend change={deals?.lost?.change} inverse />
              </div>
              <div className="wl-divider" />
              <div className="wl-item">
                <span className="wl-label">Win Rate</span>
                <span className="wl-value">{fmtPct(deals?.winRate?.current)}</span>
                <Trend change={deals?.winRate?.change} isPoints />
              </div>
            </div>
            {stages.length > 0 && (
              <div className="stage-breakdown">
                <div className="breakdown-title">Pipeline by stage</div>
                {stages.map(([stage, count]) => (
                  <div key={stage} className="breakdown-row">
                    <span>{stage.replace(/_/g, ' ')}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Contacts" icon="👥" defaultOpen={true}>
            <div className="contacts-card-wrap">
              <ContactsCard current={contacts?.current} change={contacts?.change} sources={sources} />
            </div>
          </Section>

          <Section title="Activity" icon="📞" defaultOpen={true}>
            <div className="kpi-grid kpi-grid--row">
              <KpiCard label="Calls" value={fmtNum(activity?.calls?.current)} change={activity?.calls?.change} />
              <KpiCard label="Meetings" value={fmtNum(activity?.meetings?.current)} change={activity?.meetings?.change} />
              <KpiCard label="Emails" value={fmtNum(activity?.emails?.current)} change={activity?.emails?.change} />
              <KpiCard label="Notes" value={fmtNum(activity?.notes?.current)} change={activity?.notes?.change} />
              <TaskCard tasks={activity?.tasks?.current} tasksChange={activity?.tasks?.change} overdue={activity?.overdueTasks} />
            </div>
          </Section>

          <Section title="Marketing" icon="📧" defaultOpen={true}>
            <div className="kpi-grid">
              <KpiCard label="Email Opens" value={fmtNum(marketing?.emailOpens?.current)} change={marketing?.emailOpens?.change} />
              <KpiCard label="Form Submits" value={fmtNum(marketing?.formSubmissions?.current)} change={marketing?.formSubmissions?.change} />
              <KpiCard label="Page Views" value={fmtNum(marketing?.pageViews?.current)} change={marketing?.pageViews?.change} />
            </div>
          </Section>

          <div className="dash-footer">Updated {timeAgo(d.fetchedAt)} · auto-refreshes every 30m</div>
        </>
      )}
    </div>
  );
}

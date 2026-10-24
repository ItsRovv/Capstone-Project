9*                                                                                                                                                                                          import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { PageLoader, Spinner } from '../components/UI/Spinner';
import { EmptyState } from '../components/UI/EmptyState';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { Input } from '../components/UI/Input';
import { reportService } from '../services/reportService';
import { apiError } from '../services/api';
import { ReportDocument } from '../components/ReportDocument';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function SummaryCard({ title, value, icon: IconComponent, accent = 'primary' }) {
  const styles = {
    primary: 'bg-primary-50 text-primary-700 border-primary-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    ink: 'bg-ink-50 text-ink-600 border-ink-100'
  };
  return (
    <Card padding="p-4" className="border border-ink-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-ink-400 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${styles[accent]}`}>
          <IconComponent width={20} height={20} />
        </div>
      </div>
    </Card>
  );
}

export function Reports() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState({ open: false, date: todayISO(), type: 'daily' });
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [filter, setFilter] = useState('all');

  async function load() {
    setLoading(true);
    try {
      const data = await reportService.list();
      setReports(data);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load reports'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setGenerating(true);
    setGenerated(null);
    try {
      const result = await reportService.generate(modal.date, modal.type);
      setGenerated(result);
      toast.success('Report generated');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Report generation failed'));
    } finally {
      setGenerating(false);
    }
  }

  function openReport(r) {
    setViewing(r);
  }

  const filteredReports = filter === 'all'
    ? reports
    : reports.filter((r) => {
        const d = new Date(r.report_date);
        const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return yearMonth === filter;
      });

  function groupReportsByDate(items) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups = { Today: [], Yesterday: [], 'This week': [], Older: [] };
    for (const r of items) {
      const d = new Date(r.report_date);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() === today.getTime()) groups.Today.push(r);
      else if (d.getTime() === yesterday.getTime()) groups.Yesterday.push(r);
      else if (d.getTime() > weekAgo.getTime()) groups['This week'].push(r);
      else groups.Older.push(r);
    }
    return groups;
  }

  const groupedReports = groupReportsByDate(filteredReports);

  const monthOptions = (() => {
    const map = new Map();
    for (const r of reports) {
      const d = new Date(r.report_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!map.has(key)) map.set(key, { key, label, count: 0 });
      map.get(key).count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  })();

  const todayReports = groupedReports.Today.length;
  const latestReport = reports[0];

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Reports"
        subtitle="Daily clinic reports with summaries."
        onMenuClick={onOpenMenu}
        right={
          <Button
            onClick={() => {
              setModal({ open: true, date: todayISO(), type: 'daily' });
              setGenerated(null);
            }}
          >
            <Icon.FileText width={16} height={16} /> Generate report
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
        <div className="max-w-5xl w-full mx-auto px-4 md:px-8 space-y-4">
          {loading ? (
            <PageLoader />
          ) : reports.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon.FileText width={36} height={36} />}
                title="No reports yet"
                description="Generate a report to get a summary of clinic activity."
                action={
                  <Button
                    onClick={() => {
                      setModal({ open: true, date: todayISO(), type: 'daily' });
                      setGenerated(null);
                    }}
                  >
                    <Icon.FileText width={16} height={16} /> Generate your first report
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard title="Total Reports" value={reports.length} icon={Icon.FileText} accent="primary" />
                <SummaryCard title="Reports Today" value={todayReports} icon={Icon.Report} accent="emerald" />
                <SummaryCard
                  title="Latest Report"
                  value={latestReport ? formatDate(latestReport.report_date) : '—'}
                  icon={Icon.Calendar}
                  accent="ink"
                />
              </div>

              {/* Month filter tabs */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    filter === 'all'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:bg-ink-50'
                  }`}
                >
                  All reports
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${filter === 'all' ? 'bg-primary-500 text-white' : 'bg-ink-100 text-ink-600'}`}>
                    {reports.length}
                  </span>
                </button>
                {monthOptions.map((m) => {
                  const active = filter === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setFilter(m.key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        active
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-ink-600 border-ink-200 hover:bg-ink-50'
                      }`}
                    >
                      {m.label}
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-primary-500 text-white' : 'bg-ink-100 text-ink-600'}`}>
                        {m.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Grouped report list */}
              <div className="space-y-4">
                {Object.entries(groupedReports).map(([groupName, items]) =>
                  items.length > 0 ? (
                    <div key={groupName}>
                      <h3 className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-2 px-1">{groupName}</h3>
                      <Card padding="p-0" className="overflow-hidden border border-ink-100">
                        <ul className="divide-y divide-ink-100">
                          {items.map((r) => (
                            <li
                              key={r.id}
                              className="px-5 py-4 hover:bg-ink-50/50 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 inline-flex items-center justify-center flex-shrink-0">
                                    <Icon.Report width={18} height={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-ink-900">{formatDate(r.report_date)}</p>
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                        r.report_type === 'daily'
                                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                          : r.report_type === 'weekly'
                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                                      }`}>
                                        {r.report_type}
                                      </span>
                                    </div>
                                    <p className="text-xs text-ink-500 mt-0.5">
                                      {r.total_patients || 0} patient{r.total_patients === 1 ? '' : 's'} · Generated {formatDate(r.created_at)}
                                    </p>
                                  </div>
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => openReport(r)}>
                                  View
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    </div>
                  ) : null
                )}
              </div>

              {filteredReports.length === 0 && (
                <Card>
                  <div className="p-8 text-center text-ink-500">
                    <p>No {filter === 'all' ? '' : filter} reports found.</p>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Generate modal */}
      <Modal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title="Generate report"
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModal((m) => ({ ...m, open: false }))}
            >
              Close
            </Button>
            <Button onClick={generate} loading={generating}>
              <Icon.FileText width={16} height={16} /> Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!generated && !generating && (
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-600 inline-flex items-center justify-center">
                  <Icon.FileText width={18} height={18} />
                </div>
                <div>
                  <p className="font-medium text-ink-900 text-sm">Clinic report</p>
                  <p className="text-xs text-ink-500">Choose a type and date to generate the report.</p>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Report type
            </label>
            <select
              className="input-base"
              value={modal.type}
              onChange={(e) => setModal((m) => ({ ...m, type: e.target.value }))}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (7-day window ending on date)</option>
              <option value="monthly">Monthly Census</option>
            </select>
          </div>
          {modal.type === 'monthly' ? (
            <Input
              type="month"
              label="Report month"
              value={modal.date ? modal.date.slice(0, 7) : ''}
              onChange={(e) => setModal((m) => ({ ...m, date: e.target.value }))}
            />
          ) : (
            <Input
              type="date"
              label={modal.type === 'weekly' ? 'Week ending date' : 'Report date'}
              value={modal.date}
              onChange={(e) => setModal((m) => ({ ...m, date: e.target.value }))}
            />
          )}
          {generated && (
            <ReportDocument
              metrics={generated.metrics}
              date={modal.date}
              type={modal.type}
            />
          )}
          {generating && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Spinner size="md" />
              <p className="text-sm text-ink-500">Compiling report…</p>
            </div>
          )}
        </div>
      </Modal>

      {/* View report modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Report · ${formatDate(viewing.report_date)}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewing(null)}>
              Close
            </Button>
            <Button onClick={() => window.print()}>
              <Icon.FileText width={16} height={16} /> Print / Save as PDF
            </Button>
          </>
        }
      >
        {viewing && (
          <ReportDocument
            metrics={viewing.metrics}
            date={viewing.report_date}
            type={viewing.report_type}
          />
        )}
      </Modal>
    </div>
  );
}

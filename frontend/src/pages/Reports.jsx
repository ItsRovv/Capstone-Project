import { useEffect, useState } from 'react';
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
import { aiService } from '../services/aiService';
import { apiError } from '../services/api';

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

function MetricCard({ icon, label, value, sub, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-50 text-primary-600',
    info: 'bg-sky-50 text-sky-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-red-50 text-red-600'
  };
  return (
    <div className="rounded-xl border border-ink-100 p-3.5 bg-white">
      <div className={`w-8 h-8 rounded-lg inline-flex items-center justify-center mb-2 ${tones[tone]}`}>
        {icon}
      </div>
      <p className="text-xs text-ink-500 font-medium">{label}</p>
      <p className="text-lg font-display font-bold text-ink-900">{value}</p>
      {sub && <p className="text-xs text-ink-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ReportMetrics({ metrics }) {
  if (!metrics) return null;
  const {
    totalPatients,
    totalAppointments,
    appointmentBreakdown,
    newPatients,
    returningPatients,
    topComplaints,
    topDiagnoses,
    peakHour: busiest,
    trend,
    followUpAlerts
  } = metrics;

  const apptTotal = totalAppointments || 0;
  const completed = appointmentBreakdown?.completed || 0;
  const cancelled = appointmentBreakdown?.cancelled || 0;
  const scheduled = appointmentBreakdown?.scheduled || 0;

  const trendTone = trend
    ? trend.change > 0
      ? 'success'
      : trend.change < 0
        ? 'danger'
        : 'primary'
    : 'primary';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Icon.Users width={16} height={16} />}
          label="Consultations"
          value={totalPatients || 0}
          sub={trend ? `${trend.change > 0 ? '+' : ''}${trend.change}% vs prev` : undefined}
          tone={trendTone}
        />
        <MetricCard
          icon={<Icon.Calendar width={16} height={16} />}
          label="Appointments"
          value={apptTotal}
          sub={`${completed} done · ${scheduled} sched · ${cancelled} canc`}
          tone="info"
        />
        <MetricCard
          icon={<Icon.User width={16} height={16} />}
          label="New patients"
          value={newPatients || 0}
          sub={returningPatients > 0 ? `${returningPatients} returning` : undefined}
          tone="success"
        />
        {busiest && (
          <MetricCard
            icon={<Icon.Clock width={16} height={16} />}
            label="Peak hour"
            value={`${busiest.hour % 12 || 12} ${busiest.hour >= 12 ? 'PM' : 'AM'}`}
            sub={`${busiest.count} visits`}
            tone="warning"
          />
        )}
      </div>

      {(topComplaints?.length > 0 || topDiagnoses?.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {topComplaints?.length > 0 && (
            <div className="rounded-xl border border-ink-100 p-3.5 bg-white">
              <p className="text-xs font-semibold text-ink-600 uppercase tracking-wider mb-2">
                Top complaints
              </p>
              <ul className="space-y-1.5">
                {topComplaints.slice(0, 5).map(([label, count], i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink-700">{i + 1}. {label}</span>
                    <span className="text-ink-500 text-xs">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topDiagnoses?.length > 0 && (
            <div className="rounded-xl border border-ink-100 p-3.5 bg-white">
              <p className="text-xs font-semibold text-ink-600 uppercase tracking-wider mb-2">
                Top diagnoses
              </p>
              <ul className="space-y-1.5">
                {topDiagnoses.slice(0, 5).map(([label, count], i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink-700">{i + 1}. {label}</span>
                    <span className="text-ink-500 text-xs">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {followUpAlerts?.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3.5">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Icon.Bell width={14} height={14} /> Follow-up alerts ({followUpAlerts.length})
          </p>
          <ul className="space-y-1.5">
            {followUpAlerts.map((a, i) => (
              <li key={i} className="text-sm text-ink-800">
                Patient #{a.patient_id}: {a.instruction}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
      const result = await aiService.generateReport(modal.date, modal.type);
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

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar
        title="Reports"
        subtitle="AI-generated clinic summaries with analytics."
        onMenuClick={onOpenMenu}
        right={
          <Button
            onClick={() => {
              setModal({ open: true, date: todayISO(), type: 'daily' });
              setGenerated(null);
            }}
          >
            <Icon.Sparkle width={16} height={16} /> Generate report
          </Button>
        }
      />

      <div className="flex-1 p-4 md:p-8 max-w-5xl w-full mx-auto">
        <Card padding="p-0" className="overflow-hidden">
          {loading ? (
            <PageLoader />
          ) : reports.length === 0 ? (
            <EmptyState
              icon={<Icon.Report width={36} height={36} />}
              title="No reports yet"
              description="Generate a report to get an analytical summary of clinic activity."
              action={
                <Button
                  onClick={() => {
                    setModal({ open: true, date: todayISO(), type: 'daily' });
                    setGenerated(null);
                  }}
                >
                  <Icon.Sparkle width={16} height={16} /> Generate your first report
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="p-5 flex items-center gap-4 hover:bg-ink-50/60 cursor-pointer transition-colors"
                  onClick={() => openReport(r)}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 inline-flex items-center justify-center flex-shrink-0">
                    <Icon.Report />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-900">
                      Report for {formatDate(r.report_date)}
                    </p>
                    <p className="text-xs text-ink-500 capitalize">
                      {r.report_type} · {r.total_patients || 0} patient
                      {r.total_patients === 1 ? '' : 's'}
                      {r.metrics?.totalAppointments !== undefined &&
                        ` · ${r.metrics.totalAppointments} appt${r.metrics.totalAppointments === 1 ? '' : 's'}`}
                      {' · generated '}{formatDate(r.created_at)}
                    </p>
                  </div>
                  <Icon.Chevron className="text-ink-400" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Generate modal */}
      <Modal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title="Generate AI report"
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
              <Icon.Sparkle width={16} height={16} /> Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
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
            </select>
          </div>
          <Input
            type="date"
            label={modal.type === 'weekly' ? 'Week ending date' : 'Report date'}
            value={modal.date}
            onChange={(e) => setModal((m) => ({ ...m, date: e.target.value }))}
          />
          {generated && (
            <>
              <ReportMetrics metrics={generated.metrics} />
              <div className="rounded-xl bg-sand p-4 text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                {generated.report}
              </div>
            </>
          )}
          {generating && (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <Spinner size="sm" /> Analyzing clinic data…
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
              <Icon.Report width={16} height={16} /> Print / Save as PDF
            </Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-4">
            <p className="text-xs text-ink-500">
              {viewing.report_type} report · {viewing.total_patients || 0} patient
              {viewing.total_patients === 1 ? '' : 's'} · generated{' '}
              {formatDate(viewing.created_at)}
            </p>

            <ReportMetrics metrics={viewing.metrics} />

            <div className="rounded-xl bg-sand p-4 text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
              {viewing.ai_generated_text}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

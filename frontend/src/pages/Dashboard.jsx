import { useState, useEffect, useRef } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Card, CardHeader } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { RoleBadge } from '../components/UI/Badge';
import { Spinner, PageLoader } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { Input } from '../components/UI/Input';
import { patientService } from '../services/patientService';
import { consultationService } from '../services/consultationService';
import { pregnancyService } from '../services/pregnancyService';
import { reportService } from '../services/reportService';
import { consultationTransactionService } from '../services/consultationTransactionService';
import { queueService } from '../services/queueService';
import { apiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ReportDocument } from '../components/ReportDocument';

function StatCard({ icon, label, value, hint, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-50 text-primary-600',
    info: 'bg-sky-50 text-sky-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600'
  };
  return (
    <Card hover className="relative overflow-hidden">
      <div
        className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-50 ${tones[tone]}`}
      />
      <div
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl inline-flex items-center justify-center mb-2.5 sm:mb-4 ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="relative text-xs sm:text-sm text-ink-500 font-medium leading-snug">{label}</p>
      <p className="relative text-2xl sm:text-3xl font-display font-bold text-ink-900 mt-0.5 sm:mt-1">{value}</p>
      {hint && <p className="text-xs text-ink-500 mt-1">{hint}</p>}
    </Card>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function Dashboard() {
  useOutletContext();
  const { user } = useAuth();
  const toast = useToast();

  const [stats, setStats] = useState({
    patients: 0,
    todayConsultations: 0,
    transactions: 0,
    reports: 0
  });
  const [todayConsults, setTodayConsults] = useState([]);
  const [activePatients, setActivePatients] = useState([]);
  const [recentConsultations, setRecentConsultations] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const carouselRef = useRef(null);

  const [reportModal, setReportModal] = useState({ open: false, date: todayISO() });
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [quickDischargeOpen, setQuickDischargeOpen] = useState(false);
  const [quickSaving, setQuickSaving] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [patientsRes, reports, active, todayRes, recent, transactions, queueRes] = await Promise.all([
        patientService.list('', { page: 1, limit: 50 }),
        reportService.list(),
        patientService.active().catch(() => []),
        consultationService.today().catch(() => ({ count: 0 })),
        consultationService.recent(8).catch(() => []),
        consultationTransactionService.listAll().catch(() => []),
        queueService.listToday().catch(() => [])
      ]);

      const patientTotal = patientsRes.total ?? patientsRes.data?.length ?? 0;
      const todayCount = todayRes?.count || 0;

      setStats({
        patients: patientTotal,
        todayConsultations: todayCount,
        transactions: transactions.length,
        reports: reports.length
      });
      setActivePatients(active);
      setTodayConsults([]);
      setRecentConsultations(recent);
      setQueue(queueRes || []);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load dashboard'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generateReport() {
    setGenerating(true);
    setGenerated(null);
    try {
      const result = await reportService.generate(reportModal.date);
      setGenerated(result);
      toast.success('Report generated');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Report generation failed'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleQuickDischarge(patientId, pregnancyId, status) {
    setQuickSaving(pregnancyId);
    try {
      await pregnancyService.update(patientId, pregnancyId, { status });
      toast.success(`Status updated to ${status}`);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not update status'));
    } finally {
      setQuickSaving(null);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
        <div className="max-w-7xl w-full mx-auto px-4 md:px-8 pt-4 md:pt-6 space-y-4 sm:space-y-5">
          {loading ? (
            <PageLoader label="Loading dashboard…" />
          ) : (
            <>
              {/* Profile banner */}
              <div className="bg-white rounded-lg border border-ink-200 px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
                <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-primary-700 text-white flex items-center justify-center text-lg sm:text-xl font-bold font-display flex-shrink-0">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg md:text-xl font-display font-bold text-ink-900 uppercase tracking-wide truncate">
                    {user?.name || 'Staff'}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <RoleBadge role={user?.role} />
                    <span className="text-sm text-ink-500">
                      Good {greet()} — here's what's happening at JLMC today.
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              <Link to="/patients" className="block cursor-pointer">
                <StatCard
                  icon={<Icon.Users />}
                  label="Total patients"
                  value={stats.patients}
                  tone="primary"
                />
              </Link>
              <Link to="/consultations" className="block cursor-pointer">
                <StatCard
                  icon={<Icon.Stethoscope />}
                  label="Today's consultations"
                  value={stats.todayConsultations}
                  tone="info"
                />
              </Link>
              <Link to="/consultation-transactions" className="block cursor-pointer">
                <StatCard
                  icon={<Icon.Receipt />}
                  label="Total transactions"
                  value={stats.transactions}
                  tone="success"
                />
              </Link>
              <Link to="/reports" className="block cursor-pointer">
                <StatCard
                  icon={<Icon.Report />}
                  label="Reports generated"
                  value={stats.reports}
                  tone="warning"
                />
              </Link>
            </div>

            {/* Quick actions + Today's queue — visible immediately */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Quick actions */}
              <Card>
                <CardHeader
                  title="Quick actions"
                  subtitle="Common workflows to get you started."
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Link to="/patients?action=add" className="block">
                    <div className="rounded-xl border border-ink-100 p-4 hover:border-primary-300 hover:bg-primary-50/40 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-600 inline-flex items-center justify-center mb-3">
                        <Icon.Plus />
                      </div>
                      <p className="font-medium text-ink-900">Add patient</p>
                      <p className="text-xs text-ink-500 mt-0.5">Register a new patient</p>
                    </div>
                  </Link>
                  <Link to="/patients?action=consult" className="block">
                    <div className="rounded-xl border border-ink-100 p-4 hover:border-primary-300 hover:bg-primary-50/40 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 inline-flex items-center justify-center mb-3">
                        <Icon.Stethoscope />
                      </div>
                      <p className="font-medium text-ink-900">New consultation</p>
                      <p className="text-xs text-ink-500 mt-0.5">Record a visit</p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setQuickDischargeOpen(true)}
                    className="block w-full text-left"
                  >
                    <div className="rounded-xl border border-ink-100 p-4 hover:border-primary-300 hover:bg-primary-50/40 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 inline-flex items-center justify-center mb-3">
                        <Icon.Clipboard />
                      </div>
                      <p className="font-medium text-ink-900">Quick discharge</p>
                      <p className="text-xs text-ink-500 mt-0.5">Update pregnancy status</p>
                    </div>
                  </button>
                </div>
              </Card>

              {/* Today's queue */}
              <div className="bg-white rounded-lg border border-ink-200 p-4">
                {(() => {
                  const activeQueue = queue.filter((q) => q.status === 'waiting' || q.status === 'serving');
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h2 className="text-sm font-semibold text-ink-800">Today's Queue</h2>
                          <p className="text-xs text-ink-500">
                            {activeQueue.filter((q) => q.status === 'waiting').length} waiting · {activeQueue.filter((q) => q.status === 'serving').length} serving
                          </p>
                        </div>
                        <Link to="/consultations" className="text-xs font-medium text-primary-700 hover:text-primary-800">
                          View all
                        </Link>
                      </div>
                      {activeQueue.length === 0 ? (
                        <div className="text-sm text-ink-500 py-6 text-center">
                          No patients in queue today.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activeQueue.slice(0, 5).map((q) => (
                            <Link
                              key={q.id}
                              to={`/patients/${q.patient_id}`}
                              className="flex items-center gap-3 p-2.5 rounded-lg border border-ink-100 hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
                            >
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                                q.status === 'serving'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-primary-100 text-primary-700'
                              }`}>
                                #{String(q.queue_number).padStart(2, '0')}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-ink-900 truncate">
                                  {q.first_name} {q.last_name}
                                </p>
                                <p className="text-xs text-ink-500 capitalize">{q.status}</p>
                              </div>
                              <span className="text-xs text-primary-600 font-medium whitespace-nowrap">
                                Serve →
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Recently accessed — consultations carousel */}
            <div className="bg-white rounded-lg border border-ink-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-ink-800">Recent consultations</h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => carouselRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
                    className="w-7 h-7 rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 inline-flex items-center justify-center"
                    aria-label="Scroll left"
                  >
                    <Icon.Chevron width={14} height={14} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => carouselRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
                    className="w-7 h-7 rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 inline-flex items-center justify-center"
                    aria-label="Scroll right"
                  >
                    <Icon.Chevron width={14} height={14} />
                  </button>
                </div>
              </div>
              {recentConsultations.length === 0 ? (
                <div className="text-sm text-ink-500 py-6 text-center">
                  No consultations recorded yet.
                </div>
              ) : (
                <div ref={carouselRef} className="flex gap-3 overflow-x-auto pb-1 scroll-smooth">
                  {recentConsultations.map((c, i) => (
                    <Link
                      key={c.id}
                      to={`/patients/${c.patient_id}`}
                      className="flex-shrink-0 w-56 rounded-lg border border-ink-200 overflow-hidden hover:border-primary-300 transition-colors"
                    >
                      <div className={BANNER_TONES[i % BANNER_TONES.length]} />
                      <div className="p-3">
                        <p className="text-[11px] text-ink-400">{formatDate(c.visit_date)}</p>
                        <p className="font-medium text-ink-900 text-sm truncate mt-0.5">
                          {c.patient_first_name} {c.patient_last_name}
                        </p>
                        <p className="text-xs text-ink-500 truncate mt-0.5">
                          {c.chief_complaint || 'Consultation visit'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Today's schedule — active patients grid */}
            <div className="bg-white rounded-lg border border-ink-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink-800">Today's schedule</h2>
                  <p className="text-xs text-ink-500">Patients currently active under care</p>
                </div>
                <Link to="/patients" className="text-xs font-medium text-primary-700 hover:text-primary-800">
                  View all
                </Link>
              </div>
              {activePatients.length === 0 ? (
                <div className="text-sm text-ink-500 py-6 text-center">
                  No active patients right now.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activePatients.slice(0, 6).map((p, i) => (
                    <Link
                      key={p.id}
                      to={`/patients/${p.id}`}
                      className="rounded-lg border border-ink-200 overflow-hidden hover:border-primary-300 transition-colors"
                    >
                      <div className={BANNER_TONES[(i + 1) % BANNER_TONES.length]} />
                      <div className="p-3">
                        <p className="font-medium text-ink-900 text-sm truncate">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-xs text-ink-500 truncate mt-0.5">
                          {p.trimester || '—'} · {p.weeks ? `${p.weeks} wks` : '—'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Daily report */}
            <Card className="flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 inline-flex items-center justify-center">
                  <Icon.FileText />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-500">Daily Report</p>
                  <p className="font-display text-lg font-bold text-ink-900">
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <p className="text-sm text-ink-600 flex-1">
                Summarize today's consultations into a structured report.
              </p>
              <Button
                onClick={() => {
                  setReportModal({ open: true, date: todayISO() });
                  setGenerated(null);
                }}
                className="mt-4 w-full"
                size="md"
              >
                <Icon.FileText width={16} height={16} />
                Generate report
              </Button>
            </Card>

          </>
        )}
        </div>
      </div>

      <Modal
        open={quickDischargeOpen}
        onClose={() => setQuickDischargeOpen(false)}
        title="Quick discharge"
        size="md"
      >
        {activePatients.length === 0 ? (
          <div className="text-sm text-ink-500 py-8 text-center">
            No active patients to discharge.
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {activePatients.map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-900 truncate">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="text-xs text-ink-500 truncate">
                    {p.trimester || '—'} · {p.weeks || '—'}
                  </p>
                </div>
                <select
                  value={p.pregnancy_status || p.status || 'Ongoing'}
                  onChange={(e) => handleQuickDischarge(p.id, p.pregnancy_id || p.id, e.target.value)}
                  disabled={quickSaving === (p.pregnancy_id || p.id)}
                  className="text-sm font-medium rounded-lg px-2 py-1 border outline-none focus:ring-2 focus:ring-primary-300 cursor-pointer appearance-none text-emerald-700 bg-emerald-50 border-emerald-200"
                >
                  <option value="Ongoing">Ongoing</option>
                  <option value="Completed">Completed</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={reportModal.open}
        onClose={() => setReportModal((m) => ({ ...m, open: false }))}
        title="Generate report"
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setReportModal((m) => ({ ...m, open: false }))}
            >
              Close
            </Button>
            <Button onClick={generateReport} loading={generating}>
              <Icon.FileText width={16} height={16} />
              Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!generated && !generating && (
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-600 inline-flex items-center justify-center">
                  <Icon.FileText width={18} height={18} />
                </div>
                <div>
                  <p className="font-medium text-ink-900 text-sm">Daily consultation report</p>
                  <p className="text-xs text-ink-500">Select a date to generate the report.</p>
                </div>
              </div>
            </div>
          )}
          <Input
            type="date"
            label="Report date"
            value={reportModal.date}
            onChange={(e) => setReportModal((m) => ({ ...m, date: e.target.value }))}
          />
          {generated && (
            <ReportDocument
              metrics={generated.metrics}
              date={reportModal.date}
              type="daily"
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
    </div>
  );
}

const BANNER_TONES = [
  'h-16 bg-primary-500',
  'h-16 bg-primary-700',
  'h-16 bg-emerald-600',
  'h-16 bg-sky-600'
];

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

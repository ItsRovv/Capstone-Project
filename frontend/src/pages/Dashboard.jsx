import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
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
import { aiService } from '../services/aiService';
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
        className={`w-10 h-10 rounded-xl inline-flex items-center justify-center mb-4 ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="text-sm text-ink-500 font-medium">{label}</p>
      <p className="text-3xl font-display font-bold text-ink-900 mt-1">{value}</p>
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
  const { onOpenMenu } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();

  const [stats, setStats] = useState({
    patients: 0,
    todayConsultations: 0,
    activePatients: 0,
    reports: 0
  });
  const [todayConsults, setTodayConsults] = useState([]);
  const [activePatients, setActivePatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [reportModal, setReportModal] = useState({ open: false, date: todayISO() });
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [quickDischargeOpen, setQuickDischargeOpen] = useState(false);
  const [quickSaving, setQuickSaving] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [patientsRes, reports, active] = await Promise.all([
        patientService.list('', { page: 1, limit: 50 }),
        reportService.list(),
        patientService.active().catch(() => [])
      ]);

      const patients = patientsRes.data || [];
      const patientTotal = patientsRes.total ?? patients.length;

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const today = todayISO();

      let weekCount = 0;
      let todayCount = 0;
      let todayList = [];
      try {
        const sample = patients.slice(0, 50);
        const lists = await Promise.all(
          sample.map((p) => consultationService.listForPatient(p.id).catch(() => []))
        );
        const allConsults = lists.flat();
        weekCount = allConsults.filter((c) => new Date(c.visit_date) >= weekAgo).length;
        todayList = allConsults.filter((c) => {
          const vd = new Date(c.visit_date).toISOString().split('T')[0];
          return vd === today;
        });
        todayCount = todayList.length;
      } catch {
        weekCount = 0;
        todayCount = 0;
      }

      setStats({
        patients: patientTotal,
        todayConsultations: todayCount,
        activePatients: active.length,
        reports: reports.length
      });
      setActivePatients(active);
      setTodayConsults(todayList.slice(0, 5));
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
      const result = await aiService.generateReport(reportModal.date);
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
    <div className="min-h-screen flex flex-col">
      <Topbar
        title={`Good ${greet()}, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle="Here's what's happening at JLMC today."
        onMenuClick={onOpenMenu}
      />

      <div className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {loading ? (
          <PageLoader label="Loading dashboard…" />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={<Icon.Users />}
                label="Total patients"
                value={stats.patients}
                tone="primary"
              />
              <StatCard
                icon={<Icon.Stethoscope />}
                label="Today's consultations"
                value={stats.todayConsultations}
                tone="info"
              />
              <StatCard
                icon={<Icon.Heart />}
                label="Active patients"
                value={stats.activePatients}
                tone="success"
              />
              <StatCard
                icon={<Icon.Report />}
                label="Reports generated"
                value={stats.reports}
                tone="warning"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Quick actions"
                  subtitle="Common workflows to get you started."
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Link to="/patients" className="block">
                    <div className="rounded-xl border border-ink-100 p-4 hover:border-primary-300 hover:bg-primary-50/40 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-600 inline-flex items-center justify-center mb-3">
                        <Icon.Plus />
                      </div>
                      <p className="font-medium text-ink-900">Add patient</p>
                      <p className="text-xs text-ink-500 mt-0.5">Register a new patient</p>
                    </div>
                  </Link>
                  <Link to="/consultations" className="block">
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

              <Card className="bg-gradient-to-br from-primary-500 to-primary-700 text-white border-0">
                <div className="flex items-center gap-2 mb-2">
                  <Icon.Sparkle className="text-primary-100" />
                  <p className="text-sm font-medium text-primary-50">AI Insights</p>
                </div>
                <h3 className="font-display text-xl font-bold">Generate today's report</h3>
                <p className="text-primary-50/90 text-sm mt-1.5">
                  Gemini will summarize today's consultations in plain language.
                </p>
                <Button
                  onClick={() => {
                    setReportModal({ open: true, date: todayISO() });
                    setGenerated(null);
                  }}
                  className="mt-4 !bg-white !text-primary-700 hover:!bg-primary-50"
                  size="md"
                >
                  <Icon.Sparkle width={16} height={16} />
                  Generate report
                </Button>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader
                  title="Active patients"
                  subtitle={`${activePatients.length} patient${activePatients.length === 1 ? '' : 's'} currently under care`}
                  action={
                    <Link to="/patients">
                      <Button variant="ghost" size="sm">
                        View all
                        <Icon.Chevron width={14} height={14} />
                      </Button>
                    </Link>
                  }
                />
                {activePatients.length === 0 ? (
                  <div className="text-sm text-ink-500 py-8 text-center">
                    No active patients currently in the clinic.
                  </div>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {activePatients.map((p) => (
                      <li key={p.id} className="py-3 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-ink-900 truncate">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="text-xs text-ink-500 truncate">
                            {p.trimester || '—'} · {p.weeks || '—'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Ongoing
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Consultations today"
                  subtitle={`${todayConsults.length} consultation${todayConsults.length === 1 ? '' : 's'} recorded`}
                  action={
                    <Link to="/consultations">
                      <Button variant="ghost" size="sm">
                        View all
                        <Icon.Chevron width={14} height={14} />
                      </Button>
                    </Link>
                  }
                />
                {todayConsults.length === 0 ? (
                  <div className="text-sm text-ink-500 py-8 text-center">
                    No consultations recorded for today.
                  </div>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {todayConsults.map((c) => (
                      <li key={c.id} className="py-3 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 inline-flex items-center justify-center">
                          <Icon.Stethoscope />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-ink-900 truncate">
                            {c.chief_complaint || 'Consultation'}
                          </p>
                          <p className="text-xs text-ink-500 truncate">
                            Patient #{c.patient_id}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-ink-800">
                            {formatTime(c.visit_date)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
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
        title="Generate AI report"
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
              <Icon.Sparkle width={16} height={16} />
              Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            type="date"
            label="Report date"
            value={reportModal.date}
            onChange={(e) => setReportModal((m) => ({ ...m, date: e.target.value }))}
          />
          {generated && (
            <ReportDocument
              report={generated.report}
              metrics={generated.metrics}
              date={reportModal.date}
              type="daily"
            />
          )}
          {generating && (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <Spinner size="sm" /> Generating with Gemini…
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

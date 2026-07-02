import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card, CardHeader } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { PageLoader, Spinner } from '../components/UI/Spinner';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { analyticsService } from '../services/analyticsService';
import { apiError } from '../services/api';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const CHART_COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function StatCard({ icon, label, value, hint, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-50 text-primary-600',
    info: 'bg-sky-50 text-sky-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600'
  };
  return (
    <Card hover className="relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-50 ${tones[tone]}`} />
      <div className={`w-10 h-10 rounded-xl inline-flex items-center justify-center mb-4 ${tones[tone]}`}>
        {icon}
      </div>
      <p className="text-sm text-ink-500 font-medium">{label}</p>
      <p className="text-3xl font-display font-bold text-ink-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-ink-500 mt-1">{hint}</p>}
    </Card>
  );
}

function ChartCard({ title, subtitle, children, height = 300 }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div style={{ width: '100%', height }}>
        {children}
      </div>
    </Card>
  );
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Analytics() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const [aiInsight, setAiInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightSource, setInsightSource] = useState(null);

  const [ollamaStatus, setOllamaStatus] = useState(null);

  const loadOverview = useCallback(async (selectedDays = days) => {
    setLoading(true);
    try {
      const result = await analyticsService.getOverview(selectedDays);
      setData(result);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load analytics'));
    } finally {
      setLoading(false);
    }
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInsight = useCallback(async (selectedDays = days) => {
    setInsightLoading(true);
    try {
      const result = await analyticsService.getAiInsight(selectedDays);
      setAiInsight(result.insight);
      setInsightSource(result.source);
    } catch (err) {
      toast.error(apiError(err, 'Failed to generate AI insight'));
    } finally {
      setInsightLoading(false);
    }
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOllamaStatus = useCallback(async () => {
    try {
      const result = await analyticsService.getOllamaStatus();
      setOllamaStatus(result);
    } catch {
      setOllamaStatus({ available: false, model: 'unknown', error: 'Unable to check' });
    }
  }, []);

  // Load overview + ollama status only when `days` changes
  useEffect(() => {
    loadOverview(days);
    loadOllamaStatus();
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load AI insight only when overview data arrives and no insight yet
  useEffect(() => {
    if (data && !aiInsight) {
      loadInsight(days);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data?.summary || {};
  const charts = data?.charts || {};
  const trend = data?.trend || {};

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Analytics Dashboard"
        subtitle="Clinic trends, patient insights, and AI-powered observations."
        onMenuClick={onOpenMenu}
        right={
          <div className="flex items-center gap-2">
            <select
              className="input-base text-sm w-auto"
              value={days}
              onChange={(e) => {
                setDays(parseInt(e.target.value));
                setAiInsight(null);
              }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                loadOverview(days);
                setAiInsight(null);
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {loading ? (
          <PageLoader label="Loading analytics…" />
        ) : (
          <>
            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={<Icon.Users />}
                label="Total patients"
                value={summary.totalPatients || 0}
                tone="primary"
              />
              <StatCard
                icon={<Icon.Stethoscope />}
                label={`Consultations (${days}d)`}
                value={summary.totalConsultations || 0}
                hint={trend.change !== 0 ? `${trend.change > 0 ? '↑' : '↓'} ${Math.abs(trend.change)}% vs prev` : 'No trend data'}
                tone="info"
              />
              <StatCard
                icon={<Icon.Heart />}
                label="Active pregnancies"
                value={summary.activePregnancies || 0}
                hint={`${summary.deliveriesThisMonth || 0} deliveries this month`}
                tone="success"
              />
              <StatCard
                icon={<Icon.Trending />}
                label="Today's consultations"
                value={summary.todayConsultations || 0}
                tone="warning"
              />
            </div>

            {/* ── AI Insights Panel ── */}
            <Card className="bg-gradient-to-br from-primary-500 to-primary-700 text-white border-0">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 inline-flex items-center justify-center flex-shrink-0">
                  <Icon.Sparkle className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-primary-50">AI-Generated Insight</p>
                    {insightSource && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        insightSource === 'ollama'
                          ? 'bg-emerald-400/30 text-emerald-100'
                          : 'bg-white/20 text-primary-50'
                      }`}>
                        {insightSource === 'ollama' ? 'Local LLM (Ollama)' : 'Rule-based fallback'}
                      </span>
                    )}
                  </div>
                  {insightLoading ? (
                    <div className="flex items-center gap-2 text-sm text-primary-50">
                      <Spinner size="sm" /> Analyzing clinic data…
                    </div>
                  ) : aiInsight ? (
                    <p className="text-sm text-primary-50/95 leading-relaxed">{aiInsight}</p>
                  ) : (
                    <p className="text-sm text-primary-50/70">Click generate to get an AI insight.</p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      onClick={loadInsight}
                      loading={insightLoading}
                      className="!bg-white/20 !text-white hover:!bg-white/30 !border-0"
                      size="sm"
                    >
                      <Icon.Sparkle width={14} height={14} /> Regenerate insight
                    </Button>
                    {ollamaStatus && (
                      <span className="text-xs text-primary-50/70">
                        Ollama: {ollamaStatus.available ? '✓ Connected' : '✗ Offline'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Charts Row 1: Daily Volume + Visit Types ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <ChartCard
                  title="Consultation volume"
                  subtitle={`Daily consultations over the last ${days} days`}
                  height={300}
                >
                  {charts.dailyVolume && charts.dailyVolume.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.dailyVolume} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDateShort}
                          tick={{ fontSize: 11, fill: '#6b7280' }}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                        <Tooltip
                          labelFormatter={(v) => formatDateShort(v)}
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                        />
                        <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} name="Consultations" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-ink-500">
                      No consultation data for this period.
                    </div>
                  )}
                </ChartCard>
              </div>

              <ChartCard
                title="Visit types"
                subtitle="Distribution of consultation types"
                height={300}
              >
                {charts.visitTypes && charts.visitTypes.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts.visitTypes}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={40}
                        paddingAngle={2}
                      >
                        {charts.visitTypes.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-ink-500">
                    No visit type data.
                  </div>
                )}
              </ChartCard>
            </div>

            {/* ── Charts Row 2: Top Complaints + Top Diagnoses ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard
                title="Top complaints"
                subtitle="Most frequently reported chief complaints"
                height={280}
              >
                {charts.topComplaints && charts.topComplaints.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={charts.topComplaints}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        width={120}
                      />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Cases" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-ink-500">
                    No complaint data recorded.
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Top diagnoses"
                subtitle="Most frequently assigned diagnoses"
                height={280}
              >
                {charts.topDiagnoses && charts.topDiagnoses.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={charts.topDiagnoses}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        width={120}
                      />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Cases" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-ink-500">
                    No diagnosis data recorded.
                  </div>
                )}
              </ChartCard>
            </div>

            {/* ── Charts Row 3: Pregnancy Status + New vs Returning ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard
                title="Pregnancy status"
                subtitle="Current status of all tracked pregnancies"
                height={280}
              >
                {charts.pregnancyStatus && charts.pregnancyStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts.pregnancyStatus}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {charts.pregnancyStatus.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-ink-500">
                    No pregnancy data available.
                  </div>
                )}
              </ChartCard>

              <Card>
                <CardHeader
                  title="Patient mix"
                  subtitle="New vs returning patients this period"
                />
                <div className="space-y-4 mt-2">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-sky-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-600 inline-flex items-center justify-center">
                        <Icon.Users width={18} height={18} />
                      </div>
                      <div>
                        <p className="font-medium text-ink-900">New patients</p>
                        <p className="text-xs text-ink-500">First visit in this period</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-sky-600">{summary.newPatients || 0}</p>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 inline-flex items-center justify-center">
                        <Icon.Trending width={18} height={18} />
                      </div>
                      <div>
                        <p className="font-medium text-ink-900">Returning patients</p>
                        <p className="text-xs text-ink-500">Visited before this period</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600">{summary.returningPatients || 0}</p>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-primary-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 text-primary-600 inline-flex items-center justify-center">
                        <Icon.Heart width={18} height={18} />
                      </div>
                      <div>
                        <p className="font-medium text-ink-900">Deliveries this month</p>
                        <p className="text-xs text-ink-500">Completed pregnancies</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-primary-600">{summary.deliveriesThisMonth || 0}</p>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

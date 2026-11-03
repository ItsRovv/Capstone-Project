import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Input, Select } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { PageLoader } from '../components/UI/Spinner';
import { useToast } from '../components/UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { admissionService } from '../services/admissionService';
import api, { apiError } from '../services/api';

const TABS = [
  { key: 'expected-deliveries', label: 'Expected deliveries in JLMC', help: 'Patients due soon or overdue who plan to deliver at JLMC, from the tracking form and patient profiles.', unit: 'days ahead', fallback: 30 },
  { key: 'missed-followups', label: 'Missed follow-ups', help: 'Postpartum follow-ups from Admission and Discharge that are past their due date and not marked done.', unit: 'days back', fallback: 30 },
  { key: 'charting-activity', label: 'Charting activity', help: 'Midwife notes across all admissions, with author and timestamp.', unit: '', fallback: null }
];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const dt = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function toIso(d) {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getFullYear(), x.getMonth(), x.getDate()).toISOString().split('T')[0];
}
function isoDateParts(v) {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function monthStart(d) {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getFullYear(), x.getMonth(), 1).toISOString().split('T')[0];
}
function monthEnd(d) {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getFullYear(), x.getMonth() + 1, 0).toISOString().split('T')[0];
}
function weekRange(d) {
  const x = d ? new Date(d) : new Date();
  const dayOfWeek = x.getDay();
  const start = new Date(x.getFullYear(), x.getMonth(), x.getDate() - dayOfWeek);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] };
}
function lastMonths(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}` };
  });
}

export function Monitoring() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const visibleTabs = useMemo(() => TABS.filter((t) => t.key !== 'charting-activity' || isAdmin), [isAdmin]);

  const [tab, setTab] = useState(visibleTabs[0]);
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState('month'); // day | week | month
  const [dayValue, setDayValue] = useState(toIso());
  const [weekValue, setWeekValue] = useState(toIso());
  const [monthValue, setMonthValue] = useState(lastMonths()[0].value);
  const [rows, setRows] = useState(null);
  const [viewing, setViewing] = useState(null);

  const range = useMemo(() => {
    if (mode === 'all') return {};
    if (mode === 'day') return { from: dayValue, to: dayValue };
    if (mode === 'week') return weekRange(weekValue);
    const [y, m] = monthValue.split('-').map(Number);
    return { from: monthStart(new Date(y, m - 1, 1)), to: monthEnd(new Date(y, m - 1, 1)) };
  }, [mode, dayValue, weekValue, monthValue]);

  const load = useCallback(async () => {
    setRows(null);
    try {
      if (tab.key === 'charting-activity') {
        const data = await admissionService.chartingActivity(range);
        setRows(data.rows);
      } else {
        const { data } = await api.get(`/monitoring/${tab.key}`, { params: { days } });
        setRows(data.rows);
      }
    } catch (err) {
      toast.error(apiError(err, 'Could not load this list'));
      setRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.key, days, range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="h-full flex flex-col">
      <Topbar title="Monitoring" onMenuClick={onOpenMenu} />
      <div className="flex-1 overflow-y-auto pt-3 md:pt-6 pb-6 md:pb-10">
        <div className="w-full px-4 md:px-8 space-y-4">
          <div className="flex gap-1 border-b border-ink-100">
            {visibleTabs.map((t) => (
              <button
                key={t.key} type="button" onClick={() => { setTab(t); setDays(t.fallback); }}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab.key === t.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm text-ink-600 max-w-xl">{tab.help}</p>
              {tab.key === 'charting-activity' ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex bg-ink-100 rounded-lg p-1">
                    {['day', 'week', 'month', 'all'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`px-3 py-1 text-sm font-medium rounded-md capitalize transition-colors ${mode === m ? 'bg-white text-primary-700 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {mode === 'day' && <div className="w-44"><Input label="Date" type="date" value={dayValue} onChange={(e) => setDayValue(e.target.value)} /></div>}
                  {mode === 'week' && <div className="w-44"><Input label="Week of" type="date" value={weekValue} onChange={(e) => setWeekValue(e.target.value)} /></div>}
                  {mode === 'month' && (
                    <div className="w-44">
                      <Select label="Month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)}>
                        {lastMonths().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </Select>
                    </div>
                  )}
                  {mode === 'all' && <p className="text-sm text-ink-500 self-center">Showing all charting records.</p>}
                </div>
              ) : (
                <div className="w-44"><Input label={`Window (${tab.unit})`} inputMode="numeric" value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1)))} /></div>
              )}
            </div>
            {tab.key !== 'charting-activity' && <p className="text-xs text-ink-500 mt-2">Default window is 30 days, to be confirmed by the clinic.</p>}
          </Card>
          {!rows ? <PageLoader /> : rows.length === 0 ? (
            <Card><p className="text-sm text-ink-500 text-center py-6">Nothing in this list.</p></Card>
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto">
                {tab.key === 'charting-activity' ? (
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-2.5">Date / Time</th>
                        <th className="text-left px-4 py-2.5">Patient</th>
                        <th className="text-left px-4 py-2.5">Author</th>
                        <th className="text-left px-4 py-2.5">Note</th>
                        <th className="text-right px-4 py-2.5 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2.5 whitespace-nowrap">{dt(r.noted_at)}</td>
                          <td className="px-4 py-2.5">
                            <Link className="font-medium text-primary-700 hover:underline" to={`/patients/${r.patient_id}`}>{r.first_name} {r.last_name}</Link>
                            <p className="text-xs text-ink-500">Admission #{r.admission_id}</p>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{r.author_name || '—'}<p className="text-xs text-ink-500 capitalize">{r.author_role || '—'}</p></td>
                          <td className="px-4 py-2.5 text-ink-700 max-w-md whitespace-pre-wrap">{r.description || '—'}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <Button variant="secondary" size="sm" onClick={() => setViewing(r)}>
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : tab.key === 'missed-followups' ? (
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-2.5">Patient</th>
                        <th className="text-left px-4 py-2.5">Contact</th>
                        <th className="text-left px-4 py-2.5">Admission</th>
                        <th className="text-left px-4 py-2.5">Follow-up due</th>
                        <th className="text-left px-4 py-2.5">Overdue by</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {rows.map((r) => (
                        <tr key={r.followup_id}>
                          <td className="px-4 py-2.5"><Link className="font-medium text-primary-700 hover:underline" to={`/patients/${r.patient_id}`}>{r.first_name} {r.last_name}</Link></td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{r.contact_number || '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap"><Link className="text-primary-700 hover:underline" to={`/admissions/${r.admission_id}`}>#{r.admission_id}</Link></td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{dt(r.due_at)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{r.days_overdue > 0 ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">{r.days_overdue} day{r.days_overdue === 1 ? '' : 's'}</span> : 'Today'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-2.5">Patient</th>
                        <th className="text-left px-4 py-2.5">Contact</th>
                        <th className="text-left px-4 py-2.5">EDD</th>
                        <th className="text-left px-4 py-2.5">Age of gestation</th>
                        <th className="text-left px-4 py-2.5">Last consultation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {rows.map((r) => (
                        <tr key={`${r.patient_id}-${r.pregnancy_id || ''}`}>
                          <td className="px-4 py-2.5"><Link className="font-medium text-primary-700 hover:underline" to={`/patients/${r.patient_id}`}>{r.first_name} {r.last_name}</Link></td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{r.contact_number || '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{day(r.edd)}{r.overdue && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">Overdue</span>}</td>
                          <td className="px-4 py-2.5">{r.weeks || '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{day(r.last_consultation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Charting note" size="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Patient</p>
                <Link className="font-medium text-primary-700 hover:underline" to={`/patients/${viewing.patient_id}`}>
                  {viewing.first_name} {viewing.last_name}
                </Link>
                <p className="text-xs text-ink-500">Admission #{viewing.admission_id}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Written by</p>
                <p className="font-medium text-ink-900">{viewing.author_name || '—'}</p>
                <p className="text-xs text-ink-500 capitalize">{viewing.author_role || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Date & time</p>
                <p className="font-medium text-ink-900">{dt(viewing.noted_at)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1">Note</p>
              <div className="rounded-lg border border-ink-200 bg-ink-50/50 px-4 py-3 text-sm text-ink-800 whitespace-pre-wrap">
                {viewing.description || '—'}
              </div>
            </div>
            {viewing.corrected_by && (
              <p className="text-xs text-ink-500">Corrected by {viewing.corrected_by_name || viewing.corrected_by} {viewing.corrected_at ? `on ${dt(viewing.corrected_at)}` : ''}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Input } from '../components/UI/Input';
import { PageLoader } from '../components/UI/Spinner';
import { useToast } from '../components/UI/Toast';
import api, { apiError } from '../services/api';

const TABS = [
  { key: 'expected-deliveries', label: 'Expected deliveries', help: 'Patients due soon or overdue. Replaces the clinic spreadsheet.', unit: 'days ahead', fallback: 30 },
  { key: 'missed-followups', label: 'Missed follow-ups', help: 'Patients with an ongoing pregnancy who have not been seen for a while.', unit: 'days since last visit', fallback: 30 }
];

const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const plans = (v) => (!v ? '—' : v === 'jlmc' ? 'Yes, at JLMC' : 'Elsewhere');

export function Monitoring() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const [tab, setTab] = useState(TABS[0]);
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const { data } = await api.get(`/monitoring/${tab.key}`, { params: { days } });
      setRows(data.rows);
    } catch (err) {
      toast.error(apiError(err, 'Could not load this list'));
      setRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.key, days]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="h-full flex flex-col">
      <Topbar title="Monitoring" subtitle="Who is due to deliver and who has stopped coming. Read-only." onMenuClick={onOpenMenu} />
      <div className="flex-1 overflow-y-auto pt-3 md:pt-6 pb-6 md:pb-10">
        <div className="max-w-5xl w-full mx-auto px-4 md:px-8 space-y-4">
          <div className="flex gap-1 border-b border-ink-100">
            {TABS.map((t) => (
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
              <div className="w-44"><Input label={`Window (${tab.unit})`} inputMode="numeric" value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1)))} /></div>
            </div>
            <p className="text-xs text-ink-500 mt-2">Default window is 30 days, to be confirmed by the clinic.</p>
          </Card>
          {!rows ? <PageLoader /> : rows.length === 0 ? (
            <Card><p className="text-sm text-ink-500 text-center py-6">No patients in this list.</p></Card>
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-2.5">Patient</th>
                      <th className="text-left px-4 py-2.5">Contact</th>
                      <th className="text-left px-4 py-2.5">EDD</th>
                      <th className="text-left px-4 py-2.5">Age of gestation</th>
                      <th className="text-left px-4 py-2.5">Last consultation</th>
                      {tab.key === 'expected-deliveries' && <th className="text-left px-4 py-2.5">Delivering at JLMC</th>}
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
                        {tab.key === 'expected-deliveries' && <td className="px-4 py-2.5">{plans(r.delivery_location)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

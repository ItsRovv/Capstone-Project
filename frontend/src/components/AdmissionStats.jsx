import { useState } from 'react';
import { Card } from './UI/Card';
import { Button } from './UI/Button';
import { Input, Select } from './UI/Input';
import { useToast } from './UI/Toast';
import api, { apiError } from '../services/api';

const iso = (d) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);

function range(kind) {
  const now = new Date();
  const end = iso(now);
  if (kind === 'daily') return { from: end, to: end };
  if (kind === 'weekly') return { from: iso(new Date(now.getTime() - 6 * 86400000)), to: end };
  if (kind === 'monthly') return { from: `${end.slice(0, 7)}-01`, to: end };
  const q = Math.floor(now.getMonth() / 3) * 3;
  return { from: iso(new Date(now.getFullYear(), q, 1, 12)), to: end };
}

const ROWS = [
  ['admissions', 'Admissions'], ['discharges', 'Discharges'], ['referrals', 'Referrals'],
  ['averageStayHours', 'Average stay (hours)'], ['deliveries', 'Deliveries'], ['liveBirths', 'Live births'],
  ['stillbirths', 'Stillbirths'], ['newbornScreenings', 'Newborn screenings done']
];

// The counts the clinic used to tally by hand, for a day, week, month or trimester.
export function AdmissionStats() {
  const toast = useToast();
  const [kind, setKind] = useState('monthly');
  const [dates, setDates] = useState(range('monthly'));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(next = dates) {
    setBusy(true);
    try {
      setData((await api.get('/admissions/reports/summary', { params: next })).data);
    } catch (err) {
      toast.error(apiError(err, 'Could not load the statistics'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 print:hidden">
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Admission and discharge statistics</h3>
      <p className="text-sm text-ink-500 mb-3">Counts from the admission records. Choose a period or set your own dates.</p>
      <div className="grid sm:grid-cols-[10rem_1fr_1fr_auto] gap-3 items-end">
        <Select label="Period" value={kind} onChange={(e) => { setKind(e.target.value); if (e.target.value !== 'custom') setDates(range(e.target.value)); }}>
          <option value="daily">Today</option>
          <option value="weekly">Last 7 days</option>
          <option value="monthly">This month</option>
          <option value="trimester">This quarter</option>
          <option value="custom">Custom dates</option>
        </Select>
        <Input label="From" type="date" value={dates.from} onChange={(e) => { setKind('custom'); setDates((d) => ({ ...d, from: e.target.value })); }} />
        <Input label="To" type="date" value={dates.to} onChange={(e) => { setKind('custom'); setDates((d) => ({ ...d, to: e.target.value })); }} />
        <Button onClick={() => run()} loading={busy}>Show</Button>
      </div>
      {data && (
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ROWS.map(([key, label]) => (
            <div key={key} className="rounded-lg border border-ink-200 px-3 py-2">
              <dt className="text-xs text-ink-500">{label}</dt>
              <dd className="text-lg font-bold text-ink-900">{data[key] === null || data[key] === undefined ? '—' : data[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

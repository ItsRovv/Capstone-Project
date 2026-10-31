import { useCallback, useEffect, useState } from 'react';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { Spinner } from '../UI/Spinner';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDay } from '../../lib/admission';

const EMPTY = { bp_systolic: '', bp_diastolic: '', pulse: '', resp_rate: '', temperature: '', spo2: '', fetal_heart_rate: '' };

const LEVEL_META = {
  normal: { label: 'All signs normal', box: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  watch: { label: 'Watch closely: check again soon', box: 'border-amber-300 bg-amber-50 text-amber-900' },
  urgent: { label: 'Tell the doctor now: consider referral', box: 'border-red-300 bg-red-50 text-red-900' }
};

const CELL = { 0: '', 1: 'bg-amber-100 text-amber-900 font-semibold', 2: 'bg-red-100 text-red-800 font-semibold' };

const timeOf = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const show = (v) => (v === null || v === undefined || v === '' ? '—' : v);

function Cell({ value, points = 0, children }) {
  return <td className={`px-3 py-2.5 text-center whitespace-nowrap ${CELL[points] || ''}`}>{children ?? show(value)}</td>;
}

export function StepVitals({ admission, canEdit }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const load = useCallback(async () => {
    try {
      setRows(await admissionService.vitals(admission.id));
    } catch (err) {
      toast.error(apiError(err, 'Could not load the vital signs'));
      setRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => [k, Number(v)]));
    setSaving(true);
    try {
      const res = await admissionService.addVitals(admission.id, payload);
      setForm(EMPTY);
      toast[res.score?.level === 'urgent' ? 'error' : 'success'](
        res.score?.level === 'urgent' ? 'Saved. One or more signs need attention now.' : 'Vital signs saved'
      );
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save the vital signs'));
    } finally {
      setSaving(false);
    }
  }

  const latest = rows?.length ? rows[rows.length - 1] : null;
  const level = latest ? LEVEL_META[latest.score.level] : null;
  const hasInput = Object.values(form).some((v) => String(v).trim() !== '');

  return (
    <Card>
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Vital signs</h3>
      <p className="text-sm text-ink-500 mb-4">
        Add a reading each time vitals are taken. The time and your name are added automatically. Colours follow the
        maternity early warning chart: yellow means watch, red means act.
      </p>

      {latest && (
        <div className={`rounded-lg border px-3.5 py-2.5 text-sm mb-4 ${level.box}`}>
          <p className="font-semibold">{level.label}</p>
          <p className="text-xs opacity-80">
            Last reading {formatDay(latest.recorded_at)} at {timeOf(latest.recorded_at)}
            {latest.score.fetalAlert ? ' · baby\'s heartbeat is outside 110-160' : ''}
          </p>
        </div>
      )}

      {canEdit && (
        <div className="mb-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="BP top (systolic)" inputMode="numeric" placeholder="110" value={form.bp_systolic} onChange={set('bp_systolic')} />
            <Input label="BP bottom (diastolic)" inputMode="numeric" placeholder="70" value={form.bp_diastolic} onChange={set('bp_diastolic')} />
            <Input label="Pulse (per min)" inputMode="numeric" value={form.pulse} onChange={set('pulse')} />
            <Input label="Breathing (per min)" inputMode="numeric" value={form.resp_rate} onChange={set('resp_rate')} />
            <Input label="Temperature (°C)" inputMode="decimal" value={form.temperature} onChange={set('temperature')} />
            <Input label="Oxygen (SpO2 %)" inputMode="numeric" value={form.spo2} onChange={set('spo2')} />
            <Input label="Baby's heartbeat (per min)" inputMode="numeric" value={form.fetal_heart_rate} onChange={set('fetal_heart_rate')} />
          </div>
          <div className="flex justify-end">
            <Button onClick={save} loading={saving} disabled={!hasInput}>Add reading</Button>
          </div>
        </div>
      )}

      {!rows ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500 py-4 text-center">No vital signs recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">When</th>
                <th className="px-3 py-2.5 font-semibold">BP</th>
                <th className="px-3 py-2.5 font-semibold">Pulse</th>
                <th className="px-3 py-2.5 font-semibold">Breathing</th>
                <th className="px-3 py-2.5 font-semibold">Temp</th>
                <th className="px-3 py-2.5 font-semibold">SpO2</th>
                <th className="px-3 py-2.5 font-semibold">Baby</th>
                <th className="text-left px-3 py-2.5 font-semibold">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {[...rows].reverse().map((r) => {
                const s = r.score.signs;
                const bpPoints = Math.max(s.bp_systolic ?? 0, s.bp_diastolic ?? 0);
                const bp = r.bp_systolic || r.bp_diastolic ? `${show(r.bp_systolic)}/${show(r.bp_diastolic)}` : '—';
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDay(r.recorded_at)} · {timeOf(r.recorded_at)}</td>
                    <Cell points={bpPoints}>{bp}</Cell>
                    <Cell value={r.pulse} points={s.pulse} />
                    <Cell value={r.resp_rate} points={s.resp_rate} />
                    <Cell value={r.temperature} points={s.temperature} />
                    <Cell value={r.spo2} points={s.spo2} />
                    <Cell value={r.fetal_heart_rate} points={r.score.fetalAlert ? 2 : 0} />
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-600">{r.recorded_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

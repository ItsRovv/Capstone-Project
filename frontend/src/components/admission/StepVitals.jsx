import { useCallback, useEffect, useState } from 'react';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input, Select } from '../UI/Input';
import { Spinner } from '../UI/Spinner';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDay } from '../../lib/admission';

const EMPTY = { phase: 'admission', bp_systolic: '', bp_diastolic: '', pulse: '', resp_rate: '', temperature: '', spo2: '', bleeding: '', uterus: '', perineum: '' };
const NUMERIC = ['bp_systolic', 'bp_diastolic', 'pulse', 'resp_rate', 'temperature', 'spo2'];
const PHASES = { admission: 'Admission', labor: 'Labor', postpartum: 'Postpartum' };
const BLEEDING = { none: 'None', light: 'Light', moderate: 'Moderate', heavy: 'Heavy' };
// Default, to be confirmed by the clinic midwife/doctor (backend/config/clinicalThresholds.js).
const POSTPARTUM_EVERY_MIN = 15;
const POSTPARTUM_FOR_HOURS = 2;

const REQUIRED = [
  ['bp_systolic', 'BP top (systolic)'],
  ['bp_diastolic', 'BP bottom (diastolic)'],
  ['pulse', 'pulse'],
  ['resp_rate', 'breathing'],
  ['temperature', 'temperature']
];

const LEVEL_META = {
  incomplete: { label: 'Incomplete reading', box: 'border-ink-300 bg-ink-50 text-ink-800' },
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

export function StepVitals({ admission, canEdit, onRefer, deliveredAt }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [alertReasons, setAlertReasons] = useState([]);
  const [babyBeat, setBabyBeat] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const load = useCallback(async () => {
    try {
      setRows(await admissionService.vitals(admission.id));
      // Baby's heartbeat is recorded on the Labor chart; the latest value is shown here read-only.
      const labor = await admissionService.labor(admission.id).catch(() => []);
      const withBeat = labor.filter((l) => l.fetal_heart_rate);
      setBabyBeat(withBeat.length ? withBeat[withBeat.length - 1] : null);
    } catch (err) {
      toast.error(apiError(err, 'Could not load the vital signs'));
      setRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => [k, NUMERIC.includes(k) ? Number(v) : v]));
    if (form.phase !== 'postpartum') { delete payload.bleeding; delete payload.uterus; delete payload.perineum; }
    setSaving(true);
    try {
      const res = await admissionService.addVitals(admission.id, payload);
      setForm((f) => ({ ...EMPTY, phase: f.phase }));
      setAlertReasons(res.referralReasons || []);
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
  const hasInput = NUMERIC.some((k) => String(form[k]).trim() !== '');
  const sinceBirthMin = deliveredAt ? (Date.now() - new Date(deliveredAt).getTime()) / 60000 : null;
  const postpartumDue = form.phase === 'postpartum' && sinceBirthMin !== null && sinceBirthMin <= POSTPARTUM_FOR_HOURS * 60;
  const lastPostpartum = [...(rows || [])].reverse().find((r) => r.phase === 'postpartum');
  const minutesSincePostpartum = lastPostpartum ? (Date.now() - new Date(lastPostpartum.recorded_at).getTime()) / 60000 : null;
  const missingNow = REQUIRED.filter(([key]) => String(form[key]).trim() === '').map(([, label]) => label);

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
          {latest.score.level === 'incomplete' && (
            <p className="text-sm">{latest.score.missing.join(', ')} not recorded.</p>
          )}
          <p className="text-xs opacity-80">
            Last reading {formatDay(latest.recorded_at)} at {timeOf(latest.recorded_at)}
            {latest.score.fetalAlert ? ' · baby\'s heartbeat is outside 110-160' : ''}
          </p>
        </div>
      )}

      {alertReasons.length > 0 && (
        <div role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 mb-4 space-y-2">
          <p className="font-bold">Red reading: {alertReasons.join(', ')}</p>
          <p>Think about referral. Choose an action.</p>
          <div className="flex gap-2">
            {onRefer && <Button size="sm" variant="danger" onClick={() => onRefer(`Vitals: ${alertReasons.join(', ')}`)}>Create referral</Button>}
            <Button size="sm" variant="ghost" onClick={() => setAlertReasons([])}>Dismiss</Button>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="mb-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select label="This reading is for" value={form.phase} onChange={set('phase')}>
              {Object.entries(PHASES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Input label="BP top (systolic)" inputMode="numeric" placeholder="e.g. 110" value={form.bp_systolic} onChange={set('bp_systolic')} />
            <Input label="BP bottom (diastolic)" inputMode="numeric" placeholder="e.g. 70" value={form.bp_diastolic} onChange={set('bp_diastolic')} />
            <Input label="Pulse (per min)" inputMode="numeric" value={form.pulse} onChange={set('pulse')} />
            <Input label="Breathing (per min)" inputMode="numeric" value={form.resp_rate} onChange={set('resp_rate')} />
            <Input label="Temperature (°C)" inputMode="decimal" value={form.temperature} onChange={set('temperature')} />
            <Input label="Oxygen (SpO2 %)" inputMode="numeric" value={form.spo2} onChange={set('spo2')} />
            <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm">
              <p className="text-xs text-ink-500">Baby's heartbeat (from the Labor chart)</p>
              <p className="font-semibold text-ink-900">{babyBeat ? `${babyBeat.fetal_heart_rate} per min` : 'Not recorded'}</p>
            </div>
          </div>
          {form.phase === 'postpartum' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Select label="Vaginal bleeding" value={form.bleeding} onChange={set('bleeding')}>
                <option value="">Not recorded</option>
                {Object.entries(BLEEDING).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <Select label="Uterus" value={form.uterus} onChange={set('uterus')}>
                <option value="">Not recorded</option>
                <option value="firm">Firm</option>
                <option value="soft">Soft</option>
              </Select>
              <Select label="Perineum" value={form.perineum} onChange={set('perineum')}>
                <option value="">Not recorded</option>
                <option value="intact">Intact</option>
                <option value="swollen">Swollen</option>
                <option value="tear">Tear</option>
                <option value="stitched">Stitched</option>
              </Select>
            </div>
          )}
          {postpartumDue && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              First {POSTPARTUM_FOR_HOURS} hours after birth: check BP, pulse, bleeding and uterus every {POSTPARTUM_EVERY_MIN} minutes.
              {minutesSincePostpartum !== null && minutesSincePostpartum >= POSTPARTUM_EVERY_MIN ? ` Last check was ${Math.round(minutesSincePostpartum)} minutes ago.` : ''}
            </p>
          )}
          {hasInput && missingNow.length > 0 && (
            <p className="text-xs text-amber-800">Still needed before you can save: {missingNow.join(', ')}.</p>
          )}
          <div className="flex justify-end">
            <Button onClick={save} loading={saving} disabled={!hasInput || missingNow.length > 0}>Add reading</Button>
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
                <th className="px-3 py-2.5 font-semibold">Phase</th>
                <th className="text-left px-3 py-2.5 font-semibold">Postpartum</th>
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
                    <td className="px-3 py-2.5 text-center whitespace-nowrap text-ink-600">{PHASES[r.phase] || 'Admission'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-700">
                      {[r.bleeding ? `Bleeding ${BLEEDING[r.bleeding]?.toLowerCase()}` : null, r.uterus ? `Uterus ${r.uterus}` : null, r.perineum ? `Perineum ${r.perineum}` : null].filter(Boolean).join(', ') || '—'}
                    </td>
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

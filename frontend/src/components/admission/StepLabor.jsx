import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input, Select, Textarea } from '../UI/Input';
import { Spinner } from '../UI/Spinner';
import { Icon } from '../Icon';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDay, toLocalInput } from '../../lib/admission';

const EMPTY = { contractions: '', contraction_freq: '', contraction_secs: '', cervix_cm: '', station: '', fetal_heart_rate: '', membranes: '', occurred_at: '', notes: '' };
const MEMBRANES = {
  not_checked: 'Not checked',
  intact: 'Intact',
  ruptured_clear: 'Ruptured, clear',
  ruptured_meconium: 'Ruptured, meconium-stained',
  ruptured_bloody: 'Ruptured, bloody',
  ruptured: 'Ruptured (fluid not specified)',
  unknown: 'Not known'
};
const STATIONS = ['-3', '-2', '-1', '0', '+1', '+2', '+3'];
// Default, to be confirmed by the clinic midwife/doctor (backend/config/clinicalThresholds.js).
const PROLONGED_HOURS = 4;
const whenOf = (r) => r.occurred_at || r.recorded_at;
const timeOf = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * Labor chart: how labor is progressing over time. It is a separate page from the
 * Midwives' Notes, which stay a free-text diary.
 */
// Same limits as THRESHOLDS.fetalHeartRate in backend/config/clinicalThresholds.js.
const FHR_MIN = 110;
const FHR_MAX = 160;

export function StepLabor({ admission, canEdit, onMarkInLabor, markingLabor, onRefer }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [fhrAlert, setFhrAlert] = useState(null);
  const [alertsHidden, setAlertsHidden] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const load = useCallback(async () => {
    try {
      setRows(await admissionService.labor(admission.id));
    } catch (err) {
      toast.error(apiError(err, 'Could not load the labor chart'));
      setRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => [k, ['cervix_cm', 'fetal_heart_rate', 'contraction_freq', 'contraction_secs'].includes(k) ? Number(v) : k === 'occurred_at' ? new Date(v).toISOString() : v.trim()])
    );
    setSaving(true);
    try {
      await admissionService.addLabor(admission.id, payload);
      setForm(EMPTY);
      setAlertsHidden(false);
      const fhr = payload.fetal_heart_rate;
      if (fhr !== undefined && (fhr < FHR_MIN || fhr > FHR_MAX)) setFhrAlert(fhr);
      toast.success('Labor entry saved');
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save the labor entry'));
    } finally {
      setSaving(false);
    }
  }

  // Dismissing is allowed only with a reason, which is kept as a midwife note (author and time set by the server).
  async function dismissAlert() {
    setSaving(true);
    try {
      await admissionService.addNote(admission.id, `Alert dismissed: baby's heartbeat ${fhrAlert} per min (normal ${FHR_MIN}-${FHR_MAX}). Reason: ${dismissReason.trim()}`);
      setFhrAlert(null);
      setDismissing(false);
      setDismissReason('');
    } catch (err) {
      toast.error(apiError(err, 'Could not save the reason'));
    } finally {
      setSaving(false);
    }
  }

  const hasInput = Object.entries(form).some(([k, v]) => k !== 'occurred_at' && String(v).trim() !== '');

  // Alerts from the chart itself: stalled cervix, meconium or bloody fluid.
  const chartAlerts = useMemo(() => {
    const list = [];
    const entries = [...(rows || [])].sort((a, b) => new Date(whenOf(a)) - new Date(whenOf(b)));
    const withCervix = entries.filter((r) => r.cervix_cm !== null && r.cervix_cm !== undefined);
    const last = withCervix[withCervix.length - 1];
    if (last && last.cervix_cm >= 4 && last.cervix_cm < 10) {
      const lastAt = new Date(whenOf(last)).getTime();
      const sameSince = withCervix.filter((r) => r.cervix_cm === last.cervix_cm).map((r) => new Date(whenOf(r)).getTime());
      if (lastAt - Math.min(...sameSince) >= PROLONGED_HOURS * 3600000) {
        list.push(`No change in cervix opening (${last.cervix_cm} cm) for ${PROLONGED_HOURS} hours or more`);
      }
    }
    const lastFluid = [...entries].reverse().find((r) => r.membranes && !['not_checked', 'unknown'].includes(r.membranes));
    if (lastFluid?.membranes === 'ruptured_meconium') list.push('Meconium-stained water');
    if (lastFluid?.membranes === 'ruptured_bloody') list.push('Bloody water');
    return list;
  }, [rows]);

  return (
    <Card>
      {chartAlerts.length > 0 && !alertsHidden && (
        <div role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 mb-4 space-y-2">
          <p className="font-bold">Labor alert: {chartAlerts.join('; ')}</p>
          <p>Create a referral, or hide this until the next entry.</p>
          <div className="flex gap-2">
            {onRefer && <Button size="sm" variant="danger" onClick={() => onRefer(`Labor: ${chartAlerts.join('; ')}`)}>Create referral</Button>}
            <Button size="sm" variant="ghost" onClick={() => setAlertsHidden(true)}>Hide for now</Button>
          </div>
        </div>
      )}
      {fhrAlert !== null && (
        <div role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 mb-4 space-y-2">
          <p className="font-bold">Baby's heartbeat {fhrAlert} per min is outside {FHR_MIN}-{FHR_MAX}</p>
          <p>Create a referral, or dismiss with a reason.</p>
          {dismissing ? (
            <div className="space-y-2">
              <Textarea label="Why are you dismissing this alert?" rows={2} value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setDismissing(false)}>Cancel</Button>
                <Button size="sm" onClick={dismissAlert} loading={saving} disabled={dismissReason.trim().length < 3}>Dismiss with reason</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {onRefer && <Button size="sm" variant="danger" onClick={() => onRefer(`Labor: baby's heartbeat ${fhrAlert} per min`)}>Create referral</Button>}
              <Button size="sm" variant="secondary" onClick={() => setDismissing(true)}>Dismiss (reason required)</Button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-ink-900">Labor chart</h3>
          <p className="text-sm text-ink-500">
            Add an entry each time labor is checked. The time and your name are added automatically.
          </p>
        </div>
        {canEdit && admission.status === 'admitted' && (
          <Button variant="secondary" size="sm" onClick={onMarkInLabor} loading={markingLabor}>
            <Icon.Clock width={14} height={14} /> Now in labor
          </Button>
        )}
      </div>

      {canEdit && (
        <div className="mb-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Contractions per 10 min" inputMode="numeric" placeholder="e.g. 3" value={form.contraction_freq} onChange={set('contraction_freq')} />
            <Input label="Each lasting (seconds)" inputMode="numeric" placeholder="e.g. 40" value={form.contraction_secs} onChange={set('contraction_secs')} />
            <Input label="Cervix opening (0 to 10 cm)" inputMode="numeric" value={form.cervix_cm} onChange={set('cervix_cm')} />
            <Select label="Baby's head station" value={form.station} onChange={set('station')}>
              <option value="">Not recorded</option>
              {STATIONS.map((st) => <option key={st} value={st}>{st}</option>)}
            </Select>
            <Input label="Baby's heartbeat (per min)" inputMode="numeric" value={form.fetal_heart_rate} onChange={set('fetal_heart_rate')} />
            <Select label="Water bag" value={form.membranes} onChange={set('membranes')}>
              <option value="">Not checked</option>
              {['intact', 'ruptured_clear', 'ruptured_meconium', 'ruptured_bloody', 'unknown'].map((m) => <option key={m} value={m}>{MEMBRANES[m]}</option>)}
            </Select>
            <Input label="Contractions, in words (optional)" placeholder="e.g. every 4 min, strong" value={form.contractions} onChange={set('contractions')} />
            <Input
              label="When it happened"
              type="datetime-local"
              hint="Leave empty for now. Change it for a late entry."
              value={form.occurred_at}
              max={toLocalInput()}
              onChange={set('occurred_at')}
            />
          </div>
          <Textarea label="Notes" rows={2} value={form.notes} onChange={set('notes')} />
          <div className="flex justify-end">
            <Button onClick={save} loading={saving} disabled={!hasInput}>Add entry</Button>
          </div>
        </div>
      )}

      {!rows ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500 py-4 text-center">No labor entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">When</th>
                <th className="text-left px-3 py-2.5 font-semibold">Contractions</th>
                <th className="px-3 py-2.5 font-semibold">Cervix</th>
                <th className="px-3 py-2.5 font-semibold">Station</th>
                <th className="px-3 py-2.5 font-semibold">Baby</th>
                <th className="px-3 py-2.5 font-semibold">Water bag</th>
                <th className="text-left px-3 py-2.5 font-semibold">Notes</th>
                <th className="text-left px-3 py-2.5 font-semibold">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {[...rows].sort((a, b) => new Date(whenOf(b)) - new Date(whenOf(a))).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatDay(whenOf(r))} · {timeOf(whenOf(r))}
                    {r.occurred_at && Math.abs(new Date(r.occurred_at) - new Date(r.recorded_at)) > 5 * 60000 && (
                      <span className="block text-xs text-ink-500">Entered {formatDay(r.recorded_at)} {timeOf(r.recorded_at)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {[r.contraction_freq != null ? `${r.contraction_freq} per 10 min` : null, r.contraction_secs != null ? `${r.contraction_secs} sec` : null, r.contractions].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">{r.cervix_cm === null || r.cervix_cm === undefined ? '—' : `${r.cervix_cm} cm`}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">{r.station || '—'}</td>
                  <td className={`px-3 py-2.5 text-center whitespace-nowrap ${r.fetal_heart_rate && (r.fetal_heart_rate < 110 || r.fetal_heart_rate > 160) ? 'bg-red-100 text-red-800 font-semibold' : ''}`}>{r.fetal_heart_rate ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">{MEMBRANES[r.membranes] || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-pre-line break-words">{r.notes || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink-600">{r.recorded_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

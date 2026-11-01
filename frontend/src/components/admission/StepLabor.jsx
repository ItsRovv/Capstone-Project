import { useCallback, useEffect, useState } from 'react';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input, Select, Textarea } from '../UI/Input';
import { Spinner } from '../UI/Spinner';
import { Icon } from '../Icon';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDay } from '../../lib/admission';

const EMPTY = { contractions: '', cervix_cm: '', fetal_heart_rate: '', membranes: '', notes: '' };
const MEMBRANES = { intact: 'Intact', ruptured: 'Ruptured', unknown: 'Not known' };
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
      Object.entries(form).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => [k, ['cervix_cm', 'fetal_heart_rate'].includes(k) ? Number(v) : v.trim()])
    );
    setSaving(true);
    try {
      await admissionService.addLabor(admission.id, payload);
      setForm(EMPTY);
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

  const hasInput = Object.values(form).some((v) => String(v).trim() !== '');

  return (
    <Card>
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
            <Input label="Contractions" placeholder="every 4 min, 40 sec" value={form.contractions} onChange={set('contractions')} />
            <Input label="Cervix opening (0 to 10 cm)" inputMode="numeric" value={form.cervix_cm} onChange={set('cervix_cm')} />
            <Input label="Baby's heartbeat (per min)" inputMode="numeric" value={form.fetal_heart_rate} onChange={set('fetal_heart_rate')} />
            <Select label="Water bag" value={form.membranes} onChange={set('membranes')}>
              <option value="">Not checked</option>
              <option value="intact">Intact</option>
              <option value="ruptured">Ruptured</option>
              <option value="unknown">Not known</option>
            </Select>
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
                <th className="px-3 py-2.5 font-semibold">Baby</th>
                <th className="px-3 py-2.5 font-semibold">Water bag</th>
                <th className="text-left px-3 py-2.5 font-semibold">Notes</th>
                <th className="text-left px-3 py-2.5 font-semibold">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {[...rows].reverse().map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatDay(r.recorded_at)} · {timeOf(r.recorded_at)}</td>
                  <td className="px-3 py-2.5">{r.contractions || '—'}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">{r.cervix_cm === null || r.cervix_cm === undefined ? '—' : `${r.cervix_cm} cm`}</td>
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

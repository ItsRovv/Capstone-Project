import { useCallback, useEffect, useState } from 'react';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Modal } from '../UI/Modal';
import { Input, Select, Textarea } from '../UI/Input';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDateTime } from '../../lib/admission';

const ROUTES = ['oral', 'IV', 'IM', 'SC', 'topical', 'other'];
const EMPTY = { drug: '', dose: '', route: 'oral' };

// What was given, how much, how, when and by whom. A clinical record, separate from the items summary.
export function MedicationsCard({ admission, canEdit }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [allergy, setAllergy] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await admissionService.medications(admission.id));
    } catch (err) {
      toast.error(apiError(err, 'Could not load the medications'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);
  useEffect(() => { load(); }, [load]);

  async function save(extra = {}) {
    setBusy(true);
    try {
      await admissionService.addMedication(admission.id, { ...form, ...extra });
      setForm(EMPTY);
      setAllergy(null);
      setReason('');
      toast.success('Medication recorded');
      await load();
    } catch (err) {
      const data = err?.response?.data;
      if (data?.code === 'ALLERGY') setAllergy(data.message);
      else toast.error(apiError(err, 'Could not record the medication'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Medications given</h3>
      <p className="text-sm text-ink-500 mb-3">A clinical record of what was given. Your name and the time are added automatically.</p>

      {canEdit && (
        <div className="grid sm:grid-cols-[1fr_9rem_8rem_auto] gap-3 items-end mb-4">
          <Input label="Drug" placeholder="e.g. Oxytocin" value={form.drug} onChange={(e) => setForm((f) => ({ ...f, drug: e.target.value }))} />
          <Input label="Dose" placeholder="e.g. 10 units" value={form.dose} onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))} />
          <Select label="Route" value={form.route} onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}>
            {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Button onClick={() => save()} loading={busy && !allergy} disabled={!form.drug.trim()}>Record</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-ink-500">No medications recorded yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((m) => (
            <li key={m.id} className="py-2.5 text-sm">
              <p className="font-medium text-ink-900">{m.drug}{m.dose ? `, ${m.dose}` : ''}{m.route ? ` (${m.route})` : ''}</p>
              <p className="text-xs text-ink-500">{formatDateTime(m.given_at)}{m.given_by_name ? ` · ${m.given_by_name}` : ''}</p>
              {m.note && <p className="text-xs text-red-700 mt-0.5">{m.note}</p>}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(allergy)}
        onClose={() => setAllergy(null)}
        title="Allergy warning"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAllergy(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => save({ allergy_reason: reason.trim() })}>Give with reason</Button>
          </div>
        )}
      >
        <p className="text-sm text-red-800 mb-3">{allergy}</p>
        <Textarea label="Why is it being given anyway?" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </Card>
  );
}

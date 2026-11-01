import { useEffect, useState } from 'react';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { Input, Textarea } from '../UI/Input';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';

// One referral form for every step. "context" prefills the reason with what triggered it
// (a warning sign, a red reading) so staff do not retype it.
export function ReferralModal({ open, onClose, admission, context = '', riskLabels = [], onReferred }) {
  const toast = useToast();
  const [form, setForm] = useState({ facility: '', reason: '', transport: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const reason = [context, riskLabels.length ? `Risk flags: ${riskLabels.join(', ')}` : ''].filter(Boolean).join('. ');
    setForm({ facility: '', reason, transport: '', notes: '' });
  }, [open, context, riskLabels.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]));
      await admissionService.refer(admission.id, payload);
      toast.success('Patient referred');
      onClose();
      await onReferred?.();
    } catch (err) {
      toast.error(apiError(err, 'Could not refer the patient'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Refer patient"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={saving} disabled={!form.facility.trim()}>Refer patient</Button>
        </div>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          {admission.first_name} {admission.last_name} will be marked as referred. Delivery, baby and routine discharge are
          locked; a transfer summary is shown instead. A doctor can reverse this with a reason.
        </p>
        <Input label="Hospital or facility" value={form.facility} onChange={set('facility')} autoFocus />
        <Textarea label="Why is she being referred?" rows={3} value={form.reason} onChange={set('reason')} />
        <Input label="How she is taken" placeholder="e.g. ambulance, private car" value={form.transport} onChange={set('transport')} />
        <Textarea label="Condition on transfer, who accompanies her (optional)" rows={2} value={form.notes} onChange={set('notes')} />
      </div>
    </Modal>
  );
}

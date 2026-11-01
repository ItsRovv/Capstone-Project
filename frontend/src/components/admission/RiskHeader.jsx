import { useState } from 'react';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { Textarea } from '../UI/Input';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { REFERRAL_LEVEL_FLAGS } from '../../lib/admission';

const hoursSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3600000));

// Always visible while a stay is open: who, which bed, allergies, active risk flags and the
// Refer button, so the safety picture and the escape hatch are on every step.
export function RiskHeader({ admission, record, labelFor, canRecord, canReverse, onRefer, onChanged }) {
  const toast = useToast();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const flags = admission.risk_flags || [];
  const open = ['admitted', 'in_labor', 'delivered'].includes(admission.status);
  const referred = admission.status === 'referred';
  const allergies = record?.allergies;

  async function reverse() {
    setBusy(true);
    try {
      await admissionService.reverseReferral(admission.id, reason.trim());
      toast.success('Referral reversed. The stay is open again.');
      setReverseOpen(false);
      setReason('');
      await onChanged?.();
    } catch (err) {
      toast.error(apiError(err, 'Could not reverse the referral'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="-mx-4 md:-mx-8 px-4 md:px-8 py-2.5 bg-white border-b border-ink-200 print:hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <span className="font-semibold text-ink-900">{admission.first_name} {admission.last_name}</span>
        <span className="text-ink-600">{admission.bed_number ? `Bed ${admission.bed_number}` : 'No bed'}</span>
        <span className="text-ink-600">{hoursSince(admission.admitted_at)} h since admission</span>
        {allergies && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            Allergy: {allergies}
          </span>
        )}
        {referred && (
          <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">Referred</span>
        )}
        <span className="flex-1" />
        {canRecord && open && flags.length > 0 && (
          <Button size="sm" variant="danger" onClick={() => onRefer('')}>Refer patient</Button>
        )}
        {canReverse && referred && (
          <Button size="sm" variant="secondary" onClick={() => setReverseOpen(true)}>Reverse referral</Button>
        )}
      </div>
      {flags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Active risk flags">
          {flags.map((code) => (
            <span
              key={code}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                REFERRAL_LEVEL_FLAGS.includes(code) ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              {REFERRAL_LEVEL_FLAGS.includes(code) ? 'High risk: ' : 'Watch: '}{labelFor('risk_flag', code)}
            </span>
          ))}
        </div>
      )}

      <Modal
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        title="Reverse referral"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReverseOpen(false)}>Cancel</Button>
            <Button onClick={reverse} loading={busy} disabled={reason.trim().length < 3}>Reverse referral</Button>
          </div>
        )}
      >
        <p className="text-sm text-ink-600 mb-3">
          Use this if the referral was cancelled or the patient came back. The stay reopens and the reason is logged.
        </p>
        <Textarea label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}

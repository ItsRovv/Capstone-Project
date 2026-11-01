import { useState } from 'react';
import { Button } from '../UI/Button';
import { Textarea } from '../UI/Input';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDateTime, referralLevelFlags } from '../../lib/admission';

// Red alert shown on the Admit step while any warning sign is ticked. It cannot be ignored:
// the midwife either refers the patient or records why she continues at the clinic.
export function RiskAlert({ flags, admission, labelFor, canRecord, onRefer, onChanged }) {
  const toast = useToast();
  const [continuing, setContinuing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!flags.length) return null;
  const high = referralLevelFlags(flags);
  const names = flags.map((c) => labelFor('risk_flag', c)).join(', ');
  const acknowledged = Boolean(admission.risk_ack_reason);

  async function saveContinue() {
    setBusy(true);
    try {
      await admissionService.acknowledgeRisk(admission.id, reason.trim());
      toast.success('Decision recorded');
      setContinuing(false);
      setReason('');
      await onChanged?.();
    } catch (err) {
      toast.error(apiError(err, 'Could not save the decision'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 space-y-2">
      <p className="font-bold">
        {high.length ? 'High-risk warning sign: think about referral' : 'Warning signs ticked'}
      </p>
      <p>{names}</p>
      {acknowledged ? (
        <p className="rounded-md bg-white/70 border border-red-200 px-3 py-2 text-ink-800">
          <span className="font-semibold">Continuing at the clinic.</span> Reason: {admission.risk_ack_reason}
          {admission.risk_ack_at ? <span className="block text-xs text-ink-500">Recorded {formatDateTime(admission.risk_ack_at)}</span> : null}
        </p>
      ) : (
        <p className="text-red-800">Choose one: refer the patient, or continue at the clinic and record why.</p>
      )}
      {canRecord && (
        continuing ? (
          <div className="space-y-2">
            <Textarea label="Why is she staying at the clinic?" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setContinuing(false)}>Cancel</Button>
              <Button size="sm" onClick={saveContinue} loading={busy} disabled={reason.trim().length < 3}>Save decision</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" onClick={() => onRefer(`Warning signs: ${names}`)}>Create referral</Button>
            <Button size="sm" variant="secondary" onClick={() => setContinuing(true)}>
              {acknowledged ? 'Change reason' : 'Continue at clinic (reason required)'}
            </Button>
          </div>
        )
      )}
    </div>
  );
}

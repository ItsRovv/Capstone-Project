import { useState } from 'react';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Modal } from '../UI/Modal';
import { Badge } from '../UI/Badge';
import { Input, Textarea, Select } from '../UI/Input';
import { Icon } from '../Icon';
import { useToast } from '../UI/Toast';
import { FollowupDoneModal } from './FollowupDoneModal';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { followupState, formatDateTime, formatDay, peso } from '../../lib/admission';

function Row({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="text-sm text-ink-900 mt-0.5 whitespace-pre-line break-words">{value || '—'}</p>
    </div>
  );
}

function ChecklistItem({ ok, label, detail }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
        {ok ? '✓' : '!'}
      </span>
      <span className="text-ink-700">
        {label}
        {detail && <span className="block text-xs text-ink-500">{detail}</span>}
      </span>
    </li>
  );
}

export function StepDischarge({ detail, byGroup, labelFor, canEdit, isAdmin, onChanged, onPrint }) {
  const toast = useToast();
  const { admission, delivery, items, itemsTotal, discharge, followups, referral } = detail;
  const reasons = byGroup.discharge_reason || [];

  const [form, setForm] = useState({ disposition: '', final_diagnosis: '', instructions: '', override_reason: '' });
  const [needReason, setNeedReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [referForm, setReferForm] = useState({ open: false, facility: '', reason: '', transport: '', notes: '' });
  const [referConfirm, setReferConfirm] = useState(false);
  const [doneFor, setDoneFor] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const isDischarged = admission.status === 'discharged';
  const isReferred = admission.status === 'referred';
  const babies = delivery?.newborns?.length || 0;

  async function submitDischarge() {
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]));
      const res = await admissionService.discharge(admission.id, payload);
      toast.success(res.followups ? `Patient discharged. ${res.followups} follow-up visits were scheduled.` : 'Patient discharged');
      setConfirmOpen(false);
      setNeedReason('');
      await onChanged();
    } catch (err) {
      const data = err?.response?.data;
      setConfirmOpen(false);
      if (data?.code === 'MIN_STAY') setNeedReason(data.message);
      else toast.error(apiError(err, 'Could not discharge the patient'));
    } finally {
      setSaving(false);
    }
  }

  async function submitReferral() {
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(referForm).filter(([k]) => k !== 'open').map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]));
      await admissionService.refer(admission.id, payload);
      toast.success('Patient referred');
      setReferConfirm(false);
      await onChanged();
    } catch (err) {
      setReferConfirm(false);
      toast.error(apiError(err, 'Could not refer the patient'));
    } finally {
      setSaving(false);
    }
  }

  if (isDischarged) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-ink-900">Discharge summary</h3>
              <p className="text-sm text-ink-500">{formatDateTime(discharge?.discharged_at)}{discharge?.discharged_by_name ? ` · by ${discharge.discharged_by_name}` : ''}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onPrint}><Icon.Download width={14} height={14} /> Print summary</Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Row label="Why she went home" value={labelFor('discharge_reason', discharge?.disposition)} />
            <Row label="Final diagnosis" value={discharge?.final_diagnosis} />
            <Row label="Instructions given" value={discharge?.instructions} />
            {discharge?.override_reason && <Row label="Reason for leaving early" value={discharge.override_reason} />}
          </div>
        </Card>
        <Card>
          <h3 className="text-base sm:text-lg font-semibold text-ink-900">Follow-up visits</h3>
          <p className="text-sm text-ink-500 mb-3">Check-ups after going home.</p>
          {followups.length === 0 ? (
            <p className="text-sm text-ink-500">No follow-up visits were scheduled for this stay.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {followups.map((f, i) => {
                const state = followupState(f);
                return (
                  <li key={f.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm font-medium text-ink-900">Visit {i + 1} · {formatDay(f.due_at)}</p>
                      {f.done_at && <p className="text-xs text-ink-500">Done {formatDateTime(f.done_at)}{f.notes ? ` · ${f.notes}` : ''}</p>}
                    </div>
                    <Badge tone={state === 'done' ? 'success' : state === 'overdue' ? 'danger' : 'info'}>
                      {state === 'done' ? 'Done' : state === 'overdue' ? 'Overdue' : 'Coming up'}
                    </Badge>
                    {canEdit && state !== 'done' && (
                      <Button size="sm" variant="secondary" onClick={() => setDoneFor(f)}>Mark as done</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <FollowupDoneModal followup={doneFor} patientName={`${admission.first_name} ${admission.last_name}`} onClose={() => setDoneFor(null)} onDone={onChanged} />
        {isAdmin && <p className="text-xs text-ink-500">This stay is closed. Only the clinic administrator can change it.</p>}
      </div>
    );
  }

  if (isReferred) {
    return (
      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-ink-900 mb-4">Referred to another facility</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Row label="Sent to" value={referral?.facility} />
          <Row label="When" value={formatDateTime(referral?.referred_at)} />
          <Row label="Reason" value={referral?.reason} />
          <Row label="How she was taken" value={referral?.transport} />
          <Row label="Notes" value={referral?.notes} />
        </div>
      </Card>
    );
  }

  const canDischargeNow = canEdit && form.disposition && (!needReason || form.override_reason.trim());

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-ink-900">Ready to go home?</h3>
        <p className="text-sm text-ink-500 mb-4">A quick look before you discharge.</p>
        <ul className="space-y-2.5 mb-5">
          <ChecklistItem ok={admission.consent_signed} label={admission.consent_signed ? 'Informed consent recorded' : 'Informed consent not recorded yet'} detail={admission.consent_signed ? `Signed by ${admission.consent_by || 'patient'}` : 'You can still discharge.'} />
          <ChecklistItem ok={Boolean(delivery)} label={delivery ? `Delivery recorded (${formatDateTime(delivery.delivered_at)})` : 'Delivery not recorded'} detail={!delivery ? 'Skip this if the patient is going home without giving birth.' : undefined} />
          {delivery && <ChecklistItem ok={babies > 0} label={babies > 0 ? `${babies} baby record${babies === 1 ? '' : 's'} saved` : 'Baby details not saved'} />}
          <ChecklistItem ok={items.length > 0} label={items.length ? `${items.length} item${items.length === 1 ? '' : 's'} used, total ${peso(itemsTotal)}` : 'No items recorded'} detail="Items can still be added after discharge." />
        </ul>

        <fieldset disabled={!canEdit} className="space-y-4">
          <Select label="Why is the patient going home?" value={form.disposition} onChange={set('disposition')}>
            <option value="">Choose…</option>
            {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
          <Input label="Final diagnosis" value={form.final_diagnosis} onChange={set('final_diagnosis')} />
          <Textarea label="Instructions for the patient" rows={3} hint="Medicines, rest, warning signs, when to come back." value={form.instructions} onChange={set('instructions')} />
          {needReason && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3">
              <p className="text-sm text-amber-900">{needReason}</p>
              <Textarea label="Why is she leaving early?" rows={2} value={form.override_reason} onChange={set('override_reason')} />
            </div>
          )}
        </fieldset>
        {canEdit && (
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setConfirmOpen(true)} disabled={!canDischargeNow}>Discharge patient</Button>
          </div>
        )}
      </Card>

      {canEdit && ['admitted', 'in_labor'].includes(admission.status) && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink-900">Needs a hospital?</h3>
              <p className="text-sm text-ink-500">Send the patient to another facility if it is not safe to deliver here.</p>
            </div>
            {!referForm.open && <Button variant="secondary" onClick={() => setReferForm((f) => ({ ...f, open: true }))}>Refer to a hospital</Button>}
          </div>
          {referForm.open && (
            <div className="mt-4 space-y-4">
              <Input label="Hospital or facility" value={referForm.facility} onChange={(e) => setReferForm((f) => ({ ...f, facility: e.target.value }))} />
              <Textarea label="Why is she being referred?" rows={2} value={referForm.reason} onChange={(e) => setReferForm((f) => ({ ...f, reason: e.target.value }))} />
              <Input label="How will she get there?" placeholder="Ambulance, tricycle, family vehicle…" value={referForm.transport} onChange={(e) => setReferForm((f) => ({ ...f, transport: e.target.value }))} />
              <Textarea label="Notes" rows={2} value={referForm.notes} onChange={(e) => setReferForm((f) => ({ ...f, notes: e.target.value }))} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setReferForm({ open: false, facility: '', reason: '', transport: '', notes: '' })}>Cancel</Button>
                <Button variant="danger" onClick={() => setReferConfirm(true)} disabled={!referForm.facility.trim()}>Refer patient</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        title="Discharge this patient?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Go back</Button>
            <Button onClick={submitDischarge} loading={saving}>Yes, discharge</Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          <span className="font-semibold">{admission.first_name} {admission.last_name}</span> will be marked as going home
          {delivery ? ', and her follow-up visits will be scheduled' : ''}. The stay will be closed for editing.
        </p>
      </Modal>

      <Modal
        open={referConfirm}
        onClose={() => setReferConfirm(false)}
        size="sm"
        title="Refer this patient?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReferConfirm(false)}>Go back</Button>
            <Button variant="danger" onClick={submitReferral} loading={saving}>Yes, refer</Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          <span className="font-semibold">{admission.first_name} {admission.last_name}</span> will be marked as referred to{' '}
          <span className="font-semibold">{referForm.facility}</span>. The stay will be closed for editing.
        </p>
      </Modal>
    </div>
  );
}

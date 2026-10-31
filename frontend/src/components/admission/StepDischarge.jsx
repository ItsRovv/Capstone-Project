import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

// Reasons for leaving that cannot go through the normal checklist (same list as the server).
const CHECKLIST_EXEMPT = ['transferred', 'hama', 'absconded', 'expired'];

// The "RESULTS" box at the bottom of the paper form. Radio groups; clicking a chosen
// option again clears it. The death-time and autopsy choices only appear with "died".
function ResultsPicker({ value, onChange }) {
  const pick = (codes, code) =>
    onChange(value.filter((c) => !codes.includes(c)).concat(value.includes(code) ? [] : [code]));
  const group = (title, options) => (
    <div>
      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {options.map(([code, label]) => (
          <label key={code} className="flex items-center gap-2 text-sm text-ink-800 cursor-pointer">
            <input
              type="radio"
              className="h-4 w-4 border-ink-300 text-primary-600"
              checked={value.includes(code)}
              onChange={() => {}}
              onClick={() => pick(options.map((o) => o[0]), code)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
  const died = value.includes('died');
  return (
    <div>
      <p className="text-sm font-medium text-ink-700 mb-2">Results</p>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {group('Result', [['recovered', 'Recovered'], ['died', 'Died']])}
        {group('Condition on leaving', [['improved', 'Improved'], ['unimproved', 'Unimproved']])}
        {died && group('Time of death', [['died_24h', 'Within 24 hours'], ['died_48h', 'Within 48 hours']])}
        {died && group('Autopsy', [['autopsy', 'Autopsy'], ['no_autopsy', 'No autopsy']])}
      </div>
    </div>
  );
}

function localChecklistStatus(definition, checklist, hasDelivery) {
  const items = checklist.items || {};
  const required = (definition?.items || []).filter((i) => hasDelivery || !i.requiresDelivery);
  const missing = required.filter((i) => items[i.code] !== true).map((i) => i.code);
  return { complete: missing.length === 0, missing, dangerPresent: checklist.danger_signs || [] };
}

// Pre-discharge checklist: every box must be ticked, and any danger sign means refer, not discharge.
function PreDischargeChecklist({ admission, definition, value, hasDelivery, canEdit, onSave }) {
  const items = value.items || {};
  const signs = value.danger_signs || [];
  const status = localChecklistStatus(definition, value, hasDelivery);
  const toggleItem = (code) => onSave({ items: { ...items, [code]: !items[code] }, danger_signs: signs });
  const toggleSign = (code) => onSave({
    items,
    danger_signs: signs.includes(code) ? signs.filter((c) => c !== code) : [...signs, code]
  });
  return (
    <Card>
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Pre-discharge checklist</h3>
      <p className="text-sm text-ink-500 mb-4">
        Reminder to the midwife: tick each box once it is done, within 24 hours and before discharge.
        {!hasDelivery && ' No delivery was recorded, so only the danger-sign check is needed.'}
      </p>
      <fieldset disabled={!canEdit} className="space-y-2.5">
        {(definition?.items || []).filter((i) => hasDelivery || !i.requiresDelivery).map((i) => (
          <div key={i.code}>
            <label className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer ${items[i.code] ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-ink-200 bg-white text-ink-700'}`}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-primary-600" checked={Boolean(items[i.code])} onChange={() => toggleItem(i.code)} />
              <span>{i.label}</span>
            </label>
            {i.code === 'danger_signs_checked' && (
              <div className="ml-6 mt-2 space-y-1.5">
                <p className="text-xs font-medium text-ink-600">Tick any danger sign that is present:</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {(definition?.dangerSigns || []).map((d) => (
                    <label key={d.code} className={`flex items-start gap-2.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${signs.includes(d.code) ? 'border-red-300 bg-red-50 text-red-900' : 'border-ink-200 bg-white text-ink-700'}`}>
                      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-red-600" checked={signs.includes(d.code)} onChange={() => toggleSign(d.code)} />
                      <span>{d.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </fieldset>
      {status.dangerPresent.length > 0 ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          <span className="font-semibold">Refer to the hospital immediately.</span> A danger sign is present, so {admission.first_name} should not be discharged home. Use "Refer to a hospital" below.
        </div>
      ) : !status.complete ? (
        <p className="mt-4 text-sm text-amber-800">{status.missing.length} item{status.missing.length === 1 ? '' : 's'} left before discharge.</p>
      ) : (
        <p className="mt-4 text-sm text-emerald-700 font-medium">Checklist complete.</p>
      )}
    </Card>
  );
}

export function StepDischarge({ detail, byGroup, labelFor, canEdit, isAdmin, onChanged, onPrint }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { admission, delivery, items, grandTotal, bed, discharge, followups, referral } = detail;
  const reasons = byGroup.discharge_reason || [];

  const [form, setForm] = useState({ disposition: '', final_diagnosis: '', instructions: '', override_reason: '', results: [] });
  const [needReason, setNeedReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [referForm, setReferForm] = useState({ open: false, facility: '', reason: '', transport: '', notes: '' });
  const [referConfirm, setReferConfirm] = useState(false);
  const [doneFor, setDoneFor] = useState(null);
  const [checklist, setChecklist] = useState({
    items: detail.checklist?.items || {},
    danger_signs: detail.checklist?.danger_signs || []
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const isDischarged = admission.status === 'discharged';
  const isReferred = admission.status === 'referred';
  const babies = delivery?.newborns?.length || 0;

  async function saveChecklist(next) {
    const before = checklist;
    setChecklist(next);
    try {
      await admissionService.saveChecklist(admission.id, next);
    } catch (err) {
      setChecklist(before);
      toast.error(apiError(err, 'Could not save the checklist'));
    }
  }

  async function submitDischarge() {
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Array.isArray(v) ? v : (v.trim() === '' ? null : v.trim())]));
      const res = await admissionService.discharge(admission.id, payload);
      toast.success(res.followups ? `Patient discharged. ${res.followups} follow-up visits were scheduled.` : 'Patient discharged');
      setConfirmOpen(false);
      setNeedReason('');
      // Next stop is the statement of accounts. Nothing to bill is fine, so a failure here is ignored.
      await admissionService.sendToTransactions(admission.id).catch(() => null);
      navigate(`/consultation-transactions?patient=${admission.patient_id}`);
    } catch (err) {
      const data = err?.response?.data;
      setConfirmOpen(false);
      if (data?.code === 'MIN_STAY') setNeedReason(data.message);
      else if (data?.code === 'CHECKLIST_INCOMPLETE' || data?.code === 'DANGER_SIGNS') { toast.error(data.message); await onChanged(); }
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
            {(discharge?.results || []).length > 0 && (
              <Row label="Results" value={discharge.results.map((c) => (detail.dischargeResults || []).find((r) => r.code === c)?.label || c).join(', ')} />
            )}
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

  const exempt = CHECKLIST_EXEMPT.includes(form.disposition);
  const check = localChecklistStatus(detail.checklistDefinition, checklist, Boolean(delivery));
  const checklistBlocked = !exempt && (!check.complete || check.dangerPresent.length > 0);
  const canDischargeNow = canEdit && form.disposition && !checklistBlocked && (!needReason || form.override_reason.trim());

  return (
    <div className="space-y-4">
      <PreDischargeChecklist
        admission={admission} definition={detail.checklistDefinition} value={checklist}
        hasDelivery={Boolean(delivery)} canEdit={canEdit} onSave={saveChecklist}
      />
      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-ink-900">Ready to go home?</h3>
        <p className="text-sm text-ink-500 mb-4">A quick look before you discharge.</p>
        <ul className="space-y-2.5 mb-5">
          <ChecklistItem ok={admission.consent_signed} label={admission.consent_signed ? 'Informed consent recorded' : 'Informed consent not recorded yet'} detail={admission.consent_signed ? `Signed by ${admission.consent_by || 'patient'}` : 'You can still discharge.'} />
          <ChecklistItem ok={Boolean(delivery)} label={delivery ? `Delivery recorded (${formatDateTime(delivery.delivered_at)})` : 'Delivery not recorded'} detail={!delivery ? 'Skip this if the patient is going home without giving birth.' : undefined} />
          {delivery && <ChecklistItem ok={babies > 0} label={babies > 0 ? `${babies} baby record${babies === 1 ? '' : 's'} saved` : 'Baby details not saved'} />}
          <ChecklistItem ok={items.length > 0} label={items.length ? `${items.length} item${items.length === 1 ? '' : 's'} used` : 'No items recorded'} detail={`Total to pay so far: ${peso(grandTotal)}${bed?.number ? ` (includes Bed ${bed.number}, ${bed.nights} night${bed.nights === 1 ? '' : 's'})` : ''}. Items can still be added after discharge.`} />
        </ul>

        <fieldset disabled={!canEdit} className="space-y-4">
          <Select label="Why is the patient going home?" value={form.disposition} onChange={set('disposition')}>
            <option value="">Choose…</option>
            {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
          <Input label="Final diagnosis" value={form.final_diagnosis} onChange={set('final_diagnosis')} />
          <ResultsPicker value={form.results} onChange={(r) => setForm((f) => ({ ...f, results: r }))} />
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

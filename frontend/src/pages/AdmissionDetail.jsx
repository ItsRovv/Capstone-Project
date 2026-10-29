import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { PageLoader } from '../components/UI/Spinner';
import { useToast } from '../components/UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { StatusChip } from '../components/admission/StatusChip';
import { AdmissionFields, admissionToForm, emptyAdmissionForm, formToPayload } from '../components/admission/AdmissionFields';
import { StepDelivery, StepBaby, deliveryToDraft, draftToPayload } from '../components/admission/StepDelivery';
import { StepItems } from '../components/admission/StepItems';
import { StepDischarge } from '../components/admission/StepDischarge';
import { PrintSummary } from '../components/admission/PrintSummary';
import { admissionService } from '../services/admissionService';
import { apiError } from '../services/api';
import { canRecordClinical, formatDateTime, timeAgo, useClinicOptions } from '../lib/admission';

const STEPS = [
  { key: 'admission', label: 'Admit' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'baby', label: 'Baby' },
  { key: 'items', label: 'Items' },
  { key: 'discharge', label: 'Discharge' }
];

function firstStep(detail) {
  const { status } = detail.admission;
  if (status === 'discharged' || status === 'referred') return 'discharge';
  if (status === 'in_labor') return 'delivery';
  if (status === 'delivered') return detail.delivery?.newborns?.length ? 'items' : 'baby';
  return 'admission';
}

export function AdmissionDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { onOpenMenu } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();
  const { byGroup, labelFor, loading: optionsLoading } = useClinicOptions();

  const [detail, setDetail] = useState(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState(null);
  const [form, setForm] = useState(emptyAdmissionForm);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState('');

  const load = useCallback(async ({ resetForms = false, first = false } = {}) => {
    try {
      const d = await admissionService.get(id);
      setDetail(d);
      if (resetForms || first) {
        setForm(admissionToForm(d.admission));
        setDraft(deliveryToDraft(d.delivery));
      }
      if (first) {
        const wanted = searchParams.get('step');
        setStep(STEPS.some((s) => s.key === wanted) ? wanted : firstStep(d));
      }
    } catch (err) {
      if (err?.response?.status === 404) setMissing(true);
      else toast.error(apiError(err, 'Could not load this stay'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load({ first: true }); }, [load]);

  if (missing) {
    return (
      <div className="h-full flex flex-col">
        <Topbar title="Not found" onMenuClick={onOpenMenu} />
        <div className="p-8 text-center text-ink-500">
          This stay could not be found. <Link to="/admissions" className="text-primary-700 font-medium">Back to Admissions</Link>
        </div>
      </div>
    );
  }
  if (!detail || !draft || optionsLoading) {
    return (
      <div className="h-full flex flex-col">
        <Topbar title="Admission" onMenuClick={onOpenMenu} />
        <PageLoader />
      </div>
    );
  }

  const { admission, delivery, items, warnings } = detail;
  const isAdmin = user?.role === 'admin';
  const canRecord = canRecordClinical(user?.role);
  const canEdit = canRecord && (!detail.locked || isAdmin);
  const canEditItems = canRecord && (admission.status !== 'referred' || isAdmin);

  const done = {
    admission: true,
    delivery: Boolean(delivery),
    baby: Boolean(delivery?.newborns?.length),
    items: items.length > 0,
    discharge: ['discharged', 'referred'].includes(admission.status)
  };

  async function run(name, fn, successMessage) {
    setSaving(name);
    try {
      const res = await fn();
      if (successMessage) toast.success(successMessage);
      await load({ resetForms: true });
      return res;
    } catch (err) {
      toast.error(apiError(err, 'Could not save. Please try again.'));
      return null;
    } finally {
      setSaving('');
    }
  }

  const saveAdmission = () => run('admission', () => admissionService.update(id, formToPayload(form)), 'Admission details saved');
  const markInLabor = () => run('labor', () => admissionService.markInLabor(id), 'Marked as in labor');
  const saveDelivery = () => {
    if (!draft.delivered_at) return toast.error('Please enter the date and time of birth.');
    return run('delivery', () => admissionService.saveDelivery(id, draftToPayload(draft)), 'Delivery saved. The pregnancy was marked as completed.');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="print:hidden flex-shrink-0">
        <Topbar
          title={`${admission.first_name} ${admission.last_name}`}
          subtitle={`Admitted ${formatDateTime(admission.admitted_at)} · ${timeAgo(admission.admitted_at)}`}
          onMenuClick={onOpenMenu}
          right={<StatusChip status={admission.status} className="!text-sm !px-3 !py-1" />}
        />
      </div>

      <div className="print:hidden flex-1 overflow-y-auto pt-3 md:pt-6 pb-6 md:pb-10">
        <div className="max-w-4xl w-full mx-auto px-4 md:px-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to="/admissions" className="text-primary-700 font-medium hover:underline">← All admissions</Link>
            <Link to={`/patients/${admission.patient_id}`} className="text-primary-700 font-medium hover:underline">Open patient profile →</Link>
          </div>

          {warnings.map((w) => (
            <div key={w.code} className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 flex gap-2.5">
              <span className="font-bold">!</span>
              <span>{w.message}</span>
            </div>
          ))}
          {detail.locked && !isAdmin && (
            <div className="rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700">
              This stay is closed. Only the clinic administrator can change it.
            </div>
          )}
          {!canRecord && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
              You can look at this stay. Midwives, nurses and doctors record the details.
            </div>
          )}

          <nav aria-label="Steps" className="grid grid-cols-5 gap-1 sm:gap-2">
            {STEPS.map((s, i) => {
              const active = step === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(s.key)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors ${active ? 'bg-primary-50' : 'hover:bg-ink-100/60'}`}
                >
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold border-2 ${
                      active ? 'border-primary-600 bg-primary-600 text-white' : done[s.key] ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-ink-300 bg-white text-ink-500'
                    }`}
                  >
                    {done[s.key] && !active ? '✓' : i + 1}
                  </span>
                  <span className={`text-[11px] sm:text-xs font-medium ${active ? 'text-primary-800' : 'text-ink-600'}`}>{s.label}</span>
                </button>
              );
            })}
          </nav>

          {step === 'admission' && (
            <Card>
              <h3 className="text-base sm:text-lg font-semibold text-ink-900 mb-4">Admission details</h3>
              <AdmissionFields form={form} setForm={setForm} byGroup={byGroup} disabled={!canEdit} />
              {canEdit && (
                <div className="mt-5 flex justify-end">
                  <Button onClick={saveAdmission} loading={saving === 'admission'}>Save changes</Button>
                </div>
              )}
            </Card>
          )}
          {step === 'delivery' && (
            <StepDelivery
              draft={draft} setDraft={setDraft} byGroup={byGroup} status={admission.status}
              canEdit={canEdit} saving={saving === 'delivery'} onSave={saveDelivery}
              onMarkInLabor={markInLabor} markingLabor={saving === 'labor'}
            />
          )}
          {step === 'baby' && (
            <StepBaby draft={draft} setDraft={setDraft} byGroup={byGroup} canEdit={canEdit} saving={saving === 'delivery'} onSave={saveDelivery} />
          )}
          {step === 'items' && (
            <StepItems
              admission={admission} items={items} itemsTotal={detail.itemsTotal} byGroup={byGroup}
              canEdit={canEditItems} onChanged={() => load()}
            />
          )}
          {step === 'discharge' && (
            <StepDischarge
              detail={detail} byGroup={byGroup} labelFor={labelFor} canEdit={canEdit} isAdmin={isAdmin}
              onChanged={() => load({ resetForms: true })} onPrint={() => window.print()}
            />
          )}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" disabled={step === STEPS[0].key} onClick={() => setStep(STEPS[Math.max(0, STEPS.findIndex((s) => s.key === step) - 1)].key)}>← Back</Button>
            <Button variant="ghost" disabled={step === STEPS[STEPS.length - 1].key} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex((s) => s.key === step) + 1)].key)}>Next →</Button>
          </div>
        </div>
      </div>

      <PrintSummary detail={detail} labelFor={labelFor} />
    </div>
  );
}

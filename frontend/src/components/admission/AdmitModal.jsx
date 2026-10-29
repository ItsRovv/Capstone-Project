import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { Spinner } from '../UI/Spinner';
import { useToast } from '../UI/Toast';
import { AdmissionFields, emptyAdmissionForm, formToPayload } from './AdmissionFields';
import { admissionService } from '../../services/admissionService';
import { patientService } from '../../services/patientService';
import { apiError } from '../../services/api';
import { formatDay } from '../../lib/admission';

function PatientPicker({ onPick }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await patientService.list(search, { page: 1, limit: 8 });
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-3">
      <Input label="Find the patient" placeholder="Type a name or phone number" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : results.length === 0 ? (
        <p className="text-sm text-ink-500 py-4 text-center">
          No patient found. Register her first on the Patients page, then come back here.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200 overflow-hidden">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="w-full text-left px-3 py-2.5 hover:bg-primary-50/60 transition-colors">
                <p className="font-medium text-ink-900">{p.first_name} {p.last_name}</p>
                <p className="text-xs text-ink-500">{[p.age && `${p.age} y/o`, p.contact_number].filter(Boolean).join(' · ') || 'No details yet'}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Admit a patient. Pass `patient` to skip the search step (from a profile or row).
 */
export function AdmitModal({ open, onClose, patient: initialPatient, byGroup }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [patient, setPatient] = useState(initialPatient || null);
  const [prefill, setPrefill] = useState(null);
  const [form, setForm] = useState(emptyAdmissionForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPatient(initialPatient || null);
      setPrefill(null);
      setForm(emptyAdmissionForm);
    }
  }, [open, initialPatient]);

  useEffect(() => {
    if (!open || !patient) return undefined;
    let cancelled = false;
    setLoading(true);
    admissionService.prefill(patient.id)
      .then((info) => {
        if (cancelled) return;
        setPrefill(info);
        setForm((f) => ({ ...f, chief_complaint: f.chief_complaint || info.latestConsultation?.chief_complaint || '' }));
      })
      .catch((err) => !cancelled && toast.error(apiError(err, 'Could not load the patient details')))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient?.id]);

  async function submit() {
    setSaving(true);
    try {
      const res = await admissionService.admit({ patient_id: patient.id, ...formToPayload(form) });
      toast.success(`${patient.first_name} ${patient.last_name} is now admitted`);
      onClose();
      navigate(`/admissions/${res.id}`);
    } catch (err) {
      const existing = err?.response?.data?.admissionId;
      if (existing) {
        toast.error(apiError(err));
        onClose();
        navigate(`/admissions/${existing}`);
      } else {
        toast.error(apiError(err, 'Could not admit the patient'));
      }
    } finally {
      setSaving(false);
    }
  }

  const alreadyAdmitted = prefill?.activeAdmissionId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={patient ? `Admit ${patient.first_name} ${patient.last_name}` : 'Admit a patient'}
      footer={
        patient && (
          <>
            {!initialPatient && <Button variant="ghost" onClick={() => setPatient(null)}>Choose someone else</Button>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={loading || Boolean(alreadyAdmitted)}>Admit patient</Button>
          </>
        )
      }
    >
      {!patient ? (
        <PatientPicker onPick={setPatient} />
      ) : loading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-5">
          {alreadyAdmitted && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              This patient is already admitted.{' '}
              <Link to={`/admissions/${alreadyAdmitted}`} onClick={onClose} className="font-semibold underline">Open the current stay</Link>
            </div>
          )}
          {prefill && (prefill.pregnancy || prefill.latestConsultation) && (
            <div className="rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2.5 text-sm text-ink-700">
              <p className="font-medium text-primary-800 mb-1">Already on file</p>
              <ul className="space-y-0.5 text-xs sm:text-sm">
                {prefill.pregnancy && (
                  <li>
                    Pregnancy: {[prefill.pregnancy.gp && `G/P ${prefill.pregnancy.gp}`, prefill.pregnancy.weeks && `${prefill.pregnancy.weeks} weeks`, prefill.pregnancy.edd && `due ${formatDay(prefill.pregnancy.edd)}`].filter(Boolean).join(' · ') || 'recorded'}
                  </li>
                )}
                {prefill.latestConsultation && <li>Last check-up: {formatDay(prefill.latestConsultation.visit_date)}</li>}
                {prefill.latestConsultation?.delivery_location === 'jlmc' && <li className="font-medium text-emerald-700">Planned to deliver at JLMC</li>}
                {prefill.patient.allergies && <li className="text-red-700">Allergies: {prefill.patient.allergies}</li>}
              </ul>
            </div>
          )}
          <AdmissionFields form={form} setForm={setForm} byGroup={byGroup} disabled={Boolean(alreadyAdmitted)} />
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Input, Select, Textarea } from '../UI/Input';
import { admissionService } from '../../services/admissionService';
import { BedPicker } from './BedPicker';
import { REFERRAL_LEVEL_FLAGS } from '../../lib/admission';

export const ADMISSION_TYPE_OPTIONS = [
  { value: 'new', label: 'New patient' },
  { value: 'old', label: 'Old patient' },
  { value: 'former_opd', label: 'Former OPD patient' }
];

export const COVERAGE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'philhealth_member', label: 'PhilHealth (member)' },
  { value: 'philhealth_dependent', label: 'PhilHealth (dependent)' },
  { value: 'sss', label: 'SSS' },
  { value: 'gsis', label: 'GSIS' },
  { value: 'owwa', label: 'OWWA' },
  { value: 'indigent', label: 'Indigent' },
  { value: 'private', label: 'Private HMO/insurance' },
  { value: 'others', label: 'Others' }
];

// Short obstetric list. To be verified by the clinic doctor. The field stays optional.
export const ICD_OBSTETRIC = [
  { code: 'O80', label: 'Single spontaneous delivery' },
  { code: 'O60', label: 'Preterm labor' },
  { code: 'O14', label: 'Pre-eclampsia' },
  { code: 'O15', label: 'Eclampsia' },
  { code: 'O44', label: 'Placenta previa' },
  { code: 'O72', label: 'Postpartum hemorrhage' },
  { code: 'O62', label: 'Abnormalities of forces of labor' },
  { code: 'O42', label: 'Premature rupture of membranes' }
];

export const CONSENT_SIGNERS = [
  { value: 'patient', label: 'Patient' },
  { value: 'partner', label: 'Husband or partner' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' }
];

export const emptyAdmissionForm = {
  philhealth_pin: '',
  consent_signer_type: '',
  consent_relationship: '',
  attending_user_id: '',
  bed_number: '',
  admission_type: '',
  attending_physician: '',
  referred_by: '',
  icd_code: '',
  social_service_class: '',
  hospitalization_plan: '',
  health_insurance_name: '',
  medicare: 'none',
  medicare_other: '',
  informant_name: '',
  informant_address: '',
  informant_relationship: '',
  chief_complaint: '',
  admitting_diagnosis: '',
  bp: '',
  pulse: '',
  resp_rate: '',
  temperature: '',
  labor_notes: '',
  risk_flags: [],
  consent_signed: false,
  consent_by: '',
  notes: ''
};

export function admissionToForm(a = {}) {
  return {
    bed_number: a.bed_number ?? '',
    admission_type: a.admission_type || '',
    attending_physician: a.attending_physician || '',
    referred_by: a.referred_by || '',
    icd_code: a.icd_code || '',
    social_service_class: a.social_service_class || '',
    hospitalization_plan: a.hospitalization_plan || '',
    health_insurance_name: a.health_insurance_name || '',
    medicare: a.medicare || 'none',
    philhealth_pin: a.philhealth_pin || '',
    consent_signer_type: a.consent_signer_type || '',
    consent_relationship: a.consent_relationship || '',
    attending_user_id: a.attending_user_id ?? '',
    medicare_other: a.medicare_other || '',
    informant_name: a.informant_name || '',
    informant_address: a.informant_address || '',
    informant_relationship: a.informant_relationship || '',
    chief_complaint: a.chief_complaint || '',
    admitting_diagnosis: a.admitting_diagnosis || '',
    bp: a.bp || '',
    pulse: a.pulse ?? '',
    resp_rate: a.resp_rate ?? '',
    temperature: a.temperature ?? '',
    labor_notes: a.labor_notes || '',
    risk_flags: Array.isArray(a.risk_flags) ? a.risk_flags : [],
    consent_signed: Boolean(a.consent_signed),
    consent_by: a.consent_by || '',
    notes: a.notes || ''
  };
}

// Empty boxes are sent as null so the server never stores blank text.
export function formToPayload(form) {
  const text = (v) => (String(v ?? '').trim() === '' ? null : String(v).trim());
  const num = (v) => (String(v ?? '').trim() === '' ? null : Number(v));
  return {
    bed_number: String(form.bed_number ?? '').trim() === '' ? null : Number(form.bed_number),
    admission_type: text(form.admission_type),
    attending_physician: text(form.attending_physician),
    referred_by: text(form.referred_by),
    icd_code: text(form.icd_code),
    social_service_class: text(form.social_service_class),
    hospitalization_plan: text(form.hospitalization_plan),
    health_insurance_name: text(form.health_insurance_name),
    medicare: text(form.medicare) || 'none',
    philhealth_pin: String(form.medicare || '').startsWith('philhealth') ? text(form.philhealth_pin) : null,
    consent_signer_type: form.consent_signed ? text(form.consent_signer_type) : null,
    consent_relationship: form.consent_signed ? text(form.consent_relationship) : null,
    attending_user_id: String(form.attending_user_id ?? '').trim() === '' ? null : Number(form.attending_user_id),
    medicare_other: form.medicare === 'others' ? text(form.medicare_other) : null,
    informant_name: text(form.informant_name),
    informant_address: text(form.informant_address),
    informant_relationship: text(form.informant_relationship),
    chief_complaint: text(form.chief_complaint),
    admitting_diagnosis: text(form.admitting_diagnosis),
    bp: text(form.bp),
    pulse: num(form.pulse),
    resp_rate: num(form.resp_rate),
    temperature: num(form.temperature),
    labor_notes: text(form.labor_notes),
    risk_flags: form.risk_flags,
    consent_signed: form.consent_signed,
    consent_by: form.consent_signed ? text(form.consent_by) : null,
    notes: text(form.notes)
  };
}

export function AdmissionFields({ form, setForm, byGroup, ward, currentAdmissionId, disabled = false }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleFlag = (code) =>
    setForm((f) => ({
      ...f,
      risk_flags: f.risk_flags.includes(code) ? f.risk_flags.filter((c) => c !== code) : [...f.risk_flags, code]
    }));
  const flags = byGroup.risk_flag || [];
  const [staff, setStaff] = useState([]);
  useEffect(() => { admissionService.staff().then(setStaff).catch(() => setStaff([])); }, []);

  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-80">
      <BedPicker
        ward={ward}
        value={form.bed_number}
        currentAdmissionId={currentAdmissionId}
        disabled={disabled}
        onChange={(n) => setForm((f) => ({ ...f, bed_number: n }))}
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <Select
          label="Type of admission"
          hint="Filled in from her records. You can change it."
          value={form.admission_type}
          onChange={set('admission_type')}
        >
          <option value="">Choose…</option>
          {ADMISSION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select
          label="Attending doctor/midwife"
          value={form.attending_user_id}
          onChange={(e) => {
            const person = staff.find((m) => String(m.id) === e.target.value);
            setForm((f) => ({ ...f, attending_user_id: e.target.value, attending_physician: person ? person.name : '' }));
          }}
        >
          <option value="">Choose…</option>
          {form.attending_physician && !form.attending_user_id && (
            <option value="" disabled>{form.attending_physician}</option>
          )}
          {staff.filter((m) => ['doctor', 'midwife'].includes(m.role)).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
        </Select>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Select label="Coverage / benefits" value={form.medicare} onChange={set('medicare')}>
          {COVERAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        {String(form.medicare).startsWith('philhealth') && (
          <Input label="PhilHealth member PIN" placeholder="e.g. 12-345678901-2" hint={form.philhealth_pin ? undefined : 'Needed before a PhilHealth package can be ticked.'} value={form.philhealth_pin} onChange={set('philhealth_pin')} />
        )}
      </div>
      {form.medicare === 'others' && (
        <Input label="Coverage - please specify" value={form.medicare_other} onChange={set('medicare_other')} />
      )}

      <details className="rounded-lg border border-ink-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-700">More details (optional)</summary>
        <div className="mt-3 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="Referred by (physician or agency)"
              value={form.referred_by}
              onChange={set('referred_by')}
              placeholder="Leave empty if she came on her own"
            />
            <div>
              <Input label="ICD code (to be verified by the clinic doctor)" list="icd-obstetric" value={form.icd_code} onChange={set('icd_code')} placeholder="Search, e.g. O80" />
              <datalist id="icd-obstetric">
                {ICD_OBSTETRIC.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </datalist>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Select label="Social service classification" value={form.social_service_class} onChange={set('social_service_class')}>
              <option value="">Not classified</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </Select>
            <Input label="Hospitalization plan / company" value={form.hospitalization_plan} onChange={set('hospitalization_plan')} />
            <Input label="Health insurance name" value={form.health_insurance_name} onChange={set('health_insurance_name')} />
          </div>
          <div className="rounded-lg border border-ink-200 p-3">
            <p className="text-sm font-medium text-ink-700 mb-2">Data furnished by (informant)</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Name" value={form.informant_name} onChange={set('informant_name')} />
              <Input label="Relationship to patient" value={form.informant_relationship} onChange={set('informant_relationship')} placeholder="e.g. husband, mother" />
              <div className="sm:col-span-2">
                <Input label="Address of informant" value={form.informant_address} onChange={set('informant_address')} />
              </div>
            </div>
          </div>
        </div>
      </details>

      <Textarea
        label="Why did the patient come in?"
        rows={2}
        value={form.chief_complaint}
        onChange={set('chief_complaint')}
        placeholder="Example: contractions every 5 minutes since morning"
      />

      <div>
        <p className="text-sm font-medium text-ink-700 mb-2">Check-up on arrival</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Blood pressure" placeholder="e.g. 110/70" value={form.bp} onChange={set('bp')} />
          <Input label="Pulse (per min)" inputMode="numeric" value={form.pulse} onChange={set('pulse')} />
          <Input label="Breathing (per min)" inputMode="numeric" value={form.resp_rate} onChange={set('resp_rate')} />
          <Input label="Temperature (°C)" inputMode="decimal" value={form.temperature} onChange={set('temperature')} />
        </div>
      </div>

      <Textarea
        label="Labor notes"
        rows={2}
        hint="Contractions, how far open the cervix is, baby's heartbeat."
        value={form.labor_notes}
        onChange={set('labor_notes')}
      />

      <Input
        label="Admitting diagnosis (if known)"
        value={form.admitting_diagnosis}
        onChange={set('admitting_diagnosis')}
      />

      {flags.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-ink-700">Any warning signs?</p>
            <p className="text-xs text-ink-500">If any box is checked, think about sending the patient to a hospital.</p>
          </div>
          {[['history', 'From her history'], ['today', 'Found today']].map(([group, title]) => {
            const list = flags.filter((f) => (f.group || 'today') === group);
            if (!list.length) return null;
            return (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1.5">{title}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {list.map((f) => {
                    const on = form.risk_flags.includes(f.code);
                    const high = REFERRAL_LEVEL_FLAGS.includes(f.code);
                    return (
                      <label
                        key={f.code}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                          on ? (high ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900') : 'border-ink-200 bg-white text-ink-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-ink-300 text-primary-600"
                          checked={on}
                          onChange={() => toggleFlag(f.code)}
                        />
                        <span>{f.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-ink-200 p-3 space-y-3">
        <label className="flex items-start gap-2.5 text-sm text-ink-800 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-ink-300 text-primary-600"
            checked={form.consent_signed}
            onChange={(e) => setForm((f) => ({ ...f, consent_signed: e.target.checked }))}
          />
          <span>
            <span className="font-medium">Informed consent was signed</span>
            <span className="block text-xs text-ink-500">By the patient or her guardian before treatment.</span>
          </span>
        </label>
        {form.consent_signed && (
          <div className="grid sm:grid-cols-3 gap-3">
            <Select label="Signed by" value={form.consent_signer_type} onChange={set('consent_signer_type')}>
              <option value="">Choose…</option>
              {CONSENT_SIGNERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Input label="Name" placeholder="e.g. Maria Santos" value={form.consent_by} onChange={set('consent_by')} />
            <Input
              label="Relationship to patient"
              hint={form.consent_signer_type === 'guardian' ? 'Required for a guardian.' : undefined}
              placeholder="e.g. mother"
              value={form.consent_relationship}
              onChange={set('consent_relationship')}
            />
          </div>
        )}
      </div>

      <Textarea label="Other notes" rows={2} value={form.notes} onChange={set('notes')} />
    </fieldset>
  );
}

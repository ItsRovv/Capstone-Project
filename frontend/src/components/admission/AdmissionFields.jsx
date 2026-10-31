import { Input, Select, Textarea } from '../UI/Input';
import { BedPicker } from './BedPicker';

export const ADMISSION_TYPE_OPTIONS = [
  { value: 'new', label: 'New patient' },
  { value: 'old', label: 'Old patient' },
  { value: 'former_opd', label: 'Former OPD patient' }
];

export const emptyAdmissionForm = {
  bed_number: '',
  admission_type: '',
  attending_physician: '',
  referred_by: '',
  icd_code: '',
  social_service_class: '',
  hospitalization_plan: '',
  health_insurance_name: '',
  medicare: '',
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
    medicare: a.medicare || '',
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
    medicare: text(form.medicare),
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
        <Input
          label="Attending physician"
          placeholder="Name of the doctor"
          value={form.attending_physician}
          onChange={set('attending_physician')}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Input
          label="Referred by (physician or agency)"
          value={form.referred_by}
          onChange={set('referred_by')}
          placeholder="Leave empty if she came on her own"
        />
        <Input label="ICD code" value={form.icd_code} onChange={set('icd_code')} placeholder="e.g. Z34.0" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Select
          label="Social service classification"
          value={form.social_service_class}
          onChange={set('social_service_class')}
        >
          <option value="">Not classified</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </Select>
        <Select label="Medicare" value={form.medicare} onChange={set('medicare')}>
          <option value="">None</option>
          <option value="sss">SSS</option>
          <option value="gsis">GSIS</option>
          <option value="owwa">OWWA</option>
          <option value="indigent">Indigent</option>
          <option value="others">Others</option>
        </Select>
      </div>
      {form.medicare === 'others' && (
        <Input label="Medicare - please specify" value={form.medicare_other} onChange={set('medicare_other')} />
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Input
          label="Hospitalization plan / company"
          value={form.hospitalization_plan}
          onChange={set('hospitalization_plan')}
        />
        <Input
          label="Health insurance name"
          value={form.health_insurance_name}
          onChange={set('health_insurance_name')}
        />
      </div>

      <div className="rounded-lg border border-ink-200 p-3">
        <p className="text-sm font-medium text-ink-700 mb-2">Data furnished by (informant)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Name" value={form.informant_name} onChange={set('informant_name')} />
          <Input
            label="Relationship to patient"
            value={form.informant_relationship}
            onChange={set('informant_relationship')}
            placeholder="Husband, mother, herself…"
          />
          <div className="sm:col-span-2">
            <Input label="Address of informant" value={form.informant_address} onChange={set('informant_address')} />
          </div>
        </div>
      </div>

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
          <Input label="Blood pressure" placeholder="110/70" value={form.bp} onChange={set('bp')} />
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
        <div>
          <p className="text-sm font-medium text-ink-700">Any warning signs?</p>
          <p className="text-xs text-ink-500 mb-2">If any box is checked, think about sending the patient to a hospital.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {flags.map((f) => (
              <label
                key={f.code}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                  form.risk_flags.includes(f.code) ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-ink-200 bg-white text-ink-700'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-ink-300 text-primary-600"
                  checked={form.risk_flags.includes(f.code)}
                  onChange={() => toggleFlag(f.code)}
                />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
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
          <Input label="Signed by" placeholder="Full name" value={form.consent_by} onChange={set('consent_by')} />
        )}
      </div>

      <Textarea label="Other notes" rows={2} value={form.notes} onChange={set('notes')} />
    </fieldset>
  );
}

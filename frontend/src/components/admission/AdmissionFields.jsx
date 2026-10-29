import { Input, Textarea, Select } from '../UI/Input';
import { BedPicker } from './BedPicker';

export const emptyAdmissionForm = {
  bed_number: '',
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
  philhealth_package: '',
  notes: ''
};

export function admissionToForm(a = {}) {
  return {
    bed_number: a.bed_number ?? '',
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
    philhealth_package: a.philhealth_package || '',
    notes: a.notes || ''
  };
}

// Empty boxes are sent as null so the server never stores blank text.
export function formToPayload(form) {
  const text = (v) => (String(v ?? '').trim() === '' ? null : String(v).trim());
  const num = (v) => (String(v ?? '').trim() === '' ? null : Number(v));
  return {
    bed_number: String(form.bed_number ?? '').trim() === '' ? null : Number(form.bed_number),
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
    philhealth_package: text(form.philhealth_package),
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
  const packages = byGroup.package || [];

  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-80">
      <BedPicker
        ward={ward}
        value={form.bed_number}
        currentAdmissionId={currentAdmissionId}
        disabled={disabled}
        onChange={(n) => setForm((f) => ({ ...f, bed_number: n }))}
      />

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

      {packages.length > 0 && (
        <Select
          label="PhilHealth package"
          hint="Choose only if the patient will use PhilHealth. You can change it later."
          value={form.philhealth_package}
          onChange={set('philhealth_package')}
        >
          <option value="">No PhilHealth / not sure yet</option>
          {packages.map((p) => (
            <option key={p.code} value={p.code}>{p.label}</option>
          ))}
        </Select>
      )}

      <Textarea label="Other notes" rows={2} value={form.notes} onChange={set('notes')} />
    </fieldset>
  );
}

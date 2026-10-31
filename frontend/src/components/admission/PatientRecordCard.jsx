import { formatDay } from '../../lib/admission';

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="text-sm text-ink-900 mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
}

/**
 * The read-only top of the Admission and Discharge Record. Everything here comes from the
 * patient profile (and her pregnancy), so the midwife never retypes it and cannot change it here.
 */
export function PatientRecordCard({ record, pregnancy }) {
  if (!record) return null;
  const name = [record.last_name, record.first_name].filter(Boolean).join(', ');
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-ink-900">Patient information</h3>
        <p className="text-xs text-ink-500">From her profile. Not editable here.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
        {record.allergies && (
          <div className="col-span-2 md:col-span-4 rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-500">Alert - allergic to</p>
            <p className="text-sm text-red-900 mt-0.5">{record.allergies}</p>
          </div>
        )}
        <Field label="Patient's name" value={name} />
        <Field label="Birth date" value={record.birth_date ? formatDay(record.birth_date) : null} />
        <Field label="Age" value={record.age ?? null} />
        <Field label="Sex" value={record.sex} />
        <Field label="Birthplace" value={record.birthplace} />
        <Field label="Civil status" value={record.civil_status} />
        <Field label="Nationality" value={record.nationality} />
        <Field label="Religion" value={record.religion} />
        <Field label="Occupation" value={record.occupation} />
        <Field label="PhilHealth PIN" value={record.philhealth_pin} />
        <div className="col-span-2"><Field label="Employer (type of business)" value={record.employer} /></div>
        <Field label="Employer address" value={record.employer_address} />
        <Field label="Employer tel. no." value={record.employer_tel} />
        <div className="col-span-2 md:col-span-3"><Field label="Permanent address" value={record.address} /></div>
        <Field label="Tel. no." value={record.contact_number} />
        <div className="col-span-2"><Field label="Mother's name" value={record.mother_name} /></div>
        <div className="col-span-2"><Field label="Father's name" value={record.father_name} /></div>
        <div className="col-span-2"><Field label="Father's address" value={record.father_address} /></div>
        <Field label="Father's tel. no." value={record.father_tel} />
        {pregnancy && (
          <>
            <Field label="Last menstrual period" value={pregnancy.lmp ? formatDay(pregnancy.lmp) : null} />
            <Field label="Expected delivery date" value={pregnancy.edd ? formatDay(pregnancy.edd) : null} />
            <Field label="Age of gestation" value={pregnancy.weeks} />
          </>
        )}
      </div>
    </div>
  );
}

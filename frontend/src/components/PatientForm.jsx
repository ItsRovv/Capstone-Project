import { useState, useRef, useMemo, useEffect } from 'react';
import { Input, Select, Textarea } from './UI/Input';
import { Button } from './UI/Button';
import {
  MEDICAL_CONDITIONS,
  blankMedicalInfo,
  blankPersonalInfo
} from '../constants/medicalConditions';

const blank = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  age: '',
  sex: 'Female',
  address: '',
  contact_number: '',
  emergency_contact: '',
  allergies: ''
};

const JUBAN_BARANGAYS = [
  'Añog', 'Aroroy', 'Bacolod', 'Binanuahan', 'Biriran',
  'Buraburan', 'Calateo', 'Calmayon', 'Caruhayon', 'Catanagan',
  'Catanusan', 'Cogon', 'Embarcadero', 'Guruyan', 'Lajong',
  'Maalo', 'North Poblacion', 'Puting Sapa', 'Rangas', 'Sablayan',
  'Sipaya', 'South Poblacion', 'Taboc', 'Tinago', 'Tughan'
];

const ADDRESS_SUGGESTIONS = [
  ...JUBAN_BARANGAYS.map((b) => `${b}, Juban, Sorsogon`),
  ...JUBAN_BARANGAYS.flatMap((b) =>
    Array.from({ length: 7 }, (_, i) => `Purok ${i + 1}, ${b}, Juban, Sorsogon`)
  ),
];

const SECTIONS = [
  { id: 'personal', label: 'Personal Information' },
  { id: 'medical', label: 'Medical Information' }
];

const ALLERGY_SUGGESTIONS = [
  'Penicillin', 'Shellfish', 'Latex', 'Sulfa drugs', 'Aspirin', 'Ibuprofen',
  'Eggs', 'Milk / Dairy', 'Peanuts', 'Tree nuts', 'Soy', 'Wheat / Gluten',
  'Bee stings', 'Dust mites', 'Pollen', 'Mold', 'Perfume / Fragrance'
];

const MEDICATION_SUGGESTIONS = [
  'Ferrous sulfate', 'Folic acid', 'Calcium carbonate', 'Prenatal vitamins',
  'Vitamin D', 'Vitamin B12', 'Omega-3 / Fish oil', 'Iron supplements',
  'Magnesium', 'Zinc', 'Multivitamins', 'Probiotics'
];

function mergeMedicalInfo(initial) {
  const blankInfo = blankMedicalInfo();
  if (!initial) return blankInfo;
  return {
    drug_food_allergies: initial.drug_food_allergies?.length
      ? initial.drug_food_allergies
      : blankInfo.drug_food_allergies,
    medications_supplements: initial.medications_supplements?.length
      ? initial.medications_supplements
      : blankInfo.medications_supplements,
    illness_history: MEDICAL_CONDITIONS.map((condition) => {
      const existing = initial.illness_history?.find((row) => row.condition === condition);
      return existing || { condition, personal: false, family: false, remarks: '' };
    }),
    high_risk_behavior: {
      smoking: { ...blankInfo.high_risk_behavior.smoking, ...(initial.high_risk_behavior?.smoking || {}) },
      alcohol_intake: { ...blankInfo.high_risk_behavior.alcohol_intake, ...(initial.high_risk_behavior?.alcohol_intake || {}) }
    },
    other_conditions: initial.other_conditions?.length
      ? initial.other_conditions
      : blankInfo.other_conditions
  };
}

function splitName(name) {
  if (!name) return { first: '', last: '' };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) };
}

function mergePersonalInfo(initial, patientTopLevel) {
  const blankInfo = blankPersonalInfo();
  if (!initial) {
    // If no personal_info, seed from top-level patient fields for edit mode
    if (patientTopLevel) {
      const { first: momFirst, last: momLast } = splitName(patientTopLevel.name || '');
      blankInfo.mommy.first_name = patientTopLevel.first_name || momFirst;
      blankInfo.mommy.last_name = patientTopLevel.last_name || momLast;
      blankInfo.mommy.date_of_birth = patientTopLevel.date_of_birth || '';
      blankInfo.mommy.age = patientTopLevel.age || '';
      blankInfo.mommy.sex = patientTopLevel.sex || 'Female';
      blankInfo.mommy.address = patientTopLevel.address || '';
      blankInfo.mommy.contact_number = patientTopLevel.contact_number || '';
      blankInfo.emergency_contact.name = patientTopLevel.emergency_contact || '';
    }
    return blankInfo;
  }

  const mommy = { ...blankInfo.mommy, ...(initial.mommy || {}) };
  const daddy = { ...blankInfo.daddy, ...(initial.daddy || {}) };
  const emergency = { ...blankInfo.emergency_contact, ...(initial.emergency_contact || {}) };

  // Backward compat: old data used `name`, `birthday`, `phone` instead of
  // `first_name`/`last_name`, `date_of_birth`, `contact_number`.
  if (initial.mommy) {
    if (!mommy.first_name && initial.mommy.name) {
      const { first, last } = splitName(initial.mommy.name);
      mommy.first_name = first;
      mommy.last_name = last;
    }
    if (!mommy.date_of_birth && initial.mommy.birthday) {
      mommy.date_of_birth = initial.mommy.birthday;
    }
    if (!mommy.contact_number && initial.mommy.phone) {
      mommy.contact_number = initial.mommy.phone;
    }
  }

  // If still missing (new patient or incomplete personal_info), seed from top-level
  if (patientTopLevel) {
    if (!mommy.first_name) mommy.first_name = patientTopLevel.first_name || '';
    if (!mommy.last_name) mommy.last_name = patientTopLevel.last_name || '';
    if (!mommy.date_of_birth) mommy.date_of_birth = patientTopLevel.date_of_birth || '';
    if (!mommy.age) mommy.age = patientTopLevel.age || '';
    if (!mommy.sex) mommy.sex = patientTopLevel.sex || 'Female';
    if (!mommy.address) mommy.address = patientTopLevel.address || '';
    if (!mommy.contact_number) mommy.contact_number = patientTopLevel.contact_number || '';
    if (!emergency.name) emergency.name = patientTopLevel.emergency_contact || '';
  }

  return { mommy, daddy, emergency_contact: emergency };
}

function AddressAutocomplete({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value || '');

  useEffect(() => {
    setInput(value || '');
  }, [value]);

  const filtered = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.toLowerCase();
    return ADDRESS_SUGGESTIONS.filter((s) => s.toLowerCase().includes(q)).slice(0, 8);
  }, [input]);

  function handleSelect(suggestion) {
    setInput(suggestion);
    onChange({ target: { value: suggestion } });
    setOpen(false);
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className="relative">
      <Input
        label={label}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          onChange(e);
          setOpen(true);
        }}
        onFocus={() => {
          if (input.trim()) setOpen(true);
        }}
        onBlur={handleBlur}
        placeholder="Start typing barangay or purok..."
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 w-full bg-white border border-ink-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
          {filtered.map((s, i) => (
            <li
              key={i}
              className="px-3 py-2 text-sm hover:bg-ink-50 cursor-pointer"
              onMouseDown={() => handleSelect(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PatientForm({ initial, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({ ...blank, ...(initial || {}) });
  const [personalInfo, setPersonalInfo] = useState(mergePersonalInfo(initial?.personal_info, initial));
  const [medicalInfo, setMedicalInfo] = useState(mergeMedicalInfo(initial?.medical_info));
  const [error, setError] = useState(null);
  const [addToQueue, setAddToQueue] = useState(false);
  const [section, setSection] = useState('personal');
  const [expanded, setExpanded] = useState({
    patient: true,
    daddy: true,
    emergency: true,
    allergies: true,
    medications: true,
    illness: true
  });

  const personalRef = useRef(null);
  const medicalRef = useRef(null);

  function toggleExpand(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Sex for isOb check comes from the patient (mommy) sub-form, not form.sex
  const isOb = (personalInfo.mommy.sex || 'Female').toLowerCase() !== 'male';

  function scrollTo(id) {
    const ref = id === 'personal' ? personalRef : medicalRef;
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setSection(id);
  }

  function updatePerson(who, field) {
    return (e) => {
      const value = e.target.value;
      setPersonalInfo((p) => ({ ...p, [who]: { ...p[who], [field]: value } }));
    };
  }

  function updateEmergency(field) {
    return (e) => {
      const value = e.target.value;
      setPersonalInfo((p) => ({ ...p, emergency_contact: { ...p.emergency_contact, [field]: value } }));
    };
  }

  function updateListField(field, text) {
    setMedicalInfo((m) => ({
      ...m,
      [field]: text.split(',').map((v) => v.trim()).filter(Boolean)
    }));
  }

  function appendToListField(field, item) {
    setMedicalInfo((m) => {
      const current = m[field];
      if (current.includes(item)) return m;
      return { ...m, [field]: [...current, item] };
    });
  }

  function addOtherCondition() {
    setMedicalInfo((m) => ({
      ...m,
      other_conditions: [...m.other_conditions, { condition: '', personal: false, family: false, remarks: '' }]
    }));
  }

  function updateOtherCondition(index, key, value) {
    setMedicalInfo((m) => ({
      ...m,
      other_conditions: m.other_conditions.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      )
    }));
  }

  function removeOtherCondition(index) {
    setMedicalInfo((m) => ({
      ...m,
      other_conditions: m.other_conditions.filter((_, i) => i !== index)
    }));
  }

  function updateIllnessRow(index, key, value) {
    setMedicalInfo((m) => ({
      ...m,
      illness_history: m.illness_history.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      )
    }));
  }

  function updateHighRisk(kind, key, value) {
    setMedicalInfo((m) => ({
      ...m,
      high_risk_behavior: {
        ...m.high_risk_behavior,
        [kind]: { ...m.high_risk_behavior[kind], [key]: value }
      }
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const patient = personalInfo.mommy;
    if (!patient.first_name.trim() || !patient.last_name.trim()) {
      setError('First and last name are required.');
      scrollTo('personal');
      return;
    }
    setError(null);

    // Derive top-level patient fields from the sub-form data
    const emergencyStr =
      personalInfo.emergency_contact.name || personalInfo.emergency_contact.phone || '';

    const payload = {
      first_name: patient.first_name,
      last_name: patient.last_name,
      date_of_birth: patient.date_of_birth || null,
      age: patient.age || null,
      sex: patient.sex || 'Female',
      address: patient.address || null,
      contact_number: patient.contact_number || null,
      emergency_contact: emergencyStr || null,
      personal_info: personalInfo,
      medical_info: medicalInfo
    };

    onSubmit(payload, { addToQueue });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-ink-100">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
              section === s.id
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Personal Information ── */}
      <section ref={personalRef} className="space-y-6">
        <h3 className="text-lg font-semibold text-ink-800">Personal Information</h3>

        {/* Patient / Mommy */}
        <ExpandableSection
          title={isOb ? "Mommy's Information" : "Patient's Information"}
          expanded={expanded.patient}
          onToggle={() => toggleExpand('patient')}
        >
          <PersonSubForm
            person={personalInfo.mommy}
            onChange={(field) => updatePerson('mommy', field)}
            useAutocomplete
            required
          />
        </ExpandableSection>

        {/* Daddy — OB patients only */}
        {isOb && (
          <ExpandableSection
            title="Daddy's Information"
            expanded={expanded.daddy}
            onToggle={() => toggleExpand('daddy')}
          >
            <PersonSubForm
              person={personalInfo.daddy}
              onChange={(field) => updatePerson('daddy', field)}
              useAutocomplete
            />
          </ExpandableSection>
        )}

        {/* Emergency contact */}
        <ExpandableSection
          title="In case of emergency, please contact:"
          expanded={expanded.emergency}
          onToggle={() => toggleExpand('emergency')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" value={personalInfo.emergency_contact.name || ''} onChange={updateEmergency('name')} />
            <Select label="Relationship" value={personalInfo.emergency_contact.relationship || ''} onChange={updateEmergency('relationship')}>
              <option value="">Not specified</option>
              <option value="Husband">Husband</option>
              <option value="Wife">Wife</option>
              <option value="Father">Father</option>
              <option value="Mother">Mother</option>
              <option value="Guardian">Guardian</option>
              <option value="Sibling">Sibling</option>
              <option value="Son">Son</option>
              <option value="Daughter">Daughter</option>
              <option value="Grandparent">Grandparent</option>
              <option value="Aunt / Uncle">Aunt / Uncle</option>
              <option value="Cousin">Cousin</option>
              <option value="Neighbor / Friend">Neighbor / Friend</option>
              <option value="Barangay Official">Barangay Official</option>
              <option value="Other">Other</option>
            </Select>
            <Input type="date" label="Birthday" value={personalInfo.emergency_contact.birthday || ''} onChange={updateEmergency('birthday')} />
            <Input label="Age" value={personalInfo.emergency_contact.age || ''} onChange={updateEmergency('age')} />
            <Input label="Phone number" value={personalInfo.emergency_contact.phone || ''} onChange={updateEmergency('phone')} />
            <Input label="FB Messenger" value={personalInfo.emergency_contact.fb_messenger || ''} onChange={updateEmergency('fb_messenger')} />
          </div>
          <div className="mt-4">
            <AddressAutocomplete
              label="Address"
              value={personalInfo.emergency_contact.address || ''}
              onChange={updateEmergency('address')}
            />
          </div>
        </ExpandableSection>
      </section>

      {/* ── Medical Information ── */}
      <section ref={medicalRef} className="space-y-6 pt-2">
        <h3 className="text-lg font-semibold text-ink-800">Medical Information</h3>

        {/* Allergies & Medications — leveled with suggestion chips */}
        <ExpandableSection
          title="Allergies & Medications"
          expanded={expanded.allergies}
          onToggle={() => toggleExpand('allergies')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5 min-h-[2.5rem]">
                Drug & Food Allergies (comma-separated)
              </label>
            <textarea
              className="input-base resize-none h-24 w-full"
              value={medicalInfo.drug_food_allergies.join(', ')}
              onChange={(e) => updateListField('drug_food_allergies', e.target.value)}
              placeholder="e.g. Penicillin, Shellfish, Latex"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ALLERGY_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => appendToListField('drug_food_allergies', s)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    medicalInfo.drug_food_allergies.includes(s)
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-ink-200 text-ink-600 hover:border-primary-300 hover:text-primary-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5 min-h-[2.5rem]">
              Medications & Supplements (comma-separated)
            </label>
            <textarea
              className="input-base resize-none h-24 w-full"
              value={medicalInfo.medications_supplements.join(', ')}
              onChange={(e) => updateListField('medications_supplements', e.target.value)}
              placeholder="e.g. Ferrous sulfate, Folic acid"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {MEDICATION_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => appendToListField('medications_supplements', s)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    medicalInfo.medications_supplements.includes(s)
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-ink-200 text-ink-600 hover:border-primary-300 hover:text-primary-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        </ExpandableSection>

        <ExpandableSection
          title="Past & Present Illness / Health Problems"
          expanded={expanded.illness}
          onToggle={() => toggleExpand('illness')}
        >
        <div className="overflow-x-auto rounded-lg border border-ink-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-3 py-2">Health Problem</th>
                  <th className="px-2 py-2 text-center">Personal</th>
                  <th className="px-2 py-2 text-center">Family</th>
                  <th className="px-2 py-2 text-center">None</th>
                  <th className="text-left px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {medicalInfo.illness_history.map((row, i) => (
                  <tr key={row.condition}>
                    <td className="px-3 py-2 text-ink-700 whitespace-nowrap">{row.condition}</td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!row.personal}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateIllnessRow(i, 'personal', checked);
                          if (checked) updateIllnessRow(i, 'none', false);
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!row.family}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateIllnessRow(i, 'family', checked);
                          if (checked) updateIllnessRow(i, 'none', false);
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!row.personal && !row.family}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            updateIllnessRow(i, 'personal', false);
                            updateIllnessRow(i, 'family', false);
                          }
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={row.remarks || ''}
                        onChange={(e) => updateIllnessRow(i, 'remarks', e.target.value)}
                        className="w-full min-w-[120px] px-2 py-1 rounded border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2 font-medium text-ink-700" colSpan={5}>High-Risk Behavior</td>
                </tr>
                {['smoking', 'alcohol_intake'].map((kind) => (
                  <tr key={kind}>
                    <td className="px-3 py-2 text-ink-700 whitespace-nowrap capitalize">
                      {kind === 'alcohol_intake' ? 'Alcohol Intake' : 'Smoking'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!medicalInfo.high_risk_behavior[kind].personal}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateHighRisk(kind, 'personal', checked);
                          if (checked) updateHighRisk(kind, 'family', false);
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!medicalInfo.high_risk_behavior[kind].family}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateHighRisk(kind, 'family', checked);
                          if (checked) updateHighRisk(kind, 'personal', false);
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!medicalInfo.high_risk_behavior[kind].personal && !medicalInfo.high_risk_behavior[kind].family}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            updateHighRisk(kind, 'personal', false);
                            updateHighRisk(kind, 'family', false);
                          }
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={medicalInfo.high_risk_behavior[kind].remarks || ''}
                        onChange={(e) => updateHighRisk(kind, 'remarks', e.target.value)}
                        className="w-full min-w-[120px] px-2 py-1 rounded border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      />
                    </td>
                  </tr>
                ))}
                {/* Others */}
                {medicalInfo.other_conditions.length > 0 && (
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-700" colSpan={5}>Others</td>
                  </tr>
                )}
                {medicalInfo.other_conditions.map((row, i) => (
                  <tr key={`other-${i}`}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.condition || ''}
                        onChange={(e) => updateOtherCondition(i, 'condition', e.target.value)}
                        placeholder="Specify condition"
                        className="w-full min-w-[140px] px-2 py-1 rounded border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!row.personal}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateOtherCondition(i, 'personal', checked);
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!row.family}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateOtherCondition(i, 'family', checked);
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!row.personal && !row.family}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            updateOtherCondition(i, 'personal', false);
                            updateOtherCondition(i, 'family', false);
                          }
                        }}
                        className="w-4 h-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={row.remarks || ''}
                          onChange={(e) => updateOtherCondition(i, 'remarks', e.target.value)}
                          className="w-full min-w-[80px] px-2 py-1 rounded border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        />
                        <button
                          type="button"
                          onClick={() => removeOtherCondition(i)}
                          className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2" colSpan={5}>
                    <button
                      type="button"
                      onClick={addOtherCondition}
                      className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                    >
                      + Add other condition
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </ExpandableSection>
      </section>

      <div className="flex items-center justify-between pt-2 border-t border-ink-100">
        {!initial?.id && (
          <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={addToQueue}
              onChange={(e) => setAddToQueue(e.target.checked)}
              className="w-4 h-4 accent-primary-600"
            />
            Add to queue after saving
          </label>
        )}
        <div className="flex justify-end gap-2 ml-auto">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={submitting}>
            {initial?.id ? 'Save changes' : 'Add patient'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ExpandableSection({ title, expanded, onToggle, children }) {
  return (
    <div className="border border-ink-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-ink-50/50 hover:bg-ink-100/50 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-ink-800">{title}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={`text-ink-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && <div className="px-4 py-4">{children}</div>}
    </div>
  );
}

function PersonSubForm({ title, person, onChange, useAutocomplete, required }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-ink-800 mb-3">{title}</h4>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="First name" value={person.first_name || ''} onChange={onChange('first_name')} required={required} />
          <Input label="Last name" value={person.last_name || ''} onChange={onChange('last_name')} required={required} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            type="date"
            label="Date of birth"
            value={person.date_of_birth || ''}
            onChange={onChange('date_of_birth')}
          />
          <Input
            type="number"
            label="Age"
            value={person.age || ''}
            onChange={onChange('age')}
            min="0"
            max="150"
          />
          <Select label="Sex" value={person.sex || 'Female'} onChange={onChange('sex')}>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Blood Type" value={person.blood_type || ''} onChange={onChange('blood_type')}>
            <option value="">Not specified</option>
            <option value="O-">O-</option>
            <option value="O+">O+</option>
            <option value="A-">A-</option>
            <option value="A+">A+</option>
            <option value="B-">B-</option>
            <option value="B+">B+</option>
            <option value="AB-">AB-</option>
            <option value="AB+">AB+</option>
          </Select>
          <Select label="Civil Status" value={person.civil_status || ''} onChange={onChange('civil_status')}>
            <option value="">Not specified</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Widowed">Widowed</option>
            <option value="Separated">Separated</option>
            <option value="Divorced">Divorced</option>
            <option value="Annulled">Annulled</option>
            <option value="Live-in / Common-law">Live-in / Common-law</option>
          </Select>
          <Select label="Occupation" value={person.occupation || ''} onChange={onChange('occupation')}>
            <option value="">Not specified</option>
            <option value="Housewife / Stay-at-home">Housewife / Stay-at-home</option>
            <option value="Farmer">Farmer</option>
            <option value="Fisherman / Fish vendor">Fisherman / Fish vendor</option>
            <option value="Government employee">Government employee</option>
            <option value="Teacher">Teacher</option>
            <option value="Nurse / Health worker">Nurse / Health worker</option>
            <option value="Midwife">Midwife</option>
            <option value="Barangay health worker">Barangay health worker</option>
            <option value="Self-employed / Business">Self-employed / Business</option>
            <option value="Vendor / Sari-sari store">Vendor / Sari-sari store</option>
            <option value="Construction worker">Construction worker</option>
            <option value="Driver (tricycle/jeepney)">Driver (tricycle/jeepney)</option>
            <option value="Factory worker">Factory worker</option>
            <option value="Domestic helper">Domestic helper</option>
            <option value="Office worker / Clerk">Office worker / Clerk</option>
            <option value="Student">Student</option>
            <option value="Unemployed">Unemployed</option>
            <option value="Retired">Retired</option>
            <option value="Other">Other</option>
          </Select>
          <Input
            label="Contact number"
            value={person.contact_number || ''}
            onChange={onChange('contact_number')}
            placeholder="0917-XXX-XXXX"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Birthplace" value={person.birthplace || ''} onChange={onChange('birthplace')} />
          <Input label="Nationality" value={person.nationality || ''} onChange={onChange('nationality')} placeholder="Filipino" />
          <Input label="Religion" value={person.religion || ''} onChange={onChange('religion')} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Employer (type of business)" value={person.employer || ''} onChange={onChange('employer')} />
          <Input label="Employer address" value={person.employer_address || ''} onChange={onChange('employer_address')} />
          <Input label="Employer tel. no." value={person.employer_tel || ''} onChange={onChange('employer_tel')} placeholder="0917-XXX-XXXX" />
        </div>

        <Input
          label="PhilHealth PIN (Identification Number)"
          value={person.philhealth_pin || ''}
          onChange={onChange('philhealth_pin')}
          placeholder="XX-XXXXXXXXX-X"
        />

        <Input label="FB Messenger" value={person.fb_messenger || ''} onChange={onChange('fb_messenger')} />

        {useAutocomplete ? (
          <AddressAutocomplete
            label="Address"
            value={person.address || ''}
            onChange={onChange('address')}
          />
        ) : (
          <Input
            label="Address"
            value={person.address || ''}
            onChange={onChange('address')}
          />
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Input, Select, Textarea } from './UI/Input';
import { Button } from './UI/Button';
import { useToast } from './UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { pregnancyService } from '../services/pregnancyService';
import { DeliveryLocationField } from './ConsultationForm';

const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const FETAL_POSITIONS = [
  { value: 'C', label: 'Cephalic (C)' },
  { value: 'B', label: 'Breech (B)' },
  { value: 'O', label: 'Oblique (O)' },
  { value: 'T', label: 'Transverse (T)' }
];
const COUNSELING_ITEMS = [
  'Pag-iwas sa alcohol, tobacco, at illegal na droga',
  'Tamang nutrisyon at pag-inom ng mga prenatal vitamins',
  'Danger Signs in Early Pregnancy'
];

function addDays(iso, days) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function weeksBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return '';
  const diff = new Date(toIso) - new Date(fromIso);
  if (diff < 0) return '';
  return `${Math.floor(diff / (7 * 24 * 60 * 60 * 1000))} weeks`;
}

const blankBaseline = {
  lmp: '',
  edd: '',
  height_cm: '',
  ob_index: '',
  blood_type: '',
  pregnancy_number: ''
};

const blankHistoryRow = {
  delivery_date: '',
  delivery_type: '',
  birth_outcome: '',
  children_count: '',
  pregnancy_hypertension: '',
  preeclampsia: '',
  bleeding: ''
};

const HISTORY_FIELDS = [
  { key: 'delivery_date', label: 'Date of delivery', type: 'date' },
  { key: 'delivery_type', label: 'Type of Delivery', options: [['N', 'Normal (N)'], ['CS', 'Caesarean (CS)']] },
  { key: 'birth_outcome', label: 'Birth Outcome', options: [['A', 'Alive (A)'], ['M', 'Miscarriage (M)'], ['S', 'Stillbirth (S)']] },
  { key: 'children_count', label: 'No. of children delivered', options: [['S', 'Single (S)'], ['T', 'Twins (T)'], ['M', 'Multiple']] },
  { key: 'pregnancy_hypertension', label: 'Pregnancy Induced Hypertension', options: [['Y', 'Y'], ['N', 'N']] },
  { key: 'preeclampsia', label: 'Preeclampsia / Eclampsia', options: [['PE', 'PE'], ['E', 'E'], ['N', 'N']] },
  { key: 'bleeding', label: 'Bleeding during/after pregnancy', options: [['Y', 'Y'], ['N', 'N']] }
];

const blankVisit = {
  visit_date: new Date().toISOString().slice(0, 10),
  trimester: '',
  aog_lmp: '',
  aog_utz: '',
  bp: '',
  temperature: '',
  pulse_rate: '',
  spo2: '',
  weight_kg: '',
  fundic_height_cm: '',
  fetal_heart_tone: '',
  fetal_position: '',
  lab_hemoglobin: '',
  lab_urinalysis: '',
  lab_stis: '',
  swelling_face_hands: '',
  vaginal_bleeding: '',
  vaginal_infection: '',
  counseling: [],
  rx_supplements: '',
  remarks: '',
  next_visit: '',
  delivery_location: '',
  provider_name: ''
};

export function PrenatalConsultationForm({ patientId, initial, submitting, onCancel, onSubmit, pregnancyContext, trimester: queueTrimester }) {
  const toast = useToast();
  const { user } = useAuth();
  const providerName = user?.name || '';

  const [pregnancy, setPregnancy] = useState(null);
  const [loadingPreg, setLoadingPreg] = useState(true);
  const [baseline, setBaseline] = useState(blankBaseline);
  const [historyRows, setHistoryRows] = useState([]);
  const [visit, setVisit] = useState({ ...blankVisit, provider_name: providerName });

  const ongoing = useMemo(() => {
    if (!pregnancy) return null;
    return ['delivered', 'discharged', 'completed'].includes((pregnancy.status || '').toLowerCase()) ? null : pregnancy;
  }, [pregnancy]);
  const showBaseline = !loadingPreg && !ongoing && !initial?.id;

  // Trimester: what the queue said, else suggested from weeks at the visit date.
  const suggestedTrimester = useMemo(() => {
    if (queueTrimester) return queueTrimester;
    const lmp = ongoing?.lmp || baseline.lmp;
    let weeks = ongoing?.weeks != null && ongoing.weeks !== '' ? Number(ongoing.weeks) : null;
    if (weeks == null && lmp && visit.visit_date) {
      weeks = Math.max(0, Math.floor((new Date(visit.visit_date) - new Date(lmp)) / (7 * 86400000)));
    }
    if (weeks == null || Number.isNaN(weeks)) return null;
    return weeks < 14 ? '1' : weeks < 28 ? '2' : '3';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueTrimester, ongoing?.id, ongoing?.weeks, ongoing?.lmp, baseline.lmp, visit.visit_date]);

  useEffect(() => {
    if (suggestedTrimester && !visit.trimester) {
      setVisit((v) => ({ ...v, trimester: suggestedTrimester }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTrimester]);

  // Where this visit will land on the Pregnancy Tracking Form — same column
  // math the backend uses (weeks → month of pregnancy → column group).
  const trackingTarget = useMemo(() => {
    const when = new Date(visit.visit_date);
    if (Number.isNaN(when.getTime())) return null;
    const lmp = ongoing?.lmp || baseline.lmp;
    let weeks = ongoing?.weeks != null && ongoing.weeks !== '' ? Number(ongoing.weeks) : null;
    if ((weeks == null || Number.isNaN(weeks)) && lmp) {
      weeks = Math.max(0, Math.floor((when - new Date(lmp)) / (7 * 86400000)));
    }
    const month = Number.isFinite(weeks)
      ? Math.min(10, Math.max(1, Math.ceil(weeks / 4.345)))
      : ({ '1': 2, '2': 5, '3': 9 }[String(visit.trimester)] || 9);
    return {
      monthYear: when.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      label: month <= 9 ? `Month ${month}` : 'Postpartum (+)'
    };
  }, [ongoing, baseline.lmp, visit.visit_date, visit.trimester]);

  useEffect(() => {
    setVisit((v) => (v.provider_name ? v : { ...v, provider_name: providerName }));
  }, [providerName]);

  // Seed fields from an existing consultation when editing.
  useEffect(() => {
    if (!initial?.prenatal_data) return;
    const data = initial.prenatal_data;
    setVisit((v) => ({ ...v, ...Object.fromEntries(Object.keys(blankVisit).map((k) => [k, data[k] ?? v[k]])) }));
    if (data.delivery_location) {
      setVisit((v) => ({ ...v, delivery_location: data.delivery_location }));
    }
  }, [initial?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!patientId) {
      setLoadingPreg(false);
      return;
    }
    pregnancyService
      .listForPatient(patientId)
      .then((rows) => {
        if (!cancelled) setPregnancy(rows?.[0] || null);
      })
      .catch(() => {
        if (!cancelled) setPregnancy(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreg(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Auto-compute EDD from baseline LMP.
  useEffect(() => {
    setBaseline((b) => ({ ...b, edd: addDays(b.lmp, 280) }));
  }, [baseline.lmp]);

  // AOG by LMP for the visit = ongoing pregnancy LMP or the baseline being filled in.
  useEffect(() => {
    const lmp = ongoing?.lmp || baseline.lmp;
    setVisit((v) => ({ ...v, aog_lmp: weeksBetween(lmp, v.visit_date) }));
  }, [ongoing?.lmp, baseline.lmp, visit.visit_date]);

  const updateBaseline = (field) => (e) => setBaseline((b) => ({ ...b, [field]: e.target.value }));

  function updateHistoryRow(index, key, value) {
    setHistoryRows((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addHistoryRow() {
    setHistoryRows((rows) => (rows.length >= 6 ? rows : [...rows, { ...blankHistoryRow }]));
  }

  function removeHistoryRow(index) {
    setHistoryRows((rows) => rows.filter((_, i) => i !== index));
  }
  const updateVisit = (field) => (e) => setVisit((v) => ({ ...v, [field]: e.target.value }));

  function toggleCounseling(item) {
    setVisit((v) => ({
      ...v,
      counseling: v.counseling.includes(item)
        ? v.counseling.filter((c) => c !== item)
        : [...v.counseling, item]
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!patientId && !initial?.id) {
      toast.error('Missing patient');
      return;
    }
    try {
      let baselineCreated = false;
      if (showBaseline) {
        if (baseline.lmp) {
          const created = await pregnancyService.create(patientId, {
            lmp: baseline.lmp || null,
            edd: baseline.edd || null,
            aog: visit.aog_lmp || null,
            ob_index: baseline.ob_index || null,
            blood_type: baseline.blood_type || null,
            baseline_weight_kg: visit.weight_kg || null,
            baseline_height_cm: baseline.height_cm || null,
            pregnancy_number: baseline.pregnancy_number || null,
            first_visit_date: visit.visit_date || null,
            pregnancy_history: historyRows.filter((r) => Object.values(r).some((v) => v !== '')),
            status: 'Ongoing'
          });
          // Mark the pregnancy as active locally so a second submit in this
          // same session updates it instead of creating a duplicate baseline.
          setPregnancy({ id: created?.id, status: 'Ongoing', lmp: baseline.lmp, edd: baseline.edd, ob_index: baseline.ob_index, pregnancy_number: baseline.pregnancy_number });
          baselineCreated = true;
        }
      }
      onSubmit({
        patient_id: patientId,
        consultation_type: 'prenatal',
        visit_date: visit.visit_date || null,
        chief_complaint: 'Prenatal check-up',
        subjective: visit.remarks || null,
        prescription: visit.rx_supplements || null,
        delivery_location: visit.delivery_location || null,
        prenatal_data: {
          ...visit,
          baseline_created: baselineCreated
        },
        ai_summary_used: false
      });
    } catch (err) {
      toast.error('Could not save pregnancy record — check the form and try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Existing pregnancy context */}
      {ongoing && (
        <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3">
          <p className="text-[10px] font-bold text-primary-500 uppercase tracking-wider mb-0.5">Current Pregnancy</p>
          <p className="text-sm font-semibold text-primary-800">
            {[
              ongoing.lmp && `LMP: ${ongoing.lmp}`,
              ongoing.edd && `EDD: ${ongoing.edd}`,
              ongoing.ob_index && `OB: ${ongoing.ob_index}`,
              ongoing.pregnancy_number && `Pregnancy #${ongoing.pregnancy_number}`
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      )}

      {/* First prenatal visit — baseline data (only when no ongoing pregnancy) */}
      {showBaseline && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-primary-800">First Prenatal Visit — Baseline Data</p>
            <p className="text-xs text-primary-600">Fill this in once for this pregnancy. It creates the pregnancy record.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input type="date" label="Last Menstrual Period (1st day)" value={baseline.lmp} onChange={updateBaseline('lmp')} />
            <Input type="date" label="Estimated Delivery Date" value={baseline.edd} onChange={updateBaseline('edd')} />
            <Input type="number" label="Height (cm)" value={baseline.height_cm} onChange={updateBaseline('height_cm')} min="0" step="0.1" />
            <Input label="OB Index" value={baseline.ob_index} onChange={updateBaseline('ob_index')} placeholder="e.g. G2P1" />
            <Select label="Blood Type" value={baseline.blood_type} onChange={updateBaseline('blood_type')}>
              <option value="">Not specified</option>
              {BLOOD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Input
              type="number"
              label="This is my ___ pregnancy"
              value={baseline.pregnancy_number}
              onChange={updateBaseline('pregnancy_number')}
              min="1"
              placeholder="Pregnancy #"
            />
          </div>

          {/* Pregnancy History — one row per past pregnancy (max 6) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-primary-800">Pregnancy History</p>
              {historyRows.length < 6 && (
                <button
                  type="button"
                  onClick={addHistoryRow}
                  className="text-xs font-medium text-primary-600 hover:text-primary-800"
                >
                  + Add past pregnancy
                </button>
              )}
            </div>
            {historyRows.length === 0 ? (
              <p className="text-xs text-primary-600/80">Skip if this is the first pregnancy.</p>
            ) : (
              <div className="space-y-3">
                {historyRows.map((row, i) => (
                  <div key={i} className="rounded-lg border border-primary-200 bg-white/70 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-primary-700 uppercase tracking-wider">
                        Pregnancy #{i + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeHistoryRow(i)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {HISTORY_FIELDS.map((f) =>
                        f.type === 'date' ? (
                          <Input
                            key={f.key}
                            type="date"
                            label={f.label}
                            value={row[f.key]}
                            onChange={(e) => updateHistoryRow(i, f.key, e.target.value)}
                          />
                        ) : (
                          <Select
                            key={f.key}
                            label={f.label}
                            value={row[f.key]}
                            onChange={(e) => updateHistoryRow(i, f.key, e.target.value)}
                          >
                            <option value="">—</option>
                            {f.options.map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </Select>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Today's visit */}
      <div className="rounded-lg border border-ink-200 p-4 space-y-4">
        <p className="text-xs font-bold text-ink-700 uppercase tracking-wider">Today's Visit</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input type="date" label="Date of Visit" value={visit.visit_date} onChange={updateVisit('visit_date')} />
          <Input label="AOG by LMP" value={visit.aog_lmp} onChange={updateVisit('aog_lmp')} placeholder="auto" />
          <Select label="Trimester" value={visit.trimester} onChange={updateVisit('trimester')}>
            <option value="">Auto / not sure</option>
            <option value="1">1st Trimester</option>
            <option value="2">2nd Trimester</option>
            <option value="3">3rd Trimester</option>
          </Select>
          <Input label="AOG by UTZ" value={visit.aog_utz} onChange={updateVisit('aog_utz')} placeholder="e.g. 20 weeks" />
        </div>

        {trackingTarget && (
          <p className="text-xs text-ink-500">
            → This visit goes to the <strong>{trackingTarget.monthYear}</strong> tracking form · <strong>{trackingTarget.label}</strong> column
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Input label="Blood Pressure" value={visit.bp} onChange={updateVisit('bp')} placeholder="e.g. 110/70" />
          <Input type="number" label="Temperature (°C)" value={visit.temperature} onChange={updateVisit('temperature')} step="0.1" min="30" max="45" />
          <Input type="number" label="Pulse Rate (bpm)" value={visit.pulse_rate} onChange={updateVisit('pulse_rate')} min="0" />
          <Input type="number" label="SpO2 (%)" value={visit.spo2} onChange={updateVisit('spo2')} min="50" max="100" />
          <Input type="number" label="Weight (kg)" value={visit.weight_kg} onChange={updateVisit('weight_kg')} min="0" step="0.1" />
          <Input type="number" label="Fundic Height (cm)" value={visit.fundic_height_cm} onChange={updateVisit('fundic_height_cm')} min="0" step="0.1" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input type="number" label="Fetal Heart Tone (bpm)" value={visit.fetal_heart_tone} onChange={updateVisit('fetal_heart_tone')} min="0" />
          <Select label="Fetal Position (C,B,O,T)" value={visit.fetal_position} onChange={updateVisit('fetal_position')}>
            <option value="">Not specified</option>
            {FETAL_POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </div>

        {/* Laboratory tests */}
        <div>
          <p className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-2">Laboratory Tests Done</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Hemoglobin Count" value={visit.lab_hemoglobin} onChange={updateVisit('lab_hemoglobin')} placeholder="e.g. 120 g/L" />
            <Input label="Urinalysis" value={visit.lab_urinalysis} onChange={updateVisit('lab_urinalysis')} placeholder="Result / remarks" />
            <Input label="STIs (Syphilis, HIV, Hepatitis B)" value={visit.lab_stis} onChange={updateVisit('lab_stis')} placeholder="Result / remarks" />
          </div>
        </div>

        {/* Danger signs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Swelling of face and hands" value={visit.swelling_face_hands} onChange={updateVisit('swelling_face_hands')}>
            <option value="">Not assessed</option>
            <option value="Y">Yes</option>
            <option value="N">No</option>
          </Select>
          <Select label="Vaginal Bleeding" value={visit.vaginal_bleeding} onChange={updateVisit('vaginal_bleeding')}>
            <option value="">Not assessed</option>
            <option value="Y">Yes</option>
            <option value="N">No</option>
          </Select>
          <Select label="Vaginal Infection" value={visit.vaginal_infection} onChange={updateVisit('vaginal_infection')}>
            <option value="">Not assessed</option>
            <option value="Y">Yes</option>
            <option value="N">No</option>
          </Select>
        </div>

        {/* Counseling */}
        <div>
          <p className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-2">Pinag-usapan / Serbisyong Ibinigay</p>
          <div className="space-y-1.5">
            {COUNSELING_ITEMS.map((item) => (
              <label key={item} className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visit.counseling.includes(item)}
                  onChange={() => toggleCounseling(item)}
                  className="w-4 h-4 mt-0.5 accent-primary-600"
                />
                {item}
              </label>
            ))}
          </div>
        </div>

        <Textarea
          label="Rx and Supplements"
          value={visit.rx_supplements}
          onChange={updateVisit('rx_supplements')}
          placeholder="e.g. Ferrous sulfate 325mg OD, Folic acid 400mcg OD"
        />

        <Textarea
          label="Remarks / Notes"
          value={visit.remarks}
          onChange={updateVisit('remarks')}
          placeholder="Other observations, complaints, or instructions"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input type="date" label="Next Visit" value={visit.next_visit} onChange={updateVisit('next_visit')} />
          <Input label="Name of Health Service Provider" value={visit.provider_name} onChange={updateVisit('provider_name')} />
        </div>

        <DeliveryLocationField
          value={visit.delivery_location}
          onChange={(value) => setVisit((v) => ({ ...v, delivery_location: value }))}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          Save prenatal consultation
        </Button>
      </div>
    </form>
  );
}

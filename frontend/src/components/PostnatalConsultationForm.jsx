import { useEffect, useState } from 'react';
import { Input, Select, Textarea } from './UI/Input';
import { Button } from './UI/Button';
import { useToast } from './UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { pregnancyService } from '../services/pregnancyService';
import { consultationService } from '../services/consultationService';
import { admissionService } from '../services/admissionService';
import { patientService } from '../services/patientService';
import { DeliveryLocationField } from './ConsultationForm';

// Services shown on the paper POSTPARTUM CARE RECORD.
const SUPPLEMENT_SERVICES = [
  { key: 'tetanus', label: 'Tetanus Immunization' },
  { key: 'mms', label: 'MMS' },
  { key: 'iron', label: 'Iron' },
  { key: 'folic_acid', label: 'Folic Acid' },
  { key: 'calcium', label: 'Calcium' }
];
const PLAIN_SERVICES = [
  { key: 'counseling', label: 'Counseling' },
  { key: 'mental_health', label: 'Mental Health' },
  { key: 'family_planning', label: 'Family Planning' },
  { key: 'nutrition_counseling', label: 'Nutrition Counseling' },
  { key: 'lactation_management', label: 'Lactation Management' }
];

const blankVisit = {
  visit_date: new Date().toISOString().slice(0, 10),
  bp: '',
  temperature: '',
  weight_kg: '',
  general_survey: '',
  ob_history: '',
  services: {},
  referred: false,
  referral_reason: '',
  provider_name: ''
};

function blankServices() {
  const s = {};
  SUPPLEMENT_SERVICES.forEach(({ key }) => { s[key] = { given: false, qty: '' }; });
  PLAIN_SERVICES.forEach(({ key }) => { s[key] = false; });
  return s;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PostnatalConsultationForm({ patientId, initial, submitting, onCancel, onSubmit }) {
  const toast = useToast();
  const { user } = useAuth();
  const providerName = user?.name || '';

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState(null);
  const [pregnancy, setPregnancy] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [previousVisits, setPreviousVisits] = useState([]);
  const [visit, setVisit] = useState({ ...blankVisit, services: blankServices(), provider_name: providerName });
  const [manualDod, setManualDod] = useState('');

  const visitNo = previousVisits.length + 1;

  useEffect(() => {
    setVisit((v) => (v.provider_name ? v : { ...v, provider_name: providerName }));
  }, [providerName]);

  // Load patient context, latest pregnancy, latest delivery, and prior postnatal visits.
  useEffect(() => {
    let cancelled = false;
    if (!patientId) {
      setLoading(false);
      return;
    }
    Promise.all([
      pregnancyService.listForPatient(patientId).catch(() => []),
      admissionService.latestDelivery(patientId).catch(() => null),
      consultationService.listForPatient(patientId).catch(() => []),
      patientService.get(patientId).catch(() => null)
    ]).then(([pregnancies, latestDelivery, consultations, patientData]) => {
      if (cancelled) return;
      setPregnancy(pregnancies?.[0] || null);
      setDelivery(latestDelivery || null);
      setPatient(patientData || null);
      const postnatal = (consultations || []).filter((c) => c.consultation_type === 'postnatal');
      setPreviousVisits(postnatal);
      const last = postnatal[0];
      if (last?.postnatal_data?.ob_history) {
        setVisit((v) => ({ ...v, ob_history: last.postnatal_data.ob_history }));
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [patientId]);

  const updateVisit = (field) => (e) => setVisit((v) => ({ ...v, [field]: e.target.value }));

  function toggleSupplement(key) {
    setVisit((v) => ({
      ...v,
      services: { ...v.services, [key]: { ...v.services[key], given: !v.services[key].given } }
    }));
  }

  function updateQty(key) {
    return (e) =>
      setVisit((v) => ({
        ...v,
        services: { ...v.services, [key]: { ...v.services[key], qty: e.target.value } }
      }));
  }

  function togglePlainService(key) {
    setVisit((v) => ({ ...v, services: { ...v.services, [key]: !v.services[key] } }));
  }

  function servicesSummary(data) {
    if (!data?.services) return '—';
    const parts = SUPPLEMENT_SERVICES.filter(({ key }) => data.services[key]?.given)
      .map(({ key, label }) => `${label}${data.services[key].qty ? ` x${data.services[key].qty}` : ''}`);
    const plain = PLAIN_SERVICES.filter(({ key }) => data.services[key]).map(({ label }) => label);
    return [...parts, ...plain].join(', ') || '—';
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!patientId && !initial?.id) {
      toast.error('Missing patient');
      return;
    }
    const givenSupplements = SUPPLEMENT_SERVICES.filter(({ key }) => visit.services[key]?.given)
      .map(({ key, label }) => `${label}${visit.services[key].qty ? ` x${visit.services[key].qty}` : ''}`)
      .join(', ');
    onSubmit({
      patient_id: patientId,
      consultation_type: 'postnatal',
      chief_complaint: 'Postnatal check-up',
      subjective: visit.general_survey || visit.ob_history || null,
      prescription: givenSupplements || null,
      postnatal_data: {
        visit_no: visitNo,
        visit_date: visit.visit_date,
        bp: visit.bp,
        temperature: visit.temperature,
        weight_kg: visit.weight_kg,
        general_survey: visit.general_survey,
        ob_history: visit.ob_history,
        services: visit.services,
        referred: visit.referred,
        referral_reason: visit.referral_reason,
        provider_name: visit.provider_name,
        delivery_date: delivery?.delivered_at || manualDod || null
      },
      ai_summary_used: false
    });
  }

  const patientInfo = patient?.personal_info?.mommy || {};
  const pin = patientInfo.philhealth_pin || '';
  const gpText = pregnancy?.gp || pregnancy?.ob_index || '';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {loading ? (
        <p className="text-sm text-ink-500 py-4 text-center">Loading postpartum record…</p>
      ) : (
        <>
          {/* Part I — auto-filled patient info */}
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-3">
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">Postpartum Care Record — Patient Info</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-ink-500">PhilHealth PIN:</span> <span className="font-medium text-ink-900">{pin || '—'}</span></div>
              <div><span className="text-ink-500">G_P:</span> <span className="font-medium text-ink-900">{gpText || '—'}</span></div>
              <div>
                <span className="text-ink-500">Date of Delivery:</span>{' '}
                {delivery?.delivered_at ? (
                  <span className="font-medium text-ink-900">{formatDate(delivery.delivered_at)}</span>
                ) : (
                  <input
                    type="date"
                    value={manualDod}
                    onChange={(e) => setManualDod(e.target.value)}
                    className="input-base !py-1 !w-auto text-xs inline-block"
                  />
                )}
              </div>
            </div>
            <Textarea
              label="Brief History of Present Illness / OB History"
              value={visit.ob_history}
              onChange={updateVisit('ob_history')}
              placeholder="e.g. NSD, no complications; G2P1"
            />
          </div>

          {/* Previous postnatal visits */}
          {previousVisits.length > 0 && (
            <div className="rounded-lg border border-ink-200 overflow-hidden">
              <p className="px-3 py-2 bg-ink-50 text-xs font-bold text-ink-600 uppercase tracking-wider">Previous postnatal visits</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-500">
                    <th className="px-3 py-1.5">#</th>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">BP</th>
                    <th className="px-3 py-1.5">Temp</th>
                    <th className="px-3 py-1.5">Weight</th>
                    <th className="px-3 py-1.5">Services</th>
                    <th className="px-3 py-1.5">Referred</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {previousVisits.map((c, i) => {
                    const d = c.postnatal_data || {};
                    return (
                      <tr key={c.id} className="text-ink-700">
                        <td className="px-3 py-1.5 font-semibold">{d.visit_no || previousVisits.length - i}</td>
                        <td className="px-3 py-1.5">{formatDate(d.visit_date || c.visit_date)}</td>
                        <td className="px-3 py-1.5">{d.bp || '—'}</td>
                        <td className="px-3 py-1.5">{d.temperature || '—'}</td>
                        <td className="px-3 py-1.5">{d.weight_kg || '—'}</td>
                        <td className="px-3 py-1.5 max-w-[220px] truncate">{servicesSummary(d)}</td>
                        <td className="px-3 py-1.5">{d.referred ? `Yes${d.referral_reason ? ` — ${d.referral_reason}` : ''}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Part II — today's visit */}
          <div className="rounded-lg border border-ink-200 p-4 space-y-4">
            <p className="text-xs font-bold text-ink-700 uppercase tracking-wider">
              Today's Visit — Antenatal Care No. {visitNo}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input type="date" label="Date of Visit" value={visit.visit_date} onChange={updateVisit('visit_date')} />
              <Input label="Blood Pressure" value={visit.bp} onChange={updateVisit('bp')} placeholder="e.g. 110/70" />
              <Input type="number" label="Temperature (°C)" value={visit.temperature} onChange={updateVisit('temperature')} step="0.1" min="30" max="45" />
              <Input type="number" label="Weight (kg)" value={visit.weight_kg} onChange={updateVisit('weight_kg')} min="0" step="0.1" />
            </div>

            <Textarea
              label="General Survey / Pertinent Findings"
              value={visit.general_survey}
              onChange={updateVisit('general_survey')}
              placeholder="Physical examination findings per system"
            />

            {/* Services provided */}
            <div>
              <p className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-2">Services Provided</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUPPLEMENT_SERVICES.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={!!visit.services[key]?.given}
                        onChange={() => toggleSupplement(key)}
                        className="w-4 h-4 accent-violet-600"
                      />
                      {label}
                    </label>
                    {visit.services[key]?.given && (
                      <input
                        type="text"
                        value={visit.services[key].qty}
                        onChange={updateQty(key)}
                        placeholder="Qty"
                        className="input-base !py-1 !w-20 text-xs"
                      />
                    )}
                  </div>
                ))}
                {PLAIN_SERVICES.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!visit.services[key]}
                      onChange={() => togglePlainService(key)}
                      className="w-4 h-4 accent-violet-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Referred */}
            <div className="flex items-start gap-3">
              <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visit.referred}
                  onChange={(e) => setVisit((v) => ({ ...v, referred: e.target.checked }))}
                  className="w-4 h-4 accent-violet-600"
                />
                Referred
              </label>
              {visit.referred && (
                <input
                  type="text"
                  value={visit.referral_reason}
                  onChange={updateVisit('referral_reason')}
                  placeholder="Reason"
                  className="input-base !py-1 text-sm flex-1"
                />
              )}
            </div>

            <Input
              label="Name of Health Service Provider"
              value={visit.provider_name}
              onChange={updateVisit('provider_name')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" loading={submitting}>
              Save postnatal consultation
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

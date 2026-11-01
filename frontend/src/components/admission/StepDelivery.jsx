import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input, Textarea, Select } from '../UI/Input';
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { admissionService } from '../../services/admissionService';
import { formatDateTime, fromLocalInput, toLocalInput } from '../../lib/admission';

const PROBLEMS = [
  { code: 'prolonged_labor', label: 'Prolonged labor' },
  { code: 'fetal_distress', label: 'Fetal distress' },
  { code: 'shoulder_dystocia', label: 'Shoulder dystocia' },
  { code: 'cord_around_neck', label: 'Cord around the neck' },
  { code: 'heavy_bleeding', label: 'Heavy bleeding (PPH)' },
  { code: 'retained_placenta', label: 'Retained placenta' },
  { code: 'severe_tear', label: 'Severe perineal tear' }
];

const blankBaby = () => ({
  birth_status: 'live', born_at: '', name: '', sex: '', weight_grams: '', length_cm: '', head_circumference_cm: '', chest_circumference_cm: '',
  abdominal_circumference_cm: '', apgar_1: '', apgar_5: '', essential_care: [], notes: ''
});

export function deliveryToDraft(delivery) {
  if (!delivery) {
    return {
      delivered_at: toLocalInput(), delivery_type: '', attendant: '', attendant_ids: [], complications: '', problems: [],
      placenta: '', placenta_at: '', blood_loss_ml: '', perineum: '', oxytocin_given: '', oxytocin_at: '',
      newborns: [blankBaby()], saved: false
    };
  }
  return {
    delivered_at: toLocalInput(delivery.delivered_at),
    delivery_type: delivery.delivery_type || '',
    attendant: delivery.attendant || '',
    attendant_ids: Array.isArray(delivery.attendant_ids) ? delivery.attendant_ids.map(Number) : [],
    complications: delivery.complications || '',
    problems: Array.isArray(delivery.problems) ? delivery.problems : [],
    placenta: delivery.placenta || '',
    placenta_at: delivery.placenta_at ? toLocalInput(delivery.placenta_at) : '',
    blood_loss_ml: delivery.blood_loss_ml ?? '',
    perineum: delivery.perineum || '',
    oxytocin_given: delivery.oxytocin_given === null || delivery.oxytocin_given === undefined ? '' : delivery.oxytocin_given ? 'yes' : 'no',
    oxytocin_at: delivery.oxytocin_at ? toLocalInput(delivery.oxytocin_at) : '',
    newborns: delivery.newborns?.length
      ? delivery.newborns.map((b) => ({
          birth_status: b.birth_status || 'live',
          born_at: b.born_at && delivery.delivered_at && new Date(b.born_at).getTime() !== new Date(delivery.delivered_at).getTime() ? toLocalInput(b.born_at) : '',
          name: b.name || '',
          sex: b.sex || '',
          weight_grams: b.weight_grams ?? '',
          length_cm: b.length_cm ?? '',
          head_circumference_cm: b.head_circumference_cm ?? '',
          chest_circumference_cm: b.chest_circumference_cm ?? '',
          abdominal_circumference_cm: b.abdominal_circumference_cm ?? '',
          apgar_1: b.apgar_1 ?? '',
          apgar_5: b.apgar_5 ?? '',
          essential_care: Array.isArray(b.essential_care) ? b.essential_care : [],
          notes: b.notes || ''
        }))
      : [blankBaby()],
    saved: true
  };
}

export function draftToPayload(draft) {
  const text = (v) => (String(v ?? '').trim() === '' ? null : String(v).trim());
  const num = (v) => (String(v ?? '').trim() === '' ? null : Number(v));
  return {
    delivered_at: fromLocalInput(draft.delivered_at),
    delivery_type: text(draft.delivery_type),
    attendant: text(draft.attendant),
    attendant_ids: draft.attendant_ids,
    complications: text(draft.complications),
    problems: draft.problems,
    placenta: text(draft.placenta),
    placenta_at: draft.placenta_at ? fromLocalInput(draft.placenta_at) : null,
    blood_loss_ml: num(draft.blood_loss_ml),
    perineum: text(draft.perineum),
    oxytocin_given: draft.oxytocin_given === '' ? null : draft.oxytocin_given === 'yes',
    oxytocin_at: draft.oxytocin_given === 'yes' && draft.oxytocin_at ? fromLocalInput(draft.oxytocin_at) : null,
    // A baby row the staff never touched is not sent.
    newborns: draft.newborns
      .filter((b) => b.name || b.sex || b.birth_status === 'stillbirth' || ['weight_grams', 'length_cm', 'head_circumference_cm', 'chest_circumference_cm', 'abdominal_circumference_cm', 'apgar_1', 'apgar_5'].some((k) => b[k] !== '') || b.essential_care.length || b.notes)
      .map((b) => ({
        birth_status: b.birth_status || 'live', born_at: b.born_at ? fromLocalInput(b.born_at) : null,
        name: text(b.name), sex: text(b.sex), weight_grams: num(b.weight_grams), length_cm: num(b.length_cm),
        head_circumference_cm: num(b.head_circumference_cm), chest_circumference_cm: num(b.chest_circumference_cm),
        abdominal_circumference_cm: num(b.abdominal_circumference_cm), apgar_1: num(b.apgar_1), apgar_5: num(b.apgar_5),
        essential_care: b.essential_care, notes: text(b.notes)
      }))
  };
}

export function StepDelivery({ draft, setDraft, byGroup, canEdit, saving, onSave, onRefer }) {
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const [staff, setStaff] = useState([]);
  useEffect(() => { admissionService.staff().then(setStaff).catch(() => setStaff([])); }, []);
  const types = (byGroup.delivery_type || []).filter((t) => !t.legacy || t.code === draft.delivery_type);
  const toggle = (key, value) => setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value] }));
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-ink-900">Delivery</h3>
        <p className="text-sm text-ink-500">Normal birth only. Anything abnormal goes to Refer patient. Labor progress is on the Labor page.</p>
      </div>
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            type="datetime-local" label="Date and time of birth" value={draft.delivered_at} max={toLocalInput()}
            hint={draft.delivered_at ? formatDateTime(fromLocalInput(draft.delivered_at)) : undefined} onChange={set('delivered_at')}
          />
          <Select
            label="Type of delivery" value={draft.delivery_type}
            onChange={(e) => (e.target.value === 'referred' ? onRefer?.('Referred during labor/delivery') : set('delivery_type')(e))}
          >
            <option value="">Choose…</option>
            {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </Select>
        </div>

        <div>
          <p className="text-sm font-medium text-ink-700">Who attended the birth?</p>
          <p className="text-xs text-ink-500 mb-2">Choose from the midwives and doctors. You can pick more than one.</p>
          {staff.length === 0 && draft.attendant && <p className="text-sm text-ink-600 mb-2">Earlier entry: {draft.attendant}</p>}
          <div className="grid sm:grid-cols-2 gap-2">
            {staff.map((m) => (
              <label key={m.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer ${draft.attendant_ids.includes(Number(m.id)) ? 'border-primary-300 bg-primary-50' : 'border-ink-200 bg-white'}`}>
                <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-primary-600" checked={draft.attendant_ids.includes(Number(m.id))} onChange={() => toggle('attendant_ids', Number(m.id))} />
                <span>{m.name} <span className="text-ink-500">({m.role})</span></span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-ink-700 mb-2">Any problems during delivery?</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {PROBLEMS.map((pr) => (
              <label key={pr.code} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer ${draft.problems.includes(pr.code) ? 'border-red-300 bg-red-50 text-red-900' : 'border-ink-200 bg-white text-ink-700'}`}>
                <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-red-600" checked={draft.problems.includes(pr.code)} onChange={() => toggle('problems', pr.code)} />
                <span>{pr.label}</span>
              </label>
            ))}
          </div>
          {draft.problems.length > 0 && <p className="mt-2 text-sm font-semibold text-red-800">A problem is ticked. After saving you will be asked about a referral.</p>}
          <div className="mt-2">
            <Textarea label="Notes about the delivery (optional)" rows={2} value={draft.complications} onChange={set('complications')} />
          </div>
        </div>

        <div className="rounded-lg border border-ink-200 p-3 space-y-3">
          <p className="text-sm font-medium text-ink-700">Mother</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Select label="Placenta" value={draft.placenta} onChange={set('placenta')}>
              <option value="">Not recorded</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
            </Select>
            <Input type="datetime-local" label="Placenta delivered at" value={draft.placenta_at} onChange={set('placenta_at')} />
            <Input label="Estimated blood loss (mL)" inputMode="numeric" placeholder="e.g. 250" value={draft.blood_loss_ml} onChange={set('blood_loss_ml')} />
            <Select label="Perineum" value={draft.perineum} onChange={set('perineum')}>
              <option value="">Not recorded</option>
              <option value="intact">Intact</option>
              <option value="tear_1">1st degree tear</option>
              <option value="tear_2">2nd degree tear</option>
              <option value="episiotomy">Episiotomy</option>
            </Select>
            <Select label="Oxytocin given" value={draft.oxytocin_given} onChange={set('oxytocin_given')}>
              <option value="">Not recorded</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
            {draft.oxytocin_given === 'yes' && <Input type="datetime-local" label="Oxytocin given at" value={draft.oxytocin_at} onChange={set('oxytocin_at')} />}
          </div>
        </div>
      </fieldset>
      {canEdit && (
        <div className="mt-5 flex justify-end">
          <Button onClick={onSave} loading={saving}>{draft.saved ? 'Save changes' : 'Save delivery'}</Button>
        </div>
      )}
    </Card>
  );
}

const PLACE_OF_BIRTH = 'Jean Lying-In Maternity Clinic, Tughan, Juban, Sorsogon 4703';

// The top of the baby card: filled in from the mother's record and the delivery, not typed again.
function BabyCardInfo({ record, deliveredAt }) {
  const born = deliveredAt ? new Date(deliveredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const item = (label, value) => (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="text-sm text-ink-900 mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3 grid sm:grid-cols-2 gap-x-4 gap-y-3">
      {item('Date and time of birth', born)}
      {item('Place of birth', PLACE_OF_BIRTH)}
      {item("Mother's name", record?.mother_name)}
      {item("Father's name", record?.father_name)}
      <div className="sm:col-span-2">{item('Address', record?.address)}</div>
    </div>
  );
}

// Same limits as THRESHOLDS.newborn in backend/config/clinicalThresholds.js.
const LOW_BIRTH_WEIGHT_G = 2500;
const LOW_APGAR_5 = 7;
function newbornAlerts(b) {
  const out = [];
  if (b.weight_grams !== '' && Number(b.weight_grams) < LOW_BIRTH_WEIGHT_G) out.push('Low birth weight');
  if (b.apgar_5 !== '' && Number(b.apgar_5) < LOW_APGAR_5) out.push('Low 5-minute APGAR');
  return out;
}

export function StepBaby({ draft, setDraft, byGroup, canEdit, saving, onSave, record, onRefer }) {
  const care = byGroup.newborn_care || [];
  const alerts = [...new Set(draft.newborns.flatMap(newbornAlerts))];
  const setBaby = (i, patch) => setDraft((d) => ({ ...d, newborns: d.newborns.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }));
  const toggleCare = (i, code) => {
    const b = draft.newborns[i];
    setBaby(i, { essential_care: b.essential_care.includes(code) ? b.essential_care.filter((c) => c !== code) : [...b.essential_care, code] });
  };

  if (!draft.saved) {
    return (
      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-ink-900">Baby</h3>
        <p className="text-sm text-ink-500 mt-1">Save the delivery in the previous step first, then come back here to record the baby.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 space-y-2">
          <p className="font-bold">Newborn alert: {alerts.join(', ')}</p>
          <p>Think about referring the baby for a check-up.</p>
          {onRefer && (
            <Button size="sm" variant="danger" onClick={() => onRefer(`Newborn: ${alerts.join(', ')}`)}>Create referral</Button>
          )}
        </div>
      )}
      {draft.newborns.map((b, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-ink-900">
              {draft.newborns.length > 1 ? `Baby ${i + 1}` : 'Baby'}
            </h3>
            {canEdit && draft.newborns.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, newborns: d.newborns.filter((_, idx) => idx !== i) }))}>
                <Icon.Trash width={14} height={14} /> Remove
              </Button>
            )}
          </div>
          <BabyCardInfo record={record} deliveredAt={draft.delivered_at} />
          <fieldset disabled={!canEdit} className="space-y-4 mt-4">
            <Input label="Baby's name" value={b.name} onChange={(e) => setBaby(i, { name: e.target.value })} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Select label="Live birth or stillbirth" value={b.birth_status} onChange={(e) => setBaby(i, { birth_status: e.target.value })}>
                <option value="live">Live birth</option>
                <option value="stillbirth">Stillbirth</option>
              </Select>
              <Input
                type="datetime-local" label="This baby's birth time" value={b.born_at} max={toLocalInput()}
                hint="Leave empty to use the delivery time." onChange={(e) => setBaby(i, { born_at: e.target.value })}
              />
              <Select
                label="Sex" value={b.sex} onChange={(e) => setBaby(i, { sex: e.target.value })}
                hint={b.birth_status !== 'stillbirth' && !b.sex ? 'Required for a live birth.' : undefined}
              >
                <option value="">Choose…</option>
                <option value="Female">Girl</option>
                <option value="Male">Boy</option>
                <option value="Other">Undetermined (needs a doctor check)</option>
              </Select>
              <Input label="Birth weight (grams)" inputMode="numeric" hint="Example: 3100 for 3.1 kg" value={b.weight_grams} onChange={(e) => setBaby(i, { weight_grams: e.target.value })} />
              <Input label="Birth length (cm)" inputMode="decimal" value={b.length_cm} onChange={(e) => setBaby(i, { length_cm: e.target.value })} />
              <Input label="Head circumference, HC (cm)" inputMode="decimal" value={b.head_circumference_cm} onChange={(e) => setBaby(i, { head_circumference_cm: e.target.value })} />
              <Input label="Chest circumference, CC (cm)" inputMode="decimal" value={b.chest_circumference_cm} onChange={(e) => setBaby(i, { chest_circumference_cm: e.target.value })} />
              <Input label="Abdominal circumference, AC (cm)" inputMode="decimal" value={b.abdominal_circumference_cm} onChange={(e) => setBaby(i, { abdominal_circumference_cm: e.target.value })} />
              <Input label="Baby's score at 1 minute (0 to 10)" inputMode="numeric" hint="Also called APGAR." value={b.apgar_1} onChange={(e) => setBaby(i, { apgar_1: e.target.value })} />
              <Input label="Baby's score at 5 minutes (0 to 10)" inputMode="numeric" value={b.apgar_5} onChange={(e) => setBaby(i, { apgar_5: e.target.value })} />
            </div>
            {care.length > 0 && (
              <div>
                <p className="text-sm font-medium text-ink-700 mb-2">Newborn care done</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {care.map((c) => (
                    <label key={c.code} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer ${b.essential_care.includes(c.code) ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-ink-200 bg-white text-ink-700'}`}>
                      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-primary-600" checked={b.essential_care.includes(c.code)} onChange={() => toggleCare(i, c.code)} />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Textarea label="Notes about the baby" rows={2} value={b.notes} onChange={(e) => setBaby(i, { notes: e.target.value })} />
          </fieldset>
        </Card>
      ))}
      {canEdit && (
        <div className="flex flex-wrap justify-between gap-2">
          {draft.newborns.length < 6 ? (
            <Button variant="secondary" onClick={() => setDraft((d) => ({ ...d, newborns: [...d.newborns, blankBaby()] }))}>
              <Icon.Plus width={14} height={14} /> Add another baby (twins)
            </Button>
          ) : <span />}
          <Button onClick={onSave} loading={saving}>Save baby details</Button>
        </div>
      )}
    </div>
  );
}

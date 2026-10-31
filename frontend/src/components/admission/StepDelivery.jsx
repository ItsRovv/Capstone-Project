import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input, Textarea, Select } from '../UI/Input';
import { Icon } from '../Icon';
import { fromLocalInput, toLocalInput } from '../../lib/admission';

const blankBaby = () => ({
  name: '', sex: '', weight_grams: '', length_cm: '', head_circumference_cm: '', chest_circumference_cm: '',
  abdominal_circumference_cm: '', apgar_1: '', apgar_5: '', essential_care: [], notes: ''
});

export function deliveryToDraft(delivery) {
  if (!delivery) {
    return { delivered_at: toLocalInput(), delivery_type: '', attendant: '', complications: '', newborns: [blankBaby()], saved: false };
  }
  return {
    delivered_at: toLocalInput(delivery.delivered_at),
    delivery_type: delivery.delivery_type || '',
    attendant: delivery.attendant || '',
    complications: delivery.complications || '',
    newborns: delivery.newborns?.length
      ? delivery.newborns.map((b) => ({
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
    complications: text(draft.complications),
    // A baby row the staff never touched is not sent.
    newborns: draft.newborns
      .filter((b) => b.name || b.sex || ['weight_grams', 'length_cm', 'head_circumference_cm', 'chest_circumference_cm', 'abdominal_circumference_cm', 'apgar_1', 'apgar_5'].some((k) => b[k] !== '') || b.essential_care.length || b.notes)
      .map((b) => ({
        name: text(b.name), sex: text(b.sex), weight_grams: num(b.weight_grams), length_cm: num(b.length_cm),
        head_circumference_cm: num(b.head_circumference_cm), chest_circumference_cm: num(b.chest_circumference_cm),
        abdominal_circumference_cm: num(b.abdominal_circumference_cm), apgar_1: num(b.apgar_1), apgar_5: num(b.apgar_5),
        essential_care: b.essential_care, notes: text(b.notes)
      }))
  };
}

export function StepDelivery({ draft, setDraft, byGroup, canEdit, saving, onSave }) {
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const types = byGroup.delivery_type || [];
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-ink-900">Delivery</h3>
        <p className="text-sm text-ink-500">Record when and how the baby was born. Labor progress is on the Labor page.</p>
      </div>
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input type="datetime-local" label="Date and time of birth" value={draft.delivered_at} onChange={set('delivered_at')} />
          <Select label="Type of delivery" value={draft.delivery_type} onChange={set('delivery_type')}>
            <option value="">Choose…</option>
            {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </Select>
        </div>
        <Input label="Who attended the birth?" hint="Midwife or doctor on duty." value={draft.attendant} onChange={set('attendant')} />
        <Textarea label="Any problems during delivery?" rows={2} hint="Leave empty if none." value={draft.complications} onChange={set('complications')} />
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

export function StepBaby({ draft, setDraft, byGroup, canEdit, saving, onSave, record }) {
  const care = byGroup.newborn_care || [];
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
              <Select label="Sex" value={b.sex} onChange={(e) => setBaby(i, { sex: e.target.value })}>
                <option value="">Not recorded</option>
                <option value="Female">Girl</option>
                <option value="Male">Boy</option>
                <option value="Other">Other</option>
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

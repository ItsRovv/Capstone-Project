import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Input, Select } from '../components/UI/Input';
import { PageLoader } from '../components/UI/Spinner';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { clinicService } from '../services/admissionService';
import { apiError } from '../services/api';
import { useClinicOptions } from '../lib/admission';

const LISTS = [
  { group: 'item', title: 'Items used during a stay', help: 'Medicines, supplies and fees that staff can tap when recording what was used.', price: true, category: true },
  { group: 'package', title: 'PhilHealth packages', help: 'Packages staff can choose when admitting. The amount is for reference and is not charged at the clinic.', price: true },
  { group: 'discharge_reason', title: 'Reasons for going home', help: 'Choices shown when discharging a patient.' },
  { group: 'delivery_type', title: 'Types of delivery', help: 'Choices shown when recording a birth.' },
  { group: 'risk_flag', title: 'Warning signs checklist', help: 'Shown when admitting. A checked box reminds staff to think about a hospital referral.' },
  { group: 'newborn_care', title: 'Newborn care checklist', help: 'Things the team does for the baby right after birth.' }
];
const CATEGORIES = [{ value: 'medicine', label: 'Medicine' }, { value: 'supply', label: 'Supply' }, { value: 'service', label: 'Service or fee' }];

function OptionRow({ option, list, onSaved }) {
  const toast = useToast();
  const initial = { label: option.label, price: option.price === null ? '' : String(option.price), category: option.category || '' };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(initial); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id, option.label, option.price, option.category]);
  const dirty = form.label !== initial.label || form.price !== initial.price || form.category !== initial.category;

  async function save(patch = {}) {
    setBusy(true);
    try {
      const body = { label: form.label.trim(), ...(list.price ? { price: form.price.trim() === '' ? null : Number(form.price) } : {}), ...(list.category ? { category: form.category || null } : {}), ...patch };
      await clinicService.updateOption(option.id, body);
      toast.success('Saved');
      await onSaved();
    } catch (err) {
      toast.error(apiError(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`py-3 grid gap-2 ${list.price ? 'sm:grid-cols-[1fr_8rem_auto]' : 'sm:grid-cols-[1fr_auto]'} items-end ${option.active ? '' : 'opacity-60'}`}>
      <div className={`grid gap-2 ${list.category ? 'sm:grid-cols-[1fr_10rem]' : ''}`}>
        <Input label="Name" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        {list.category && (
          <Select label="Kind" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="">Other</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        )}
      </div>
      {list.price && (
        <Input label="Price (₱)" inputMode="decimal" placeholder="Not set" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => save()} loading={busy} disabled={!dirty || !form.label.trim()}>Save</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ active: !option.active })}>
          {option.active ? 'Hide' : 'Show again'}
        </Button>
      </div>
    </li>
  );
}

function AddRow({ list, onAdded }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: '', price: '', category: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await clinicService.createOption({
        option_group: list.group,
        label: form.label.trim(),
        ...(list.price && form.price.trim() !== '' ? { price: Number(form.price) } : {}),
        ...(list.category && form.category ? { category: form.category } : {})
      });
      toast.success('Added');
      setForm({ label: '', price: '', category: '' });
      setOpen(false);
      await onAdded();
    } catch (err) {
      toast.error(apiError(err, 'Could not add'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Icon.Plus width={14} height={14} /> Add to this list</Button>;
  }
  return (
    <form onSubmit={submit} className={`grid gap-3 items-end ${list.price ? 'sm:grid-cols-[1fr_8rem_auto]' : 'sm:grid-cols-[1fr_auto]'}`}>
      <div className={`grid gap-3 ${list.category ? 'sm:grid-cols-[1fr_10rem]' : ''}`}>
        <Input label="New name" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} autoFocus />
        {list.category && (
          <Select label="Kind" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="">Other</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        )}
      </div>
      {list.price && <Input label="Price (₱)" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy} disabled={!form.label.trim()}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

function RulesCard({ settings, onSaved }) {
  const toast = useToast();
  const days = String(settings.followup_offsets_hours || '').split(',').map((h) => Number(h) / 24).filter((d) => Number.isFinite(d) && d > 0).join(', ');
  const [form, setForm] = useState({
    min_stay_hours: settings.min_stay_hours || '24', days, require_consent: settings.require_consent !== 'false',
    ward_name: settings.ward_name || 'Ward', ward_beds: settings.ward_beds || '3', bed_price: settings.bed_price_per_night ?? ''
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    const dayList = form.days.split(',').map((d) => d.trim()).filter(Boolean).map(Number);
    if (dayList.some((d) => !Number.isFinite(d) || d <= 0 || !Number.isInteger(d))) {
      return toast.error('Follow-up days must be whole numbers like 3, 7');
    }
    if (!form.ward_name.trim()) return toast.error('Please give the ward a name.');
    if (!Number.isInteger(Number(form.ward_beds)) || Number(form.ward_beds) < 1) return toast.error('The number of beds must be 1 or more.');
    if (form.bed_price.trim() !== '' && !(Number(form.bed_price) >= 0)) return toast.error('The bed price must be a number.');
    setBusy(true);
    try {
      await clinicService.saveSettings({
        min_stay_hours: Number(form.min_stay_hours),
        followup_offsets_hours: dayList.map((d) => d * 24).join(','),
        require_consent: form.require_consent,
        ward_name: form.ward_name.trim(),
        ward_beds: Number(form.ward_beds),
        bed_price_per_night: form.bed_price.trim() === '' ? '' : Number(form.bed_price)
      });
      toast.success('Rules saved');
      await onSaved();
    } catch (err) {
      toast.error(apiError(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
    <Card>
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Ward and beds</h3>
      <p className="text-sm text-ink-500 mb-4">The room where admitted patients stay. Each patient is given a bed.</p>
      <div className="grid sm:grid-cols-3 gap-4">
        <Input label="Name of the room" hint="Example: Ward" value={form.ward_name} onChange={(e) => setForm((f) => ({ ...f, ward_name: e.target.value }))} />
        <Input label="Number of beds" inputMode="numeric" hint="You cannot go below a bed that is in use." value={form.ward_beds} onChange={(e) => setForm((f) => ({ ...f, ward_beds: e.target.value }))} />
        <Input label="Price per bed per night (₱)" inputMode="decimal" placeholder="Not set" hint="Added to the bill automatically. A price change applies to new stays only." value={form.bed_price} onChange={(e) => setForm((f) => ({ ...f, bed_price: e.target.value }))} />
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={save} loading={busy}>Save</Button></div>
    </Card>
    <Card>
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Clinic rules</h3>
      <p className="text-sm text-ink-500 mb-4">These are reminders for staff. They never block care.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Input label="Usual stay after delivery (hours)" inputMode="numeric" hint="Staff are reminded if a patient goes home sooner. PhilHealth asks for at least 24." value={form.min_stay_hours} onChange={(e) => setForm((f) => ({ ...f, min_stay_hours: e.target.value }))} />
        <Input label="Follow-up visits (days after going home)" hint="Example: 3, 7 means a check-up at 3 days and at 7 days." value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />
      </div>
      <label className="mt-4 flex items-start gap-2.5 text-sm text-ink-800 cursor-pointer">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-primary-600" checked={form.require_consent} onChange={(e) => setForm((f) => ({ ...f, require_consent: e.target.checked }))} />
        <span>Remind staff when informed consent has not been recorded</span>
      </label>
      <div className="mt-5 flex justify-end"><Button onClick={save} loading={busy}>Save rules</Button></div>
    </Card>
    </div>
  );
}

export function ClinicSettings() {
  const { onOpenMenu } = useOutletContext();
  const { options, settings, loading, reload } = useClinicOptions();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'rules' ? 'rules' : 'lists');

  return (
    <div className="h-full flex flex-col">
      <Topbar title="Clinic settings" subtitle="Change the lists, prices and reminders without a developer." onMenuClick={onOpenMenu} />
      <div className="flex-1 overflow-y-auto pt-3 md:pt-6 pb-6 md:pb-10">
        <div className="max-w-4xl w-full mx-auto px-4 md:px-8 space-y-4">
          <div className="flex gap-1 border-b border-ink-100">
            {[['lists', 'Lists and prices'], ['rules', 'Ward and rules']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>{label}</button>
            ))}
          </div>
          {loading ? <PageLoader /> : tab === 'rules' ? (
            <RulesCard settings={settings} onSaved={reload} />
          ) : (
            <>
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
                Hiding a choice only removes it from the forms. Old records keep what was saved. A price change applies to new records only.
              </div>
              {LISTS.map((list) => {
                const rows = options.filter((o) => o.option_group === list.group);
                const unpriced = list.price ? rows.filter((o) => o.active && o.price === null).length : 0;
                return (
                  <Card key={list.group}>
                    <h3 className="text-base sm:text-lg font-semibold text-ink-900">{list.title}</h3>
                    <p className="text-sm text-ink-500">{list.help}</p>
                    {unpriced > 0 && <p className="mt-2 text-sm text-amber-700">{unpriced} {unpriced === 1 ? 'choice has' : 'choices have'} no price yet.</p>}
                    <ul className="divide-y divide-ink-100 mt-2">
                      {rows.map((o) => <OptionRow key={o.id} option={o} list={list} onSaved={reload} />)}
                    </ul>
                    <div className="pt-3 border-t border-ink-100"><AddRow list={list} onAdded={reload} /></div>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

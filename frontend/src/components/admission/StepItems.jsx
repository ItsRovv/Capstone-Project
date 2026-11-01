import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Modal } from '../UI/Modal';
import { Input, Select, Textarea } from '../UI/Input';
import { Icon } from '../Icon';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDateTime, nightsText, peso } from '../../lib/admission';

const CATEGORY_LABELS = { medicine: 'Medicines', antibiotic: 'Antibiotics', supply: 'Supplies', service: 'Services and fees', other: 'Other' };
const UNITS = ['pc', 'pair', 'ampule', 'vial', 'bottle', 'pack', 'box', 'set'];

const usedForLabel = (code) => (code === 'mother' || !code ? 'Mother' : `Baby ${String(code).replace('baby_', '')}`);
const errData = (err) => err?.response?.data || {};

// Asks for a short written reason (void, correct, allergy override, waived total).
function ReasonModal({ open, title, description, label = 'Reason', confirmLabel = 'Confirm', busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button loading={busy} disabled={reason.trim().length < 3} onClick={() => { onConfirm(reason.trim()); setReason(''); }}>{confirmLabel}</Button>
        </div>
      )}
    >
      {description && <p className="text-sm text-ink-600 mb-3">{description}</p>}
      <Textarea label={label} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
    </Modal>
  );
}

function Stepper({ value, onChange, label }) {
  const n = Number(value) || 1;
  return (
    <div className="inline-flex items-center rounded-lg border border-ink-200 bg-white overflow-hidden" role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" className="h-10 w-10 text-lg text-ink-700 hover:bg-ink-50" onClick={() => onChange(Math.max(1, n - 1))} aria-label="Fewer">−</button>
      <input
        inputMode="numeric"
        className="h-10 w-14 text-center text-sm font-semibold outline-none border-x border-ink-200"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        aria-label={`Quantity of ${label}`}
      />
      <button type="button" className="h-10 w-10 text-lg text-ink-700 hover:bg-ink-50" onClick={() => onChange(n + 1)} aria-label="More">+</button>
    </div>
  );
}

export function StepItems({
  admission, items, itemsTotal, totalStatus, bed, grandTotal, packages = [], philhealthTotal = 0, byGroup, canEdit, babyCount = 0, onChanged
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [custom, setCustom] = useState({ open: false, label: '', unit_price: '', unit: 'pc', quantity: '1' });
  const [sent, setSent] = useState(null);
  const [savingPackages, setSavingPackages] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [staged, setStaged] = useState([]);
  const [reasonFor, setReasonFor] = useState(null);
  const [correcting, setCorrecting] = useState(null);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const chosen = (admission.philhealth_packages || []).map(String);
  const packageOptions = byGroup.package || [];
  const catalog = byGroup.item || [];
  const bundles = (byGroup.bundle || []).filter((b) => b.active !== false);
  const live = items.filter((it) => !it.voided_at);
  const voided = items.filter((it) => it.voided_at);
  const partyOptions = [{ value: 'mother', label: 'Mother' }, ...Array.from({ length: Math.max(babyCount, 0) }, (_, i) => ({ value: `baby_${i + 1}`, label: babyCount > 1 ? `Baby ${i + 1}` : 'Baby' }))];

  const categories = useMemo(() => ['all', ...new Set(catalog.map((o) => (CATEGORY_LABELS[o.category] ? o.category : 'other')))], [catalog]);
  const recent = useMemo(() => {
    const seen = new Set();
    return [...live].sort((a, b) => new Date(b.given_at) - new Date(a.given_at))
      .map((it) => catalog.find((o) => o.id === it.option_id)).filter((o) => o && !seen.has(o.id) && seen.add(o.id)).slice(0, 6);
  }, [live, catalog]);
  const shown = catalog.filter((o) => {
    const cat = CATEGORY_LABELS[o.category] ? o.category : 'other';
    return (category === 'all' || cat === category) && o.label.toLowerCase().includes(query.trim().toLowerCase());
  });

  const stagedHas = (o) => staged.some((s) => s.option.id === o.id);
  const toggleStage = (o) => setStaged((list) => (stagedHas(o) ? list.filter((s) => s.option.id !== o.id) : [...list, { option: o, quantity: '1', used_for: 'mother' }]));
  const patchStage = (id, patch) => setStaged((list) => list.map((s) => (s.option.id === id ? { ...s, ...patch } : s)));

  // Sends one line, resolving the two confirmations the server can ask for (big quantity, allergy).
  async function postLine(payload, extras = {}) {
    try {
      await admissionService.addItem(admission.id, { ...payload, ...extras });
      return true;
    } catch (err) {
      const data = errData(err);
      if (data.code === 'LARGE_QUANTITY' && window.confirm(`${data.message}`)) return postLine(payload, { ...extras, confirm_large: true });
      if (data.code === 'ALLERGY') {
        return new Promise((resolve) => setReasonFor({
          title: 'Allergy warning',
          description: data.message,
          label: 'Why is it being given anyway?',
          confirmLabel: 'Give with reason',
          onCancel: () => { setReasonFor(null); resolve(false); },
          onConfirm: async (reason) => { setReasonFor(null); resolve(await postLine(payload, { ...extras, allergy_reason: reason })); }
        }));
      }
      toast.error(apiError(err, 'Could not add the item'));
      return false;
    }
  }

  async function addStaged() {
    setBusy(true);
    const remaining = [];
    for (const s of staged) {
      const ok = await postLine({ option_id: s.option.id, quantity: Number(s.quantity) || 0, used_for: s.used_for });
      if (!ok) remaining.push(s);
    }
    setStaged(remaining);
    await onChanged();
    setBusy(false);
  }

  async function addBundle(b) {
    setBusy(true);
    try {
      const res = await admissionService.addBundle(admission.id, b.id);
      toast.success(res.message);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Could not add the bundle'));
    } finally {
      setBusy(false);
    }
  }

  async function addCustom(e) {
    e.preventDefault();
    if (!custom.label.trim()) return;
    const payload = { label: custom.label.trim(), quantity: Number(custom.quantity) || 0, unit: custom.unit };
    if (custom.unit_price.trim() !== '') payload.unit_price = Number(custom.unit_price);
    setBusy(true);
    const ok = await postLine(payload);
    if (ok) { setCustom({ open: false, label: '', unit_price: '', unit: 'pc', quantity: '1' }); await onChanged(); }
    setBusy(false);
  }

  async function voidLine(item, reason) {
    setBusy(true);
    try {
      await admissionService.voidItem(admission.id, item.id, reason);
      toast.success('Item voided. It stays in the history.');
      setReasonFor(null);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Could not void the item'));
    } finally {
      setBusy(false);
    }
  }

  async function correctLine(item, quantity, reason, confirmLarge = false) {
    setBusy(true);
    try {
      await admissionService.correctItem(admission.id, item.id, { quantity: Number(quantity), reason, ...(confirmLarge ? { confirm_large: true } : {}) });
      toast.success('Quantity corrected');
      setCorrecting(null);
      await onChanged();
    } catch (err) {
      const data = errData(err);
      if (data.code === 'LARGE_QUANTITY' && window.confirm(data.message)) { await correctLine(item, quantity, reason, true); return; }
      toast.error(apiError(err, 'Could not correct the quantity'));
    } finally {
      setBusy(false);
    }
  }

  async function togglePackage(code) {
    const next = chosen.includes(code) ? chosen.filter((c) => c !== code) : [...chosen, code];
    setSavingPackages(true);
    try {
      await admissionService.setPackages(admission.id, next);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Could not save the PhilHealth packages'));
    } finally {
      setSavingPackages(false);
    }
  }

  async function sendToTransactions(extra = {}) {
    setSending(true);
    try {
      const res = await admissionService.sendToTransactions(admission.id, extra);
      setSent(res);
      setWaiveOpen(false);
      toast.success(res.message);
    } catch (err) {
      const data = errData(err);
      if (data.code === 'INCOMPLETE_TOTAL') {
        const what = [...(data.unpriced || []), ...(data.bedUnpriced ? ['the bed'] : [])].join(', ');
        if (window.confirm(`${data.message}\n\nNo price yet: ${what}.`)) { await sendToTransactions({ ...extra, confirm_incomplete: true }); return; }
      } else if (data.code === 'ZERO_TOTAL') {
        setWaiveOpen(true);
      } else {
        toast.error(apiError(err, 'Could not send to Transactions'));
      }
    } finally {
      setSending(false);
    }
  }

  const incomplete = totalStatus?.incomplete;
  const canSend = live.length > 0 || chosen.length > 0 || bed?.amount > 0;

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <div className="mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-ink-900">What was used?</h3>
            <p className="text-sm text-ink-500">Tap items to select them, set how many, then add them to this stay.</p>
          </div>

          {catalog.length === 0 ? (
            <p className="text-sm text-ink-500">No items are set up yet. The clinic administrator can add them in Clinic Settings.</p>
          ) : (
            <>
              {bundles.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Bundles</span>
                  {bundles.map((b) => (
                    <Button key={b.id} size="sm" variant="secondary" disabled={busy} onClick={() => addBundle(b)}>{b.label}</Button>
                  ))}
                </div>
              )}

              {recent.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1.5">Recently used</p>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((o) => (
                      <button key={o.id} type="button" onClick={() => toggleStage(o)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${stagedHas(o) ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-ink-200 bg-white text-ink-700 hover:border-primary-300'}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-[1fr_12rem] gap-3 mb-3">
                <Input label="Search items" placeholder="e.g. gloves" value={query} onChange={(e) => setQuery(e.target.value)} />
                <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : CATEGORY_LABELS[c]}</option>)}
                </Select>
              </div>

              <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
                {shown.length === 0 && <p className="text-sm text-ink-500">No items match.</p>}
                {shown.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleStage(o)}
                    aria-pressed={stagedHas(o)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 min-h-[3rem] ${stagedHas(o) ? 'border-primary-400 bg-primary-50' : 'border-ink-200 bg-white hover:border-primary-300 hover:bg-primary-50/50'}`}
                  >
                    <span className="block font-medium text-ink-800">{o.label}</span>
                    <span className={`block text-xs ${o.charged === false ? 'text-ink-500' : o.price === null ? 'text-amber-700' : 'text-ink-500'}`}>
                      {o.charged === false ? 'Not charged' : o.price === null ? 'No price set' : `${peso(o.price)}${o.unit ? ` per ${o.unit}` : ''}`}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {staged.length > 0 && (
            <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50/40 p-3 space-y-3">
              <p className="text-sm font-semibold text-ink-800">Ready to add</p>
              {staged.map((s) => (
                <div key={s.option.id} className="flex flex-wrap items-center gap-3">
                  <span className="flex-1 min-w-[10rem] text-sm font-medium text-ink-900">{s.option.label}{s.option.unit ? <span className="text-ink-500 font-normal"> ({s.option.unit})</span> : null}</span>
                  <Stepper value={s.quantity} label={s.option.label} onChange={(q) => patchStage(s.option.id, { quantity: q })} />
                  {partyOptions.length > 1 && (
                    <select
                      aria-label={`Used for, ${s.option.label}`}
                      className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm"
                      value={s.used_for}
                      onChange={(e) => patchStage(s.option.id, { used_for: e.target.value })}
                    >
                      {partyOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  )}
                  <button type="button" onClick={() => toggleStage(s.option)} aria-label={`Unselect ${s.option.label}`} className="p-2 text-ink-400 hover:text-red-600">
                    <Icon.Close width={16} height={16} />
                  </button>
                </div>
              ))}
              <div className="flex justify-end">
                <Button onClick={addStaged} loading={busy} disabled={staged.some((s) => !(Number(s.quantity) > 0))}>
                  Add {staged.length} item{staged.length === 1 ? '' : 's'} to this stay
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-ink-100">
            {custom.open ? (
              <form onSubmit={addCustom} className="grid sm:grid-cols-[1fr_6rem_7rem_8rem_auto] gap-3 items-end">
                <Input label="Item not on the list" value={custom.label} onChange={(e) => setCustom((c) => ({ ...c, label: e.target.value }))} autoFocus />
                <Input label="How many" inputMode="numeric" value={custom.quantity} onChange={(e) => setCustom((c) => ({ ...c, quantity: e.target.value.replace(/[^0-9]/g, '') }))} />
                <Select label="Unit" value={custom.unit} onChange={(e) => setCustom((c) => ({ ...c, unit: e.target.value }))}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
                <Input label="Price each (₱)" inputMode="decimal" placeholder="Not set" value={custom.unit_price} onChange={(e) => setCustom((c) => ({ ...c, unit_price: e.target.value }))} />
                <div className="flex gap-2">
                  <Button type="submit" loading={busy}>Add</Button>
                  <Button type="button" variant="ghost" onClick={() => setCustom((c) => ({ ...c, open: false }))}>Cancel</Button>
                </div>
              </form>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setCustom((c) => ({ ...c, open: true }))}>
                <Icon.Plus width={14} height={14} /> Add something that is not on the list
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card padding="p-0" className="overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-ink-100">
          <h3 className="text-base sm:text-lg font-semibold text-ink-900">Items used in this stay</h3>
        </div>
        {bed?.number && (
          <div className="px-4 sm:px-6 py-3 border-b border-ink-100 flex items-center gap-3 bg-primary-50/40">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-900">Bed {bed.number} · {nightsText(bed.nights)}</p>
              <p className={`text-xs ${bed.priceSet ? 'text-ink-500' : 'text-amber-700'}`}>
                {bed.priceSet ? `${peso(bed.pricePerNight)} per night, added automatically` : 'No bed price set. Ask the clinic administrator to set it in Clinic Settings.'}
              </p>
            </div>
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{bed.priceSet ? peso(bed?.amount) : 'No price'}</p>
          </div>
        )}
        {live.length === 0 && voided.length === 0 ? (
          <p className="px-4 sm:px-6 py-8 text-sm text-ink-500 text-center">No items recorded yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((it) => {
              const isVoid = Boolean(it.voided_at);
              return (
                <li key={it.id} className={`px-4 sm:px-6 py-3 flex items-center gap-3 ${isVoid ? 'bg-ink-50/60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium break-words ${isVoid ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
                      {it.label} <span className="font-normal">× {Number(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</span>
                      {it.unlisted && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 no-underline">Unlisted</span>}
                      {it.legacy && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">Earlier record</span>}
                    </p>
                    <p className="text-xs text-ink-500">
                      {usedForLabel(it.used_for)} · {formatDateTime(it.given_at)}{it.given_by_name ? ` · ${it.given_by_name}` : ''}
                      {!isVoid && it.charged === false && <span> · Not charged</span>}
                      {!isVoid && it.price_missing && <span className="text-amber-700"> · no price set</span>}
                    </p>
                    {it.note && !isVoid && <p className="text-xs text-red-700 mt-0.5">{it.note}</p>}
                    {isVoid && (
                      <p className="text-xs text-ink-500 mt-0.5">Voided {formatDateTime(it.voided_at)}{it.voided_by_name ? ` by ${it.voided_by_name}` : ''}: {it.void_reason}</p>
                    )}
                  </div>
                  {!isVoid && (
                    <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">
                      {it.charged === false ? 'Not charged' : it.price_missing ? 'No price' : peso(Number(it.unit_price) * Number(it.quantity))}
                    </p>
                  )}
                  {canEdit && !isVoid && (
                    <div className="flex items-center">
                      <button type="button" onClick={() => setCorrecting({ item: it, quantity: String(Number(it.quantity)) })} disabled={busy} aria-label={`Correct quantity of ${it.label}`} className="px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg">
                        Correct
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Void ${it.label}`}
                        onClick={() => setReasonFor({
                          title: `Void "${it.label}"`,
                          description: 'The line stays in the history as voided and is left out of totals and reports.',
                          confirmLabel: 'Void item',
                          onCancel: () => setReasonFor(null),
                          onConfirm: (reason) => voidLine(it, reason)
                        })}
                        className="p-2 text-ink-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Icon.Trash width={16} height={16} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="px-4 sm:px-6 py-4 bg-ink-50/60 border-t border-ink-100 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink-700">Total of items and services (for reference)</span>
          <span className="text-right">
            {incomplete ? (
              <>
                <span className="block text-lg font-bold text-amber-700">Incomplete total</span>
                <span className="block text-xs text-ink-500">{peso(grandTotal ?? itemsTotal)} so far, some prices are missing</span>
              </>
            ) : (
              <span className="text-lg font-bold text-primary-700">{peso(grandTotal ?? itemsTotal)}</span>
            )}
          </span>
        </div>
        {incomplete && (
          <p className="px-4 sm:px-6 pb-4 text-xs text-amber-800 bg-ink-50/60">
            No price yet: {[...(totalStatus.unpricedLabels || []), ...(totalStatus.bedUnpriced ? ['the bed'] : [])].join(', ')}. The clinic administrator can set prices in Clinic Settings.
          </p>
        )}
      </Card>

      {(canEdit || packages.length > 0) && (
        <Card>
          <h3 className="text-base sm:text-lg font-semibold text-ink-900">PhilHealth packages</h3>
          <p className="text-sm text-ink-500">
            Tick the packages used by this stay if the patient is covered. These are recorded for reference only. No claims are processed here.
          </p>
          {canEdit ? (
            packageOptions.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No packages are set up yet. The clinic administrator can add them in Clinic Settings.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {packageOptions.map((p) => {
                  const on = chosen.includes(p.code);
                  return (
                    <label
                      key={p.code}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${on ? 'border-primary-300 bg-primary-50/60' : 'border-ink-200 bg-white hover:border-primary-200'} ${savingPackages ? 'opacity-70' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-ink-300 text-primary-600"
                        checked={on}
                        disabled={savingPackages}
                        onChange={() => togglePackage(p.code)}
                      />
                      <span className="flex-1 min-w-0 text-ink-800 break-words">{p.label}</span>
                      <span className={`whitespace-nowrap font-medium ${p.price === null ? 'text-amber-700 text-xs' : 'text-ink-600'}`}>
                        {p.price === null ? 'No amount set' : peso(p.price)}
                      </span>
                    </label>
                  );
                })}
                <p className="text-xs text-ink-500">Amounts are set in Clinic Settings. Verify them against the current PhilHealth circulars.</p>
              </div>
            )
          ) : packages.length > 0 ? (
            <ul className="mt-3 divide-y divide-ink-100">
              {packages.map((p) => (
                <li key={p.code} className="py-2 flex justify-between gap-3 text-sm"><span>{p.label}</span><span className="font-medium">{peso(p.amount)}</span></li>
              ))}
            </ul>
          ) : null}
          {packages.length > 0 && (
            <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-700">PhilHealth total (reference)</span>
              <span className="text-base font-bold text-ink-700">{peso(philhealthTotal)}</span>
            </div>
          )}
        </Card>
      )}

      {canEdit && (
        <Card>
          <h3 className="text-base font-semibold text-ink-900">Send to the front desk</h3>
          <p className="text-sm text-ink-500 mt-1">
            This puts the summary of items and the PhilHealth package into <span className="font-medium">Transactions</span> so the front desk has it.
            You can send again after adding more items. It updates the same transaction.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => sendToTransactions()} loading={sending} disabled={!canSend}>
              <Icon.Receipt width={16} height={16} /> Send to Transactions
            </Button>
            {sent && (
              <Link to="/transactions" className="text-sm font-medium text-primary-700 hover:underline">
                View in Transactions →
              </Link>
            )}
          </div>
        </Card>
      )}

      <ReasonModal
        open={Boolean(reasonFor)}
        title={reasonFor?.title}
        description={reasonFor?.description}
        label={reasonFor?.label}
        confirmLabel={reasonFor?.confirmLabel}
        busy={busy}
        onCancel={reasonFor?.onCancel || (() => setReasonFor(null))}
        onConfirm={(r) => reasonFor?.onConfirm(r)}
      />
      <ReasonModal
        open={waiveOpen}
        title="The total is 0"
        description="There is nothing to charge. Confirm with a reason (for example free of charge or waived) to send it."
        confirmLabel="Send with reason"
        busy={sending}
        onCancel={() => setWaiveOpen(false)}
        onConfirm={(reason) => sendToTransactions({ waived_reason: reason })}
      />
      <Modal
        open={Boolean(correcting)}
        onClose={() => setCorrecting(null)}
        title={correcting ? `Correct quantity of "${correcting.item.label}"` : ''}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCorrecting(null)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!(Number(correcting?.quantity) > 0) || (correcting?.reason || '').trim().length < 3}
              onClick={() => correctLine(correcting.item, correcting.quantity, correcting.reason.trim())}
            >
              Save correction
            </Button>
          </div>
        )}
      >
        {correcting && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">The old line is voided and a corrected one is added, so the history is kept.</p>
            <Stepper value={correcting.quantity} label={correcting.item.label} onChange={(q) => setCorrecting((c) => ({ ...c, quantity: q }))} />
            <Textarea label="Reason" rows={2} value={correcting.reason || ''} onChange={(e) => setCorrecting((c) => ({ ...c, reason: e.target.value }))} />
          </div>
        )}
      </Modal>
    </div>
  );
}

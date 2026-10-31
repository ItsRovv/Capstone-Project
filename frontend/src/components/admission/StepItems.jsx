import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { Icon } from '../Icon';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDateTime, nightsText, peso } from '../../lib/admission';

const CATEGORY_LABELS = { medicine: 'Medicines', supply: 'Supplies', service: 'Services and fees' };

export function StepItems({ admission, items, itemsTotal, bed, grandTotal, packages = [], philhealthTotal = 0, byGroup, canEdit, onChanged }) {
  const toast = useToast();
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [custom, setCustom] = useState({ open: false, label: '', unit_price: '' });
  const [sent, setSent] = useState(null);
  const [savingPackages, setSavingPackages] = useState(false);
  const chosen = (admission.philhealth_packages || []).map(String);
  const packageOptions = byGroup.package || [];

  const catalog = byGroup.item || [];
  const grouped = catalog.reduce((acc, o) => {
    const key = o.category && CATEGORY_LABELS[o.category] ? o.category : 'other';
    (acc[key] ||= []).push(o);
    return acc;
  }, {});
  const quantity = Number(qty) > 0 ? Number(qty) : 1;

  async function add(payload) {
    setBusy(true);
    try {
      await admissionService.addItem(admission.id, payload);
      setQty('1');
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Could not add the item'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Remove "${item.label}" from this stay?`)) return;
    setBusy(true);
    try {
      await admissionService.removeItem(admission.id, item.id);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Could not remove the item'));
    } finally {
      setBusy(false);
    }
  }

  async function addCustom(e) {
    e.preventDefault();
    if (!custom.label.trim()) return;
    await add({ label: custom.label.trim(), unit_price: Number(custom.unit_price) || 0, quantity });
    setCustom({ open: false, label: '', unit_price: '' });
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

  async function sendToTransactions() {
    setSending(true);
    try {
      const res = await admissionService.sendToTransactions(admission.id);
      setSent(res);
      toast.success(res.message);
    } catch (err) {
      toast.error(apiError(err, 'Could not send to Transactions'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-ink-900">What was used?</h3>
              <p className="text-sm text-ink-500">Tap an item to add it to this stay.</p>
            </div>
            <div className="w-28">
              <Input label="How many?" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>

          {catalog.length === 0 && (
            <p className="text-sm text-ink-500">No items are set up yet. The clinic administrator can add them in Settings.</p>
          )}

          <div className="space-y-4">
            {Object.entries(grouped).map(([key, list]) => (
              <div key={key}>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">{CATEGORY_LABELS[key] || 'Other'}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={busy}
                      onClick={() => add({ option_id: o.id, quantity })}
                      className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-left text-sm hover:border-primary-300 hover:bg-primary-50/50 transition-colors disabled:opacity-50"
                    >
                      <span className="block font-medium text-ink-800">{o.label}</span>
                      <span className={`block text-xs ${o.price === null ? 'text-amber-600' : 'text-ink-500'}`}>
                        {o.price === null ? 'No price set' : peso(o.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-ink-100">
            {custom.open ? (
              <form onSubmit={addCustom} className="grid sm:grid-cols-[1fr_9rem_auto] gap-3 items-end">
                <Input label="Item not on the list" value={custom.label} onChange={(e) => setCustom((c) => ({ ...c, label: e.target.value }))} autoFocus />
                <Input label="Price each (₱)" inputMode="decimal" value={custom.unit_price} onChange={(e) => setCustom((c) => ({ ...c, unit_price: e.target.value }))} />
                <div className="flex gap-2">
                  <Button type="submit" loading={busy}>Add</Button>
                  <Button type="button" variant="ghost" onClick={() => setCustom({ open: false, label: '', unit_price: '' })}>Cancel</Button>
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
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{peso(bed?.amount)}</p>
          </div>
        )}
        {items.length === 0 ? (
          <p className="px-4 sm:px-6 py-8 text-sm text-ink-500 text-center">No items recorded yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((it) => (
              <li key={it.id} className="px-4 sm:px-6 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900 break-words">
                    {it.label} <span className="text-ink-500 font-normal">× {Number(it.quantity)}</span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(it.given_at)}{it.given_by_name ? ` · ${it.given_by_name}` : ''}
                    {Number(it.unit_price) === 0 && <span className="text-amber-600"> · no price set</span>}
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{peso(Number(it.unit_price) * Number(it.quantity))}</p>
                {canEdit && (
                  <button type="button" onClick={() => remove(it)} disabled={busy} aria-label={`Remove ${it.label}`} className="p-2 -mr-2 text-ink-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                    <Icon.Trash width={16} height={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 sm:px-6 py-4 bg-ink-50/60 border-t border-ink-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Total to pay</span>
          <span className="text-lg font-bold text-primary-700">{peso(grandTotal ?? itemsTotal)}</span>
        </div>
      </Card>

      {(canEdit || packages.length > 0) && (
        <Card>
          <h3 className="text-base sm:text-lg font-semibold text-ink-900">PhilHealth packages</h3>
          <p className="text-sm text-ink-500">
            Tick the packages used by this stay if the patient is covered. These are not charged at the clinic, they are only recorded for PhilHealth.
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
                      <span className={`whitespace-nowrap font-medium ${p.price === null ? 'text-amber-600 text-xs' : 'text-ink-600'}`}>
                        {p.price === null ? 'No amount set' : peso(p.price)}
                      </span>
                    </label>
                  );
                })}
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
            This puts the items and the PhilHealth package into <span className="font-medium">Transactions</span> so the front desk knows what to collect.
            You can send again after adding more items. It updates the same transaction.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={sendToTransactions} loading={sending} disabled={!items.length && !chosen.length && !(bed?.amount > 0)}>
              <Icon.Receipt width={16} height={16} /> Send to Transactions
            </Button>
            {sent && (
              <Link to="/consultation-transactions" className="text-sm font-medium text-primary-700 hover:underline">
                View in Transactions ({peso(sent.total_amount)}) →
              </Link>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

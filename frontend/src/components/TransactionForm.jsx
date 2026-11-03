import { useEffect, useMemo, useState } from 'react';
import { Button } from './UI/Button';
import { Textarea, Select } from './UI/Input';
import { PHILHEALTH_PACKAGES } from '../constants/philhealthPackages';
import { VITAMINS } from '../constants/vitamins';
import { clinicService } from '../services/admissionService';

function formatCurrency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TransactionForm({
  patientId,
  consultations = [],
  admissions = [],
  mode = 'consultation',
  initial,
  onSubmit,
  onCancel,
  submitting
}) {
  const [consultationId, setConsultationId] = useState(initial?.consultation_id || '');
  const [admissionId, setAdmissionId] = useState(initial?.admission_id || '');
  const [selectedCodes, setSelectedCodes] = useState(
    () => new Set((initial?.packages || []).map((p) => p.code))
  );
  const [recommendations, setRecommendations] = useState(initial?.recommendations || '');

  // Vitamins: selected predefined + custom entries (with quantity)
  const initialVitamins = (initial?.vitamins || []);
  const [vitaminLines, setVitaminLines] = useState(() => {
    const map = new Map();
    for (const v of initialVitamins) {
      map.set(v.id, { ...v, quantity: Number(v.quantity || 1) });
    }
    return map;
  });
  const [customVitamins, setCustomVitamins] = useState(() =>
    initialVitamins.filter((v) => v.custom).map((v) => ({ ...v, quantity: Number(v.quantity || 1) }))
  );
  // New custom vitamin draft
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  // Vitamin and PhilHealth lists are managed in Clinic Settings; the constants
  // stay as a fallback so the form still works if the lists can't be loaded.
  const [vitamins, setVitamins] = useState(VITAMINS);
  const [packages, setPackages] = useState(PHILHEALTH_PACKAGES);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      clinicService.options('vitamin').catch(() => null),
      clinicService.options('consult_package').catch(() => null)
    ]).then(([vits, pkgs]) => {
      if (cancelled) return;
      if (vits?.length) {
        setVitamins(vits.map((o) => ({ id: o.code, label: o.label, price: Number(o.price || 0) })));
      }
      if (pkgs?.length) {
        setPackages(pkgs.map((o) => ({ code: o.code, label: o.label, amount: Number(o.price || 0) })));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const selectedPackages = useMemo(
    () => packages.filter((p) => selectedCodes.has(p.code)),
    [packages, selectedCodes]
  );

  const selectedVitamins = useMemo(
    () => vitamins.filter((v) => vitaminLines.has(v.id)).map((v) => ({ ...v, quantity: vitaminLines.get(v.id).quantity })),
    [vitamins, vitaminLines]
  );

  // Total to pay = ONLY vitamins (PhilHealth is availed through PhilHealth, not the clinic)
  const total = useMemo(
    () =>
      selectedVitamins.reduce((sum, v) => sum + Number(v.price) * v.quantity, 0) +
      customVitamins.reduce((sum, v) => sum + Number(v.price || 0) * v.quantity, 0),
    [selectedVitamins, customVitamins]
  );

  // PhilHealth total (display only — not charged at the clinic)
  const philhealthTotal = useMemo(
    () => selectedPackages.reduce((sum, p) => sum + Number(p.amount), 0),
    [selectedPackages]
  );

  function togglePackage(code) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleVitamin(id) {
    setVitaminLines((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { id, label: vitamins.find((v) => v.id === id)?.label, price: vitamins.find((v) => v.id === id)?.price, quantity: 1 });
      return next;
    });
  }

  function setVitaminQuantity(id, quantity) {
    const q = Math.max(1, Math.floor(Number(quantity) || 1));
    setVitaminLines((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.set(id, { ...next.get(id), quantity: q });
      return next;
    });
  }

  function setCustomQuantity(id, quantity) {
    const q = Math.max(1, Math.floor(Number(quantity) || 1));
    setCustomVitamins((prev) => prev.map((v) => (v.id === id ? { ...v, quantity: q } : v)));
  }

  function addCustomVitamin() {
    const name = customName.trim();
    const price = parseFloat(customPrice);
    if (!name || isNaN(price) || price < 0) return;
    setCustomVitamins((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, label: name, price, custom: true, quantity: 1 }
    ]);
    setCustomName('');
    setCustomPrice('');
  }

  function removeCustomVitamin(id) {
    setCustomVitamins((prev) => prev.filter((v) => v.id !== id));
  }

  // Find the selected consultation to show the doctor's prescription
  const selectedConsultation = useMemo(
    () => consultations.find((c) => String(c.id) === String(consultationId)),
    [consultations, consultationId]
  );

  function handleSubmit(e) {
    e.preventDefault();
    const allVitamins = [
      ...selectedVitamins.map((v) => ({ id: v.id, label: v.label, price: v.price, quantity: v.quantity, custom: false, ...(v.charged !== undefined && { charged: v.charged }), ...(v.no_price !== undefined && { no_price: v.no_price }) })),
      ...customVitamins.map((v) => ({ id: v.id, label: v.label, price: v.price, quantity: v.quantity, custom: true, ...(v.charged !== undefined && { charged: v.charged }), ...(v.no_price !== undefined && { no_price: v.no_price }) }))
    ];
    onSubmit({
      patient_id: patientId,
      consultation_id: mode === 'admission' ? null : consultationId || null,
      admission_id: mode === 'admission' ? admissionId || null : null,
      packages: selectedPackages.map(({ code, label, amount }) => ({ code, label, amount })),
      vitamins: allVitamins,
      recommendations: recommendations || null,
      total_amount: total,
      philhealth_total: philhealthTotal
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {mode === 'admission' && (
        <Select
          label="Link to an admission stay (optional)"
          value={admissionId}
          onChange={(e) => setAdmissionId(e.target.value)}
        >
          <option value="">— No specific stay —</option>
          {admissions.map((a) => (
            <option key={a.id} value={a.id}>
              {new Date(a.admitted_at || a.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              })}
              {a.status ? ` — ${a.status}` : ''}{a.bed_label ? ` — Bed ${a.bed_label}` : ''}
            </option>
          ))}
        </Select>
      )}

      {mode !== 'admission' && consultations.length > 0 && (
        <Select
          label="Link to consultation visit (optional)"
          value={consultationId}
          onChange={(e) => setConsultationId(e.target.value)}
        >
          <option value="">— No specific visit —</option>
          {consultations.map((c) => (
            <option key={c.id} value={c.id}>
              {new Date(c.visit_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
              {c.chief_complaint ? ` — ${c.chief_complaint}` : ''}
            </option>
          ))}
        </Select>
      )}

      {/* Doctor's prescription from the linked consultation — guides the frontdesk */}
      {selectedConsultation && (selectedConsultation.prescription || selectedConsultation.diagnosis) && (
        <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3">
          <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-1">Doctor's Prescription (from consultation)</p>
          {selectedConsultation.diagnosis && (
            <p className="text-sm text-ink-700 mb-1">
              <span className="font-semibold">Diagnosis:</span> {selectedConsultation.diagnosis}
            </p>
          )}
          {selectedConsultation.prescription && (
            <p className="text-sm text-ink-700 whitespace-pre-wrap font-mono">
              <span className="font-semibold font-sans">Rx:</span>{'\n'}{selectedConsultation.prescription}
            </p>
          )}
          <p className="text-xs text-teal-600 mt-2 italic">Select the vitamins above based on this prescription.</p>
        </div>
      )}

      {/* ── Vitamins (paid at the clinic — counts toward total) ── */}
      <div>
        <p className="block text-sm font-medium text-ink-700 mb-2">
          Vitamins &amp; Supplements <span className="text-xs font-normal text-ink-500">(paid at clinic)</span>
        </p>
        <div className="rounded-lg border border-ink-200 divide-y divide-ink-100 overflow-hidden">
          {vitamins.map((v) => {
            const selected = vitaminLines.has(v.id);
            const line = vitaminLines.get(v.id);
            return (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-ink-50/60"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleVitamin(v.id)}
                    className="w-4 h-4 rounded border-ink-300 text-primary-600 focus:ring-primary-400"
                  />
                  <p className="text-sm font-medium text-ink-900 truncate">{v.label}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {selected && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-ink-500">Qty</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line?.quantity || 1}
                        onChange={(e) => setVitaminQuantity(v.id, e.target.value)}
                        className="w-14 px-2 py-1 rounded-md border border-ink-200 text-sm text-center outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-ink-700 w-20 text-right">
                    {formatCurrency(Number(v.price) * (line?.quantity || selected ? line?.quantity || 1 : 1))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom vitamins (Others) */}
        {customVitamins.length > 0 && (
          <div className="mt-2 rounded-lg border border-primary-200 divide-y divide-primary-100 overflow-hidden bg-primary-50/30">
            {customVitamins.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-primary-700 bg-primary-100 px-1.5 py-0.5 rounded">Custom</span>
                  <p className="text-sm font-medium text-ink-900 truncate">{v.label}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-ink-500">Qty</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={v.quantity}
                      onChange={(e) => setCustomQuantity(v.id, e.target.value)}
                      className="w-14 px-2 py-1 rounded-md border border-ink-200 text-sm text-center outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    />
                  </div>
                  <span className="text-sm font-semibold text-ink-700 w-20 text-right">{formatCurrency(Number(v.price) * v.quantity)}</span>
                  <button
                    type="button"
                    onClick={() => removeCustomVitamin(v.id)}
                    className="p-1 rounded-md hover:bg-red-100 text-ink-400 hover:text-red-600 transition-colors"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add custom vitamin */}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Other vitamin name…"
            className="flex-1 px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            placeholder="₱"
            className="w-24 px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addCustomVitamin}
            disabled={!customName.trim() || !customPrice}
          >
            + Add
          </Button>
        </div>
      </div>

      {/* ── PhilHealth packages (availed through PhilHealth — NOT paid at clinic) ── */}
      <div>
        <p className="block text-sm font-medium text-ink-700 mb-2">
          PhilHealth Packages <span className="text-xs font-normal text-ink-500">(availed through PhilHealth — not charged at clinic)</span>
        </p>
        <div className="rounded-lg border border-ink-200 divide-y divide-ink-100 overflow-hidden bg-ink-50/30">
          {packages.map((pkg) => (
            <label
              key={pkg.code}
              className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-ink-50/60 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedCodes.has(pkg.code)}
                  onChange={() => togglePackage(pkg.code)}
                  className="w-4 h-4 rounded border-ink-300 text-primary-600 focus:ring-primary-400"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{pkg.label}</p>
                  <p className="text-xs text-ink-500">{pkg.code}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-ink-500 flex-shrink-0">
                {formatCurrency(pkg.amount)}
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-xs font-medium text-ink-500">PhilHealth total (for reference only)</span>
          <span className="text-sm font-semibold text-ink-500">{formatCurrency(philhealthTotal)}</span>
        </div>
      </div>

      {/* ── Total to pay ── */}
      <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-primary-800">Total of items and services (for reference)</span>
          <span className="text-xl font-bold text-primary-700">{formatCurrency(total)}</span>
        </div>
        <p className="text-xs text-primary-600 mt-1">
          Only vitamins &amp; supplements are charged. PhilHealth packages are availed separately through PhilHealth.
        </p>
      </div>

      <Textarea
        label="Doctor's recommendations"
        rows={4}
        value={recommendations}
        onChange={(e) => setRecommendations(e.target.value)}
        placeholder="e.g. Ferrous Sulfate 325mg once daily, Folic Acid 400mcg, Calcium Carbonate — take with meals"
      />

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          Save transaction
        </Button>
      </div>
    </form>
  );
}

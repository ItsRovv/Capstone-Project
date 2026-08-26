import { useMemo, useState } from 'react';
import { Button } from './UI/Button';
import { Textarea, Select } from './UI/Input';
import { PHILHEALTH_PACKAGES } from '../constants/philhealthPackages';
import { VITAMINS } from '../constants/vitamins';

function formatCurrency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TransactionForm({
  patientId,
  consultations = [],
  initial,
  onSubmit,
  onCancel,
  submitting
}) {
  const [consultationId, setConsultationId] = useState(initial?.consultation_id || '');
  const [selectedCodes, setSelectedCodes] = useState(
    () => new Set((initial?.packages || []).map((p) => p.code))
  );
  const [recommendations, setRecommendations] = useState(initial?.recommendations || '');

  // Vitamins: selected predefined + custom entries
  const [selectedVitaminIds, setSelectedVitaminIds] = useState(
    () => new Set((initial?.vitamins || []).filter((v) => !v.custom).map((v) => v.id))
  );
  const [customVitamins, setCustomVitamins] = useState(
    () => (initial?.vitamins || []).filter((v) => v.custom)
  );
  // New custom vitamin draft
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const selectedPackages = useMemo(
    () => PHILHEALTH_PACKAGES.filter((p) => selectedCodes.has(p.code)),
    [selectedCodes]
  );

  const selectedVitamins = useMemo(
    () => VITAMINS.filter((v) => selectedVitaminIds.has(v.id)),
    [selectedVitaminIds]
  );

  // Total to pay = ONLY vitamins (PhilHealth is availed through PhilHealth, not the clinic)
  const total = useMemo(
    () =>
      selectedVitamins.reduce((sum, v) => sum + Number(v.price), 0) +
      customVitamins.reduce((sum, v) => sum + Number(v.price || 0), 0),
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
    setSelectedVitaminIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCustomVitamin() {
    const name = customName.trim();
    const price = parseFloat(customPrice);
    if (!name || isNaN(price) || price < 0) return;
    setCustomVitamins((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, label: name, price, custom: true }
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
      ...selectedVitamins.map(({ id, label, price }) => ({ id, label, price, custom: false })),
      ...customVitamins.map(({ id, label, price }) => ({ id, label, price, custom: true }))
    ];
    onSubmit({
      patient_id: patientId,
      consultation_id: consultationId || null,
      packages: selectedPackages.map(({ code, label, amount }) => ({ code, label, amount })),
      vitamins: allVitamins,
      recommendations: recommendations || null,
      total_amount: total,
      philhealth_total: philhealthTotal
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {consultations.length > 0 && (
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
          {VITAMINS.map((v) => (
            <label
              key={v.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-ink-50/60 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedVitaminIds.has(v.id)}
                  onChange={() => toggleVitamin(v.id)}
                  className="w-4 h-4 rounded border-ink-300 text-primary-600 focus:ring-primary-400"
                />
                <p className="text-sm font-medium text-ink-900 truncate">{v.label}</p>
              </div>
              <span className="text-sm font-semibold text-ink-700 flex-shrink-0">
                {formatCurrency(v.price)}
              </span>
            </label>
          ))}
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-ink-700">{formatCurrency(v.price)}</span>
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
          {PHILHEALTH_PACKAGES.map((pkg) => (
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
          <span className="text-sm font-bold text-primary-800">Total to Pay at Clinic</span>
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

// Choose a bed in the ward. Taken beds show who is in them and cannot be picked.
export function BedPicker({ ward, value, onChange, currentAdmissionId, disabled = false }) {
  if (!ward) return null;
  const wardName = ward.name.toLowerCase();
  const full = ward.beds.every((b) => b.admission && b.admission.id !== currentAdmissionId);

  return (
    <div>
      <p className="text-sm font-medium text-ink-700">Which bed?</p>
      <p className="text-xs text-ink-500 mb-2">
        {full ? `The ${wardName} is full. Discharge a patient first.` : `The ${wardName} has ${ward.totalBeds} beds.`}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {ward.beds.map((b) => {
          const mine = b.admission && b.admission.id === currentAdmissionId;
          const taken = b.admission && !mine;
          const selected = Number(value) === b.number;
          return (
            <button
              key={b.number}
              type="button"
              disabled={disabled || taken}
              onClick={() => onChange(b.number)}
              aria-pressed={selected}
              className={`rounded-lg border px-2 py-2.5 text-center transition-colors min-w-0 ${
                selected
                  ? 'border-primary-600 bg-primary-50 text-primary-900 ring-1 ring-primary-500'
                  : taken
                  ? 'border-ink-200 bg-ink-50 text-ink-400 cursor-not-allowed'
                  : 'border-ink-200 bg-white text-ink-800 hover:border-primary-300'
              }`}
            >
              <span className="block text-sm font-semibold">Bed {b.number}</span>
              <span className="block text-[11px] leading-tight mt-0.5 truncate">
                {taken ? `${b.admission.first_name} ${b.admission.last_name}` : mine ? 'Current bed' : 'Free'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

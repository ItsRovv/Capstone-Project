import { useState, useEffect } from 'react';
import { Input, Select, Textarea } from './UI/Input';
import { Button } from './UI/Button';

// Build a local datetime string for an <input type="datetime-local">,
// defaulting to tomorrow 9am if no initial value.
function defaultDateTimeLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}

function toLocalInput(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function toMySQLDateTime(isoLocal) {
  // datetime-local gives "2026-06-17T15:00"; MySQL wants "2026-06-17 15:00:00"
  return isoLocal.replace('T', ' ') + ':00';
}

export function AppointmentForm({
  patientId,
  initial,
  patients = [],
  submitting,
  onCancel,
  onSubmit
}) {
  const [form, setForm] = useState({
    patient_id: patientId || initial?.patient_id || '',
    appointment_date:
      initial?.appointment_date
        ? toLocalInput(new Date(initial.appointment_date))
        : defaultDateTimeLocal(),
    reason: initial?.reason || '',
    status: initial?.status || 'scheduled',
    notes: initial?.notes || ''
  });

  useEffect(() => {
    if (patientId) setForm((f) => ({ ...f, patient_id: patientId }));
  }, [patientId]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.patient_id || !form.appointment_date) return;
    onSubmit({
      ...form,
      patient_id: Number(form.patient_id),
      appointment_date: toMySQLDateTime(form.appointment_date)
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!patientId && (
        <Select
          label="Patient"
          value={form.patient_id}
          onChange={update('patient_id')}
          required
        >
          <option value="">Select a patient…</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
            </option>
          ))}
        </Select>
      )}

      <Input
        type="datetime-local"
        label="Date & time"
        value={form.appointment_date}
        onChange={update('appointment_date')}
        required
      />

      <Input
        label="Reason"
        value={form.reason}
        onChange={update('reason')}
        placeholder="e.g. Prenatal checkup"
      />

      <Select label="Status" value={form.status} onChange={update('status')}>
        <option value="scheduled">Scheduled</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </Select>

      <Textarea
        label="Notes"
        rows={3}
        value={form.notes}
        onChange={update('notes')}
        placeholder="Optional"
      />

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {initial?.id ? 'Save changes' : 'Schedule'}
        </Button>
      </div>
    </form>
  );
}

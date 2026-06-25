import { useState } from 'react';
import { Input, Select } from './UI/Input';
import { Button } from './UI/Button';

const blank = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  age: '',
  sex: 'Female',
  address: '',
  contact_number: '',
  emergency_contact: '',
  allergies: ''
};

export function PatientForm({ initial, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({ ...blank, ...(initial || {}) });
  const [error, setError] = useState(null);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.');
      return;
    }
    setError(null);
    // Convert empty strings to null for clean DB writes
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="First name" value={form.first_name} onChange={update('first_name')} required />
        <Input label="Last name" value={form.last_name} onChange={update('last_name')} required />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          type="date"
          label="Date of birth"
          value={form.date_of_birth || ''}
          onChange={update('date_of_birth')}
        />
        <Input
          type="number"
          label="Age"
          value={form.age || ''}
          onChange={update('age')}
          min="0"
          max="150"
        />
        <Select label="Sex" value={form.sex || 'Female'} onChange={update('sex')}>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
          <option value="Other">Other</option>
        </Select>
      </div>

      <Input
        label="Address"
        value={form.address || ''}
        onChange={update('address')}
        placeholder="Street, barangay, city"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Contact number"
          value={form.contact_number || ''}
          onChange={update('contact_number')}
          placeholder="0917-XXX-XXXX"
        />
        <Input
          label="Emergency contact"
          value={form.emergency_contact || ''}
          onChange={update('emergency_contact')}
          placeholder="Name & number"
        />
      </div>

      <Input
        label="Allergies (comma-separated)"
        value={form.allergies || ''}
        onChange={update('allergies')}
        placeholder="e.g. Penicillin, Shellfish, Latex"
      />

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {initial?.id ? 'Save changes' : 'Add patient'}
        </Button>
      </div>
    </form>
  );
}

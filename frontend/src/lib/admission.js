import { useCallback, useEffect, useMemo, useState } from 'react';
import { clinicService } from '../services/admissionService';

// Plain-language names for every stage of a stay.
export const STATUS_META = {
  admitted: { label: 'Admitted', tone: 'info' },
  in_labor: { label: 'In labor', tone: 'warning' },
  delivered: { label: 'Delivered', tone: 'success' },
  discharged: { label: 'Discharged', tone: 'default' },
  referred: { label: 'Referred', tone: 'danger' }
};

export const ACTIVE_STATUSES = ['admitted', 'in_labor', 'delivered'];
export const isActiveStatus = (s) => ACTIVE_STATUSES.includes(s);

// Who may admit, deliver, discharge. Front-desk staff only view.
export const CLINICAL_ROLES = ['admin', 'doctor', 'nurse'];
export const canRecordClinical = (role) => CLINICAL_ROLES.includes(role);

export const peso = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export function formatDay(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "3 hours ago", "2 days ago" — easier to read at a glance than a timestamp.
export function timeAgo(d, now = Date.now()) {
  if (!d) return '';
  const mins = Math.round((now - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Value for <input type="datetime-local"> in the user's own time zone.
export function toLocalInput(d = new Date()) {
  const date = new Date(d);
  const off = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - off).toISOString().slice(0, 16);
}

export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : undefined);

// A follow-up is "overdue" when it is past due and not yet done.
export function followupState(f, now = Date.now()) {
  if (f.done_at) return 'done';
  return new Date(f.due_at).getTime() < now ? 'overdue' : 'upcoming';
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Loads the clinic's editable lists and rules once. Forms use this so a change
 * made in Settings shows up everywhere without a code change.
 */
export function useClinicOptions() {
  const [options, setOptions] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Only the first load shows a spinner; later reloads update in place.
  const reload = useCallback(async () => {
    try {
      const [opts, sets] = await Promise.all([clinicService.options(undefined, { all: true }), clinicService.settings()]);
      setOptions(opts);
      setSettings(Object.fromEntries(sets.map((s) => [s.setting_key, s.setting_value])));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const byGroup = useMemo(() => {
    // Dropdowns only offer choices that are still switched on.
    const groups = {};
    for (const o of options) if (o.active) (groups[o.option_group] ||= []).push(o);
    return groups;
  }, [options]);

  // Shows the clinic's own wording for a saved code, even if the choice was hidden later.
  const labelFor = useCallback(
    (group, code) => options.find((o) => o.option_group === group && o.code === code)?.label || code || '—',
    [options]
  );

  return { options, byGroup, settings, labelFor, loading, error, reload };
}

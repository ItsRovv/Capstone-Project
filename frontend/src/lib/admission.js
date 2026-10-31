import { useCallback, useEffect, useMemo, useState } from 'react';
import { admissionService, clinicService } from '../services/admissionService';

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
export const CLINICAL_ROLES = ['admin', 'doctor', 'nurse', 'midwife'];
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
 * The ward at a glance: which beds are taken, by whom, and which are free.
 */
export function useWard() {
  const [ward, setWard] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    try {
      setWard(await admissionService.ward());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ward, error, reload, loading: !ward && !error };
}

export const nightsText = (n) => `${n} night${n === 1 ? '' : 's'}`;

// The Admission and Discharge module's own fixed lists. They used to be editable in
// Clinic Settings; they belong to this module now (same items, same order).
export const MODULE_LISTS = {
  discharge_reason: [
    { code: 'improved', label: 'Improved - went home well' },
    { code: 'transferred', label: 'Transferred to another facility' },
    { code: 'hama', label: 'Went home against medical advice' },
    { code: 'absconded', label: 'Left without notice' },
    { code: 'expired', label: 'Passed away' },
    { code: 'well_baby', label: 'Well baby - discharged with mother' }
  ],
  delivery_type: [
    { code: 'nsd', label: 'Normal delivery' },
    { code: 'assisted', label: 'Assisted delivery' },
    { code: 'other', label: 'Other' }
  ],
  risk_flag: [
    { code: 'multiple_pregnancy', label: 'Twins or more' },
    { code: 'placenta_previa', label: 'Placenta covering the cervix (placenta previa)' },
    { code: 'previous_cs', label: 'Previous cesarean section' },
    { code: 'preeclampsia_history', label: 'Past pre-eclampsia or eclampsia' },
    { code: 'stillbirth_history', label: 'Past stillbirth or 3 or more miscarriages' },
    { code: 'hypertension', label: 'High blood pressure' },
    { code: 'diabetes', label: 'Diabetes' },
    { code: 'heart_disease', label: 'Heart disease' },
    { code: 'severe_anemia', label: 'Severe anemia' },
    { code: 'bleeding', label: 'Heavy bleeding' }
  ],
  newborn_care: [
    { code: 'drying', label: 'Dried and wrapped right away' },
    { code: 'skin_to_skin', label: 'Skin-to-skin with mother' },
    { code: 'cord_care', label: 'Cord clamped and cared for' },
    { code: 'breastfeeding', label: 'Breastfeeding started' }
  ]
};

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
    // The module's fixed lists first; editable lists (items, packages) from the API.
    const groups = { ...MODULE_LISTS };
    for (const o of options) {
      if (o.active && !MODULE_LISTS[o.option_group]) (groups[o.option_group] ||= []).push(o);
    }
    return groups;
  }, [options]);

  // Shows the clinic's own wording for a saved code, even if the choice was hidden later.
  const labelFor = useCallback(
    (group, code) => MODULE_LISTS[group]?.find((o) => o.code === code)?.label
      || options.find((o) => o.option_group === group && o.code === code)?.label
      || code || '—',
    [options]
  );

  return { options, byGroup, settings, labelFor, loading, error, reload };
}

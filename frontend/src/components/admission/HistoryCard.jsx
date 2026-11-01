import { useEffect, useState } from 'react';
import { Card } from '../UI/Card';
import { admissionService } from '../../services/admissionService';
import { formatDateTime } from '../../lib/admission';

const TABLES = {
  admissions: 'Admission record', deliveries: 'Delivery', admission_items: 'Items', midwife_notes: "Midwives' notes",
  labor_entries: 'Labor chart', admission_vitals: 'Vital signs', discharge_checklists: 'Checklist', medications_given: 'Medications',
  referrals: 'Referral', consultation_transactions: 'Transactions', postpartum_followups: 'Follow-ups'
};
const VERBS = { CREATE: 'added', UPDATE: 'changed', DELETE: 'removed or voided' };

// Read-only: who changed what and when. For the administrator and doctors.
export function HistoryCard({ admissionId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { admissionService.history(admissionId).then(setRows).catch(() => setRows([])); }, [admissionId]);
  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-base font-semibold text-ink-900">History of changes</summary>
        {!rows ? <p className="mt-3 text-sm text-ink-500">Loading…</p> : rows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No changes recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-100 text-sm max-h-80 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="py-2">
                <span className="font-medium text-ink-900">{TABLES[r.table_name] || r.table_name}</span> {VERBS[r.action] || r.action}
                <span className="text-ink-500"> · {r.user_name || 'Unknown'} · {formatDateTime(r.created_at)}</span>
                {r.reason && <span className="block text-xs text-ink-600">Reason: {r.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </Card>
  );
}

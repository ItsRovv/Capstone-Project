import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Select } from '../components/UI/Input';
import { PageLoader } from '../components/UI/Spinner';
import { EmptyState } from '../components/UI/EmptyState';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { StatusChip } from '../components/admission/StatusChip';
import { AdmitModal } from '../components/admission/AdmitModal';
import { FollowupDoneModal } from '../components/admission/FollowupDoneModal';
import { admissionService } from '../services/admissionService';
import { apiError } from '../services/api';
import { canRecordClinical, followupState, formatDateTime, formatDay, monthKey, timeAgo, useClinicOptions, useWard } from '../lib/admission';

const TABS = [
  { key: 'now', label: 'Ward' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'logbook', label: 'Logbook' }
];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function lastMonths(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: monthKey(d), label: `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}` };
  });
}

function WardTab({ ward, loading, onAdmit, canRecord }) {
  if (loading) return <PageLoader />;
  if (!ward) return <Card><EmptyState icon={<Icon.Users width={40} height={40} />} title="Could not load the ward" description="Please refresh the page." /></Card>;
  const used = ward.totalBeds - ward.freeBeds.length;
  const wardName = ward.name.toLowerCase();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-700">
          <span className="font-semibold text-ink-900">{used} of {ward.totalBeds}</span> beds in use in the {wardName}
        </p>
        {ward.bedPrice === null && (
          <Link to="/admin/settings?tab=rules" className="text-xs font-medium text-amber-700 hover:underline">Bed price per night is not set</Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ward.beds.map((b) => {
          const a = b.admission;
          if (!a) {
            return (
              <div key={b.number} className="rounded-lg border-2 border-dashed border-ink-200 bg-white/60 p-4 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Bed {b.number}</p>
                <p className="text-lg font-semibold text-emerald-700 mt-1">Free</p>
                {canRecord && (
                  <Button size="sm" variant="secondary" className="mt-3 self-start" onClick={() => onAdmit(b.number)}>Admit here</Button>
                )}
              </div>
            );
          }
          return (
            <Link key={b.number} to={`/admissions/${a.id}`} className="block">
              <Card hover padding="p-4" className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Bed {b.number}</p>
                  <StatusChip status={a.status} />
                </div>
                <p className="font-semibold text-ink-900 mt-1 break-words">{a.first_name} {a.last_name}</p>
                <p className="text-xs text-ink-500 mt-0.5">{a.age ? `${a.age} y/o · ` : ''}admitted {timeAgo(a.admitted_at)}</p>
                {a.chief_complaint && <p className="text-sm text-ink-600 mt-2 line-clamp-2">{a.chief_complaint}</p>}
              </Card>
            </Link>
          );
        })}
      </div>
      {ward.unassigned.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-ink-800">Admitted without a bed</h3>
          <p className="text-xs text-ink-500 mb-2">Open the stay and pick a bed in the first step.</p>
          <ul className="divide-y divide-ink-100">
            {ward.unassigned.map((a) => (
              <li key={a.id}>
                <Link to={`/admissions/${a.id}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-medium text-ink-900 break-words">{a.first_name} {a.last_name}</span>
                  <StatusChip status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function FollowupsTab({ canRecord }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [doneFor, setDoneFor] = useState(null);
  const load = useCallback(() => {
    admissionService.followups('pending').then(setRows).catch((err) => { toast.error(apiError(err, 'Could not load follow-ups')); setRows([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <PageLoader />;
  if (rows.length === 0) {
    return <Card><EmptyState icon={<Icon.Check width={40} height={40} />} title="No follow-ups waiting" description="Check-ups after going home will show here, 3 and 7 days after discharge." /></Card>;
  }
  return (
    <>
      <Card padding="p-0" className="overflow-hidden">
        <ul className="divide-y divide-ink-100">
          {rows.map((f) => {
            const state = followupState(f);
            return (
              <li key={f.id} className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <Link to={`/admissions/${f.admission_id}`} className="font-medium text-ink-900 hover:text-primary-700 break-words">{f.first_name} {f.last_name}</Link>
                  <p className="text-xs text-ink-500">Due {formatDay(f.due_at)}{f.contact_number ? ` · ${f.contact_number}` : ''}</p>
                </div>
                <Badge tone={state === 'overdue' ? 'danger' : 'info'}>{state === 'overdue' ? 'Overdue' : 'Coming up'}</Badge>
                {canRecord && <Button size="sm" variant="secondary" onClick={() => setDoneFor(f)}>Mark as done</Button>}
              </li>
            );
          })}
        </ul>
      </Card>
      <FollowupDoneModal followup={doneFor} patientName={doneFor && `${doneFor.first_name} ${doneFor.last_name}`} onClose={() => setDoneFor(null)} onDone={load} />
    </>
  );
}

function Stat({ label, value }) {
  return (
    <Card padding="p-3 sm:p-4">
      <p className="text-[11px] sm:text-xs font-bold text-ink-400 uppercase tracking-wider leading-tight">{label}</p>
      <p className="text-xl sm:text-2xl font-bold text-ink-900 mt-1">{value}</p>
    </Card>
  );
}

function LogbookTab({ labelFor }) {
  const toast = useToast();
  const months = useMemo(() => lastMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setRows(null);
    admissionService.logbook(month).then(setRows).catch((err) => { toast.error(apiError(err, 'Could not load the logbook')); setRows([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const stats = rows && {
    admitted: rows.length,
    deliveries: rows.filter((r) => r.delivered_at).length,
    babies: rows.reduce((s, r) => s + Number(r.babies || 0), 0),
    discharged: rows.filter((r) => r.status === 'discharged').length,
    referred: rows.filter((r) => r.status === 'referred').length
  };

  return (
    <div className="space-y-4">
      <div className="max-w-[12rem]">
        <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
      </div>
      {!rows ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-4">
            <Stat label="Admitted" value={stats.admitted} />
            <Stat label="Deliveries" value={stats.deliveries} />
            <Stat label="Babies born" value={stats.babies} />
            <Stat label="Discharged" value={stats.discharged} />
            <Stat label="Referred" value={stats.referred} />
          </div>
          {rows.length === 0 ? (
            <Card><EmptyState icon={<Icon.FileText width={40} height={40} />} title="Nothing recorded this month" /></Card>
          ) : (
            <Card padding="p-0" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 sm:px-5 py-3 font-semibold">Patient</th>
                      <th className="text-left px-3 sm:px-5 py-3 font-semibold hidden md:table-cell">Admitted</th>
                      <th className="text-left px-3 sm:px-5 py-3 font-semibold hidden lg:table-cell">Delivery</th>
                      <th className="text-left px-3 sm:px-5 py-3 font-semibold hidden lg:table-cell">Babies</th>
                      <th className="text-left px-3 sm:px-5 py-3 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-ink-50/60">
                        <td className="px-3 sm:px-5 py-3">
                          <Link to={`/admissions/${r.id}`} className="font-medium text-ink-900 hover:text-primary-700 break-words">{r.first_name} {r.last_name}</Link>
                          <p className="text-xs text-ink-500">{r.bed_number ? `Bed ${r.bed_number}` : ''}<span className="md:hidden">{r.bed_number ? ' · ' : ''}{formatDay(r.admitted_at)}</span></p>
                        </td>
                        <td className="px-3 sm:px-5 py-3 text-ink-600 hidden md:table-cell whitespace-nowrap">{formatDateTime(r.admitted_at)}</td>
                        <td className="px-3 sm:px-5 py-3 text-ink-600 hidden lg:table-cell">{r.delivered_at ? `${formatDay(r.delivered_at)} · ${labelFor('delivery_type', r.delivery_type)}` : '—'}</td>
                        <td className="px-3 sm:px-5 py-3 text-ink-600 hidden lg:table-cell">{Number(r.babies) || '—'}</td>
                        <td className="px-3 sm:px-5 py-3">
                          <StatusChip status={r.status} />
                          {r.disposition && <p className="text-xs text-ink-500 mt-1">{labelFor('discharge_reason', r.disposition)}</p>}
                          {r.referred_to && <p className="text-xs text-ink-500 mt-1">To {r.referred_to}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function Admissions() {
  const { onOpenMenu } = useOutletContext();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'now';
  const [admitOpen, setAdmitOpen] = useState(false);
  const [admitBed, setAdmitBed] = useState(null);
  const { byGroup, labelFor } = useClinicOptions();
  const { ward, loading: wardLoading, reload: reloadWard } = useWard();
  const canRecord = canRecordClinical(user?.role);

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Admissions"
        subtitle="Patients in the clinic, follow-up visits, and the logbook."
        onMenuClick={onOpenMenu}
        right={
          canRecord ? (
            <Button onClick={() => { setAdmitBed(null); setAdmitOpen(true); }}>
              <Icon.Plus width={16} height={16} /> <span className="sm:hidden">Admit</span><span className="hidden sm:inline">Admit patient</span>
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto pt-3 md:pt-6 pb-4 md:pb-8">
        <div className="max-w-7xl w-full mx-auto px-4 md:px-8 space-y-4">
          <div className="flex gap-1 border-b border-ink-100 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setParams(t.key === 'now' ? {} : { tab: t.key }, { replace: true })}
                className={`px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
              >
                {t.key === 'now' ? ward?.name || t.label : t.label}
              </button>
            ))}
          </div>
          {tab === 'now' && <WardTab ward={ward} loading={wardLoading} canRecord={canRecord} onAdmit={(bed) => { setAdmitBed(bed); setAdmitOpen(true); }} />}
          {tab === 'followups' && <FollowupsTab canRecord={canRecord} />}
          {tab === 'logbook' && <LogbookTab labelFor={labelFor} />}
        </div>
      </div>
      <AdmitModal open={admitOpen} onClose={() => { setAdmitOpen(false); reloadWard(); }} byGroup={byGroup} initialBed={admitBed} />
    </div>
  );
}

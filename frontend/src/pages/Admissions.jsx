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
import { canRecordClinical, followupState, formatDateTime, formatDay, monthKey, timeAgo, useClinicOptions } from '../lib/admission';

const TABS = [
  { key: 'now', label: 'In the clinic now' },
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

function NowTab({ onAdmit, canRecord }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    admissionService.current().then(setRows).catch((err) => { toast.error(apiError(err, 'Could not load admissions')); setRows([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!rows) return <PageLoader />;
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon.Users width={40} height={40} />}
          title="No one is admitted right now"
          description="When a patient is admitted, she will show up here."
          action={canRecord ? <Button onClick={onAdmit}><Icon.Plus width={16} height={16} /> Admit a patient</Button> : undefined}
        />
      </Card>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {rows.map((a) => (
        <Link key={a.id} to={`/admissions/${a.id}`} className="block">
          <Card hover padding="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 break-words">{a.first_name} {a.last_name}</p>
                <p className="text-xs text-ink-500 mt-0.5">{a.age ? `${a.age} y/o · ` : ''}admitted {timeAgo(a.admitted_at)}</p>
              </div>
              <StatusChip status={a.status} />
            </div>
            {a.chief_complaint && <p className="text-sm text-ink-600 mt-2 line-clamp-2">{a.chief_complaint}</p>}
          </Card>
        </Link>
      ))}
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
                          <p className="text-xs text-ink-500 md:hidden">{formatDay(r.admitted_at)}</p>
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
  const { byGroup, labelFor } = useClinicOptions();
  const canRecord = canRecordClinical(user?.role);

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Admissions"
        subtitle="Patients in the clinic, follow-up visits, and the logbook."
        onMenuClick={onOpenMenu}
        right={
          canRecord ? (
            <Button onClick={() => setAdmitOpen(true)}>
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
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'now' && <NowTab onAdmit={() => setAdmitOpen(true)} canRecord={canRecord} />}
          {tab === 'followups' && <FollowupsTab canRecord={canRecord} />}
          {tab === 'logbook' && <LogbookTab labelFor={labelFor} />}
        </div>
      </div>
      <AdmitModal open={admitOpen} onClose={() => setAdmitOpen(false)} byGroup={byGroup} />
    </div>
  );
}

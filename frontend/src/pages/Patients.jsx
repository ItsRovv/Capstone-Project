import { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { Spinner, PageLoader } from '../components/UI/Spinner';
import { EmptyState } from '../components/UI/EmptyState';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { patientService } from '../services/patientService';
import { queueService } from '../services/queueService';
import { admissionService } from '../services/admissionService';
import { pregnancyService } from '../services/pregnancyService';
import { StatusChip } from '../components/admission/StatusChip';
import { AdmitModal } from '../components/admission/AdmitModal';
import { canRecordClinical, useClinicOptions } from '../lib/admission';
import { apiError } from '../services/api';
import { PatientForm } from '../components/PatientForm';

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function Patients() {
  const { onOpenMenu } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const action = searchParams.get('action');
  const isConsultMode = action === 'consult';

  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [queueMap, setQueueMap] = useState(new Map());
  const [addingQueue, setAddingQueue] = useState(null);
  const [queueTarget, setQueueTarget] = useState(null);
  const [admitMap, setAdmitMap] = useState(new Map());
  const [admitTarget, setAdmitTarget] = useState(null);
  const { byGroup } = useClinicOptions();
  const canAdmit = canRecordClinical(user?.role);

  const LIMIT = 50;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  async function load(q = search, p = page) {
    setLoading(true);
    try {
      const [res, queueRes, admittedRes] = await Promise.all([
        patientService.list(q, { page: p, limit: LIMIT }),
        queueService.listToday().catch(() => []),
        admissionService.current().catch(() => [])
      ]);
      setPatients(res.data || []);
      setTotal(res.total || 0);
      const qMap = new Map((queueRes || []).map((qe) => [qe.patient_id, qe]));
      setQueueMap(qMap);
      setAdmitMap(new Map((admittedRes || []).map((a) => [a.patient_id, a])));
    } catch (err) {
      toast.error(apiError(err, 'Failed to load patients'));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToQueue(patientId, option = 'normal') {
    const consultationType = typeof option === 'object' ? option.type : option;
    const trimester = typeof option === 'object' ? option.trimester : null;
    setAddingQueue(patientId);
    try {
      const result = await queueService.add(patientId, consultationType, trimester);
      toast.success(`Added to queue #${String(result.queue_number).padStart(2, '0')}`);
      setQueueMap((prev) => {
        const next = new Map(prev);
        next.set(patientId, { queue_number: result.queue_number, status: 'waiting', consultation_type: consultationType });
        return next;
      });
      setQueueTarget(null);
    } catch (err) {
      toast.error(apiError(err, 'Could not add to queue'));
    } finally {
      setAddingQueue(null);
    }
  }

  // Reset to page 1 whenever the search term changes (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load(search, 1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(search, page);
  }, [page]);

  // Auto-open add modal when ?action=add
  useEffect(() => {
    if (action === 'add') {
      setEditing(null);
      setModalOpen(true);
      // clean the param so refresh doesn't re-open
      setSearchParams({}, { replace: true });
    }
  }, [action]);

  async function handleCreate(payload, options = {}) {
    setSubmitting(true);
    try {
      const result = await patientService.create(payload);
      if (options.addToQueue && result?.id) {
        try {
          const qResult = await queueService.add(result.id, options.consultationType || 'normal');
          toast.success(`Patient added and queued #${String(qResult.queue_number).padStart(2, '0')}`);
        } catch (queueErr) {
          toast.success('Patient added (queue failed — add manually)');
          console.warn('[patients] Auto-queue failed:', queueErr);
        }
      } else {
        toast.success('Patient added');
      }
      setModalOpen(false);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not add patient'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await patientService.remove(deleteTarget.id);
      toast.success('Patient deleted');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  }

  function renderStatus(p) {
    // Being admitted is the more important state, so it wins over the queue badge.
    if (admitMap.has(p.id)) return <StatusChip status={admitMap.get(p.id).status} className="!text-xs !px-2 !py-1 !rounded-md" />;
    if (!queueMap.has(p.id)) return <span className="text-xs text-ink-400">—</span>;
    const q = queueMap.get(p.id);
    const isDone = q.status === 'done' || q.status === 'skipped';
    const isServing = q.status === 'serving';
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${
        isDone
          ? 'bg-sky-50 text-sky-700'
          : isServing
          ? 'bg-amber-50 text-amber-700'
          : 'bg-emerald-50 text-emerald-700'
      }`}>
        {isDone ? (
          <><Icon.Check width={12} height={12} /> Completed</>
        ) : isServing ? (
          <><Icon.Stethoscope width={12} height={12} /> Serving</>
        ) : (
          <><Icon.Clock width={12} height={12} /> In queue</>
        )}
        {!isDone && (
          <span className="font-bold">#{String(q.queue_number).padStart(2, '0')}</span>
        )}
      </span>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Patients"
        subtitle="All registered patients at JLMC."
        onMenuClick={onOpenMenu}
        search={search}
        onSearchChange={setSearch}
        right={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Icon.Plus width={16} height={16} />
            <span className="hidden sm:inline">Add patient</span>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto pt-3 md:pt-6 pb-4 md:pb-8">
        <div className="w-full px-4 md:px-8 space-y-4">
          {isConsultMode && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 inline-flex items-center justify-center flex-shrink-0">
                <Icon.Stethoscope width={16} height={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-800">Record a consultation</p>
                <p className="text-xs text-emerald-600">Select a patient below to add a new consultation visit.</p>
              </div>
              <button
                onClick={() => setSearchParams({}, { replace: true })}
                className="ml-auto text-emerald-600 hover:text-emerald-800 text-xs font-medium"
              >
                Dismiss
              </button>
            </div>
          )}
          <Card padding="p-0" className="overflow-hidden">
            {loading ? (
              <PageLoader label="Loading patients…" />
            ) : patients.length === 0 ? (
              <EmptyState
              icon={<Icon.Users width={40} height={40} />}
              title={search ? 'No matches' : 'No patients yet'}
              description={
                search
                  ? `Nothing matches "${search}". Try a different search.`
                  : 'Add your first patient to get started.'
              }
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setModalOpen(true);
                  }}
                >
                  <Icon.Plus width={16} height={16} /> Add patient
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead className="bg-ink-50 text-ink-600 text-sm uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 sm:px-6 py-3 font-semibold">Name</th>
                    <th className="text-left px-6 py-3 font-semibold hidden sm:table-cell">Age</th>
                    <th className="text-left px-6 py-3 font-semibold hidden sm:table-cell">Sex</th>
                    <th className="text-left px-6 py-3 font-semibold hidden sm:table-cell">Status</th>
                    <th className="text-left px-6 py-3 font-semibold hidden md:table-cell">
                      Contact
                    </th>
                    <th className="text-left px-6 py-3 font-semibold hidden lg:table-cell">
                      Registered
                    </th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {patients.map((p) => (
                    <tr key={p.id} className={`hover:bg-ink-50/60 transition-colors ${isConsultMode ? 'cursor-pointer' : ''}`}>
                      <td className="px-3 sm:px-6 py-3">
                        <Link
                          to={`/patients/${p.id}`}
                          className="flex items-center gap-3 group min-w-0"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-ink-900 group-hover:text-primary-700 break-words">
                              {p.first_name} {p.last_name}
                            </p>
                            <p className="text-sm text-ink-500 sm:hidden">
                              {[(p.age || ageFromDob(p.date_of_birth)) && `${p.age || ageFromDob(p.date_of_birth)} y/o`, p.sex].filter(Boolean).join(' · ') || '—'}
                            </p>
                            <p className="text-sm text-ink-500 md:hidden">
                              {p.contact_number || '—'}
                            </p>
                          </div>
                        </Link>
                        {(queueMap.has(p.id) || admitMap.has(p.id)) && <div className="mt-1.5 sm:hidden">{renderStatus(p)}</div>}
                      </td>
                      <td className="px-6 py-3.5 text-ink-700 hidden sm:table-cell">
                        {p.age || ageFromDob(p.date_of_birth) || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-ink-700 hidden sm:table-cell">{p.sex || '—'}</td>
                      <td className="px-6 py-3.5 hidden sm:table-cell">{renderStatus(p)}</td>
                      <td className="px-6 py-3.5 text-ink-700 hidden md:table-cell">
                        {p.contact_number || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-ink-500 hidden lg:table-cell whitespace-nowrap">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="px-2 sm:px-6 py-3 text-right align-middle">
                        <div className="inline-flex items-center gap-0.5 sm:gap-1">
                          {!isConsultMode && ['admin', 'nurse', 'staff'].includes(user?.role) &&
                            (() => {
                              const q = queueMap.get(p.id);
                              const isActive = q && (q.status === 'waiting' || q.status === 'serving');
                              return !isActive;
                            })() && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setQueueTarget(p)}
                              loading={addingQueue === p.id}
                              className="!text-base text-primary-600 hover:!text-primary-700 hover:!bg-primary-50"
                              title="Add to queue"
                              aria-label="Add to queue"
                            >
                              Queue
                            </Button>
                          )}
                          {!isConsultMode && canAdmit && p.sex !== 'Male' && (
                            admitMap.has(p.id) ? (
                              <Link to={`/admissions/${admitMap.get(p.id).id}`} aria-label="Open admission" title="Open admission">
                                <Button variant="ghost" size="sm" className="!text-base text-rose-600 hover:!bg-rose-50">
                                  Admitted
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAdmitTarget(p)}
                                className="!text-base text-rose-600 hover:!text-rose-700 hover:!bg-rose-50"
                                title="Admit patient"
                                aria-label="Admit patient"
                              >
                                Admit
                              </Button>
                            )
                          )}
                          <Link to={`/patients/${p.id}`}>
                            <Button variant="ghost" size="sm" className="!text-base">
                              {isConsultMode ? (
                                <span className="flex items-center gap-1 text-emerald-700">
                                  <Icon.Stethoscope width={14} height={14} /> Select
                                </span>
                              ) : 'View'}
                            </Button>
                          </Link>
                          {!isConsultMode && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(p)}
                              className="text-ink-500 hover:!text-red-600 hover:!bg-red-50"
                              aria-label="Delete"
                            >
                              <Icon.Trash width={16} height={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {!loading && total > LIMIT && (
          <div className="flex items-center justify-between mt-4 text-sm text-ink-600">
            <span>
              Page {page} of {totalPages} · {total} patient{total === 1 ? '' : 's'}
            </span>
            <div className="inline-flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit patient' : 'New patient'}
        size="xl"
      >
        <PatientForm
          initial={editing}
          submitting={submitting}
          onCancel={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSubmit={handleCreate}
        />
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete patient"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              No
            </Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              Yes
            </Button>
          </>
        }
      >
        <p className="text-ink-700">
          Are you sure you want to delete{' '}
          <strong>
            {deleteTarget?.first_name} {deleteTarget?.last_name}
          </strong>
          ?
        </p>
      </Modal>

      <AdmitModal
        open={Boolean(admitTarget)}
        onClose={() => { setAdmitTarget(null); load(); }}
        patient={admitTarget}
        byGroup={byGroup}
      />

      <ConsultationTypeModal
        open={Boolean(queueTarget)}
        patient={queueTarget}
        loading={addingQueue !== null}
        onClose={() => setQueueTarget(null)}
        onSelect={(type) => handleAddToQueue(queueTarget.id, type)}
      />
    </div>
  );
}

const CONSULTATION_TYPES = [
  { value: 'normal', label: 'Normal Consultation', description: 'General check-up — not pregnancy related' },
  { value: 'prenatal', label: 'Prenatal Consultation', description: 'Pregnancy check-up (buntis)' },
  { value: 'postnatal', label: 'Postnatal Consultation', description: 'Check-up after giving birth' }
];

const TRIMESTER_OPTIONS = [
  { value: '1', label: '1st Trimester', hint: 'weeks 1–13' },
  { value: '2', label: '2nd Trimester', hint: 'weeks 14–27' },
  { value: '3', label: '3rd Trimester', hint: 'weeks 28+' }
];

export function ConsultationTypeModal({ open, patient, loading, onClose, onSelect }) {
  const [type, setType] = useState('normal');
  const [trimester, setTrimester] = useState(null);
  const [suggested, setSuggested] = useState(null);

  // Pre-select the trimester from the patient's active pregnancy (weeks or LMP)
  // so staff don't have to guess it at queue time.
  useEffect(() => {
    if (type !== 'prenatal' || !patient?.id) return undefined;
    let cancelled = false;
    pregnancyService
      .listForPatient(patient.id)
      .then((rows) => {
        if (cancelled) return;
        const active = (rows || []).find(
          (p) => !['delivered', 'discharged', 'completed'].includes(String(p.status || '').toLowerCase())
        );
        if (!active) return;
        let weeks = active.weeks != null && active.weeks !== '' ? Number(active.weeks) : null;
        if ((weeks == null || Number.isNaN(weeks)) && active.lmp) {
          weeks = Math.max(0, Math.floor((Date.now() - new Date(active.lmp)) / (7 * 86400000)));
        }
        if (!Number.isFinite(weeks)) return;
        const tri = weeks < 14 ? '1' : weeks < 28 ? '2' : '3';
        setSuggested(tri);
        setTrimester((t) => t || tri);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [type, patient?.id]);
  return (
    <Modal open={open} onClose={onClose} title="Add to queue" size="sm">
      <p className="text-sm text-ink-600 mb-3">
        Consultation type for <strong>{patient?.first_name} {patient?.last_name}</strong>:
      </p>
      <div className="space-y-2">
        {CONSULTATION_TYPES.map((t) => (
          <label
            key={t.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              type === t.value
                ? 'border-primary-400 bg-primary-50/50'
                : 'border-ink-200 hover:border-primary-300'
            }`}
          >
            <input
              type="radio"
              name="consultation_type"
              value={t.value}
              checked={type === t.value}
              onChange={() => setType(t.value)}
              className="w-4 h-4 mt-0.5 accent-primary-600"
            />
            <span>
              <span className="block text-sm font-medium text-ink-900">{t.label}</span>
              <span className="block text-xs text-ink-500">{t.description}</span>
            </span>
          </label>
        ))}
      </div>
      {type === 'prenatal' && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink-600 uppercase tracking-wider mb-1.5">Trimester</p>
          <div className="grid grid-cols-3 gap-2">
            {TRIMESTER_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTrimester(trimester === t.value ? null : t.value)}
                className={`rounded-lg border px-2 py-1.5 text-xs text-center transition-colors ${
                  trimester === t.value
                    ? 'border-pink-400 bg-pink-50 text-pink-700 font-semibold'
                    : 'border-ink-200 text-ink-600 hover:border-pink-300'
                }`}
              >
                {t.label}
                <span className="block text-[10px] font-normal text-ink-400">{t.hint}</span>
              </button>
            ))}
          </div>
          {suggested && trimester === suggested && (
            <p className="mt-1.5 text-[11px] text-ink-500">Auto-suggested from the patient's pregnancy record — tap again to change.</p>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSelect(type === 'prenatal' ? { type, trimester } : type)} loading={loading}>Add to queue</Button>
      </div>
    </Modal>
  );
}

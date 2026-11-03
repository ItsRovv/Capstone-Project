import { useEffect, useState } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card, CardHeader } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { PageLoader } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { queueService } from '../services/queueService';
import { consultationService } from '../services/consultationService';
import { consultationTransactionService } from '../services/consultationTransactionService';
import { patientService } from '../services/patientService';
import { admissionService } from '../services/admissionService';
import { pregnancyService } from '../services/pregnancyService';
import { ConsultationForm } from '../components/ConsultationForm';
import { PrenatalConsultationForm } from '../components/PrenatalConsultationForm';
import { PostnatalConsultationForm } from '../components/PostnatalConsultationForm';
import { matchPrescriptionToVitamins, calculateVitaminsTotal } from '../utils/prescriptionMatcher';
import { apiError } from '../services/api';


function StatusBadge({ status }) {
  const styles = {
    waiting: 'bg-primary-100 text-primary-700',
    serving: 'bg-amber-100 text-amber-700',
    done: 'bg-emerald-100 text-emerald-700',
    skipped: 'bg-red-100 text-red-700'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${styles[status] || 'bg-ink-100 text-ink-600'}`}>
      {status}
    </span>
  );
}

const CONSULTATION_TYPES = {
  normal: { label: 'Normal', className: 'bg-ink-100 text-ink-600' },
  prenatal: { label: 'Prenatal', className: 'bg-primary-50 text-primary-700 border border-primary-100' },
  postnatal: { label: 'Postnatal', className: 'bg-primary-50 text-primary-700 border border-primary-100' }
};

export function ConsultationTypeBadge({ type }) {
  const t = CONSULTATION_TYPES[type] || CONSULTATION_TYPES.normal;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${t.className}`}>
      {t.label}
    </span>
  );
}

function QueueChip({ q, onClick, actionLabel, accent = 'primary' }) {
  const accents = {
    primary: 'bg-primary-100 text-primary-700 hover:border-primary-300 hover:bg-primary-50/30',
    emerald: 'bg-emerald-100 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/30',
    red: 'bg-red-100 text-red-700 hover:border-red-300 hover:bg-red-50/30'
  };
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border border-ink-100 bg-white transition-colors ${accents[accent].split(' ').slice(2).join(' ')}`}>
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${accents[accent].split(' ')[0]} ${accents[accent].split(' ')[1]}`}>
        #{String(q.queue_number).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ink-900 truncate">
          {q.first_name} {q.last_name}
        </p>
        {q.consultation_type && q.consultation_type !== 'normal' && (
          <ConsultationTypeBadge type={q.consultation_type} />
        )}
      </div>
      {onClick && (
        <Button size="sm" variant="ghost" onClick={onClick} className="text-xs px-2 py-0.5">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function DoctorConsultations() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const navigate = useNavigate();

  const [queue, setQueue] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [patientMap, setPatientMap] = useState({});
  const [pregnancyContext, setPregnancyContext] = useState(null);
  const [serveConfirm, setServeConfirm] = useState({ open: false, queueId: null });
  const [consultationType, setConsultationType] = useState('normal');
  const [editing, setEditing] = useState(null);
  const [activeAdmission, setActiveAdmission] = useState(null);

  const currentServing = queue.find((q) => q.status === 'serving') || null;

  useEffect(() => {
    setConsultationType(currentServing?.consultation_type || 'normal');
  }, [currentServing?.id]);
  // A patient who is still admitted can't have a post-natal consultation until discharge.
  useEffect(() => {
    setActiveAdmission(null);
    if (!currentServing) return undefined;
    let cancelled = false;
    admissionService.forPatient(currentServing.patient_id).then((list) => {
      if (cancelled) return;
      const active = (list || []).find((a) => ['admitted', 'in_labor', 'delivered'].includes(a.status));
      setActiveAdmission(active || null);
      if (active) setConsultationType((t) => (t === 'postnatal' ? 'normal' : t));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentServing?.patient_id]);
  const nextWaiting = queue.find((q) => q.status === 'waiting') || null;
  const waitingList = queue.filter((q) => q.status === 'waiting');
  const doneList = queue.filter((q) => q.status === 'done');
  const skippedList = queue.filter((q) => q.status === 'skipped');

  async function load() {
    setLoading(true);
    try {
      const [queueRes, consultRes] = await Promise.all([
        queueService.listToday().catch(() => []),
        consultationService.todayDetailed().catch(() => [])
      ]);
      setQueue(queueRes);
      setConsultations(consultRes);

      const map = {};
      queueRes.forEach((q) => {
        map[q.patient_id] = { first_name: q.first_name, last_name: q.last_name };
      });
      const missingPatientIds = queueRes
        .filter((q) => !map[q.patient_id]?.first_name)
        .map((q) => q.patient_id);
      if (missingPatientIds.length > 0) {
        const patients = await patientService.list('', { page: 1, limit: 200 }).catch(() => ({ data: [] }));
        (patients.data || []).forEach((p) => {
          map[p.id] = p;
        });
      }
      setPatientMap(map);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load doctor console'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Fetch pregnancy data for the current serving patient
  useEffect(() => {
    if (!currentServing) {
      setPregnancyContext(null);
      return;
    }
    let cancelled = false;
    pregnancyService.listForPatient(currentServing.patient_id).then((pregnancies) => {
      if (cancelled) return;
      const latest = pregnancies[0]; // sorted DESC by created_at
      if (latest) {
        setPregnancyContext({
          pregnancyNumber: latest.pregnancy_number || null,
          obIndex: latest.ob_index || null,
          aog: latest.aog || (latest.weeks ? `${latest.weeks} weeks` : null),
          lmp: latest.lmp || null,
          edd: latest.edd || null,
          bloodType: latest.blood_type || null
        });
      } else {
        setPregnancyContext(null);
      }
    }).catch(() => {
      if (!cancelled) setPregnancyContext(null);
    });
    return () => { cancelled = true; };
  }, [currentServing?.patient_id]);

  async function handleDone(payload) {
    if (!currentServing) return;
    setSubmitting(true);
    try {
      // 1. Save consultation
      const consultResult = await consultationService.create({
        ...payload,
        patient_id: currentServing.patient_id,
        consultation_type: payload.consultation_type || consultationType
      });
      const consultationId = consultResult?.id || null;
      if (consultResult?.pregnancy_created) toast.info('Added to Pregnancy Tracking: delivery location recorded.');

      // 2. Mark queue done
      await queueService.updateStatus(currentServing.id, 'done');

      // 3. Auto-advance next patient if available
      if (nextWaiting) {
        await queueService.updateStatus(nextWaiting.id, 'serving');
      }

      // 4. Auto-create transaction from prescription (non-blocking)
      const matchedVitamins = matchPrescriptionToVitamins(payload.prescription);
      if (matchedVitamins.length > 0 && consultationId) {
        const total = calculateVitaminsTotal(matchedVitamins);
        try {
          await consultationTransactionService.create({
            patient_id: currentServing.patient_id,
            consultation_id: consultationId,
            packages: [],
            vitamins: matchedVitamins.map(({ id, label, price, quantity, custom }) => ({ id, label, price, quantity: Number(quantity || 1), custom: !!custom })),
            recommendations: null,
            total_amount: total,
            philhealth_total: 0
          });
          toast.success(`Consultation saved. Transaction auto-created: ₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
        } catch (txErr) {
          console.warn('[doctor] Auto-transaction failed:', txErr);
          toast.success('Consultation saved (auto-transaction failed — create manually)');
        }
      } else {
        toast.success('Consultation saved and patient marked done');
      }

      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not finish consultation'));
    } finally {
      setSubmitting(false);
    }
  }

  async function startEdit(consult) {
    try {
      const full = await consultationService.get(consult.id);
      setEditing({ ...consult, ...full });
      window.scrollTo?.({ top: 0 });
    } catch (err) {
      toast.error(apiError(err, 'Could not open consultation'));
    }
  }

  async function handleEditSave(payload) {
    if (!editing) return;
    setSubmitting(true);
    try {
      await consultationService.update(editing.id, {
        ...payload,
        patient_id: editing.patient_id,
        consultation_type: editing.consultation_type || 'normal'
      });
      toast.success('Consultation updated');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not update consultation'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleServeNext() {
    if (!nextWaiting) return;
    await handleServeById(nextWaiting.id);
  }

  async function handleServeById(queueId) {
    if (currentServing && currentServing.id !== queueId) {
      setServeConfirm({ open: true, queueId });
      return;
    }
    await confirmServe(queueId);
  }

  async function confirmServe(queueId) {
    const queueIdToServe = queueId || serveConfirm.queueId;
    if (!queueIdToServe) return;
    const previousPatient = currentServing
      ? `${currentServing.first_name} ${currentServing.last_name}`
      : null;
    try {
      if (currentServing && currentServing.id !== queueIdToServe) {
        await queueService.updateStatus(currentServing.id, 'waiting');
      }
      const target = queue.find((q) => q.id === queueIdToServe);
      await queueService.updateStatus(queueIdToServe, 'serving');
      if (previousPatient && target) {
        toast.success(`Now serving ${target.first_name} ${target.last_name}. ${previousPatient} returned to queue.`);
      } else if (target) {
        toast.success(`Now serving ${target.first_name} ${target.last_name}.`);
      } else {
        toast.success('Now serving selected patient');
      }
      setServeConfirm({ open: false, queueId: null });
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not serve patient'));
    }
  }

  async function handleReServe(queueId) {
    try {
      await queueService.updateStatus(queueId, 'serving');
      toast.success('Patient moved back to serving');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not re-serve patient'));
    }
  }

  const getConsultationForPatient = (patientId) =>
    consultations.find((c) => c.patient_id === patientId);

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Consultation"
        subtitle="Manage today's queue and record consultations."
        onMenuClick={onOpenMenu}
      />

      <div className="flex-1 overflow-y-auto pt-3 md:pt-6 pb-4 md:pb-8">
        <div className="w-full px-4 md:px-8 space-y-4">
          {loading ? (
            <PageLoader label="Loading doctor console…" />
          ) : (
            <>
              {/* ── Main landscape layout: Patient banner on top; queue | consultation form below ── */}
              {editing ? (
                <div className="space-y-4">
                  <Card padding="p-0" className="overflow-hidden border-l-4 border-l-amber-500">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">Editing</span>
                          <ConsultationTypeBadge type={editing.consultation_type || 'normal'} />
                        </div>
                        <h2 className="mt-2 text-xl font-bold leading-tight text-ink-900 break-words">
                          {editing.patient_first_name || ''} {editing.patient_last_name || ''}
                        </h2>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Back to queue</Button>
                    </div>
                  </Card>
                  <Card padding="p-4">
                    <h3 className="text-sm font-semibold text-ink-800 mb-3">
                      {editing.consultation_type === 'prenatal'
                        ? 'Prenatal Consultation'
                        : editing.consultation_type === 'postnatal'
                        ? 'Postnatal Consultation'
                        : 'Consultation — S.O.A.P. Notes'}
                    </h3>
                    {editing.consultation_type === 'prenatal' ? (
                      <PrenatalConsultationForm
                        key={editing.id}
                        patientId={editing.patient_id}
                        initial={editing}
                        onSubmit={handleEditSave}
                        submitting={submitting}
                        onCancel={() => setEditing(null)}
                      />
                    ) : editing.consultation_type === 'postnatal' ? (
                      <PostnatalConsultationForm
                        key={editing.id}
                        patientId={editing.patient_id}
                        initial={editing}
                        onSubmit={handleEditSave}
                        submitting={submitting}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <ConsultationForm
                        key={editing.id}
                        patientId={editing.patient_id}
                        initial={editing}
                        onSubmit={handleEditSave}
                        submitting={submitting}
                        onCancel={() => setEditing(null)}
                      />
                    )}
                  </Card>
                </div>
              ) : currentServing ? (
                <div className="space-y-4">
                <Card padding="p-0" className="overflow-hidden border-l-4 border-l-primary-700">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status="serving" />
                        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
                          Queue #{String(currentServing.queue_number).padStart(2, '0')}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-bold leading-tight text-ink-900 break-words">
                        {currentServing.first_name} {currentServing.last_name}
                      </h2>
                    </div>
                    <Link to={`/patients/${currentServing.patient_id}`}>
                      <Button size="sm">View patient profile</Button>
                    </Link>
                  </div>
                </Card>
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  {/* Left: Queue sidebar (3 cols) */}
                  <div className="xl:col-span-3 space-y-3">
                    <Card padding="p-3">
                      {/* Queued today */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-ink-700 uppercase tracking-wider">Queued today</p>
                          <span className="text-xs font-medium text-ink-500">{waitingList.length + skippedList.length}</span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {(waitingList.length === 0 && skippedList.length === 0) ? (
                            <p className="text-xs text-ink-400 text-center py-3">No queued patients.</p>
                          ) : (
                            <>
                              {waitingList.map((q) => (
                                <QueueChip
                                  key={q.id}
                                  q={q}
                                  onClick={() => handleServeById(q.id)}
                                  actionLabel="Serve"
                                />
                              ))}
                              {skippedList.map((q) => (
                                <div
                                  key={q.id}
                                  className="flex items-center gap-2 p-2 rounded-lg border border-ink-100 hover:border-red-300 hover:bg-red-50/30 transition-colors bg-red-50/20"
                                >
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 text-xs font-bold flex-shrink-0">
                                    #{String(q.queue_number).padStart(2, '0')}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-ink-900 truncate">
                                      {q.first_name} {q.last_name}
                                    </p>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-100 text-red-700">Skipped</span>
                                  </div>
                                  <Button size="sm" variant="ghost" onClick={() => handleReServe(q.id)} className="text-xs px-2 py-0.5">
                                    Re-serve
                                  </Button>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-ink-100 my-3" />

                      {/* Completed today */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Completed today</p>
                          <span className="text-xs font-medium text-ink-500">{doneList.length}</span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {doneList.length === 0 ? (
                            <p className="text-xs text-ink-400 text-center py-3">None yet.</p>
                          ) : (
                            doneList.map((q) => {
                              const consult = getConsultationForPatient(q.patient_id);
                              return (
                                <div
                                  key={q.id}
                                  className="flex items-center gap-2 p-2 rounded-lg border border-ink-100 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
                                >
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex-shrink-0">
                                    #{String(q.queue_number).padStart(2, '0')}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-ink-900 truncate">
                                      {q.first_name} {q.last_name}
                                    </p>
                                    <p className="text-[10px] text-ink-500 truncate">
                                      {consult?.chief_complaint || 'Recorded'}
                                    </p>
                                  </div>
                                  {consult && (
                                    <Button size="sm" onClick={() => startEdit(consult)}>Edit</Button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </Card>
                                        {/* Next patient mini-card */}
                    {nextWaiting && (
                      <Card padding="p-3">
                        <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Up Next</p>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex-shrink-0">
                            #{String(nextWaiting.queue_number).padStart(2, '0')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-ink-900 truncate">
                              {nextWaiting.first_name} {nextWaiting.last_name}
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>

                  {/* Right: consultation form (9 cols) */}
                  <div className="xl:col-span-9 space-y-4">
                    <Card padding="p-4">
                      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                        <h3 className="text-sm font-semibold text-ink-800">
                          {consultationType === 'prenatal'
                            ? 'Prenatal Consultation'
                            : consultationType === 'postnatal'
                            ? 'Postnatal Consultation'
                            : 'Consultation — S.O.A.P. Notes'}
                        </h3>
                        <div className="flex items-center gap-2">
                          <ConsultationTypeBadge type={consultationType} />
                          <select
                            value={consultationType}
                            onChange={(e) => setConsultationType(e.target.value)}
                            className="input-base !py-1 !w-auto text-xs"
                            title="Consultation type"
                          >
                            <option value="normal">Normal</option>
                            <option value="prenatal">Prenatal</option>
                            <option value="postnatal" disabled={Boolean(activeAdmission)}>
                              Postnatal{activeAdmission ? ' (admitted)' : ''}
                            </option>
                          </select>
                        </div>
                      </div>
                      {activeAdmission && (
                        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          This patient is currently admitted{activeAdmission.bed_number ? ` (Bed ${activeAdmission.bed_number})` : ''}. A post-natal consultation can be recorded after discharge.
                        </p>
                      )}
                      {consultationType === 'prenatal' ? (
                        <PrenatalConsultationForm
                          patientId={currentServing.patient_id}
                          onSubmit={handleDone}
                          submitting={submitting}
                          onCancel={null}
                          pregnancyContext={pregnancyContext}
                        />
                      ) : consultationType === 'postnatal' ? (
                        <PostnatalConsultationForm
                          patientId={currentServing.patient_id}
                          onSubmit={handleDone}
                          submitting={submitting}
                          onCancel={null}
                        />
                      ) : (
                        <ConsultationForm
                          patientId={currentServing.patient_id}
                          onSubmit={handleDone}
                          submitting={submitting}
                          onCancel={null}
                          pregnancyContext={pregnancyContext}
                        />
                      )}
                    </Card>
                  </div>
                </div>
                </div>
              ) : (
                /* ── No one being served ── */
                <div className="space-y-4">
                  {/* Banner: who's next (or what to do) */}
                  <Card padding="p-0" className="overflow-hidden border-l-4 border-l-primary-700">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      {nextWaiting ? (
                        <>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-700">Up next</span>
                              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
                                Queue #{String(nextWaiting.queue_number).padStart(2, '0')}
                              </span>
                              <ConsultationTypeBadge type={nextWaiting.consultation_type} />
                            </div>
                            <h2 className="mt-2 text-xl font-bold leading-tight text-ink-900 break-words">
                              {nextWaiting.first_name} {nextWaiting.last_name}
                            </h2>
                          </div>
                          <Button onClick={handleServeNext}>Serve next patient</Button>
                        </>
                      ) : skippedList.length > 0 ? (
                        <>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-red-700">Skipped</span>
                              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
                                Queue #{String(skippedList[0].queue_number).padStart(2, '0')}
                              </span>
                            </div>
                            <h2 className="mt-2 text-xl font-bold leading-tight text-ink-900 break-words">
                              {skippedList[0].first_name} {skippedList[0].last_name}
                            </h2>
                          </div>
                          <Button onClick={() => handleReServe(skippedList[0].id)}>Re-serve patient</Button>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-700">
                              {doneList.length > 0 ? 'All caught up' : 'Queue empty'}
                            </span>
                            <h2 className="mt-2 text-xl font-bold leading-tight text-ink-900">
                              {doneList.length > 0 ? 'All patients attended to' : 'No patients in queue'}
                            </h2>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to="/patients"><Button variant="secondary">Go to Patients</Button></Link>
                            <Link to="/patients?action=add"><Button>Add patient</Button></Link>
                          </div>
                        </>
                      )}
                    </div>
                  </Card>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  {(waitingList.length > 0 || doneList.length > 0) && (
                    <div className="xl:col-span-12">
                      <Card padding="p-3">
                        {/* Queued today */}
                        {waitingList.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-ink-700 uppercase tracking-wider">Queued today</p>
                              <span className="text-xs font-medium text-ink-500">{waitingList.length}</span>
                            </div>
                            <div className="space-y-1.5">
                              {waitingList.map((q) => (
                                <QueueChip key={q.id} q={q} />
                              ))}
                            </div>
                          </div>
                        )}

                        {(waitingList.length > 0 && doneList.length > 0) && (
                          <div className="border-t border-ink-100 my-3" />
                        )}

                        {/* Completed today */}
                        {doneList.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Completed today</p>
                              <span className="text-xs font-medium text-ink-500">{doneList.length}</span>
                            </div>
                            <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
                              {doneList.map((q) => {
                                const consult = getConsultationForPatient(q.patient_id);
                                return (
                                  <div
                                    key={q.id}
                                    className="flex items-center gap-2 p-2 rounded-lg border border-ink-100 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
                                  >
                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex-shrink-0">
                                      #{String(q.queue_number).padStart(2, '0')}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-ink-900 truncate">
                                        {q.first_name} {q.last_name}
                                      </p>
                                      <p className="text-[10px] text-ink-500 truncate">
                                        {consult?.chief_complaint || 'Recorded'}
                                      </p>
                                    </div>
                                    {consult && (
                                      <Button size="sm" onClick={() => startEdit(consult)}>Edit</Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </Card>
                    </div>
                  )}
                </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Serve confirmation modal */}
      <Modal
        open={serveConfirm.open}
        onClose={() => setServeConfirm({ open: false, queueId: null })}
        title="Switch serving patient?"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setServeConfirm({ open: false, queueId: null })}
            >
              Cancel
            </Button>
            <Button onClick={() => confirmServe()}>
              Yes, serve this patient
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink-700 space-y-2">
          <p>
            <strong>{currentServing ? `${currentServing.first_name} ${currentServing.last_name}` : 'A patient'}</strong>{' '}
            is currently being served.
          </p>
          {(() => {
            const target = queue.find((q) => q.id === serveConfirm.queueId);
            return target ? (
              <p>
                Do you want to serve{' '}
                <strong>{target.first_name} {target.last_name}</strong>{' '}
                instead? The current patient will return to the queue.
              </p>
            ) : null;
          })()}
        </div>
      </Modal>
    </div>
  );
}

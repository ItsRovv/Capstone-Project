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
import { pregnancyService } from '../services/pregnancyService';
import { ConsultationForm } from '../components/ConsultationForm';
import { matchPrescriptionToVitamins, calculateVitaminsTotal } from '../utils/prescriptionMatcher';
import { apiError } from '../services/api';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

function QueueChip({ q, onClick, actionLabel, accent = 'primary' }) {
  const accents = {
    primary: 'bg-primary-100 text-primary-700 hover:border-primary-300 hover:bg-primary-50/30',
    emerald: 'bg-emerald-100 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/30',
    red: 'bg-red-100 text-red-700 hover:border-red-300 hover:bg-red-50/30'
  };
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border border-ink-100 transition-colors ${accents[accent]}`}>
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${accents[accent].split(' ')[0]} ${accents[accent].split(' ')[1]}`}>
        #{String(q.queue_number).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ink-900 truncate">
          {q.first_name} {q.last_name}
        </p>
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

  const currentServing = queue.find((q) => q.status === 'serving') || null;
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
        patient_id: currentServing.patient_id
      });
      const consultationId = consultResult?.id || null;

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
            vitamins: matchedVitamins.map(({ id, label, price, custom }) => ({ id, label, price, custom: !!custom })),
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

  const isEditable = (visitDate) => {
    if (!visitDate) return false;
    return Date.now() - new Date(visitDate).getTime() < ONE_WEEK_MS;
  };

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
        <div className="max-w-[1600px] w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 space-y-4">
          {loading ? (
            <PageLoader label="Loading doctor console…" />
          ) : (
            <>
              {/* ── Main landscape layout: Patient panel | SOAP form | Queue sidebar ── */}
              {currentServing ? (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  {/* Left: Patient info panel (2 cols) */}
                  <div className="xl:col-span-2 space-y-3">
                    <Card padding="p-4">
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-primary-700 text-white flex items-center justify-center text-xl font-bold mx-auto mb-2">
                          {currentServing.first_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <h2 className="font-semibold text-ink-900 text-sm">
                          {currentServing.first_name} {currentServing.last_name}
                        </h2>
                        <div className="flex items-center justify-center gap-2 mt-1">
                          <StatusBadge status="serving" />
                        </div>
                        <p className="text-xs text-ink-500 mt-1">
                          Queue #{String(currentServing.queue_number).padStart(2, '0')}
                        </p>
                      </div>
                      <div className="mt-3 pt-3 border-t border-ink-100">
                        <Link
                          to={`/patients/${currentServing.patient_id}`}
                          className="block text-xs font-medium text-primary-700 hover:text-primary-800 text-center"
                        >
                          View patient profile →
                        </Link>
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

                  {/* Center: SOAP consultation form (7 cols) */}
                  <div className="xl:col-span-7">
                    <Card padding="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-ink-800">Consultation — S.O.A.P. Notes</h3>
                        <span className="text-xs text-ink-400">
                          {currentServing.first_name} {currentServing.last_name}
                        </span>
                      </div>
                      <ConsultationForm
                        patientId={currentServing.patient_id}
                        onSubmit={handleDone}
                        submitting={submitting}
                        onCancel={null}
                        pregnancyContext={pregnancyContext}
                      />
                    </Card>
                  </div>

                  {/* Right: Queue sidebar (3 cols) */}
                  <div className="xl:col-span-3">
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
                          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Completed</p>
                          <span className="text-xs font-medium text-ink-500">{doneList.length}</span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {doneList.length === 0 ? (
                            <p className="text-xs text-ink-400 text-center py-3">None yet.</p>
                          ) : (
                            doneList.map((q) => {
                              const consult = getConsultationForPatient(q.patient_id);
                              const editable = consult && isEditable(consult.visit_date);
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
                                  {editable && (
                                    <button
                                      onClick={() => navigate(`/patients/${q.patient_id}?tab=consultations`)}
                                      className="text-xs text-primary-600 font-medium whitespace-nowrap p-1"
                                      title="Edit (within 1 week)"
                                    >
                                      <Icon.Edit width={12} height={12} />
                                    </button>
                                  )}
                                  <Link
                                    to={`/patients/${q.patient_id}?tab=consultations`}
                                    className="text-xs text-ink-500 font-medium whitespace-nowrap"
                                  >
                                    →
                                  </Link>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              ) : (
                /* ── No one being served ── */
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  <div className={waitingList.length > 0 || doneList.length > 0 ? "xl:col-span-9" : "xl:col-span-12"}>
                    {nextWaiting ? (
                      <Card>
                        <div className="p-10 text-center text-ink-500">
                          <Icon.Stethoscope
                            width={36}
                            height={36}
                            className="mx-auto text-ink-300 mb-3"
                          />
                          <p className="font-medium text-ink-700">No patient currently being served.</p>
                          <p className="text-sm mt-1">Start with the next patient in queue.</p>
                          <Button className="mt-4" onClick={handleServeNext}>
                            <Icon.Chevron width={14} height={14} className="-rotate-90" /> Serve next patient
                          </Button>
                        </div>
                      </Card>
                    ) : skippedList.length > 0 ? (
                      <Card>
                        <div className="p-10 md:p-14">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl font-bold">
                              {skippedList[0].first_name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-ink-900 text-lg">{skippedList[0].first_name} {skippedList[0].last_name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-red-100 text-red-700">
                                  Skipped
                                </span>
                                <span className="text-sm text-ink-500">Queue #{String(skippedList[0].queue_number).padStart(2, '0')}</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-base text-ink-600 mb-6">This patient was skipped and is waiting to be re-served.</p>
                          <Button size="lg" onClick={() => handleReServe(skippedList[0].id)}>
                            <Icon.Chevron width={16} height={16} className="-rotate-90" /> Re-serve patient
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      <Card>
                        <div className="p-10 md:p-14 text-center">
                          <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center mb-5">
                            <Icon.Check width={40} height={40} />
                          </div>
                          <h3 className="text-xl font-semibold text-ink-900 mb-2">
                            {doneList.length > 0 ? 'All patients attended to' : 'No patients in queue'}
                          </h3>
                          <p className="text-sm text-ink-500 mb-6 max-w-md mx-auto">
                            {doneList.length > 0
                              ? `You've completed ${doneList.length} consultation${doneList.length === 1 ? '' : 's'} today. Great work!`
                              : 'The queue is empty. Add a patient or check back later.'}
                          </p>
                          <div className="flex items-center justify-center gap-3 flex-wrap">
                            <Link to="/patients">
                              <Button variant="secondary">
                                <Icon.Users width={16} height={16} /> Go to Patients
                              </Button>
                            </Link>
                            <Link to="/patients?action=add">
                              <Button>
                                <Icon.Plus width={16} height={16} /> Add patient
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                  {(waitingList.length > 0 || doneList.length > 0) && (
                    <div className="xl:col-span-3">
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
                                <QueueChip
                                  key={q.id}
                                  q={q}
                                  onClick={() => handleServeById(q.id)}
                                  actionLabel="Serve"
                                />
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
                              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Completed</p>
                              <span className="text-xs font-medium text-ink-500">{doneList.length}</span>
                            </div>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {doneList.map((q) => {
                                const consult = getConsultationForPatient(q.patient_id);
                                const editable = consult && isEditable(consult.visit_date);
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
                                    {editable && (
                                      <button
                                        onClick={() => navigate(`/patients/${q.patient_id}?tab=consultations`)}
                                        className="text-xs text-primary-600 font-medium whitespace-nowrap p-1"
                                        title="Edit (within 1 week)"
                                      >
                                        <Icon.Edit width={12} height={12} />
                                      </button>
                                    )}
                                    <Link
                                      to={`/patients/${q.patient_id}?tab=consultations`}
                                      className="text-xs text-ink-500 font-medium whitespace-nowrap"
                                    >
                                      →
                                    </Link>
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

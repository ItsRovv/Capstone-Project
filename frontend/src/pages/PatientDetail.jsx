import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card, CardHeader } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { PageLoader } from '../components/UI/Spinner';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { patientService } from '../services/patientService';
import { consultationService } from '../services/consultationService';
import { pregnancyService } from '../services/pregnancyService';
import { admissionService } from '../services/admissionService';
import { StatusChip } from '../components/admission/StatusChip';
import { AdmitModal } from '../components/admission/AdmitModal';
import { canRecordClinical, isActiveStatus, timeAgo, useClinicOptions } from '../lib/admission';
import { apiError } from '../services/api';
import { PatientForm } from '../components/PatientForm';
import { ConsultationForm } from '../components/ConsultationForm';
import { PatientImagesCard } from '../components/PatientImagesCard';
import { useAuth } from '../contexts/AuthContext';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export function PatientDetail() {
  const { id } = useParams();
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const { user } = useAuth();
  const isStaff = user?.role === 'staff' || user?.role === 'nurse';
  const [searchParams, setSearchParams] = useSearchParams();

  const [patient, setPatient] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [pregnancies, setPregnancies] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [admitOpen, setAdmitOpen] = useState(false);
  const { byGroup } = useClinicOptions();
  const [loading, setLoading] = useState(true);
  const initialTab = searchParams.get('tab') || 'overview';
  const [tab, setTab] = useState(initialTab);

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [newConsultOpen, setNewConsultOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newPregnancyOpen, setNewPregnancyOpen] = useState(false);
  const [pregnancySubmitting, setPregnancySubmitting] = useState(false);
  const [editPregnancyOpen, setEditPregnancyOpen] = useState(false);
  const [editingPregnancy, setEditingPregnancy] = useState(null);
  const [viewConsult, setViewConsult] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [p, c, pr, ad] = await Promise.all([
        patientService.get(id),
        consultationService.listForPatient(id).catch(() => []),
        pregnancyService.listForPatient(id).catch(() => []),
        admissionService.forPatient(id).catch(() => [])
      ]);
      setPatient(p);
      setConsultations(c);
      setPregnancies(pr);
      setAdmissions(ad);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load patient'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  // Deep link: ?tab=consultations&consultation=<id> opens that consultation's
  // details once the list has loaded. Consumed once, then stripped from the URL.
  useEffect(() => {
    const consultId = searchParams.get('consultation');
    if (!consultId || !consultations.length) return;
    const next = new URLSearchParams(searchParams);
    next.delete('consultation');
    setSearchParams(next, { replace: true });
    if (isStaff) { setTab('overview'); return; }
    const match = consultations.find((c) => String(c.id) === String(consultId));
    if (match) {
      setTab('consultations');
      setViewConsult(match);
    }
  }, [consultations, isStaff, searchParams, setSearchParams]);

  async function handleEdit(payload) {
    setEditSubmitting(true);
    try {
      await patientService.update(id, payload);
      toast.success('Patient updated');
      setEditOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Update failed'));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleNewConsult(payload) {
    setSubmitting(true);
    try {
      const created = await consultationService.create({ ...payload, patient_id: Number(id) });
      toast.success('Consultation recorded');
      if (created?.pregnancy_created) toast.info('Added to Pregnancy Tracking: delivery location recorded.');
      setNewConsultOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save consultation'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNewPregnancy(payload) {
    setPregnancySubmitting(true);
    try {
      await pregnancyService.create(id, payload);
      toast.success('Pregnancy record added');
      setNewPregnancyOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save pregnancy record'));
    } finally {
      setPregnancySubmitting(false);
    }
  }

  async function handleEditPregnancy(payload) {
    if (!editingPregnancy) return;
    setPregnancySubmitting(true);
    try {
      await pregnancyService.update(id, editingPregnancy.id, payload);
      toast.success('Pregnancy record updated');
      setEditPregnancyOpen(false);
      setEditingPregnancy(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not update pregnancy record'));
    } finally {
      setPregnancySubmitting(false);
    }
  }

  async function handleDeletePregnancy(prId) {
    if (!window.confirm('Are you sure you want to delete this pregnancy record?')) return;
    try {
      await pregnancyService.remove(id, prId);
      toast.success('Pregnancy record deleted');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not delete pregnancy record'));
    }
  }

  async function handleUpdatePregnancyStatus(prId, status) {
    try {
      await pregnancyService.update(id, prId, { status });
      toast.success(`Status updated to ${status}`);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not update status'));
    }
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <Topbar title="Patient" onMenuClick={onOpenMenu} />
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <PageLoader />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="h-full flex flex-col">
        <Topbar title="Not found" onMenuClick={onOpenMenu} />
        <div className="flex-1 overflow-y-auto p-4 md:p-8 text-center text-ink-500">Patient not found.</div>
      </div>
    );
  }

  const age = patient.age || ageFromDob(patient.date_of_birth);
  const showAdmissions = patient.sex?.toLowerCase() !== 'male';
  const canAdmit = canRecordClinical(user?.role);
  const activeAdmission = admissions.find((x) => isActiveStatus(x.status));

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={`Patient #${patient.id} · ${patient.sex || '—'}${age ? ` · ${age} y/o` : ''}`}
        onMenuClick={onOpenMenu}
        right={
          <div className="flex gap-2">
            {canAdmit && showAdmissions && !activeAdmission && (
              <Button variant="secondary" onClick={() => setAdmitOpen(true)}>
                Admit
              </Button>
            )}
            {activeAdmission && (
              <Button variant="secondary" onClick={() => toast.info('Patient is admitted')}>
                Admitted
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Icon.Edit width={16} height={16} /> Edit
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto pt-3 md:pt-6 pb-4 md:pb-8">
        <div className="w-full px-4 md:px-8 space-y-4">
          <Card>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Date of birth" value={formatDate(patient.date_of_birth)} />
              <Field label="Contact" value={patient.contact_number} />
              <Field label="Address" value={patient.address} />
              <Field label="Emergency" value={patient.emergency_contact} />
            </div>
          </div>
        </Card>

        <div className="flex gap-2 border-b border-ink-100">
          {[
            { key: 'overview', label: 'Overview' },
            ...(isStaff ? [] : [{ key: 'consultations', label: 'Recent consultations' }]),
            ...(showAdmissions ? [{ key: 'admissions', label: 'Recent admissions' }] : [])
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                if (searchParams.has('tab')) {
                  setSearchParams({}, { replace: true });
                }
              }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Emergency Contact — top of page, all patients */}
            <PersonalInfoCard patient={patient} />

            {/* Recent Consultation — hidden for staff/nurse (clinical privacy) */}
            {!isStaff && (
              <RecentConsultationCard
                consultations={consultations}
                onViewDetail={(c) => setViewConsult(c)}
                onViewAll={() => setTab('consultations')}
              />
            )}

            <div className={`grid grid-cols-1 ${isStaff ? '' : 'md:grid-cols-2'} gap-4 items-start ${patient.sex?.toLowerCase() === 'male' ? 'md:grid-cols-1' : ''}`}>
              {/* Pregnancy History — expandable, hidden for male patients */}
              {patient.sex?.toLowerCase() !== 'male' && (
                <PregnancyCard
                  patient={patient}
                  pregnancies={pregnancies}
                  isStaff={isStaff}
                  onAddNew={() => setNewPregnancyOpen(true)}
                  onEdit={(pr) => {
                    setEditingPregnancy(pr);
                    setEditPregnancyOpen(true);
                  }}
                  onDelete={handleDeletePregnancy}
                  onUpdateStatus={handleUpdatePregnancyStatus}
                />
              )}
              {/* Medical Information — hidden for staff/nurse (clinical privacy) */}
              {!isStaff && (
                <MedicalInfoCard patient={patient} />
              )}
            </div>

            {/* Result images — ultrasound & lab result photos */}
            <PatientImagesCard
              patientId={patient.id}
              pregnancies={pregnancies}
              canDelete={user?.role === 'admin' || user?.role === 'doctor'}
            />
          </div>
        )}

        {tab === 'admissions' && showAdmissions && (
          <Card padding="p-0" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-ink-100">
              <p className="font-semibold text-ink-900">Recent admissions</p>
              {canAdmit && !activeAdmission && (
                <Button onClick={() => setAdmitOpen(true)}>
                  <Icon.Plus width={16} height={16} /> Admit patient
                </Button>
              )}
            </div>
            {admissions.length === 0 ? (
              <p className="px-6 py-10 text-sm text-ink-500 text-center">Not admitted before.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {admissions.map((a) => (
                  <li key={a.id}>
                    <Link to={`/admissions/${a.id}`} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-ink-50/60">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900 truncate">
                          {a.chief_complaint || `Admission ${a.id}`}
                        </p>
                        <p className="text-xs text-ink-500 mt-0.5">{formatDateTime(a.admitted_at)}</p>
                      </div>
                      <span className="text-xs text-primary-600 font-medium whitespace-nowrap flex-shrink-0">
                        View details &rarr;
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'consultations' && !isStaff && (
          <Card padding="p-0" className="overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
              <p className="font-semibold text-ink-900">Recent consultations</p>
              <Button onClick={() => setNewConsultOpen(true)}>
                <Icon.Plus width={16} height={16} /> New consultation
              </Button>
            </div>
            {consultations.length === 0 ? (
              <p className="text-sm text-ink-500 p-6 text-center">No consultations.</p>
            ) : (
              <ConsultationGroups consultations={consultations} pregnancies={pregnancies} onView={setViewConsult} />
            )}
          </Card>
        )}
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit patient" size="xl">
        <PatientForm
          initial={patient}
          onSubmit={handleEdit}
          submitting={editSubmitting}
        />
      </Modal>

      <Modal
        open={newConsultOpen}
        onClose={() => setNewConsultOpen(false)}
        title="New consultation"
        size="2xl"
      >
        <ConsultationForm
          patientId={Number(id)}
          onSubmit={handleNewConsult}
          submitting={submitting}
        />
      </Modal>

      <AdmitModal
        open={admitOpen}
        onClose={() => { setAdmitOpen(false); load(); }}
        patient={patient}
        byGroup={byGroup}
      />

      <Modal
        open={newPregnancyOpen}
        onClose={() => setNewPregnancyOpen(false)}
        title="New pregnancy record"
        size="2xl"
      >
        <PregnancyForm
          onSubmit={handleNewPregnancy}
          submitting={pregnancySubmitting}
          onCancel={() => setNewPregnancyOpen(false)}
        />
      </Modal>

      <Modal
        open={editPregnancyOpen}
        onClose={() => {
          setEditPregnancyOpen(false);
          setEditingPregnancy(null);
        }}
        title="Edit pregnancy record"
        size="2xl"
      >
        <PregnancyForm
          initialData={editingPregnancy}
          onSubmit={handleEditPregnancy}
          submitting={pregnancySubmitting}
          onCancel={() => {
            setEditPregnancyOpen(false);
            setEditingPregnancy(null);
          }}
        />
      </Modal>

      {/* Consultation detail modal */}
      <ConsultationDetailModal
        consultation={viewConsult}
        onClose={() => setViewConsult(null)}
      />
    </div>
  );
}

function SoapBadge({ consultation }) {
  const type = consultation.consultation_type;
  // Prenatal and postnatal consultations have their own structured forms,
  // so the SOAP completeness badge doesn't apply to them.
  if (type === 'prenatal' || type === 'postnatal') return null;

  const hasSOAP = consultation.subjective || consultation.objective || consultation.assessment || consultation.plan;
  const allFilled = consultation.subjective && consultation.objective && consultation.assessment && consultation.plan;
  const hasLegacy = consultation.structured_notes || consultation.chief_complaint;

  if (allFilled) {
    return <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">SOAP</span>;
  }
  if (hasSOAP) {
    return <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Partial SOAP</span>;
  }
  if (hasLegacy) {
    return <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 bg-ink-100 border border-ink-200 px-1.5 py-0.5 rounded">Legacy</span>;
  }
  return null;
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-ink-700 mt-0.5">{value || '—'}</p>
    </div>
  );
}

function PregnancyCard({ patient, pregnancies, isStaff, onAddNew, onEdit, onDelete, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(pregnancies.length > 0);
  const [savingId, setSavingId] = useState(null);

  const latest = pregnancies[0];
  // Wider grids in landscape (staff) mode since the card spans full width
  const mainGrid = isStaff ? 'grid grid-cols-3 md:grid-cols-6 gap-3' : 'grid grid-cols-2 gap-3';
  const baselineGrid = isStaff ? 'grid grid-cols-4 md:grid-cols-8 gap-3' : 'grid grid-cols-2 gap-3';

  async function handleStatusChange(prId, newStatus) {
    setSavingId(prId);
    await onUpdateStatus?.(prId, newStatus);
    setSavingId(null);
  }

  return (
    <Card>
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardHeader title="Pregnancy History" subtitle={expanded ? 'Tap to collapse' : 'Tap to expand'} />
        <span className="text-ink-500 text-sm font-medium">
          {expanded ? '−' : '+'}
        </span>
      </div>
      {expanded && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {pregnancies.length === 0 ? (
            <p className="text-sm text-ink-500">No pregnancy history yet — first pregnancy.</p>
          ) : (
            <div className="space-y-3">
              {pregnancies.map((pr, idx) => (
                <div key={pr.id} className={`p-3 rounded-lg ${idx === 0 ? 'bg-primary-50/40 border border-primary-100' : 'bg-ink-50/40 border border-ink-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    {idx === 0 ? (
                      <span className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider">Current</span>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit?.(pr);
                        }}
                        className="p-1 rounded-md hover:bg-ink-100 text-ink-400 hover:text-ink-700 transition-colors"
                        title="Edit"
                      >
                        <Icon.Edit width={14} height={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete?.(pr.id);
                        }}
                        className="p-1 rounded-md hover:bg-red-50 text-ink-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Icon.Trash width={14} height={14} />
                      </button>
                    </div>
                  </div>
                  <div className={mainGrid}>
                    <Field label="LMP" value={formatDate(pr.lmp)} />
                    <Field label="EDD" value={formatDate(pr.edd)} />
                    <Field label="GP" value={pr.gp} />
                    <Field label="Trimester" value={pr.trimester} />
                    <Field label="Weeks" value={pr.weeks} />
                    <StatusSelect
                      label="Status"
                      value={pr.status}
                      onChange={(v) => handleStatusChange(pr.id, v)}
                      disabled={savingId === pr.id}
                    />
                  </div>
                  {(pr.baseline_weight_kg || pr.baseline_height_cm || pr.aog || pr.ob_index || pr.blood_type || pr.pregnancy_number) && (
                    <div className="pt-2 border-t border-ink-100 mt-2">
                      <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">Baseline Data</p>
                      <div className={baselineGrid}>
                        <Field label="Weight" value={pr.baseline_weight_kg ? `${pr.baseline_weight_kg} kg` : null} />
                        <Field label="Height" value={pr.baseline_height_cm ? `${pr.baseline_height_cm} cm` : null} />
                        <Field label="BMI" value={pr.baseline_bmi} />
                        <Field label="AOG" value={pr.aog} />
                        <Field label="OB Index" value={pr.ob_index} />
                        <Field label="Blood Type" value={pr.blood_type} />
                        <Field label="Pregnancy #" value={pr.pregnancy_number} />
                        <Field label="First Visit" value={formatDate(pr.first_visit_date)} />
                      </div>
                    </div>
                  )}
                  {Array.isArray(pr.pregnancy_history) && pr.pregnancy_history.length > 0 && (
                    <div className="pt-2 border-t border-ink-100 mt-2">
                      <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">Earlier pregnancies</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-ink-500">
                            <tr>
                              <th className="text-left py-1 pr-3 font-medium">#</th>
                              <th className="text-left py-1 pr-3 font-medium">Delivered</th>
                              <th className="text-left py-1 pr-3 font-medium">Type</th>
                              <th className="text-left py-1 pr-3 font-medium">Outcome</th>
                              <th className="text-left py-1 pr-3 font-medium">Children</th>
                              <th className="text-left py-1 pr-3 font-medium">Baby</th>
                              <th className="text-left py-1 pr-3 font-medium">Place of birth</th>
                              <th className="text-left py-1 font-medium">Complications</th>
                            </tr>
                          </thead>
                          <tbody className="text-ink-800">
                            {pr.pregnancy_history.map((h, i) => {
                              const flags = [h.pregnancy_hypertension === 'Y' && 'PIH', h.preeclampsia && h.preeclampsia !== 'N' && h.preeclampsia, h.bleeding === 'Y' && 'Bleeding'].filter(Boolean);
                              return (
                                <tr key={i} className="border-t border-ink-100">
                                  <td className="py-1 pr-3">{h.pregnancy_no || i + 1}</td>
                                  <td className="py-1 pr-3 whitespace-nowrap">{h.delivery_date ? formatDate(h.delivery_date) : '-'}</td>
                                  <td className="py-1 pr-3">{h.delivery_type === 'CS' ? 'Caesarean' : h.delivery_type === 'N' ? 'Normal' : '-'}</td>
                                  <td className="py-1 pr-3">{{ A: 'Alive', M: 'Miscarriage', S: 'Stillbirth' }[h.birth_outcome] || '-'}</td>
                                  <td className="py-1 pr-3">{{ S: 'Single', T: 'Twins', M: 'Multiple' }[h.children_count] || '-'}</td>
                                  <td className="py-1 pr-3">{h.baby_name || '-'}</td>
                                  <td className="py-1 pr-3">{h.place_of_birth || '-'}</td>
                                  <td className="py-1">{flags.length ? flags.join(', ') : 'None'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {pr.notes && (
                    <div className="pt-2 border-t border-ink-100 mt-2">
                      <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-sm text-ink-600">{pr.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={onAddNew} className="w-full">
            <Icon.Plus width={14} height={14} /> Add pregnancy record
          </Button>
        </div>
      )}
      {!expanded && (
        <p className="text-sm text-ink-500">
          {latest
            ? `${latest.trimester || '—'} · ${latest.weeks || '—'}`
            : 'No pregnancy history yet'}
        </p>
      )}
    </Card>
  );
}

function StatusSelect({ label, value, onChange, disabled }) {
  const styles = {
    Ongoing: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    Completed: 'text-slate-700 bg-slate-100 border-slate-200'
  };
  return (
    <div>
      <p className="text-xs font-medium text-ink-400 uppercase tracking-wider">{label}</p>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`mt-0.5 text-sm font-medium rounded-lg px-2 py-1 border outline-none focus:ring-2 focus:ring-primary-300 cursor-pointer appearance-none ${styles[value] || 'text-ink-700 bg-white border-ink-200'}`}
        style={{ backgroundImage: 'none' }}
      >
        <option value="Ongoing">Ongoing</option>
        <option value="Completed">Completed</option>
      </select>
    </div>
  );
}

function MedicalInfoCard({ patient }) {
  const info = patient.medical_info;
  // Fall back to legacy comma-separated `allergies` text if medical_info hasn't been filled in yet.
  const legacyAllergies = patient.allergies
    ? patient.allergies.split(',').map((a) => a.trim()).filter(Boolean)
    : [];
  const allergies = info?.drug_food_allergies?.length ? info.drug_food_allergies : legacyAllergies;
  const medications = info?.medications_supplements || [];
  const illnessRows = (info?.illness_history || []).filter((r) => r.personal || r.family || r.remarks);
  const highRisk = info?.high_risk_behavior;
  const highRiskFlags = ['smoking', 'alcohol_intake'].filter(
    (k) => highRisk?.[k]?.personal || highRisk?.[k]?.family
  );

  return (
    <Card>
      <CardHeader title="Medical Information" />
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">Drug &amp; Food Allergies</p>
          {allergies.length === 0 ? (
            <p className="text-sm text-ink-500">No known allergies.</p>
          ) : (
            <ul className="space-y-1">
              {allergies.map((a, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-sm font-medium text-red-600">{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {medications.length > 0 && (
          <div>
            <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">Medications &amp; Supplements</p>
            <ul className="space-y-1">
              {medications.map((m, i) => (
                <li key={i} className="text-sm text-ink-700">• {m}</li>
              ))}
            </ul>
          </div>
        )}

        {illnessRows.length > 0 && (
          <div className="pt-2 border-t border-ink-100">
            <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">Illness / Health Problems</p>
            <ul className="space-y-1">
              {illnessRows.map((r, i) => (
                <li key={i} className="text-sm text-ink-700">
                  {r.condition}
                  {r.personal && <span className="ml-1 text-xs text-amber-600 font-medium">(Personal)</span>}
                  {r.family && <span className="ml-1 text-xs text-amber-600 font-medium">(Family)</span>}
                  {r.remarks && <span className="ml-1 text-xs text-ink-500">— {r.remarks}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {highRiskFlags.length > 0 && (
          <div className="pt-2 border-t border-ink-100">
            <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">High-Risk Behavior</p>
            <ul className="space-y-1">
              {highRiskFlags.map((k) => (
                <li key={k} className="text-sm text-ink-700 capitalize">
                  {k === 'alcohol_intake' ? 'Alcohol Intake' : 'Smoking'}
                  {highRisk[k].remarks && <span className="ml-1 text-xs text-ink-500">— {highRisk[k].remarks}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function ConsultationDetailModal({ consultation, onClose }) {
  if (!consultation) return null;
  const c = consultation;
  const editable = c.visit_date && Date.now() - new Date(c.visit_date).getTime() < ONE_WEEK_MS;
  // Prenatal/postnatal consultations show a simple overview of the visit —
  // the SOAP layout only applies to normal consultations.
  const typedVisit = c.consultation_type === 'prenatal' || c.consultation_type === 'postnatal';

  return (
    <Modal
      open={Boolean(consultation)}
      onClose={onClose}
      title="Consultation Details"
      size="lg"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Header: date + badge */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-500">{formatDateTime(c.visit_date)}</p>
          <div className="flex items-center gap-1.5">
            {c.consultation_type && c.consultation_type !== 'normal' && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded">
                {c.consultation_type}
              </span>
            )}
            <SoapBadge consultation={c} />
          </div>
        </div>

        {/* Chief complaint */}
        {!typedVisit && c.chief_complaint && (
          <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3">
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-0.5">Chief Complaint</p>
            <p className="text-sm font-medium text-ink-900">{c.chief_complaint}</p>
          </div>
        )}

        {/* SOAP Notes — 2x2 grid (normal consultations only) */}
        {!typedVisit && (c.subjective || c.objective || c.assessment || c.plan) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {c.subjective && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                <p className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-1">S — Subjective</p>
                <p className="text-sm text-ink-700 whitespace-pre-wrap">{c.subjective}</p>
              </div>
            )}
            {c.objective && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">O — Objective</p>
                <p className="text-sm text-ink-700 whitespace-pre-wrap">{c.objective}</p>
              </div>
            )}
            {c.assessment && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">A — Assessment</p>
                <p className="text-sm text-ink-700 whitespace-pre-wrap">{c.assessment}</p>
              </div>
            )}
            {c.plan && (
              <div className="rounded-lg border border-primary-200 bg-primary-50/50 p-3">
                <p className="text-xs font-bold text-primary-700 uppercase tracking-wide mb-1">P — Plan</p>
                <p className="text-sm text-ink-700 whitespace-pre-wrap">{c.plan}</p>
              </div>
            )}
          </div>
        )}

        {/* Diagnosis + Follow-up (normal consultations only) */}
        {!typedVisit && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {c.diagnosis && (
            <div>
              <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-0.5">Diagnosis</p>
              <p className="text-sm text-ink-700 whitespace-pre-wrap">{c.diagnosis}</p>
            </div>
          )}
          {c.followUp && (
            <div>
              <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-0.5">Follow-up</p>
              <p className="text-sm text-ink-700 whitespace-pre-wrap">{c.followUp}</p>
            </div>
          )}
        </div>
        )}

        {/* Prescription (normal consultations only) */}
        {!typedVisit && c.prescription && (
          <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3">
            <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-1">Prescription</p>
            <p className="text-sm text-ink-700 whitespace-pre-wrap font-mono">{c.prescription}</p>
          </div>
        )}

        {/* Postnatal visit data */}
        {c.postnatal_data && <PostnatalDataView data={c.postnatal_data} />}

        {/* Prenatal visit data */}
        {c.prenatal_data && <PrenatalDataView data={c.prenatal_data} />}

        {/* Legacy structured notes (if no SOAP fields) */}
        {!c.subjective && !c.objective && !c.assessment && !c.plan && c.structured_notes && (
          <div className="rounded-lg border border-ink-200 p-3">
            <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-ink-700 whitespace-pre-wrap">{c.structured_notes}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-ink-100">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {editable && (
          <Button onClick={() => { onClose(); }}>
            <Icon.Edit width={14} height={14} /> Edit (within 1 week)
          </Button>
        )}
      </div>
    </Modal>
  );
}

const POSTNATAL_SERVICE_LABELS = {
  tetanus: 'Tetanus Immunization',
  mms: 'MMS',
  iron: 'Iron',
  folic_acid: 'Folic Acid',
  calcium: 'Calcium',
  counseling: 'Counseling',
  mental_health: 'Mental Health',
  family_planning: 'Family Planning',
  nutrition_counseling: 'Nutrition Counseling',
  lactation_management: 'Lactation Management'
};

function PnField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-ink-700 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function postnatalServicesText(services) {
  if (!services) return '';
  return Object.entries(services)
    .filter(([, v]) => (typeof v === 'object' ? v?.given : v))
    .map(([k, v]) => {
      const label = POSTNATAL_SERVICE_LABELS[k] || k;
      return typeof v === 'object' && v.qty ? `${label} x${v.qty}` : label;
    })
    .join(', ');
}

function PostnatalDataView({ data }) {
  const services = postnatalServicesText(data.services);
  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3 space-y-3">
      <p className="text-xs font-bold text-primary-700 uppercase tracking-wide">
        Postpartum Care Record — Visit #{data.visit_no || '—'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <PnField label="Visit Date" value={formatDate(data.visit_date)} />
        <PnField label="BP" value={data.bp} />
        <PnField label="Temperature" value={data.temperature ? `${data.temperature}°C` : ''} />
        <PnField label="Weight" value={data.weight_kg ? `${data.weight_kg} kg` : ''} />
        <PnField label="Date of Delivery" value={formatDate(data.delivery_date)} />
        <PnField label="Referred" value={data.referred ? `Yes${data.referral_reason ? ` — ${data.referral_reason}` : ''}` : ''} />
        <PnField label="Provider" value={data.provider_name} />
      </div>
      <PnField label="General Survey / Pertinent Findings" value={data.general_survey} />
      <PnField label="OB History" value={data.ob_history} />
      <PnField label="Services Provided" value={services} />
    </div>
  );
}

const FETAL_POSITIONS = { C: 'Cephalic', B: 'Breech', O: 'Oblique', T: 'Transverse' };

function PrenatalDataView({ data }) {
  const yn = (v) => (v === 'Y' ? 'Yes' : v === 'N' ? 'No' : '');
  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3 space-y-3">
      <p className="text-xs font-bold text-primary-700 uppercase tracking-wide">Prenatal Check-up</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <PnField label="Visit Date" value={formatDate(data.visit_date)} />
        <PnField label="AOG by LMP" value={data.aog_lmp} />
        <PnField label="AOG by UTZ" value={data.aog_utz} />
        <PnField label="BP" value={data.bp} />
        <PnField label="Temperature" value={data.temperature ? `${data.temperature}°C` : ''} />
        <PnField label="Pulse" value={data.pulse_rate ? `${data.pulse_rate} bpm` : ''} />
        <PnField label="SpO2" value={data.spo2 ? `${data.spo2}%` : ''} />
        <PnField label="Weight" value={data.weight_kg ? `${data.weight_kg} kg` : ''} />
        <PnField label="Fundic Height" value={data.fundic_height_cm ? `${data.fundic_height_cm} cm` : ''} />
        <PnField label="Fetal Heart Tone" value={data.fetal_heart_tone ? `${data.fetal_heart_tone} bpm` : ''} />
        <PnField label="Fetal Position" value={FETAL_POSITIONS[data.fetal_position] || data.fetal_position} />
        <PnField label="Next Visit" value={formatDate(data.next_visit)} />
        <PnField label="Provider" value={data.provider_name} />
      </div>
      <PnField label="Hemoglobin Count" value={data.lab_hemoglobin} />
      <PnField label="Urinalysis" value={data.lab_urinalysis} />
      <PnField label="STIs" value={data.lab_stis} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <PnField label="Swelling of face/hands" value={yn(data.swelling_face_hands)} />
        <PnField label="Vaginal Bleeding" value={yn(data.vaginal_bleeding)} />
        <PnField label="Vaginal Infection" value={yn(data.vaginal_infection)} />
      </div>
      {data.counseling?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Counseling</p>
          <ul className="text-sm text-ink-700 list-disc list-inside">
            {data.counseling.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
      <PnField label="Rx and Supplements" value={data.rx_supplements} />
      <PnField label="Remarks" value={data.remarks} />
    </div>
  );
}

// Consultations grouped by pregnancy so a returning patient's old visits do
// not pile up with her current pregnancy's visits. A consultation belongs to
// the pregnancy whose [start, next pregnancy start) window contains its date.
function groupConsultationsByPregnancy(consultations, pregnancies) {
  const sorted = [...(pregnancies || [])]
    .map((p) => ({ ...p, _start: new Date(p.first_visit_date || p.created_at || 0).getTime() }))
    .sort((a, b) => a._start - b._start);
  const groups = sorted.map((p, i) => ({
    pregnancy: p,
    start: p._start,
    end: i + 1 < sorted.length ? sorted[i + 1]._start : Infinity,
    consultations: []
  }));
  const other = { pregnancy: null, consultations: [] };
  for (const c of consultations) {
    const t = new Date(c.visit_date || 0).getTime();
    const g = groups.find((g) => t >= g.start && t < g.end);
    (g || other).consultations.push(c);
  }
  return [
    ...groups.filter((g) => g.consultations.length > 0).reverse(),
    ...(other.consultations.length ? [other] : [])
  ];
}

function ConsultationGroups({ consultations, pregnancies, onView }) {
  const groups = groupConsultationsByPregnancy(consultations, pregnancies);
  // Ongoing pregnancy's group starts expanded; everything else collapsed.
  const [open, setOpen] = useState(() => {
    const idx = groups.findIndex((g) => (g.pregnancy?.status || '').toLowerCase() === 'ongoing');
    return idx >= 0 ? { [idx]: true } : groups.length ? { 0: true } : {};
  });

  return (
    <div className="divide-y divide-ink-100">
      {groups.map((g, gi) => {
        const p = g.pregnancy;
        const isOngoing = (p?.status || '').toLowerCase() === 'ongoing';
        const label = p
          ? `Pregnancy ${p.pregnancy_number ? `#${p.pregnancy_number}` : ''} · ${p.status || 'record'}`
          : 'Other consultations';
        const startLabel = p?.first_visit_date ? formatDate(p.first_visit_date) : null;
        return (
          <div key={gi}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [gi]: !o[gi] }))}
              className="w-full flex items-center justify-between px-6 py-3 bg-ink-50/60 hover:bg-ink-100/60 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                <span className={`transition-transform ${open[gi] ? 'rotate-90' : ''}`}>▸</span>
                {label}
                {isOngoing && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    Current
                  </span>
                )}
                {startLabel && <span className="text-xs font-normal text-ink-500">started {startLabel}</span>}
              </span>
              <span className="text-xs text-ink-400">{g.consultations.length} visit{g.consultations.length !== 1 ? 's' : ''}</span>
            </button>
            {open[gi] && (
              <ul className="divide-y divide-ink-100">
                {g.consultations.map((c) => (
                  <li
                    key={c.id}
                    className="px-6 py-4 hover:bg-ink-50/60 transition-colors cursor-pointer"
                    onClick={() => onView(c)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-ink-900 truncate">
                            {c.chief_complaint || 'Consultation'}
                          </p>
                          {c.consultation_type && c.consultation_type !== 'normal' && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-700 bg-pink-50 border border-pink-200 px-1.5 py-0.5 rounded flex-shrink-0">
                              {c.consultation_type}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-500 mt-0.5">
                          {formatDateTime(c.visit_date)}
                        </p>
                      </div>
                      <span className="text-xs text-primary-600 font-medium whitespace-nowrap flex-shrink-0">
                        View details →
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecentConsultationCard({ consultations, onViewDetail, onViewAll }) {
  const latest = consultations[0];

  if (!latest) {
    return (
      <Card>
        <CardHeader title="Recent Consultation" />
        <p className="text-sm text-ink-500">No consultations recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card className="hover:border-primary-300 transition-colors">
      <div className="flex items-start justify-between">
        <button
          type="button"
          onClick={() => onViewDetail(latest)}
          className="flex-1 text-left cursor-pointer min-w-0"
        >
          <CardHeader
            title="Recent Consultation"
            subtitle={formatDateTime(latest.visit_date)}
          />
          <p className="font-medium text-ink-900 mt-1 line-clamp-2">
            {latest.chief_complaint || 'Consultation visit'}
          </p>
          {latest.diagnosis && (
            <p className="text-sm text-ink-500 mt-1 line-clamp-2">
              <span className="font-medium">Dx:</span> {latest.diagnosis}
            </p>
          )}
        </button>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <SoapBadge consultation={latest} />
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-primary-600 font-medium whitespace-nowrap hover:text-primary-800"
          >
            View all →
          </button>
        </div>
      </div>
    </Card>
  );
}

function PersonalInfoCard({ patient }) {
  const info = patient.personal_info;

  return (
    <Card>
      <CardHeader title="Emergency Contact" />
      {info?.emergency_contact?.name ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Name" value={info.emergency_contact.name} />
          <Field label="Relationship" value={info.emergency_contact.relationship} />
          <Field label="Phone" value={info.emergency_contact.phone} />
          <Field label="Address" value={info.emergency_contact.address} />
        </div>
      ) : (
        <p className="text-sm text-ink-500">No emergency contact on file.</p>
      )}
    </Card>
  );
}

const HISTORY_FIELDS = [
  { key: 'delivery_date', label: 'Date of delivery', type: 'date' },
  { key: 'delivery_type', label: 'Type of delivery', options: [['N', 'Normal (N)'], ['CS', 'Caesarean (CS)']] },
  { key: 'birth_outcome', label: 'Birth outcome', options: [['A', 'Alive (A)'], ['M', 'Miscarriage (M)'], ['S', 'Stillbirth (S)']] },
  { key: 'children_count', label: 'No. of children delivered', options: [['S', 'Single (S)'], ['T', 'Twins (T)'], ['M', 'Multiple']] },
  { key: 'baby_name', label: "Baby's name", type: 'text' },
  { key: 'place_of_birth', label: 'Place of birth (hospital)', type: 'text' },
  { key: 'pregnancy_hypertension', label: 'Pregnancy-induced hypertension', options: [['Y', 'Y'], ['N', 'N']] },
  { key: 'preeclampsia', label: 'Preeclampsia / Eclampsia', options: [['PE', 'PE'], ['E', 'E'], ['N', 'N']] },
  { key: 'bleeding', label: 'Bleeding during/after pregnancy', options: [['Y', 'Y'], ['N', 'N']] }
];
const blankHistoryRow = Object.fromEntries(HISTORY_FIELDS.map((f) => [f.key, '']));
const historyCellClass = 'w-full min-w-[7rem] px-2 py-1.5 rounded-md border border-ink-200 text-xs bg-white outline-none focus:border-primary-400';

// Earlier pregnancies, laid out like the paper "Maternal & Pregnancy History" sheet:
// one column per pregnancy number, one row per question.
function HistoryTable({ rows, onChange }) {
  const set = (i, key) => (e) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: e.target.value } : r)));
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200">
      <table className="w-full text-xs">
        <thead className="bg-ink-50 text-ink-600">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Pregnancy number</th>
            {rows.map((_, i) => <th key={i} className="px-2 py-2 font-semibold">{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {HISTORY_FIELDS.map((f) => (
            <tr key={f.key} className="border-t border-ink-100">
              <td className="px-3 py-1.5 font-medium text-ink-700 whitespace-nowrap">{f.label}</td>
              {rows.map((r, i) => (
                <td key={i} className="px-1.5 py-1.5">
                  {f.options ? (
                    <select value={r[f.key] || ''} onChange={set(i, f.key)} className={historyCellClass}>
                      <option value="">-</option>
                      {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : (
                    <input type={f.type} value={r[f.key] || ''} onChange={set(i, f.key)} className={historyCellClass} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PregnancyForm({ initialData, onSubmit, submitting, onCancel }) {
  const blank = {
    lmp: '',
    edd: '',
    gp: '',
    trimester: '',
    weeks: '',
    status: 'Ongoing',
    notes: '',
    baseline_weight_kg: '',
    baseline_height_cm: '',
    aog: '',
    ob_index: '',
    blood_type: '',
    pregnancy_number: '',
    first_visit_date: ''
  };

  const [form, setForm] = useState(blank);
  const [showBaseline, setShowBaseline] = useState(false);
  // New record: first ask whether this is her first pregnancy (null = not answered yet).
  const [isFirst, setIsFirst] = useState(initialData ? true : null);
  const [history, setHistory] = useState([]);
  const [formError, setFormError] = useState('');

  // Reset form when initialData changes (edit mode)
  useEffect(() => {
    if (initialData) {
      setForm({
        lmp: initialData.lmp ?? '',
        edd: initialData.edd ?? '',
        gp: initialData.gp ?? '',
        trimester: initialData.trimester ?? '',
        weeks: initialData.weeks ? String(initialData.weeks) : '',
        status: initialData.status ?? 'Ongoing',
        notes: initialData.notes ?? '',
        baseline_weight_kg: initialData.baseline_weight_kg ?? '',
        baseline_height_cm: initialData.baseline_height_cm ?? '',
        aog: initialData.aog ?? '',
        ob_index: initialData.ob_index ?? '',
        blood_type: initialData.blood_type ?? '',
        pregnancy_number: initialData.pregnancy_number ?? '',
        first_visit_date: initialData.first_visit_date ?? ''
      });
      setShowBaseline(!!(initialData.baseline_weight_kg || initialData.baseline_height_cm || initialData.aog || initialData.ob_index));
      const saved = Array.isArray(initialData.pregnancy_history) ? initialData.pregnancy_history : [];
      setHistory(saved.map((r) => ({ ...blankHistoryRow, ...r })));
      setIsFirst(true);
    } else {
      setForm(blank);
      setShowBaseline(false);
      setHistory([]);
      setIsFirst(null);
    }
  }, [initialData]);

  // One column per earlier pregnancy (pregnancy number minus one).
  useEffect(() => {
    const n = parseInt(form.pregnancy_number, 10);
    if (!n || n < 2) return;
    const count = Math.min(n - 1, 9);
    setHistory((h) => Array.from({ length: count }, (_, i) => h[i] || { ...blankHistoryRow }));
  }, [form.pregnancy_number]);

  // Auto-calculate BMI from weight (kg) and height (cm)
  const bmi = (() => {
    const w = parseFloat(form.baseline_weight_kg);
    const h = parseFloat(form.baseline_height_cm);
    if (!w || !h) return '';
    const heightM = h / 100;
    return (w / (heightM * heightM)).toFixed(1);
  })();

  // Auto-calculate EDD, trimester, and weeks from LMP (Naegele's rule: +280 days)
  useEffect(() => {
    if (!form.lmp) return;
    const lmpDate = new Date(form.lmp);
    if (isNaN(lmpDate)) return;

    // EDD = LMP + 280 days
    const eddDate = new Date(lmpDate);
    eddDate.setDate(eddDate.getDate() + 280);
    const eddStr = eddDate.toISOString().split('T')[0];

    // Weeks = days from LMP to today / 7
    const today = new Date();
    const diffDays = Math.floor((today - lmpDate) / (1000 * 60 * 60 * 24));
    const weeks = Math.max(0, Math.floor(diffDays / 7));

    // Trimester from weeks
    let trimester = '';
    if (weeks <= 12) trimester = '1st Trimester';
    else if (weeks <= 27) trimester = '2nd Trimester';
    else trimester = '3rd Trimester';

    setForm((f) => ({
      ...f,
      edd: eddStr,
      weeks: weeks.toString(),
      trimester
    }));
  }, [form.lmp]);

  // Auto-fill OB Index from pregnancy number (G-P-A-L format)
  // G = gravida (total pregnancies including current) = pregnancy_number
  // P-A-L default to 0 (doctor/staff can adjust manually after)
  useEffect(() => {
    const n = parseInt(form.pregnancy_number, 10);
    if (!n || n < 1) return;
    const autoObIndex = `G${n}P0-0-0-0`;
    setForm((f) => ({ ...f, ob_index: autoObIndex }));
  }, [form.pregnancy_number]);

  // Auto-fill GP from pregnancy number (e.g. G1P0, G2P1)
  useEffect(() => {
    const n = parseInt(form.pregnancy_number, 10);
    if (!n || n < 1) return;
    const para = n - 1; // previous completed pregnancies
    const autoGp = `G${n}P${para}`;
    setForm((f) => ({ ...f, gp: autoGp }));
  }, [form.pregnancy_number]);

  // Auto-calculate LMP, weeks, trimester, and EDD from AOG
  // (only if LMP hasn't been set manually — AOG is the source of truth)
  useEffect(() => {
    if (!form.aog) return;
    // Extract number of weeks from AOG string (e.g. "3 weeks", "12 wks", "8")
    const match = form.aog.match(/(\d+)\s*(?:weeks?|wks?|w)?/i);
    if (!match) return;
    const weeksFromAog = parseInt(match[1], 10);
    if (isNaN(weeksFromAog) || weeksFromAog < 0) return;

    // Calculate LMP = today - (weeks * 7 days)
    const lmpDate = new Date();
    lmpDate.setDate(lmpDate.getDate() - weeksFromAog * 7);
    const lmpStr = lmpDate.toISOString().split('T')[0];

    // EDD = LMP + 280 days
    const eddDate = new Date(lmpDate);
    eddDate.setDate(eddDate.getDate() + 280);
    const eddStr = eddDate.toISOString().split('T')[0];

    // Trimester from weeks
    let trimester = '';
    if (weeksFromAog <= 12) trimester = '1st Trimester';
    else if (weeksFromAog <= 27) trimester = '2nd Trimester';
    else trimester = '3rd Trimester';

    setForm((f) => ({
      ...f,
      lmp: f.lmp || lmpStr,
      edd: f.lmp ? f.edd : eddStr,
      weeks: weeksFromAog.toString(),
      trimester: f.lmp ? f.trimester : trimester
    }));
  }, [form.aog]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    const n = parseInt(form.pregnancy_number, 10);
    if (!initialData && isFirst === false && !(n >= 2)) {
      setFormError('Enter which pregnancy this is (2 or more) so the earlier pregnancies can be recorded.');
      return;
    }
    setFormError('');
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );
    payload.baseline_bmi = bmi ? Number(bmi) : null;
    payload.pregnancy_history = history
      .map((r, i) => ({ pregnancy_no: i + 1, ...r }))
      .filter((r) => Object.entries(r).some(([k, v]) => k !== 'pregnancy_no' && v !== ''));
    if (!initialData && isFirst === false) {
      const births = history.filter((r) => r.birth_outcome === 'A' || r.birth_outcome === 'S').length;
      payload.gp = `G${n}P${births || n - 1}`;
    }
    onSubmit(payload);
  }

  if (!initialData && isFirst === null) {
    const today = new Date().toISOString().split('T')[0];
    return (
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-ink-900">Is this her first pregnancy?</p>
          <p className="text-sm text-ink-500 mt-1">
            If she has had babies before, you can record them here so her history is complete.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setIsFirst(true);
              setShowBaseline(true);
              setForm((f) => ({ ...f, pregnancy_number: '1', ob_index: 'G1P0-0-0-0', gp: 'G1P0', status: 'Ongoing', first_visit_date: today }));
            }}
            className="rounded-xl border-2 border-ink-200 hover:border-primary-400 hover:bg-primary-50/40 p-4 text-left transition-colors"
          >
            <p className="font-bold text-ink-900">Yes, first pregnancy</p>
            <p className="text-xs text-ink-500 mt-1">Baseline data only.</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsFirst(false);
              setShowBaseline(true);
              setForm((f) => ({ ...f, pregnancy_number: '2', status: 'Ongoing', first_visit_date: today }));
            }}
            className="rounded-xl border-2 border-ink-200 hover:border-primary-400 hover:bg-primary-50/40 p-4 text-left transition-colors"
          >
            <p className="font-bold text-ink-900">No, she has had earlier pregnancies</p>
            <p className="text-xs text-ink-500 mt-1">Baseline data and the earlier births.</p>
          </button>
        </div>
        {onCancel && (
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">LMP</label>
          <input
            type="date"
            value={form.lmp}
            onChange={update('lmp')}
            className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">EDD</label>
          <input
            type="date"
            value={form.edd}
            onChange={update('edd')}
            className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">GP</label>
          <input
            type="text"
            value={form.gp}
            onChange={update('gp')}
            placeholder="e.g. G2P1"
            className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Trimester</label>
          <select
            value={form.trimester}
            onChange={update('trimester')}
            className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 bg-white"
          >
            <option value="">Select...</option>
            <option value="1st Trimester">1st Trimester</option>
            <option value="2nd Trimester">2nd Trimester</option>
            <option value="3rd Trimester">3rd Trimester</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Weeks</label>
          <input
            type="text"
            value={form.weeks}
            onChange={update('weeks')}
            placeholder="e.g. 22 weeks"
            className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Status</label>
          <select
            value={form.status}
            onChange={update('status')}
            className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 bg-white"
          >
            <option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Notes</label>
        <textarea
          rows={3}
          value={form.notes}
          onChange={update('notes')}
          placeholder="Any additional notes..."
          className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 resize-none"
        />
      </div>

      {/* First Prenatal Visit — optional baseline data */}
      <div className="pt-2 border-t border-ink-100">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowBaseline((v) => !v)}
            className="flex items-center justify-between flex-1 text-left"
          >
            <span className="text-sm font-semibold text-ink-800">Baseline Data</span>
            <span className="text-ink-500 text-sm font-medium">{showBaseline ? '−' : '+'}</span>
          </button>
        </div>

        {showBaseline && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">First visit date</label>
              <input
                type="date"
                value={form.first_visit_date}
                onChange={update('first_visit_date')}
                className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.baseline_weight_kg}
                  onChange={update('baseline_weight_kg')}
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Height (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.baseline_height_cm}
                  onChange={update('baseline_height_cm')}
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">BMI</label>
                <input
                  type="text"
                  value={bmi}
                  readOnly
                  placeholder="auto"
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-ink-50 text-sm text-ink-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Blood Type</label>
                <input
                  type="text"
                  value={form.blood_type}
                  onChange={update('blood_type')}
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Age of Gestation (AOG)</label>
                <input
                  type="text"
                  value={form.aog}
                  onChange={update('aog')}
                  placeholder="e.g. 8 weeks"
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">OB Index</label>
                <input
                  type="text"
                  value={form.ob_index}
                  onChange={update('ob_index')}
                  placeholder="auto-filled from pregnancy #"
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-ink-50 text-sm text-ink-700 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 focus:bg-white"
                />
                <p className="text-[10px] text-ink-400 mt-0.5">Auto-filled — edit if needed (G-P-A-L format)</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">This is my ___ pregnancy</label>
              <input
                type="number"
                min="1"
                value={form.pregnancy_number}
                onChange={update('pregnancy_number')}
                placeholder="e.g. 2"
                className="w-full sm:w-32 px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </div>
          </div>
        )}
      </div>

      {(isFirst === false || history.length > 0) && (
        <div className="pt-2 border-t border-ink-100 space-y-2">
          <p className="text-sm font-semibold text-ink-800">Earlier pregnancies</p>
          {history.length === 0 ? (
            <p className="text-xs text-ink-500">Set "This is my ___ pregnancy" above to 2 or more to fill in the earlier births.</p>
          ) : (
            <HistoryTable rows={history} onChange={setHistory} />
          )}
        </div>
      )}
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          Save pregnancy record
        </Button>
      </div>
    </form>
  );
}

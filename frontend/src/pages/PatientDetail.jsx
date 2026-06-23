import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card, CardHeader } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { PageLoader } from '../components/UI/Spinner';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { patientService } from '../services/patientService';
import { consultationService } from '../services/consultationService';
import { apiError } from '../services/api';
import { PatientForm } from '../components/PatientForm';
import { ConsultationForm } from '../components/ConsultationForm';

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

  const [patient, setPatient] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [newConsultOpen, setNewConsultOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        patientService.get(id),
        consultationService.listForPatient(id).catch(() => [])
      ]);
      setPatient(p);
      setConsultations(c);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load patient'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

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
      await consultationService.create({ ...payload, patient_id: Number(id) });
      toast.success('Consultation recorded');
      setNewConsultOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save consultation'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Topbar title="Patient" onMenuClick={onOpenMenu} />
        <div className="flex-1 p-8">
          <PageLoader />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex flex-col">
        <Topbar title="Not found" onMenuClick={onOpenMenu} />
        <div className="flex-1 p-8 text-center text-ink-500">Patient not found.</div>
      </div>
    );
  }

  const age = patient.age || ageFromDob(patient.date_of_birth);

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={`Patient #${patient.id} · ${patient.sex || '—'}${age ? ` · ${age} y/o` : ''}`}
        onMenuClick={onOpenMenu}
        right={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Icon.Edit width={16} height={16} /> Edit
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4">
        <Card>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary-100 text-primary-700 inline-flex items-center justify-center font-display font-bold text-2xl">
              {patient.first_name?.charAt(0)}
              {patient.last_name?.charAt(0)}
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Date of birth" value={formatDate(patient.date_of_birth)} />
              <Field label="Contact" value={patient.contact_number} />
              <Field label="Address" value={patient.address} />
              <Field label="Emergency" value={patient.emergency_contact} />
            </div>
          </div>
        </Card>

        <div className="flex gap-2 border-b border-ink-100">
          {['overview', 'consultations'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 ${
                tab === t
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Recent consultations" />
              {consultations.length === 0 ? (
                <p className="text-sm text-ink-500">No consultations yet.</p>
              ) : (
                <ul className="space-y-2">
                  {consultations.slice(0, 3).map((c) => (
                    <li key={c.id} className="text-sm">
                      <p className="font-medium text-ink-800">
                        {c.chief_complaint || 'Consultation'}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatDateTime(c.visit_date)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="All consultations" />
              {consultations.length === 0 ? (
                <p className="text-sm text-ink-500">No consultations recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {consultations.map((c) => (
                    <li key={c.id} className="text-sm">
                      <p className="font-medium text-ink-800">
                        {c.chief_complaint || 'Consultation'}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatDateTime(c.visit_date)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === 'consultations' && (
          <Card padding="p-0" className="overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
              <p className="font-semibold text-ink-900">
                {consultations.length} consultation{consultations.length === 1 ? '' : 's'}
              </p>
              <Button onClick={() => setNewConsultOpen(true)}>
                <Icon.Plus width={16} height={16} /> New consultation
              </Button>
            </div>
            {consultations.length === 0 ? (
              <p className="text-sm text-ink-500 p-6 text-center">No consultations.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {consultations.map((c) => (
                  <li
                    key={c.id}
                    className="px-6 py-4 hover:bg-ink-50/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ink-900">
                          {c.chief_complaint || 'Consultation'}
                        </p>
                        <p className="text-xs text-ink-500 mt-0.5">
                          {formatDateTime(c.visit_date)}
                        </p>
                        {c.diagnosis && (
                          <p className="text-sm text-ink-600 mt-1">
                            Diagnosis: {c.diagnosis}
                          </p>
                        )}
                        {c.prescription && (
                          <p className="text-sm text-ink-600 mt-1">
                            Rx: {c.prescription}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit patient" size="lg">
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
        size="lg"
      >
        <ConsultationForm
          patientId={Number(id)}
          onSubmit={handleNewConsult}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-ink-700 mt-0.5">{value || '—'}</p>
    </div>
  );
}

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
import { pregnancyService } from '../services/pregnancyService';
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
  const [pregnancies, setPregnancies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [newConsultOpen, setNewConsultOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newPregnancyOpen, setNewPregnancyOpen] = useState(false);
  const [pregnancySubmitting, setPregnancySubmitting] = useState(false);
  const [editPregnancyOpen, setEditPregnancyOpen] = useState(false);
  const [editingPregnancy, setEditingPregnancy] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [p, c, pr] = await Promise.all([
        patientService.get(id),
        consultationService.listForPatient(id).catch(() => []),
        pregnancyService.listForPatient(id).catch(() => [])
      ]);
      setPatient(p);
      setConsultations(c);
      setPregnancies(pr);
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Pregnancy — expandable */}
            <PregnancyCard
              patient={patient}
              pregnancies={pregnancies}
              onAddNew={() => setNewPregnancyOpen(true)}
              onEdit={(pr) => {
                setEditingPregnancy(pr);
                setEditPregnancyOpen(true);
              }}
              onDelete={handleDeletePregnancy}
              onUpdateStatus={handleUpdatePregnancyStatus}
            />
            {/* Allergies — red marked */}
            <AllergiesCard patient={patient} />
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

      <Modal
        open={newPregnancyOpen}
        onClose={() => setNewPregnancyOpen(false)}
        title="New pregnancy record"
        size="md"
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
        size="md"
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

function PregnancyCard({ patient, pregnancies, onAddNew, onEdit, onDelete, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const latest = pregnancies[0];

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
        <CardHeader title="Pregnancy" subtitle={expanded ? 'Tap to collapse' : 'Tap to expand'} />
        <span className="text-ink-500 text-sm font-medium">
          {expanded ? '−' : '+'}
        </span>
      </div>
      {expanded && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {pregnancies.length === 0 ? (
            <p className="text-sm text-ink-500">No pregnancy records yet.</p>
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
                  <div className="grid grid-cols-2 gap-3">
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
            : 'No pregnancy records'}
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

function AllergiesCard({ patient }) {
  const allergies = patient.allergies
    ? patient.allergies.split(',').map((a) => a.trim()).filter(Boolean)
    : [];

  return (
    <Card>
      <CardHeader title="Allergies" />
      {allergies.length === 0 ? (
        <p className="text-sm text-ink-500">No known allergies.</p>
      ) : (
        <ul className="space-y-2">
          {allergies.map((a, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-sm font-medium text-red-600">{a}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    notes: ''
  };

  const [form, setForm] = useState(blank);

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
        notes: initialData.notes ?? ''
      });
    } else {
      setForm(blank);
    }
  }, [initialData]);

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

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { Spinner, PageLoader } from '../components/UI/Spinner';
import { StatusBadge, Badge } from '../components/UI/Badge';
import { EmptyState } from '../components/UI/EmptyState';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { Input } from '../components/UI/Input';
import { appointmentService } from '../services/appointmentService';
import { patientService } from '../services/patientService';
import { apiError } from '../services/api';
import { AppointmentForm } from '../components/AppointmentForm';

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

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function Appointments() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const [appts, setAppts] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [newOpen, setNewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        appointmentService.list(),
        patientService.list('', { page: 1, limit: 200 })
      ]);
      setAppts(a);
      setPatients(p.data || []);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load appointments'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(a, status) {
    try {
      await appointmentService.update(a.id, {
        patient_id: a.patient_id,
        appointment_date: a.appointment_date,
        reason: a.reason,
        notes: a.notes,
        status
      });
      toast.success('Status updated');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Update failed'));
    }
  }

  async function handleCreate(payload) {
    setSubmitting(true);
    try {
      await appointmentService.create(payload);
      toast.success('Appointment scheduled');
      setNewOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not schedule'));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(a) {
    if (!window.confirm('Cancel this appointment?')) return;
    try {
      await appointmentService.remove(a.id);
      toast.success('Appointment removed');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Delete failed'));
    }
  }

  const patientById = Object.fromEntries(patients.map((p) => [p.id, p]));

  const now = new Date();
  const filtered = appts
    .filter((a) => {
      const d = new Date(a.appointment_date);
      if (filter === 'upcoming') return d >= now && a.status === 'scheduled';
      if (filter === 'past') return d < now;
      if (filter === 'today')
        return a.appointment_date?.startsWith(todayISO());
      return true;
    })
    .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar
        title="Appointments"
        subtitle="Schedule and manage patient visits."
        onMenuClick={onOpenMenu}
        right={
          <Button
            onClick={() => setNewOpen(true)}
          >
            <Icon.Plus width={16} height={16} /> New appointment
          </Button>
        }
      />

      <div className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4">
        <div className="flex gap-1 p-1 bg-ink-100 rounded-xl w-fit">
          {[
            { k: 'upcoming', label: 'Upcoming' },
            { k: 'today', label: 'Today' },
            { k: 'past', label: 'Past' },
            { k: 'all', label: 'All' }
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === t.k
                  ? 'bg-white text-ink-900 shadow-sm'
                  : 'text-ink-600 hover:text-ink-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card padding="p-0" className="overflow-hidden">
          {loading ? (
            <PageLoader />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Icon.Calendar width={36} height={36} />}
              title="No appointments"
              description="Schedule a new appointment to get started."
              action={
                <Button onClick={() => setNewOpen(true)}>
                  <Icon.Plus width={16} height={16} /> New appointment
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {filtered.map((a) => {
                const p = patientById[a.patient_id];
                return (
                  <li
                    key={a.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 inline-flex items-center justify-center flex-shrink-0">
                      <Icon.Clock />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p ? (
                          <Link
                            to={`/patients/${p.id}`}
                            className="font-medium text-ink-900 hover:text-primary-700"
                          >
                            {p.first_name} {p.last_name}
                          </Link>
                        ) : (
                          <span className="text-ink-500">Patient #{a.patient_id}</span>
                        )}
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="text-sm text-ink-700 mt-0.5">
                        {a.reason || 'No reason specified'}
                      </p>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {formatDateTime(a.appointment_date)}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {a.status === 'scheduled' && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setStatus(a, 'completed')}
                          >
                            <Icon.Check width={14} height={14} /> Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatus(a, 'cancelled')}
                            className="text-ink-500 hover:!text-red-600 hover:!bg-red-50"
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(a)}
                        className="text-ink-500 hover:!text-red-600 hover:!bg-red-50"
                        aria-label="Delete"
                      >
                        <Icon.Trash width={14} height={14} />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New appointment"
        size="md"
      >
        <AppointmentForm
          patients={patients}
          submitting={submitting}
          onCancel={() => setNewOpen(false)}
          onSubmit={handleCreate}
        />
      </Modal>
    </div>
  );
}

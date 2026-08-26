import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card, CardHeader } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { PageLoader } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { patientService } from '../services/patientService';
import { queueService } from '../services/queueService';
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

export function Consultations() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPatients, setPickerPatients] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await queueService.listToday().catch(() => []);
      setQueue(data);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load queue'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openPatientPicker() {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await patientService.list('', { page: 1, limit: 200 });
      setPickerPatients(res.data || []);
    } catch {
      toast.error('Failed to load patients');
    } finally {
      setPickerLoading(false);
    }
  }

  async function handleAddToQueue(patientId) {
    setAdding(true);
    try {
      await queueService.add(patientId);
      toast.success('Patient added to queue');
      setPickerOpen(false);
      setPickerSearch('');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not add to queue'));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveFromQueue(id) {
    if (!window.confirm('Remove this patient from the queue?')) return;
    try {
      await queueService.remove(id);
      toast.success('Removed from queue');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not remove'));
    }
  }

  const waitingList = queue.filter((q) => q.status === 'waiting');
  const servingList = queue.filter((q) => q.status === 'serving');
  const doneList = queue.filter((q) => q.status === 'done');
  const skippedList = queue.filter((q) => q.status === 'skipped');

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Daily Queue"
        subtitle="Manage today's patient queue."
        onMenuClick={onOpenMenu}
        right={
          <Button onClick={openPatientPicker}>
            <Icon.Plus width={16} height={16} /> Add to queue
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
        <div className="max-w-7xl w-full mx-auto px-4 md:px-8 space-y-4">
          {loading ? (
            <PageLoader />
          ) : queue.length === 0 ? (
            <Card>
              <div className="p-10 text-center text-ink-500">
                <Icon.Users width={36} height={36} className="mx-auto text-ink-300 mb-3" />
                <p>No patients in queue today.</p>
                <p className="text-sm mt-1">Add a patient to get started.</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Currently Serving */}
              {servingList.length > 0 && (
                <Card>
                  <CardHeader title="Currently Serving" />
                  <div className="px-4 pb-4 space-y-2">
                    {servingList.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/30"
                      >
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
                          #{String(q.queue_number).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900 truncate">
                            {q.first_name} {q.last_name}
                          </p>
                          <StatusBadge status={q.status} />
                        </div>
                        <Link
                          to={`/patients/${q.patient_id}`}
                          className="text-xs text-primary-600 font-medium whitespace-nowrap"
                        >
                          View profile →
                        </Link>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Waiting */}
              <Card>
                <CardHeader
                  title="Waiting"
                  subtitle={`${waitingList.length} patient${waitingList.length === 1 ? '' : 's'}`}
                />
                <div className="px-4 pb-4 space-y-2">
                  {waitingList.length === 0 ? (
                    <p className="text-sm text-ink-500 text-center py-4">No waiting patients.</p>
                  ) : (
                    waitingList.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-ink-100 hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
                      >
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 text-primary-700 text-sm font-bold">
                          #{String(q.queue_number).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900 truncate">
                            {q.first_name} {q.last_name}
                          </p>
                          <StatusBadge status={q.status} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/patients/${q.patient_id}`}
                            className="text-xs text-primary-600 font-medium whitespace-nowrap"
                          >
                            View →
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveFromQueue(q.id)}
                          >
                            <Icon.Close width={14} height={14} />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Done */}
              {doneList.length > 0 && (
                <Card>
                  <CardHeader
                    title="Completed"
                    subtitle={`${doneList.length} patient${doneList.length === 1 ? '' : 's'}`}
                  />
                  <div className="px-4 pb-4 space-y-2">
                    {doneList.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-ink-100 bg-ink-50/40"
                      >
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          #{String(q.queue_number).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900 truncate">
                            {q.first_name} {q.last_name}
                          </p>
                          <StatusBadge status={q.status} />
                        </div>
                        <Link
                          to={`/patients/${q.patient_id}`}
                          className="text-xs text-primary-600 font-medium whitespace-nowrap"
                        >
                          View →
                        </Link>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Skipped */}
              {skippedList.length > 0 && (
                <Card>
                  <CardHeader
                    title="Skipped"
                    subtitle={`${skippedList.length} patient${skippedList.length === 1 ? '' : 's'}`}
                  />
                  <div className="px-4 pb-4 space-y-2">
                    {skippedList.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-ink-100 bg-red-50/20"
                      >
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          #{String(q.queue_number).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900 truncate">
                            {q.first_name} {q.last_name}
                          </p>
                          <StatusBadge status={q.status} />
                        </div>
                        <Link
                          to={`/patients/${q.patient_id}`}
                          className="text-xs text-primary-600 font-medium whitespace-nowrap"
                        >
                          View →
                        </Link>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Patient picker modal */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add patient to queue"
        size="md"
      >
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search patients…"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className="input-base text-sm"
          />
          {pickerLoading ? (
            <PageLoader label="Loading patients…" />
          ) : (
            <ul className="divide-y divide-ink-100 max-h-80 overflow-y-auto">
              {pickerPatients
                .filter((p) => {
                  const q = pickerSearch.toLowerCase();
                  return (
                    !q ||
                    `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
                    (p.contact_number || '').includes(q)
                  );
                })
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => handleAddToQueue(p.id)}
                      className="w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-ink-50 rounded-md transition-colors disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 inline-flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {p.first_name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900 truncate">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-xs text-ink-500">
                          {p.age || '—'} yrs · {p.contact_number || '—'}
                        </p>
                      </div>
                      <div className="ml-auto text-ink-400">
                        <Icon.Chevron width={14} height={14} />
                      </div>
                    </button>
                  </li>
                ))}
              {pickerPatients.filter((p) => {
                const q = pickerSearch.toLowerCase();
                return (
                  !q ||
                  `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
                  (p.contact_number || '').includes(q)
                );
              }).length === 0 && (
                <li className="text-sm text-ink-500 py-6 text-center">No patients found.</li>
              )}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

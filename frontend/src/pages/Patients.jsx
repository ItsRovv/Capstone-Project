import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { Spinner, PageLoader } from '../components/UI/Spinner';
import { EmptyState } from '../components/UI/EmptyState';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { patientService } from '../services/patientService';
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
  const toast = useToast();
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

  const LIMIT = 50;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  async function load(q = search, p = page) {
    setLoading(true);
    try {
      const res = await patientService.list(q, { page: p, limit: LIMIT });
      setPatients(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load patients'));
    } finally {
      setLoading(false);
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

  async function handleCreate(payload) {
    setSubmitting(true);
    try {
      await patientService.create(payload);
      toast.success('Patient added');
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

      <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
        <div className="max-w-7xl w-full mx-auto px-4 md:px-8">
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
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold">Name</th>
                    <th className="text-left px-6 py-3 font-semibold">Age</th>
                    <th className="text-left px-6 py-3 font-semibold">Sex</th>
                    <th className="text-left px-6 py-3 font-semibold hidden md:table-cell">
                      Contact
                    </th>
                    <th className="text-left px-6 py-3 font-semibold hidden lg:table-cell">
                      Registered
                    </th>
                    <th className="text-right px-6 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {patients.map((p) => (
                    <tr key={p.id} className="hover:bg-ink-50/60 transition-colors">
                      <td className="px-6 py-3.5">
                        <Link
                          to={`/patients/${p.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <div>
                            <p className="font-medium text-ink-900 group-hover:text-primary-700">
                              {p.first_name} {p.last_name}
                            </p>
                            <p className="text-xs text-ink-500 md:hidden">
                              {p.contact_number || '—'}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 text-ink-700">
                        {p.age || ageFromDob(p.date_of_birth) || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-ink-700">{p.sex || '—'}</td>
                      <td className="px-6 py-3.5 text-ink-700 hidden md:table-cell">
                        {p.contact_number || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-ink-500 hidden lg:table-cell">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="inline-flex gap-1">
                          <Link to={`/patients/${p.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(p)}
                            className="text-ink-500 hover:!text-red-600 hover:!bg-red-50"
                            aria-label="Delete"
                          >
                            <Icon.Trash width={16} height={16} />
                          </Button>
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
        size="lg"
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
    </div>
  );
}

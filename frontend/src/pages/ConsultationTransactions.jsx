import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Spinner, PageLoader } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { patientService } from '../services/patientService';
import { consultationService } from '../services/consultationService';
import { consultationTransactionService } from '../services/consultationTransactionService';
import { TransactionForm } from '../components/TransactionForm';
import { apiError } from '../services/api';

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

function formatCurrency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ConsultationTransactions() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'doctor';
  const [grouped, setGrouped] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState({
    open: false,
    patientId: null,
    patientName: '',
    consultations: []
  });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [patientsRes, allTransactions] = await Promise.all([
        patientService.list('', { page: 1, limit: 200 }),
        consultationTransactionService.listAll().catch(() => [])
      ]);
      const patients = patientsRes.data || [];
      const txMap = new Map();
      for (const t of allTransactions) {
        if (!txMap.has(t.patient_id)) txMap.set(t.patient_id, []);
        txMap.get(t.patient_id).push(t);
      }
      const groups = patients
        .map((p) => ({
          patient: p,
          transactions: (txMap.get(p.id) || []).sort(
            (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)
          )
        }))
        .filter((g) => g.transactions.length > 0)
        .sort((a, b) => {
          const aLast = new Date(a.transactions[0]?.transaction_date || 0);
          const bLast = new Date(b.transactions[0]?.transaction_date || 0);
          return bLast - aLast;
        });
      setGrouped(groups);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load transactions'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openAddModal(patient) {
    setAddModal({
      open: true,
      patientId: patient.id,
      patientName: `${patient.first_name} ${patient.last_name}`,
      consultations: []
    });
    try {
      const consultations = await consultationService.listForPatient(patient.id);
      setAddModal((m) => (m.patientId === patient.id ? { ...m, consultations } : m));
    } catch {
      // Non-fatal — form still works without the optional consultation link.
    }
  }

  async function handleAddTransaction(payload) {
    setSubmitting(true);
    try {
      await consultationTransactionService.create(payload);
      toast.success('Transaction recorded');
      setAddModal({ open: false, patientId: null, patientName: '', consultations: [] });
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save transaction'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this transaction record? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await consultationTransactionService.remove(id);
      toast.success('Transaction deleted');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not delete transaction'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Consultation Transactions"
        subtitle={
          canManage
            ? "Vitamins charged at clinic & PhilHealth packages (for reference), grouped by patient."
            : "Collect payments based on the doctor's prescription. Totals shown below."
        }
        onMenuClick={onOpenMenu}
        right={
          canManage ? (
            <Link to="/patients">
              <Button>
                <Icon.Plus width={16} height={16} /> New transaction
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
        <div className="max-w-7xl w-full mx-auto px-4 md:px-8 space-y-4">
          {loading ? (
            <PageLoader />
          ) : grouped.length === 0 ? (
            <Card>
              <div className="p-10 text-center text-ink-500">
                <Icon.FileText
                  width={36}
                  height={36}
                  className="mx-auto text-ink-300 mb-3"
                />
                <p>No transactions recorded yet.</p>
                <p className="text-sm mt-1">
                  {canManage
                    ? 'Open a patient to record a PhilHealth package or recommendation.'
                    : 'Transactions will appear here once the doctor finishes a consultation.'}
                </p>
              </div>
            </Card>
          ) : (
            <>
              {/* Total to collect summary — especially helpful for frontdesk staff */}
              <Card padding="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-ink-400 uppercase tracking-wider">
                      {canManage ? 'Total Transactions' : 'Total to Collect from Patients'}
                    </p>
                    <p className="text-2xl font-bold text-primary-700 mt-0.5">
                      {formatCurrency(
                        grouped.reduce(
                          (sum, g) => sum + g.transactions.reduce((s, t) => s + Number(t.total_amount || 0), 0),
                          0
                        )
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-ink-400 uppercase tracking-wider">Transactions</p>
                    <p className="text-2xl font-bold text-ink-700 mt-0.5">
                      {grouped.reduce((sum, g) => sum + g.transactions.length, 0)}
                    </p>
                  </div>
                </div>
              </Card>

              {grouped.map((g) => (
              <Card key={g.patient.id} padding="p-0" className="overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-600 inline-flex items-center justify-center">
                      <Icon.Users width={16} height={16} />
                    </div>
                    <div>
                      <Link
                        to={`/patients/${g.patient.id}`}
                        className="font-semibold text-ink-900 hover:text-primary-700"
                      >
                        {g.patient.first_name} {g.patient.last_name}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {g.transactions.length} transaction{g.transactions.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <Button size="sm" onClick={() => openAddModal(g.patient)}>
                      <Icon.Plus width={14} height={14} /> Add new
                    </Button>
                  )}
                </div>
                <ul className="divide-y divide-ink-100">
                  {g.transactions.map((t) => (
                    <li key={t.id} className="px-6 py-4 hover:bg-ink-50/60 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-ink-900">
                              {formatDateTime(t.transaction_date)}
                            </p>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded">
                              To Pay: {formatCurrency(t.total_amount)}
                            </span>
                          </div>

                          {/* Vitamins (charged at clinic) */}
                          {t.vitamins && t.vitamins.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1">Vitamins</p>
                              <div className="flex flex-wrap gap-1.5">
                                {t.vitamins.map((v) => (
                                  <span
                                    key={v.id}
                                    className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
                                    title={`${v.label} — ${formatCurrency(v.price)}`}
                                  >
                                    {v.label} · {formatCurrency(v.price)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* PhilHealth packages (reference only) */}
                          {t.packages && t.packages.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-1">PhilHealth (availed through PhilHealth)</p>
                              <div className="flex flex-wrap gap-1.5">
                                {t.packages.map((p) => (
                                  <span
                                    key={p.code}
                                    className="text-xs font-medium text-ink-600 bg-ink-100 border border-ink-200 px-2 py-0.5 rounded-full"
                                    title={p.label}
                                  >
                                    {p.code} · {formatCurrency(p.amount)}
                                  </span>
                                ))}
                              </div>
                              {t.philhealth_total > 0 && (
                                <p className="text-xs text-ink-400 mt-1">
                                  PhilHealth total: {formatCurrency(t.philhealth_total)} <span className="italic">(not charged at clinic)</span>
                                </p>
                              )}
                            </div>
                          )}

                          {t.recommendations && (
                            <p className="text-sm text-ink-600 mt-2">
                              <span className="font-semibold text-ink-700">Recommendations:</span>{' '}
                              {t.recommendations}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingId === t.id}
                            className="text-ink-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                            aria-label="Delete transaction"
                          >
                            {deletingId === t.id ? <Spinner size="sm" /> : <Icon.Trash width={16} height={16} />}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            </>
          )}
        </div>
      </div>

      <Modal
        open={addModal.open}
        onClose={() => setAddModal({ open: false, patientId: null, patientName: '', consultations: [] })}
        title={`New transaction — ${addModal.patientName}`}
        size="lg"
      >
        <TransactionForm
          patientId={addModal.patientId}
          consultations={addModal.consultations}
          onSubmit={handleAddTransaction}
          submitting={submitting}
          onCancel={() => setAddModal({ open: false, patientId: null, patientName: '', consultations: [] })}
        />
      </Modal>
    </div>
  );
}

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

function SummaryCard({ title, value, icon: IconComponent, accent = 'primary' }) {
  const styles = {
    primary: 'bg-primary-50 text-primary-700 border-primary-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    ink: 'bg-ink-50 text-ink-600 border-ink-100'
  };
  return (
    <Card padding="p-4" className="border border-ink-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-ink-400 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${styles[accent]}`}>
          <IconComponent width={20} height={20} />
        </div>
      </div>
    </Card>
  );
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
  const [expandedPatients, setExpandedPatients] = useState(new Set());

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
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard
                  title="Total to Collect"
                  value={formatCurrency(
                    grouped.reduce(
                      (sum, g) => sum + g.transactions.reduce((s, t) => s + Number(t.total_amount || 0), 0),
                      0
                    )
                  )}
                  icon={Icon.Receipt}
                  accent="primary"
                />
                <SummaryCard
                  title="PhilHealth Reference"
                  value={formatCurrency(
                    grouped.reduce(
                      (sum, g) => sum + g.transactions.reduce((s, t) => s + Number(t.philhealth_total || 0), 0),
                      0
                    )
                  )}
                  icon={Icon.Heart}
                  accent="ink"
                />
                <SummaryCard
                  title="Total Transactions"
                  value={grouped.reduce((sum, g) => sum + g.transactions.length, 0)}
                  icon={Icon.FileText}
                  accent="emerald"
                />
              </div>

              {/* Patient transaction groups */}
              <div className="space-y-4">
                {grouped.map((g) => {
                  const patientTotal = g.transactions.reduce((s, t) => s + Number(t.total_amount || 0), 0);
                  const isExpanded = expandedPatients.has(g.patient.id);
                  const visibleTransactions = isExpanded ? g.transactions : g.transactions.slice(0, 1);
                  return (
                    <Card key={g.patient.id} padding="p-0" className="overflow-hidden border border-ink-100">
                      {/* Patient header */}
                      <div className="flex items-center justify-between px-5 py-4 bg-ink-50/40 border-b border-ink-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 inline-flex items-center justify-center text-sm font-bold">
                            {g.patient.first_name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div>
                            <Link
                              to={`/patients/${g.patient.id}`}
                              className="font-semibold text-ink-900 hover:text-primary-700"
                            >
                              {g.patient.first_name} {g.patient.last_name}
                            </Link>
                            <p className="text-xs text-ink-500">
                              {g.transactions.length} transaction{g.transactions.length === 1 ? '' : 's'} · Total: {formatCurrency(patientTotal)}
                            </p>
                          </div>
                        </div>
                        {canManage && (
                          <Button size="sm" variant="secondary" onClick={() => openAddModal(g.patient)}>
                            <Icon.Plus width={14} height={14} /> Add
                          </Button>
                        )}
                      </div>

                      {/* Transactions */}
                      <div className="divide-y divide-ink-100">
                        {visibleTransactions.map((t) => (
                          <div key={t.id} className="px-5 py-4 hover:bg-ink-50/40 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                {/* Date + Amount row */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                                  <div className="flex items-center gap-2 text-ink-500">
                                    <Icon.Calendar width={14} height={14} />
                                    <span className="text-sm">{formatDateTime(t.transaction_date)}</span>
                                  </div>
                                  <p className="text-lg font-bold text-primary-700">
                                    {formatCurrency(t.total_amount)}
                                  </p>
                                </div>

                                {/* Items to pay & PhilHealth reference */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                  {t.vitamins && t.vitamins.length > 0 && (
                                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center">
                                          <Icon.Receipt width={14} height={14} />
                                        </div>
                                        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Items to Pay</p>
                                      </div>
                                      <ul className="space-y-1.5">
                                        {t.vitamins.map((v) => (
                                          <li key={v.id} className="flex items-center justify-between text-sm">
                                            <span className="text-ink-700 truncate pr-2" title={v.label}>{v.label}</span>
                                            <span className="font-medium text-emerald-700 whitespace-nowrap">{formatCurrency(v.price)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                      <div className="mt-2 pt-2 border-t border-emerald-200 flex items-center justify-between">
                                        <span className="text-xs font-bold text-emerald-800">Total to pay</span>
                                        <span className="text-sm font-bold text-emerald-700">{formatCurrency(t.total_amount)}</span>
                                      </div>
                                    </div>
                                  )}

                                  {t.packages && t.packages.length > 0 && (
                                    <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-ink-200 text-ink-600 inline-flex items-center justify-center">
                                          <Icon.Heart width={14} height={14} />
                                        </div>
                                        <p className="text-xs font-bold text-ink-600 uppercase tracking-wider">PhilHealth Reference</p>
                                      </div>
                                      <ul className="space-y-1.5">
                                        {t.packages.map((p) => (
                                          <li key={p.code} className="flex items-center justify-between text-sm">
                                            <span className="text-ink-700 truncate pr-2" title={p.label}>{p.code}</span>
                                            <span className="font-medium text-ink-600 whitespace-nowrap">{formatCurrency(p.amount)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                      {t.philhealth_total > 0 && (
                                        <div className="mt-2 pt-2 border-t border-ink-200 flex items-center justify-between">
                                          <span className="text-xs font-bold text-ink-600">PhilHealth total</span>
                                          <span className="text-sm font-bold text-ink-700">{formatCurrency(t.philhealth_total)}</span>
                                        </div>
                                      )}
                                      <p className="text-[10px] text-ink-400 mt-1.5 italic">Not charged at the clinic</p>
                                    </div>
                                  )}
                                </div>

                                {/* Recommendations */}
                                {t.recommendations && (
                                  <div className="flex items-start gap-2 text-sm text-ink-600 bg-amber-50/50 border border-amber-100 rounded-lg px-3 py-2">
                                    <Icon.FileText width={14} height={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                                    <span>{t.recommendations}</span>
                                  </div>
                                )}
                              </div>

                              {canManage && (
                                <button
                                  onClick={() => handleDelete(t.id)}
                                  disabled={deletingId === t.id}
                                  className="text-ink-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                                  aria-label="Delete transaction"
                                >
                                  {deletingId === t.id ? <Spinner size="sm" /> : <Icon.Trash width={16} height={16} />}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Show all / Show less toggle */}
                      {g.transactions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedPatients((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.patient.id)) next.delete(g.patient.id);
                              else next.add(g.patient.id);
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-medium text-primary-700 hover:text-primary-800 hover:bg-primary-50 transition-colors border-t border-ink-100"
                        >
                          {isExpanded ? (
                            <>
                              <Icon.Chevron width={14} height={14} className="rotate-90" />
                              Show less
                            </>
                          ) : (
                            <>
                              <Icon.Chevron width={14} height={14} className="-rotate-90" />
                              Show all {g.transactions.length} transactions
                            </>
                          )}
                        </button>
                      )}
                    </Card>
                  );
                })}
              </div>
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

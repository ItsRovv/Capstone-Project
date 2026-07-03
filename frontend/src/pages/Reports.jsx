import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { PageLoader, Spinner } from '../components/UI/Spinner';
import { EmptyState } from '../components/UI/EmptyState';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { Input } from '../components/UI/Input';
import { reportService } from '../services/reportService';
import { apiError } from '../services/api';
import { ReportDocument } from '../components/ReportDocument';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function Reports() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState({ open: false, date: todayISO(), type: 'daily' });
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [viewing, setViewing] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await reportService.list();
      setReports(data);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load reports'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setGenerating(true);
    setGenerated(null);
    try {
      const result = await reportService.generate(modal.date, modal.type);
      setGenerated(result);
      toast.success('Report generated');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Report generation failed'));
    } finally {
      setGenerating(false);
    }
  }

  function openReport(r) {
    setViewing(r);
  }

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Reports"
        subtitle="Daily clinic reports with summaries."
        onMenuClick={onOpenMenu}
        right={
          <Button
            onClick={() => {
              setModal({ open: true, date: todayISO(), type: 'daily' });
              setGenerated(null);
            }}
          >
            <Icon.FileText width={16} height={16} /> Generate report
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
        <div className="max-w-5xl w-full mx-auto px-4 md:px-8">
          <Card padding="p-0" className="overflow-hidden">
            {loading ? (
              <PageLoader />
            ) : reports.length === 0 ? (
              <EmptyState
              icon={<Icon.FileText width={36} height={36} />}
              title="No reports yet"
              description="Generate a report to get a summary of clinic activity."
              action={
                <Button
                  onClick={() => {
                    setModal({ open: true, date: todayISO(), type: 'daily' });
                    setGenerated(null);
                  }}
                >
                  <Icon.FileText width={16} height={16} /> Generate your first report
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="p-5 flex items-center gap-4 hover:bg-ink-50/60 cursor-pointer transition-colors"
                  onClick={() => openReport(r)}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 inline-flex items-center justify-center flex-shrink-0">
                    <Icon.Report />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-900">
                      Report for {formatDate(r.report_date)}
                    </p>
                    <p className="text-xs text-ink-500 capitalize">
                      {r.report_type} · {r.total_patients || 0} patient
                      {r.total_patients === 1 ? '' : 's'}
                      {' · generated '}{formatDate(r.created_at)}
                    </p>
                  </div>
                  <Icon.Chevron className="text-ink-400" />
                </li>
              ))}
            </ul>
          )}
          </Card>
        </div>
      </div>

      {/* Generate modal */}
      <Modal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title="Generate report"
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModal((m) => ({ ...m, open: false }))}
            >
              Close
            </Button>
            <Button onClick={generate} loading={generating}>
              <Icon.FileText width={16} height={16} /> Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!generated && !generating && (
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-600 inline-flex items-center justify-center">
                  <Icon.FileText width={18} height={18} />
                </div>
                <div>
                  <p className="font-medium text-ink-900 text-sm">Clinic report</p>
                  <p className="text-xs text-ink-500">Choose a type and date to generate the report.</p>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Report type
            </label>
            <select
              className="input-base"
              value={modal.type}
              onChange={(e) => setModal((m) => ({ ...m, type: e.target.value }))}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (7-day window ending on date)</option>
            </select>
          </div>
          <Input
            type="date"
            label={modal.type === 'weekly' ? 'Week ending date' : 'Report date'}
            value={modal.date}
            onChange={(e) => setModal((m) => ({ ...m, date: e.target.value }))}
          />
          {generated && (
            <ReportDocument
              metrics={generated.metrics}
              date={modal.date}
              type={modal.type}
            />
          )}
          {generating && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Spinner size="md" />
              <p className="text-sm text-ink-500">Compiling report…</p>
            </div>
          )}
        </div>
      </Modal>

      {/* View report modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Report · ${formatDate(viewing.report_date)}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewing(null)}>
              Close
            </Button>
            <Button onClick={() => window.print()}>
              <Icon.FileText width={16} height={16} /> Print / Save as PDF
            </Button>
          </>
        }
      >
        {viewing && (
          <ReportDocument
            metrics={viewing.metrics}
            date={viewing.report_date}
            type={viewing.report_type}
          />
        )}
      </Modal>
    </div>
  );
}

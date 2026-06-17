import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Spinner, PageLoader } from '../components/UI/Spinner';
import { Badge } from '../components/UI/Badge';
import { Icon } from '../components/Icon';
import { useToast } from '../components/UI/Toast';
import { patientService } from '../services/patientService';
import { consultationService } from '../services/consultationService';
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

export function Consultations() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const patientsRes = await patientService.list('', { page: 1, limit: 200 });
      const patients = patientsRes.data || [];
      const lists = await Promise.all(
        patients.map((p) =>
          consultationService.listForPatient(p.id).catch(() => [])
        )
      );
      const merged = lists
        .flat()
        .map((c) => ({
          ...c,
          patient: patients.find((p) => p.id === c.patient_id)
        }))
        .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
      setItems(merged);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load consultations'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar
        title="Consultations"
        subtitle="All recorded visits across patients."
        onMenuClick={onOpenMenu}
        right={
          <Link to="/patients">
            <Button>
              <Icon.Plus width={16} height={16} /> Record consultation
            </Button>
          </Link>
        }
      />

      <div className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
        <Card padding="p-0" className="overflow-hidden">
          {loading ? (
            <PageLoader />
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-ink-500">
              <Icon.Stethoscope
                width={36}
                height={36}
                className="mx-auto text-ink-300 mb-3"
              />
              <p>No consultations yet.</p>
              <p className="text-sm mt-1">
                Open a patient and start a new consultation.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold">Patient</th>
                    <th className="text-left px-6 py-3 font-semibold">Date</th>
                    <th className="text-left px-6 py-3 font-semibold">Chief complaint</th>
                    <th className="text-left px-6 py-3 font-semibold">Diagnosis</th>
                    <th className="text-left px-6 py-3 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-ink-50/60">
                      <td className="px-6 py-3.5">
                        {c.patient ? (
                          <Link
                            to={`/patients/${c.patient.id}`}
                            className="font-medium text-ink-900 hover:text-primary-700"
                          >
                            {c.patient.first_name} {c.patient.last_name}
                          </Link>
                        ) : (
                          <span className="text-ink-500">Patient #{c.patient_id}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-ink-700">
                        {formatDateTime(c.visit_date)}
                      </td>
                      <td className="px-6 py-3.5 text-ink-700">
                        {c.chief_complaint || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-ink-700">{c.diagnosis || '—'}</td>
                      <td className="px-6 py-3.5">
                        {c.ai_summary_used ? (
                          <Badge tone="primary">
                            <Icon.Sparkle width={12} height={12} /> AI
                          </Badge>
                        ) : (
                          <Badge>Manual</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

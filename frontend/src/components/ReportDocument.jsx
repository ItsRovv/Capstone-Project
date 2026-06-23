import { useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { Icon } from './Icon';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6">
      <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 inline-flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-ink-800 uppercase tracking-wider">{title}</h3>
      <div className="flex-1 h-px bg-ink-200 ml-2" />
    </div>
  );
}

function StatBadge({ label, value, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-50 text-primary-700 border-primary-100',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    danger: 'bg-red-50 text-red-700 border-red-100',
    info: 'bg-sky-50 text-sky-700 border-sky-100'
  };
  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone]}`}>
      <p className="text-2xl font-display font-bold">{value}</p>
      <p className="text-xs font-medium mt-1 opacity-80">{label}</p>
    </div>
  );
}

function DataTable({ headers, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-ink-200 overflow-hidden mt-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-ink-50 text-ink-600">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, i) => (
            <tr key={i} className="bg-white hover:bg-ink-50/50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-ink-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendIndicator({ trend }) {
  if (!trend) return null;
  const { change, prevTotal, currentTotal } = trend;
  const isUp = change > 0;
  const isDown = change < 0;
  const color = isUp ? 'text-emerald-600' : isDown ? 'text-red-600' : 'text-ink-500';
  const bg = isUp ? 'bg-emerald-50' : isDown ? 'bg-red-50' : 'bg-ink-50';
  const arrow = isUp ? '↑' : isDown ? '↓' : '→';

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${bg} ${color}`}>
      <span>{arrow}</span>
      <span>{change > 0 ? '+' : ''}{change}% vs previous period</span>
      <span className="opacity-60">({prevTotal} → {currentTotal})</span>
    </div>
  );
}

export function ReportDocument({ report, metrics, date, type, onDownload }) {
  const docRef = useRef(null);

  const handleDownload = useCallback(async () => {
    if (!docRef.current) return;
    try {
      const canvas = await html2canvas(docRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });
      const link = document.createElement('a');
      link.download = `Clinic-Report-${date}-${type}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [date, type]);

  const {
    totalPatients = 0,
    newPatients = 0,
    returningPatients = 0,
    topComplaints = [],
    topDiagnoses = [],
    peakHour,
    trend,
    followUpAlerts = []
  } = metrics || {};

  const reportText = report || '';
  const lines = reportText.split('\n');

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Icon.Download width={16} height={16} />
          Download as Image
        </button>
      </div>

      {/* The actual report document — this gets captured */}
      <div
        ref={docRef}
        className="bg-white rounded-xl border border-ink-200 overflow-hidden"
        style={{ maxWidth: '800px', margin: '0 auto' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-display font-bold">Jean Lying-in Maternity Clinic</h1>
              <p className="text-primary-100 text-sm mt-1">Tughan, Juban, Sorsogon</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-primary-200 uppercase tracking-wider font-semibold">{type} Report</p>
              <p className="text-lg font-bold mt-1">{formatDate(date)}</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="px-8 py-5 bg-ink-50/50 border-b border-ink-100">
          <div className="grid grid-cols-3 gap-4">
            <StatBadge
              label="Total Consultations"
              value={totalPatients}
              tone={totalPatients > 0 ? 'primary' : 'info'}
            />
            <StatBadge
              label="New Patients"
              value={newPatients}
              tone="success"
            />
            <StatBadge
              label="Returning Patients"
              value={returningPatients}
              tone="warning"
            />
          </div>
          {trend && (
            <div className="mt-3">
              <TrendIndicator trend={trend} />
            </div>
          )}
        </div>

        {/* Report Body */}
        <div className="px-8 py-6 space-y-2">
          {/* Patient Overview */}
          <SectionHeader
            icon={<Icon.Users width={16} height={16} />}
            title="Patient Overview"
          />
          {totalPatients === 0 ? (
            <p className="text-sm text-ink-600 italic">No patient consultations were recorded during this period.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ink-700">
                Total of <strong>{totalPatients}</strong> patient consultation{totalPatients !== 1 ? 's' : ''} recorded.
              </p>
              {newPatients > 0 && (
                <p className="text-sm text-ink-600">
                  Patient mix: {newPatients} new ({Math.round((newPatients / totalPatients) * 100)}%) &middot; {returningPatients} returning
                </p>
              )}
            </div>
          )}

          {/* Trend Analysis */}
          {trend && (
            <>
              <SectionHeader
                icon={<Icon.Trending width={16} height={16} />}
                title="Trend Analysis"
              />
              <div className="bg-ink-50 rounded-lg p-4 text-sm text-ink-700">
                {trend.change === 0 ? (
                  <p>Patient volume held steady at {totalPatients} consultation{totalPatients !== 1 ? 's' : ''}, matching the previous period.</p>
                ) : (
                  <p>
                    Consultation volume <strong>{trend.change > 0 ? 'increased' : 'decreased'} {Math.abs(trend.change)}%</strong> compared to the previous period ({trend.prevTotal} → {trend.currentTotal} consultations).
                    {trend.change > 30 ? ' This indicates strong patient traffic growth.' :
                     trend.change > 0 ? ' This indicates growing patient traffic.' :
                     trend.change < -30 ? ' Consider reviewing outreach or scheduling capacity.' :
                     ' A slight dip worth monitoring.'}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Clinical Summary */}
          <SectionHeader
            icon={<Icon.Report width={16} height={16} />}
            title="Clinical Summary"
          />
          {topComplaints.length > 0 ? (
            <DataTable
              headers={['#', 'Chief Complaint', 'Cases']}
              rows={topComplaints.slice(0, 5).map(([label, count], i) => [i + 1, label, count])}
            />
          ) : (
            <p className="text-sm text-ink-600 italic">No chief complaints were documented.</p>
          )}
          {topDiagnoses.length > 0 && (
            <>
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mt-4 mb-2">Top Diagnoses</p>
              <DataTable
                headers={['#', 'Diagnosis', 'Cases']}
                rows={topDiagnoses.slice(0, 5).map(([label, count], i) => [i + 1, label, count])}
              />
            </>
          )}

          {/* Operational Notes */}
          <SectionHeader
            icon={<Icon.Clock width={16} height={16} />}
            title="Operational Notes"
          />
          {peakHour ? (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
              <p className="text-sm text-ink-700">
                <strong>Peak hours:</strong> {peakHour.hour % 12 || 12}:00 {peakHour.hour >= 12 ? 'PM' : 'AM'} — {((peakHour.hour + 2) % 12) || 12}:00 {((peakHour.hour + 2) % 24) >= 12 ? 'PM' : 'AM'}
                <span className="text-ink-500 ml-2">({peakHour.count} visits)</span>
              </p>
              <p className="text-xs text-ink-500 mt-1">
                {peakHour.hour < 12 ? 'Morning shifts may need extra staffing.' : 'Afternoon/evening traffic is heaviest.'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-600 italic">No peak-hour data available.</p>
          )}

          {/* Follow-up Alerts */}
          {followUpAlerts.length > 0 && (
            <>
              <SectionHeader
                icon={<Icon.Bell width={16} height={16} />}
                title="Follow-up Alerts"
              />
              <div className="bg-red-50 border border-red-100 rounded-lg p-4 space-y-2">
                {followUpAlerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span className="text-ink-700">
                      <strong>Patient #{alert.patient_id}:</strong> {alert.instruction}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Raw narrative (if present) */}
          {reportText && (
            <>
              <SectionHeader
                icon={<Icon.FileText width={16} height={16} />}
                title="Narrative Summary"
              />
              <div className="bg-sand rounded-lg p-4 text-sm text-ink-700 leading-relaxed whitespace-pre-line">
                {lines.filter(l => l.trim() && !l.startsWith('━') && !l.startsWith('📊') && !l.startsWith('📈') && !l.startsWith('🏥') && !l.startsWith('⚙️') && !l.startsWith('🔔')).join('\n')}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-ink-50 border-t border-ink-100 text-center">
          <p className="text-xs text-ink-400">
            Generated by Jean Lying-in Maternity Clinic &middot; {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="text-[10px] text-ink-300 mt-1">
            This report is AI-assisted and should be reviewed by a licensed healthcare professional.
          </p>
        </div>
      </div>
    </div>
  );
}

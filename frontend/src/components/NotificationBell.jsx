import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import api from '../services/api';

const REFRESH_MS = 5 * 60 * 1000; // re-check every 5 minutes while the app is open

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthYearOf(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function daysUntil(edd) {
  return Math.ceil((new Date(edd).getTime() - Date.now()) / 86400000);
}

/**
 * Bell icon in the header listing patients whose estimated delivery date is
 * coming up (or already passed). Clicking a row opens the Pregnancy Tracking
 * form on the month of that patient's first checkup.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get('/monitoring/expected-deliveries', { params: { days: 30 } });
        if (!cancelled) setRows(data.rows || []);
      } catch {
        if (!cancelled) setRows([]);
      }
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function openTracking(row) {
    setOpen(false);
    const monthYear = monthYearOf(row.first_consultation) || monthYearOf(new Date());
    navigate('/pregnancy-tracking', { state: { monthYear } });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative text-white/90 hover:bg-white/10 p-2 rounded-md"
        aria-label="Delivery notifications"
      >
        <Icon.Bell width={20} height={20} />
        {rows.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold inline-flex items-center justify-center">
            {rows.length > 99 ? '99+' : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white rounded-lg border border-ink-100 shadow-card py-1 animate-fade-in z-50">
          <p className="px-3 py-2 border-b border-ink-100 text-xs font-bold text-ink-700 uppercase tracking-wider">
            Expected deliveries (30 days)
          </p>
          <div className="max-h-80 overflow-y-auto">
            {rows.length === 0 && (
              <p className="px-3 py-4 text-sm text-ink-500 text-center">No upcoming deliveries</p>
            )}
            {rows.map((r) => {
              const d = daysUntil(r.edd);
              return (
                <button
                  key={r.pregnancy_id}
                  type="button"
                  onClick={() => openTracking(r)}
                  className="w-full text-left px-3 py-2 hover:bg-ink-50 border-b border-ink-50 last:border-0"
                >
                  <p className="text-sm font-medium text-ink-900">
                    {r.first_name} {r.last_name}
                  </p>
                  <p className="text-xs text-ink-600">
                    EDD: {formatDate(r.edd)}{' '}
                    <span className={d < 0 ? 'text-red-600 font-semibold' : d <= 7 ? 'text-amber-600 font-semibold' : 'text-ink-500'}>
                      {d < 0 ? `overdue by ${-d}d` : d === 0 ? 'due today' : `in ${d} days`}
                    </span>
                  </p>
                  <p className="text-[11px] text-ink-500">
                    First checkup: {monthYearOf(r.first_consultation) || '—'}
                    {r.delivery_location ? ` · ${r.delivery_location}` : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

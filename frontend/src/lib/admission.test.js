import { describe, it, expect } from 'vitest';
import { canRecordClinical, followupState, fromLocalInput, monthKey, peso, timeAgo, toLocalInput, isActiveStatus } from './admission';

describe('admission helpers', () => {
  it('only midwives/nurses, doctors and admins can record; front desk cannot', () => {
    expect(['admin', 'doctor', 'nurse'].every(canRecordClinical)).toBe(true);
    expect(canRecordClinical('staff')).toBe(false);
    expect(canRecordClinical(undefined)).toBe(false);
  });

  it('knows which stays are still open', () => {
    expect(['admitted', 'in_labor', 'delivered'].every(isActiveStatus)).toBe(true);
    expect(isActiveStatus('discharged')).toBe(false);
    expect(isActiveStatus('referred')).toBe(false);
  });

  it('formats pesos with centavos', () => {
    expect(peso(1035.5)).toBe('₱1,035.50');
    expect(peso(null)).toBe('₱0.00');
  });

  it('describes elapsed time in plain words', () => {
    const now = new Date('2026-10-29T12:00:00Z').getTime();
    expect(timeAgo('2026-10-29T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-29T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-10-29T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-10-26T12:00:00Z', now)).toBe('3 days ago');
    expect(timeAgo(null)).toBe('');
  });

  it('marks a follow-up overdue only when past due and not done', () => {
    const now = new Date('2026-10-29T12:00:00Z').getTime();
    expect(followupState({ due_at: '2026-10-28T12:00:00Z' }, now)).toBe('overdue');
    expect(followupState({ due_at: '2026-10-30T12:00:00Z' }, now)).toBe('upcoming');
    expect(followupState({ due_at: '2026-10-20T12:00:00Z', done_at: '2026-10-21T00:00:00Z' }, now)).toBe('done');
  });

  it('round-trips a date-time input without shifting the time', () => {
    const iso = '2026-10-24T08:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(fromLocalInput('')).toBeUndefined();
  });

  it('builds month keys like 2026-03', () => {
    expect(monthKey(new Date(2026, 2, 5))).toBe('2026-03');
  });
});

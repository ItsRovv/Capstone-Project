import { useState } from 'react';
import { Card } from './UI/Card';
import { Button } from './UI/Button';
import { Input, Select } from './UI/Input';
import { useToast } from './UI/Toast';
import api, { apiError } from '../services/api';
import { admissionService } from '../services/admissionService';
import { peso } from '../lib/admission';

const iso = (d) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const CATEGORIES = [['', 'All categories'], ['medicine', 'Medicines'], ['antibiotic', 'Antibiotics'], ['supply', 'Supplies'], ['service', 'Services and fees']];

// How many diapers, gloves, gauze or ampules were used in a period. Usage only, not stock.
export function ItemUsageReport() {
  const toast = useToast();
  const [range, setRange] = useState({ from: iso(new Date(Date.now() - 6 * 86400000)), to: iso(new Date()), category: '' });
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const params = { from: range.from, to: range.to, ...(range.category ? { category: range.category } : {}) };

  async function run() {
    setBusy(true);
    try {
      setRows((await admissionService.itemUsageReport(params)).rows);
    } catch (err) {
      toast.error(apiError(err, 'Could not load the item usage report'));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    try {
      const res = await api.get(admissionService.itemUsageCsvUrl(params), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `item-usage-${range.from}-to-${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiError(err, 'Could not export the report'));
    }
  }

  return (
    <Card className="mb-4 print:hidden">
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Item usage</h3>
      <p className="text-sm text-ink-500 mb-3">Totals of items used during stays, from the usage records. Voided lines are left out.</p>
      <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-end">
        <Input label="From" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <Input label="To" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        <Select label="Category" value={range.category} onChange={(e) => setRange((r) => ({ ...r, category: e.target.value }))}>
          {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Button onClick={run} loading={busy}>Show</Button>
        <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
      </div>
      {rows && (rows.length === 0 ? (
        <p className="text-sm text-ink-500 mt-4">No items were used in this period.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Item</th><th className="text-left px-3 py-2">Category</th>
                <th className="px-3 py-2">Used</th><th className="px-3 py-2">Admissions</th><th className="text-right px-3 py-2">Amount (reference)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={`${r.category}-${r.label}-${r.unit}`}>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-ink-600">{r.category}</td>
                  <td className="px-3 py-2 text-center">{Number(r.total_quantity)}{r.unit ? ` ${r.unit}` : ''}</td>
                  <td className="px-3 py-2 text-center">{Number(r.admissions)}</td>
                  <td className="px-3 py-2 text-right">{r.charged ? peso(r.amount) : 'Not charged'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Card>
  );
}

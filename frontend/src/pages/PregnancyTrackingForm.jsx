import { useCallback, useEffect, useRef, useState } from 'react';
import { Topbar } from '../components/Topbar';
import { useLocation, useOutletContext } from 'react-router-dom';
import { JLMCLogo } from '../components/JLMCLogo';
import { useToast } from '../components/UI/Toast';
import { pregnancyTrackingService } from '../services/pregnancyTrackingService';
import { apiError } from '../services/api';

const ROW_COUNT = 15;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

function getCurrentMonthYear() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// "November 2026" <-> "2026-11" for the <input type="month"> control.
function toMonthInput(monthYear) {
  const d = new Date(`${monthYear} 1`);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fromMonthInput(v) {
  if (!v) return getCurrentMonthYear();
  const [y, m] = v.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(monthYear, delta) {
  const d = new Date(`${monthYear} 1`);
  if (Number.isNaN(d.getTime())) return getCurrentMonthYear();
  return new Date(d.getFullYear(), d.getMonth() + delta, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/*
 * Trimester columns as shown in the paper form.
 * The first 7 columns represent months 1-7, month 8 has 2 sub-columns,
 * month 9 has 4 sub-columns, and the postpartum section has 2 columns.
 * Each cell now stores the visit date (month/day) instead of a checkmark.
 */
const TOTAL_TRIMESTER_COLS = 15; // 7 + 2 + 4 + 2

const emptyRow = () => ({
  patient_id: null,
  name: '',
  address: '',
  age: '',
  cpNumber: '',
  docSubmitted: false,
  edd: '',
  obIndex: '',
  trimester: Array(TOTAL_TRIMESTER_COLS).fill(''),
  deliveryDate: ''
});

const initialRows = Array.from({ length: ROW_COUNT }, emptyRow);

function normalizeRow(row) {
  return {
    patient_id: row.patient_id ?? null,
    name: row.name ?? '',
    address: row.address ?? '',
    age: row.age ?? '',
    cpNumber: row.cpNumber ?? '',
    docSubmitted: row.docSubmitted ?? false,
    edd: row.edd ?? '',
    obIndex: row.obIndex ?? '',
    trimester: Array.isArray(row.trimester) && row.trimester.length === TOTAL_TRIMESTER_COLS
      ? row.trimester.map((v) => (v == null ? '' : String(v)))
      : Array(TOTAL_TRIMESTER_COLS).fill(''),
    deliveryDate: row.deliveryDate ?? '',
    isOld: row.isOld ?? false,
    deliveryInJlmc: row.deliveryInJlmc ?? true
  };
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return initialRows;
  const normalized = rows.map(normalizeRow);
  // Keep every saved row — rows appended by the prenatal sync must stay visible.
  while (normalized.length < ROW_COUNT) normalized.push(emptyRow());
  return normalized; // keep extra rows beyond 15 — Enter appends rows as needed
}

const isBlankRow = (r) => !r.patient_id && !String(r.name || '').trim();

// Add active-pregnancy patients that aren't in the saved rows yet — first into
// blank rows, then appended past the printed 15 if needed.
function mergeMissingPregnancies(rows, active) {
  const present = new Set(rows.map((r) => Number(r.patient_id)).filter(Boolean));
  const missing = (active || []).filter((a) => !present.has(Number(a.patient_id)));
  if (!missing.length) return rows;
  const next = [...rows];
  for (const preg of missing) {
    const row = normalizeRow(preg);
    const blankIdx = next.findIndex(isBlankRow);
    if (blankIdx >= 0) next[blankIdx] = row;
    else next.push(row);
  }
  return next;
}

// Width in characters so a cell always fits what is typed in it.
const fitChars = (v, min = 4) => Math.max(min, String(v ?? '').length + 2);

export function PregnancyTrackingForm() {
  const { onOpenMenu } = useOutletContext();
  const toast = useToast();
  const location = useLocation();
  // A notification can deep-link here with the patient's first-checkup month.
  const [monthYear, setMonthYear] = useState(location.state?.monthYear || getCurrentMonthYear);
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(50);
  const [typeFilter, setTypeFilter] = useState('all');
  const [jlmcFilter, setJlmcFilter] = useState('all');
  const savingRef = useRef(false);
  const [page, setPage] = useState(0);
  const tableScrollRef = useRef(null);
  const paperRef = useRef(null);

  // Mouse wheel zoom on the form: hold Ctrl and roll the wheel to zoom in/out.
  // Attached natively so we can prevent the browser's own Ctrl+wheel zoom.
  useEffect(() => {
    const el = paperRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // Set by user edits; autosave only runs when true so a freshly loaded form
  // can't overwrite rows the prenatal sync just wrote.
  const dirtyRef = useRef(false);

  // Load saved form for the selected month/year; if none exists, auto-fill from active pregnancies.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const saved = await pregnancyTrackingService.getByMonthYear(monthYear);
        const flags = await pregnancyTrackingService.getActivePregnancies().catch(() => []);
        if (!cancelled) {
          const flagMap = new Map(flags.map((f) => [Number(f.patient_id), f]));
          const withFlags = normalizeRows(saved.rows).map((r) => {
            const f = r.patient_id ? flagMap.get(Number(r.patient_id)) : null;
            return f ? { ...r, isOld: f.isOld, deliveryInJlmc: f.deliveryInJlmc } : r;
          });
          setRows(mergeMissingPregnancies(withFlags, flags));
        }
      } catch (err) {
        if (err.response?.status === 404) {
          try {
            const active = await pregnancyTrackingService.getActivePregnancies();
            if (!cancelled) {
              setRows((prev) => {
                const next = [...prev];
                active.forEach((row, i) => {
                  if (i < next.length) next[i] = normalizeRow(row);
                });
                return next;
              });
            }
          } catch (innerErr) {
            if (!cancelled) toast.error(apiError(innerErr, 'Could not load active pregnancies'));
          }
        } else if (!cancelled) {
          toast.error(apiError(err, 'Could not load form'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [monthYear, toast]);

  const handleSave = useCallback(async (silent = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await pregnancyTrackingService.save(monthYear, rows);
      dirtyRef.current = false;
      if (!silent) toast.success('Form saved');
    } catch (err) {
      if (!silent) toast.error(apiError(err, 'Could not save form'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [monthYear, rows, toast]);

  // Auto-save 2 seconds after the user stops editing.
  useEffect(() => {
    if (loading || !dirtyRef.current) return;
    const timer = setTimeout(() => handleSave(true), 2000);
    return () => clearTimeout(timer);
  }, [rows, monthYear, loading, handleSave]);

  const updateRow = (idx, field, value) => {
    dirtyRef.current = true;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const updateTrimester = (rowIdx, colIdx, value) => {
    dirtyRef.current = true;
    setRows((prev) => {
      const next = [...prev];
      const t = [...next[rowIdx].trimester];
      t[colIdx] = value;
      next[rowIdx] = { ...next[rowIdx], trimester: t };
      return next;
    });
  };

  const pageCount = Math.max(1, Math.ceil(rows.length / ROW_COUNT));
  const safePage = Math.min(page, pageCount - 1);

  const focusCell = (tr, tc) => {
    setTimeout(() => {
      const el = tableScrollRef.current?.querySelector('input[data-r="' + tr + '"][data-c="' + tc + '"]');
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
        el.focus();
        el.select?.();
      }
    }, 60);
  };

  // Arrow keys move between cells like a spreadsheet: left/right at the
  // text edge, up/down to the same column in the next row.
  const onTableKeyDown = useCallback((e) => {
    const el = e.target;
    if (el.tagName !== 'INPUT') return;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    let tr = r, tc = c;
    if (e.key === 'ArrowRight') {
      if (el.selectionEnd !== el.value.length) return;
      tc = c + 1;
    } else if (e.key === 'ArrowLeft') {
      if (el.selectionStart !== 0) return;
      tc = c - 1;
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') tr = r + 1;
    else if (e.key === 'ArrowUp') tr = r - 1;
    else return;

    // Enter past the last row: open a fresh page padded to 15 rows.
    if (tr >= rows.length && e.key === 'Enter') {
      const needed = Math.ceil((tr + 1) / ROW_COUNT) * ROW_COUNT;
      setRows((prev) => {
        const next = [...prev];
        while (next.length < needed) next.push(emptyRow());
        return next;
      });
      setPage(Math.floor(tr / ROW_COUNT));
      focusCell(tr, tc);
      e.preventDefault();
      return;
    }
    if (tr < 0 || tr >= rows.length) return;
    const targetPage = Math.floor(tr / ROW_COUNT);
    if (targetPage !== safePage) {
      setPage(targetPage);
      focusCell(tr, tc);
      e.preventDefault();
      return;
    }
    const next = tableScrollRef.current?.querySelector('input[data-r="' + tr + '"][data-c="' + tc + '"]');
    if (next) {
      e.preventDefault();
      next.focus();
      next.select?.();
    }
  }, [rows.length, safePage]);

  const handlePrint = () => window.print();

  // A real .xlsx that mirrors the printed paper form: merged trimester header, clinic
  // branding, bordered cells. No "format doesn't match" prompt because it is a true xlsx.
  // The xlsx library is loaded on demand so it does not slow the initial page load.
  const handleExcel = async () => {
    const XLSX = await import('xlsx-js-style');
    const COLS = 27;
    const THIN = { style: 'thin', color: { rgb: 'FF334155' } };
    const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    const headCell = {
      font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: 'FFFFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'FF0F766E' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER
    };
    const text = (zebra) => ({
      font: { sz: 10, name: 'Calibri' },
      fill: zebra ? { patternType: 'solid', fgColor: { rgb: 'FFF1F5F4' } } : undefined,
      alignment: { vertical: 'center', wrapText: true },
      border: BORDER
    });
    const num = (zebra) => ({
      font: { sz: 10, name: 'Calibri' },
      fill: zebra ? { patternType: 'solid', fgColor: { rgb: 'FFF1F5F4' } } : undefined,
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER
    });
    const merges = [];
    const ws = {};
    const range = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    const put = (r, c, v, s, t = 's') => {
      const cell = { t, v };
      if (s) cell.s = s;
      ws[XLSX.utils.encode_cell({ r, c })] = cell;
      if (r > range.e.r) range.e.r = r;
      if (c > range.e.c) range.e.c = c;
    };
    const merge = (r0, c0, r1, c1) => merges.push({ s: { r: r0, c: c0 }, e: { r: r1, c: c1 } });
    const head = (r, c, v) => put(r, c, v, headCell);
    const fill = (r, c) => put(r, c, '', headCell);
    const gap = (r, c) => put(r, c, '', { fill: { patternType: 'solid', fgColor: { rgb: 'FFE2E8F0' } } });

    // Title block
    put(0, 0, 'JEAN LYING-IN MATERNITY CLINIC', {
      font: { bold: true, sz: 16, name: 'Calibri', color: { rgb: 'FF134E4A' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    merge(0, 0, 0, COLS - 1);
    put(1, 0, 'Pregnancy Tracking Form', {
      font: { bold: true, sz: 13, name: 'Calibri', color: { rgb: 'FF0F172A' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    merge(1, 0, 1, COLS - 1);
    put(2, 0, `Month & Year:  ${monthYear}`, {
      font: { sz: 11, italic: true, name: 'Calibri', color: { rgb: 'FF475569' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: 'FF0F766E' } } }
    });
    merge(2, 0, 2, COLS - 1);

    const H = 4; // first header row
    const FIXED = ['#', 'Name', 'Address', 'Age', 'CP Number', 'Doc Submitted', 'EDD', 'OB INDEX'];
    FIXED.forEach((label, c) => { head(H, c, label); fill(H + 1, c); fill(H + 2, c); merge(H, c, H + 2, c); });
    const T0 = FIXED.length; // first trimester column = 8 (col I)
    head(H, T0, 'TRIMESTER');
    for (let c = T0 + 1; c <= COLS - 2; c++) fill(H, c);
    merge(H, T0, H, COLS - 2);
    head(H, COLS - 1, 'JLMC Delivery Date');
    fill(H + 1, COLS - 1); fill(H + 2, COLS - 1);
    merge(H, COLS - 1, H + 2, COLS - 1);

    // Row H+1: months 1-7 (merged down), 8, 9, +
    for (let i = 0; i < 7; i++) { head(H + 1, T0 + i, i + 1); fill(H + 2, T0 + i); merge(H + 1, T0 + i, H + 2, T0 + i); }
    let c = T0 + 7;
    gap(H + 1, c); gap(H + 2, c); c++;
    head(H + 1, c, '8'); head(H + 1, c + 1, '');
    merge(H + 1, c, H + 1, c + 1);
    head(H + 2, c, '1'); head(H + 2, c + 1, '2');
    c += 2;
    gap(H + 1, c); gap(H + 2, c); c++;
    head(H + 1, c, '9'); head(H + 1, c + 1, ''); head(H + 1, c + 2, ''); head(H + 1, c + 3, '');
    merge(H + 1, c, H + 1, c + 3);
    head(H + 2, c, '1'); head(H + 2, c + 1, '2'); head(H + 2, c + 2, '3'); head(H + 2, c + 3, '4');
    c += 4;
    gap(H + 1, c); gap(H + 2, c); c++;
    head(H + 1, c, '+'); head(H + 1, c + 1, '');
    merge(H + 1, c, H + 1, c + 1);
    head(H + 2, c, ''); head(H + 2, c + 1, '');

    // Data rows with a light zebra fill
    rows.forEach((r, i) => {
      const rowIdx = H + 3 + i;
      const zebra = i % 2 === 1;
      const t = text(zebra); const n = num(zebra);
      put(rowIdx, 0, i + 1, n, 'n');
      put(rowIdx, 1, r.name, t);
      put(rowIdx, 2, r.address, t);
      const ageNum = Number(r.age);
      put(rowIdx, 3, r.age === '' || Number.isNaN(ageNum) ? r.age : ageNum, n, r.age === '' || Number.isNaN(ageNum) ? 's' : 'n');
      put(rowIdx, 4, r.cpNumber, t);
      put(rowIdx, 5, r.docSubmitted ? '✓' : '', n);
      put(rowIdx, 6, r.edd, n);
      put(rowIdx, 7, r.obIndex, n);
      let tc = T0;
      r.trimester.slice(0, 7).forEach((v) => put(rowIdx, tc++, v, n));
      gap(rowIdx, tc++);
      r.trimester.slice(7, 9).forEach((v) => put(rowIdx, tc++, v, n));
      gap(rowIdx, tc++);
      r.trimester.slice(9, 13).forEach((v) => put(rowIdx, tc++, v, n));
      gap(rowIdx, tc++);
      r.trimester.slice(13, 15).forEach((v) => put(rowIdx, tc++, v, n));
      put(rowIdx, COLS - 1, r.deliveryDate, n);
    });

    ws['!ref'] = XLSX.utils.encode_range(range);
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 4 }, { wch: 26 }, { wch: 24 }, { wch: 5 }, { wch: 13 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
      ...Array(7).fill({ wch: 4.5 }),
      { wch: 2 }, { wch: 4.5 }, { wch: 4.5 },
      { wch: 2 }, { wch: 4.5 }, { wch: 4.5 }, { wch: 4.5 }, { wch: 4.5 },
      { wch: 2 }, { wch: 4.5 }, { wch: 4.5 },
      { wch: 12 }
    ];
    ws['!rows'] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }, { hpt: 16 }, { hpt: 16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthYear.slice(0, 31));
    XLSX.writeFile(wb, `pregnancy-tracking-${monthYear.replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  };

  const tableHead = (
<thead>
                  {/* Main header row */}
                  <tr>
                    <th rowSpan={3} className="border border-ink-800 w-10 py-2 font-semibold text-ink-900 text-sm">#</th>
                    <th rowSpan={3} className="border border-ink-800 px-2 py-2 font-semibold text-ink-900 min-w-[180px]">Name</th>
                    <th rowSpan={3} className="border border-ink-800 px-2 py-2 font-semibold text-ink-900 min-w-[180px]">Address</th>
                    <th rowSpan={3} className="border border-ink-800 w-12 py-2 font-semibold text-ink-900">Age</th>
                    <th rowSpan={3} className="border border-ink-800 px-2 py-2 font-semibold text-ink-900 min-w-[110px]">CP Number</th>
                    <th rowSpan={3} className="border border-ink-800 w-24 py-2 font-semibold text-ink-900 text-xs leading-tight">
                      <span className="block">Doc</span>
                      <span className="block">Submitted</span>
                    </th>
                    <th rowSpan={3} className="border border-ink-800 px-2 py-2 font-semibold text-ink-900 whitespace-nowrap">EDD</th>
                    <th rowSpan={3} className="border border-ink-800 w-24 py-2 font-semibold text-ink-900 text-sm">OB<br />INDEX</th>
                    <th className="border border-ink-800 py-2 font-semibold text-ink-900 text-sm tracking-widest" colSpan={18}>
                      TRIMESTER
                    </th>
                    <th rowSpan={3} className="border border-ink-800 w-28 py-2 font-semibold text-ink-900 text-xs">
                      JLMC<br />Delivery Date
                    </th>
                  </tr>
                  {/* Row 2: 1-7 span both rows (merged, no sub-row). 8, 9, + span their sub-cols */}
                  <tr>
                    <th rowSpan={2} className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-sm">1</th>
                    <th rowSpan={2} className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-sm">2</th>
                    <th rowSpan={2} className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-sm">3</th>
                    <th rowSpan={2} className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-sm">4</th>
                    <th rowSpan={2} className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-sm">5</th>
                    <th rowSpan={2} className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-sm">6</th>
                    <th rowSpan={2} className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-sm">7</th>
                    <th className="w-2 py-1"></th>
                    <th colSpan={2} className="border border-ink-800 py-1 font-semibold text-ink-900 text-xs">8</th>
                    <th className="w-2 py-1"></th>
                    <th colSpan={4} className="border border-ink-800 py-1 font-semibold text-ink-900 text-xs">9</th>
                    <th className="w-2 py-1"></th>
                    <th colSpan={2} className="border border-ink-800 py-1 font-semibold text-ink-900 text-xs">+</th>
                  </tr>
                  {/* Row 3: sub-headers only under 8 and 9, nothing under 1-7 or + */}
                  <tr>
                    <th className="w-2 py-1"></th>
                    <th className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-xs">1</th>
                    <th className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-xs">2</th>
                    <th className="w-2 py-1"></th>
                    <th className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-xs">1</th>
                    <th className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-xs">2</th>
                    <th className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-xs">3</th>
                    <th className="border border-ink-800 w-16 py-1.5 font-semibold text-ink-900 text-xs">4</th>
                    <th className="w-2 py-1"></th>
                    <th className="border border-ink-800 w-16 py-1"></th>
                    <th className="border border-ink-800 w-16 py-1"></th>
                  </tr>
                </thead>
  );

  const renderRow = (row, rowIdx) => (
<tr key={rowIdx}>
                      <td className="border border-ink-800 text-center text-ink-700 font-medium h-12 text-sm">
                        {rowIdx + 1}
                      </td>
                      <td className="border border-ink-800 whitespace-nowrap">
                        <input
                          type="text"
                          value={row.name}
                          size={fitChars(row.name, 14)}
                          data-r={rowIdx} data-c={0}
                          onChange={(e) => updateRow(rowIdx, 'name', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-ink-900"
                        />
                      </td>
                      <td className="border border-ink-800 whitespace-nowrap">
                        <input
                          type="text"
                          value={row.address}
                          size={fitChars(row.address, 14)}
                          data-r={rowIdx} data-c={1}
                          onChange={(e) => updateRow(rowIdx, 'address', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-ink-900"
                        />
                      </td>
                      <td className="border border-ink-800 whitespace-nowrap">
                        <input
                          type="text"
                          value={row.age}
                          size={fitChars(row.age, 3)}
                          data-r={rowIdx} data-c={2}
                          onChange={(e) => updateRow(rowIdx, 'age', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                        />
                      </td>
                      <td className="border border-ink-800 whitespace-nowrap">
                        <input
                          type="text"
                          value={row.cpNumber}
                          size={fitChars(row.cpNumber, 11)}
                          data-r={rowIdx} data-c={3}
                          onChange={(e) => updateRow(rowIdx, 'cpNumber', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-ink-900"
                        />
                      </td>
                      {/* Doc Submitted — blank cell, click to toggle like paper form */}
                      <td
                        className="border border-ink-800 cursor-pointer"
                        onClick={() => updateRow(rowIdx, 'docSubmitted', !row.docSubmitted)}
                      >
                        <div className="w-full h-full flex items-center justify-center min-h-[44px]">
                          {row.docSubmitted && (
                            <span className="text-ink-900 font-bold text-sm">✓</span>
                          )}
                        </div>
                      </td>
                      <td className="border border-ink-800 whitespace-nowrap">
                        <input
                          type="text"
                          value={row.edd}
                          size={fitChars(row.edd, 11)}
                          data-r={rowIdx} data-c={4}
                          onChange={(e) => updateRow(rowIdx, 'edd', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                        />
                      </td>
                      <td className="border border-ink-800 whitespace-nowrap">
                        <input
                          type="text"
                          value={row.obIndex}
                          size={fitChars(row.obIndex, 4)}
                          data-r={rowIdx} data-c={5}
                          onChange={(e) => updateRow(rowIdx, 'obIndex', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                        />
                      </td>

                      {/* Trimester cells: 1-7, gap, 8(1,2), gap, 9(1,2,3,4), gap, +(2) */}
                      {row.trimester.slice(0, 7).map((value, colIdx) => (
                        <td key={colIdx} className="border border-ink-800 w-16 p-0">
                          <input
                            type="text"
                            value={value}
                            placeholder="MM/DD"
                            data-r={rowIdx} data-c={6 + colIdx}
                            onChange={(e) => updateTrimester(rowIdx, colIdx, e.target.value)}
                            className="w-full h-full min-h-[44px] px-2 text-center text-xs bg-transparent outline-none text-ink-900 placeholder:text-ink-400"
                          />
                        </td>
                      ))}
                      <td className="w-2"></td>
                      {row.trimester.slice(7, 9).map((value, colIdx) => (
                        <td key={colIdx + 7} className="border border-ink-800 w-16 p-0">
                          <input
                            type="text"
                            value={value}
                            placeholder="MM/DD"
                            data-r={rowIdx} data-c={6 + colIdx + 7}
                            onChange={(e) => updateTrimester(rowIdx, colIdx + 7, e.target.value)}
                            className="w-full h-full min-h-[44px] px-2 text-center text-xs bg-transparent outline-none text-ink-900 placeholder:text-ink-400"
                          />
                        </td>
                      ))}
                      <td className="w-2"></td>
                      {row.trimester.slice(9, 13).map((value, colIdx) => (
                        <td key={colIdx + 9} className="border border-ink-800 w-16 p-0">
                          <input
                            type="text"
                            value={value}
                            placeholder="MM/DD"
                            data-r={rowIdx} data-c={6 + colIdx + 9}
                            onChange={(e) => updateTrimester(rowIdx, colIdx + 9, e.target.value)}
                            className="w-full h-full min-h-[44px] px-2 text-center text-xs bg-transparent outline-none text-ink-900 placeholder:text-ink-400"
                          />
                        </td>
                      ))}
                      <td className="w-2"></td>
                      {row.trimester.slice(13, 15).map((value, colIdx) => (
                        <td key={colIdx + 13} className="border border-ink-800 w-16 p-0">
                          <input
                            type="text"
                            value={value}
                            placeholder="MM/DD"
                            data-r={rowIdx} data-c={6 + colIdx + 13}
                            onChange={(e) => updateTrimester(rowIdx, colIdx + 13, e.target.value)}
                            className="w-full h-full min-h-[44px] px-2 text-center text-xs bg-transparent outline-none text-ink-900 placeholder:text-ink-400"
                          />
                        </td>
                      ))}

                      <td className="border border-ink-800 whitespace-nowrap">
                        <input
                          type="text"
                          value={row.deliveryDate}
                          size={fitChars(row.deliveryDate, 10)}
                          data-r={rowIdx} data-c={21}
                          onChange={(e) => updateRow(rowIdx, 'deliveryDate', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                        />
                      </td>
                    </tr>
  );

  return (
    <div className="h-full flex flex-col">
      <Topbar title="Pregnancy Tracking Form" onMenuClick={onOpenMenu} />

      <div className="flex-1 overflow-y-auto w-full print:p-0 print:max-w-none">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6">
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 sm:pt-4 mb-3 sm:mb-4 print:hidden">
            <p className="text-sm text-ink-500">
              {loading ? 'Loading...' : (
                <>
                  Month: <strong>{monthYear}</strong> {saving && <span className="ml-2 text-ink-400">· saving…</span>}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-ink-200 bg-white overflow-hidden" role="group" aria-label="Zoom">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Zoom out"
                  className="px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  title="Reset zoom"
                  className="px-2 py-2 text-xs font-medium text-ink-600 hover:bg-ink-50 min-w-[3.25rem] border-x border-ink-200"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Zoom in"
                  className="px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => handleSave(false)}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleExcel}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-ink-300 bg-white text-ink-700 text-sm font-medium hover:bg-ink-50 transition-colors"
              >
                Excel
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Print Form
              </button>
            </div>
          </div>

          {/* Form paper — zoom applies to the table only, not the app around it */}
          <div ref={paperRef} className="bg-white p-3 sm:p-6 md:p-8 print:p-0">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-4 sm:mb-6">
              <h1 className="text-base sm:text-xl font-bold text-ink-900 tracking-tight">
                Pregnancy Tracking Form
              </h1>

              <div className="flex flex-col items-center print:hidden">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMonthYear(shiftMonth(monthYear, -1))}
                    className="px-2 py-1 rounded border border-ink-200 text-ink-600 text-xs hover:bg-ink-50"
                    title="Previous month"
                  >
                    ‹
                  </button>
                  <input
                    type="month"
                    value={toMonthInput(monthYear)}
                    onChange={(e) => setMonthYear(fromMonthInput(e.target.value))}
                    className="text-sm text-center text-ink-800 border border-ink-300 rounded-lg outline-none px-2 py-1 w-40 font-medium focus:border-primary-400"
                  />
                  <button
                    type="button"
                    onClick={() => setMonthYear(shiftMonth(monthYear, 1))}
                    className="px-2 py-1 rounded border border-ink-200 text-ink-600 text-xs hover:bg-ink-50"
                    title="Next month"
                  >
                    ›
                  </button>
                </div>
                <span className="text-[10px] text-ink-500 mt-0.5">Month & Year — {monthYear}</span>
              </div>
              {/* Printed header keeps the plain month text */}
              <p className="hidden print:block text-sm font-medium text-center">{monthYear}</p>

              <div className="flex items-center gap-2 print:hidden">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-ink-200 text-xs outline-none focus:border-primary-400"
                >
                  <option value="all">All patients</option>
                  <option value="new">New only</option>
                  <option value="old">Old only</option>
                </select>
                <select
                  value={jlmcFilter}
                  onChange={(e) => setJlmcFilter(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-ink-200 text-xs outline-none focus:border-primary-400"
                >
                  <option value="all">Any delivery site</option>
                  <option value="jlmc">Delivery in JLMC</option>
                  <option value="other">Delivery elsewhere</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <JLMCLogo size={40} />
                <span className="text-lg font-bold text-ink-800 tracking-wide">JLMC</span>
              </div>
            </div>

            {/* Table — only this part zooms; the form header stays fixed */}
            <div className="relative print:hidden" style={{ zoom: zoom / 100 }}>
              <button
                type="button"
                aria-label="Scroll left"
                onClick={() => tableScrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                className="sticky left-0 float-left z-10 my-1 -mr-8 flex h-8 w-8 items-center justify-center rounded-full border border-ink-300 bg-white text-ink-700 shadow hover:bg-ink-50 print:hidden"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Scroll right"
                onClick={() => tableScrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                className="sticky right-0 float-right z-10 my-1 -ml-8 flex h-8 w-8 items-center justify-center rounded-full border border-ink-300 bg-white text-ink-700 shadow hover:bg-ink-50 print:hidden"
              >
                ›
              </button>
            <div ref={tableScrollRef} className="overflow-x-auto" onKeyDown={onTableKeyDown}>
              <table className="border-collapse border border-ink-800 text-sm" style={{ minWidth: '100%', width: 'max-content' }}>
                {tableHead}

                <tbody>
                  {rows
                    .map((row, rowIdx) => ({ row, rowIdx }))
                    .filter(({ rowIdx }) => rowIdx >= safePage * ROW_COUNT && rowIdx < (safePage + 1) * ROW_COUNT)
                    .filter(({ row }) =>
                      !row.patient_id ||
                      ((typeFilter === 'all' || (typeFilter === 'old') === !!row.isOld) &&
                       (jlmcFilter === 'all' || (jlmcFilter === 'jlmc') === !!row.deliveryInJlmc))
                    )
                    .map(({ row, rowIdx }) => (
renderRow(row, rowIdx)
                  ))}
                </tbody>
              </table>
            </div>
            </div>

            {/* Print: whole booklet on Letter landscape, column widths like the paper form */}
            <style>{`@page { size: letter landscape; margin: 10mm; }
              .ptf-print input { font-size: 9px !important; padding: 1px 2px !important; min-height: 0 !important; height: 18px !important; }
              .ptf-print td, .ptf-print th { padding: 0 !important; }
              .ptf-print th { font-size: 9px !important; }
            `}</style>
            <div className="hidden print:block ptf-print">
              <table className="border-collapse border border-ink-800 text-sm w-full table-fixed">
                <colgroup>
                  <col style={{ width: '3%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11.5%' }} />
                  <col style={{ width: '3.5%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '4.5%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '6.5%' }} />
                  {Array.from({ length: 7 }, (_, i) => <col key={'t' + i} style={{ width: '2.4%' }} />)}
                  <col style={{ width: '1.1%' }} />
                  <col style={{ width: '2.4%' }} />
                  <col style={{ width: '2.4%' }} />
                  <col style={{ width: '1.1%' }} />
                  {Array.from({ length: 4 }, (_, i) => <col key={'n' + i} style={{ width: '2.4%' }} />)}
                  <col style={{ width: '1.1%' }} />
                  <col style={{ width: '2.4%' }} />
                  <col style={{ width: '2.4%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                {tableHead}
                <tbody>{rows.map((row, rowIdx) => renderRow(row, rowIdx))}</tbody>
              </table>
            </div>

            {/* Footer: real page numbers + page navigation */}
            <div className="flex items-center justify-between mt-6 text-sm text-ink-600 print:hidden">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                >
                  &lt; Prev page
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                >
                  Next page &gt;
                </button>
              </div>
              <span>Page {safePage + 1} of {pageCount}</span>
            </div>
            <div className="hidden print:block mt-6 text-sm text-ink-600 text-right">
              <span>Page __ of __</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

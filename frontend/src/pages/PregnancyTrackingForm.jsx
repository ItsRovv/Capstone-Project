import { useState } from 'react';
import { Topbar } from '../components/Topbar';
import { useOutletContext } from 'react-router-dom';
import { JLMCLogo } from '../components/JLMCLogo';

const ROW_COUNT = 15;

function getCurrentMonthYear() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/*
 * Trimester numbers exactly as shown in the paper form.
 * No T1/T2/T3/T4 group labels — just the raw numbers.
 */
const TOTAL_TRIMESTER_COLS = 15; // 7 + 2 + 4 + 2

const initialRows = Array.from({ length: ROW_COUNT }, () => ({
  name: '',
  address: '',
  age: '',
  cpNumber: '',
  docSubmitted: false,
  edd: '',
  obIndex: '',
  trimester: Array(TOTAL_TRIMESTER_COLS).fill(false),
  deliveryDate: ''
}));

export function PregnancyTrackingForm() {
  const { onOpenMenu } = useOutletContext();
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear);
  const [rows, setRows] = useState(initialRows);

  const updateRow = (idx, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const toggleTrimester = (rowIdx, colIdx) => {
    setRows((prev) => {
      const next = [...prev];
      const t = [...next[rowIdx].trimester];
      t[colIdx] = !t[colIdx];
      next[rowIdx] = { ...next[rowIdx], trimester: t };
      return next;
    });
  };

  const handlePrint = () => window.print();

  return (
    <div className="h-full flex flex-col">
      <Topbar title="Pregnancy Tracking Form" onMenuClick={onOpenMenu} />

      <div className="flex-1 overflow-y-auto w-full print:p-0 print:max-w-none">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6">
          {/* Action bar */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <p className="text-sm text-ink-500">
            Auto-filled: <strong>{monthYear}</strong>
          </p>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Print Form
          </button>
        </div>

        {/* Form paper */}
        <div className="bg-white p-6 md:p-8 print:p-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-ink-900 tracking-tight">
              Pregnancy Tracking Form
            </h1>

            <div className="flex flex-col items-center">
              <input
                type="text"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                className="text-sm text-center text-ink-800 bg-transparent border-b border-ink-400 outline-none px-4 py-1 w-48 font-medium"
              />
              <span className="text-[10px] text-ink-500 mt-0.5">Month & Year</span>
            </div>

            <div className="flex items-center gap-2">
              <JLMCLogo size={40} />
              <span className="text-lg font-bold text-ink-800 tracking-wide">JLMC</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-ink-800 text-sm">
              <thead>
                {/* Main header row */}
                <tr>
                  <th rowSpan={3} className="border border-ink-800 w-8 py-2 font-semibold text-ink-900 text-xs">#</th>
                  <th rowSpan={3} className="border border-ink-800 px-2 py-2 font-semibold text-ink-900 min-w-[140px]">Name</th>
                  <th rowSpan={3} className="border border-ink-800 px-2 py-2 font-semibold text-ink-900 min-w-[180px]">Address</th>
                  <th rowSpan={3} className="border border-ink-800 w-12 py-2 font-semibold text-ink-900">Age</th>
                  <th rowSpan={3} className="border border-ink-800 px-2 py-2 font-semibold text-ink-900 min-w-[110px]">CP Number</th>
                  <th rowSpan={3} className="border border-ink-800 w-20 py-2 font-semibold text-ink-900 text-[11px] leading-tight">
                    <span className="block">Doc</span>
                    <span className="block">Submitted</span>
                  </th>
                  <th rowSpan={3} className="border border-ink-800 w-20 py-2 font-semibold text-ink-900">EDD</th>
                  <th rowSpan={3} className="border border-ink-800 w-16 py-2 font-semibold text-ink-900 text-xs">OB<br />INDEX</th>
                  <th className="border border-ink-800 py-2 font-semibold text-ink-900 text-xs tracking-widest" colSpan={18}>
                    TRIMESTER
                  </th>
                  <th rowSpan={3} className="border border-ink-800 w-24 py-2 font-semibold text-ink-900 text-[11px]">
                    JLMC<br />Delivery Date
                  </th>
                </tr>
                {/* Row 2: 1-7 span both rows (merged, no sub-row). 8, 9, + span their sub-cols */}
                <tr>
                  <th rowSpan={2} className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-xs">1</th>
                  <th rowSpan={2} className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-xs">2</th>
                  <th rowSpan={2} className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-xs">3</th>
                  <th rowSpan={2} className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-xs">4</th>
                  <th rowSpan={2} className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-xs">5</th>
                  <th rowSpan={2} className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-xs">6</th>
                  <th rowSpan={2} className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-xs">7</th>
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
                  <th className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-[10px]">1</th>
                  <th className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-[10px]">2</th>
                  <th className="w-2 py-1"></th>
                  <th className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-[10px]">1</th>
                  <th className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-[10px]">2</th>
                  <th className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-[10px]">3</th>
                  <th className="border border-ink-800 w-10 py-1 font-semibold text-ink-900 text-[10px]">4</th>
                  <th className="w-2 py-1"></th>
                  <th className="border border-ink-800 w-10 py-1"></th>
                  <th className="border border-ink-800 w-10 py-1"></th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="border border-ink-800 text-center text-ink-700 font-medium h-10 text-xs">
                      {rowIdx + 1}
                    </td>
                    <td className="border border-ink-800">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(rowIdx, 'name', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-ink-900"
                      />
                    </td>
                    <td className="border border-ink-800">
                      <input
                        type="text"
                        value={row.address}
                        onChange={(e) => updateRow(rowIdx, 'address', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-ink-900"
                      />
                    </td>
                    <td className="border border-ink-800">
                      <input
                        type="text"
                        value={row.age}
                        onChange={(e) => updateRow(rowIdx, 'age', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                      />
                    </td>
                    <td className="border border-ink-800">
                      <input
                        type="text"
                        value={row.cpNumber}
                        onChange={(e) => updateRow(rowIdx, 'cpNumber', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-ink-900"
                      />
                    </td>
                    {/* Doc Submitted — blank cell, click to toggle like paper form */}
                    <td
                      className="border border-ink-800 cursor-pointer"
                      onClick={() => updateRow(rowIdx, 'docSubmitted', !row.docSubmitted)}
                    >
                      <div className="w-full h-full flex items-center justify-center min-h-[36px]">
                        {row.docSubmitted && (
                          <span className="text-ink-900 font-bold text-sm">✓</span>
                        )}
                      </div>
                    </td>
                    <td className="border border-ink-800">
                      <input
                        type="text"
                        value={row.edd}
                        onChange={(e) => updateRow(rowIdx, 'edd', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                      />
                    </td>
                    <td className="border border-ink-800">
                      <input
                        type="text"
                        value={row.obIndex}
                        onChange={(e) => updateRow(rowIdx, 'obIndex', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                      />
                    </td>

                    {/* Trimester cells: 1-7, gap, 8(1,2), gap, 9(1,2,3,4), gap, +(2) */}
                    {row.trimester.slice(0, 7).map((marked, colIdx) => (
                      <td key={colIdx} className="border border-ink-800 w-10 cursor-pointer" onClick={() => toggleTrimester(rowIdx, colIdx)}>
                        <div className="w-full h-full flex items-center justify-center min-h-[36px]">
                          {marked && <span className="text-ink-900 font-bold text-sm">✓</span>}
                        </div>
                      </td>
                    ))}
                    <td className="w-2"></td>
                    {row.trimester.slice(7, 9).map((marked, colIdx) => (
                      <td key={colIdx + 7} className="border border-ink-800 w-10 cursor-pointer" onClick={() => toggleTrimester(rowIdx, colIdx + 7)}>
                        <div className="w-full h-full flex items-center justify-center min-h-[36px]">
                          {marked && <span className="text-ink-900 font-bold text-sm">✓</span>}
                        </div>
                      </td>
                    ))}
                    <td className="w-2"></td>
                    {row.trimester.slice(9, 13).map((marked, colIdx) => (
                      <td key={colIdx + 9} className="border border-ink-800 w-10 cursor-pointer" onClick={() => toggleTrimester(rowIdx, colIdx + 9)}>
                        <div className="w-full h-full flex items-center justify-center min-h-[36px]">
                          {marked && <span className="text-ink-900 font-bold text-sm">✓</span>}
                        </div>
                      </td>
                    ))}
                    <td className="w-2"></td>
                    {row.trimester.slice(13, 15).map((marked, colIdx) => (
                      <td key={colIdx + 13} className="border border-ink-800 w-10 cursor-pointer" onClick={() => toggleTrimester(rowIdx, colIdx + 13)}>
                        <div className="w-full h-full flex items-center justify-center min-h-[36px]">
                          {marked && <span className="text-ink-900 font-bold text-sm">✓</span>}
                        </div>
                      </td>
                    ))}

                    <td className="border border-ink-800">
                      <input
                        type="text"
                        value={row.deliveryDate}
                        onChange={(e) => updateRow(rowIdx, 'deliveryDate', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-center text-ink-900"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex justify-end mt-6 text-sm text-ink-600">
            <span>Page __ of __</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

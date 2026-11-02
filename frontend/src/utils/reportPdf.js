// Draws the clinic report as a proper A4 document (vector text, real tables,
// page numbers) instead of screenshotting the web page. The same layout feeds
// both the PDF and the PNG download, so they always match.

const PW = 595.28;
const PH = 841.89;
const M = 42;
const CW = PW - M * 2;
const FOOT = 52;
const CONT_TOP = 58;

const C = {
  t800: '#045860', t700: '#077079', t600: '#0A8990', t500: '#0C9DA4', t100: '#BCEAED', t50: '#E6F7F8',
  ink900: '#0F1419', ink700: '#2D3748', ink600: '#4A5568', ink500: '#718096', ink400: '#A0AEC0',
  ink300: '#CBD5E0', ink200: '#E2E8F0', ink100: '#EDF2F7', ink50: '#F7FAFC',
  green: '#047857', greenBg: '#ECFDF5', red: '#B91C1C', redBg: '#FEF2F2', amber: '#B45309', amberBg: '#FFFBEB',
  white: '#FFFFFF'
};

const CLINIC = 'Jean Lying-in Maternity Clinic';
const ADDRESS = 'Tughan, Juban, Sorsogon';

// jsPDF's built-in fonts only cover Latin text; swap the few symbols we use.
function clean(v) {
  return String(v ?? '')
    .replace(/\u2192/g, ' to ')
    .replace(/[\u2191\u2193]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022]/g, '');
}

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const label = (l) => (l && String(l).toLowerCase() !== 'null' ? l : 'Not documented');

/* ── 1. Report content (what to say) ───────────────────────────────────────── */
export function buildReportModel(metrics, date, type) {
  const {
    totalPatients = 0, totalConsultations = 0, uniquePatients = 0, newPatients = 0, returningPatients = 0,
    topComplaints = [], topDiagnoses = [], peakHour, trend, followUpAlerts = [], pregnancy = null,
    admissions = null, monthly = false, monthYear
  } = metrics || {};

  const isMonthly = monthly || type === 'monthly';
  const headerDate = isMonthly && monthYear
    ? new Date(`${monthYear}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : fmtDate(date);
  const kind = isMonthly ? 'Monthly Census' : `${String(type || '').charAt(0).toUpperCase()}${String(type || '').slice(1)} Report`;
  const blocks = [];

  blocks.push({
    kind: 'stats', cols: 3,
    items: isMonthly
      ? [
          { label: 'Total Consultations', value: totalConsultations },
          { label: 'Unique Patients', value: uniquePatients },
          { label: 'Deliveries', value: pregnancy?.deliveries || 0 }
        ]
      : [
          { label: 'Total Consultations', value: totalPatients },
          { label: 'New Patients', value: newPatients },
          { label: 'Returning Patients', value: returningPatients }
        ]
  });

  if (trend) {
    const up = trend.change > 0;
    const down = trend.change < 0;
    blocks.push({
      kind: 'pill',
      tone: up ? 'green' : down ? 'red' : 'grey',
      text: `${up ? '+' : ''}${trend.change}% vs previous period  (${trend.prevTotal} to ${trend.currentTotal})`
    });
  }

  blocks.push({ kind: 'section', title: 'Patient Overview' });
  const total = isMonthly ? totalConsultations : totalPatients;
  const unit = isMonthly ? uniquePatients : totalPatients;
  if (total === 0) {
    blocks.push({ kind: 'note', text: `No patient consultations were recorded during this ${isMonthly ? 'month' : 'period'}.` });
  } else {
    blocks.push({
      kind: 'para',
      text: isMonthly
        ? `Total of ${total} consultation${total !== 1 ? 's' : ''} across ${uniquePatients} unique patient${uniquePatients !== 1 ? 's' : ''} this month.`
        : `Total of ${total} patient consultation${total !== 1 ? 's' : ''} recorded.`
    });
    if (newPatients > 0 && unit > 0) {
      blocks.push({ kind: 'para', color: 'ink600', text: `Patient mix: ${newPatients} new (${Math.round((newPatients / unit) * 100)}%), ${returningPatients} returning.` });
    }
  }

  if (trend) {
    blocks.push({ kind: 'section', title: 'Trend Analysis' });
    blocks.push({
      kind: 'callout', tone: 'teal',
      lines: [trend.change === 0
        ? `Patient volume held steady at ${totalPatients} consultation${totalPatients !== 1 ? 's' : ''}, matching the previous period.`
        : `Consultation volume ${trend.change > 0 ? 'increased' : 'decreased'} ${Math.abs(trend.change)}% compared to the previous period (${trend.prevTotal} to ${trend.currentTotal} consultations). ${
            trend.change > 30 ? 'This indicates strong patient traffic growth.'
              : trend.change > 0 ? 'This indicates growing patient traffic.'
              : trend.change < -30 ? 'Consider reviewing outreach or scheduling capacity.'
              : 'A slight dip worth monitoring.'}`]
    });
  }

  blocks.push({ kind: 'section', title: 'Clinical Summary' });
  if (topComplaints.length) {
    blocks.push({
      kind: 'table', headers: ['#', 'Chief Complaint', 'Cases'], widths: [0.1, 0.72, 0.18], align: ['center', 'left', 'center'],
      rows: topComplaints.slice(0, 5).map(([l, n], i) => [i + 1, label(l), n])
    });
  } else {
    blocks.push({ kind: 'note', text: 'No chief complaints were documented.' });
  }
  if (topDiagnoses.length) {
    blocks.push({ kind: 'subhead', text: 'Top Diagnoses' });
    blocks.push({
      kind: 'table', headers: ['#', 'Diagnosis', 'Cases'], widths: [0.1, 0.72, 0.18], align: ['center', 'left', 'center'],
      rows: topDiagnoses.slice(0, 5).map(([l, n], i) => [i + 1, label(l), n])
    });
  }

  blocks.push({ kind: 'section', title: 'Operational Notes' });
  if (peakHour) {
    const h = peakHour.hour;
    const t = (x) => `${x % 12 || 12}:00 ${x % 24 >= 12 ? 'PM' : 'AM'}`;
    blocks.push({
      kind: 'callout', tone: 'amber',
      lines: [
        { text: `Peak hours: ${t(h)} to ${t(h + 2)}  (${peakHour.count} visits)`, bold: true },
        h < 12 ? 'Morning shifts may need extra staffing.' : 'Afternoon and evening traffic is heaviest.'
      ]
    });
  } else {
    blocks.push({ kind: 'note', text: 'No peak-hour data available.' });
  }

  if (pregnancy) {
    blocks.push({ kind: 'section', title: 'Pregnancy Tracking' });
    blocks.push({
      kind: 'stats', cols: 3,
      items: [
        { label: 'New Records', value: pregnancy.newRecords },
        { label: 'Active Pregnancies', value: pregnancy.activeTotal },
        isMonthly
          ? { label: 'Deliveries', value: pregnancy.deliveries || 0 }
          : { label: 'Upcoming EDDs (30d)', value: pregnancy.upcomingEDDs?.length || 0 }
      ]
    });
    if (pregnancy.activeTotal > 0) {
      blocks.push({ kind: 'subhead', text: 'By Trimester' });
      blocks.push({
        kind: 'stats', cols: 3, small: true,
        items: [
          { label: '1st Trimester', value: pregnancy.byTrimester?.[1] || 0 },
          { label: '2nd Trimester', value: pregnancy.byTrimester?.[2] || 0 },
          { label: '3rd Trimester', value: pregnancy.byTrimester?.[3] || 0 }
        ]
      });
      const statuses = Object.entries(pregnancy.byStatus || {});
      if (statuses.length) {
        blocks.push({ kind: 'subhead', text: 'By Status' });
        blocks.push({
          kind: 'stats', cols: Math.min(4, statuses.length), small: true,
          items: statuses.map(([s, n]) => ({ label: s.charAt(0).toUpperCase() + s.slice(1), value: n }))
        });
      }
    } else {
      blocks.push({ kind: 'note', text: 'No active pregnancy records during this period.' });
    }
    if (pregnancy.upcomingEDDs?.length) {
      blocks.push({ kind: 'subhead', text: 'Upcoming Expected Dates of Delivery' });
      blocks.push({
        kind: 'table', headers: ['Patient #', 'EDD', 'Weeks', 'Trimester'], widths: [0.2, 0.4, 0.2, 0.2], align: ['left', 'left', 'center', 'center'],
        rows: pregnancy.upcomingEDDs.slice(0, 10).map((e) => [e.patient_id, fmtDate(e.edd), e.weeks ? `${e.weeks} wks` : '-', e.trimester ? `T${e.trimester}` : '-'])
      });
    }
  }

  if (admissions) {
    blocks.push({ kind: 'section', title: 'Admission and Discharge' });
    blocks.push({
      kind: 'stats', cols: 4, small: true,
      items: [
        { label: 'Admissions', value: admissions.admissions },
        { label: 'Deliveries', value: admissions.deliveries },
        { label: 'Live births', value: admissions.liveBirths },
        { label: 'Stillbirths', value: admissions.stillbirths },
        { label: 'Discharges', value: admissions.discharges },
        { label: 'Referrals', value: admissions.referrals },
        { label: 'Newborn screenings', value: admissions.newbornScreenings },
        { label: 'Average stay', value: admissions.averageStayHours == null ? '-' : `${admissions.averageStayHours} h` }
      ]
    });
    if ((admissions.topItems || []).length) {
      blocks.push({ kind: 'subhead', text: 'Items Used During Stays' });
      blocks.push({
        kind: 'table', headers: ['Item', 'Unit', 'Quantity used'], widths: [0.6, 0.2, 0.2], align: ['left', 'left', 'center'],
        rows: admissions.topItems.map((it) => [it.label, it.unit || '-', it.quantity])
      });
    }
  }

  if (followUpAlerts.length) {
    blocks.push({ kind: 'section', title: 'Follow-up Alerts' });
    blocks.push({
      kind: 'callout', tone: 'red',
      lines: followUpAlerts.map((a) => ({ text: `Patient #${a.patient_id}: ${a.instruction}` }))
    });
  }

  return { kind, headerDate, blocks };
}

/* ── 2. Layout (where it goes) ─────────────────────────────────────────────── */
function makeMeasure(doc) {
  return (str, size, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.getTextWidth(str);
  };
}

function wrap(width, text, size, bold, maxW) {
  const out = [];
  for (const para of clean(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (width(t, size, bold) <= maxW) { line = t; continue; }
      if (line) out.push(line);
      if (width(w, size, bold) > maxW) {
        let chunk = '';
        for (const ch of w) {
          if (width(chunk + ch, size, bold) > maxW) { out.push(chunk); chunk = ch; } else chunk += ch;
        }
        line = chunk;
      } else line = w;
    }
    out.push(line);
  }
  return out;
}

export function layoutReport(model, width) {
  const pages = [[]];
  let y = 0;
  const op = (o) => pages[pages.length - 1].push(o);
  const rect = (x, yy, w, h, o = {}) => op({ t: 'rect', x, y: yy, w, h, ...o });
  const text = (s, x, yy, o = {}) => op({ t: 'text', s: clean(s), x, y: yy, size: 9.5, color: C.ink700, ...o });
  const line = (x1, y1, x2, y2, color = C.ink200, lw = 0.75) => op({ t: 'line', x1, y1, x2, y2, color, lw });

  const runningHeader = () => {
    text(CLINIC, M, 30, { size: 8, bold: true, color: C.t700 });
    text(`${model.kind}  |  ${model.headerDate}`, PW - M, 30, { size: 8, color: C.ink500, align: 'right' });
    line(M, 38, PW - M, 38, C.ink200);
    y = CONT_TOP;
  };
  const newPage = () => { pages.push([]); runningHeader(); };
  const ensure = (h) => { if (y + h > PH - FOOT) newPage(); };

  // Cover header band
  rect(0, 0, PW, 98, { fill: C.t800 });
  rect(0, 98, PW, 4, { fill: C.t500 });
  text(CLINIC, M, 46, { size: 20, bold: true, color: C.white });
  text(ADDRESS, M, 65, { size: 10, color: C.t100 });
  text(model.kind.toUpperCase(), PW - M, 40, { size: 8.5, bold: true, color: C.t100, align: 'right' });
  text(model.headerDate, PW - M, 62, { size: 16, bold: true, color: C.white, align: 'right' });
  y = 126;

  const tones = {
    green: [C.greenBg, C.green], red: [C.redBg, C.red], grey: [C.ink100, C.ink600],
    teal: [C.t50, C.t600], amber: [C.amberBg, '#D97706']
  };

  for (const b of model.blocks) {
    if (b.kind === 'stats') {
      const gap = 10;
      const n = b.cols;
      const cw = (CW - gap * (n - 1)) / n;
      const h = b.small ? 48 : 64;
      for (let i = 0; i < b.items.length; i += n) {
        ensure(h + gap);
        b.items.slice(i, i + n).forEach((it, k) => {
          const x = M + k * (cw + gap);
          rect(x, y, cw, h, { fill: C.ink50, stroke: C.ink200, lw: 0.75, r: 6 });
          rect(x, y + 8, 3, h - 16, { fill: C.t600 });
          text(String(it.value ?? 0), x + cw / 2, y + (b.small ? 24 : 32), { size: b.small ? 16 : 24, bold: true, color: C.t800, align: 'center' });
          text(it.label, x + cw / 2, y + h - (b.small ? 9 : 13), { size: b.small ? 7.5 : 8.5, color: C.ink600, align: 'center' });
        });
        y += h + gap;
      }
      y += 4;
    } else if (b.kind === 'pill') {
      const [bg, fg] = tones[b.tone];
      const s = clean(b.text);
      const w = width(s, 8.5, true) + 24;
      ensure(30);
      rect(M, y, w, 20, { fill: bg, r: 10 });
      text(s, M + 12, y + 13.5, { size: 8.5, bold: true, color: fg });
      y += 34;
    } else if (b.kind === 'section') {
      ensure(70);
      y += 12;
      rect(M, y, 3.5, 14, { fill: C.t600 });
      const title = clean(b.title).toUpperCase();
      text(title, M + 11, y + 11, { size: 10.5, bold: true, color: C.ink900 });
      const tw = width(title, 10.5, true);
      line(M + 11 + tw + 10, y + 7, PW - M, y + 7, C.ink200);
      y += 14 + 12;
    } else if (b.kind === 'subhead') {
      ensure(40);
      y += 6;
      text(clean(b.text).toUpperCase(), M, y + 8, { size: 7.5, bold: true, color: C.ink500 });
      y += 16;
    } else if (b.kind === 'para' || b.kind === 'note') {
      const lines = wrap(width, b.text, 9.5, false, CW);
      lines.forEach((l) => {
        ensure(15);
        text(l, M, y + 10, { size: 9.5, color: b.kind === 'note' ? C.ink500 : C[b.color] || C.ink700 });
        y += 15;
      });
      y += 4;
    } else if (b.kind === 'callout') {
      const [bg, accent] = tones[b.tone];
      const pad = 10;
      const items = b.lines.map((l) => (typeof l === 'string' ? { text: l } : l));
      const wrapped = items.map((it) => ({ ...it, rows: wrap(width, it.text, 9.5, !!it.bold, CW - pad * 2 - 6) }));
      const h = pad * 2 + wrapped.reduce((s, it) => s + it.rows.length * 13.5 + 3, 0) - 3;
      ensure(Math.min(h, 120) + 10);
      rect(M, y, CW, h, { fill: bg, r: 4 });
      rect(M, y, 3.5, h, { fill: accent });
      let ty = y + pad + 9;
      wrapped.forEach((it) => {
        it.rows.forEach((r) => { text(r, M + pad + 6, ty, { size: 9.5, bold: !!it.bold, color: C.ink700 }); ty += 13.5; });
        ty += 3;
      });
      y += h + 14;
    } else if (b.kind === 'table') {
      const xs = [];
      let acc = M;
      b.widths.forEach((f) => { xs.push(acc); acc += f * CW; });
      const colW = b.widths.map((f) => f * CW);
      const padX = 8;
      const header = () => {
        rect(M, y, CW, 22, { fill: C.t50 });
        line(M, y + 22, PW - M, y + 22, C.t100, 1);
        b.headers.forEach((h, i) => {
          const al = b.align[i];
          const x = al === 'center' ? xs[i] + colW[i] / 2 : al === 'right' ? xs[i] + colW[i] - padX : xs[i] + padX;
          text(clean(h).toUpperCase(), x, y + 14.5, { size: 7.5, bold: true, color: C.t800, align: al });
        });
        y += 22;
      };
      const rowsWrapped = b.rows.map((r) => r.map((c, i) => wrap(width, String(c ?? ''), 9, false, colW[i] - padX * 2)));
      const rowH = (cells) => Math.max(...cells.map((c) => c.length)) * 12 + 14;
      ensure(22 + rowH(rowsWrapped[0]) + 4);
      header();
      rowsWrapped.forEach((cells, ri) => {
        const h = rowH(cells);
        if (y + h > PH - FOOT) { newPage(); header(); }
        if (ri % 2 === 1) rect(M, y, CW, h, { fill: C.ink50 });
        cells.forEach((lines, i) => {
          const al = b.align[i];
          const x = al === 'center' ? xs[i] + colW[i] / 2 : al === 'right' ? xs[i] + colW[i] - padX : xs[i] + padX;
          lines.forEach((l, li) => text(l, x, y + 16 + li * 12, { size: 9, color: C.ink700, align: al }));
        });
        line(M, y + h, PW - M, y + h, C.ink100);
        y += h;
      });
      line(M, y, PW - M, y, C.ink300, 1);
      y += 16;
    }
  }

  // Footer on every page
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  pages.forEach((p, i) => {
    const fy = PH - 34;
    p.push({ t: 'line', x1: M, y1: fy - 12, x2: PW - M, y2: fy - 12, color: C.ink200, lw: 0.75 });
    p.push({ t: 'text', s: `${CLINIC}  |  Generated ${generated}`, x: M, y: fy, size: 7.5, color: C.ink500 });
    p.push({ t: 'text', s: `Page ${i + 1} of ${pages.length}`, x: PW - M, y: fy, size: 7.5, bold: true, color: C.ink600, align: 'right' });
    p.push({ t: 'text', s: 'This report should be reviewed by a licensed healthcare professional.', x: M, y: fy + 11, size: 7, color: C.ink400 });
  });
  return pages;
}

/* ── 3. Renderers ──────────────────────────────────────────────────────────── */
function renderPdf(JsPDF, pages, title) {
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  doc.setProperties({ title, author: CLINIC, subject: 'Clinic report' });
  pages.forEach((ops, i) => {
    if (i > 0) doc.addPage();
    ops.forEach((o) => {
      if (o.t === 'rect') {
        if (o.fill) doc.setFillColor(o.fill);
        if (o.stroke) { doc.setDrawColor(o.stroke); doc.setLineWidth(o.lw || 0.75); }
        const style = o.fill && o.stroke ? 'FD' : o.fill ? 'F' : 'S';
        if (o.r) doc.roundedRect(o.x, o.y, o.w, o.h, o.r, o.r, style);
        else doc.rect(o.x, o.y, o.w, o.h, style);
      } else if (o.t === 'line') {
        doc.setDrawColor(o.color);
        doc.setLineWidth(o.lw || 0.75);
        doc.line(o.x1, o.y1, o.x2, o.y2);
      } else if (o.t === 'text') {
        doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
        doc.setFontSize(o.size);
        doc.setTextColor(o.color);
        doc.text(o.s, o.x, o.y, { align: o.align || 'left' });
      }
    });
  });
  return doc;
}

function renderCanvas(pages) {
  const gap = 20;
  const totalH = PH * pages.length + gap * (pages.length + 1);
  const totalW = PW + gap * 2;
  const scale = Math.min(2.5, 15000 / totalH);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalW * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#E8ECF0';
  ctx.fillRect(0, 0, totalW, totalH);

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  pages.forEach((ops, i) => {
    ctx.save();
    ctx.translate(gap, gap + i * (PH + gap));
    ctx.shadowColor = 'rgba(15,20,25,0.18)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PW, PH);
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.rect(0, 0, PW, PH);
    ctx.clip();
    ops.forEach((o) => {
      if (o.t === 'rect') {
        if (o.r) roundRect(o.x, o.y, o.w, o.h, o.r); else { ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); }
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 0.75; ctx.stroke(); }
      } else if (o.t === 'line') {
        ctx.beginPath();
        ctx.moveTo(o.x1, o.y1);
        ctx.lineTo(o.x2, o.y2);
        ctx.strokeStyle = o.color;
        ctx.lineWidth = o.lw || 0.75;
        ctx.stroke();
      } else if (o.t === 'text') {
        ctx.font = `${o.bold ? 700 : 400} ${o.size}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = o.color;
        ctx.textAlign = o.align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(o.s, o.x, o.y);
      }
    });
    ctx.restore();
  });
  return canvas;
}

/* ── 4. Public API ─────────────────────────────────────────────────────────── */
async function prepare(metrics, date, type) {
  const { jsPDF } = await import('jspdf');
  const measureDoc = new jsPDF({ unit: 'pt', format: 'a4' });
  const model = buildReportModel(metrics, date, type);
  const pages = layoutReport(model, makeMeasure(measureDoc));
  return { jsPDF, model, pages };
}

export async function downloadReportPdf(metrics, date, type) {
  const { jsPDF, model, pages } = await prepare(metrics, date, type);
  renderPdf(jsPDF, pages, `${model.kind} - ${model.headerDate}`).save(`Clinic-Report-${date}-${type}.pdf`);
}

export async function downloadReportImage(metrics, date, type) {
  const { pages } = await prepare(metrics, date, type);
  const canvas = renderCanvas(pages);
  await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Clinic-Report-${date}-${type}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}

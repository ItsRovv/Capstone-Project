import { useState, useRef, useEffect } from 'react';
import { Input, Textarea } from './UI/Input';
import { Button } from './UI/Button';
import { useToast } from './UI/Toast';

function AutoTextarea({ value, onChange, placeholder, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={`input-base resize-none w-full text-sm overflow-hidden ${className}`}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={1}
    />
  );
}

export function ConsultationForm({
  patientId,
  initial,
  submitting,
  onCancel,
  onSubmit,
  pregnancyContext
}) {
  const toast = useToast();
  const [bulletModes, setBulletModes] = useState({ assessment: 'paragraph', plan: 'paragraph' });
  const [structured, setStructured] = useState({
    chiefComplaint: initial?.chief_complaint || '',
    subjective: initial?.subjective || '',
    objective: initial?.objective || '',
    assessment: initial?.assessment || '',
    plan: initial?.plan || '',
    diagnosis: initial?.diagnosis || '',
    prescription: initial?.prescription || '',
    followUp: initial?.followUp || ''
  });

  const update = (k) => (e) => setStructured((s) => ({ ...s, [k]: e.target.value }));

  // Convert paragraph text to numbered bullet form
  function toBullets(text) {
    if (!text) return '';
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => `${i + 1}. ${line.replace(/^\d+\.\s*/, '')}`)
      .join('\n');
  }

  // Strip bullet numbers back to plain text
  function toParagraph(text) {
    if (!text) return '';
    return text
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .join('\n');
  }

  // Toggle a field between paragraph and bullet modes
  function toggleBulletMode(field) {
    setBulletModes((prev) => {
      const currentMode = prev[field] || 'paragraph';
      const newMode = currentMode === 'paragraph' ? 'bullet' : 'paragraph';
      if (newMode === 'bullet') {
        setStructured((s) => ({ ...s, [field]: toBullets(s[field]) }));
      } else {
        setStructured((s) => ({ ...s, [field]: toParagraph(s[field]) }));
      }
      return { ...prev, [field]: newMode };
    });
  }

  // Handle input for a field that supports bullet mode
  function handleBulletChange(field, e) {
    const raw = e.target.value;
    const mode = bulletModes[field] || 'paragraph';
    if (mode === 'bullet') {
      const lines = raw.split('\n');
      let itemNum = 0;
      const numbered = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        itemNum++;
        return `${itemNum}. ${trimmed.replace(/^\d+\.\s*/, '')}`;
      });
      setStructured((s) => ({ ...s, [field]: numbered.join('\n') }));
    } else {
      setStructured((s) => ({ ...s, [field]: raw }));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!patientId && !initial?.id) {
      toast.error('Missing patient');
      return;
    }
    const payload = {
      ...(patientId ? { patient_id: patientId } : {}),
      structured_notes: Object.values(structured).filter(Boolean).join('\n\n') || null,
      chief_complaint: structured.chiefComplaint || null,
      subjective: structured.subjective || null,
      objective: structured.objective || null,
      assessment: structured.assessment || null,
      plan: structured.plan || null,
      diagnosis: structured.diagnosis || null,
      prescription: structured.prescription || null,
      ai_summary_used: false
    };
    onSubmit(payload);
  }

  // Build pregnancy context hint for the doctor
  const contextHint = pregnancyContext
    ? [
        pregnancyContext.pregnancyNumber && `Pregnancy #${pregnancyContext.pregnancyNumber}`,
        pregnancyContext.obIndex && `OB: ${pregnancyContext.obIndex}`,
        pregnancyContext.aog && `AOG: ${pregnancyContext.aog}`,
        pregnancyContext.lmp && `LMP: ${pregnancyContext.lmp}`,
        pregnancyContext.bloodType && `Blood: ${pregnancyContext.bloodType}`
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Pregnancy context banner */}
      {contextHint && (
        <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3">
          <p className="text-[10px] font-bold text-primary-500 uppercase tracking-wider mb-0.5">Patient Context</p>
          <p className="text-sm font-semibold text-primary-800">
            {contextHint}
          </p>
        </div>
      )}

      <Input
        label="Chief complaint"
        value={structured.chiefComplaint}
        onChange={update('chiefComplaint')}
        placeholder="e.g. First prenatal visit, headache, fever"
      />

      {/* S.O.A.P. Notes — 2x2 grid for landscape */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-ink-200 p-3">
          <label className="block text-xs font-bold text-sky-700 uppercase tracking-wide mb-1.5">S — Subjective</label>
          <AutoTextarea
            value={structured.subjective}
            onChange={update('subjective')}
            placeholder="Patient-reported symptoms, concerns, history..."
            className="focus:border-sky-400 focus:ring-sky-200"
          />
        </div>
        <div className="rounded-lg border border-ink-200 p-3">
          <label className="block text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1.5">O — Objective</label>
          <AutoTextarea
            value={structured.objective}
            onChange={update('objective')}
            placeholder="Examination findings, vitals, observable signs..."
            className="focus:border-emerald-400 focus:ring-emerald-200"
          />
        </div>
        <div className="rounded-lg border border-ink-200 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-amber-700 uppercase tracking-wide">A — Assessment</label>
            <button
              type="button"
              onClick={() => toggleBulletMode('assessment')}
              className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                bulletModes.assessment === 'bullet'
                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                  : 'bg-ink-100 text-ink-500 border border-ink-200 hover:bg-ink-200'
              }`}
              title={bulletModes.assessment === 'bullet' ? 'Switch to paragraph' : 'Switch to numbered list'}
            >
              {bulletModes.assessment === 'bullet' ? '☰ Bullets' : '¶ Paragraph'}
            </button>
          </div>
          <AutoTextarea
            value={structured.assessment}
            onChange={(e) => handleBulletChange('assessment', e)}
            placeholder={
              bulletModes.assessment === 'bullet'
                ? "Type one assessment per line — numbered automatically:\nIntrauterine pregnancy, 3 weeks AOG\nMild nausea gravidarum\nMaternal undernutrition"
                : 'Clinical impression, differential diagnosis...'
            }
            className="focus:border-amber-400 focus:ring-amber-200"
          />
        </div>
        <div className="rounded-lg border border-ink-200 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-primary-700 uppercase tracking-wide">P — Plan</label>
            <button
              type="button"
              onClick={() => toggleBulletMode('plan')}
              className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                bulletModes.plan === 'bullet'
                  ? 'bg-primary-100 text-primary-700 border border-primary-300'
                  : 'bg-ink-100 text-ink-500 border border-ink-200 hover:bg-ink-200'
              }`}
              title={bulletModes.plan === 'bullet' ? 'Switch to paragraph' : 'Switch to numbered list'}
            >
              {bulletModes.plan === 'bullet' ? '☰ Bullets' : '¶ Paragraph'}
            </button>
          </div>
          <AutoTextarea
            value={structured.plan}
            onChange={(e) => handleBulletChange('plan', e)}
            placeholder={
              bulletModes.plan === 'bullet'
                ? "Type one plan item per line — numbered automatically:\nStart prenatal vitamins\nNutritional counseling\nFollow-up at 8 weeks AOG"
                : 'Treatment plan, interventions, patient education...'
            }
            className="focus:border-primary-400 focus:ring-primary-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Diagnosis"
          value={structured.diagnosis}
          onChange={update('diagnosis')}
          placeholder="Final diagnosis or clinical impression"
        />
        <Input
          label="Follow-up"
          value={structured.followUp}
          onChange={update('followUp')}
          placeholder="e.g. Return in 4 weeks (16 weeks AOG)"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink-700">Prescription</label>
        <AutoTextarea
          value={structured.prescription}
          onChange={update('prescription')}
          placeholder="1. Prenatal vitamins 1 tab OD&#10;2. Ferrous sulfate 325mg OD&#10;3. Calcium carbonate 500mg BID"
          className="focus:border-teal-400 focus:ring-teal-200"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          Save consultation
        </Button>
      </div>
    </form>
  );
}

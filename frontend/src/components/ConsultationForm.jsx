import { useState } from 'react';
import { Input, Textarea } from './UI/Input';
import { Button } from './UI/Button';
import { Spinner } from './UI/Spinner';
import { Icon } from './Icon';
import { aiService } from '../services/aiService';
import { apiError } from '../services/api';
import { useToast } from './UI/Toast';

const blankStructured = {
  chiefComplaint: '',
  findings: '',
  diagnosis: '',
  prescription: '',
  followUp: ''
};

export function ConsultationForm({
  patientId,
  initial,
  submitting,
  onCancel,
  onSubmit
}) {
  const toast = useToast();
  const [rawNotes, setRawNotes] = useState(initial?.raw_notes || '');
  const [structured, setStructured] = useState({
    chiefComplaint: initial?.chief_complaint || '',
    findings: initial?.findings || '',
    diagnosis: initial?.diagnosis || '',
    prescription: initial?.prescription || '',
    followUp: initial?.followUp || ''
  });
  const [summarizing, setSummarizing] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);

  const update = (k) => (e) => setStructured((s) => ({ ...s, [k]: e.target.value }));

  async function handleSummarize() {
    if (!rawNotes.trim()) {
      toast.error('Type some notes first');
      return;
    }
    setSummarizing(true);
    try {
      const result = await aiService.summarizeNote(rawNotes);
      setStructured({
        chiefComplaint: result.chiefComplaint || '',
        findings: result.findings || '',
        diagnosis: result.diagnosis || '',
        prescription: result.prescription || '',
        followUp: result.followUp || ''
      });
      setAiUsed(true);
      toast.success('AI summary ready — review before saving');
    } catch (err) {
      toast.error(apiError(err, 'AI summarization failed'));
    } finally {
      setSummarizing(false);
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
      raw_notes: rawNotes || null,
      structured_notes: Object.values(structured).filter(Boolean).join('\n\n') || null,
      chief_complaint: structured.chiefComplaint || null,
      diagnosis: structured.diagnosis || null,
      prescription: structured.prescription || null,
      ai_summary_used: aiUsed
    };
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-ink-700">Raw notes</label>
            <Button
              type="button"
              size="sm"
              onClick={handleSummarize}
              loading={summarizing}
              disabled={!rawNotes.trim()}
            >
              <Icon.Sparkle width={14} height={14} /> AI Summarize
            </Button>
          </div>
          <Textarea
            rows={14}
            placeholder="Type your consultation notes here… free-form. The AI will structure them for you."
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
            className="font-mono text-sm"
          />
          {summarizing && (
            <p className="text-xs text-ink-500 flex items-center gap-2">
              <Spinner size="sm" /> Gemini is structuring the notes…
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-ink-700">
              Structured record
            </label>
            {aiUsed && (
              <span className="text-xs text-primary-600 font-medium">
                ✨ AI-assisted
              </span>
            )}
          </div>
          <Input
            label="Chief complaint"
            value={structured.chiefComplaint}
            onChange={update('chiefComplaint')}
            placeholder="e.g. Headache, fever"
          />
          <Textarea
            label="Findings"
            rows={3}
            value={structured.findings}
            onChange={update('findings')}
            placeholder="Examination findings"
          />
          <Input
            label="Diagnosis"
            value={structured.diagnosis}
            onChange={update('diagnosis')}
          />
          <Textarea
            label="Prescription"
            rows={2}
            value={structured.prescription}
            onChange={update('prescription')}
            placeholder="Medications, dosage, frequency"
          />
          <Input
            label="Follow-up"
            value={structured.followUp}
            onChange={update('followUp')}
            placeholder="e.g. Return in 1 week if symptoms persist"
          />
        </div>
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

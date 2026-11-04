import { useEffect, useState } from 'react';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { Textarea } from '../UI/Input';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { queueService } from '../../services/queueService';
import { apiError } from '../../services/api';
import { formatDay } from '../../lib/admission';

// Marks a postpartum follow-up visit as done, with an optional short note.
export function FollowupDoneModal({ followup, patientName, onClose, onDone }) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNotes(''); }, [followup?.id]);

  async function submit() {
    setSaving(true);
    try {
      await admissionService.completeFollowup(followup.id, notes.trim() || null);
      try {
        const q = await queueService.add(followup.patient_id, 'postnatal');
        toast.success(`Follow-up recorded — queued for postnatal consultation #${String(q.queue_number).padStart(2, '0')}`);
      } catch {
        toast.success('Follow-up visit recorded (could not add to queue)');
      }
      onClose();
      onDone?.();
    } catch (err) {
      toast.error(apiError(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(followup)}
      onClose={onClose}
      size="sm"
      title="Follow-up visit done"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Mark as done</Button>
        </>
      }
    >
      {followup && (
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            {patientName ? <span className="font-medium">{patientName}</span> : 'This patient'} was due on {formatDay(followup.due_at)}.
          </p>
          <Textarea
            label="How is she and the baby doing? (optional)"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Example: Feeling well, baby feeding well, no fever."
          />
        </div>
      )}
    </Modal>
  );
}

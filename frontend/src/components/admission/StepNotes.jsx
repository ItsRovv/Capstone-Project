import { useCallback, useEffect, useState } from 'react';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Textarea } from '../UI/Input';
import { Spinner } from '../UI/Spinner';
import { useToast } from '../UI/Toast';
import { admissionService } from '../../services/admissionService';
import { apiError } from '../../services/api';
import { formatDay } from '../../lib/admission';

// Same ink colours as the paper sheet: blue morning, black afternoon, red evening.
const SHIFT_STYLE = {
  morning: { text: 'text-blue-700', label: 'Morning shift (8 AM - 4 PM)' },
  afternoon: { text: 'text-ink-900', label: 'Afternoon shift (4 PM - 12 AM)' },
  evening: { text: 'text-red-700', label: 'Evening shift (12 AM - 8 AM)' }
};

const timeOf = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function StepNotes({ admission, canEdit, isAdmin, userName }) {
  const toast = useToast();
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setNotes(await admissionService.notes(admission.id));
    } catch (err) {
      toast.error(apiError(err, "Could not load the midwives' notes"));
      setNotes([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await admissionService.addNote(admission.id, text.trim());
      setText('');
      toast.success('Note saved');
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save the note'));
    } finally {
      setSaving(false);
    }
  }

  async function saveCorrection() {
    if (!editing?.description.trim()) return;
    setSaving(true);
    try {
      await admissionService.correctNote(admission.id, editing.id, editing.description.trim());
      setEditing(null);
      toast.success('Note corrected');
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Could not correct the note'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="text-base sm:text-lg font-semibold text-ink-900">Midwives' Notes</h3>
      <p className="text-sm text-ink-500 mb-4">
        The date, time and your initials are added automatically{userName ? ` (signed in as ${userName})` : ''}. A saved note is locked.
      </p>

      {canEdit && (
        <div className="mb-5 space-y-3">
          <Textarea
            label="New note"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What was observed or done, for example: Contractions every 4 minutes, FHT 140 bpm."
          />
          <div className="flex justify-end">
            <Button onClick={add} loading={saving && !editing} disabled={!text.trim()}>Add note</Button>
          </div>
        </div>
      )}

      {!notes ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-ink-500 py-4 text-center">No notes yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Time</th>
                <th className="text-left px-3 py-2.5 font-semibold">Description</th>
                <th className="text-left px-3 py-2.5 font-semibold">Initials</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {notes.map((n) => {
                const shift = SHIFT_STYLE[n.shift] || SHIFT_STYLE.afternoon;
                return (
                  <tr key={n.id} className={shift.text} title={shift.label}>
                    <td className="px-3 py-2.5 whitespace-nowrap align-top">{formatDay(n.noted_at)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap align-top">{timeOf(n.noted_at)}</td>
                    <td className="px-3 py-2.5 align-top whitespace-pre-line break-words">
                      {editing?.id === n.id ? (
                        <div className="space-y-2">
                          <Textarea rows={3} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                            <Button size="sm" onClick={saveCorrection} loading={saving}>Save correction</Button>
                          </div>
                        </div>
                      ) : n.description}
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap font-semibold" title={n.author_name || ''}>
                      {n.initials || '—'}
                      {isAdmin && editing?.id !== n.id && (
                        <button type="button" className="ml-2 text-xs font-medium text-primary-700 hover:underline" onClick={() => setEditing({ id: n.id, description: n.description })}>
                          Correct
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-500 mt-3">Colours follow the paper sheet: blue morning, black afternoon, red evening.</p>
    </Card>
  );
}

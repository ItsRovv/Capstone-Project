import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from './UI/Card';
import { Button } from './UI/Button';
import { Modal } from './UI/Modal';
import { Icon } from './Icon';
import { useToast } from './UI/Toast';
import { patientService } from '../services/patientService';
import { apiError } from '../services/api';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

// Images grouped per pregnancy — a completed pregnancy's results stay archived
// under it while the current pregnancy shows a clean grid.
function groupImagesByPregnancy(images, pregnancies) {
  const sorted = [...(pregnancies || [])]
    .map((p) => ({ ...p, _start: new Date(p.first_visit_date || p.created_at || 0).getTime() }))
    .sort((a, b) => a._start - b._start);
  const groups = sorted.map((p, i) => ({
    pregnancy: p,
    start: p._start,
    end: i + 1 < sorted.length ? sorted[i + 1]._start : Infinity,
    images: []
  }));
  const other = { pregnancy: null, images: [] };
  for (const img of images) {
    // Prefer the explicit tag; fall back to the upload date's pregnancy window
    // for images uploaded before tagging existed.
    let g = img.pregnancy_id
      ? groups.find((g) => Number(g.pregnancy.id) === Number(img.pregnancy_id))
      : groups.find((g) => {
          const t = new Date(img.created_at || 0).getTime();
          return t >= g.start && t < g.end;
        });
    (g || other).images.push(img);
  }
  return [
    ...groups.filter((g) => g.images.length > 0).reverse(),
    ...(other.images.length ? [other] : [])
  ];
}

// An image under a completed/delivered pregnancy is archived — read-only.
function imageLocked(img, pregnancies) {
  if (!img?.pregnancy_id) return false;
  const preg = (pregnancies || []).find((p) => Number(p.id) === Number(img.pregnancy_id));
  return ['delivered', 'discharged', 'completed'].includes(String(preg?.status || '').toLowerCase());
}

/**
 * Patient result images (ultrasound, lab printouts) on the Overview tab —
 * upload with a name, click a thumbnail to view the full image.
 */
export function PatientImagesCard({ patientId, canDelete, pregnancies = [] }) {
  const toast = useToast();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [pending, setPending] = useState(null); // { file, dataUrl } awaiting a label
  const [label, setLabel] = useState('');
  const fileRef = useRef(null);

  const groups = groupImagesByPregnancy(images, pregnancies);
  const [openGroups, setOpenGroups] = useState(() => {
    const idx = groups.findIndex((g) => (g.pregnancy?.status || '').toLowerCase() === 'ongoing');
    return idx >= 0 ? { [idx]: true } : { 0: true };
  });
  // Re-open the current pregnancy group once data loads.
  useEffect(() => {
    const idx = groups.findIndex((g) => (g.pregnancy?.status || '').toLowerCase() === 'ongoing');
    setOpenGroups(idx >= 0 ? { [idx]: true } : (groups.length ? { 0: true } : {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const load = useCallback(async () => {
    try {
      setImages(await patientService.listImages(patientId));
    } catch (err) {
      toast.error(apiError(err, 'Could not load images'));
    } finally {
      setLoading(false);
    }
  }, [patientId, toast]);

  useEffect(() => { load(); }, [load]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readAsDataUrl(file);
      setPending({ dataUrl });
      setLabel(file.name.replace(/\.[^.]+$/, '') || 'Result image');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function confirmUpload() {
    if (!pending || !label.trim()) return;
    setUploading(true);
    try {
      await patientService.uploadImage(patientId, label.trim(), pending.dataUrl);
      toast.success('Image uploaded');
      setPending(null);
      setLabel('');
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(img) {
    if (!window.confirm(`Delete "${img.label}"?`)) return;
    try {
      await patientService.deleteImage(img.id);
      toast.success('Image deleted');
      setViewing(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, 'Delete failed'));
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold text-ink-900">Result Images</p>
          <p className="text-xs text-ink-500">Ultrasound &amp; laboratory result photos</p>
        </div>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          <Icon.Plus width={14} height={14} /> Upload image
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onPick}
        />
      </div>

      {loading ? (
        <p className="text-sm text-ink-500 py-4 text-center">Loading…</p>
      ) : images.length === 0 ? (
        <p className="text-sm text-ink-400 py-6 text-center border border-dashed border-ink-200 rounded-lg">
          No result images yet — upload a photo of the ultrasound or lab result
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((g, gi) => {
            const p = g.pregnancy;
            const isOngoing = (p?.status || '').toLowerCase() === 'ongoing';
            const title = p
              ? `Pregnancy ${p.pregnancy_number ? `#${p.pregnancy_number}` : ''} · ${p.status || 'record'}`
              : 'Other uploads';
            return (
              <div key={gi} className="rounded-lg border border-ink-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenGroups((o) => ({ ...o, [gi]: !o[gi] }))}
                  className="w-full flex items-center justify-between px-3 py-2 bg-ink-50/60 hover:bg-ink-100/60 transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-ink-800">
                    <span className={`transition-transform ${openGroups[gi] ? 'rotate-90' : ''}`}>▸</span>
                    {title}
                    {isOngoing && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-ink-400">{g.images.length} image{g.images.length !== 1 ? 's' : ''}</span>
                </button>
                {openGroups[gi] && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3">
                    {g.images.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setViewing(img)}
                        className="group text-left rounded-lg border border-ink-200 overflow-hidden hover:border-primary-400 hover:shadow-sm transition"
                      >
                        <div className="aspect-[4/3] bg-ink-50 overflow-hidden">
                          <img
                            src={patientService.imageUrl(img.id)}
                            alt={img.label}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                          />
                        </div>
                        <div className="px-2 py-1.5">
                          <p className="text-xs font-medium text-ink-800 truncate">{img.label}</p>
                          <p className="text-[10px] text-ink-400">{formatDate(img.created_at)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Name-the-image dialog after picking a file */}
      <Modal open={!!pending} onClose={() => !uploading && setPending(null)} title="Name this image" size="sm">
        {pending && (
          <div className="space-y-3">
            <img src={pending.dataUrl} alt="Preview" className="w-full max-h-56 object-contain rounded-lg bg-ink-50" />
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "Pelvic ultrasound"'
              className="input-base"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={uploading}>Cancel</Button>
              <Button onClick={confirmUpload} loading={uploading} disabled={!label.trim()}>Upload</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Full-size viewer */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.label || 'Result image'} size="xl">
        {viewing && (
          <div className="space-y-3">
            <img
              src={patientService.imageUrl(viewing.id)}
              alt={viewing.label}
              className="w-full max-h-[70vh] object-contain rounded-lg bg-ink-50"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-500">Uploaded {formatDate(viewing.created_at)}</p>
              {canDelete && !imageLocked(viewing, pregnancies) && (
                <Button variant="secondary" onClick={() => onDelete(viewing)}>Delete</Button>
              )}
              {imageLocked(viewing, pregnancies) && (
                <p className="text-[11px] text-ink-400 italic">Archived — belongs to a completed pregnancy</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

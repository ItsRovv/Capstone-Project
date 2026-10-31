import { useState, useEffect } from 'react';
import { useToast } from '../components/UI/Toast';
import { Button } from '../components/UI/Button';
import { Input, Select } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { RoleBadge } from '../components/UI/Badge';
import { Spinner } from '../components/UI/Spinner';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import api, { apiError } from '../services/api';

const EMPTY_FORM = { name: '', username: '', email: '', password: '', role: 'staff' };

const ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'midwife', label: 'Admission Midwife' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'admin', label: 'Administrator' }
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function ManageUsers() {
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create-user modal (reuses /auth/register with admin token sent automatically)
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null); // user object
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  // ── Create ──────────────────────────────────────────────────────────────────
  const updateCreate = (k) => (e) => setCreateForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/auth/register', createForm);
      toast.success(
        `User "${createForm.name}" created. They can now sign in with their password.`
      );
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      fetchUsers();
    } catch (err) {
      toast.error(apiError(err, 'Failed to create user'));
    } finally {
      setCreating(false);
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function openEdit(user) {
    setEditTarget(user);
    setEditForm({ name: user.name, username: user.username || '', email: user.email, role: user.role, password: '' });
  }

  const updateEdit = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }));

  // Inline role change directly from the table
  async function handleInlineRoleChange(user, newRole) {
    if (newRole === user.role) return;
    try {
      const { data } = await api.put(`/auth/users/${user.id}`, {
        name: user.name,
        username: user.username || null,
        email: user.email,
        role: newRole
      });
      toast.success(`${user.name}'s role updated to ${newRole}`);
      fetchUsers();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update role'));
    }
  }

  async function handleEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: editForm.name, email: editForm.email, role: editForm.role, username: editForm.username || null };
      if (editForm.password) payload.password = editForm.password;
      const { data } = await api.put(`/auth/users/${editTarget.id}`, payload);
      toast.success(data.message || 'User updated');
      setEditTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update user'));
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/auth/users/${deleteTarget.id}`);
      toast.success(`User "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete user'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 md:px-8 pt-4 md:pt-8 pb-4 md:pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-display font-bold text-ink-900 leading-tight">Manage Users</h1>
            <p className="text-ink-500 text-xs sm:text-sm mt-0.5 sm:mt-1">Create and manage staff accounts.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="flex-shrink-0" aria-label="Add user">
            <Icon.Plus width={16} height={16} /> <span className="hidden sm:inline">Add User</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
        <div className="px-4 md:px-8">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : (
            <div className="card overflow-x-auto p-0">
          <table className="w-full text-base">
            <thead>
              <tr className="bg-ink-50 border-b border-ink-100 text-ink-600 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Username</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Email</th>
                <th className="px-3 sm:px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Date Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                    No users found.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink-50 hover:bg-ink-50/50 transition-colors">
                  <td className="px-3 sm:px-4 py-3 font-medium text-ink-900">
                    <div className="flex items-center gap-2">
                      <span className="break-words">{u.name}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] text-primary-600 font-bold bg-primary-50 px-1.5 py-0.5 rounded flex-shrink-0">You</span>
                      )}
                    </div>
                    <div className="md:hidden text-xs font-normal text-ink-500 mt-0.5 space-y-0.5">
                      {u.username && <p>@{u.username}</p>}
                      <p className="break-all">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-600 hidden md:table-cell">
                    {u.username ? (
                      <span className="font-mono text-xs bg-ink-50 px-2 py-0.5 rounded">@{u.username}</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600 hidden md:table-cell">{u.email}</td>
                  <td className="px-3 sm:px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleInlineRoleChange(u, e.target.value)}
                      disabled={u.id === currentUser?.id}
                      className="text-xs font-semibold rounded-lg px-2 py-1 border border-ink-200 outline-none focus:ring-2 focus:ring-primary-300 cursor-pointer bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      title={u.id === currentUser?.id ? "You can't change your own role" : 'Change role'}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-ink-500 hidden lg:table-cell">{formatDate(u.created_at)}</td>
                  <td className="px-2 sm:px-4 py-3">
                    <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 items-end sm:justify-end">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      disabled={u.id === currentUser?.id}
                      onClick={() => setDeleteTarget(u)}
                    >
                      Delete
                    </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </div>
      </div>

      {/* ── Create User Modal ─────────────────────────────────────────────── */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button form="create-user-form" type="submit" loading={creating}>Create</Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={handleCreate} className="space-y-4">
          <Input label="Full name" value={createForm.name} onChange={updateCreate('name')} required />
          <Input
            label="Username (optional)"
            value={createForm.username}
            onChange={updateCreate('username')}
            placeholder="dr.smith"
            hint="3-50 chars: letters, numbers, dots, hyphens, underscores. User can log in with this instead of email."
          />
          <Input type="email" label="Email" value={createForm.email} onChange={updateCreate('email')} required />
          <Input
            type="password"
            label="Password"
            value={createForm.password}
            onChange={updateCreate('password')}
            required
            minLength={8}
            hint="Min 8 chars — uppercase, lowercase, number, and special character."
          />
          <Select label="Role" value={createForm.role} onChange={updateCreate('role')}>
            <option value="staff">Staff</option>
            <option value="nurse">Nurse</option>
            <option value="midwife">Admission Midwife</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Administrator</option>
          </Select>
        </form>
      </Modal>

      {/* ── Edit User Modal ───────────────────────────────────────────────── */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit "${editTarget?.name}"`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button form="edit-user-form" type="submit" loading={saving}>Save</Button>
          </>
        }
      >
        <form id="edit-user-form" onSubmit={handleEdit} className="space-y-4">
          <Input label="Full name" value={editForm.name} onChange={updateEdit('name')} required />
          <Input
            label="Username (optional)"
            value={editForm.username}
            onChange={updateEdit('username')}
            placeholder="dr.smith"
            hint="3-50 chars: letters, numbers, dots, hyphens, underscores. User can log in with this instead of email."
          />
          <Input type="email" label="Email" value={editForm.email} onChange={updateEdit('email')} required />
          <Input
            type="password"
            label="New Password"
            value={editForm.password}
            onChange={updateEdit('password')}
            minLength={8}
            hint="Leave blank to keep the current password. If set, must meet the password policy."
          />
          <Select label="Role" value={editForm.role} onChange={updateEdit('role')}>
            <option value="staff">Staff</option>
            <option value="nurse">Nurse</option>
            <option value="midwife">Admission Midwife</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Administrator</option>
          </Select>
        </form>
      </Modal>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-ink-700">
          Are you sure you want to permanently delete{' '}
          <strong>{deleteTarget?.name}</strong>? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

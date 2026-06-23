import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/UI/Toast';
import { Button } from '../components/UI/Button';
import { Input, Select } from '../components/UI/Input';
import { Icon } from '../components/Icon';
import { JLMCLogo } from '../components/JLMCLogo';
import { apiError } from '../services/api';

export function Register() {
  const { register, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(apiError(err, 'Registration failed'));
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-cream">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white relative overflow-hidden">
        <div className="flex items-center gap-3">
          <JLMCLogo size={40} className="rounded-xl flex-shrink-0" />
          <div>
            <p className="font-display font-bold text-lg">Jean Lying-in Maternity Clinic</p>
            <p className="text-primary-100 text-sm">Tughan, Juban, Sorsogon</p>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl xl:text-4xl font-display font-bold leading-tight">
            Join your team.
          </h2>
          <p className="mt-4 text-primary-50/90 leading-relaxed">
            The first account created becomes the clinic administrator. Additional users
            default to the <strong>staff</strong> role; an admin can change this later.
          </p>
        </div>
        <p className="text-primary-100 text-xs">
          © {new Date().getFullYear()} Jean Lying-in Maternity Clinic · JLMC
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-slide-up">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-ink-900">
            Create an account
          </h1>
          <p className="text-ink-500 mt-2">Set up access for a new staff member.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Input
              label="Full name"
              placeholder="Dr. Maria Santos"
              value={form.name}
              onChange={update('name')}
              required
            />
            <Input
              type="email"
              label="Email"
              placeholder="you@clinic.local"
              value={form.email}
              onChange={update('email')}
              required
              autoComplete="email"
            />
            <Input
              type="password"
              label="Password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={update('password')}
              required
              minLength={8}
              autoComplete="new-password"
              hint="Min 8 chars — must include uppercase, lowercase, number, and special character."
            />
            <Select label="Role" value={form.role} onChange={update('role')}>
              <option value="staff">Staff</option>
              <option value="nurse">Nurse</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Administrator</option>
            </Select>
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create account
            </Button>
          </form>

          <p className="text-sm text-ink-500 mt-6 text-center">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-primary-600 font-medium hover:text-primary-700"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/UI/Toast';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { Icon } from '../components/Icon';
import { JLMCLogo } from '../components/JLMCLogo';
import { apiError } from '../services/api';

export function Login() {
  const { login, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success('Welcome back');
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(apiError(err, 'Login failed'));
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-cream">
      {/* Brand side */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" aria-hidden="true">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <JLMCLogo size={40} className="rounded-xl flex-shrink-0" />
          <div>
            <p className="font-display font-bold text-lg">Jean Lying-in Maternity Clinic</p>
            <p className="text-primary-100 text-sm">Tughan, Juban, Sorsogon</p>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl xl:text-4xl font-display font-bold leading-tight">
            Compassionate care,
            <br /> powered by intelligence.
          </h2>
          <p className="mt-4 text-primary-50/90 leading-relaxed">
            Manage patient records, consultations, and appointments — with AI-assisted
            documentation that gives you more time for what matters.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {['AI Note Summaries', 'Smart Reports', 'Secure & Private'].map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur text-sm font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-primary-100 text-xs">
          © {new Date().getFullYear()} Jean Lying-in Maternity Clinic · JLMC
        </p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-slide-up">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <JLMCLogo size={40} className="rounded-xl flex-shrink-0" />
            <div>
              <p className="font-display font-bold text-ink-900">Jean Lying-in Maternity Clinic</p>
              <p className="text-xs text-ink-500">Tughan, Juban, Sorsogon</p>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-bold text-ink-900">
            Welcome back
          </h1>
          <p className="text-ink-500 mt-2">Sign in to continue to your dashboard.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Input
              type="email"
              label="Email"
              placeholder="you@clinic.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              type="password"
              label="Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Sign in
            </Button>
          </form>

          <p className="text-sm text-ink-500 mt-6 text-center">
            First time? Ask your administrator to create an account for you.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/UI/Toast';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { JLMCLogo } from '../components/JLMCLogo';
import { apiError } from '../services/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function Login() {
  const { login, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Handle OAuth redirect errors (e.g. user denied permission)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    if (error === 'oauth_denied') {
      toast.error('Sign in was cancelled. Please try again.');
      // Clean the URL
      navigate('/login', { replace: true });
    }
  }, [location.search, toast, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate(from || '/', { replace: true });
    } catch (err) {
      if (err?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        toast.info('Please verify your email to continue.');
        navigate('/verify-email', { state: { email } });
        return;
      }
      toast.error(apiError(err, 'Login failed'));
    }
  }

  function loginWithGoogle() {
    window.location.href = `${API_BASE}/auth/google`;
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
            Manage patient records and consultations — with smart
            documentation that gives you more time for what matters.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {['Smart Summaries', 'Daily Reports', 'Secure & Private'].map((t) => (
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
            {/* Password field with "Forgot password?" on the right of the label */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="block text-sm font-medium text-ink-700">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input-base w-full"
              />
            </div>
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Sign in
            </Button>
          </form>

          {/* "or" divider — GitHub style */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-ink-200" />
            <span className="text-xs text-ink-500 font-medium">or</span>
            <div className="flex-1 h-px bg-ink-200" />
          </div>

          {/* Social login buttons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-ink-200 bg-white text-sm font-medium text-ink-800 hover:bg-ink-50 hover:border-ink-300 transition-colors"
            >
              <GoogleIcon className="w-5 h-5" />
              Continue with Google
            </button>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-sm">
            <span className="text-ink-500">New Here? </span>
            <Link
              to="/register"
              className="text-primary-600 hover:text-primary-700 font-semibold"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

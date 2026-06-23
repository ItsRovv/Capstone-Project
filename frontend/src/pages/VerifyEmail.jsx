import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../components/UI/Toast';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { JLMCLogo } from '../components/JLMCLogo';
import { apiError } from '../services/api';

export function VerifyEmail() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Email may be prefilled when redirected here from a failed (unverified) login.
  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.verifyEmail({ email, otp });
      toast.success('Email verified. You can now sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(apiError(err, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-6">
      <div className="w-full max-w-md animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <JLMCLogo size={40} className="rounded-xl flex-shrink-0" />
          <div>
            <p className="font-display font-bold text-ink-900">Jean Lying-in Maternity Clinic</p>
            <p className="text-xs text-ink-500">Tughan, Juban, Sorsogon</p>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-display font-bold text-ink-900">
          Verify your account
        </h1>
        <p className="text-ink-500 mt-2">
          Enter your email and the 6-digit code we sent you to activate your account.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Input
            type="email"
            label="Email"
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Verification code"
            placeholder="6-digit code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Verify account
          </Button>
        </form>

        <p className="text-sm text-ink-500 mt-6 text-center">
          Already verified?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

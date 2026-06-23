import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../components/UI/Toast';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { JLMCLogo } from '../components/JLMCLogo';
import { apiError } from '../services/api';

export function ForgotPassword() {
  const toast = useToast();
  const navigate = useNavigate();

  // step 1 = request code, step 2 = enter code + new password
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestCode(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      toast.success('If an account exists, a reset code has been sent.');
      setStep(2);
    } catch (err) {
      toast.error(apiError(err, 'Could not send reset code'));
    } finally {
      setLoading(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.resetPassword({ email, otp, newPassword });
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true, state: { email } });
    } catch (err) {
      toast.error(apiError(err, 'Could not reset password'));
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
          Reset your password
        </h1>
        <p className="text-ink-500 mt-2">
          {step === 1
            ? "Enter your email and we'll send you a one-time code."
            : `Enter the code we sent to ${email} and choose a new password.`}
        </p>

        {step === 1 ? (
          <form onSubmit={requestCode} className="mt-8 space-y-4">
            <Input
              type="email"
              label="Email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Send reset code
            </Button>
          </form>
        ) : (
          <form onSubmit={submitReset} className="mt-8 space-y-4">
            <Input
              label="Verification code"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <Input
              type="password"
              label="New password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              hint="Min 8 chars — must include uppercase, lowercase, number, and special character."
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Reset password
            </Button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-sm text-ink-500 hover:text-ink-800"
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="text-sm text-ink-500 mt-6 text-center">
          Remembered it?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * PipeFX Desktop — Login / Register Page.
 *
 * Full-screen auth gate displayed before the main app.
 * Supports email/password and Google OAuth.
 * Uses existing shadcn/ui components and PipeFX brand elements.
 */

import { useState, useCallback, type FormEvent } from 'react';
import { useAuth } from '@pipefx/auth/ui';
import { PipeFxLogo } from '../../components/brand/PipeFxLogo.js';
import { cn } from '../../lib/utils.js';
import { toast } from 'sonner';

type AuthMode = 'sign-in' | 'sign-up';

export function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password.trim()) {
        toast.error('Please enter both email and password.');
        return;
      }

      if (mode === 'sign-up' && password !== confirmPassword) {
        toast.error('Passwords do not match.');
        return;
      }

      if (mode === 'sign-up' && password.length < 6) {
        toast.error('Password must be at least 6 characters.');
        return;
      }

      setIsSubmitting(true);
      try {
        const result =
          mode === 'sign-in'
            ? await signIn(email, password)
            : await signUp(email, password);

        if (result.error) {
          toast.error(result.error);
        } else if (mode === 'sign-up') {
          toast.success('Account created! Check your email to confirm.');
        }
      } catch {
        toast.error('An unexpected error occurred. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, confirmPassword, mode, signIn, signUp]
  );

  const handleGoogleSignIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch {
      toast.error('Google sign-in failed. Please try again.');
    }
  }, [signInWithGoogle]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-sm mx-auto px-6">
        {/* ── Brand Header ── */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <PipeFxLogo className="h-20 w-20 text-foreground" />
          <div className="flex items-baseline gap-0.5 select-none">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              Pipe
            </span>
            <span className="text-2xl font-bold tracking-tight text-primary">
              FX
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === 'sign-in'
              ? 'Sign in to your account'
              : 'Create a new account'}
          </p>
        </div>

        {/* ── Auth Form ── */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="auth-email"
                className="text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="auth-password"
                className="text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={
                  mode === 'sign-in' ? 'current-password' : 'new-password'
                }
                required
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              />
            </div>

            {/* Confirm Password (sign-up only) */}
            {mode === 'sign-up' && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="auth-confirm-password"
                  className="text-sm font-medium text-foreground"
                >
                  Confirm Password
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className={cn(
                    'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                    'text-sm placeholder:text-muted-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                />
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'inline-flex items-center justify-center h-10 rounded-lg px-4',
                'bg-primary text-primary-foreground font-medium text-sm',
                'hover:bg-primary/90 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isSubmitting
                ? 'Loading...'
                : mode === 'sign-in'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3 my-4">
            <span className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="flex-1 h-px bg-border" />
          </div>

          {/* ── Google OAuth ── */}
          <button
            onClick={handleGoogleSignIn}
            className={cn(
              'inline-flex items-center justify-center gap-2 w-full h-10 rounded-lg px-4',
              'border border-border bg-background text-foreground font-medium text-sm',
              'hover:bg-muted/50 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* ── Mode Toggle ── */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          {mode === 'sign-in' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => {
                  setMode('sign-up');
                  setConfirmPassword('');
                }}
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setMode('sign-in')}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

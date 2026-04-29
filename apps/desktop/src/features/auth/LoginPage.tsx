/**
 * PipeFX Desktop — Login / Register Page.
 *
 * Full-screen auth gate displayed before the main app.
 *
 * Sign-in mode:  Centered card — email/password + Google OAuth.
 * Sign-up mode:  Side-by-side — account form (left) + optional
 *                CloudFX subscription / BYOK keys (right).
 */

import { useState, useCallback, type FormEvent } from 'react';
import { useAuth } from '@pipefx/auth/ui';
import { PipeFxLogo } from '../../components/brand/PipeFxLogo.js';
import { cn } from '../../lib/utils.js';
import { toast } from 'sonner';
import { updateSettings } from '../../lib/api.js';
import {
  Cloud,
  Key,
  Sparkles,
  Zap,
  Crown,
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
} from 'lucide-react';
import { usePaddleCheckout } from './PaddleCheckout.js';

type AuthMode = 'sign-in' | 'sign-up';

/* ─── Plan data ─────────────────────────────────────────── */

interface CloudPlan {
  id: string;
  name: string;
  price: string;
  credits: string;
  paddlePriceId: string;
  icon: typeof Sparkles;
  popular?: boolean;
}

const PLANS: CloudPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$10',
    credits: '100K credits',
    paddlePriceId:
      import.meta.env.VITE_PADDLE_PRICE_STARTER ||
      'pri_01kq8gpgmnvxzgm5vbhqcvmsvh',
    icon: Sparkles,
  },
  {
    id: 'creator',
    name: 'Creator',
    price: '$30',
    credits: '300K credits',
    paddlePriceId:
      import.meta.env.VITE_PADDLE_PRICE_CREATOR ||
      'pri_01kq8gsa26ej1rjnzmzng215gq',
    icon: Zap,
    popular: true,
  },
  {
    id: 'studio',
    name: 'Studio',
    price: '$100',
    credits: '700K credits',
    paddlePriceId:
      import.meta.env.VITE_PADDLE_PRICE_STUDIO ||
      'pri_01kq8gwf6vjt1syhah5wacv334',
    icon: Crown,
  },
];

/* ═══════════════════════════════════════════════════════════
   LoginPage
   ═══════════════════════════════════════════════════════════ */

export function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* Optional sections */
  const [cloudExpanded, setCloudExpanded] = useState(false);
  const [byokExpanded, setByokExpanded] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('creator');

  /* BYOK keys — Chat Providers */
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);

  /* BYOK keys — Media Gen Providers */
  const [showMediaKeys, setShowMediaKeys] = useState(false);
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [klingKey, setKlingKey] = useState('');
  const [klingSecret, setKlingSecret] = useState('');
  const [byteplusKey, setByteplusKey] = useState('');
  const [byteplusSeedDream, setByteplusSeedDream] = useState('');
  const [byteplusArk, setByteplusArk] = useState('');

  /* Paddle */
  const {
    isReady: isPaddleReady,
    isOpen: isCheckoutOpen,
    openCheckout,
    isConfigured: isPaddleConfigured,
  } = usePaddleCheckout({
    onComplete: () => toast.success('Subscription activated! Credits incoming.'),
    onClose: () => {
      // user dismissed the checkout modal — no action needed
    },
    onError: (err) => {
      console.error('[Paddle] Checkout error:', err);
      toast.error('Checkout failed. You can subscribe later in Settings.');
    },
  });

  /* ── Submit ── */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password.trim()) {
        toast.error('Please enter both email and password.');
        return;
      }
      if (mode === 'sign-up') {
        if (password !== confirmPassword) {
          toast.error('Passwords do not match.');
          return;
        }
        if (password.length < 6) {
          toast.error('Password must be at least 6 characters.');
          return;
        }
      }

      setIsSubmitting(true);
      try {
        if (mode === 'sign-in') {
          const result = await signIn(email, password);
          if (result.error) toast.error(result.error);
        } else {
          const hasKeys =
            geminiKey.trim() || openaiKey.trim() || anthropicKey.trim() ||
            elevenlabsKey.trim() || klingKey.trim() || byteplusKey.trim() || byteplusArk.trim();
          const result = await signUp(email, password);
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success('Account created! Check your email to confirm.');
            const newUserId = result.user?.id;
            if (hasKeys) {
              try {
                await updateSettings({
                  apiMode: 'byok',
                  geminiApiKey: geminiKey.trim(),
                  openaiApiKey: openaiKey.trim(),
                  anthropicApiKey: anthropicKey.trim(),
                  elevenlabsApiKey: elevenlabsKey.trim(),
                  klingApiKey: klingKey.trim(),
                  klingApiSecret: klingSecret.trim(),
                  byteplusApiKey: byteplusKey.trim(),
                  byteplusSeedDreamEndpoint: byteplusSeedDream.trim(),
                  byteplusArkApiKey: byteplusArk.trim(),
                });
              } catch {
                /* non-critical */
              }
            }
            if (cloudExpanded && isPaddleReady) {
              const plan = PLANS.find((p) => p.id === selectedPlan);
              if (plan) openCheckout(plan.paddlePriceId, email, newUserId);
            }
          }
        }
      } catch {
        toast.error('An unexpected error occurred.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      email, password, confirmPassword, mode, signIn, signUp,
      geminiKey, openaiKey, anthropicKey,
      elevenlabsKey, klingKey, klingSecret, byteplusKey, byteplusSeedDream, byteplusArk,
      cloudExpanded, selectedPlan, isPaddleReady, openCheckout,
    ]
  );

  const handleGoogleSignIn = useCallback(async () => {
    try { await signInWithGoogle(); } catch { toast.error('Google sign-in failed.'); }
  }, [signInWithGoogle]);

  const isSignUp = mode === 'sign-up';

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="flex items-start justify-center min-h-screen bg-background overflow-y-auto pt-[8vh] pb-10 px-6">
      <div
        className={cn(
          'w-full mx-auto transition-all duration-400',
          isSignUp ? 'max-w-[54rem]' : 'max-w-[22rem]'
        )}
      >
        {/* ── Header ── */}
        <header className="flex flex-col items-center gap-1.5 mb-6 select-none">
          <PipeFxLogo className="h-14 w-14 text-foreground" />
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-bold tracking-tight text-foreground">
              Pipe
            </span>
            <span className="text-xl font-bold tracking-tight text-primary">
              FX
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </p>
        </header>

        {/* ── Content grid ── */}
        <div
          className={cn(
            'transition-all duration-400',
            isSignUp
              ? 'grid grid-cols-[1fr_1fr] gap-5 items-start'
              : ''
          )}
        >
          {/* ╔═══════════════════════════════════════════════╗
             ║  LEFT — Account Card                         ║
             ╚═══════════════════════════════════════════════╝ */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="p-5">
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <InputField
                  id="auth-email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <InputField
                  id="auth-password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
                {isSignUp && (
                  <InputField
                    id="auth-confirm"
                    label="Confirm Password"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || isCheckoutOpen}
                  className={cn(
                    'h-9 rounded-lg mt-1 text-sm font-medium',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 active:scale-[0.98] transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'inline-flex items-center justify-center'
                  )}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isSignUp ? 'Create Account' : 'Sign In'}
                </button>
              </form>
            </div>

            {/* Divider + Google */}
            <div className="border-t border-border px-5 py-4">
              <button
                onClick={handleGoogleSignIn}
                className={cn(
                  'inline-flex items-center justify-center gap-2 w-full h-9 rounded-lg',
                  'border border-border bg-background text-foreground text-sm font-medium',
                  'hover:bg-muted/50 active:scale-[0.98] transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </div>

            {/* Mode toggle — inside left card so it never shifts */}
            <div className="px-5 pb-4 pt-1">
              <p className="text-center text-[13px] text-muted-foreground">
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <button
                      onClick={() => setMode('sign-in')}
                      className="text-primary hover:underline font-medium"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{' '}
                    <button
                      onClick={() => { setMode('sign-up'); setConfirmPassword(''); }}
                      className="text-primary hover:underline font-medium"
                    >
                      Sign up
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* ╔═══════════════════════════════════════════════╗
             ║  RIGHT — Optional Services (sign-up only)    ║
             ╚═══════════════════════════════════════════════╝ */}
          {isSignUp && (
            <div className="rounded-xl border border-border/60 bg-card/50 shadow-sm overflow-hidden">
              {/* Optional header */}
              <div className="px-5 pt-4 pb-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-medium text-center">
                  Set up now or later in Settings
                </p>
              </div>

              {/* CloudFX */}
              {isPaddleConfigured && (
                <OptionSection
                  expanded={cloudExpanded}
                  onToggle={() => {
                    setCloudExpanded(!cloudExpanded);
                    if (!cloudExpanded) setByokExpanded(false);
                  }}
                  icon={<Cloud className="h-4 w-4" />}
                  title="CloudFX Subscription"
                  subtitle="Managed AI — no keys needed"
                >
                  <div className="flex flex-col gap-1.5 pt-1">
                    {PLANS.map((plan) => {
                      const active = selectedPlan === plan.id;
                      const Icon = plan.icon;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedPlan(plan.id)}
                          className={cn(
                            'flex items-center gap-3 rounded-lg p-2.5 text-left transition-all',
                            'border',
                            active
                              ? 'border-primary/40 bg-primary/5'
                              : 'border-transparent hover:bg-muted/40'
                          )}
                        >
                          {/* Radio dot */}
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                              active
                                ? 'border-primary'
                                : 'border-muted-foreground/30'
                            )}
                          >
                            {active && (
                              <span className="block h-2 w-2 rounded-full bg-primary" />
                            )}
                          </span>
                          <Icon
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              active ? 'text-primary' : 'text-muted-foreground/60'
                            )}
                          />
                          <span className="flex-1 min-w-0">
                            <span
                              className={cn(
                                'text-[13px] font-medium',
                                active ? 'text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {plan.name}
                            </span>
                            {plan.popular && (
                              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 rounded px-1 py-px">
                                Popular
                              </span>
                            )}
                            <span className="ml-1.5 text-[11px] text-muted-foreground/50">
                              {plan.credits}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'text-[13px] font-semibold tabular-nums',
                              active ? 'text-foreground' : 'text-muted-foreground/60'
                            )}
                          >
                            {plan.price}
                            <span className="text-[10px] font-normal text-muted-foreground/50">
                              /mo
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5 pl-1">
                      Checkout opens after account creation · Cancel anytime
                    </p>
                  </div>
                </OptionSection>
              )}

              {/* BYOK */}
              <OptionSection
                expanded={byokExpanded}
                onToggle={() => {
                  setByokExpanded(!byokExpanded);
                  if (!byokExpanded) setCloudExpanded(false);
                }}
                icon={<Key className="h-4 w-4" />}
                title="Bring Your Own Keys"
                subtitle="Use your own API keys — free"
                last
              >
                <div className="pt-1.5 space-y-3">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowMediaKeys(!showMediaKeys)}
                      className={cn(
                        'flex items-center gap-1.5 text-[11px] font-medium transition-all rounded-md px-2 py-1 -ml-2',
                        showMediaKeys
                          ? 'text-primary bg-primary/8 shadow-sm shadow-primary/5'
                          : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      {showMediaKeys ? 'Chat + Media' : '+ Media Keys'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowKeys(!showKeys)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      {showKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span className="text-[10px]">{showKeys ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>

                  {/* Key grid */}
                  <div
                    className={cn(
                      'grid gap-x-4 gap-y-1.5 transition-all duration-300',
                      showMediaKeys ? 'grid-cols-3' : 'grid-cols-1'
                    )}
                  >
                    {/* Col 1: Chat */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest pb-0.5 border-b border-border/30">Chat</p>
                      <CompactKeyInput id="byok-gemini" label="Gemini" value={geminiKey} onChange={setGeminiKey} show={showKeys} placeholder="AIza..." />
                      <CompactKeyInput id="byok-openai" label="OpenAI" value={openaiKey} onChange={setOpenaiKey} show={showKeys} placeholder="sk-..." />
                      <CompactKeyInput id="byok-anthropic" label="Anthropic" value={anthropicKey} onChange={setAnthropicKey} show={showKeys} placeholder="sk-ant-..." />
                    </div>

                    {/* Col 2: Audio & Video */}
                    {showMediaKeys && (
                      <div className="space-y-1.5 animate-panel-enter">
                        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest pb-0.5 border-b border-border/30">Audio / Video</p>
                        <CompactKeyInput id="byok-elevenlabs" label="ElevenLabs" value={elevenlabsKey} onChange={setElevenlabsKey} show={showKeys} placeholder="sk_..." />
                        <CompactKeyInput id="byok-kling" label="Kling Key" value={klingKey} onChange={setKlingKey} show={showKeys} placeholder="ak-..." />
                        <CompactKeyInput id="byok-kling-secret" label="Kling Secret" value={klingSecret} onChange={setKlingSecret} show={showKeys} placeholder="sk-..." />
                      </div>
                    )}

                    {/* Col 3: Image */}
                    {showMediaKeys && (
                      <div className="space-y-1.5 animate-panel-enter" style={{ animationDelay: '50ms' }}>
                        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest pb-0.5 border-b border-border/30">Image</p>
                        <CompactKeyInput id="byok-byteplus" label="BytePlus" value={byteplusKey} onChange={setByteplusKey} show={showKeys} placeholder="..." />
                        <CompactKeyInput id="byok-seeddream" label="SeedDream" value={byteplusSeedDream} onChange={setByteplusSeedDream} show={showKeys} placeholder="ep-..." />
                        <CompactKeyInput id="byok-ark" label="ARK Key" value={byteplusArk} onChange={setByteplusArk} show={showKeys} placeholder="..." />
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground/50">
                    At least one chat key required · Keys stored locally
                  </p>
                </div>
              </OptionSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════ */

/* ── Form field ── */
function InputField({
  id, label, type, value, onChange, placeholder, autoComplete,
}: {
  id: string; label: string; type: string;
  value: string; onChange: (v: string) => void;
  placeholder: string; autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className={cn(
          'h-9 w-full rounded-lg border border-input bg-background px-3',
          'text-sm placeholder:text-muted-foreground/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'transition-colors'
        )}
      />
    </div>
  );
}

/* ── Option section (right column accordion) ── */
function OptionSection({
  expanded, onToggle, icon, title, subtitle, last, children,
}: {
  expanded: boolean; onToggle: () => void;
  icon: React.ReactNode; title: string; subtitle: string;
  last?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn(!last && 'border-b border-border/40')}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center gap-3 w-full px-5 py-3 text-left',
          'hover:bg-muted/30 transition-colors'
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors',
            expanded
              ? 'bg-primary/10 text-primary'
              : 'bg-muted/60 text-muted-foreground'
          )}
        >
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className={cn(
            'block text-[13px] font-semibold leading-tight',
            expanded ? 'text-foreground' : 'text-foreground/80'
          )}>
            {title}
          </span>
          <span className="block text-[11px] text-muted-foreground/60 leading-tight mt-0.5">
            {subtitle}
          </span>
        </span>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Compact Key Input (inline label) ── */
function CompactKeyInput({
  id, label, value, onChange, show, placeholder,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; show: boolean; placeholder: string;
}) {
  return (
    <div className="relative group">
      <label
        htmlFor={id}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground/70 pointer-events-none select-none transition-colors group-focus-within:text-primary/70"
      >
        {label}
      </label>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-8 w-full rounded-lg border border-border/70 bg-muted/20 text-right pr-2.5',
          'text-[11px] font-mono placeholder:text-muted-foreground/25',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/40 focus-visible:bg-background',
          'transition-all hover:border-border hover:bg-muted/30'
        )}
      />
    </div>
  );
}

/* ── Google Icon ── */
function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/**
 * PipeFX Desktop — Service Setup Step (Sign-up Step 2).
 *
 * After creating their account, users optionally choose
 * how they want to connect to AI providers:
 *
 *   1. CloudFX API  — Paddle subscription (managed infrastructure)
 *   2. BYOK         — Bring their own provider API keys
 *
 * Both are optional. Users can skip and configure later in Settings.
 */

import { useState, useCallback } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PipeFxLogo } from '../../components/brand/PipeFxLogo.js';
import { cn } from '../../lib/utils.js';
import { CloudFxCard, type CloudPlan } from './CloudFxCard.js';
import { ByokCard } from './ByokCard.js';
import { usePaddleCheckout } from './PaddleCheckout.js';
import { updateSettings } from '../../lib/api.js';
import { toast } from 'sonner';
import { supabase } from '@pipefx/auth/ui';

interface ServiceSetupStepProps {
  /** User's email (to prefill the Paddle checkout) */
  email: string;
  /** Supabase user ID (to link Paddle customer to profile) */
  userId?: string;
  /** Called when the user is done (skip or completed setup) */
  onComplete: () => void;
}

type SelectedCard = 'cloudfx' | 'byok' | null;

export function ServiceSetupStep({ email, userId, onComplete }: ServiceSetupStepProps) {
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);
  const [checkoutCompleted, setCheckoutCompleted] = useState(false);
  const [byokSaved, setByokSaved] = useState(false);

  // Paddle.js hook
  const {
    isReady: isPaddleReady,
    isOpen: isCheckoutOpen,
    openCheckout,
    isConfigured: isPaddleConfigured,
  } = usePaddleCheckout({
    onComplete: async (data) => {
      setCheckoutCompleted(true);
      toast.success(
        'Subscription activated! Your credits will be available shortly.'
      );

      // Write paddle_customer_id to Supabase profile so webhooks can find this user
      const customerId = (data as any)?.customer?.id;
      if (customerId && userId) {
        await supabase.from('profiles').update({ paddle_customer_id: customerId }).eq('id', userId);
      }

      // Store the Paddle customer info via settings
      try {
        await updateSettings({
          apiMode: 'cloud',
          paddleCheckoutData: data,
        });
      } catch {
        // Non-critical — webhook will handle provisioning
      }
    },
    onClose: () => {
      // User closed checkout without completing
    },
    onError: (err) => {
      console.error('[Paddle] Checkout error:', err);
      toast.error('Checkout encountered an error. Please try again.');
    },
  });

  const handleSubscribe = useCallback(
    (plan: CloudPlan) => {
      openCheckout(plan.paddlePriceId, email, userId);
    },
    [openCheckout, email, userId]
  );

  const handleByokSave = useCallback(
    async (keys: { gemini: string; openai: string; anthropic: string }) => {
      try {
        await updateSettings({
          apiMode: 'byok',
          geminiApiKey: keys.gemini,
          openaiApiKey: keys.openai,
          anthropicApiKey: keys.anthropic,
        });
        setByokSaved(true);
        toast.success('API keys saved successfully!');
      } catch {
        toast.error('Failed to save API keys. You can set them up later in Settings.');
        throw new Error('save-failed');
      }
    },
    []
  );

  const canProceed = checkoutCompleted || byokSaved;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto px-6 py-12 animate-panel-enter">
        {/* ── Header ── */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="relative">
            <PipeFxLogo className="h-16 w-16 text-foreground" />
            <div className="absolute -right-1 -top-1">
              <Sparkles className="h-5 w-5 text-primary animate-thinking-pulse" />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Welcome to PipeFX!
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Choose how you want to connect to AI. You can always change this
              later in Settings.
            </p>
          </div>
        </div>

        {/* ── Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* CloudFX Card */}
          {isPaddleConfigured ? (
            <CloudFxCard
              isSelected={selectedCard === 'cloudfx'}
              onSelect={() =>
                setSelectedCard(selectedCard === 'cloudfx' ? null : 'cloudfx')
              }
              onSubscribe={handleSubscribe}
              isCheckoutOpen={isCheckoutOpen}
              isCheckoutReady={isPaddleReady}
            />
          ) : (
            /* Paddle not configured — show disabled state */
            <div className="flex flex-col text-left rounded-xl border border-border/50 bg-card/50 p-5 opacity-60">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                  <Sparkles className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    CloudFX API
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Coming soon — managed AI infrastructure with pay-per-use pricing.
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground/60 italic">
                Billing integration is being configured.
              </div>
            </div>
          )}

          {/* BYOK Card */}
          <ByokCard
            isSelected={selectedCard === 'byok'}
            onSelect={() =>
              setSelectedCard(selectedCard === 'byok' ? null : 'byok')
            }
            onSave={handleByokSave}
          />
        </div>

        {/* ── Bottom Actions ── */}
        <div className="flex flex-col items-center gap-3">
          {/* Continue / Skip */}
          {canProceed ? (
            <button
              type="button"
              onClick={onComplete}
              className={cn(
                'inline-flex items-center justify-center gap-2 h-10 rounded-lg px-6',
                'bg-primary text-primary-foreground font-medium text-sm',
                'hover:bg-primary/90 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              Continue to PipeFX
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onComplete}
              className={cn(
                'inline-flex items-center gap-1.5 text-sm text-muted-foreground',
                'hover:text-foreground transition-colors'
              )}
            >
              Skip for now
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          <p className="text-[11px] text-muted-foreground/60 text-center max-w-sm">
            You can configure your AI provider connection at any time from
            Settings → API Keys.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * PipeFX Desktop — CloudFX Subscription Card.
 *
 * Displays the "CloudFX API" option during sign-up Step 2.
 * Users pick a plan tier and click "Subscribe" to trigger the
 * Paddle overlay checkout.
 */

import { useState } from 'react';
import { Cloud, Sparkles, Zap, Crown, Check, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface CloudPlan {
  id: string;
  name: string;
  price: string;
  credits: string;
  paddlePriceId: string;
  highlight?: boolean;
}

const PLANS: CloudPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$10/mo',
    credits: '100K credits',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_STARTER || 'pri_01kq8gpgmnvxzgm5vbhqcvmsvh',
  },
  {
    id: 'creator',
    name: 'Creator',
    price: '$25/mo',
    credits: '300K credits',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_CREATOR || 'pri_01kq8gsa26ej1rjnzmzng215gq',
    highlight: true,
  },
  {
    id: 'studio',
    name: 'Studio',
    price: '$50/mo',
    credits: '700K credits',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_STUDIO || 'pri_01kq8gwf6vjt1syhah5wacv334',
  },
];

interface CloudFxCardProps {
  isSelected: boolean;
  onSelect: () => void;
  onSubscribe: (plan: CloudPlan) => void;
  isCheckoutOpen: boolean;
  isCheckoutReady: boolean;
}

export function CloudFxCard({
  isSelected,
  onSelect,
  onSubscribe,
  isCheckoutOpen,
  isCheckoutReady,
}: CloudFxCardProps) {
  const [selectedPlanId, setSelectedPlanId] = useState('creator');

  const activePlan = PLANS.find((p) => p.id === selectedPlanId) ?? PLANS[1];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col text-left rounded-xl border p-5 transition-all duration-300',
        'hover:shadow-lg',
        isSelected
          ? 'border-primary/60 bg-primary/5 ring-2 ring-primary/30 shadow-lg'
          : 'border-border bg-card hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors shrink-0',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
          )}
        >
          <Cloud className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">
            CloudFX API
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Let PipeFX handle the AI infrastructure.
            Pay with credits — no API keys needed.
          </div>
        </div>
        {isSelected && (
          <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 mt-1" />
        )}
      </div>

      {/* Features */}
      <div className="space-y-1.5 mb-4 pl-1">
        {[
          'Zero-config AI access',
          'Transparent per-token pricing',
          'All models: Gemini, GPT, Claude',
          'Monthly credit replenishment',
        ].map((feat) => (
          <div
            key={feat}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Check className="h-3 w-3 text-primary shrink-0" />
            <span>{feat}</span>
          </div>
        ))}
      </div>

      {/* Plan Selector — only when card is selected */}
      {isSelected && (
        <div
          className="space-y-3 animate-panel-enter"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Plan Radios */}
          <div className="space-y-2">
            {PLANS.map((plan) => {
              const isActive = plan.id === selectedPlanId;
              const PlanIcon =
                plan.id === 'starter'
                  ? Sparkles
                  : plan.id === 'creator'
                    ? Zap
                    : Crown;

              return (
                <label
                  key={plan.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                    isActive
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/50 bg-background/50 hover:border-primary/30'
                  )}
                >
                  <input
                    type="radio"
                    name="cloud-plan"
                    value={plan.id}
                    checked={isActive}
                    onChange={() => setSelectedPlanId(plan.id)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors',
                      isActive
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/40'
                    )}
                  >
                    {isActive && (
                      <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                  <PlanIcon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isActive ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {plan.name}
                      </span>
                      {plan.highlight && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {plan.credits}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-bold tabular-nums',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {plan.price}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Subscribe Button */}
          <button
            type="button"
            disabled={isCheckoutOpen || !isCheckoutReady}
            onClick={() => onSubscribe(activePlan)}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg px-4',
              'bg-primary text-primary-foreground font-medium text-sm',
              'hover:bg-primary/90 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isCheckoutOpen ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4" />
                Subscribe Now
              </>
            )}
          </button>
        </div>
      )}
    </button>
  );
}

export { PLANS };

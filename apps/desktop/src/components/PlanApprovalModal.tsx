import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, XCircle, FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog.js';
import { Button } from './ui/button.js';
import { Textarea } from './ui/textarea.js';
import { ScrollArea } from './ui/scroll-area.js';
import { submitPlanResponse } from '../lib/api.js';
import type { PendingPlan } from '@pipefx/chat/contracts';

interface PlanApprovalModalProps {
  pendingPlan: PendingPlan | null;
  /** Called after a decision is successfully submitted (optimistic close). */
  onResolved: () => void;
}

/**
 * Blocking modal that appears when the agent emits a `plan_proposed` SSE
 * event. The user must approve or reject before the agent loop resumes.
 * Submits the decision to POST /agents/plan-response.
 */
export function PlanApprovalModal({
  pendingPlan,
  onResolved,
}: PlanApprovalModalProps) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state when the plan changes (new proposal)
  useEffect(() => {
    if (pendingPlan) {
      setFeedback('');
      setError(null);
      setSubmitting(false);
    }
  }, [pendingPlan?.taskId]);

  const submit = useCallback(
    async (approved: boolean) => {
      if (!pendingPlan) return;
      setSubmitting(true);
      setError(null);
      try {
        console.log('[Agents] plan-response submit', {
          taskId: pendingPlan.taskId,
          approved,
          hasFeedback: Boolean(feedback.trim()),
        });
        await submitPlanResponse({
          sessionId: pendingPlan.sessionId,
          taskId: pendingPlan.taskId,
          approved,
          feedback: feedback.trim() || undefined,
        });
        onResolved();
      } catch (err: any) {
        console.error('[Agents] plan-response failed', err);
        setError(err?.message || 'Failed to submit decision');
        setSubmitting(false);
      }
    },
    [pendingPlan, feedback, onResolved]
  );

  const isOpen = Boolean(pendingPlan);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Prevent dismissing by clicking outside — user must decide.
        if (!open && !submitting) {
          // No-op: force a choice.
        }
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Plan Proposed
          </DialogTitle>
          <DialogDescription>
            The agent has drafted a plan and is waiting for your approval
            before taking any destructive actions.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[40vh] rounded-md border bg-muted/30 p-3">
          <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90">
            {pendingPlan?.plan || ''}
          </pre>
        </ScrollArea>

        <div className="space-y-1.5">
          <label
            htmlFor="plan-feedback"
            className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
          >
            Feedback (optional)
          </label>
          <Textarea
            id="plan-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. skip step 3, use a different marker color, etc."
            rows={3}
            className="text-[13px] resize-none"
            disabled={submitting}
          />
        </div>

        {error && (
          <p className="text-[12px] text-destructive border border-destructive/30 bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => submit(false)}
            disabled={submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            Reject
          </Button>
          <Button
            onClick={() => submit(true)}
            disabled={submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

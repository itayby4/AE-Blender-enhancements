import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export function StatusIcon({
  status,
  size = 'md',
}: {
  status: string;
  size?: 'sm' | 'md';
}) {
  const cls = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  switch (status) {
    case 'in-progress':
    case 'saving':
      return <Loader2 className={cn(cls, 'text-primary animate-spin')} />;
    case 'done':
    case 'success':
      return <CheckCircle2 className={cn(cls, 'text-green-500')} />;
    case 'error':
    case 'cancelled':
      return <XCircle className={cn(cls, 'text-destructive')} />;
    default:
      return <Circle className={cn(cls, 'text-muted-foreground')} />;
  }
}

import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

export interface ChatCardAction {
  label: string;
  actionName: string;
  params: Record<string, string>;
}

export interface ParsedCard {
  type: 'card';
  content: string;
  actions: ChatCardAction[];
}

export interface ParsedSkill {
  type: 'skill';
  content: string; // The raw markdown content
}

export interface ParsedPlan {
  type: 'plan';
  content: string;
}

type ParsedPart = string | ParsedCard | ParsedSkill | ParsedPlan;

/**
 * Parse AI responses into structured data blocks for rendering.
 * Extracts :::card blocks and ```md skill definition blocks.
 */
export function parseMessageContent(text: string): ParsedPart[] {
  const parts: ParsedPart[] = [];

  // Regex matches a :::card block OR a markdown code block starting with frontmatter OR a ```plan block
  const regex =
    /(?::::card\s*\n([\s\S]*?)\n:::)|(?:```(?:md|markdown)?\s*\n(---[\s\S]*?\n---[\s\S]*?)\n```)|(?:```plan\s*\n([\s\S]*?)\n```)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the block
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) parts.push(before);
    }

    if (match[1]) {
      // It's a :::card
      const cardContent = match[1].trim();
      const actionRegex = /\[([^\]]+)\]\(action:([^)]+)\)/g;
      const actions: ChatCardAction[] = [];
      let actionMatch: RegExpExecArray | null;

      while ((actionMatch = actionRegex.exec(cardContent)) !== null) {
        const label = actionMatch[1];
        const fullAction = actionMatch[2];
        const [actionName, queryString] = fullAction.split('?');
        const params: Record<string, string> = {};

        if (queryString) {
          queryString.split('&').forEach((pair) => {
            const [key, value] = pair.split('=');
            if (key) params[key] = decodeURIComponent(value || '');
          });
        }
        actions.push({ label, actionName, params });
      }

      const cleanContent = cardContent
        .replace(/\[([^\]]+)\]\(action:[^)]+\)/g, '')
        .trim();
      parts.push({ type: 'card', content: cleanContent, actions });
    } else if (match[2]) {
      // It's a skill block
      parts.push({ type: 'skill', content: match[2].trim() });
    } else if (match[3]) {
      // It's a plan block
      parts.push({ type: 'plan', content: match[3].trim() });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const after = text.slice(lastIndex).trim();
    if (after) parts.push(after);
  }

  return parts.length > 0 ? parts : [text];
}

interface ChatCardProps {
  card: ParsedCard;
  onAction?: (actionName: string, params: Record<string, string>) => void;
}

/**
 * Renders an interactive card inline in chat messages.
 * Displays markdown-like content with action buttons.
 */
export function ChatCard({ card, onAction }: ChatCardProps) {
  return (
    <Card className="my-2 border-primary/20 bg-card/80 backdrop-blur-sm overflow-hidden">
      <CardContent className="p-3">
        {/* Card content with basic markdown rendering */}
        <div className="text-sm leading-relaxed space-y-1">
          {card.content.split('\n').map((line, i) => {
            // Bold text
            const boldRendered = line.replace(
              /\*\*([^*]+)\*\*/g,
              '<strong class="text-foreground font-semibold">$1</strong>'
            );

            if (line.trim() === '') return <div key={i} className="h-1" />;

            return (
              <div
                key={i}
                className="text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: boldRendered }}
              />
            );
          })}
        </div>

        {/* Action buttons */}
        {card.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border/40">
            {card.actions.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant={i === 0 ? 'default' : 'outline'}
                className="h-7 text-xs px-3"
                onClick={() => onAction?.(action.actionName, action.params)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Check if a text contains any :::card blocks
 */
export function hasCardBlocks(text: string): boolean {
  return /:::card[\s\S]*?:::/.test(text);
}

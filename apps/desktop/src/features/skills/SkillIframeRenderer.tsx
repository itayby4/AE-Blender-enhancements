import { useEffect, useRef, useCallback } from 'react';

interface SkillIframeRendererProps {
  html: string;
  skillId: string;
  onExecute?: (params: Record<string, unknown>) => void;
}

/**
 * Renders a skill's embedded HTML UI in a sandboxed iframe.
 * Provides a `postMessage` bridge so the skill's HTML can call
 * `execute(params)` to send commands back to PipeFX.
 */
export function SkillIframeRenderer({
  html,
  skillId,
  onExecute,
}: SkillIframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for postMessage from iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'skill-execute' && onExecute) {
        onExecute(event.data.params || {});
      }
    },
    [onExecute]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Build the full HTML document with dark theme reset and execute() bridge
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    /* Dark theme reset matching PipeFX */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #0a0a0b;
      color: #e4e4e7;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      line-height: 1.5;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    /* Design tokens */
    :root {
      --bg: #0a0a0b;
      --bg-card: #18181b;
      --bg-muted: #27272a;
      --border: #3f3f46;
      --text: #e4e4e7;
      --text-muted: #a1a1aa;
      --primary: #a78bfa;
      --primary-hover: #c4b5fd;
      --radius: 8px;
    }
    body { padding: 16px; }
    /* Common element styles */
    h1, h2, h3 { font-weight: 600; color: var(--text); margin-bottom: 12px; }
    h1 { font-size: 18px; }
    h2 { font-size: 15px; }
    h3 { font-size: 13px; }
    p { color: var(--text-muted); margin-bottom: 8px; }
    label { display: block; color: var(--text-muted); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    input, select, textarea {
      width: 100%;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 12px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--primary); }
    button {
      background: var(--primary);
      color: #0a0a0b;
      border: none;
      border-radius: var(--radius);
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    button:hover { background: var(--primary-hover); }
    button:active { transform: scale(0.97); }
    button.secondary {
      background: var(--bg-muted);
      color: var(--text);
      border: 1px solid var(--border);
    }
    button.secondary:hover { background: var(--border); }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 12px;
    }
    .grid { display: grid; gap: 12px; }
    .grid-2 { grid-template-columns: 1fr 1fr; }
    .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
    .flex { display: flex; gap: 8px; align-items: center; }
    .flex-col { flex-direction: column; }
    .mb-2 { margin-bottom: 8px; }
    .mb-4 { margin-bottom: 16px; }
    .mt-2 { margin-top: 8px; }
    .mt-4 { margin-top: 16px; }
    .gap-2 { gap: 8px; }
    .gap-4 { gap: 16px; }
  </style>
</head>
<body>
  ${html}
  <script>
    // Bridge: skill HTML calls execute() to send params to PipeFX
    function execute(params) {
      window.parent.postMessage({ type: 'skill-execute', params: params || {} }, '*');
    }
  </script>
</body>
</html>`;

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full h-full bg-background">
      {/* Skill header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card/50 shrink-0">
        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs font-medium text-muted-foreground">
          Skill UI — {skillId}
        </span>
        <span className="text-[10px] text-muted-foreground/50 ml-auto">
          Custom UI Mode
        </span>
      </div>

      {/* Sandboxed iframe */}
      <iframe
        ref={iframeRef}
        title={`Skill: ${skillId}`}
        srcDoc={fullHtml}
        sandbox="allow-scripts"
        className="flex-1 w-full border-0 bg-background"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}

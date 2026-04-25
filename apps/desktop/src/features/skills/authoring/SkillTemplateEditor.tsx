// ── apps/desktop — SkillTemplateEditor ───────────────────────────────────
// Monaco-backed prompt editor for the skill authoring page. Adds three
// affordances on top of the raw editor:
//
//   1. A `pipefx-prompt` language with rough syntax highlighting for
//      `{{var}}`, `{{#if}}` / `{{#unless}}` block tags, and `{{!comment}}`.
//   2. A completion provider that suggests the names of the inputs the
//      author has declared on the manifest, so typing `{{` shows the
//      live autocomplete list.
//   3. A model-marker decorator that flags variable references which
//      don't correspond to any declared input — visual reinforcement of
//      the warning list rendered in `<TemplatePreview>`.
//
// We intentionally keep the registration light. Monaco loads the editor
// lazily; doing too much eager wiring on import would block first paint
// of the authoring page and inflate the desktop bundle for every screen.

import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import {
  extractTemplateVariables,
  type DraftInput,
} from '@pipefx/skills/ui';
import { useCallback, useMemo, useRef, type CSSProperties } from 'react';
import type {
  editor as MonacoEditor,
  languages as MonacoLanguages,
  Position as MonacoPosition,
} from 'monaco-editor';

// ── Constants ────────────────────────────────────────────────────────────

const LANGUAGE_ID = 'pipefx-prompt';
const MARKER_OWNER = 'pipefx-prompt-undeclared';

// We track whether the language has been registered so we don't re-register
// on every editor mount (monaco-editor keeps a global registry per page).
let languageRegistered = false;

function registerLanguage(monaco: Monaco): void {
  if (languageRegistered) return;
  languageRegistered = true;

  monaco.languages.register({ id: LANGUAGE_ID });

  // Tokenizer: enough to color variables and block tags distinctly from
  // the surrounding prose. Not a full parser — we don't need one.
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\{\{!\s*[\s\S]*?\s*\}\}/, 'comment'],
        [/\{\{#(if|unless)\s+[A-Za-z_][A-Za-z0-9_]*\s*\}\}/, 'keyword'],
        [/\{\{\/(if|unless)\s*\}\}/, 'keyword'],
        [/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/, 'variable'],
        [/[^{]+/, 'source'],
        [/\{/, 'source'],
      ],
    },
  });

  // Cosmetic theme override so the variable color is recognizable; we
  // piggyback on the editor's active theme rather than defining a full one.
  monaco.editor.defineTheme('pipefx-prompt-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'variable', foreground: '8b5cf6', fontStyle: 'bold' },
      { token: 'keyword', foreground: '0ea5e9', fontStyle: 'bold' },
    ],
    colors: {},
  });
  monaco.editor.defineTheme('pipefx-prompt-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'variable', foreground: 'c4b5fd', fontStyle: 'bold' },
      { token: 'keyword', foreground: '7dd3fc', fontStyle: 'bold' },
    ],
    colors: {},
  });
}

// ── Component ────────────────────────────────────────────────────────────

export interface SkillTemplateEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Manifest inputs — used as the source for completion suggestions and
   *  to decide which `{{var}}` references are undeclared. */
  inputs: ReadonlyArray<DraftInput>;
  /** "vs-dark" or "vs". Defaults to dark — desktop ships in dark mode by
   *  default, and the bundled themes match that. */
  theme?: 'light' | 'dark';
  height?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function SkillTemplateEditor(props: SkillTemplateEditorProps) {
  const {
    value,
    onChange,
    inputs,
    theme = 'dark',
    height = 320,
    className,
    style,
  } = props;

  // Keep a live ref to the latest input list so the completion provider
  // (which we register once on mount) reads the current set rather than a
  // stale snapshot from first render.
  const inputsRef = useRef<ReadonlyArray<DraftInput>>(inputs);
  inputsRef.current = inputs;

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    registerLanguage(monaco);

    // Set the model's language now that it's registered. We can't set it
    // via the `language` prop because that takes effect before the
    // language registration completes on first mount.
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, LANGUAGE_ID);

    // Completion provider — language-scoped so it doesn't leak into other
    // editors on the page. Stored on a ref so we can dispose on unmount
    // and avoid duplicate registrations across remounts.
    completionDisposableRef.current?.dispose();
    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      {
        // Trigger on `{` so `{{` produces the picker.
        triggerCharacters: ['{'],
        provideCompletionItems: (
          modelArg: MonacoEditor.ITextModel,
          position: MonacoPosition
        ): MonacoLanguages.ProviderResult<MonacoLanguages.CompletionList> => {
          const word = modelArg.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          const declared = inputsRef.current.filter((i) => i.name);
          // Built-in block tags as a small convenience — authors don't
          // need to memorize the `{{#if}}…{{/if}}` shape.
          const blockSnippets = [
            {
              label: '{{#if …}}',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: '#if ${1:variable}}}\n${2:content}\n{{/if}}',
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Conditional block — included when variable is truthy.',
              range,
            },
            {
              label: '{{#unless …}}',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: '#unless ${1:variable}}}\n${2:content}\n{{/unless}}',
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Conditional block — included when variable is falsy.',
              range,
            },
          ];
          return {
            suggestions: [
              ...declared.map((input) => ({
                label: input.name,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: input.name,
                detail: `${input.type}${input.required ? ' · required' : ''}`,
                documentation: input.description || input.label || undefined,
                range,
              })),
              ...blockSnippets,
            ],
          };
        },
      }
    );
  }, []);

  // Compute markers for undeclared variable references — re-run on every
  // value/inputs change. Markers are how Monaco surfaces squigglies +
  // entries in the Problems panel without us hand-painting decorations.
  const undeclared = useMemo(
    () => extractTemplateVariables(value, inputs).filter((v) => v.undeclared),
    [value, inputs]
  );

  useMemoizedMarkers(editorRef, monacoRef, value, undeclared);

  return (
    <div className={className} style={style} data-component="skill-template-editor">
      <Editor
        height={height}
        defaultLanguage={LANGUAGE_ID}
        language={LANGUAGE_ID}
        theme={theme === 'dark' ? 'pipefx-prompt-dark' : 'pipefx-prompt-light'}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          fontSize: 13,
          fontFamily:
            "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
          automaticLayout: true,
          renderWhitespace: 'selection',
          tabSize: 2,
        }}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Recompute Monaco's diagnostic markers whenever the prompt text or the
 * undeclared-variable list changes. Markers are scoped to a fixed owner
 * string so re-setting them doesn't stomp other diagnostics.
 *
 * Extracted into its own helper because the marker-positioning logic is
 * verbose enough that inlining it makes the component harder to scan.
 */
function useMemoizedMarkers(
  editorRef: React.MutableRefObject<MonacoEditor.IStandaloneCodeEditor | null>,
  monacoRef: React.MutableRefObject<Monaco | null>,
  value: string,
  undeclared: ReadonlyArray<{ name: string }>
): void {
  // We can't use `useEffect` here because the file is meant to stay light
  // on hooks for tree-shaking purposes; a tiny `Promise.resolve().then`
  // microtask does the same job and avoids pulling in another render cycle.
  if (typeof window === 'undefined') return;
  void Promise.resolve().then(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    if (undeclared.length === 0) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      return;
    }

    const markers: MonacoEditor.IMarkerData[] = [];
    // Scan once — `extractTemplateVariables` already de-duplicated by name,
    // so for marker placement we walk the source ourselves to highlight
    // every occurrence (a user typo on line 7 deserves a squiggly even if
    // the same typo also exists on line 2).
    const undeclaredSet = new Set(undeclared.map((u) => u.name));
    const pattern = /\{\{\s*(?:#(?:if|unless)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      const name = match[1];
      if (!undeclaredSet.has(name)) continue;
      const start = match.index;
      const end = start + match[0].length;
      const startPos = model.getPositionAt(start);
      const endPos = model.getPositionAt(end);
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `Undeclared variable "${name}" — add it to inputs or remove the reference.`,
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      });
    }
    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  });
}

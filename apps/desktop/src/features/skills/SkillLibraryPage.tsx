// ── SkillLibraryPage ────────────────────────────────────────────────────
// Desktop consumer of the new manifest-installed skills system. Wraps the
// headless `SkillLibrary` + `SkillRunner` from `@pipefx/skills/ui` with
// shadcn chrome (cards, scroll areas, dialogs) + the desktop's
// typography + icons.
//
// Sits ALONGSIDE the legacy `SkillsPage` (which still serves the markdown
// + Python script authoring flow). Once the new system reaches feature
// parity, the legacy page can be retired.
//
// Import flow (Phase 7.10):
//
//   1. User clicks "Import .pfxskill" → file picker.
//   2. Bytes parsed via `parseSkillBundle` from `@pipefx/skills/marketplace`
//      (browser-safe — no node:crypto). Errors surface inline.
//   3. Consent dialog shows fingerprint + capability list + signed/unsigned.
//   4. On confirm → `useSkills().install(manifest, signing)` POSTs to
//      `/api/skills/install`. Backend does the actual Ed25519 verify.
//   5. After install resolves, the library refresh tick increments to
//      remount `<SkillLibrary>` so the new skill appears immediately.
//
// The split (parse client-side, verify server-side) is intentional: the
// browser shows a consent UI without crypto, and the trust boundary stays
// on the backend where it belongs.

import { useRef, useState, type ChangeEvent } from 'react';
import {
  Sparkles,
  Library,
  AlertTriangle,
  Lock,
  Zap,
  Upload,
  ShieldCheck,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  SkillLibrary,
  SkillRunner,
  useSkills,
  type InstalledSkill,
  type SkillRunRecord,
} from '@pipefx/skills/ui';
import {
  parseSkillBundle,
  type ParsedBundle,
} from '@pipefx/skills/marketplace';
import { Card } from '../../components/ui/card.js';
import { ScrollArea } from '../../components/ui/scroll-area.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.js';
import { cn } from '../../lib/utils.js';

const API_BASE = 'http://localhost:3001';

// Map manifest categories to lucide icons.
function iconForCategory(category: string | undefined): LucideIcon {
  switch (category) {
    case 'editing':
    case 'video':
      return Zap;
    case 'authoring':
      return Sparkles;
    default:
      return Library;
  }
}

export interface SkillLibraryPageProps {
  /** Optional session id for run association. Forwarded to SkillRunner. */
  sessionId?: string;
  className?: string;
}

export function SkillLibraryPage(props: SkillLibraryPageProps) {
  const { sessionId, className } = props;
  const [selected, setSelected] = useState<InstalledSkill | null>(null);
  const [lastRun, setLastRun] = useState<SkillRunRecord | null>(null);

  // Page-level useSkills owns the install + refresh lifecycle. The
  // headless `<SkillLibrary>` instantiates its own useSkills internally,
  // so after a successful install we bump `refreshTick` to remount it
  // and trigger a fresh fetch — simpler than threading a refresh ref
  // through the component.
  const { install } = useSkills({ apiBase: API_BASE });
  const [refreshTick, setRefreshTick] = useState(0);

  // Import flow state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingBundle, setPendingBundle] = useState<ParsedBundle | null>(null);
  const [installing, setInstalling] = useState(false);

  const handleFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    // Allow re-picking the same file later by resetting the input value.
    e.target.value = '';
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const result = parseSkillBundle(new Uint8Array(buffer));
      if (!result.ok) {
        const issueDetails = result.issues
          ?.map((i) => `${i.path}: ${i.message}`)
          .join('; ');
        setImportError(
          issueDetails ? `${result.error} (${issueDetails})` : result.error
        );
        return;
      }
      setPendingBundle(result.bundle);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'failed to read bundle file'
      );
    }
  };

  const handleConfirmInstall = async () => {
    if (!pendingBundle) return;
    setInstalling(true);
    setImportError(null);
    try {
      await install(pendingBundle.manifest, {
        signature: pendingBundle.signing?.signatureHex,
        publicKey: pendingBundle.signing?.publicKeyHex,
        source: 'bundle',
      });
      setPendingBundle(null);
      setRefreshTick((tick) => tick + 1);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'install failed'
      );
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 gap-3 p-3 bg-background',
        className
      )}
    >
      {/* hidden file picker — clicked via the header button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pfxskill,application/json"
        onChange={handleFilePicked}
        className="hidden"
        aria-hidden
      />

      {/* ── Left: library grid ─────────────────────────────────── */}
      <Card className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Skill Library</h2>
            <p className="text-xs text-muted-foreground">
              Installed manifest-based skills · powered by{' '}
              <code className="text-[11px]">@pipefx/skills</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import .pfxskill
            </Button>
            <Badge variant="outline" className="text-[10px]">
              v2
            </Badge>
          </div>
        </div>
        {importError && (
          <div className="px-4 py-2 text-xs bg-destructive/10 text-destructive border-b border-destructive/30">
            {importError}
          </div>
        )}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <SkillLibrary
              key={refreshTick}
              apiBase={API_BASE}
              onSelect={(skill) => {
                setSelected(skill);
                setLastRun(null);
              }}
              renderIcon={(skill) => {
                const Icon = iconForCategory(skill.manifest.category);
                return <Icon className="h-4 w-4 text-primary" />;
              }}
              emptyState={
                <EmptyLibraryState
                  onImport={() => fileInputRef.current?.click()}
                />
              }
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
            />
          </div>
        </ScrollArea>
      </Card>

      {/* ── Right: runner detail ───────────────────────────────── */}
      <Card className="w-[420px] shrink-0 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">
                  {selected.manifest.name}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {selected.manifest.id} · v{selected.manifest.version}
                </p>
              </div>
              {selected.signed ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] gap-1"
                  title={selected.fingerprint ?? 'signed'}
                >
                  <Lock className="h-3 w-3" />
                  signed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  unsigned
                </Badge>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4">
                <SkillRunner
                  skill={selected}
                  apiBase={API_BASE}
                  sessionId={sessionId}
                  onComplete={(record) => setLastRun(record)}
                  className="space-y-3"
                />
                {lastRun && lastRun.status === 'succeeded' && (
                  <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs">
                    <div className="font-medium text-emerald-700 dark:text-emerald-400">
                      Run completed
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Run ID: <code>{lastRun.id}</code>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <EmptyRunnerState />
        )}
      </Card>

      <ImportConsentDialog
        bundle={pendingBundle}
        installing={installing}
        onCancel={() => setPendingBundle(null)}
        onConfirm={handleConfirmInstall}
      />
    </div>
  );
}

// ── ImportConsentDialog ─────────────────────────────────────────────────
// First-run install consent. Shows the user EXACTLY what they're agreeing
// to before the bundle hits the install endpoint:
//
//   • Author signature status (signed → green shield with truncated
//     fingerprint; unsigned → amber warning)
//   • Capability list (which connectors / tools the skill needs to run)
//   • Manifest description (so the user can sanity-check it's the skill
//     they thought they were installing)
//
// The actual cryptographic verify happens server-side at
// /api/skills/install — this dialog is the social-trust gate, not the
// cryptographic one.

interface ImportConsentDialogProps {
  bundle: ParsedBundle | null;
  installing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ImportConsentDialog(props: ImportConsentDialogProps) {
  const { bundle, installing, onCancel, onConfirm } = props;
  const open = bundle !== null;
  const manifest = bundle?.manifest;
  const signing = bundle?.signing;
  const fingerprint = signing?.publicKeyHex.slice(0, 16);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !installing) onCancel();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Install skill</DialogTitle>
          <DialogDescription>
            {manifest
              ? `Review what this skill needs before installing it.`
              : null}
          </DialogDescription>
        </DialogHeader>

        {manifest && (
          <div className="space-y-4 text-sm">
            {/* Identity */}
            <div className="space-y-1">
              <div className="font-semibold">{manifest.name}</div>
              <div className="text-xs text-muted-foreground">
                {manifest.id} · v{manifest.version}
              </div>
              <p className="text-xs mt-1">{manifest.description}</p>
            </div>

            {/* Signature status */}
            <div
              className={cn(
                'rounded-md border p-3 text-xs flex items-start gap-2',
                signing
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              )}
            >
              {signing ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-emerald-700 dark:text-emerald-400">
                      Signed bundle
                    </div>
                    <div className="text-muted-foreground">
                      Public key fingerprint:{' '}
                      <code className="text-[11px]">{fingerprint}…</code>
                      <br />
                      The signature is verified server-side before install.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-amber-700 dark:text-amber-400">
                      Unsigned bundle
                    </div>
                    <div className="text-muted-foreground">
                      Anyone can edit an unsigned skill without detection.
                      Only install from sources you trust.
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Capability list */}
            <div>
              <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Required capabilities
              </div>
              {manifest.requires.capabilities.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  None — this skill uses only the language model.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {manifest.requires.capabilities.map((cap, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                    >
                      <Zap className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                      <span>
                        {cap.description ??
                          [cap.connectorId, cap.toolName]
                            .filter(Boolean)
                            .join(' · ') ??
                          'capability'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={installing}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={installing}>
            {installing ? 'Installing…' : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Empty / informational sub-views ─────────────────────────────────────

function EmptyLibraryState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      <Library className="h-10 w-10 mb-3 opacity-40" />
      <h3 className="text-sm font-semibold text-foreground">
        No skills installed yet
      </h3>
      <p className="text-xs mt-1 max-w-sm">
        Import a <code>.pfxskill</code> bundle to get started, or wait for
        the upcoming authoring UI to publish your own.
      </p>
      <div className="flex gap-2 mt-4">
        <Button size="sm" variant="outline" onClick={onImport}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Import .pfxskill
        </Button>
        <Button size="sm" variant="outline" disabled>
          Author new skill (soon)
        </Button>
      </div>
    </div>
  );
}

function EmptyRunnerState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-xs max-w-[260px]">
        Select a skill from the library to view its inputs and run it.
      </p>
    </div>
  );
}

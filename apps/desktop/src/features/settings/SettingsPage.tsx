import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Key,
  Palette,
  Info,
  Eye,
  EyeOff,
  Save,
  Square,
  Squircle,
  User,
  LogOut,
  Mail,
  Lock,
  Check,
  Cloud,
  Zap,
  CreditCard,
  Sparkles,
  Crown,
} from 'lucide-react';
import { PipeFxLogo } from '../../components/brand/PipeFxLogo.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { cn } from '../../lib/utils.js';
import { PalettePicker } from './PalettePicker.js';
import { PaletteEditor } from './PaletteEditor.js';
import { applyPalette } from '../../lib/palette-runtime.js';
import type { CustomPalette } from '../../lib/palette-runtime.js';
import type { CornerMode } from '../../lib/corners-runtime.js';
import { fetchSettings, updateSettings, provisionCloudToken } from '../../lib/api.js';
import { useAuth, supabase } from '@pipefx/auth/ui';
import { toast } from 'sonner';
import { usePaddleCheckout } from '../auth/PaddleCheckout.js';

/* ── Plan config (matches LoginPage) ── */
const CLOUD_PLANS = [
  { id: 'starter', name: 'Starter', price: '$10', credits: '100K',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_STARTER || 'pri_01kq8gpgmnvxzgm5vbhqcvmsvh',
    icon: Sparkles },
  { id: 'creator', name: 'Creator', price: '$30', credits: '300K',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_CREATOR || 'pri_01kq8gsa26ej1rjnzmzng215gq',
    icon: Zap, popular: true },
  { id: 'studio', name: 'Studio', price: '$100', credits: '700K',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_STUDIO || 'pri_01kq8gwf6vjt1syhah5wacv334',
    icon: Crown },
] as const;

interface SettingsPageProps {
  onClose: () => void;
  activePalette: string;
  onPaletteChange: (id: string) => void;
  cornerMode: CornerMode;
  onCornerModeChange: (mode: CornerMode) => void;
}

type Tab = 'account' | 'appearance' | 'api-keys' | 'about';

/**
 * SettingsPage — Full-screen settings view.
 * Tabs: Appearance (palette picker + editor), API Keys, About.
 */
export function SettingsPage({
  onClose,
  activePalette,
  onPaletteChange,
  cornerMode,
  onCornerModeChange,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  // Media gen keys (BYOK)
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('');
  const [klingApiKey, setKlingApiKey] = useState('');
  const [klingApiSecret, setKlingApiSecret] = useState('');
  const [byteplusApiKey, setByteplusApiKey] = useState('');
  const [byteplusSeedDreamEndpoint, setByteplusSeedDreamEndpoint] = useState('');
  const [byteplusArkApiKey, setByteplusArkApiKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Custom palette state
  const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);
  const [editorState, setEditorState] = useState<
    | { open: false }
    | { open: true; editing: CustomPalette | null }
  >({ open: false });

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        setGeminiApiKey(data.geminiApiKey || '');
        setOpenaiApiKey(data.openaiApiKey || '');
        setAnthropicApiKey(data.anthropicApiKey || '');
        setElevenlabsApiKey(data.elevenlabsApiKey || '');
        setKlingApiKey(data.klingApiKey || '');
        setKlingApiSecret(data.klingApiSecret || '');
        setByteplusApiKey(data.byteplusApiKey || '');
        setByteplusSeedDreamEndpoint(data.byteplusSeedDreamEndpoint || '');
        setByteplusArkApiKey(data.byteplusArkApiKey || '');
        if (Array.isArray(data.customPalettes)) {
          setCustomPalettes(data.customPalettes);
        }
      })
      .catch(console.error);
  }, []);

  const handleSaveKeys = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        geminiApiKey: geminiApiKey.trim(),
        openaiApiKey: openaiApiKey.trim(),
        anthropicApiKey: anthropicApiKey.trim(),
        elevenlabsApiKey: elevenlabsApiKey.trim(),
        klingApiKey: klingApiKey.trim(),
        klingApiSecret: klingApiSecret.trim(),
        byteplusApiKey: byteplusApiKey.trim(),
        byteplusSeedDreamEndpoint: byteplusSeedDreamEndpoint.trim(),
        byteplusArkApiKey: byteplusArkApiKey.trim(),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaletteChange = async (id: string) => {
    onPaletteChange(id);
    applyPalette(id, customPalettes);
    try {
      await updateSettings({ activePalette: id });
    } catch {
      // Silently ignore — palette is already applied visually
    }
  };

  const handleSaveCustomPalette = async (palette: CustomPalette) => {
    const updated = editorState.open && (editorState as any).editing
      ? customPalettes.map((p) => (p.id === palette.id ? palette : p))
      : [...customPalettes, palette];

    setCustomPalettes(updated);
    setEditorState({ open: false });

    // Apply instantly if this is the active palette
    if (activePalette === palette.id) {
      applyPalette(palette.id, updated);
    }

    try {
      await updateSettings({ customPalettes: updated });
    } catch (err) {
      console.error('[Settings] Failed to persist custom palettes', err);
    }
  };

  const handleDeleteCustomPalette = async (id: string) => {
    const updated = customPalettes.filter((p) => p.id !== id);
    setCustomPalettes(updated);

    // If deleted palette was active, fall back to default
    if (activePalette === id) {
      handlePaletteChange('cool-teal');
    }

    try {
      await updateSettings({ customPalettes: updated });
    } catch (err) {
      console.error('[Settings] Failed to persist palette deletion', err);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Palette }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border overflow-hidden animate-panel-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h2 className="text-base font-semibold tracking-tight">Settings</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar tabs */}
        <nav className="w-44 border-r bg-muted/20 p-3 flex flex-col gap-1 shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {/* ── Account ── */}
          {activeTab === 'account' && (
            <AccountTab />
          )}

          {/* ── Appearance ── */}
          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-8">
              <div>
                <h3 className="text-sm font-semibold mb-1">Color Palette</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Select a built-in theme or create your own. Changes apply instantly.
                </p>

                {editorState.open ? (
                  <PaletteEditor
                    initial={(editorState as any).editing}
                    existingIds={[
                      'cool-teal', 'warm-amber', 'violet-dusk', 'neutral',
                      ...customPalettes.map((p) => p.id),
                    ]}
                    onSave={handleSaveCustomPalette}
                    onCancel={() => setEditorState({ open: false })}
                  />
                ) : (
                  <PalettePicker
                    activePalette={activePalette}
                    customPalettes={customPalettes}
                    onChange={handlePaletteChange}
                    onEditCustom={(p) => setEditorState({ open: true, editing: p })}
                    onDeleteCustom={handleDeleteCustomPalette}
                    onCreateNew={() => setEditorState({ open: true, editing: null })}
                  />
                )}
              </div>

              {/* ── Corner Shape ── */}
              <div>
                <h3 className="text-sm font-semibold mb-1">Corner Shape</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Choose between rounded or sharp corners throughout the app.
                </p>

                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <CornerOption
                    active={cornerMode === 'rounded'}
                    onClick={() => onCornerModeChange('rounded')}
                    icon={Squircle}
                    label="Rounded"
                    description="Soft, modern edges"
                  />
                  <CornerOption
                    active={cornerMode === 'sharp'}
                    onClick={() => onCornerModeChange('sharp')}
                    icon={Square}
                    label="Sharp"
                    description="Crisp, angular edges"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── API Keys ── */}
          {activeTab === 'api-keys' && (
            <div className="max-w-lg space-y-6">
              {/* ── API Mode Toggle ── */}
              <ApiModeSection
                geminiApiKey={geminiApiKey}
                openaiApiKey={openaiApiKey}
                anthropicApiKey={anthropicApiKey}
                elevenlabsApiKey={elevenlabsApiKey}
                klingApiKey={klingApiKey}
                klingApiSecret={klingApiSecret}
                byteplusApiKey={byteplusApiKey}
                byteplusSeedDreamEndpoint={byteplusSeedDreamEndpoint}
                byteplusArkApiKey={byteplusArkApiKey}
                showKeys={showKeys}
                onGeminiChange={setGeminiApiKey}
                onOpenaiChange={setOpenaiApiKey}
                onAnthropicChange={setAnthropicApiKey}
                onElevenlabsChange={setElevenlabsApiKey}
                onKlingKeyChange={setKlingApiKey}
                onKlingSecretChange={setKlingApiSecret}
                onByteplusKeyChange={setByteplusApiKey}
                onByteplusSeedDreamChange={setByteplusSeedDreamEndpoint}
                onByteplusArkChange={setByteplusArkApiKey}
                onToggleShow={() => setShowKeys(!showKeys)}
                onSave={handleSaveKeys}
                isSaving={isSaving}
                saveStatus={saveStatus}
              />
            </div>
          )}

          {/* ── About ── */}
          {activeTab === 'about' && (
            <div className="max-w-lg space-y-6">
              <div className="flex items-center gap-4">
                <PipeFxLogo className="h-20 w-20 text-foreground" title="PipeFX logo" />
                <div>
                  <div className="text-xl font-bold tracking-tight">PipeFX</div>
                  <div className="text-sm text-muted-foreground">Creative Director's Command Center</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Version', value: '0.1.0' },
                  { label: 'Framework', value: 'Tauri 2 + React 19' },
                  { label: 'AI Engine', value: 'Gemini + MCP' },
                  { label: 'License', value: 'Proprietary' },
                ].map((item) => (
                  <div key={item.label} className="bg-muted/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-0.5">{item.label}</div>
                    <div className="text-sm font-medium font-mono">{item.value}</div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                PipeFX connects your AI assistant directly to professional creative tools — DaVinci Resolve, Adobe Premiere, After Effects, Blender, and more — via the Model Context Protocol.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────

function ApiKeyField({
  id, label, value, onChange, show, placeholder, hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  placeholder: string;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm bg-muted/40 border-border/50"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ──────────────────────────────────────────────

function CornerOption({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Square;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {active && (
        <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" />
      )}
    </button>
  );
}

// ──────────────────────────────────────────────

function AccountTab() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saved'>('idle');

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Load display name from Supabase user metadata
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata;
      setDisplayName(meta?.display_name || meta?.full_name || '');
    });
  }, []);

  const handleUpdateName = useCallback(async () => {
    if (!displayName.trim()) return;
    setIsUpdatingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName.trim() },
      });
      if (error) {
        toast.error(error.message);
      } else {
        setNameStatus('saved');
        toast.success('Display name updated.');
        setTimeout(() => setNameStatus('idle'), 2000);
      }
    } catch {
      toast.error('Failed to update display name.');
    } finally {
      setIsUpdatingName(false);
    }
  }, [displayName]);

  const handleChangePassword = useCallback(async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password updated successfully.');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      toast.error('Failed to change password.');
    } finally {
      setIsChangingPassword(false);
    }
  }, [newPassword, confirmPassword]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  return (
    <div className="max-w-lg space-y-8">
      {/* ── Profile ── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">Profile</h3>
          <p className="text-xs text-muted-foreground">
            Manage your account details.
          </p>
        </div>

        {/* Avatar + Email */}
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold uppercase">
            {user?.email?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="w-3 h-3" />
              Email
            </div>
            <div className="text-sm font-medium text-foreground truncate">
              {user?.email || 'Unknown'}
            </div>
          </div>
        </div>

        {/* Display Name */}
        <div className="space-y-1.5">
          <Label htmlFor="display-name" className="text-sm font-medium">
            Display Name
          </Label>
          <div className="flex gap-2">
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              className="bg-muted/40 border-border/50"
            />
            <Button
              onClick={handleUpdateName}
              disabled={isUpdatingName || !displayName.trim()}
              size="sm"
              className="gap-1.5 shrink-0"
            >
              {nameStatus === 'saved' ? (
                <><Check className="w-3.5 h-3.5" /> Saved</>
              ) : (
                <><Save className="w-3.5 h-3.5" /> Save</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Change Password ── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Change Password
          </h3>
          <p className="text-xs text-muted-foreground">
            Update your password. Must be at least 6 characters.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm font-medium">
              New Password
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="bg-muted/40 border-border/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-new-password" className="text-sm font-medium">
              Confirm New Password
            </Label>
            <Input
              id="confirm-new-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="bg-muted/40 border-border/50"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={isChangingPassword || !newPassword || !confirmPassword}
            variant="secondary"
            className="gap-2"
          >
            <Lock className="w-4 h-4" />
            {isChangingPassword ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </div>

      {/* ── Sign Out ── */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-2 w-full h-10 rounded-lg px-4',
            'border border-destructive/30 text-destructive text-sm font-medium',
            'hover:bg-destructive/10 transition-colors',
          )}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          You will be returned to the login screen.
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────

function ApiModeSection({
  geminiApiKey, openaiApiKey, anthropicApiKey,
  elevenlabsApiKey, klingApiKey, klingApiSecret,
  byteplusApiKey, byteplusSeedDreamEndpoint, byteplusArkApiKey,
  showKeys, onGeminiChange, onOpenaiChange, onAnthropicChange,
  onElevenlabsChange, onKlingKeyChange, onKlingSecretChange,
  onByteplusKeyChange, onByteplusSeedDreamChange, onByteplusArkChange,
  onToggleShow, onSave, isSaving, saveStatus,
}: {
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  elevenlabsApiKey: string;
  klingApiKey: string;
  klingApiSecret: string;
  byteplusApiKey: string;
  byteplusSeedDreamEndpoint: string;
  byteplusArkApiKey: string;
  showKeys: boolean;
  onGeminiChange: (v: string) => void;
  onOpenaiChange: (v: string) => void;
  onAnthropicChange: (v: string) => void;
  onElevenlabsChange: (v: string) => void;
  onKlingKeyChange: (v: string) => void;
  onKlingSecretChange: (v: string) => void;
  onByteplusKeyChange: (v: string) => void;
  onByteplusSeedDreamChange: (v: string) => void;
  onByteplusArkChange: (v: string) => void;
  onToggleShow: () => void;
  onSave: () => void;
  isSaving: boolean;
  saveStatus: 'idle' | 'saved' | 'error';
}) {
  const [apiMode, setApiMode] = useState<'byok' | 'cloud'>('byok');
  const [balance, setBalance] = useState<{ available: number; held: number } | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('none');
  const [selectedPlan, setSelectedPlan] = useState('creator');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [isSavingMode, setIsSavingMode] = useState(false);

  /* Paddle */
  const {
    isReady: isPaddleReady,
    openCheckout,
    isConfigured: isPaddleConfigured,
  } = usePaddleCheckout({
    onComplete: async (data) => {
      toast.success('Subscription activated! Credits will arrive shortly.');
      // Write paddle_customer_id to Supabase profile so webhooks can find this user
      const customerId = (data as any)?.customer?.id;
      if (customerId && userId) {
        await supabase.from('profiles').update({ paddle_customer_id: customerId }).eq('id', userId);
      }
      // Refresh balance after a short delay for webhook processing
      setTimeout(refreshBalance, 3000);
    },
    onClose: () => {
      // user dismissed the checkout modal — no action needed
    },
    onError: () => toast.error('Checkout failed. Please try again.'),
  });

  // Load saved API mode settings
  useEffect(() => {
    fetchSettings()
      .then((data: any) => {
        if (data.apiMode === 'cloud') setApiMode('cloud');
      })
      .catch(console.error);
  }, []);

  // Fetch credit balance + subscription status from Supabase
  const refreshBalance = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserEmail(user.email || '');
    setUserId(user.id);
    const { data, error } = await supabase
      .from('profiles')
      .select('credits_balance, held_credits, subscription_status, paddle_subscription_id')
      .eq('id', user.id)
      .single();
    if (!error && data) {
      setBalance({ available: data.credits_balance ?? 0, held: data.held_credits ?? 0 });
      setSubscriptionStatus(data.subscription_status || 'none');
      // We don't store the price_id on profiles, but subscription_status tells us if they're active
    }
  }, []);

  useEffect(() => {
    if (apiMode === 'cloud') refreshBalance();
    else setBalance(null);
  }, [apiMode, refreshBalance]);

  const handleSaveMode = async (newMode: 'byok' | 'cloud') => {
    setApiMode(newMode);
    setIsSavingMode(true);
    try {
      if (newMode === 'cloud') {
        toast.info('Setting up cloud mode...');

        // Read the configured Cloud-API URL from settings (set by admin / env var).
        // Falls back to the canonical production URL if not explicitly configured.
        const savedSettings = await fetchSettings().catch(() => null);
        const cloudApiUrl: string =
          savedSettings?.cloudApiUrl || 'https://pipefx-cloud-api-production.up.railway.app';

        const result = await provisionCloudToken(cloudApiUrl);
        if ('error' in result) {
          // Surface the actual diagnostic message from the Cloud API
          toast.error(`Cloud access failed: ${result.error}`, { duration: 8000 });
          setApiMode('byok');
          return;
        }

        await updateSettings({
          apiMode: 'cloud',
          cloudApiUrl,
          deviceToken: result.token,
        });
        toast.success('Cloud mode activated!');
      } else {
        await updateSettings({ apiMode: 'byok' });
        toast.success('Switched to BYOK mode.');
      }
    } catch {
      toast.error('Failed to save mode.');
    } finally {
      setIsSavingMode(false);
    }
  };


  return (
    <>
      {/* ── Mode Toggle ── */}
      <div>
        <h3 className="text-sm font-semibold mb-1">API Mode</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Choose how PipeFX connects to AI providers.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isSavingMode}
            onClick={() => handleSaveMode('byok')}
            className={cn(
              'group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
              apiMode === 'byok'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
            )}
          >
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              apiMode === 'byok'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
            )}>
              <Key className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-sm font-semibold">Your API Keys</div>
              <div className="text-xs text-muted-foreground">Use your own provider keys. No usage limits.</div>
            </div>
            {apiMode === 'byok' && <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" />}
          </button>

          <button
            type="button"
            disabled={isSavingMode}
            onClick={() => handleSaveMode('cloud')}
            className={cn(
              'group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
              apiMode === 'cloud'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
            )}
          >
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              apiMode === 'cloud'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
            )}>
              <Cloud className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-sm font-semibold">PipeFX Cloud</div>
              <div className="text-xs text-muted-foreground">Pay with credits. No keys needed.</div>
            </div>
            {apiMode === 'cloud' && <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" />}
          </button>
        </div>
      </div>

      {/* ── Cloud Mode Settings ── */}
      {apiMode === 'cloud' && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Cloud Settings</h3>
          </div>

          {/* Credit Balance Widget */}
          {balance && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Credit Balance
                  </span>
                </div>
                <button
                  type="button"
                  onClick={refreshBalance}
                  className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Refresh
                </button>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
                  {balance.available.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">credits</span>
              </div>
              {balance.held > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {balance.held.toLocaleString()} credits reserved (in-flight)
                </div>
              )}
            </div>
          )}
          {(!balance && apiMode === 'cloud') && (
            <div className="rounded-lg border border-border/50 bg-muted/10 p-3 text-center">
              <p className="text-xs text-muted-foreground/50">Loading credit balance…</p>
            </div>
          )}

          {/* ── Plan Management ── */}
          {isPaddleConfigured && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  {subscriptionStatus === 'active' ? 'Your Plan' : 'Choose a Plan'}
                </h4>
                {subscriptionStatus === 'active' && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-500 bg-emerald-500/10 rounded-full px-2 py-0.5">
                    Active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CLOUD_PLANS.map((plan) => {
                  const active = selectedPlan === plan.id;
                  const Icon = plan.icon;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={cn(
                        'relative flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition-all',
                        'border',
                        active
                          ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border/60 hover:border-primary/25 hover:bg-muted/30'
                      )}
                    >
                      {(plan as any).popular && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-1.5 py-px">
                          Popular
                        </span>
                      )}
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          active ? 'text-primary' : 'text-muted-foreground/50'
                        )}
                      />
                      <span className={cn(
                        'text-xs font-semibold',
                        active ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {plan.name}
                      </span>
                      <span className={cn(
                        'text-lg font-bold tabular-nums leading-none',
                        active ? 'text-foreground' : 'text-muted-foreground/60'
                      )}>
                        {plan.price}
                        <span className="text-[10px] font-normal text-muted-foreground/50">/mo</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {plan.credits} credits
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={() => {
                  const plan = CLOUD_PLANS.find((p) => p.id === selectedPlan);
                  if (plan && isPaddleReady) openCheckout(plan.paddlePriceId, userEmail, userId);
                }}
                disabled={!isPaddleReady}
                className="w-full gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {subscriptionStatus === 'active' ? 'Change Plan' : 'Subscribe'}
              </Button>
              <p className="text-[10px] text-muted-foreground/50 text-center">
                Managed by Paddle · Cancel anytime
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── BYOK Mode Settings ── */}
      {apiMode === 'byok' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold mb-1">AI Provider Keys</h3>
              <p className="text-xs text-muted-foreground">
                Keys are stored locally and never sent to third parties.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground"
              onClick={onToggleShow}
            >
              {showKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showKeys ? 'Hide' : 'Show'}
            </Button>
          </div>

          <div className="space-y-4">
            <ApiKeyField
              id="gemini"
              label="Google Gemini"
              value={geminiApiKey}
              onChange={onGeminiChange}
              show={showKeys}
              placeholder="AIzaSy..."
              hint="Required for AI chat + image generation"
            />
            <ApiKeyField
              id="openai"
              label="OpenAI"
              value={openaiApiKey}
              onChange={onOpenaiChange}
              show={showKeys}
              placeholder="sk-..."
              hint="For GPT chat + GPT Image 2 generation"
            />
            <ApiKeyField
              id="anthropic"
              label="Anthropic"
              value={anthropicApiKey}
              onChange={onAnthropicChange}
              show={showKeys}
              placeholder="sk-ant-..."
              hint="For Claude model access"
            />
          </div>

          {/* ── Media Gen Providers ── */}
          <div className="pt-2 border-t border-border/40">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Media Generation
            </h4>
            <div className="space-y-4">
              <ApiKeyField
                id="elevenlabs"
                label="ElevenLabs"
                value={elevenlabsApiKey}
                onChange={onElevenlabsChange}
                show={showKeys}
                placeholder="sk_..."
                hint="For text-to-speech, sound effects, and audio tools"
              />
              <ApiKeyField
                id="kling-key"
                label="Kling API Key"
                value={klingApiKey}
                onChange={onKlingKeyChange}
                show={showKeys}
                placeholder="ak-..."
                hint="For Kling 3.0 video generation"
              />
              <ApiKeyField
                id="kling-secret"
                label="Kling API Secret"
                value={klingApiSecret}
                onChange={onKlingSecretChange}
                show={showKeys}
                placeholder="sk-..."
                hint="Paired with the API Key above"
              />
              <ApiKeyField
                id="byteplus-key"
                label="BytePlus API Key"
                value={byteplusApiKey}
                onChange={onByteplusKeyChange}
                show={showKeys}
                placeholder="..."
                hint="For SeedDream 5 image generation"
              />
              <ApiKeyField
                id="byteplus-seeddream"
                label="BytePlus SeedDream Endpoint"
                value={byteplusSeedDreamEndpoint}
                onChange={onByteplusSeedDreamChange}
                show={showKeys}
                placeholder="ep-..."
                hint="SeedDream endpoint ID from BytePlus console"
              />
              <ApiKeyField
                id="byteplus-ark"
                label="BytePlus ARK API Key"
                value={byteplusArkApiKey}
                onChange={onByteplusArkChange}
                show={showKeys}
                placeholder="..."
                hint="For SeedDance 2.0 video generation"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={onSave} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Keys'}
            </Button>
            {saveStatus === 'saved' && (
              <span className="text-sm text-success font-medium">Saved</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm text-destructive font-medium">Save failed. Is the backend running?</span>
            )}
          </div>
        </>
      )}
    </>
  );
}

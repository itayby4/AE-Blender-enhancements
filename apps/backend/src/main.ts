import { ConnectorRegistry } from '@pipefx/connectors';
import type { McpEventMap } from '@pipefx/connectors';
import { mountConnectorRoutes } from '@pipefx/connectors/backend';
import { createEventBus } from '@pipefx/event-bus';
import {
  createCapabilityMatcher,
  createSkillRunner,
  type CapabilityMatcherHandle,
} from '@pipefx/skills/domain';
import {
  createScriptRunner,
  createSkillMdStorage,
  createSkillRunStore,
  mountSkillRoutes,
  registerSkillBrainTools,
} from '@pipefx/skills/backend';
import type { SkillEventMap } from '@pipefx/skills/contracts';
import { createAgent } from '@pipefx/brain-loop';
import type { Agent } from '@pipefx/agent-loop-kernel';
import {
  AgentSessionStore,
  createTaskOutputStore,
  getAllTaskTypes,
  mountAgentTaskRoutes,
} from '@pipefx/brain-tasks';
import type { TodoItem } from '@pipefx/brain-contracts';
import {
  BUILT_IN_AGENTS,
  brainSubagentsLog,
  composeProfiles,
  createSubAgentRuntime,
  loadAgentsDir,
  registerAgentTools,
  type AgentProfile,
  type SubAgentEvent,
} from '@pipefx/brain-subagents';
import {
  createInMemoryPlanApprovalBroker,
  mountPlanningRoutes,
} from '@pipefx/brain-planning';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as os from 'node:os';
import * as path from 'node:path';
import { createServer } from 'http';
import { config, updateConfig } from './config.js';
import { loadSettings } from './utils/settings.js';
// Phase 9.3: workflows + their HTTP routes moved into @pipefx/post-production.
// We import the registration helper for the brain-side tool surface and the
// `mountWorkflowRoutes` mount for the desktop-direct HTTP endpoints.
import {
  registerLocalWorkflows,
  createLocalToolContext,
  type LocalToolContext,
} from '@pipefx/post-production/workflows';
import { mountWorkflowRoutes } from '@pipefx/post-production/backend';
// Phase 9.B: image / video / sound gen lives in @pipefx/media-gen — the
// route mount replaces the inline `/api/ai-models` + `/api/save-render`
// handlers that used to live under apps/backend/src/api/.
import { mountMediaGenRoutes } from '@pipefx/media-gen/backend';
import { calculateCost, createSqliteUsageStore, createUsageEvent } from '@pipefx/usage';
import type { UsageStore } from '@pipefx/usage';
import { composeSystemPrompt } from './prompts/index.js';
import { mountChatRoutes } from '@pipefx/chat/backend';
import {
  createChatLogger,
  createChatSessionStore,
  createPostRoundReminderFactory,
  createTaskProgressTracker,
  createTasksApi,
  createTranscriptStore,
} from './chat-deps.js';

// ── AI Brain (SQLite-backed memory engine) ──
import {
  configureMemoryStore,
  getDatabase,
  migrateJsonProjects,
  memoryTaskManager,
  addKnowledge,
  searchKnowledge,
  updateKnowledge,
  forgetKnowledge,
  listKnowledge,
  getProject,
  addProjectMemory,
} from '@pipefx/brain-memory';
import type { KnowledgeCategory } from '@pipefx/brain-memory';

// ΓöÇΓöÇ Router & Routes ΓöÇΓöÇ
import { Router } from './router.js';
import { registerSkillFileRoutes } from './routes/skill-files.js';
import { registerUsageRoutes } from './routes/usage.js';
import { registerMiscRoutes } from './routes/misc.js';
import { mountMemoryRoutes, assembleProjectContext } from '@pipefx/brain-memory';
import { createAuthMiddleware } from '@pipefx/auth/backend';

async function main() {
  console.log('Starting PipeFX AI Engine...');

  const loadedSettings = await loadSettings();
  updateConfig(loadedSettings);

  // ── Auth gate middleware (Supabase JWT verifier) ──
  // Built after config is finalized so it sees loaded settings.
  const verifyAuth = createAuthMiddleware({
    supabaseUrl: config.supabaseUrl,
    supabaseServiceKey: config.supabaseServiceKey,
  });

  // ── Shared event bus ──
  // Carries both MCP lifecycle events (mcp.tools.changed etc.) and skills
  // events (skills.available-changed, skills.run.*). The connector registry
  // publishes the MCP half; the capability matcher subscribes to it and
  // publishes the skills half. Other reactive consumers (chat composer
  // badges, telemetry) can subscribe later without rewiring the producers.
  const bus = createEventBus<McpEventMap & SkillEventMap>();

  // ── Connector Registry ──
  const registry = new ConnectorRegistry({ eventBus: bus });
  registry.register(config.connectors.resolve);
  if (config.connectors.premiere) registry.register(config.connectors.premiere);
  if (config.connectors.aftereffects)
    registry.register(config.connectors.aftereffects);
  if (config.connectors.blender) registry.register(config.connectors.blender);
  if (config.connectors.ableton) registry.register(config.connectors.ableton);
  registerLocalWorkflows(registry, {
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
  });

  // ── Database init ──
  configureMemoryStore({ workspaceRoot: config.workspaceRoot });
  getDatabase();
  const migrationResult = migrateJsonProjects();
  if (migrationResult.migrated > 0) {
    console.log(
      `[Memory] Migrated ${migrationResult.migrated} projects from JSON ΓåÆ SQLite (${migrationResult.skipped} already existed)`
    );
  }
  // ── Usage Store (SQLite-backed usage tracking) ──
  const usageStore: UsageStore = createSqliteUsageStore(getDatabase());
  console.log('[Usage] SQLite usage store initialized');

  const purged = memoryTaskManager.purgeOldTasks();
  if (purged > 0) {
    console.log(`[Memory] Startup cleanup: purged ${purged} old completed tasks`);
  }

  // ── Agent session state + task output + sub-agent runtime ──
  const sessionALS = new AsyncLocalStorage<string>();
  const agentSessions = new AgentSessionStore();
  const taskOutput = createTaskOutputStore({
    rootDir: path.join(os.tmpdir(), 'pipefx-agents'),
  });

  // SSE broadcaster: chat route registers a per-session emitter here so
  // tool handlers can push todo_updated / plan_proposed / subagent_* events
  // into the live SSE stream.
  type SessionSseEmit = (ev: Record<string, unknown>) => void;
  const sseEmitters = new Map<string, SessionSseEmit>();
  const sseBroker = {
    set(sessionId: string, emit: SessionSseEmit) {
      sseEmitters.set(sessionId, emit);
      brainSubagentsLog.debug('sse-broker attach', { sessionId });
    },
    clear(sessionId: string) {
      sseEmitters.delete(sessionId);
      brainSubagentsLog.debug('sse-broker detach', { sessionId });
    },
    emit(sessionId: string, ev: Record<string, unknown>) {
      const emitter = sseEmitters.get(sessionId);
      if (emitter) {
        brainSubagentsLog.debug('sse-broker emit', {
          sessionId,
          type: ev.type as string | undefined,
        });
        emitter(ev);
      } else {
        brainSubagentsLog.warn('sse-broker drop (no listener)', {
          sessionId,
          type: ev.type as string | undefined,
        });
      }
    },
  };

  const planBroker = createInMemoryPlanApprovalBroker();

  // ── Register local AI tools (OpenClaude-style agents + memory) ──
  // `registerTaskTools` (old create_task_plan / update_task_step / finish_task)
  // is replaced by the @pipefx/brain-subagents TodoWrite + Task* suite.
  registerMemoryTools(registry);

  // Sub-agent runtime needs an AgentConfig base. Constructed after the
  // top-level `agent` below, but we need the base here — recreate the same
  // shape. Keeping a single source of truth via a local helper.
  const baseAgentConfig = {
    model: config.geminiModel,
    apiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    anthropicApiKey: config.anthropicApiKey,
    systemPrompt: config.systemPrompt,
    registry,
    // If the user saved cloud mode settings, route LLM calls through the cloud-api
    cloudConfig: loadedSettings.apiMode === 'cloud' && loadedSettings.deviceToken
      ? { cloudApiUrl: loadedSettings.cloudApiUrl, deviceToken: loadedSettings.deviceToken }
      : undefined,
  };

  // Compose built-in agent profiles with any user-provided ones from
  // `<cwd>/.pipefx/agents/*.json` (opt-in; missing dir is fine).
  const userAgentsDir = path.join(process.cwd(), '.pipefx', 'agents');
  const userProfiles: AgentProfile[] = await loadAgentsDir(userAgentsDir);
  const profiles = composeProfiles(BUILT_IN_AGENTS, userProfiles);
  const taskTypes = getAllTaskTypes();

  const subAgents = createSubAgentRuntime({
    agentConfigBase: baseAgentConfig,
    sessions: agentSessions,
    taskOutput,
    agentProfiles: profiles,
  });

  brainSubagentsLog.info('wiring agent tools', {
    tempDir: path.join(os.tmpdir(), 'pipefx-agents'),
    builtInAgents: BUILT_IN_AGENTS.length,
    userAgents: userProfiles.length,
    taskTypes: taskTypes.length,
  });

  registerAgentTools(registry, {
    taskTypes,
    profiles,
    sessions: agentSessions,
    subAgents,
    taskOutput,
    broker: planBroker,
    getSessionId: () => sessionALS.getStore(),
    onTodosUpdated: (sessionId: string, todos: TodoItem[]) => {
      sseBroker.emit(sessionId, { type: 'todo_updated', sessionId, todos });
    },
    onPlanProposed: (sessionId: string, taskId: string, plan: string) => {
      sseBroker.emit(sessionId, { type: 'plan_proposed', sessionId, taskId, plan });
    },
    onPlanResolved: (
      sessionId: string,
      taskId: string,
      approved: boolean,
      feedback?: string
    ) => {
      sseBroker.emit(sessionId, {
        type: 'plan_resolved',
        taskId,
        approved,
        feedback,
      });
    },
    onSubAgentEvent: (sessionId: string, ev: SubAgentEvent) => {
      // Separate the inner event `type` from our outer SSE envelope `type`
      // (e.g. `subagent_start`), and forward the remaining payload fields.
      const { type: innerType, ...rest } = ev;
      sseBroker.emit(sessionId, {
        type: `subagent_${innerType}`,
        ...rest,
      });
    },
  });

  // Connect to the default app connector.
  // If Resolve isn't running, the MCP server exits and we log a clean message.
  try {
    await registry.switchActiveConnector('resolve');
  } catch {
    // Silently handled ΓÇö connector will auto-reconnect on first tool call
  }

  // ΓöÇΓöÇ Mutable state ΓöÇΓöÇ
  // Phase 9.3: workflow context construction moved into the package's
  // `createLocalToolContext` helper. Kept as a `let` because the cloud
  // mode toggle below replaces the agent in place; the workflow context
  // doesn't actually mutate today, but the `let` makes the future hot-
  // swap (when API keys can rotate at runtime) cheap.
  let workflowContext: LocalToolContext = createLocalToolContext(registry, {
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
  });

  let agent: Agent = createAgent(baseAgentConfig);

  // ── Skills surface (Phase 12 — SKILL.md / three-mode runner) ──
  // Two roots: a read-only `<workspaceRoot>/SKILL/` for built-ins
  // (populated by `@pipefx/skills-builtin` in 12.9; today the directory
  // is optional and may not exist yet), plus the writable user root at
  // `<workspaceRoot>/data/skills/` where `.pfxskill` bundles unpack.
  //
  // The matcher subscribes to `mcp.tools.changed`, `skills.installed`,
  // and `skills.uninstalled` on the shared bus and recomputes the
  // availability snapshot on each. The install / uninstall routes are
  // what publish the latter two — we don't need to nudge the matcher
  // manually anymore.
  const skillStore = createSkillMdStorage({
    userRoot: path.join(config.workspaceRoot, 'data', 'skills'),
    builtinRoot: path.join(config.workspaceRoot, 'SKILL'),
  });
  const skillsMatcher: CapabilityMatcherHandle = createCapabilityMatcher({
    store: skillStore,
    bus,
  });

  const skillsRunStore = createSkillRunStore();
  const skillsScriptRunner = createScriptRunner();
  const skillsRunner = createSkillRunner({
    store: skillStore,
    runStore: skillsRunStore,
    matcher: skillsMatcher,
    // Agent.chat from @pipefx/agent-loop-kernel is a strict superset of
    // BrainLoopApi.chat — accepts the same {sessionId, allowedTools} shape
    // and returns Promise<string>. The cast keeps the structural match
    // explicit without dragging extra plumbing in.
    brain: { chat: (msg, opts) => agent.chat(msg, opts) },
    bus,
    scriptRunner: skillsScriptRunner,
  });

  // ── Build Router ──
  const router = new Router();

  mountChatRoutes(router, {
    getAgent: () => agent,
    registry,
    sessionALS,
    sseBroker,
    sessions: createChatSessionStore(),
    transcript: createTranscriptStore(),
    taskProgress: createTaskProgressTracker(),
    logger: createChatLogger(),
    reminders: createPostRoundReminderFactory(),
    tasks: createTasksApi(agentSessions),
    planBroker,
    usageStore,
    buildSystemPrompt: async (skill, activeApp, projectId) => {
      const s = skill as { systemInstruction?: string } | null | undefined;
      if (s?.systemInstruction && !activeApp) {
        return s.systemInstruction;
      }
      const projectContext = projectId
        ? assembleProjectContext(projectId, '') || undefined
        : undefined;
      return composeSystemPrompt({
        activeApp,
        skillSystemInstruction: s?.systemInstruction,
        projectContext,
        legacySections: config.systemPromptLegacy,
      });
    },
    calculateCost,
    createUsageEvent,
  });
  mountPlanningRoutes(router, {
    planBroker,
    agentSessions,
  });
  mountAgentTaskRoutes(router, {
    agentSessions,
    taskOutput,
  });
  mountMemoryRoutes(router);
  mountConnectorRoutes(router, { registry });
  registerSkillFileRoutes(router);
  mountSkillRoutes(router, {
    store: skillStore,
    runs: skillsRunStore,
    matcher: skillsMatcher,
    runner: skillsRunner,
    bus,
  });

  // Phase 12.14: register the brain-side `create_skill` tool so the
  // chat-driven authoring flow can persist a SKILL.md end-to-end. The
  // connector registry is the brain's tool surface — adding a local tool
  // here is the same pattern the memory tools use (see registerMemoryTools
  // below).
  registerSkillBrainTools(registry, { store: skillStore, bus });
  registerUsageRoutes(router, {
    usageStore,
    getUserId: () => 'local-user', // BYOK: no authenticated user, hardcode local
  });
  registerMiscRoutes(router, {
    registry,
    setAgent: (a) => { agent = a; },
    getWorkflowContext: () => workflowContext,
    setWorkflowContext: (ctx) => { workflowContext = ctx; },
  });

  // Phase 9.3: workflow HTTP routes (subtitles/audio-sync/autopod) moved
  // out of misc.ts and into the post-production package's mount. Closure
  // over `workflowContext` so settings-driven swaps still take effect
  // for in-flight requests.
  mountWorkflowRoutes(router, {
    registry,
    getContext: () => workflowContext,
  });

  // Phase 9.B: media-gen HTTP routes (/api/ai-models, /api/save-render)
  // moved out of apps/backend/src/api/ into @pipefx/media-gen. The mount
  // is parameterless today; pass `saveRender.rendersDir` here once a
  // user-facing setting exists.
  mountMediaGenRoutes(router);

  // ΓöÇΓöÇ HTTP Server ΓöÇΓöÇ
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // ── Auth gate: verify Supabase JWT on every request ──
    const authUser = await verifyAuth(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const handled = await router.handle(req, res);
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(config.port, () => {
    console.log(
      `\nBackend HTTP server is listening on http://localhost:${config.port}`
    );
    console.log('Ready to receive commands from PipeFX Desktop!');
  });
}

// ── Local Tool Registration ──
// NOTE: `registerTaskTools` (create_task_plan / update_task_step / finish_task)
// was replaced by the OpenClaude-style TodoWrite + Task* suite provided by
// `@pipefx/brain-subagents` and wired above via `registerAgentTools`.
// `memoryTaskManager` is retained for UI progress-bar integration only.

function registerMemoryTools(registry: ConnectorRegistry) {
  registry.registerLocalTool(
    'remember',
    'Store a new piece of knowledge about the project or user. Use this to remember creative rules, preferences, facts, decisions, constraints, style guidelines, content analysis results, or media inventory. Categories: creative_rule, preference, fact, decision, constraint, style_guide, behavior, content_analysis, media_inventory.',
    {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Active Project ID. Omit for global (cross-project) knowledge.',
        },
        category: {
          type: 'string',
          enum: ['creative_rule', 'preference', 'fact', 'decision', 'constraint', 'style_guide', 'behavior', 'content_analysis', 'media_inventory'],
          description: 'The category of knowledge being stored.',
        },
        subject: {
          type: 'string',
          description: 'Brief subject/title of this knowledge (used for search).',
        },
        content: {
          type: 'string',
          description: 'The actual knowledge content to remember.',
        },
      },
      required: ['category', 'subject', 'content'],
    },
    async (args: any) => {
      const item = addKnowledge({
        projectId: args.projectId,
        category: args.category as KnowledgeCategory,
        subject: args.subject,
        content: args.content,
        source: 'ai_extracted',
      });
      return `Knowledge stored (id: ${item.id}): [${item.category}] ${item.subject}`;
    }
  );

  registry.registerLocalTool(
    'recall',
    'Search your memory for relevant knowledge about a topic. Returns matching facts, rules, preferences, and decisions.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The topic or question to search memory for.' },
        projectId: { type: 'string', description: 'Scope search to a specific project. Omit to search all.' },
        limit: { type: 'number', description: 'Max results to return (default 10).' },
      },
      required: ['query'],
    },
    async (args: any) => {
      const results = searchKnowledge(args.query, args.projectId, args.limit ?? 10);
      if (results.length === 0) return 'No matching knowledge found.';
      const formatted = results
        .map((k) => `[${k.id}] [${k.category}] ${k.subject}: ${k.content}`)
        .join('\n');
      return `Found ${results.length} matching items:\n${formatted}`;
    }
  );

  registry.registerLocalTool(
    'update_knowledge',
    'Update or correct an existing piece of knowledge. Creates a new version while preserving history.',
    {
      type: 'object',
      properties: {
        knowledgeId: { type: 'number', description: 'The ID of the knowledge item to update.' },
        newContent: { type: 'string', description: 'The updated content.' },
        reason: { type: 'string', description: 'Why this knowledge is being updated.' },
      },
      required: ['knowledgeId', 'newContent'],
    },
    async (args: any) => {
      const updated = updateKnowledge(args.knowledgeId, args.newContent, args.reason);
      return updated
        ? `Knowledge updated (new id: ${updated.id}). Old version archived.`
        : `Knowledge item ${args.knowledgeId} not found.`;
    }
  );

  registry.registerLocalTool(
    'forget',
    'Mark a piece of knowledge as no longer relevant. It is archived, not permanently deleted.',
    {
      type: 'object',
      properties: {
        knowledgeId: { type: 'number', description: 'The ID of the knowledge item to forget.' },
        reason: { type: 'string', description: 'Why this knowledge is being forgotten.' },
      },
      required: ['knowledgeId'],
    },
    async (args: any) => {
      const success = forgetKnowledge(args.knowledgeId);
      return success
        ? `Knowledge item ${args.knowledgeId} forgotten (archived).`
        : `Knowledge item ${args.knowledgeId} not found or already forgotten.`;
    }
  );

  registry.registerLocalTool(
    'get_project_brief',
    'Get the full creative context and all stored knowledge for the active project.',
    {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID to get the brief for.' },
      },
      required: ['projectId'],
    },
    async (args: any) => {
      const project = getProject(args.projectId);
      if (!project) return `Project ${args.projectId} not found.`;
      const knowledge = listKnowledge(args.projectId);
      const sections = [
        `## Project: ${project.name}`,
        project.genre ? `Genre: ${project.genre}` : null,
        project.targetPlatforms?.length
          ? `Platforms: ${project.targetPlatforms.join(', ')}`
          : null,
        '',
        `## Knowledge (${knowledge.length} items)`,
        ...knowledge.map((k) => `- [${k.category}] ${k.subject}: ${k.content}`),
      ];
      return sections.filter(Boolean).join('\n');
    }
  );

  // Legacy compat
  registry.registerLocalTool(
    'save_project_memory',
    'Permanently save a note or preference for the current editing project. Use this when the user asks you to remember something for later.',
    {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The Active Project ID, provided by the UI framework.' },
        note: { type: 'string', description: 'The note or preference to remember permanently.' },
      },
      required: ['projectId', 'note'],
    },
    async (args: any) => {
      const item = addProjectMemory(args.projectId, args.note);
      return item ? `Memory saved to project ${args.projectId}` : `Project not found`;
    }
  );
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

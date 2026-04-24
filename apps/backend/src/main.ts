import { ConnectorRegistry } from '@pipefx/mcp';
import { createAgent } from '@pipefx/ai';
import type { Agent } from '@pipefx/ai';
import {
  AgentSessionStore,
  createTaskOutputStore,
  createSubAgentRuntime,
  registerAgentTools,
  agentsLog,
  loadAgentsDir,
  composeProfiles,
  BUILT_IN_AGENTS,
  getAllTaskTypes,
  type SubAgentEvent,
  type TodoItem,
  type AgentProfile,
} from '@pipefx/agents';
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
import { registerLocalWorkflows } from './workflows/index.js';
import { createSubtitleHandler } from './api/subtitles.js';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';
import { createSqliteUsageStore } from '@pipefx/usage';
import type { UsageStore } from '@pipefx/usage';

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
import { registerChatRoutes } from './routes/chat.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerSkillRoutes } from './routes/skills.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerUsageRoutes } from './routes/usage.js';
import { registerMiscRoutes } from './routes/misc.js';
import { mountMemoryRoutes } from '@pipefx/brain-memory';
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

  // ΓöÇΓöÇ Connector Registry ΓöÇΓöÇ
  const registry = new ConnectorRegistry();
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
      agentsLog.debug('sse-broker attach', { sessionId });
    },
    clear(sessionId: string) {
      sseEmitters.delete(sessionId);
      agentsLog.debug('sse-broker detach', { sessionId });
    },
    emit(sessionId: string, ev: Record<string, unknown>) {
      const emitter = sseEmitters.get(sessionId);
      if (emitter) {
        agentsLog.debug('sse-broker emit', {
          sessionId,
          type: ev.type as string | undefined,
        });
        emitter(ev);
      } else {
        agentsLog.warn('sse-broker drop (no listener)', {
          sessionId,
          type: ev.type as string | undefined,
        });
      }
    },
  };

  const planBroker = createInMemoryPlanApprovalBroker();

  // ── Register local AI tools (OpenClaude-style agents + memory) ──
  // `registerTaskTools` (old create_task_plan / update_task_step / finish_task)
  // is replaced by the @pipefx/agents TodoWrite + Task* suite.
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

  agentsLog.info('wiring agent tools', {
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
  let workflowContext = {
    registry,
    ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
    openai: new OpenAI({ apiKey: config.openaiApiKey }),
  };

  let handleSubtitleGenerate = createSubtitleHandler(
    registry,
    workflowContext
  );

  let agent: Agent = createAgent(baseAgentConfig);

  // ΓöÇΓöÇ Build Router ΓöÇΓöÇ
  const router = new Router();

  registerChatRoutes(router, {
    getAgent: () => agent,
    registry,
    sessionALS,
    sseBroker,
    agentSessions,
    planBroker,
    usageStore,
  });
  mountPlanningRoutes(router, {
    planBroker,
    agentSessions,
  });
  registerAgentRoutes(router, {
    agentSessions,
    taskOutput,
  });
  mountMemoryRoutes(router);
  registerProjectRoutes(router, { registry });
  registerSkillRoutes(router);
  registerSessionRoutes(router);
  registerUsageRoutes(router, {
    usageStore,
    getUserId: () => 'local-user', // BYOK: no authenticated user, hardcode local
  });
  registerMiscRoutes(router, {
    registry,
    setAgent: (a) => { agent = a; },
    getWorkflowContext: () => workflowContext,
    setWorkflowContext: (ctx) => { workflowContext = ctx; },
    getSubtitleHandler: () => handleSubtitleGenerate as any,
    setSubtitleHandler: (h: any) => { handleSubtitleGenerate = h; },
  });

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
// `@pipefx/agents` and wired above via `registerAgentTools`.
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

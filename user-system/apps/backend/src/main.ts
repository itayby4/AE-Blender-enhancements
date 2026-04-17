import { ConnectorRegistry } from '@pipefx/mcp';
import { createAgent } from '@pipefx/ai';
import type { Agent } from '@pipefx/ai';
import { createServer } from 'http';
import { config, updateConfig } from './config.js';
import { loadSettings } from './utils/settings.js';
import { registerLocalWorkflows } from './workflows/index.js';
import { createSubtitleHandler } from './api/subtitles.js';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';

// ── Auth ──
import { verifyAuth } from './middleware/auth.js';

// ── AI Brain (SQLite-backed memory engine) ──
import {
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
} from './services/memory/index.js';
import type { KnowledgeCategory } from './services/memory/index.js';

// ── Router & Routes ──
import { Router } from './router.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerSkillRoutes } from './routes/skills.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerMiscRoutes } from './routes/misc.js';

async function main() {
  console.log('Starting PipeFX AI Engine...');

  const loadedSettings = await loadSettings();
  updateConfig(loadedSettings);

  // ── Connector Registry ──
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
  getDatabase();
  const migrationResult = migrateJsonProjects();
  if (migrationResult.migrated > 0) {
    console.log(
      `[Memory] Migrated ${migrationResult.migrated} projects from JSON → SQLite (${migrationResult.skipped} already existed)`
    );
  }
  const purged = memoryTaskManager.purgeOldTasks();
  if (purged > 0) {
    console.log(`[Memory] Startup cleanup: purged ${purged} old completed tasks`);
  }

  // ── Register local AI tools (task management + memory) ──
  registerTaskTools(registry);
  registerMemoryTools(registry);

  // Connect to the default app connector.
  // If Resolve isn't running, the MCP server exits and we log a clean message.
  try {
    await registry.switchActiveConnector('resolve');
  } catch {
    // Silently handled — connector will auto-reconnect on first tool call
  }

  // ── Mutable state ──
  let workflowContext = {
    registry,
    ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
    openai: new OpenAI({ apiKey: config.openaiApiKey }),
  };

  let handleSubtitleGenerate = createSubtitleHandler(
    registry,
    workflowContext
  );

  let agent: Agent = createAgent({
    model: config.geminiModel,
    apiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    anthropicApiKey: config.anthropicApiKey,
    systemPrompt: config.systemPrompt,
    registry,
  });

  // ── Build Router ──
  const router = new Router();

  registerChatRoutes(router, { getAgent: () => agent, registry });
  registerTaskRoutes(router);
  registerProjectRoutes(router, { registry });
  registerMemoryRoutes(router);
  registerSkillRoutes(router);
  registerSessionRoutes(router);
  registerMiscRoutes(router, {
    registry,
    setAgent: (a) => { agent = a; },
    getWorkflowContext: () => workflowContext,
    setWorkflowContext: (ctx) => { workflowContext = ctx; },
    getSubtitleHandler: () => handleSubtitleGenerate as any,
    setSubtitleHandler: (h: any) => { handleSubtitleGenerate = h; },
  });

  // ── HTTP Server ──
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // ── Auth Gate ──
    // Every request must carry a valid Supabase JWT.
    // If missing or invalid, reject with 401 before routing.
    const user = await verifyAuth(req);
    if (!user) {
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

// ── Local Tool Registration (keeps tool definitions out of main flow) ──

function registerTaskTools(registry: ConnectorRegistry) {
  registry.registerLocalTool(
    'create_task_plan',
    'Create a checklist for a long-running complex task',
    {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'A unique ID for the task' },
        name: { type: 'string', description: 'Brief name of the task' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of step descriptions',
        },
      },
      required: ['taskId', 'name', 'steps'],
    },
    async (args: any) => {
      memoryTaskManager.createTask(args.taskId, args.name, args.steps);
      return `Task ${args.taskId} created successfully.`;
    }
  );

  registry.registerLocalTool(
    'update_task_step',
    'Update the status of a specific step in an active task',
    {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        stepIndex: { type: 'number', description: '0-based index of the step' },
        status: { type: 'string', enum: ['in-progress', 'done', 'error'] },
      },
      required: ['taskId', 'stepIndex', 'status'],
    },
    async (args: any) => {
      const task = memoryTaskManager.updateTaskStep(
        args.taskId,
        args.stepIndex,
        args.status as any
      );
      return task ? `Step updated` : `Task not found`;
    }
  );

  registry.registerLocalTool(
    'finish_task',
    'Mark the entire task as done or error',
    {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['done', 'error'] },
      },
      required: ['taskId', 'status'],
    },
    async (args: any) => {
      const task = memoryTaskManager.finishTask(
        args.taskId,
        args.status as any
      );
      return task ? `Task finished` : `Task not found`;
    }
  );
}

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

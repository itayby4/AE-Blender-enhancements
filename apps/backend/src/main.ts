import { ConnectorRegistry } from '@pipefx/mcp';
import { createAgent } from '@pipefx/ai';
import { createServer } from 'http'; // Reload trigger 2
import { config, updateConfig } from './config.js';
import { loadSettings, saveSettings } from './utils/settings.js';
import { registerLocalWorkflows, getTimelineInfoWorkflow, autopodWorkflow } from './workflows/index.js';
import { handleAiModelRequest } from './api/ai-models/router.js';
import { handleSaveRenderRequest } from './api/save-render.js';
import { createSubtitleHandler } from './api/subtitles.js';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';

// ── AI Brain (SQLite-backed memory engine) ──
import {
  getDatabase,
  migrateJsonProjects,
  memoryTaskManager,
  listProjects,
  getProject,
  createProject,
  addProjectMemory,
  deleteProjectMemoryByIndex,
  addKnowledge,
  searchKnowledge,
  updateKnowledge,
  forgetKnowledge,
  listKnowledge,
  getProjectMemories,
  assembleProjectContext,
} from './services/memory/index.js';
import type { KnowledgeCategory, TaskEvent } from './services/memory/index.js';

async function main() {
  console.log('Starting PipeFX AI Engine...');

  const loadedSettings = await loadSettings();
  updateConfig(loadedSettings);

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

  // Initialize the AI Brain database & migrate legacy JSON projects
  getDatabase();
  const migrationResult = migrateJsonProjects();
  if (migrationResult.migrated > 0) {
    console.log(
      `[Memory] Migrated ${migrationResult.migrated} projects from JSON → SQLite (${migrationResult.skipped} already existed)`
    );
  }

  // TTL cleanup: purge completed tasks older than 7 days
  const purged = memoryTaskManager.purgeOldTasks();
  if (purged > 0) {
    console.log(`[Memory] Startup cleanup: purged ${purged} old completed tasks`);
  }

  // Create shared context for direct pipeline calls
  let workflowContext = {
    registry,
    ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
    openai: new OpenAI({ apiKey: config.openaiApiKey }),
  };

  // ── Task management tools (using SQLite-backed task manager) ──

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

  // ── AI Brain memory tools ──

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
        query: {
          type: 'string',
          description: 'The topic or question to search memory for.',
        },
        projectId: {
          type: 'string',
          description: 'Scope search to a specific project. Omit to search all.',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 10).',
        },
      },
      required: ['query'],
    },
    async (args: any) => {
      const results = searchKnowledge(
        args.query,
        args.projectId,
        args.limit ?? 10
      );
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
        knowledgeId: {
          type: 'number',
          description: 'The ID of the knowledge item to update.',
        },
        newContent: {
          type: 'string',
          description: 'The updated content.',
        },
        reason: {
          type: 'string',
          description: 'Why this knowledge is being updated.',
        },
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
        knowledgeId: {
          type: 'number',
          description: 'The ID of the knowledge item to forget.',
        },
        reason: {
          type: 'string',
          description: 'Why this knowledge is being forgotten.',
        },
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
        projectId: {
          type: 'string',
          description: 'The project ID to get the brief for.',
        },
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

  // Legacy compat: keep save_project_memory for existing skills
  registry.registerLocalTool(
    'save_project_memory',
    'Permanently save a note or preference for the current editing project. Use this when the user asks you to remember something for later.',
    {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Active Project ID, provided by the UI framework.',
        },
        note: {
          type: 'string',
          description: 'The note or preference to remember permanently.',
        },
      },
      required: ['projectId', 'note'],
    },
    async (args: any) => {
      const item = addProjectMemory(args.projectId, args.note);
      return item
        ? `Memory saved to project ${args.projectId}`
        : `Project not found`;
    }
  );

  let handleSubtitleGenerate = createSubtitleHandler(
    registry,
    workflowContext
  );

  await registry.switchActiveConnector('resolve');

  let agent = createAgent({
    model: config.geminiModel,
    apiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    anthropicApiKey: config.anthropicApiKey,
    systemPrompt: config.systemPrompt,
    registry,
  });

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/api/settings') {
      const currentSettings = await loadSettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(currentSettings));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/settings') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const newSettings = JSON.parse(body);
          await saveSettings(newSettings);
          updateConfig(newSettings);
          
          workflowContext = {
            registry,
            ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
            openai: new OpenAI({ apiKey: config.openaiApiKey })
          };

          handleSubtitleGenerate = createSubtitleHandler(
            registry,
            workflowContext
          );

          agent = createAgent({
            model: config.geminiModel,
            apiKey: config.geminiApiKey,
            openaiApiKey: config.openaiApiKey,
            anthropicApiKey: config.anthropicApiKey,
            systemPrompt: config.systemPrompt,
            registry,
          });

          console.log('[Settings] Hot-Reloaded AI agent successfully');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/tasks/cancel') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const { taskId } = JSON.parse(body);
          if (taskId) {
            memoryTaskManager.finishTask(taskId, 'cancelled');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'taskId required' }));
          }
        } catch (err: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/tasks/clear') {
      memoryTaskManager.clearAllTasks();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === 'POST' && req.url === '/chat') {
      const abortController = new AbortController();
      req.on('aborted', () => abortController.abort());
      res.on('close', () => {
        if (!res.writableFinished) {
          abortController.abort();
        }
      });

      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { message, skill, history, llmModel, activeApp, projectId, taskId } =
            JSON.parse(body);
          if (!message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Message is required' }));
            return;
          }

          const historyLen = history?.length ?? 0;
          console.log(`[Chat] ← "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}" (history: ${historyLen}, model: ${llmModel || 'default'})`);
          const chatStartTime = Date.now();

          let systemPromptOverride = skill?.systemInstruction;
          if (!systemPromptOverride && activeApp) {
            const appNames: Record<string, string> = {
              resolve: 'DaVinci Resolve',
              premiere: 'Adobe Premiere Pro',
              aftereffects: 'Adobe After Effects',
              blender: 'Blender',
              ableton: 'Ableton Live',
            };
            const appName = appNames[activeApp] || 'the Video Editing Software';
            systemPromptOverride = config.systemPrompt.replace(
              /DaVinci Resolve/g,
              appName
            );
          }

          if (projectId) {
            // Use the AI Brain's intelligent context assembly
            const brainContext = assembleProjectContext(projectId, message);
            if (brainContext) {
              systemPromptOverride = `${systemPromptOverride}${brainContext}`;
            }
          }

          const resolvedTaskId = taskId || `chat-${Date.now()}`;
          try {
            memoryTaskManager.createTask(resolvedTaskId, "AI Assistant Working", [], projectId);
            const stepIndices = new Map<string, number>();

            const text = await agent.chat(message, {
              providerOverride: llmModel,
              modelOverride: skill?.model,
              systemPromptOverride: systemPromptOverride,
              allowedTools: skill?.allowedTools,
              history: history,
              signal: abortController.signal,
              onToolCallStart: (toolName) => {
                console.log(`[Chat]   ⚡ Tool call: ${toolName}`);
                const idx = memoryTaskManager.addTaskStep(resolvedTaskId, `Calling ${toolName}`, 'in-progress');
                stepIndices.set(toolName, idx);
              },
              onToolCallComplete: (toolName, _result, err) => {
                console.log(`[Chat]   ${err ? '✗' : '✓'} Tool done: ${toolName}${err ? ` (error: ${err})` : ''}`);
                const idx = stepIndices.get(toolName);
                if (idx !== undefined && idx >= 0) {
                  memoryTaskManager.updateTaskStep(resolvedTaskId, idx, err ? 'error' : 'done');
                }
              },
              onThought: (thought) => {
                memoryTaskManager.emitThought(resolvedTaskId, thought);
              }
            });

            memoryTaskManager.finishTask(resolvedTaskId, 'done');
            const elapsed = ((Date.now() - chatStartTime) / 1000).toFixed(1);
            console.log(`[Chat] → Response ready (${elapsed}s, ${text.length} chars)`);

            // Extract pipeline actions from AI response if present
            let cleanText = text;
            const actions: any[] = [];

            // First, try to extract from markdown blocks
            const actionBlockRegex =
              /```(?:pipeline_actions|json)?\s*\n([\s\S]*?)```/g;
            let match;
            while ((match = actionBlockRegex.exec(text)) !== null) {
              try {
                // Strip JS-style line comments (//) and trailing commas
                const jsonString = match[1]
                  .replace(/^\s*\/\/.*$/gm, '')
                  .replace(/,\s*([\]}])/g, '$1');
                const parsed = JSON.parse(jsonString);
                if (
                  Array.isArray(parsed) &&
                  parsed.length > 0 &&
                  parsed[0].type
                ) {
                  actions.push(...parsed);
                  cleanText = cleanText.replace(match[0], '').trim();
                }
              } catch (e) {
                // Ignore block parse errors
              }
            }

            // Fallback: search for a JSON array natively in the raw text if no blocks matched
            if (actions.length === 0) {
              try {
                const jsonString = text
                  .replace(/^\s*\/\/.*$/gm, '')
                  .replace(/,\s*([\]}])/g, '$1');
                const arrStart = jsonString.indexOf('[');
                const arrEnd = jsonString.lastIndexOf(']');
                if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
                  const parsed = JSON.parse(
                    jsonString.substring(arrStart, arrEnd + 1)
                  );
                  if (
                    Array.isArray(parsed) &&
                    parsed.length > 0 &&
                    parsed[0].type
                  ) {
                    actions.push(...parsed);
                    cleanText = cleanText
                      .replace(text.substring(arrStart, arrEnd + 1), '')
                      .trim();
                  }
                }
              } catch (e) {
                console.warn('[CHAT] Fallback raw JSON parse failed:', e);
              }
            }

            if (!res.headersSent) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  text: cleanText,
                  actions: actions.length > 0 ? actions : undefined,
                })
              );
            }
          } catch (agentError: any) {
            memoryTaskManager.finishTask(resolvedTaskId, 'error');
            if (!res.headersSent) {
              if (agentError.message?.includes('AbortError')) {
                res.writeHead(499); // Client Closed Request
                res.end(JSON.stringify({ error: 'Request cancelled' }));
              } else {
                console.error(`[Chat] 💥 Agent Error:`, agentError);
                res.writeHead(500);
                res.end(
                  JSON.stringify({
                    error: agentError.message || String(agentError),
                  })
                );
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/api/switch-app') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { activeApp } = JSON.parse(body);
          if (activeApp) {
            await registry.switchActiveConnector(activeApp);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else if (req.method === 'GET' && req.url?.startsWith('/api/knowledge')) {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const projectIdParam = urlObj.searchParams.get('projectId') || undefined;
        const items = listKnowledge(projectIdParam);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(items));
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(err) }));
      }
    } else if (req.method === 'DELETE' && req.url === '/api/knowledge') {
      let body = '';
      req.on('data', (c) => (body += c.toString()));
      req.on('end', async () => {
        try {
          const { id } = JSON.parse(body);
          if (id) forgetKnowledge(Number(id));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    } else if (req.method === 'GET' && req.url === '/api/projects') {
      try {
        const projects = listProjects();
        // Add legacy-compat 'memories' field for frontend
        const projectsWithMemories = projects.map((p) => ({
          ...p,
          memories: getProjectMemories(p.id),
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(projectsWithMemories));
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(err) }));
      }
    } else if (req.method === 'POST' && req.url === '/api/projects') {
      let body = '';
      req.on('data', (c) => (body += c.toString()));
      req.on('end', async () => {
        try {
          const { name, externalAppName, externalProjectName } =
            JSON.parse(body);
          const p = createProject(
            name,
            externalAppName,
            externalProjectName
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(p));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/api/projects/memory') {
      let body = '';
      req.on('data', (c) => (body += c.toString()));
      req.on('end', async () => {
        try {
          const { projectId, action, note, memoryIndex } = JSON.parse(body);
          if (action === 'delete') {
            deleteProjectMemoryByIndex(projectId, memoryIndex);
          } else {
            addProjectMemory(projectId, note);
          }
          // Return updated project with memories for frontend compat
          const project = getProject(projectId);
          const memories = getProjectMemories(projectId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...project, memories }));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    } else if (req.method === 'GET' && req.url === '/api/active-app-state') {
      try {
        let activeProjectName = null;
        try {
          const result = await registry.callTool('get_project_info', {});
          const content = String(result.content)
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
          const data = JSON.parse(content);
          if (data.project_name) activeProjectName = data.project_name;
        } catch (silentErr) {
          // App not running, activeProjectName remains null
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ activeProjectName }));
      } catch (e: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(e) }));
      }
    } else if (req.method === 'POST' && req.url === '/api/ai-models') {
      handleAiModelRequest(req, res);
    } else if (req.method === 'POST' && req.url === '/api/save-render') {
      handleSaveRenderRequest(req, res);
    } else if (req.method === 'POST' && req.url === '/api/subtitles/generate') {
      handleSubtitleGenerate(req, res);
    } else if (req.method === 'GET' && req.url?.startsWith('/api/skills/')) {
      const skillsDir = path.join(config.workspaceRoot, 'apps', 'desktop', 'public', 'skills');
      const filename = req.url.replace('/api/skills/', '').split('?')[0];
      const filePath = path.join(skillsDir, filename);
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': filename.endsWith('.json') ? 'application/json' : 'text/plain' });
        res.end(fileContent);
      } catch (err) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'File not found' }));
      }
    } else if (req.method === 'POST' && req.url === '/api/skills/create') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { filename, content } = JSON.parse(body);
          if (!filename || !content) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ error: 'filename and content are required' })
            );
            return;
          }

          const skillsDir = path.join(
            config.workspaceRoot,
            'apps',
            'desktop',
            'public',
            'skills'
          );

          // Ensure directory exists
          await fs.mkdir(skillsDir, { recursive: true });

          // Write the md file
          const filePath = path.join(skillsDir, filename);
          await fs.writeFile(filePath, content, 'utf-8');

          // Add to index.json if not present
          const indexPath = path.join(skillsDir, 'index.json');
          let indexFiles: string[] = [];
          try {
            const indexRaw = await fs.readFile(indexPath, 'utf-8');
            indexFiles = JSON.parse(indexRaw);
          } catch (e) {
            // ignore if not exists
          }

          if (!indexFiles.includes(filename)) {
            indexFiles.push(filename);
            await fs.writeFile(
              indexPath,
              JSON.stringify(indexFiles, null, 2),
              'utf-8'
            );
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, filePath }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/api/skills/delete') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { filename } = JSON.parse(body);
          if (!filename) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'filename is required' }));
            return;
          }

          const skillsDir = path.join(
            config.workspaceRoot,
            'apps',
            'desktop',
            'public',
            'skills'
          );
          const filePath = path.join(skillsDir, filename);

          // Delete the md file if it exists
          try {
            await fs.unlink(filePath);
          } catch (e: any) {
            if (e.code !== 'ENOENT') throw e;
          }

          // Remove from index.json
          const indexPath = path.join(skillsDir, 'index.json');
          try {
            const indexRaw = await fs.readFile(indexPath, 'utf-8');
            let indexFiles: string[] = JSON.parse(indexRaw);
            indexFiles = indexFiles.filter((f) => f !== filename);
            await fs.writeFile(
              indexPath,
              JSON.stringify(indexFiles, null, 2),
              'utf-8'
            );
          } catch (e) {
            // ignore if not exists
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else if (req.method === 'GET' && req.url?.startsWith('/api/tasks/stream')) {
      const urlObject = new URL(req.url, `http://${req.headers.host}`);
      const projectIdParam = urlObject.searchParams.get('projectId') || undefined;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send initial state as materialized snapshots for fast hydration
      res.write(
        `data: ${JSON.stringify({
          type: 'init',
          tasks: memoryTaskManager.getTasksByProject(projectIdParam),
        })}\n\n`
      );

      // After init, stream individual TaskEvent objects
      const handleTaskEvent = (event: TaskEvent) => {
        // Filter by project if requested
        if (projectIdParam && 'taskId' in event) {
          const task = memoryTaskManager.getTask(event.taskId);
          if (task && task.projectId && task.projectId !== projectIdParam) return;
        }
        res.write(`data: ${JSON.stringify({ type: 'event', event })}\n\n`);
      };

      memoryTaskManager.on('taskEvent', handleTaskEvent);

      req.on('close', () => {
        memoryTaskManager.off('taskEvent', handleTaskEvent);
        res.end();
      });
    } else if (req.method === 'POST' && req.url === '/api/autopod/discover') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { app_target } = JSON.parse(body);
          // Ensure the connector is active
          if (app_target) {
            await registry.switchActiveConnector(app_target);
          }
          // Refresh tool index so premiere_export_xml is available
          await registry.getAllTools();
          // Execute discovery workflow directly — no LLM involved
          const result = await getTimelineInfoWorkflow.execute(
            { app_target: app_target || 'premiere' },
            { registry, ai: null as any, openai: null as any }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/api/autopod/run') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { app_target, mapping_json, fallback, use_generative } = JSON.parse(body);
          if (app_target) {
            await registry.switchActiveConnector(app_target);
          }
          await registry.getAllTools();
          const result = await autopodWorkflow.execute(
            { app_target: app_target || 'premiere', mapping_json, fallback, use_generative },
            { registry, ai: null as any, openai: null as any }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[AUTOPOD API] Error:', msg);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else {
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

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

import type { Tool } from '@pipefx/mcp';

/**
 * Maps an array of MCP tools to the Gemini functionDeclarations format.
 * Each tool becomes a separate entry in the tools array so Gemini
 * can discover and call any of them.
 */
export function mapToolsToGemini(tools: Tool[]) {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      })),
    },
  ];
}

/**
 * Deeply converts 'type' fields to lowercase to support standard JSON Schema
 * Since PipeFX MCP tools use uppercase types (like 'OBJECT', 'NUMBER') for Gemini,
 * we must convert them to lowercase for strict validation in OpenAI/Anthropic.
 */
function normalizeJsonSchema(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(normalizeJsonSchema);
  }
  if (schema && typeof schema === 'object') {
    const newObj: any = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'type' && typeof v === 'string') {
        newObj[k] = v.toLowerCase();
      } else {
        newObj[k] = normalizeJsonSchema(v);
      }
    }
    return newObj;
  }
  return schema;
}

function ensureValidObjectSchema(schema: any): any {
  const normalized = normalizeJsonSchema(schema);
  if (!normalized || Object.keys(normalized).length === 0) {
    return { type: 'object', properties: {} };
  }
  if (!normalized.type) {
    normalized.type = 'object';
  }
  if (!normalized.properties) {
    normalized.properties = {};
  }
  return normalized;
}

export function mapToolsToOpenAI(tools: Tool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: ensureValidObjectSchema(tool.inputSchema),
    },
  }));
}

export function mapToolsToAnthropic(tools: Tool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: ensureValidObjectSchema(tool.inputSchema) as any,
  }));
}

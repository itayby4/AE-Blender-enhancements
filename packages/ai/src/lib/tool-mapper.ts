import type { Tool } from '@pipefx/mcp';

/**
 * Maps an array of MCP tools to the Gemini functionDeclarations format.
 * Each tool becomes a separate entry in the tools array so Gemini
 * can discover and call any of them.
 */
export function mapToolsToGemini(tools: Tool[]) {
  return tools.map((tool) => ({
    functionDeclarations: [
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    ],
  }));
}

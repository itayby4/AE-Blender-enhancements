// Every MCP tool exposed by the panel. Each definition is { name,
// description, schema } — the actual work happens in host.jsx, dispatched
// via evalBridge(). That's why this file is one place instead of 19.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, type ZodRawShape } from 'zod';
import { evalBridge } from '../cep/eval-bridge.js';

interface ToolDef {
  name: string;
  description: string;
  schema: ZodRawShape;
}

const RgbUnit = z
  .array(z.number().min(0).max(1))
  .length(3)
  .describe('RGB color in 0..1 range (AE convention).');

const TOOLS: ToolDef[] = [
  {
    name: 'bridge-health',
    description:
      'Liveness check for the AE CEP MCP. Returns AE version, panel version, and current project path. Rarely needed — the SSE channel itself proves liveness.',
    schema: {},
  },
  {
    name: 'get-project-info',
    description:
      'Inspect the current After Effects project: file path, item counts, active comp.',
    schema: {},
  },
  {
    name: 'list-compositions',
    description:
      'List every composition in the project with id, name, duration, size, frame rate, and layer count.',
    schema: {},
  },
  {
    name: 'get-layer-info',
    description:
      'List layers (name, index, in/out, position, effects) for one composition or every composition.',
    schema: {
      compositionName: z
        .string()
        .optional()
        .describe('Composition name. Omit for active comp; or all comps if no active.'),
    },
  },
  {
    name: 'create-composition',
    description: 'Create a new composition.',
    schema: {
      name: z.string().describe('Composition name.'),
      width: z.number().int().positive().describe('Width in pixels.'),
      height: z.number().int().positive().describe('Height in pixels.'),
      pixelAspect: z.number().positive().optional().describe('Default 1.0.'),
      duration: z.number().positive().optional().describe('Seconds. Default 10.'),
      frameRate: z.number().positive().optional().describe('FPS. Default 30.'),
      backgroundColor: z
        .object({
          r: z.number().int().min(0).max(255),
          g: z.number().int().min(0).max(255),
          b: z.number().int().min(0).max(255),
        })
        .optional()
        .describe('Background color as 0..255 RGB. Default black.'),
    },
  },
  {
    name: 'create-text-layer',
    description: 'Create a text layer with configurable font, size, color, alignment, timing.',
    schema: {
      compName: z.string().optional(),
      text: z.string().describe('Text content.'),
      position: z.array(z.number()).length(2).optional().describe('[x, y]. Default centred.'),
      fontSize: z.number().positive().optional().describe('Default 72.'),
      color: RgbUnit.optional().describe('Default white [1, 1, 1].'),
      fontFamily: z.string().optional().describe("Default 'Arial'."),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      startTime: z.number().min(0).optional(),
      duration: z.number().positive().optional(),
    },
  },
  {
    name: 'create-shape-layer',
    description: 'Create a vector shape layer (rectangle, ellipse, polygon, star).',
    schema: {
      compName: z.string().optional(),
      shapeType: z
        .enum(['rectangle', 'ellipse', 'polygon', 'star'])
        .describe("Use 'ellipse' for circles."),
      position: z.array(z.number()).length(2).optional(),
      size: z
        .array(z.number().positive())
        .length(2)
        .optional()
        .describe('[width, height]. Equal values for circles.'),
      fillColor: RgbUnit.optional().describe('Default red [1, 0, 0].'),
      strokeColor: RgbUnit.optional().describe('Default black.'),
      strokeWidth: z.number().min(0).optional().describe('0 (default) = no stroke.'),
      startTime: z.number().min(0).optional(),
      duration: z.number().positive().optional(),
      name: z.string().optional(),
      points: z.number().int().min(3).optional().describe('Polygon/star point count. Default 5.'),
    },
  },
  {
    name: 'create-solid-layer',
    description: 'Create a solid layer, or an adjustment layer if isAdjustment=true.',
    schema: {
      compName: z.string().optional(),
      color: RgbUnit.optional(),
      name: z.string().optional(),
      position: z.array(z.number()).length(2).optional(),
      size: z.array(z.number().positive()).length(2).optional(),
      startTime: z.number().min(0).optional(),
      duration: z.number().positive().optional(),
      isAdjustment: z.boolean().optional(),
    },
  },
  {
    name: 'create-camera',
    description: 'Create a one-node or two-node camera layer.',
    schema: {
      compName: z.string().optional(),
      name: z.string().optional(),
      zoom: z.number().positive().optional().describe('Pixels (~1777.78 ≈ 50mm).'),
      position: z.array(z.number()).length(3).optional(),
      pointOfInterest: z.array(z.number()).length(3).optional(),
      oneNode: z.boolean().optional(),
    },
  },
  {
    name: 'duplicate-layer',
    description: 'Duplicate a layer within its composition.',
    schema: {
      compName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      newName: z.string().optional(),
    },
  },
  {
    name: 'delete-layer',
    description: 'Delete a layer from a composition.',
    schema: {
      compName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
    },
  },
  {
    name: 'set-layer-properties',
    description:
      'Mutate transform/timing/text on an existing layer. For text layers also accepts text/fontFamily/fontSize/fillColor.',
    schema: {
      compName: z.string().optional(),
      layerName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      position: z.array(z.number()).min(2).max(3).optional(),
      scale: z.array(z.number()).min(2).max(3).optional(),
      rotation: z.number().optional(),
      opacity: z.number().min(0).max(100).optional(),
      startTime: z.number().min(0).optional(),
      duration: z.number().positive().optional(),
      threeDLayer: z.boolean().optional(),
      enabled: z.boolean().optional(),
      blendMode: z
        .enum([
          'normal',
          'add',
          'multiply',
          'screen',
          'overlay',
          'softLight',
          'hardLight',
          'colorDodge',
          'colorBurn',
          'darken',
          'lighten',
          'difference',
          'exclusion',
        ])
        .optional(),
      text: z.string().optional().describe('Text layers only.'),
      fontFamily: z.string().optional().describe('Text layers only.'),
      fontSize: z.number().positive().optional().describe('Text layers only.'),
      fillColor: RgbUnit.optional().describe('Text layers only.'),
    },
  },
  {
    name: 'batch-set-layer-properties',
    description: 'Apply property changes to many layers in one composition in a single call.',
    schema: {
      compName: z.string().optional(),
      operations: z
        .array(
          z.object({
            layerIndex: z.number().int().positive().optional(),
            layerName: z.string().optional(),
            threeDLayer: z.boolean().optional(),
            position: z.array(z.number()).optional(),
            scale: z.array(z.number()).optional(),
            rotation: z.number().optional(),
            opacity: z.number().min(0).max(100).optional(),
            blendMode: z
              .enum([
                'normal',
                'add',
                'multiply',
                'screen',
                'overlay',
                'softLight',
                'hardLight',
                'darken',
                'lighten',
                'difference',
              ])
              .optional(),
            startTime: z.number().optional(),
            outPoint: z.number().optional(),
          })
        )
        .min(1),
    },
  },
  {
    name: 'set-composition-properties',
    description: 'Change duration, frame rate, or width/height on a composition.',
    schema: {
      compName: z.string().optional(),
      duration: z.number().positive().optional(),
      frameRate: z.number().positive().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    },
  },
  {
    name: 'setLayerKeyframe',
    description: 'Set a keyframe for a layer property at a given time.',
    schema: {
      compIndex: z.number().int().positive().optional(),
      compName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      propertyName: z.string().describe("e.g. 'Position', 'Scale', 'Rotation', 'Opacity'."),
      timeInSeconds: z.number(),
      value: z.unknown(),
    },
  },
  {
    name: 'setLayerExpression',
    description: 'Set or remove an expression on a layer property. Empty string clears.',
    schema: {
      compIndex: z.number().int().positive().optional(),
      compName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      propertyName: z.string(),
      expressionString: z.string(),
    },
  },
  {
    name: 'set-layer-mask',
    description: 'Create or modify a mask. Provide maskRect for a rectangle, or maskPath for a polygon.',
    schema: {
      compName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      maskIndex: z.number().int().positive().optional(),
      maskPath: z.array(z.array(z.number()).length(2)).min(3).optional(),
      maskRect: z
        .object({
          top: z.number(),
          left: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
        })
        .optional(),
      maskMode: z.enum(['add', 'subtract', 'intersect', 'none', 'lighten', 'darken', 'difference']).optional(),
      maskFeather: z.array(z.number()).length(2).optional(),
      maskOpacity: z.number().min(0).max(100).optional(),
      maskExpansion: z.number().optional(),
      maskName: z.string().optional(),
    },
  },
  {
    name: 'apply-effect',
    description: 'Apply an effect to a layer by display name or internal matchName.',
    schema: {
      compIndex: z.number().int().positive().optional(),
      compName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      effectName: z.string().optional().describe("Display name (e.g. 'Gaussian Blur')."),
      effectMatchName: z.string().optional().describe("Internal name (e.g. 'ADBE Gaussian Blur 2'). Preferred."),
      effectSettings: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Property name → value map (e.g. { 'Blurriness': 25 })."),
      presetPath: z.string().optional().describe('Path to a .ffx preset.'),
    },
  },
  {
    name: 'apply-effect-template',
    description:
      "Apply a curated combination of effects: gaussian-blur, glow, drop-shadow, cinematic-look, text-pop, etc.",
    schema: {
      compIndex: z.number().int().positive().optional(),
      compName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      templateName: z.enum([
        'gaussian-blur',
        'directional-blur',
        'color-balance',
        'brightness-contrast',
        'curves',
        'glow',
        'drop-shadow',
        'cinematic-look',
        'text-pop',
      ]),
      customSettings: z.record(z.string(), z.unknown()).optional(),
    },
  },
];

// Legacy aliases the existing prompts and tests still use. Same behaviour
// as the corresponding non-aliased tool — host.jsx routes them identically.
const ALIASES: Record<string, string> = {
  mcp_aftereffects_applyEffect: 'apply-effect',
  mcp_aftereffects_applyEffectTemplate: 'apply-effect-template',
};

interface McpToolResult {
  [k: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

async function dispatch(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    const result = await evalBridge(toolName, args);
    return {
      content: [
        {
          type: 'text',
          text:
            typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : 'Error';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: name, message }) }],
      isError: true,
    };
  }
}

export function registerTools(server: McpServer): void {
  for (const tool of TOOLS) {
    server.tool(
      tool.name,
      tool.description,
      tool.schema,
      async (args) => dispatch(tool.name, args as Record<string, unknown>)
    );
  }
  // Aliases — share the underlying schema of the canonical tool name.
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const canonicalDef = TOOLS.find((t) => t.name === canonical);
    if (!canonicalDef) continue;
    server.tool(
      alias,
      `Alias of ${canonical}.`,
      canonicalDef.schema,
      async (args) => dispatch(alias, args as Record<string, unknown>)
    );
  }
}

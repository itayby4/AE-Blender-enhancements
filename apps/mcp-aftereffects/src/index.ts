import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { fileURLToPath } from 'url';

// Create an MCP server
const server = new McpServer({
  name: "AfterEffectsServer",
  version: "1.0.0"
});

// ES Modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const SCRIPTS_DIR = path.join(__dirname, "scripts");
const TEMP_DIR = path.join(__dirname, "temp");

// Get the correct directory for AE bridge files
// Use ~/Documents/ae-mcp-bridge for reliable cross-process access
function getAETempDir(): string {
  const homeDir = os.homedir();
  const bridgeDir = path.join(homeDir, 'Documents', 'ae-mcp-bridge');
  // Ensure the directory exists
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}

// Headless CLI execution has been removed. All interactions are routed through the Bridge panel.

// Helper function to read results from After Effects temp file
function readResultsFromTempFile(): string {
  try {
    const tempFilePath = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    // Add debugging info
    console.error(`Checking for results at: ${tempFilePath}`);
    
    if (fs.existsSync(tempFilePath)) {
      // Get file stats to check modification time
      const stats = fs.statSync(tempFilePath);
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);
      
      const content = fs.readFileSync(tempFilePath, 'utf8');
      console.error(`Result file content length: ${content.length} bytes`);
      
      // If the result file is older than 30 seconds, warn the user
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error(`WARNING: Result file is older than 30 seconds. After Effects may not be updating results.`);
        return JSON.stringify({ 
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the MCP Bridge Auto panel isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }
      
      return content;
    } else {
      console.error(`Result file not found at: ${tempFilePath}`);
      return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
    }
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}

// Helper to wait for a fresh result produced by a specific command
async function waitForBridgeResult(expectedCommand?: string, timeoutMs: number = 5000, pollMs: number = 250): Promise<string> {
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
  let lastSize = -1;

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        if (content && content.length > 0 && content.length !== lastSize) {
          lastSize = content.length;
          try {
            const parsed = JSON.parse(content);
            if (!expectedCommand || parsed._commandExecuted === expectedCommand) {
              return content;
            }
          } catch {
            // not JSON yet; continue polling
          }
        }
      } catch {
        // transient read error; continue polling
      }
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  return JSON.stringify({ error: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ''}.` });
}

// Helper function to write command to file
function writeCommandFile(command: string, args: Record<string, any> = {}): void {
  try {
    const commandFile = path.join(getAETempDir(), 'ae_command.json');
    const commandData = {
      command,
      args,
      timestamp: new Date().toISOString(),
      status: "pending"  // pending, running, completed, error
    };
    fs.writeFileSync(commandFile, JSON.stringify(commandData, null, 2));
    console.error(`Command "${command}" written to ${commandFile}`);
  } catch (error) {
    console.error("Error writing command file:", error);
  }
}

// Helper function to clear the results file to avoid stale cache
function clearResultsFile(): void {
  try {
    const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    // Write a placeholder message to indicate the file is being reset
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(resultFile, JSON.stringify(resetData, null, 2));
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
  }
}

// Add a resource to expose project compositions
server.resource(
  "compositions",
  "aftereffects://compositions",
  async (uri) => {
    // Clear old results, queue the command, and wait for bridge output
    clearResultsFile();
    writeCommandFile("listCompositions", {});
    const result = await waitForBridgeResult("listCompositions", 6000, 250);

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: result
      }]
    };
  }
);

// Note: the generic `run-script` tool was removed. Every supported script is
// exposed as a typed tool below (see "BEGIN TYPED SCRIPT TOOLS"). Forcing the
// model through a typed schema is what stops the "createShapeLayer with no
// params → default red rectangle" failure mode that was observed in logs.

// Add a tool to get the results from the last script execution
server.tool(
  "get-results",
  "Get results from the last script executed in After Effects",
  {},
  async () => {
    try {
      const result = readResultsFromTempFile();
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting results: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add prompts for common After Effects tasks
server.prompt(
  "list-compositions",
  "List compositions in the current After Effects project",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Please list all compositions in the current After Effects project."
        }
      }]
    };
  }
);

server.prompt(
  "analyze-composition",
  {
    compositionName: z.string().describe("Name of the composition to analyze")
  },
  (args) => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the composition named "${args.compositionName}" in the current After Effects project. Provide details about its duration, frame rate, resolution, and layers.`
        }
      }]
    };
  }
);

// Add a prompt for creating compositions
server.prompt(
  "create-composition",
  "Create a new composition with specified settings",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc.`
        }
      }]
    };
  }
);

// Add a tool to provide help and instructions
server.tool(
  "get-help",
  "Get help on using the After Effects MCP integration",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects MCP Integration Help

To use this integration with After Effects, follow these steps:

 1. **Install the scripts in After Effects**
   - Run \`node install-bridge.js\` with administrator privileges
   - This copies the necessary scripts to your After Effects installation

2. **Open After Effects**
   - Launch Adobe After Effects 
   - Open a project that you want to work with

3. **Open the MCP Bridge Auto panel**
   - In After Effects, go to Window > mcp-bridge-auto.jsx
   - The panel will automatically check for commands every few seconds

4. **Run scripts through MCP**
   - Use a typed tool (e.g. \`create-shape-layer\`, \`create-composition\`) to queue a command
   - The Auto panel will detect and run the command automatically
   - Results will be saved to a temp file

5. **Get results through MCP**
   - After a command is executed, use the \`get-results\` tool
   - This will retrieve the results from After Effects

Available scripts:
- getProjectInfo: Information about the current project
- listCompositions: List all compositions in the project
- getLayerInfo: Information about layers in the active composition
- createComposition: Create a new composition
- createTextLayer: Create a new text layer
- createShapeLayer: Create a new shape layer
- createSolidLayer: Create a new solid layer
- setLayerProperties: Set properties for a layer
- setLayerKeyframe: Set a keyframe for a layer property
- setLayerExpression: Set an expression for a layer property
- applyEffect: Apply an effect to a layer
- applyEffectTemplate: Apply a predefined effect template to a layer

Effect Templates:
- gaussian-blur: Simple Gaussian blur effect
- directional-blur: Motion blur in a specific direction
- color-balance: Adjust hue, lightness, and saturation
- brightness-contrast: Basic brightness and contrast adjustment
- curves: Advanced color adjustment using curves
- glow: Add a glow effect to elements
- drop-shadow: Add a customizable drop shadow
- cinematic-look: Combination of effects for a cinematic appearance
- text-pop: Effects to make text stand out (glow and shadow)

Note: The auto-running panel can be left open in After Effects to continuously listen for commands from external applications.`
        }
      ]
    };
  }
);

// Add a tool specifically for creating compositions
server.tool(
  "create-composition",
  "Create a new composition in After Effects with specified parameters",
  {
    name: z.string().describe("Name of the composition"),
    width: z.number().int().positive().describe("Width of the composition in pixels"),
    height: z.number().int().positive().describe("Height of the composition in pixels"),
    pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default: 1.0)"),
    duration: z.number().positive().optional().describe("Duration in seconds (default: 10.0)"),
    frameRate: z.number().positive().optional().describe("Frame rate in frames per second (default: 30.0)"),
    backgroundColor: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255)
    }).optional().describe("Background color of the composition (RGB values 0-255)")
  },
  async (params) => {
    try {
      // Write command to file for After Effects to pick up
      writeCommandFile("createComposition", params);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to create composition "${params.name}" has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing composition creation: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- BEGIN TYPED SCRIPT TOOLS ---
// Each tool below corresponds to an allowed script in the AE bridge.
// Exposing them with real Zod schemas (instead of funneling everything
// through the generic `run-script`) forces the LLM to pass the right
// parameters — the previous generic call was landing with `{}` and
// producing default rectangles for every "create a circle" request.

function queueAndAck(scriptName: string, params: Record<string, unknown>) {
  writeCommandFile(scriptName, params);
  return {
    content: [
      {
        type: "text" as const,
        text:
          `Command "${scriptName}" has been queued.\n` +
          `Ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
          `The registry will poll get-results until the real payload arrives.`,
      },
    ],
  };
}

server.tool(
  "get-project-info",
  "Inspect the current After Effects project: item count, compositions, active comp.",
  {},
  async () => queueAndAck("getProjectInfo", {})
);

server.tool(
  "list-compositions",
  "List every composition in the current project with id, name, duration, size, and layer count.",
  {},
  async () => queueAndAck("listCompositions", {})
);

server.tool(
  "get-layer-info",
  "List layers (name, index, position, in/out points) for one composition or all compositions.",
  {
    compositionName: z
      .string()
      .optional()
      .describe("Composition name. Omit to return layers for every composition."),
  },
  async (params) => queueAndAck("getLayerInfo", params)
);

const RgbUnitColor = z
  .array(z.number().min(0).max(1))
  .length(3)
  .describe("RGB color as [r, g, b] in the 0..1 range (AE convention, NOT 0..255).");

server.tool(
  "create-shape-layer",
  "Create a vector shape layer (rectangle, ellipse, polygon, or star) in a composition.",
  {
    compName: z.string().optional().describe("Target composition by name (preferred)."),
    compIndex: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based index among CompItems. Use only if compName is unknown."),
    shapeType: z
      .enum(["rectangle", "ellipse", "polygon", "star"])
      .describe("Shape geometry. Use 'ellipse' for circles."),
    position: z
      .array(z.number())
      .length(2)
      .optional()
      .describe("Layer position as [x, y] in comp pixels. Default center [960, 540]."),
    size: z
      .array(z.number().positive())
      .length(2)
      .optional()
      .describe("Shape size as [width, height] in pixels. For circles, pass equal values."),
    fillColor: RgbUnitColor.optional().describe("Fill color. Default [1, 0, 0] (red)."),
    strokeColor: RgbUnitColor.optional().describe("Stroke color. Default [0, 0, 0] (black)."),
    strokeWidth: z
      .number()
      .min(0)
      .optional()
      .describe("Stroke width in pixels. 0 (default) = no stroke."),
    startTime: z.number().min(0).optional().describe("Layer start time in seconds. Default 0."),
    duration: z.number().positive().optional().describe("Layer duration in seconds. Default 5."),
    name: z.string().optional().describe("Layer name. Default 'Shape Layer'."),
    points: z
      .number()
      .int()
      .min(3)
      .optional()
      .describe("Point count for polygon/star. Default 5."),
  },
  async (params) => queueAndAck("createShapeLayer", params)
);

server.tool(
  "create-text-layer",
  "Create a text layer in a composition with configurable font, size, color, alignment.",
  {
    compName: z.string().optional().describe("Target composition by name."),
    text: z.string().describe("Text content."),
    position: z
      .array(z.number())
      .length(2)
      .optional()
      .describe("Position as [x, y]. Default [960, 540]."),
    fontSize: z.number().positive().optional().describe("Font size in points. Default 72."),
    color: RgbUnitColor.optional().describe("Fill color. Default [1, 1, 1] (white)."),
    fontFamily: z.string().optional().describe("Font family. Default 'Arial'."),
    alignment: z
      .enum(["left", "center", "right"])
      .optional()
      .describe("Paragraph alignment. Default 'center'."),
    startTime: z.number().min(0).optional().describe("Layer start time in seconds. Default 0."),
    duration: z.number().positive().optional().describe("Layer duration in seconds. Default 5."),
  },
  async (params) => queueAndAck("createTextLayer", params)
);

server.tool(
  "create-solid-layer",
  "Create a solid layer (or adjustment layer if isAdjustment=true) in a composition.",
  {
    compName: z.string().optional().describe("Target composition by name."),
    color: RgbUnitColor.optional().describe("Solid color. Default [1, 1, 1] (white)."),
    name: z.string().optional().describe("Layer name. Default 'Solid Layer'."),
    position: z
      .array(z.number())
      .length(2)
      .optional()
      .describe("Position as [x, y]. Default [960, 540]."),
    size: z
      .array(z.number().positive())
      .length(2)
      .optional()
      .describe("Size as [width, height]. Defaults to comp size if omitted."),
    startTime: z.number().min(0).optional().describe("Start time in seconds. Default 0."),
    duration: z.number().positive().optional().describe("Duration in seconds. Default 5."),
    isAdjustment: z
      .boolean()
      .optional()
      .describe("If true, the layer becomes an adjustment layer. Default false."),
  },
  async (params) => queueAndAck("createSolidLayer", params)
);

server.tool(
  "set-layer-properties",
  "Mutate transform/timing on an existing layer (position, scale, rotation, opacity, startTime, duration).",
  {
    compName: z.string().optional().describe("Target composition by name."),
    layerName: z
      .string()
      .optional()
      .describe("Layer name. Ignored if layerIndex is provided."),
    layerIndex: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based layer index (topmost = 1). Takes precedence over layerName."),
    position: z
      .array(z.number())
      .min(2)
      .max(3)
      .optional()
      .describe("[x, y] or [x, y, z]."),
    scale: z
      .array(z.number())
      .min(2)
      .max(3)
      .optional()
      .describe("Scale as percent, [x, y] or [x, y, z]. 100 = 100%."),
    rotation: z.number().optional().describe("Rotation in degrees."),
    opacity: z.number().min(0).max(100).optional().describe("Opacity percent, 0–100."),
    startTime: z.number().min(0).optional().describe("New in-point in seconds."),
    duration: z.number().positive().optional().describe("New duration in seconds."),
  },
  async (params) => queueAndAck("setLayerProperties", params)
);

server.tool(
  "create-camera",
  "Create a camera layer in a composition (one-node or two-node).",
  {
    compName: z.string().optional().describe("Target composition by name. Falls back to active comp if omitted."),
    name: z.string().optional().describe("Camera layer name. Default: 'Camera'."),
    zoom: z.number().positive().optional().describe("Zoom in pixels. Default 1777.78 (~50mm equivalent)."),
    position: z.array(z.number()).length(3).optional().describe("Camera position as [x, y, z]."),
    pointOfInterest: z.array(z.number()).length(3).optional().describe("Point of interest as [x, y, z]. Ignored when oneNode is true."),
    oneNode: z.boolean().optional().describe("If true, create a one-node camera (no point of interest). Default false."),
  },
  async (params) => queueAndAck("createCamera", params)
);

const BatchLayerOperation = z
  .object({
    layerIndex: z.number().int().positive().optional().describe("1-based layer index. Preferred."),
    layerName: z.string().optional().describe("Target layer by name. Used only when layerIndex is omitted."),
    threeDLayer: z.boolean().optional().describe("Toggle 3D layer switch."),
    position: z.array(z.number()).optional().describe("[x, y] or [x, y, z]. Clears existing position keyframes."),
    scale: z.array(z.number()).optional().describe("[sx, sy] or [sx, sy, sz] in percent."),
    rotation: z.number().optional().describe("Rotation in degrees (Z rotation for 3D layers)."),
    opacity: z.number().min(0).max(100).optional().describe("Opacity 0..100."),
    blendMode: z
      .enum(["normal","add","multiply","screen","overlay","softLight","hardLight","darken","lighten","difference"])
      .optional()
      .describe("Blend mode name."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    outPoint: z.number().optional().describe("Layer out point in seconds."),
  })
  .describe("One layer update. Provide layerIndex or layerName, plus any properties to change.");

server.tool(
  "batch-set-layer-properties",
  "Apply property changes to many layers in one composition in a single call.",
  {
    compName: z.string().optional().describe("Target composition by name. Falls back to active comp."),
    operations: z.array(BatchLayerOperation).min(1).describe("One entry per layer to update."),
  },
  async (params) => queueAndAck("batchSetLayerProperties", params)
);

server.tool(
  "set-composition-properties",
  "Change composition-level properties (duration, frame rate, dimensions).",
  {
    compName: z.string().optional().describe("Target composition by name. Falls back to active comp."),
    duration: z.number().positive().optional().describe("New duration in seconds."),
    frameRate: z.number().positive().optional().describe("New frame rate (fps)."),
    width: z.number().int().positive().optional().describe("New width in pixels. Must be paired with height."),
    height: z.number().int().positive().optional().describe("New height in pixels. Must be paired with width."),
  },
  async (params) => queueAndAck("setCompositionProperties", params)
);

server.tool(
  "duplicate-layer",
  "Duplicate a layer within its composition. Identify the source by index (preferred) or name.",
  {
    compName: z.string().optional().describe("Target composition by name. Falls back to active comp."),
    layerIndex: z.number().int().positive().optional().describe("1-based source layer index. Preferred."),
    layerName: z.string().optional().describe("Source layer name. Used only when layerIndex is omitted."),
    newName: z.string().optional().describe("Optional name for the duplicated layer."),
  },
  async (params) => queueAndAck("duplicateLayer", params)
);

server.tool(
  "delete-layer",
  "Delete a layer from a composition. Identify by index (preferred) or name.",
  {
    compName: z.string().optional().describe("Target composition by name. Falls back to active comp."),
    layerIndex: z.number().int().positive().optional().describe("1-based layer index. Preferred."),
    layerName: z.string().optional().describe("Layer name. Used only when layerIndex is omitted."),
  },
  async (params) => queueAndAck("deleteLayer", params)
);

const MaskRect = z
  .object({
    top: z.number().describe("Top edge in pixels."),
    left: z.number().describe("Left edge in pixels."),
    width: z.number().positive().describe("Rectangle width in pixels."),
    height: z.number().positive().describe("Rectangle height in pixels."),
  })
  .describe("Rectangular mask shorthand. Mutually exclusive with maskPath.");

server.tool(
  "set-layer-mask",
  "Create or modify a mask on a layer. Provide maskRect for a rectangle, or maskPath for an arbitrary polygon.",
  {
    compName: z.string().optional().describe("Target composition by name. Falls back to active comp."),
    layerIndex: z.number().int().positive().optional().describe("1-based layer index. Preferred."),
    layerName: z.string().optional().describe("Layer name. Used only when layerIndex is omitted."),
    maskIndex: z.number().int().positive().optional().describe("1-based existing mask index to modify. Omit to create a new mask."),
    maskPath: z
      .array(z.array(z.number()).length(2))
      .min(3)
      .optional()
      .describe("Polygon vertices as [[x, y], ...] (at least 3 points). Use instead of maskRect."),
    maskRect: MaskRect.optional(),
    maskMode: z
      .enum(["add", "subtract", "intersect", "none"])
      .optional()
      .describe("Mask blend mode. Default 'add'."),
    maskFeather: z.array(z.number()).length(2).optional().describe("Feather as [x, y] in pixels."),
    maskOpacity: z.number().min(0).max(100).optional().describe("Mask opacity 0..100."),
    maskExpansion: z.number().optional().describe("Mask expansion in pixels (negative contracts)."),
    maskName: z.string().optional().describe("Optional mask name."),
  },
  async (params) => queueAndAck("setLayerMask", params)
);

// --- END TYPED SCRIPT TOOLS ---

// --- BEGIN NEW TOOLS ---

// Zod schema for common layer identification
const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};

// Zod schema for keyframe value (more specific types might be needed depending on property)
// Using z.any() for flexibility, but can be refined (e.g., z.array(z.number()) for position/scale)
const KeyframeValueSchema = z.unknown().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");

// Tool for setting a layer keyframe
server.tool(
  "setLayerKeyframe", // Corresponds to the function name in ExtendScript
  "Set a keyframe for a specific layer property at a given time.",
  {
    ...LayerIdentifierSchema, // Reuse common identifiers
    propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
    value: KeyframeValueSchema
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("setLayerKeyframe", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to set keyframe for "${parameters.propertyName}" on layer ${parameters.layerIndex} in comp ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerKeyframe command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool for setting a layer expression
server.tool(
  "setLayerExpression", // Corresponds to the function name in ExtendScript
  "Set or remove an expression for a specific layer property.",
  {
    ...LayerIdentifierSchema, // Reuse common identifiers
    propertyName: z.string().describe("Name of the property to apply the expression to (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("setLayerExpression", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to set expression for "${parameters.propertyName}" on layer ${parameters.layerIndex} in comp ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerExpression command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- END NEW TOOLS --- 

// --- BEGIN NEW TESTING TOOL --- 
// Add a special tool for directly testing the keyframe functionality
server.tool(
  "test-animation",
  "Test animation functionality in After Effects",
  {
    operation: z.enum(["keyframe", "expression"]).describe("The animation operation to test"),
    compIndex: z.number().int().positive().describe("Composition index (usually 1)"),
    layerIndex: z.number().int().positive().describe("Layer index (usually 1)")
  },
  async (params) => {
    try {
      // Generate a unique timestamp
      const timestamp = new Date().getTime();
      const tempFile = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `ae_test_${timestamp}.jsx`);
      
      // Create a direct test script that doesn't rely on command files
      let scriptContent = "";
      if (params.operation === "keyframe") {
        scriptContent = `
          // Direct keyframe test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Opacity");
            var time = 1; // 1 second
            var value = 25; // 25% opacity
            
            // Set a keyframe
            prop.setValueAtTime(time, value);
            
            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added keyframe at time " + time + " with value " + value);
            resultFile.close();
            
            // Visual feedback
            alert("Test successful: Added opacity keyframe at " + time + "s with value " + value + "%");
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      } else if (params.operation === "expression") {
        scriptContent = `
          // Direct expression test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Position");
            var expression = "wiggle(3, 30)";
            
            // Set the expression
            prop.expression = expression;
            
            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added expression: " + expression);
            resultFile.close();
            
            // Visual feedback
            alert("Test successful: Added position expression: " + expression);
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      }
      
      // Write the script to a temp file
      fs.writeFileSync(tempFile, scriptContent);
      console.error(`Written test script to: ${tempFile}`);
      
      // Tell the user what to do
      return {
        content: [
          {
            type: "text",
            text: `I've created a direct test script for the ${params.operation} operation.

Please run this script manually in After Effects:
1. In After Effects, go to File > Scripts > Run Script File...
2. Navigate to: ${tempFile}
3. You should see an alert confirming the result.

This bypasses the MCP Bridge Auto panel and will directly modify the specified layer.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating test script: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);
// --- END NEW TESTING TOOL --- 

// --- BEGIN NEW EFFECTS TOOLS ---

// Add a tool for applying effects to layers
server.tool(
  "apply-effect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectCategory: z.string().optional().describe("Optional category for filtering effects."),
    presetPath: z.string().optional().describe("Optional path to an effect preset file (.ffx)."),
    effectSettings: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffect", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to apply effect to layer ${parameters.layerIndex} in composition ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add a tool for applying effect templates
server.tool(
  "apply-effect-template",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffectTemplate", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to apply effect template '${parameters.templateName}' to layer ${parameters.layerIndex} in composition ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect-template command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- END NEW EFFECTS TOOLS ---

// Add direct MCP function for applying effects
server.tool(
  "mcp_aftereffects_applyEffect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffect", parameters);
      
      // Wait a bit for After Effects to process the command
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the results
      const result = readResultsFromTempFile();
      
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add direct MCP function for applying effect templates
server.tool(
  "mcp_aftereffects_applyEffectTemplate",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffectTemplate", parameters);
      
      // Wait a bit for After Effects to process the command
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the results
      const result = readResultsFromTempFile();
      
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying effect template: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Update help information to include the new effects tools
server.tool(
  "mcp_aftereffects_get_effects_help",
  "Get help on using After Effects effects",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
`
        }
      ]
    };
  }
);

// Add a direct tool for our bridge test effects
server.tool(
  "run-bridge-test",
  "Run the bridge test effects script to verify communication and apply test effects",
  {},
  async () => {
    try {
      // Clear any stale result data
      clearResultsFile();
      
      // Write command to file for After Effects to pick up
      writeCommandFile("bridgeTestEffects", {});
      
      return {
        content: [
          {
            type: "text",
            text: `Bridge test effects command has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for the test results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing bridge test command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Start the MCP server
async function main() {
  console.error("After Effects MCP Server starting...");
  console.error(`Scripts directory: ${SCRIPTS_DIR}`);
  console.error(`Temp directory: ${TEMP_DIR}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("After Effects MCP Server running...");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});

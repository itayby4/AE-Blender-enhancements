import type { WorkflowContext } from './types.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

/**
 * Resolves the workspace root by walking up from cwd looking for nx.json.
 */
function findWorkspaceRoot(): string {
  let currentDir = process.cwd();
  while (
    !fs.existsSync(path.join(currentDir, 'nx.json')) &&
    currentDir !== path.parse(currentDir).root
  ) {
    currentDir = path.dirname(currentDir);
  }
  return currentDir;
}

/**
 * Discovery Workflow:
 * Exports XML from the active NLE and analyzes the timeline to find
 * cameras, audio source channels, FPS, and duration.
 */
export const getTimelineInfoWorkflow = {
  name: 'get_autopod_timeline_info',
  description:
    'Scans the active timeline to auto-discover camera tracks and audio source channels for AutoPod.',
  parameters: {
    type: 'object',
    properties: {
      app_target: {
        type: 'string',
        description: 'Target NLE: premiere or resolve',
      },
    },
    required: ['app_target'],
  },
  execute: async (
    args: { app_target?: string },
    context: WorkflowContext
  ): Promise<string> => {
    const { registry } = context;
    const appTarget = args.app_target || 'premiere';
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
    const tempDir = os.tmpdir();
    const runId = Date.now();
    const xmlPath = path.join(tempDir, `discover_${runId}.xml`);
    const outPath = path.join(tempDir, `discover_${runId}.json`);

    try {
      const workspaceRoot = findWorkspaceRoot();
      const stoolsDir = path.join(workspaceRoot, 'stools');

      // 1. Export XML from the active NLE
      if (appTarget === 'premiere') {
        await registry.callTool('premiere_export_xml', {
          export_path: xmlPath,
        });
      } else if (appTarget === 'resolve') {
        await registry.callTool('resolve_export_xml', {
          export_path: xmlPath,
        });
      } else {
        throw new Error(
          `Auto-discovery for "${appTarget}" is not implemented yet.`
        );
      }

      // 2. Run discover_media.py to parse the XML
      const script = path.join(stoolsDir, 'discover_media.py');
      execSync(
        `"${pythonExe}" "${script}" --xml "${xmlPath}" --out "${outPath}"`,
        { stdio: 'inherit' }
      );

      if (!fs.existsSync(outPath)) {
        throw new Error('Discovery script failed to produce output.');
      }
      const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));

      return JSON.stringify(data);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
};

/**
 * Execution Workflow:
 * Runs the full AutoPod multicam editing pipeline.
 * Supports two modes:
 *   - Traditional (manual mapping): User maps Mic→Camera, local VAD cuts
 *   - Generative (Sentient Director): AI auto-maps via Gemini vision, then local VAD
 */
export const autopodWorkflow = {
  name: 'run_autopod',
  description:
    'Executes the hybrid AutoPod multicam editing pipeline. In generative mode, uses AI to auto-map cameras to microphones then cuts locally with VAD.',
  parameters: {
    type: 'object',
    properties: {
      app_target: {
        type: 'string',
        description: 'Target NLE: premiere or resolve',
      },
      mapping_json: {
        type: 'string',
        description:
          'JSON string of video track to audio paths mapping (manual mode only)',
      },
      fallback: {
        type: 'string',
        description: 'Fallback video track ID',
      },
      use_generative: {
        type: 'boolean',
        description:
          'If true, uses AI to auto-discover camera-to-mic mapping. If false, uses the manual mapping_json.',
      },
    },
    required: ['app_target'],
  },
  execute: async (
    args: {
      app_target?: string;
      mapping_json?: string;
      fallback?: string;
      use_generative?: boolean;
    },
    context: WorkflowContext
  ): Promise<string> => {
    const { registry } = context;
    const appTarget = args.app_target || 'premiere';
    const { mapping_json, fallback, use_generative } = args;
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
    const pyFlag = '-u'; // unbuffered output

    console.log(`[AUTOPOD] Starting pipeline for ${appTarget}`, args);

    try {
      const workspaceRoot = findWorkspaceRoot();
      const stoolsDir = path.join(workspaceRoot, 'stools');

      const runId = Date.now();
      const tempDir = os.tmpdir();
      const proxyDir = path.join(tempDir, `autopod_proxies_${runId}`);
      const originalXmlPath = path.join(
        tempDir,
        `autopod_original_${runId}.xml`
      );
      const modifiedXmlPath = path.join(
        tempDir,
        `autopod_edited_${runId}.xml`
      );
      const configPath = path.join(tempDir, `autopod_config_${runId}.json`);
      const cutListPath = path.join(tempDir, `autopod_cuts_${runId}.json`);
      const mappingPath = path.join(tempDir, `autopod_mapping_${runId}.json`);

      // ──────────────────────────────────────────────────────────
      // STEP 1 — Export XML
      // ──────────────────────────────────────────────────────────
      console.log(
        `[AUTOPOD] Step 1/6: Exporting sequence from ${appTarget}...`
      );
      if (appTarget === 'premiere') {
        const result = await registry.callTool('premiere_export_xml', {
          export_path: originalXmlPath,
        });
        const resJson =
          typeof result.content === 'string'
            ? JSON.parse(result.content)
            : result.content;
        if (
          !resJson ||
          resJson.error ||
          !fs.existsSync(originalXmlPath)
        ) {
          throw new Error(
            `Premiere XML export failed: ${JSON.stringify(resJson)}`
          );
        }
      } else if (appTarget === 'resolve') {
        const result = await registry.callTool('resolve_export_xml', {
          export_path: originalXmlPath,
        });
        const resJson =
          typeof result.content === 'string'
            ? JSON.parse(result.content)
            : result.content;
        if (
          !resJson ||
          resJson.error ||
          !fs.existsSync(originalXmlPath)
        ) {
          throw new Error(
            `DaVinci Resolve FCPXML export failed: ${JSON.stringify(resJson)}`
          );
        }
      } else {
        throw new Error(
          `AutoPod support for "${appTarget}" is not implemented yet.`
        );
      }

      // ──────────────────────────────────────────────────────────
      // STEP 2 — Discover media
      // ──────────────────────────────────────────────────────────
      console.log(`[AUTOPOD] Step 2/6: Parsing timeline XML...`);
      const discoverScript = path.join(stoolsDir, 'discover_media.py');
      execSync(
        `"${pythonExe}" ${pyFlag} "${discoverScript}" --xml "${originalXmlPath}" --out "${configPath}"`,
        { stdio: 'inherit' }
      );

      const mediaConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const fps = mediaConfig.fps || 24.0;
      const duration_sec = mediaConfig.duration_sec || 3600.0;

      // ──────────────────────────────────────────────────────────
      // STEP 3 — Generate mapping (AI or manual with channel handling)
      // ──────────────────────────────────────────────────────────
      let resolvedMapping: string;
      let resolvedFallback: string = fallback || '1';

      if (use_generative) {
        console.log(
          `[AUTOPOD] Step 3/6: Extracting proxy clips and splitting audio channels...`
        );
        const proxyScript = path.join(stoolsDir, 'proxy_extractor.py');
        execSync(
          `"${pythonExe}" ${pyFlag} "${proxyScript}" --config "${configPath}" --out-dir "${proxyDir}"`,
          { stdio: 'inherit' }
        );

        const proxyConfigPath = path.join(proxyDir, 'proxy_config.json');
        if (!fs.existsSync(proxyConfigPath)) {
          throw new Error('Proxy extraction failed.');
        }

        console.log(
          `[AUTOPOD] Step 4/6: AI camera-to-microphone mapping...`
        );
        const mapperScript = path.join(stoolsDir, 'sentient_mapper.py');
        execSync(
          `"${pythonExe}" ${pyFlag} "${mapperScript}" --proxy-config "${proxyConfigPath}" --out "${mappingPath}"`,
          { stdio: 'inherit' }
        );

        const aiMapping = JSON.parse(
          fs.readFileSync(mappingPath, 'utf8')
        );
        resolvedFallback = aiMapping.fallback || '1';
        delete aiMapping.fallback;
        resolvedMapping = JSON.stringify(aiMapping);
      } else {
        console.log(`[AUTOPOD] Step 3/6: Using manual mapping...`);
        const mapping =
          typeof mapping_json === 'string'
            ? JSON.parse(mapping_json)
            : mapping_json || {};

        // Handle channel splitting for Traditional mode if any path has ?ch= suffix
        const needsSplitting = Object.values(mapping)
          .flat()
          .some((p: any) => p.includes('?ch='));

        if (needsSplitting) {
          console.log(
            `[AUTOPOD] Traditional Mode: Multi-channel sources detected. Auto-splitting channels...`
          );
          fs.mkdirSync(proxyDir, { recursive: true });

          for (const cam of Object.keys(mapping)) {
            mapping[cam] = mapping[cam].map((p: string) => {
              if (p.includes('?ch=')) {
                const [filePath, chPart] = p.split('?ch=');
                const chNum = parseInt(chPart);
                const outWav = path.join(
                  proxyDir,
                  `${path.basename(filePath)}_ch${chNum}.wav`
                );

                // Run a targeted ffmpeg command to extract just this channel if not already done
                if (!fs.existsSync(outWav)) {
                  console.log(
                    `  Extracting channel ${chNum} from ${path.basename(filePath)}...`
                  );
                  const cmd = `ffmpeg -y -i "${filePath}" -filter_complex "[0:a]pan=mono|c0=c${chNum - 1}[out]" -map "[out]" -ar 16000 -sample_fmt s16 -ac 1 "${outWav}"`;
                  execSync(cmd, { stdio: 'ignore' });
                }
                return outWav;
              }
              return p;
            });
          }
        }

        resolvedMapping = JSON.stringify(mapping);
        console.log(`[AUTOPOD] Step 4/6: Skipped (manual mode).`);
      }

      // ──────────────────────────────────────────────────────────
      // STEP 5 — Run local VAD engine
      // ──────────────────────────────────────────────────────────
      console.log(
        `[AUTOPOD] Step 5/6: Running local VAD analysis (fps=${fps}, duration=${duration_sec.toFixed(1)}s)...`
      );
      const autopodScript = path.join(stoolsDir, 'autopod.py');
      const escapedMapping = resolvedMapping.replace(/"/g, '\\"');
      const vadCmd = `"${pythonExe}" ${pyFlag} "${autopodScript}" --mapping "${escapedMapping}" --fallback "${resolvedFallback}" --fps ${fps} --duration ${duration_sec} --out "${cutListPath}"`;
      execSync(vadCmd, { stdio: 'inherit' });

      // ──────────────────────────────────────────────────────────
      // STEP 6 — Slicing and Import
      // ──────────────────────────────────────────────────────────
      console.log(
        `[AUTOPOD] Step 6/6: Slicing XML and importing back...`
      );
      const xmlScript = path.join(stoolsDir, 'xml_multicam.py');
      execSync(
        `"${pythonExe}" ${pyFlag} "${xmlScript}" --xml "${originalXmlPath}" --cuts "${cutListPath}" --out "${modifiedXmlPath}"`,
        { stdio: 'inherit' }
      );

      // Verify the sliced XML was generated
      if (!fs.existsSync(modifiedXmlPath)) {
        throw new Error(
          `XML slicing failed — output file not found at ${modifiedXmlPath}`
        );
      }
      const xmlSize = fs.statSync(modifiedXmlPath).size;
      console.log(
        `[AUTOPOD] Sliced XML generated: ${modifiedXmlPath} (${(xmlSize / 1024).toFixed(1)} KB)`
      );

      // Copy output XML to workspace stools dir as a backup
      const savedXmlPath = path.join(stoolsDir, `autopod_output.xml`);
      try {
        fs.copyFileSync(modifiedXmlPath, savedXmlPath);
        console.log(`[AUTOPOD] Output XML saved to: ${savedXmlPath}`);
      } catch (copyErr: any) {
        console.error(
          `[AUTOPOD] Failed to save copy: ${copyErr.message}`
        );
      }

      // Import back into the NLE
      if (appTarget === 'premiere') {
        console.log(
          `[AUTOPOD] Importing edited XML into Premiere...`
        );
        const importResult = await registry.callTool(
          'premiere_import_xml',
          { import_path: modifiedXmlPath }
        );
        const iResJson =
          typeof importResult.content === 'string'
            ? JSON.parse(importResult.content)
            : importResult.content;
        if (!iResJson || iResJson.error) {
          console.error(
            `[AUTOPOD] XML import failed:`,
            iResJson?.error || 'Unknown error'
          );
          console.log(
            `[AUTOPOD] You can manually import the file from: ${savedXmlPath}`
          );
          return JSON.stringify({
            error: `Import failed: ${iResJson?.error || 'Unknown'}`,
            xml_path: savedXmlPath,
            message: `The edited XML was saved to: ${savedXmlPath}. Open Premiere > File > Import and select this file.`,
          });
        }
        console.log(
          `[AUTOPOD] Import successful:`,
          iResJson.message
        );
      } else if (appTarget === 'resolve') {
        console.log(
          `[AUTOPOD] Importing edited FCPXML into DaVinci Resolve...`
        );
        const importResult = await registry.callTool(
          'resolve_import_xml',
          { import_path: modifiedXmlPath }
        );
        const iResJson =
          typeof importResult.content === 'string'
            ? JSON.parse(importResult.content)
            : importResult.content;
        if (!iResJson || iResJson.error) {
          console.error(
            `[AUTOPOD] FCPXML import failed:`,
            iResJson?.error || 'Unknown error'
          );
          console.log(
            `[AUTOPOD] You can manually import the file from: ${savedXmlPath}`
          );
          return JSON.stringify({
            error: `Import failed: ${iResJson?.error || 'Unknown'}`,
            xml_path: savedXmlPath,
            message: `The edited FCPXML was saved to: ${savedXmlPath}. In DaVinci Resolve, right-click the Media Pool > Timelines > Import > Timeline and select this file.`,
          });
        }
        console.log(
          `[AUTOPOD] Import successful:`,
          iResJson.message
        );
      }

      return JSON.stringify({
        success: true,
        message: `AutoPod pipeline complete! ${use_generative ? 'AI mapped cameras automatically.' : 'Used traditional mapping.'} A new sequence has been added to your project. XML also saved at: ${savedXmlPath}`,
        xml_path: savedXmlPath,
      });
    } catch (err: any) {
      console.error('[AUTOPOD] Pipeline Error:', err.message);
      return JSON.stringify({ error: err.message });
    }
  },
};

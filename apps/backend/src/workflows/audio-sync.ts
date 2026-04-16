import type { WorkflowDefinition } from './types.js';
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
 * Audio Sync Workflow:
 * Syncs external audio recordings to an edited timeline using FFT cross-correlation.
 *
 * Pipeline:
 *   1. Export timeline as FCP7 XML
 *   2. Discover media (video source paths) via discover_media.py
 *   3. Cross-correlate each video source against each external audio via audio_sync.py
 *   4. Inject synced audio into the XML via xml_inject_sync.py
 *   5. Import the result back as a new timeline
 */
export const syncExternalAudioWorkflow: WorkflowDefinition = {
  name: 'sync_external_audio',
  description:
    'Syncs external audio recordings (boom mic, Zoom recorder, etc.) to the current timeline. Uses FFT cross-correlation to find the exact offset, then creates a new timeline with the synced audio placed under each video clip.',
  parameters: {
    type: 'OBJECT',
    properties: {
      audio_paths: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'Array of absolute file paths to external audio files to sync.',
      },
      app_target: {
        type: 'STRING',
        description:
          'Target NLE: currently only "resolve" is supported. Defaults to "resolve".',
      },
    },
    required: ['audio_paths'],
  },
  execute: async (args, context) => {
    const { registry } = context;
    const appTarget = (args.app_target as string) || 'resolve';
    const audioPaths = args.audio_paths as string[];

    if (!audioPaths || audioPaths.length === 0) {
      return JSON.stringify({
        error: 'No audio file paths provided.',
        suggestion:
          'Please provide one or more external audio files to sync.',
      });
    }

    // Validate audio files exist
    const missingFiles = audioPaths.filter((p) => !fs.existsSync(p));
    if (missingFiles.length > 0) {
      return JSON.stringify({
        error: `Audio file(s) not found: ${missingFiles.join(', ')}`,
        suggestion:
          'Please check the file paths and make sure the files exist.',
      });
    }

    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
    const pyFlag = '-u'; // unbuffered output
    const pyEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };

    console.log(`[AUDIO-SYNC] Starting audio sync pipeline for ${appTarget}`);
    console.log(
      `[AUDIO-SYNC] External audio files: ${audioPaths.join(', ')}`
    );

    try {
      const workspaceRoot = findWorkspaceRoot();
      const stoolsDir = path.join(workspaceRoot, 'stools');

      // Ensure the tool index is populated (required before callTool)
      await registry.getAllTools();

      const runId = Date.now();
      const tempDir = os.tmpdir();
      const originalXmlPath = path.join(
        tempDir,
        `audiosync_original_${runId}.xml`
      );
      const configPath = path.join(
        tempDir,
        `audiosync_config_${runId}.json`
      );
      const syncMapPath = path.join(
        tempDir,
        `audiosync_map_${runId}.json`
      );
      const outputXmlPath = path.join(
        tempDir,
        `audiosync_output_${runId}.xml`
      );

      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      // STEP 1 ΓÇö Export XML from the active timeline
      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      console.log(`[AUDIO-SYNC] Step 1/5: Exporting timeline XML...`);

      if (appTarget !== 'resolve') {
        return JSON.stringify({
          error: `Audio Sync for "${appTarget}" is not implemented yet. Only DaVinci Resolve is supported.`,
        });
      }

      const exportResult = await registry.callTool('resolve_export_xml', {
        export_path: originalXmlPath,
      });
      const exportJson =
        typeof exportResult.content === 'string'
          ? JSON.parse(exportResult.content)
          : exportResult.content;

      if (
        !exportJson ||
        exportJson.error ||
        !fs.existsSync(originalXmlPath)
      ) {
        throw new Error(
          `XML export failed: ${JSON.stringify(exportJson)}`
        );
      }
      console.log(`[AUDIO-SYNC] XML exported to: ${originalXmlPath}`);

      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      // STEP 2 ΓÇö Discover media (video source paths)
      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      console.log(`[AUDIO-SYNC] Step 2/5: Discovering media...`);
      const discoverScript = path.join(stoolsDir, 'discover_media.py');
      execSync(
        `"${pythonExe}" ${pyFlag} "${discoverScript}" --xml "${originalXmlPath}" --out "${configPath}"`,
        { stdio: 'inherit', env: pyEnv }
      );

      const mediaConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf8')
      );
      const videoPaths: string[] = mediaConfig.videos || [];

      if (videoPaths.length === 0) {
        return JSON.stringify({
          error: 'No video clips with source media found on the timeline.',
          suggestion:
            'Make sure the timeline has video clips with linked media files.',
        });
      }

      console.log(
        `[AUDIO-SYNC] Found ${videoPaths.length} unique video source(s).`
      );

      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      // STEP 3 ΓÇö Cross-correlate each video against each audio
      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      console.log(
        `[AUDIO-SYNC] Step 3/5: Running FFT cross-correlation...`
      );

      // Build a Python script call that uses audio_sync.find_audio_offset
      // for each (video, audio) pair and outputs a sync map JSON
      const syncMap: Record<
        string,
        Array<{ audio_path: string; offset_seconds: number }>
      > = {};

      for (const videoPath of videoPaths) {
        if (!fs.existsSync(videoPath)) {
          console.warn(
            `[AUDIO-SYNC] Video file not found: ${videoPath}, skipping`
          );
          continue;
        }

        const matches: Array<{
          audio_path: string;
          offset_seconds: number;
        }> = [];

        for (const audioPath of audioPaths) {
          console.log(
            `[AUDIO-SYNC]   Correlating: ${path.basename(videoPath)} Γåö ${path.basename(audioPath)}...`
          );

          try {
            // Run audio_sync.find_audio_offset via a Python one-liner
            // that imports from stools
            const correlateCmd = `"${pythonExe}" ${pyFlag} -c "import sys; sys.path.insert(0, '${stoolsDir.replace(/\\/g, '/')}'); from audio_sync import find_audio_offset; offset = find_audio_offset('${videoPath.replace(/\\/g, '/')}', '${audioPath.replace(/\\/g, '/')}'); print(f'{offset:.6f}')"`;

            const stdout = execSync(correlateCmd, {
              timeout: 120000,
              encoding: 'utf8',
              env: pyEnv,
            });

            // Parse the last line as the offset
            const lines = stdout.trim().split('\n');
            const offsetStr = lines[lines.length - 1].trim();
            const offsetSec = parseFloat(offsetStr);

            if (isNaN(offsetSec)) {
              console.warn(
                `[AUDIO-SYNC]   Invalid offset output: "${offsetStr}"`
              );
              continue;
            }

            console.log(
              `[AUDIO-SYNC]   Offset: ${offsetSec >= 0 ? '+' : ''}${offsetSec.toFixed(3)}s`
            );

            matches.push({
              audio_path: audioPath,
              offset_seconds: offsetSec,
            });
          } catch (err: any) {
            console.error(
              `[AUDIO-SYNC]   Correlation failed: ${err.message?.slice(0, 200)}`
            );
          }
        }

        if (matches.length > 0) {
          syncMap[videoPath] = matches;
        }
      }

      if (Object.keys(syncMap).length === 0) {
        return JSON.stringify({
          error:
            'Could not find a sync match between any video and audio files.',
          suggestion:
            'Make sure the external audio was recorded simultaneously with the video.',
        });
      }

      // Save sync map
      fs.writeFileSync(syncMapPath, JSON.stringify(syncMap, null, 2));
      console.log(
        `[AUDIO-SYNC] Sync map: ${Object.keys(syncMap).length} video(s) matched.`
      );

      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      // STEP 4 ΓÇö Inject synced audio into XML
      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      console.log(
        `[AUDIO-SYNC] Step 4/5: Injecting synced audio into XML...`
      );
      const injectScript = path.join(stoolsDir, 'xml_inject_sync.py');
      execSync(
        `"${pythonExe}" ${pyFlag} "${injectScript}" --xml "${originalXmlPath}" --sync-map "${syncMapPath}" --out "${outputXmlPath}"`,
        { stdio: 'inherit', env: pyEnv }
      );

      if (!fs.existsSync(outputXmlPath)) {
        throw new Error(
          `Audio injection failed ΓÇö output file not found at ${outputXmlPath}`
        );
      }

      const xmlSize = fs.statSync(outputXmlPath).size;
      console.log(
        `[AUDIO-SYNC] Synced XML generated: ${outputXmlPath} (${(xmlSize / 1024).toFixed(1)} KB)`
      );

      // Save a backup copy to stools
      const savedXmlPath = path.join(stoolsDir, 'audiosync_output.xml');
      try {
        fs.copyFileSync(outputXmlPath, savedXmlPath);
        console.log(`[AUDIO-SYNC] Backup saved to: ${savedXmlPath}`);
      } catch (copyErr: any) {
        console.error(
          `[AUDIO-SYNC] Failed to save backup: ${copyErr.message}`
        );
      }

      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      // STEP 5 ΓÇö Import the synced XML back into DaVinci Resolve
      // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      console.log(
        `[AUDIO-SYNC] Step 5/5: Importing synced timeline into DaVinci Resolve...`
      );

      const importResult = await registry.callTool('resolve_import_xml', {
        import_path: outputXmlPath,
      });
      const importJson =
        typeof importResult.content === 'string'
          ? JSON.parse(importResult.content)
          : importResult.content;

      if (!importJson || importJson.error) {
        console.error(
          `[AUDIO-SYNC] XML import failed:`,
          importJson?.error || 'Unknown error'
        );
        return JSON.stringify({
          error: `Import failed: ${importJson?.error || 'Unknown'}`,
          xml_path: savedXmlPath,
          message: `The synced XML was saved to: ${savedXmlPath}. You can manually import it via File > Import Timeline.`,
        });
      }

      console.log(`[AUDIO-SYNC] Import successful!`);

      // Build summary
      const syncSummary = Object.entries(syncMap)
        .flatMap(([vid, matches]) =>
          matches.map(
            (info) =>
              `ΓÇó ${path.basename(vid)} Γåö ${path.basename(info.audio_path)} (offset: ${info.offset_seconds >= 0 ? '+' : ''}${info.offset_seconds.toFixed(3)}s)`
          )
        )
        .join('\n');

      return JSON.stringify({
        success: true,
        message: `Audio Sync complete! A new timeline with synced audio has been imported into your project.\n\nSync results:\n${syncSummary}`,
        xml_path: savedXmlPath,
        sync_map: syncMap,
      });
    } catch (err: any) {
      console.error('[AUDIO-SYNC] Pipeline Error:', err.message);
      return JSON.stringify({ error: err.message });
    }
  },
};

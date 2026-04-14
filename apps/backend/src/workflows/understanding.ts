/**
 * PipeFX — Project Understanding workflow.
 *
 * Orchestrates multi-step content analysis:
 *   1. scan_timeline  → structural blueprint (via MCP)
 *   2. sample_visuals → representative frames (via MCP)
 *   3. Whisper API    → audio transcription
 *   4. Gemini Vision  → visual frame descriptions
 *   5. Gemini LLM     → synthesize everything into knowledge
 *   6. Store results  → SQLite knowledge DB
 */

import type { WorkflowDefinition, WorkflowContext } from './types.js';
import * as fs from 'fs';
import {
  addKnowledge,
  searchKnowledge,
  listKnowledge,
  forgetKnowledge,
} from '../services/memory/knowledge.js';
import type { KnowledgeCategory } from '../services/memory/types.js';

/**
 * Extracts the text content from a tool result, handling both array and
 * string forms (MCP returns content as TextContent[] or plain string).
 */
function extractToolResultText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }
  return String(content);
}

/**
 * Resolves the correct scan_timeline tool name based on what tools are
 * available in the registry (Resolve uses 'scan_timeline', Premiere uses
 * 'premiere_scan_timeline').
 */
async function pickToolName(
  context: WorkflowContext,
  preferredNames: string[]
): Promise<string | null> {
  const tools = await context.registry.getAllTools();
  const available = new Set(tools.map((t) => t.name));
  for (const name of preferredNames) {
    if (available.has(name)) return name;
  }
  return null;
}

export const analyzeProjectWorkflow: WorkflowDefinition = {
  name: 'analyze_project',
  description:
    'Perform a comprehensive analysis of the currently open project timeline. ' +
    'Scans the timeline structure (clips, tracks, markers), samples visual frames, ' +
    'transcribes audio, and uses AI vision to understand the content. Results are ' +
    'stored in the project knowledge base for future context. ' +
    'Depth levels: "quick" (metadata only), "standard" (metadata + audio), ' +
    '"deep" (metadata + audio + visual analysis).',
  parameters: {
    type: 'OBJECT',
    properties: {
      projectId: {
        type: 'STRING',
        description:
          'The active project ID to store analysis results against.',
      },
      depth: {
        type: 'STRING',
        description:
          'Analysis depth: "quick" (structure only, free), ' +
          '"standard" (structure + audio transcript), ' +
          '"deep" (structure + audio + visual AI analysis). Defaults to "standard".',
      },
      force: {
        type: 'BOOLEAN',
        description:
          'If true, re-analyze even if a recent analysis exists. ' +
          'Defaults to false (skips if fingerprint matches).',
      },
    },
    required: ['projectId'],
  },

  execute: async (args, context) => {
    const projectId = args.projectId as string;
    const depth = (args.depth as string) || 'standard';
    const force = (args.force as boolean) || false;

    console.log(
      `[Understanding] Starting project analysis (depth: ${depth}, force: ${force})`
    );

    const results: string[] = [];

    // ════════════════════════════════════════════════════════════
    // Step 1: Scan the timeline structure
    // ════════════════════════════════════════════════════════════
    const scanTool = await pickToolName(context, [
      'scan_timeline',
      'premiere_scan_timeline',
    ]);

    if (!scanTool) {
      return JSON.stringify({
        error:
          'No scan_timeline tool found. Ensure DaVinci Resolve or Premiere Pro connector is active.',
      });
    }

    console.log(`[Understanding] Step 1/6: Scanning timeline via ${scanTool}`);
    const scanResult = await context.registry.callTool(scanTool, {});
    console.log(`[Understanding] Scan tool returned, parsing result...`);
    const scanStr = extractToolResultText(scanResult.content);

    let scanData: any;
    try {
      scanData = JSON.parse(scanStr);
      console.log(`[Understanding] Parsed scan data: ${scanData.edit_statistics?.total_clips || 0} clips`);
    } catch {
      return JSON.stringify({
        error: `Failed to parse scan_timeline result: ${scanStr.substring(0, 200)}`,
      });
    }

    if (scanData.error) {
      console.log(`[Understanding] Scan returned error: ${scanData.error}`);
      return JSON.stringify({ error: scanData.error });
    }

    // ── Staleness check ──
    if (!force) {
      const fingerprint = scanData._fingerprint;
      if (fingerprint) {
        console.log(`[Understanding] Checking staleness (fingerprint: ${fingerprint})...`);
        const existing = searchKnowledge(
          '_fingerprint',
          projectId,
          1
        );
        const matchingFingerprint = existing.find(
          (k) =>
            k.category === 'content_analysis' &&
            k.content.includes(fingerprint)
        );
        if (matchingFingerprint) {
          console.log(
            `[Understanding] Timeline fingerprint unchanged (${fingerprint}). Skipping re-analysis.`
          );
          return JSON.stringify({
            skipped: true,
            message:
              'Timeline has not changed since last analysis. Use force=true to re-analyze.',
            fingerprint,
          });
        }
        console.log(`[Understanding] Fingerprint is new — proceeding with analysis`);
      }
    }

    // ── Clear previous analysis knowledge for this project ──
    console.log(`[Understanding] Clearing previous analysis for project ${projectId}...`);
    const previousAnalysis = listKnowledge(projectId, [
      'content_analysis',
      'media_inventory',
    ]);
    for (const item of previousAnalysis) {
      if (item.projectId === projectId) {
        forgetKnowledge(item.id);
      }
    }
    console.log(`[Understanding] Cleared ${previousAnalysis.length} previous items`);

    // ── Store timeline structure as knowledge ──
    const stats = scanData.edit_statistics || {};
    console.log(`[Understanding] Storing timeline structure...`);

    addKnowledge({
      projectId,
      category: 'content_analysis' as KnowledgeCategory,
      subject: 'Timeline Structure',
      content:
        `Timeline "${scanData.timeline_name}" in project "${scanData.project_name}". ` +
        `Duration: ${scanData.duration_seconds}s, FPS: ${scanData.fps}, Resolution: ${scanData.resolution}. ` +
        `${stats.total_clips || 0} clips across ` +
        `${scanData.tracks?.video?.length || 0} video tracks, ` +
        `${scanData.tracks?.audio?.length || 0} audio tracks. ` +
        `${scanData.markers?.length || 0} markers. ` +
        `Average clip duration: ${stats.average_clip_duration_seconds || 0}s. ` +
        `Track utilization: ${JSON.stringify(stats.track_utilization || {})}. ` +
        `_fingerprint:${scanData._fingerprint || 'none'}`,
      source: 'ai_inferred',
    });
    results.push(
      `✅ Timeline structure scanned: ${stats.total_clips} clips, ${scanData.duration_seconds}s duration`
    );
    console.log(`[Understanding] Timeline structure stored ✓`);

    // ── Store source media inventory ──
    const allSources: Set<string> = new Set();
    for (const trackType of ['video', 'audio']) {
      for (const track of scanData.tracks?.[trackType] || []) {
        for (const clip of track.clips || []) {
          if (clip.source_file) allSources.add(clip.source_file);
        }
      }
    }

    if (allSources.size > 0) {
      const sourceList = Array.from(allSources)
        .map((s) => {
          const name = s.split(/[/\\]/).pop();
          return `- ${name}`;
        })
        .join('\n');

      addKnowledge({
        projectId,
        category: 'media_inventory' as KnowledgeCategory,
        subject: 'Source Media Files',
        content: `${allSources.size} unique source files used in timeline:\n${sourceList}`,
        source: 'ai_inferred',
      });
      results.push(
        `✅ Media inventory catalogued: ${allSources.size} source files`
      );
      console.log(`[Understanding] Media inventory stored ✓`);
    }

    // ── Store markers ──
    if (scanData.markers && scanData.markers.length > 0) {
      const markerList = scanData.markers
        .map(
          (m: any) =>
            `- ${m.time_seconds}s [${m.color}]: ${m.name || ''} ${m.note || ''}`
        )
        .join('\n');

      addKnowledge({
        projectId,
        category: 'content_analysis' as KnowledgeCategory,
        subject: 'Timeline Markers',
        content: `${scanData.markers.length} markers on timeline:\n${markerList}`,
        source: 'ai_inferred',
      });
      results.push(
        `✅ ${scanData.markers.length} markers catalogued`
      );
      console.log(`[Understanding] Markers stored ✓`);
    }

    // Quick depth stops here
    if (depth === 'quick') {
      console.log(`[Understanding] Quick analysis complete! Results: ${results.join(', ')}`);
      return JSON.stringify({
        success: true,
        depth,
        results,
        message: 'Quick analysis complete. Timeline structure and media inventory stored.',
      });
    }

    // ════════════════════════════════════════════════════════════
    // Step 2: Audio transcription (standard + deep)
    // ════════════════════════════════════════════════════════════
    console.log(`[Understanding] Step 2/6: Transcribing audio`);

    let transcriptText = '';
    try {
      // Try the existing backend workflow tool
      const transcriptTool = await pickToolName(context, [
        'get_transcript_from_timeline_audio',
      ]);

      if (transcriptTool) {
        const transcriptResult = await context.registry.callTool(
          transcriptTool,
          { target_language: 'English' }
        );
        const transcriptStr = extractToolResultText(transcriptResult.content);
        const transcriptData = JSON.parse(transcriptStr);

        if (
          transcriptData.success &&
          transcriptData.transcript &&
          Array.isArray(transcriptData.transcript)
        ) {
          transcriptText = transcriptData.transcript
            .map(
              (seg: any) =>
                `[${seg.start_seconds?.toFixed(1)}s] ${seg.text}`
            )
            .join('\n');

          addKnowledge({
            projectId,
            category: 'content_analysis' as KnowledgeCategory,
            subject: 'Audio Transcript',
            content:
              transcriptText.length > 4000
                ? transcriptText.substring(0, 4000) + '\n[...truncated]'
                : transcriptText,
            source: 'ai_inferred',
          });
          results.push(
            `✅ Audio transcribed: ${transcriptData.transcript.length} segments`
          );
        } else if (transcriptData.error) {
          results.push(
            `⚠️ Audio transcription skipped: ${transcriptData.error}`
          );
        }
      } else {
        results.push('⚠️ Audio transcription skipped: no transcript tool available');
      }
    } catch (err: any) {
      console.error('[Understanding] Audio transcription error:', err);
      results.push(
        `⚠️ Audio transcription failed: ${err.message || String(err)}`
      );
    }

    // Standard depth stops here
    if (depth === 'standard') {
      // ── Quick synthesis with LLM ──
      try {
        await synthesizeAndStore(
          context,
          projectId,
          scanData,
          transcriptText,
          [],
          results
        );
      } catch (err: any) {
        results.push(`⚠️ Synthesis failed: ${err.message || String(err)}`);
      }

      return JSON.stringify({
        success: true,
        depth,
        results,
        message:
          'Standard analysis complete. Timeline structure, media inventory, and audio transcript stored.',
      });
    }

    // ════════════════════════════════════════════════════════════
    // Step 3: Visual sampling (deep only)
    // ════════════════════════════════════════════════════════════
    console.log(`[Understanding] Step 3/6: Sampling visual frames`);

    const sampleTool = await pickToolName(context, [
      'sample_visuals',
      'premiere_sample_visuals',
    ]);

    const frameDescriptions: string[] = [];

    if (sampleTool) {
      try {
        const sampleResult = await context.registry.callTool(sampleTool, {
          strategy: 'at_cuts',
          max_frames: 15,
        });
        const sampleStr = extractToolResultText(sampleResult.content);
        const sampleData = JSON.parse(sampleStr);

        if (sampleData.frames && sampleData.frames.length > 0) {
          results.push(
            `✅ ${sampleData.frames.length} visual frames extracted`
          );

          // ════════════════════════════════════════════════════════════
          // Step 4: Gemini Vision analysis
          // ════════════════════════════════════════════════════════════
          console.log(
            `[Understanding] Step 4/6: Analyzing ${sampleData.frames.length} frames with Gemini Vision`
          );

          // Process frames in batches of 5 to avoid token limits
          const FRAME_BATCH = 5;
          for (
            let i = 0;
            i < sampleData.frames.length;
            i += FRAME_BATCH
          ) {
            const batch = sampleData.frames.slice(i, i + FRAME_BATCH);
            const parts: any[] = [
              {
                text:
                  'You are analyzing frames from a video editing timeline. ' +
                  'For each frame, describe: (1) what is visually happening, ' +
                  '(2) the type of shot (interview, B-roll, graphic, title card, etc.), ' +
                  '(3) notable visual characteristics (lighting, color, composition). ' +
                  'Be concise. Format: one line per frame with its timestamp.',
              },
            ];

            for (const frame of batch) {
              try {
                const imgBuffer = fs.readFileSync(frame.path);
                const base64 = imgBuffer.toString('base64');
                parts.push({
                  text: `Frame at ${frame.time_seconds}s (clip: ${frame.clip_name}):`,
                });
                parts.push({
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64,
                  },
                });
              } catch {
                // Skip frames that can't be read
              }
            }

            if (parts.length > 1) {
              try {
                const visionResult =
                  await context.ai.models.generateContent({
                    model: 'gemini-3.1-flash-lite-preview',
                    contents: [{ role: 'user', parts }],
                  });
                const description = visionResult.text ?? '';
                if (description) {
                  frameDescriptions.push(description);
                }
              } catch (visionErr: any) {
                console.error(
                  '[Understanding] Vision analysis error:',
                  visionErr
                );
              }
            }
          }

          if (frameDescriptions.length > 0) {
            addKnowledge({
              projectId,
              category: 'content_analysis' as KnowledgeCategory,
              subject: 'Visual Content Analysis',
              content: frameDescriptions.join('\n\n'),
              source: 'ai_inferred',
            });
            results.push(
              `✅ Visual analysis complete: ${frameDescriptions.length} batch(es) analyzed`
            );
          }

          // Clean up extracted frames
          for (const frame of sampleData.frames) {
            try {
              if (fs.existsSync(frame.path)) fs.unlinkSync(frame.path);
            } catch {
              // Non-critical cleanup
            }
          }
        } else if (sampleData.error) {
          results.push(
            `⚠️ Visual sampling skipped: ${sampleData.error}`
          );
        }
      } catch (err: any) {
        console.error('[Understanding] Visual sampling error:', err);
        results.push(
          `⚠️ Visual sampling failed: ${err.message || String(err)}`
        );
      }
    } else {
      results.push(
        '⚠️ Visual sampling skipped: no sample_visuals tool available'
      );
    }

    // ════════════════════════════════════════════════════════════
    // Step 5 & 6: LLM Synthesis + Store
    // ════════════════════════════════════════════════════════════
    try {
      await synthesizeAndStore(
        context,
        projectId,
        scanData,
        transcriptText,
        frameDescriptions,
        results
      );
    } catch (err: any) {
      results.push(`⚠️ Synthesis failed: ${err.message || String(err)}`);
    }

    return JSON.stringify({
      success: true,
      depth,
      results,
      message:
        'Deep analysis complete. Timeline structure, media inventory, audio transcript, visual analysis, and AI synthesis stored.',
    });
  },
};

/**
 * Use Gemini LLM to synthesize all collected data into a holistic
 * project understanding, then store it as a knowledge item.
 */
async function synthesizeAndStore(
  context: WorkflowContext,
  projectId: string,
  scanData: any,
  transcriptText: string,
  frameDescriptions: string[],
  results: string[]
): Promise<void> {
  console.log(`[Understanding] Step 5/6: Synthesizing project understanding`);

  const prompt = `You are analyzing a video editing project. Based on the following data, write a concise but comprehensive project brief.

## Timeline Structure
- Project: "${scanData.project_name}"
- Timeline: "${scanData.timeline_name}"  
- Duration: ${scanData.duration_seconds}s
- FPS: ${scanData.fps}, Resolution: ${scanData.resolution}
- Total clips: ${scanData.edit_statistics?.total_clips || 0}
- Video tracks: ${scanData.tracks?.video?.length || 0}
- Audio tracks: ${scanData.tracks?.audio?.length || 0}
- Markers: ${scanData.markers?.length || 0}

## Clip Names (first video track)
${(scanData.tracks?.video?.[0]?.clips || [])
  .slice(0, 30)
  .map((c: any) => `- ${c.name} (${c.duration_seconds}s)`)
  .join('\n') || 'No clips found'}

${
  transcriptText
    ? `## Audio Transcript (excerpt)\n${transcriptText.substring(0, 2000)}`
    : '## Audio: Not transcribed'
}

${
  frameDescriptions.length > 0
    ? `## Visual Frame Descriptions\n${frameDescriptions.join('\n')}`
    : '## Visual: Not analyzed'
}

Write your analysis in these sections:
1. **Content Summary** (1-2 sentences: what is this video about?)
2. **Content Type** (interview, vlog, documentary, tutorial, commercial, music video, etc.)
3. **Key Moments** (notable segments, transitions, or narrative beats — use timestamps)
4. **Technical Characteristics** (visual style, shooting quality, audio quality)
5. **Editorial Notes** (pacing, edit style, any issues noticed)

Be factual and specific. Do not speculate beyond what the data shows.`;

  try {
    const synthesisResult = await context.ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
    });

    const synthesis = synthesisResult.text ?? '';

    if (synthesis) {
      addKnowledge({
        projectId,
        category: 'content_analysis' as KnowledgeCategory,
        subject: 'Project Content Summary',
        content: synthesis,
        source: 'ai_inferred',
      });
      results.push('✅ AI synthesis complete: project understanding stored');
      console.log(`[Understanding] Step 6/6: Knowledge stored successfully`);
    }
  } catch (err: any) {
    console.error('[Understanding] Synthesis error:', err);
    throw err;
  }
}

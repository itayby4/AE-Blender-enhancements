import { useState, useCallback } from 'react';
import { useReactFlow, type Edge, type Node } from '@xyflow/react';

class Semaphore {
  private count: number;
  private queue: (() => void)[] = [];
  constructor(concurrency: number) {
    this.count = concurrency;
  }
  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.count++;
    }
  }
}

const pipelineLimiter = new Semaphore(3);

export function usePipelineExecutor() {
  const [isGlobalExecuting, setIsGlobalExecuting] = useState(false);
  const { getEdges, getNodes, setNodes } = useReactFlow();

  const executePipeline = useCallback(
    async (startNodeId?: string) => {
      if (isGlobalExecuting) return;
      setIsGlobalExecuting(true);

      const allEdges = getEdges();
      const allNodes = getNodes();

      // 1. Gather reachable nodes
      const reachableNodes = new Set<string>();

      if (startNodeId) {
        const queue = [startNodeId];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          if (!reachableNodes.has(currentId)) {
            reachableNodes.add(currentId);
            const outgoingEdges = allEdges.filter(
              (e) => e.source === currentId
            );
            for (const edge of outgoingEdges) {
              queue.push(edge.target);
            }
          }
        }
        reachableNodes.delete(startNodeId);
      } else {
        for (const node of allNodes) {
          reachableNodes.add(node.id);
        }
      }

      // Build static dependencies map for reachable nodes
      const dependencies = new Map<string, string[]>();
      for (const edge of allEdges) {
        if (!dependencies.has(edge.target)) {
          dependencies.set(edge.target, []);
        }
        dependencies.get(edge.target)!.push(edge.source);
      }

      // 2. Define the execution logic for a single node inside the pipeline
      const executeNode = async (executionId: string): Promise<void> => {
        const currentNode = getNodes().find((n: Node) => n.id === executionId);

        // We only actively "execute" modelNodes and soundNodes
        if (
          !currentNode ||
          (currentNode.type !== 'modelNode' && currentNode.type !== 'soundNode')
        )
          return;

        const { model, ratio, duration, resolution } = currentNode.data;

        // Extract required data (prompts, references) from upstream parents
        let resolvedPrompt = currentNode.data.prompt || '';
        const selectedRatio = ratio || '16:9';
        const selectedDuration = duration || '5';
        const selectedResolution = resolution || '720p';
        const incomingImageRefs: string[] = [];
        const searchQueue = [executionId];
        const visitedParents = new Set<string>([executionId]);

        while (searchQueue.length > 0) {
          const targetId = searchQueue.shift()!;
          const incomingEdges = allEdges.filter(
            (e: Edge) => e.target === targetId
          );

          for (const edge of incomingEdges) {
            const parentNode = getNodes().find(
              (n: Node) => n.id === edge.source
            );
            if (!parentNode || visitedParents.has(parentNode.id)) continue;
            visitedParents.add(parentNode.id);

            if (parentNode.type === 'nullNode') {
              searchQueue.push(parentNode.id);
            } else if (
              parentNode.type === 'promptNode' &&
              parentNode.data?.prompt
            ) {
              resolvedPrompt = parentNode.data.prompt as string;
            } else if (
              parentNode.type === 'modelNode' &&
              parentNode.data?.previewUrl
            ) {
              incomingImageRefs.push(parentNode.data.previewUrl as string);
            } else if (
              parentNode.type === 'mediaNode' &&
              parentNode.data?.url
            ) {
              incomingImageRefs.push(parentNode.data.url as string);
            }
          }
        }
        const prompt = `REALISTIC, ${resolvedPrompt}`;

        // Transition to Generating State
        setNodes((nds) =>
          nds.map((n) =>
            n.id === executionId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    previewUrl: null,
                    isGenerating: true,
                    error: null,
                  },
                }
              : n
          )
        );

        const MODEL_MAP: Record<string, string> = {
          kling: 'kling3',
          nanobanana: 'gemini2',
          seeddance: 'seeddance2',
          seeddream: 'seeddream45',
          'elevenlabs-tts': 'elevenlabs-tts',
          'elevenlabs-sfx': 'elevenlabs-sfx',
          'elevenlabs-sts': 'elevenlabs-sts',
          'elevenlabs-isolate': 'elevenlabs-isolate',
        };
        const backendModel = MODEL_MAP[model as string] || model;

        try {
          await pipelineLimiter.acquire();
          console.log(
            `[Pipeline] Triggering node ${executionId} (${backendModel}) with prompt: ${prompt} | ratio: ${selectedRatio} | duration: ${selectedDuration}s | resolution: ${selectedResolution}`
          );

          const response = await fetch('http://localhost:3001/api/ai-models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: backendModel,
              prompt: prompt || 'Cinematic highly-detailed scene',
              imageRef:
                incomingImageRefs.length > 0 ? incomingImageRefs[0] : undefined,
              imageRefs: incomingImageRefs,
              audioRef:
                incomingImageRefs.length > 0 ? incomingImageRefs[0] : undefined,
              aspectRatio: selectedRatio,
              duration: selectedDuration,
              resolution: selectedResolution,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error: ${errText}`);
          }

          const result = await response.json();

          try {
            await fetch('http://localhost:3001/api/save-render', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: result.url,
                type: result.type || 'video',
                model: backendModel,
                prompt: prompt,
              }),
            });
          } catch {
            /* ignore */
          }

          // Execution succeeded! Update node with result media
          setNodes((nds) =>
            nds.map((n) =>
              n.id === executionId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      isGenerating: false,
                      previewUrl: result.url || '',
                      mediaType: result.type || 'video',
                    },
                  }
                : n
            )
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(
            `[Pipeline] Failed at node ${executionId}:`,
            errorMessage
          );

          setNodes((nds) =>
            nds.map((n) =>
              n.id === executionId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      isGenerating: false,
                      error: errorMessage,
                    },
                  }
                : n
            )
          );

          throw new Error(
            `Pipeline halted due to error in node ${executionId}`
          );
        } finally {
          pipelineLimiter.release();
        }
      };

      // 3. Coordinate parallel orchestration
      const nodePromises = new Map<string, Promise<void>>();

      const getOrStartNode = (id: string): Promise<void> => {
        if (nodePromises.has(id)) return nodePromises.get(id)!;

        const deps = dependencies.get(id) || [];
        const depPromises = deps
          .filter((depId) => reachableNodes.has(depId))
          .map((depId) => getOrStartNode(depId));

        const promise = Promise.all(depPromises).then(() => {
          return executeNode(id);
        });

        nodePromises.set(id, promise);
        return promise;
      };

      try {
        const executionTasks = Array.from(reachableNodes).map((id) =>
          getOrStartNode(id)
        );
        await Promise.all(executionTasks);
        console.log('[Pipeline] Execution fully completed.');
      } catch (e) {
        console.warn(
          '[Pipeline] Execution halted prematurely due to node failure.'
        );
      } finally {
        setIsGlobalExecuting(false);
      }
    },
    [isGlobalExecuting, getEdges, getNodes, setNodes]
  );

  return { executePipeline, isGlobalExecuting };
}

import React, {
  useCallback,
  useRef,
  useState,
  useEffect,
  type DragEvent,
} from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  ReactFlowProvider,
  useReactFlow,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Workflow,
  Save,
  Settings2,
  Play,
  GripVertical,
  Plus,
  Sparkles,
  Video,
  Wand2,
  PlaySquare,
  Type,
  Palette,
  ChevronRight,
  ChevronDown,
  Upload,
  HardDriveDownload,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  Brain,
  Mic,
  Music,
  AudioLines,
  Headphones,
} from 'lucide-react';
import { Button } from './button.js';
import { ModelNode } from './custom-nodes/ModelNode.js';
import { TriggerNode } from './custom-nodes/TriggerNode.js';
import { PromptNode } from './custom-nodes/PromptNode.js';
import { MediaNode } from './custom-nodes/MediaNode.js';
import { NullNode } from './custom-nodes/NullNode.js';
import { DownloadNode } from './custom-nodes/DownloadNode.js';
import { SoundNode } from './custom-nodes/SoundNode.js';
import {
  onPipelineActions,
  type PipelineAction,
} from '../contracts/pipeline-actions.js';
import { usePipelineExecutor } from './usePipelineExecutor.js';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

const nodeTypes = {
  modelNode: ModelNode,
  triggerNode: TriggerNode,
  promptNode: PromptNode,
  mediaNode: MediaNode,
  nullNode: NullNode,
  downloadNode: DownloadNode,
  soundNode: SoundNode,
};

export const VIDEO_MODELS = [
  {
    type: 'modelNode',
    model: 'kling',
    label: 'Kling 3.0',
    desc: 'High-fidelity cinematic video generation',
    icon: Sparkles,
    color: 'text-primary',
  },
  {
    type: 'modelNode',
    model: 'seedance-2',
    label: 'SeedDance 2 (Pro)',
    desc: 'Dance & motion-driven video generation',
    icon: Wand2,
    color: 'text-emerald-500',
  },
  {
    type: 'modelNode',
    model: 'seedance-2-fast',
    label: 'SeedDance 2 (Fast)',
    desc: 'Faster dance & motion-driven video generation',
    icon: Wand2,
    color: 'text-emerald-400',
  },
];

export const IMAGE_MODELS = [
  {
    type: 'modelNode',
    model: 'seeddream',
    label: 'SeedDream 5',
    desc: 'High-quality image generation & editing',
    icon: Palette,
    color: 'text-rose-500',
  },
  {
    type: 'modelNode',
    model: 'nanobanana',
    label: 'Nano Banana 2',
    desc: 'Fast experimental model for stylized motion',
    icon: Video,
    color: 'text-amber-500',
  },
  {
    type: 'modelNode',
    model: 'gpt-image-2',
    label: 'GPT Image 2',
    desc: 'OpenAI flagship image generation & editing',
    icon: Sparkles,
    color: 'text-sky-400',
  },
];

export const LLM_MODELS = [
  {
    type: 'modelNode',
    model: 'anthropic',
    label: 'Claude 3.5 Sonnet',
    desc: 'Advanced reasoning and text generation',
    icon: Brain,
    color: 'text-purple-500',
  },
];

export const SOUND_MODELS = [
  {
    type: 'soundNode',
    model: 'elevenlabs-tts',
    label: 'ElevenLabs TTS',
    desc: 'AI text-to-speech with realistic voices',
    icon: Mic,
    color: 'text-cyan-400',
  },
  {
    type: 'soundNode',
    model: 'elevenlabs-sfx',
    label: 'ElevenLabs SFX',
    desc: 'Generate sound effects from text',
    icon: Music,
    color: 'text-orange-400',
  },
  {
    type: 'soundNode',
    model: 'elevenlabs-sts',
    label: 'ElevenLabs STS',
    desc: 'Voice-to-voice style transfer',
    icon: AudioLines,
    color: 'text-teal-400',
  },
  {
    type: 'soundNode',
    model: 'elevenlabs-isolate',
    label: 'Audio Isolate',
    desc: 'Isolate vocals from background noise',
    icon: Headphones,
    color: 'text-pink-400',
  },
];

export const TOOLS_NODES = [
  {
    type: 'triggerNode',
    model: 'trigger',
    label: 'Start Trigger',
    desc: 'Connect to pipeline start',
    icon: PlaySquare,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
  },
  {
    type: 'promptNode',
    model: 'prompt',
    label: 'Prompt Node',
    desc: 'Text input for models',
    icon: Type,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    type: 'downloadNode',
    model: 'download',
    label: 'Download Node',
    desc: 'Save upstream media',
    icon: HardDriveDownload,
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
  },
  {
    type: 'nullNode',
    model: 'null',
    label: 'Null Node',
    desc: 'Pass-through proxy node',
    icon: Type,
    isNull: true,
    color: 'text-muted-foreground',
    bg: 'bg-muted/10',
  },
];

let id = 0;
const getId = () => `node_${id++}`;

const PERSIST_KEY = 'pipefx-node-system-graph';

type PersistedGraph = { nodes: Node[]; edges: Edge[] };

function loadPersistedGraph(): PersistedGraph {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return { nodes: [], edges: [] };
    const parsed = JSON.parse(raw) as PersistedGraph;
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    // Bump id counter past any persisted ids (monotonic — never regress)
    for (const n of nodes) {
      const m = /^node_(\d+)$/.exec(n.id);
      if (m) id = Math.max(id, Number(m[1]) + 1);
    }
    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

function NodeSystemFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // Lazy initializer — runs exactly once, unlike useRef(expr) which evaluates expr every render.
  const [initialGraph] = useState<PersistedGraph>(loadPersistedGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialGraph.edges);

  // Persist graph to localStorage whenever nodes or edges change.
  // Debounced via microtask to coalesce rapid updates during drags.
  useEffect(() => {
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify({ nodes, edges }));
      } catch {
        // Quota/serialization errors — ignore (data URLs in mediaNodes can be large)
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [nodes, edges]);
  const [draggedNode, setDraggedNode] = useState<{
    type: string;
    model: string;
    label: string;
    desc: string;
  } | null>(null);
  const [menu, setMenu] = useState<{
    clientX: number;
    clientY: number;
    top: number;
    left: number;
  } | null>(null);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();

  const { executePipeline, isGlobalExecuting } = usePipelineExecutor();

  // Section states
  const [openSections, setOpenSections] = useState({
    video: true,
    image: true,
    llm: true,
    sound: true,
    tools: true,
  });
  const toggleSection = (s: keyof typeof openSections) =>
    setOpenSections((o) => ({ ...o, [s]: !o[s] }));

  // Responsive sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Clipboard for Copy & Paste
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragStart = (
    event: DragEvent,
    nodeType: string,
    model: string,
    label: string,
    desc: string
  ) => {
    setDraggedNode({ type: nodeType, model, label, desc });
    event.dataTransfer.setData('text/plain', 'model_node');
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files')
      ? 'copy'
      : 'move';
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Accept both internal node drags AND external file drops
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files')
      ? 'copy'
      : 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // === External file drop (OS → Canvas) ===
      const files = event.dataTransfer.files;
      if (files && files.length > 0) {
        Array.from(files).forEach((file, index) => {
          const mimeType = file.type || '';
          let mediaType: 'image' | 'video' | 'audio' | 'unknown' = 'unknown';
          if (mimeType.startsWith('image/')) mediaType = 'image';
          else if (mimeType.startsWith('video/')) mediaType = 'video';
          else if (mimeType.startsWith('audio/')) mediaType = 'audio';

          // Read file as data URL for preview
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const newNode: Node = {
              id: getId(),
              type: 'mediaNode',
              position: {
                x: position.x + index * 30,
                y: position.y + index * 30,
              },
              data: {
                url: dataUrl,
                fileName: file.name,
                mediaType,
                mimeType: file.type,
              },
            };
            setNodes((nds) => nds.concat(newNode));
          };
          reader.readAsDataURL(file);
        });
        return;
      }

      // === Internal node palette drag ===
      if (!draggedNode) return;

      const newNode = {
        id: getId(),
        type: draggedNode.type,
        position,
        data: {
          label: draggedNode.label,
          model: draggedNode.model,
          description: draggedNode.desc,
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setDraggedNode(null);
    },
    [screenToFlowPosition, setNodes, draggedNode]
  );

  // Handle right-click on the canvas background
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();

      setMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        top: event.clientY - bounds.top,
        left: event.clientX - bounds.left,
      });
    },
    []
  );

  // Force context menu on right-click release, even if d3-zoom was dragging
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Only care about right-click release
      if (e.button !== 2) return;

      // Check if we are inside the reactFlowWrapper
      if (
        !reactFlowWrapper.current ||
        !reactFlowWrapper.current.contains(e.target as globalThis.Node)
      ) {
        return;
      }

      // Check if we dropped over a node or edge (we only want pane menu)
      const target = e.target as HTMLElement;
      if (
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__edge')
      ) {
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();

      setMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        top: e.clientY - bounds.top,
        left: e.clientX - bounds.left,
      });
    };

    // Use capture phase to guarantee we get it before d3 can stop it
    window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true });
    return () =>
      window.removeEventListener('mouseup', handleGlobalMouseUp, {
        capture: true,
      });
  }, []);

  const onPaneClick = useCallback(() => {
    setMenu(null);
  }, []);

  // Use the menu coordinates to add the node precisely where the user right clicked
  const addNodeFromMenu = useCallback(
    (nodeType: string, model: string, label: string, desc: string) => {
      if (!menu) return;

      const position = screenToFlowPosition({
        x: menu.clientX,
        y: menu.clientY,
      });

      const newNode = {
        id: getId(),
        type: nodeType,
        position,
        data: { label, model, description: desc },
      };

      setNodes((nds) => nds.concat(newNode));
      setMenu(null);
    },
    [menu, screenToFlowPosition, setNodes]
  );

  // Fallback for easy click-to-add functionality
  const onClickAdd = useCallback(
    (nodeType: string, model: string, label: string, desc: string) => {
      if (!reactFlowWrapper.current) return;

      // Add to center of wrapper bounds
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = screenToFlowPosition({
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });

      // Add slight random offset so they don't perfectly overlap if clicked twice
      position.x += (Math.random() - 0.5) * 50;
      position.y += (Math.random() - 0.5) * 50;

      const newNode = {
        id: getId(),
        type: nodeType,
        position,
        data: { label, model, description: desc },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  // === Pipeline Action Handler (Chat → Node Editor) ===
  useEffect(() => {
    const unsubscribe = onPipelineActions((actions: PipelineAction[]) => {
      // Functional setState completely ignores React Flow internal store timing issues
      // But we MUST pre-calculate the idMap synchronously outside the setters
      // so both setNodes and setEdges share the exact same generated IDs!
      const idMap: Record<string, string> = {};

      for (const action of actions) {
        if (action.type === 'add_node' && action.nodeId) {
          idMap[action.nodeId] = getId();
        }
      }

      let lastAddedId: string | null = null;
      const colCounts: Record<string, number> = {};

      setNodes((currentNodes) => {
        let updatedNodes = [...currentNodes];

        for (const action of actions) {
          switch (action.type) {
            case 'clear_canvas': {
              updatedNodes = [];
              break;
            }
            case 'add_node': {
              // Use the pre-calculated ID if available, otherwise generate a new one
              const newId =
                action.nodeId && idMap[action.nodeId]
                  ? idMap[action.nodeId]
                  : getId();
              const type = action.nodeType || 'modelNode';

              let xPos = 100;
              if (
                type === 'triggerNode' ||
                type === 'nullNode' ||
                type === 'mediaNode' ||
                type === 'downloadNode'
              )
                xPos = 100;
              else if (type === 'promptNode') xPos = 500;
              else if (type === 'modelNode') xPos = 900;

              const colKey = String(xPos);
              colCounts[colKey] = (colCounts[colKey] || 0) + 1;
              const yPos = 100 + (colCounts[colKey] - 1) * 220;

              const newNode: Node = {
                id: newId,
                type,
                position: { x: xPos, y: yPos },
                data: {
                  label: action.label || action.model || 'New Node',
                  model: action.model || '',
                  description: '',
                  prompt: action.prompt || '',
                },
              };
              updatedNodes.push(newNode);

              lastAddedId = newId;
              break;
            }
            case 'set_prompt': {
              const realId = action.nodeId
                ? idMap[action.nodeId] || action.nodeId
                : lastAddedId;
              if (realId && action.prompt) {
                updatedNodes = updatedNodes.map((n) =>
                  n.id === realId
                    ? { ...n, data: { ...n.data, prompt: action.prompt } }
                    : n
                );
              }
              break;
            }
            case 'remove_node': {
              const realId = action.nodeId
                ? idMap[action.nodeId] || action.nodeId
                : null;
              if (realId) {
                updatedNodes = updatedNodes.filter((n) => n.id !== realId);
              }
              break;
            }
          }
        }
        return updatedNodes;
      });

      setEdges((currentEdges) => {
        let updatedEdges = [...currentEdges];

        for (const action of actions) {
          switch (action.type) {
            case 'clear_canvas': {
              updatedEdges = [];
              break;
            }
            case 'connect_nodes': {
              if (action.sourceId && action.targetId) {
                const realSource = idMap[action.sourceId] || action.sourceId;
                const realTarget = idMap[action.targetId] || action.targetId;
                updatedEdges.push({
                  id: `e_${realSource}_${realTarget}`,
                  source: realSource,
                  target: realTarget,
                });
              }
              break;
            }
            case 'remove_node': {
              const realId = action.nodeId
                ? idMap[action.nodeId] || action.nodeId
                : null;
              if (realId) {
                updatedEdges = updatedEdges.filter(
                  (e) => e.source !== realId && e.target !== realId
                );
              }
              break;
            }
          }
        }
        return updatedEdges;
      });
    });
    return unsubscribe;
  }, [setNodes, setEdges]);

  // === Keyboard Shortcuts Handler ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const isCtrl = e.ctrlKey || e.metaKey;

      // Select All (Ctrl+A)
      if (isCtrl && (e.code === 'KeyA' || e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        setEdges((eds) => eds.map((edge) => ({ ...edge, selected: true })));
        return;
      }

      // Copy (Ctrl+C)
      if (isCtrl && (e.code === 'KeyC' || e.key.toLowerCase() === 'c')) {
        const currentNodes = getNodes();
        const currentEdges = getEdges();
        const selectedNodes = currentNodes.filter((n) => n.selected);
        if (selectedNodes.length === 0) return;

        e.preventDefault();

        const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
        const selectedEdges = currentEdges.filter(
          (edge) =>
            selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
        );

        clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
      }

      // Paste (Ctrl+V)
      if (isCtrl && (e.code === 'KeyV' || e.key.toLowerCase() === 'v')) {
        const clipboard = clipboardRef.current;
        if (!clipboard || clipboard.nodes.length === 0) return;

        e.preventDefault();

        const idMap: Record<string, string> = {};

        // Increment position slightly so they don't perfectly stack
        const newNodes = clipboard.nodes.map((node) => {
          const newId = getId();
          idMap[node.id] = newId;
          return {
            ...node,
            id: newId,
            selected: true, // Auto-select newly pasted nodes
            position: {
              x: node.position.x + 40 + Math.random() * 20,
              y: node.position.y + 40 + Math.random() * 20,
            },
          };
        });

        const newEdges = clipboard.edges.map((edge) => ({
          ...edge,
          id: `e_${idMap[edge.source]}_${idMap[edge.target]}_${getId()}`,
          source: idMap[edge.source],
          target: idMap[edge.target],
          selected: false,
        }));

        setNodes((nds) => [
          ...nds.map((n) => ({ ...n, selected: false })), // Deselect existing nodes
          ...newNodes,
        ]);

        setEdges((eds) => [...eds, ...newEdges]);

        // Update clipboard positions to allow repeated pasting offsets
        clipboardRef.current = { nodes: newNodes, edges: newEdges };
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [getNodes, getEdges, setNodes, setEdges]);

  // === Export / Save Graph ===
  const handleSaveGraph = useCallback(async () => {
    const graphData = {
      nodes,
      edges,
      version: 1,
      exportedAt: new Date().toISOString(),
    };

    try {
      const filePath = await save({
        filters: [
          {
            name: 'JSON File',
            extensions: ['json'],
          },
        ],
        defaultPath: `pipefx_pipeline_${Math.floor(Date.now() / 1000)}.json`,
      });

      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(graphData, null, 2));
      }
    } catch (err) {
      console.error('Failed to export graph:', err);
    }
  }, [nodes, edges]);

  return (
    <div className="flex flex-col h-full w-full bg-background relative overflow-hidden text-foreground border-l">
      {/* Top Toolbar */}
      <div className="h-14 border-b bg-card/50 flex items-center justify-between px-4 shrink-0 z-10 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 mr-1 text-muted-foreground hover:text-foreground"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title="Toggle Sidebar"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <Workflow className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-sm max-md:hidden">
            Pipeline Editor
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleSaveGraph}
          >
            <Save className="h-3.5 w-3.5" />
            Save Graph
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            Properties
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => executePipeline()}
            disabled={isGlobalExecuting}
          >
            {isGlobalExecuting ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
            )}
            {isGlobalExecuting ? 'Executing...' : 'Execute Pipeline'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 w-full h-full min-h-0 relative">
        {/* Sidebar / Node Palette */}
        {isSidebarOpen && (
          <div className="w-64 max-md:absolute max-md:z-40 max-md:h-full max-md:border-r max-md:shadow-2xl border-r bg-card/95 backdrop-blur-md md:bg-card/50 flex flex-col p-4 shrink-0 overflow-y-auto transition-all animate-in slide-in-from-left-8 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AI Nodes
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Click nodes to add or drag"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Video Models */}
              <div>
                <button
                  onClick={() => toggleSection('video')}
                  className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground transition-colors outline-hidden"
                >
                  <span>Video Models</span>
                  {openSections.video ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                {openSections.video && (
                  <div className="space-y-2">
                    {VIDEO_MODELS.map((node) => (
                      <div
                        key={node.model}
                        className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-primary/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
                        draggable={true}
                        onDragStart={(e) =>
                          onDragStart(
                            e,
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                        onClick={() =>
                          onClickAdd(
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                      >
                        <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
                        <div className="pointer-events-none">
                          <div className="font-medium text-sm flex items-center gap-1.5">
                            <node.icon
                              className={`w-3.5 h-3.5 ${node.color}`}
                            />{' '}
                            {node.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            {node.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Image Models */}
              <div>
                <button
                  onClick={() => toggleSection('image')}
                  className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4 hover:text-foreground transition-colors outline-hidden"
                >
                  <span>Image Models</span>
                  {openSections.image ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                {openSections.image && (
                  <div className="space-y-2">
                    {IMAGE_MODELS.map((node) => (
                      <div
                        key={node.model}
                        className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-primary/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
                        draggable={true}
                        onDragStart={(e) =>
                          onDragStart(
                            e,
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                        onClick={() =>
                          onClickAdd(
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                      >
                        <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
                        <div className="pointer-events-none">
                          <div className="font-medium text-sm flex items-center gap-1.5">
                            <node.icon
                              className={`w-3.5 h-3.5 ${node.color}`}
                            />{' '}
                            {node.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            {node.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* LLM Models */}
              <div>
                <button
                  onClick={() => toggleSection('llm')}
                  className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4 hover:text-foreground transition-colors outline-hidden"
                >
                  <span>LLM Models</span>
                  {openSections.llm ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                {openSections.llm && (
                  <div className="space-y-2">
                    {LLM_MODELS.map((node) => (
                      <div
                        key={node.model}
                        className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-primary/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
                        draggable={true}
                        onDragStart={(e) =>
                          onDragStart(
                            e,
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                        onClick={() =>
                          onClickAdd(
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                      >
                        <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
                        <div className="pointer-events-none">
                          <div className="font-medium text-sm flex items-center gap-1.5">
                            <node.icon
                              className={`w-3.5 h-3.5 ${node.color}`}
                            />{' '}
                            {node.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            {node.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sound Models */}
              <div>
                <button
                  onClick={() => toggleSection('sound')}
                  className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4 hover:text-foreground transition-colors outline-hidden"
                >
                  <span>Sound Models</span>
                  {openSections.sound ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                {openSections.sound && (
                  <div className="space-y-2">
                    {SOUND_MODELS.map((node) => (
                      <div
                        key={node.model}
                        className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-primary/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
                        draggable={true}
                        onDragStart={(e) =>
                          onDragStart(
                            e,
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                        onClick={() =>
                          onClickAdd(
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                      >
                        <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
                        <div className="pointer-events-none">
                          <div className="font-medium text-sm flex items-center gap-1.5">
                            <node.icon
                              className={`w-3.5 h-3.5 ${node.color}`}
                            />{' '}
                            {node.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            {node.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tools */}
              <div>
                <button
                  onClick={() => toggleSection('tools')}
                  className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4 hover:text-foreground transition-colors outline-hidden"
                >
                  <span>Tools</span>
                  {openSections.tools ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                {openSections.tools && (
                  <div className="space-y-2">
                    {TOOLS_NODES.map((node) => (
                      <div
                        key={node.model}
                        className={`p-3 border rounded-lg ${
                          node.bg || 'bg-background'
                        } border-border/30 shadow-sm flex items-start gap-3 cursor-grab hover:brightness-95 transition-all active:cursor-grabbing hover:border-foreground/20 [&>*]:pointer-events-none`}
                        draggable={true}
                        onDragStart={(e) =>
                          onDragStart(
                            e,
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                        onClick={() =>
                          onClickAdd(
                            node.type,
                            node.model,
                            node.label,
                            node.desc
                          )
                        }
                      >
                        <GripVertical
                          className={`w-4 h-4 mt-0.5 ${node.color} opacity-50 shrink-0 pointer-events-none`}
                        />
                        <div className="pointer-events-none">
                          <div
                            className={`font-bold text-sm flex items-center gap-1.5 ${node.color}`}
                          >
                            {node.isNull && (
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-dashed border-muted-foreground" />
                            )}
                            {!node.isNull && (
                              <node.icon className="w-3.5 h-3.5" />
                            )}
                            {node.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
                            {node.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Media Drop Zone Hint */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Media
                </h3>
                <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-muted-foreground/30 rounded-lg bg-muted/20 text-muted-foreground/50 gap-2 hover:border-cyan-500/50 hover:text-cyan-400/80 hover:bg-cyan-500/5 transition-all">
                  <Upload className="h-5 w-5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">
                    Drag files onto canvas
                  </span>
                  <span className="text-[9px] opacity-60">
                    Images • Videos • Audio
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Flow Canvas */}
        <div
          className="flex-1 h-full w-full relative"
          ref={reactFlowWrapper}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneContextMenu={onPaneContextMenu}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            selectionOnDrag={true}
            panOnDrag={[1, 2]}
            panActivationKeyCode="Shift"
            selectionMode={SelectionMode.Partial}
            minZoom={0.05}
            fitView
            className="bg-muted/10 w-full h-full"
          >
            <Controls className="bg-card border-border shadow-md rounded-md overflow-hidden fill-foreground m-4" />
            <MiniMap
              className="bg-card border border-border shadow-md rounded-md m-4"
              nodeColor="hsl(var(--primary))"
              maskColor="hsl(var(--background) / 0.7)"
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="hsl(var(--muted-foreground) / 0.2)"
            />
          </ReactFlow>

          {/* Custom Context Menu */}
          {menu && (
            <div
              className="absolute z-50 w-52 bg-card/95 backdrop-blur-md border border-border shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150 rounded-xl"
              style={{ top: menu.top, left: menu.left }}
            >
              <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-80 mb-1 border-b border-border/50">
                Add Action Node
              </div>

              {/* Video Models Submenu */}
              <div className="relative group/video">
                <button className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group-hover/video:bg-muted outline-hidden">
                  <span className="font-medium">Video Models</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="absolute left-full top-0 ml-1.5 w-48 bg-card/95 backdrop-blur-md border border-border shadow-2xl p-1.5 rounded-xl hidden group-hover/video:block animate-in fade-in zoom-in-95 duration-100">
                  {VIDEO_MODELS.map((node) => (
                    <button
                      key={node.model}
                      onClick={() =>
                        addNodeFromMenu(
                          node.type,
                          node.model,
                          node.label,
                          node.desc
                        )
                      }
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group"
                    >
                      <node.icon
                        className={`h-4 w-4 ${node.color} group-hover:scale-110 transition-transform`}
                      />
                      <span className="font-medium">{node.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Models Submenu */}
              <div className="relative group/image">
                <button className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group-hover/image:bg-muted outline-hidden mt-0.5">
                  <span className="font-medium">Image Models</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="absolute left-full top-0 ml-1.5 w-48 bg-card/95 backdrop-blur-md border border-border shadow-2xl p-1.5 rounded-xl hidden group-hover/image:block animate-in fade-in zoom-in-95 duration-100">
                  {IMAGE_MODELS.map((node) => (
                    <button
                      key={node.model}
                      onClick={() =>
                        addNodeFromMenu(
                          node.type,
                          node.model,
                          node.label,
                          node.desc
                        )
                      }
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group"
                    >
                      <node.icon
                        className={`h-4 w-4 ${node.color} group-hover:scale-110 transition-transform`}
                      />
                      <span className="font-medium">{node.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* LLM Models Submenu */}
              <div className="relative group/llm">
                <button className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group-hover/llm:bg-muted outline-hidden mt-0.5">
                  <span className="font-medium">LLM Models</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="absolute left-full top-0 ml-1.5 w-48 bg-card/95 backdrop-blur-md border border-border shadow-2xl p-1.5 rounded-xl hidden group-hover/llm:block animate-in fade-in zoom-in-95 duration-100">
                  {LLM_MODELS.map((node) => (
                    <button
                      key={node.model}
                      onClick={() =>
                        addNodeFromMenu(
                          node.type,
                          node.model,
                          node.label,
                          node.desc
                        )
                      }
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group"
                    >
                      <node.icon
                        className={`h-4 w-4 ${node.color} group-hover:scale-110 transition-transform`}
                      />
                      <span className="font-medium">{node.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound Models Submenu */}
              <div className="relative group/sound">
                <button className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group-hover/sound:bg-muted outline-hidden mt-0.5">
                  <span className="font-medium">Sound Models</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="absolute left-full top-0 ml-1.5 w-48 bg-card/95 backdrop-blur-md border border-border shadow-2xl p-1.5 rounded-xl hidden group-hover/sound:block animate-in fade-in zoom-in-95 duration-100">
                  {SOUND_MODELS.map((node) => (
                    <button
                      key={node.model}
                      onClick={() =>
                        addNodeFromMenu(
                          node.type,
                          node.model,
                          node.label,
                          node.desc
                        )
                      }
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group"
                    >
                      <node.icon
                        className={`h-4 w-4 ${node.color} group-hover:scale-110 transition-transform`}
                      />
                      <span className="font-medium">{node.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px w-full bg-border/50 my-1"></div>

              {/* Tools Submenu */}
              <div className="relative group/tools">
                <button className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group-hover/tools:bg-muted outline-hidden mt-0.5">
                  <span className="font-medium">Tools</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="absolute left-full top-0 ml-1.5 w-48 bg-card/95 backdrop-blur-md border border-border shadow-2xl p-1.5 rounded-xl hidden group-hover/tools:block animate-in fade-in zoom-in-95 duration-100">
                  {TOOLS_NODES.map((node) => (
                    <button
                      key={node.model}
                      onClick={() =>
                        addNodeFromMenu(
                          node.type,
                          node.model,
                          node.label,
                          node.desc
                        )
                      }
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group"
                    >
                      {node.isNull && (
                        <div className="h-3 w-3 rounded-full border-2 border-dashed border-muted-foreground mx-0.5 group-hover:scale-110 transition-transform" />
                      )}
                      {!node.isNull && (
                        <node.icon
                          className={`h-4 w-4 ${node.color} group-hover:scale-110 transition-transform`}
                        />
                      )}
                      <span className={`font-bold ${node.color}`}>
                        {node.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NodeSystemDashboard() {
  return (
    <ReactFlowProvider>
      <NodeSystemFlow />
    </ReactFlowProvider>
  );
}

import React, { useCallback, useRef, useState, useEffect, type DragEvent } from 'react';
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
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Workflow, Play, Save, Settings2, Sparkles, Video, GripVertical, Plus, PlaySquare, Type, Wand2, Palette, Upload } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ModelNode } from './custom-nodes/ModelNode';
import { TriggerNode } from './custom-nodes/TriggerNode';
import { PromptNode } from './custom-nodes/PromptNode';
import { MediaNode } from './custom-nodes/MediaNode';
import { NullNode } from './custom-nodes/NullNode';
import { onPipelineActions, type PipelineAction } from '../../lib/pipeline-actions';

const nodeTypes = {
  modelNode: ModelNode,
  triggerNode: TriggerNode,
  promptNode: PromptNode,
  mediaNode: MediaNode,
  nullNode: NullNode,
};

let id = 0;
const getId = () => `node_${id++}`;

function NodeSystemFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [draggedNode, setDraggedNode] = useState<{ type: string; model: string; label: string; desc: string } | null>(null);
  const [menu, setMenu] = useState<{ clientX: number, clientY: number, top: number, left: number } | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onDragStart = (event: DragEvent, nodeType: string, model: string, label: string, desc: string) => {
    setDraggedNode({ type: nodeType, model, label, desc });
    event.dataTransfer.setData('text/plain', 'model_node');
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move';
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Accept both internal node drags AND external file drops
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
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
            position: { x: position.x + index * 30, y: position.y + index * 30 },
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
      data: { label: draggedNode.label, model: draggedNode.model, description: draggedNode.desc },
    };

    setNodes((nds) => nds.concat(newNode));
    setDraggedNode(null);
  }, [screenToFlowPosition, setNodes, draggedNode]);

  // Handle right-click on the canvas background
  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    if (!reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    
    setMenu({ 
      clientX: event.clientX, 
      clientY: event.clientY, 
      top: event.clientY - bounds.top, 
      left: event.clientX - bounds.left 
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setMenu(null);
  }, []);

  // Use the menu coordinates to add the node precisely where the user right clicked
  const addNodeFromMenu = useCallback((nodeType: string, model: string, label: string, desc: string) => {
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
  }, [menu, screenToFlowPosition, setNodes]);

  // Fallback for easy click-to-add functionality
  const onClickAdd = useCallback((nodeType: string, model: string, label: string, desc: string) => {
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
  }, [screenToFlowPosition, setNodes]);

  // === Pipeline Action Handler (Chat → Node Editor) ===
  useEffect(() => {
    const unsubscribe = onPipelineActions((actions: PipelineAction[]) => {
      let lastAddedId: string | null = null;
      const idMap: Record<string, string> = {}; // maps AI-suggested temp IDs to real IDs
      const colCounts: Record<string, number> = {}; // tracks Y positions for each X column

      for (const action of actions) {
        switch (action.type) {
          case 'add_node': {
            const newId = getId();
            const type = action.nodeType || 'modelNode';
            
            // Smart auto-layout based on node type
            let xPos = 100;
            if (type === 'triggerNode' || type === 'nullNode' || type === 'mediaNode') xPos = 100;
            else if (type === 'promptNode') xPos = 500;
            else if (type === 'modelNode') xPos = 900;
            
            const colKey = String(xPos);
            colCounts[colKey] = (colCounts[colKey] || 0) + 1;
            const yPos = 100 + (colCounts[colKey] - 1) * 220; // 220px vertical spacing

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
            setNodes((nds) => nds.concat(newNode));
            // Track for connections
            if (action.nodeId) idMap[action.nodeId] = newId;
            lastAddedId = newId;
            break;
          }
          case 'connect_nodes': {
            if (action.sourceId && action.targetId) {
              const realSource = idMap[action.sourceId] || action.sourceId;
              const realTarget = idMap[action.targetId] || action.targetId;
              setEdges((eds) => addEdge({
                id: `e_${realSource}_${realTarget}`,
                source: realSource,
                target: realTarget,
              }, eds));
            }
            break;
          }
          case 'set_prompt': {
            const realId = action.nodeId ? (idMap[action.nodeId] || action.nodeId) : lastAddedId;
            if (realId && action.prompt) {
              setNodes((nds) => nds.map(n => 
                n.id === realId ? { ...n, data: { ...n.data, prompt: action.prompt } } : n
              ));
            }
            break;
          }
          case 'remove_node': {
            const realId = action.nodeId ? (idMap[action.nodeId] || action.nodeId) : null;
            if (realId) {
              setNodes((nds) => nds.filter(n => n.id !== realId));
              setEdges((eds) => eds.filter(e => e.source !== realId && e.target !== realId));
            }
            break;
          }
          case 'clear_canvas': {
            setNodes([]);
            setEdges([]);
            break;
          }
          case 'execute_pipeline': {
            // Find any trigger node and simulate clicking it
            // (The trigger node handles execution internally)
            console.log('[Pipeline] AI requested pipeline execution');
            break;
          }
        }
      }
    });
    return unsubscribe;
  }, [setNodes, setEdges]);

  return (
    <div className="flex flex-col h-full w-full bg-background relative overflow-hidden text-foreground border-l">
      {/* Top Toolbar */}
      <div className="h-14 border-b bg-card/50 flex items-center justify-between px-4 shrink-0 z-10 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-sm">Pipeline Editor</h2>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Save className="h-3.5 w-3.5" />
            Save Graph
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            Properties
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
            <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
            Execute Pipeline
          </Button>
        </div>
      </div>

      <div className="flex flex-1 w-full h-full min-h-0 relative">
        {/* Sidebar / Node Palette */}
        <div className="w-64 border-r bg-card/50 flex flex-col p-4 shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Nodes</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Click nodes to add or drag"><Plus className="w-3 h-3" /></Button>
          </div>
          
          <div className="space-y-3">
            {/* Kling Node Item */}
            <div 
              className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-primary/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
              draggable={true}
              onDragStart={(e) => onDragStart(e, 'modelNode', 'kling', 'Kling 3.0', 'High-fidelity cinematic video generation')}
              onClick={() => onClickAdd('modelNode', 'kling', 'Kling 3.0', 'High-fidelity cinematic video generation')}
            >
              <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
              <div className="pointer-events-none">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Kling 3.0
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-snug">Drag or click to add</div>
              </div>
            </div>

            {/* Nano Banana Node Item */}
            <div 
              className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-amber-500/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
              draggable={true}
              onDragStart={(e) => onDragStart(e, 'modelNode', 'nanobanana', 'Nano Banana 2', 'Fast experimental model for stylized motion')}
              onClick={() => onClickAdd('modelNode', 'nanobanana', 'Nano Banana 2', 'Fast experimental model for stylized motion')}
            >
              <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
              <div className="pointer-events-none">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-amber-500" /> Nano Banana 2
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-snug">Drag or click to add</div>
              </div>
            </div>

            {/* SeedDance 2 Node Item */}
            <div 
              className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-emerald-500/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
              draggable={true}
              onDragStart={(e) => onDragStart(e, 'modelNode', 'seeddance', 'SeedDance 2', 'Dance & motion-driven video generation')}
              onClick={() => onClickAdd('modelNode', 'seeddance', 'SeedDance 2', 'Dance & motion-driven video generation')}
            >
              <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
              <div className="pointer-events-none">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-emerald-500" /> SeedDance 2
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-snug">Drag or click to add</div>
              </div>
            </div>

            {/* SeedDream 5 Node Item */}
            <div 
              className="p-3 border rounded-lg bg-background shadow-sm flex items-start gap-3 cursor-grab hover:border-rose-500/50 transition-colors active:cursor-grabbing hover:bg-muted/30 [&>*]:pointer-events-none"
              draggable={true}
              onDragStart={(e) => onDragStart(e, 'modelNode', 'seeddream', 'SeedDream 5', 'High-quality image generation & editing')}
              onClick={() => onClickAdd('modelNode', 'seeddream', 'SeedDream 5', 'High-quality image generation & editing')}
            >
              <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
              <div className="pointer-events-none">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-rose-500" /> SeedDream 5
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-snug">Drag or click to add</div>
              </div>
            </div>

            {/* Trigger Node Item */}
            <div 
              className="p-3 border rounded-lg bg-indigo-500/10 border-indigo-500/30 shadow-sm flex items-start gap-3 cursor-grab hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-colors active:cursor-grabbing [&>*]:pointer-events-none mt-4"
              draggable={true}
              onDragStart={(e) => onDragStart(e, 'triggerNode', 'trigger', 'Start Pipeline', 'Pushes execution down the chain.')}
              onClick={() => onClickAdd('triggerNode', 'trigger', 'Start Pipeline', 'Pushes execution down the chain.')}
            >
              <GripVertical className="w-4 h-4 mt-0.5 text-indigo-500 opacity-50 shrink-0 pointer-events-none" />
              <div className="pointer-events-none">
                <div className="font-bold text-sm flex items-center gap-1.5 text-indigo-500">
                  <PlaySquare className="w-3.5 h-3.5" /> Start Trigger
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">Connect to pipeline start</div>
              </div>
            </div>

            {/* Prompt Node Item */}
            <div 
              className="p-3 border rounded-lg bg-violet-500/10 border-violet-500/30 shadow-sm flex items-start gap-3 cursor-grab hover:bg-violet-500/20 hover:border-violet-500/50 transition-colors active:cursor-grabbing [&>*]:pointer-events-none"
              draggable={true}
              onDragStart={(e) => onDragStart(e, 'promptNode', 'prompt', 'Prompt', 'Text prompt input for generation')}
              onClick={() => onClickAdd('promptNode', 'prompt', 'Prompt', 'Text prompt input for generation')}
            >
              <GripVertical className="w-4 h-4 mt-0.5 text-violet-400 opacity-50 shrink-0 pointer-events-none" />
              <div className="pointer-events-none">
                <div className="font-bold text-sm flex items-center gap-1.5 text-violet-400">
                  <Type className="w-3.5 h-3.5" /> Prompt
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">Text input for models</div>
              </div>
            </div>

            {/* Null Node Item */}
            <div 
              className="p-3 border rounded-lg bg-muted/10 border-muted/30 shadow-sm flex items-start gap-3 cursor-grab hover:bg-muted/20 hover:border-muted-foreground/50 transition-colors active:cursor-grabbing [&>*]:pointer-events-none"
              draggable={true}
              onDragStart={(e) => onDragStart(e, 'nullNode', 'null', 'Null', 'Pass-through proxy node')}
              onClick={() => onClickAdd('nullNode', 'null', 'Null', 'Pass-through proxy node')}
            >
              <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground opacity-50 shrink-0 pointer-events-none" />
              <div className="pointer-events-none">
                <div className="font-bold text-sm flex items-center gap-1.5 text-muted-foreground">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-dashed border-muted-foreground" /> Null Node
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">Pass-through routing element</div>
              </div>
            </div>

            {/* Media Drop Zone Hint */}
            <div className="mt-4 pt-4 border-t border-border/50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Media</h3>
              <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-muted-foreground/30 rounded-lg bg-muted/20 text-muted-foreground/50 gap-2 hover:border-cyan-500/50 hover:text-cyan-400/80 hover:bg-cyan-500/5 transition-all">
                <Upload className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Drag files onto canvas</span>
                <span className="text-[9px] opacity-60">Images • Videos • Audio</span>
              </div>
            </div>
          </div>
        </div>

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
            fitView
            className="bg-muted/10 w-full h-full"
          >
            <Controls className="bg-card border-border shadow-md rounded-md overflow-hidden fill-foreground m-4" />
            <MiniMap 
              className="bg-card border border-border shadow-md rounded-md m-4" 
              nodeColor="hsl(var(--primary))" 
              maskColor="hsl(var(--background) / 0.7)" 
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--muted-foreground) / 0.2)" />
          </ReactFlow>

          {/* Custom Context Menu */}
          {menu && (
            <div 
              className="absolute z-50 w-52 bg-card/95 backdrop-blur-md border border-border shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150 rounded-xl"
              style={{ top: menu.top, left: menu.left }}
            >
               <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-80 mb-1 border-b border-border/50">Add Action Node</div>
               <button 
                 onClick={() => addNodeFromMenu('modelNode', 'kling', 'Kling 3.0', 'High-fidelity cinematic video generation')}
                 className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group"
               >
                 <Sparkles className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" /> 
                 <span className="font-medium">Kling 3.0</span>
               </button>
               <button 
                 onClick={() => addNodeFromMenu('modelNode', 'nanobanana', 'Nano Banana 2', 'Fast experimental model for stylized motion')}
                 className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group mt-0.5"
               >
                 <Video className="h-4 w-4 text-amber-500 group-hover:scale-110 transition-transform" /> 
                 <span className="font-medium">Nano Banana 2</span>
               </button>
               <button 
                 onClick={() => addNodeFromMenu('modelNode', 'seeddance', 'SeedDance 2', 'Dance & motion-driven video generation')}
                 className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group mt-0.5"
               >
                 <Wand2 className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" /> 
                 <span className="font-medium">SeedDance 2</span>
               </button>
               <button 
                 onClick={() => addNodeFromMenu('modelNode', 'seeddream', 'SeedDream 5', 'High-quality image generation & editing')}
                 className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group mt-0.5"
               >
                 <Palette className="h-4 w-4 text-rose-500 group-hover:scale-110 transition-transform" /> 
                 <span className="font-medium">SeedDream 5</span>
               </button>
               <div className="h-px w-full bg-border/50 my-1"></div>
               <button 
                 onClick={() => addNodeFromMenu('triggerNode', 'trigger', 'Start Pipeline', 'Pushes execution down the chain.')}
                 className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-indigo-500/20 text-indigo-500 rounded-md transition-colors text-left group mt-0.5"
               >
                 <PlaySquare className="h-4 w-4 text-indigo-500 group-hover:scale-110 transition-transform" /> 
                 <span className="font-bold">Start Trigger Node</span>
               </button>
               <button 
                 onClick={() => addNodeFromMenu('promptNode', 'prompt', 'Prompt', 'Text prompt input for generation')}
                 className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-violet-500/20 text-violet-400 rounded-md transition-colors text-left group mt-0.5"
               >
                 <Type className="h-4 w-4 text-violet-400 group-hover:scale-110 transition-transform" /> 
                 <span className="font-bold">Prompt Node</span>
               </button>
               <button 
                 onClick={() => addNodeFromMenu('nullNode', 'null', 'Null', 'Pass-through proxy node')}
                 className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted text-muted-foreground rounded-md transition-colors text-left group mt-0.5"
               >
                 <div className="h-3 w-3 rounded-full border-2 border-dashed border-muted-foreground mx-0.5 group-hover:scale-110 transition-transform" /> 
                 <span className="font-bold">Null Node</span>
               </button>
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

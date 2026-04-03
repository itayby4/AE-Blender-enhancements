// Pipeline command types that the AI can send to control the node editor
export interface PipelineAction {
  type: 'add_node' | 'remove_node' | 'connect_nodes' | 'set_prompt' | 'execute_pipeline' | 'clear_canvas';
  // add_node
  nodeType?: 'modelNode' | 'promptNode' | 'triggerNode';
  model?: string;
  label?: string;
  prompt?: string;
  // remove_node
  nodeId?: string;
  // connect_nodes
  sourceId?: string;
  targetId?: string;
  // set_prompt
  // nodeId + prompt
}

// Event bus for pipeline commands from chat → node editor
type PipelineListener = (actions: PipelineAction[]) => void;

let listener: PipelineListener | null = null;

export function onPipelineActions(callback: PipelineListener) {
  listener = callback;
  return () => { listener = null; };
}

export function dispatchPipelineActions(actions: PipelineAction[]) {
  if (listener) {
    listener(actions);
  }
}

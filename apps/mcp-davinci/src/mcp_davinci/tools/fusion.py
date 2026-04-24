from ..resolve_connector import NoProjectError, NoTimelineError, ResolveNotRunningError
import traceback

def get_fusion_comp(connector):
    """Helper to safely get the current Fusion composition."""
    try:
        resolve = connector.get_resolve()
    except Exception as exc:
        raise ResolveNotRunningError(str(exc))
        
    fusion = resolve.Fusion()
    if not fusion:
        raise RuntimeError("Could not connect to Fusion instance.")
        
    comp = fusion.GetCurrentComp()
    if not comp:
        raise RuntimeError(
            "No active Fusion composition found. "
            "Please ensure you are on the Fusion page or have a clip with a Fusion comp open."
        )
    return comp

def register(mcp, connector):
    @mcp.tool()
    def get_fusion_composition_status() -> str:
        """Get a list of all nodes currently in the active Fusion composition.
        Useful to understand what nodes exist before connecting or modifying them.
        """
        try:
            comp = get_fusion_comp(connector)
        except Exception as exc:
            return str(exc)
            
        tools = comp.GetToolList()
        if not tools:
            return "No nodes found in the current composition."
            
        result = []
        for index, tool in tools.items():
            result.append(f"- {tool.Name} (Type: {tool.ID})")
            
        name = comp.GetName() or "Unnamed Comp"
        return f"Active Fusion Comp: '{name}'\\nNodes:\\n" + "\\n".join(result)

    @mcp.tool()
    def add_fusion_node(tool_type: str) -> str:
        """Add a new Fusion node (tool) to the active composition.
        
        Args:
            tool_type: The required internal tool ID (e.g., 'Merge', 'Transform', 'TextPlus', 'MediaIn').
        """
        try:
            comp = get_fusion_comp(connector)
        except Exception as exc:
            return str(exc)
            
        # AddTool(tool_type, x, y)
        new_node = comp.AddTool(tool_type, -32768, -32768)
        if not new_node:
            return f"Failed to add node. '{tool_type}' may not be a valid Fusion tool type ID."
            
        return f"Successfully added node '{new_node.Name}' of type {tool_type}."

    @mcp.tool()
    def connect_fusion_nodes(source_name: str, target_name: str, target_input: str) -> str:
        """Connect the output of one Fusion node to a specific input of another node.
        
        Args:
            source_name: Name of the node providing the output (e.g., 'Text1').
            target_name: Name of the node receiving the connection (e.g., 'Merge1').
            target_input: The input name on the target (e.g., 'Background', 'Foreground', 'Input').
        """
        try:
            comp = get_fusion_comp(connector)
        except Exception as exc:
            return str(exc)
            
        source_tool = comp.FindTool(source_name)
        if not source_tool:
            return f"Error: Source node '{source_name}' not found."
            
        target_tool = comp.FindTool(target_name)
        if not target_tool:
            return f"Error: Target node '{target_name}' not found."
            
        # Optional: Can connect directly by passing the tool
        success = target_tool.ConnectInput(target_input, source_tool)
        if not success:
            return f"Failed to connect {source_name} to {target_name}. {target_input} might not be a valid input name."
            
        return f"Successfully connected '{source_name}' to '{target_name}' at '{target_input}'."

    @mcp.tool()
    def set_fusion_node_property(node_name: str, property_name: str, value: str) -> str:
        """Set a property on a Fusion node.
        
        Args:
            node_name: Name of the node (e.g., 'Text1').
            property_name: Name of the property (e.g., 'Size', 'Center', 'StyledText').
            value: The value to set (parsed automatically; numbers are converted).
        """
        try:
            comp = get_fusion_comp(connector)
        except Exception as exc:
            return str(exc)
            
        tool = comp.FindTool(node_name)
        if not tool:
            return f"Error: Node '{node_name}' not found."
            
        # Try to cast value appropriately
        try:
            parsed_val = float(value)
            if float.is_integer(parsed_val) and "." not in value:
                parsed_val = int(parsed_val)
        except ValueError:
            parsed_val = value # Keep as string
            
        tool.SetInput(property_name, parsed_val)
        return f"Successfully set property '{property_name}' of '{node_name}' to {parsed_val}."

    @mcp.tool()
    def execute_fusion_script(script: str) -> str:
        """Execute Python code within DaVinci Resolve's Fusion page to perform complex automated tasks.
        
        The code is executed with the following global variables accessible:
        - `resolve`: The DaVinci Resolve instance object.
        - `comp`: The currently active Fusion composition object.
        
        Use the `log(message)` function inside your script to print messages, which will be collected
        and returned as the tool's result. Do not use print().
        
        Example usage:
            log(comp.GetName())
            text_node = comp.AddTool("TextPlus", -32768, -32768)
            text_node.SetInput("StyledText", "Generated text!")
            log("Added a TextPlus node!")
        """
        try:
            comp = get_fusion_comp(connector)
            resolve = connector.get_resolve()
        except Exception as exc:
            return str(exc)
            
        execution_logs = []
        def log_func(message):
            execution_logs.append(str(message))
            
        environment = {
            "resolve": resolve,
            "comp": comp,
            "log": log_func,
            "__builtins__": __builtins__
        }
        
        try:
            exec(script, environment)
            logs = "\n".join(execution_logs)
            return f"Script executed successfully.\nLogs:\n{logs}" if logs else "Script executed successfully (no logs)."
        except Exception as exc:
             tb = traceback.format_exc()
             return f"Script failed with error: {str(exc)}\nTraceback:\n{tb}\nLogs before error:\n" + "\n".join(execution_logs)

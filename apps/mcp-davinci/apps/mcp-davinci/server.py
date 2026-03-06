import sys
import os
import json
from mcp.server.fastmcp import FastMCP

# Initialize the MCP Server
mcp = FastMCP("davinci_resolve")

# ==============================================================================
# Helper to connect to DaVinci Resolve
# Note: For external scripting to work, standard DaVinci Resolve Studio must be running 
# and External Scripting must be set to "Local" in Preferences -> System -> General.
# ==============================================================================
def get_resolve():
    try:
        # Resolve provides a standard utility to get the active instance
        # In Python 3.12+, imp is removed. loading a .dll / .so directly dynamically is tricky.
        # We can use importlib.machinery.ExtensionFileLoader for compiled extensions
        import importlib.machinery
        import importlib.util

        ext = ".dll" if sys.platform.startswith("win") else ".so"
        
        # Default typical paths for the Resolve scripting API 
        expected_path = os.getenv("RESOLVE_SCRIPT_API", None) 
        if not expected_path:
            if sys.platform.startswith("win"):
                expected_path = r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll"
            elif sys.platform.startswith("darwin"):
                expected_path = "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
            else:
                expected_path = "/opt/resolve/libs/Fusion/fusionscript.so"
        
        if not os.path.exists(expected_path):
            return None, f"Could not find fusionscript API at {expected_path}"
            
        loader = importlib.machinery.ExtensionFileLoader("fusionscript", expected_path)
        spec = importlib.util.spec_from_loader(loader.name, loader)
        bmd = importlib.util.module_from_spec(spec)
        loader.exec_module(bmd)
        
        resolve = bmd.scriptapp("Resolve")
        
        if not resolve:
            return None, "DaVinci Resolve found but not responding. Make sure it's open."
            
        return resolve, None
    except Exception as e:
        return None, str(e)


# ==============================================================================
# MCP Tools
# ==============================================================================

@mcp.tool()
def get_project_info() -> str:
    """Get information about the currently open DaVinci Resolve project and timeline."""
    resolve, err = get_resolve()
    if not resolve:
        return f"Error connecting to DaVinci Resolve: {err}"
        
    project_manager = resolve.GetProjectManager()
    project = project_manager.GetCurrentProject()
    
    if not project:
        return "No project is currently open in DaVinci Resolve."
        
    timeline = project.GetCurrentTimeline()
    timeline_name = timeline.GetName() if timeline else "No active timeline"
    
    info = {
        "project_name": project.GetName(),
        "framerate": project.GetSetting("timelineFrameRate"),
        "resolution": f"{project.GetSetting('timelineResolutionWidth')}x{project.GetSetting('timelineResolutionHeight')}",
        "active_timeline": timeline_name
    }
    
    return json.dumps(info, indent=2)

@mcp.tool()
def add_timeline_marker(frameId: int, color: str, name: str, note: str, duration: int = 1) -> str:
    """
    Add a marker to the current timeline.
    
    Args:
        frameId: The frame number where the marker should be placed.
        color: The color of the marker (e.g., 'Blue', 'Cyan', 'Green', 'Yellow', 'Red', 'Pink', 'Purple', 'Fuchsia', 'Rose', 'Lavender', 'Sky', 'Mint', 'Lemon', 'Sand', 'Cocoa', 'Cream').
        name: Name of the marker.
        note: Note attached to the marker.
        duration: Duration of the marker in frames (default 1).
    """
    resolve, err = get_resolve()
    if not resolve:
        return f"Error connecting to DaVinci Resolve: {err}"
        
    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        return "No active project."
        
    timeline = project.GetCurrentTimeline()
    if not timeline:
        return "No active timeline."
        
    # Attempt to add marker
    success = timeline.AddMarker(frameId, color, name, note, duration)
    
    if success:
        return f"Successfully added {color} marker '{name}' at frame {frameId}."
    else:
        # Check if color is valid
        valid_colors = ['Blue', 'Cyan', 'Green', 'Yellow', 'Red', 'Pink', 'Purple', 'Fuchsia', 'Rose', 'Lavender', 'Sky', 'Mint', 'Lemon', 'Sand', 'Cocoa', 'Cream']
        if color not in valid_colors:
            return f"Failed to add marker. Color '{color}' might be invalid. Valid colors are: {', '.join(valid_colors)}"
        return "Failed to add marker. Make sure the frame ID is within the timeline bounds."

@mcp.tool()
def execute_macro(macro_id: str) -> str:
    """
    Simulates executing a PipeFX macro. 
    In the future this will trigger actual Resolve API calls based on the macro definition.
    
    Args:
        macro_id: The ID of the macro to execute (e.g. 'cut', 'grade_1', 'add_text').
    """
    resolve, err = get_resolve()
    if not resolve:
        return f"Error connecting to DaVinci Resolve: {err}"
        
    # Here we would map macro IDs to actual DaVinci Resolve Python API calls
    # For this prototype, we just return a success message
    return f"Successfully executed macro: {macro_id} in DaVinci Resolve."


if __name__ == "__main__":
    # Start the FastMCP server with standard stdio transport
    print("Starting DaVinci Resolve MCP Server...", file=sys.stderr)
    mcp.run()

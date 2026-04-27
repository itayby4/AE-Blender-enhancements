from .scene import register as register_scene
from .objects import register as register_objects
from .render import register as register_render
from .scripting import register as register_scripting


def register_tools(mcp, connector):
    """Register all Blender tool modules with the MCP server."""
    register_scene(mcp, connector)
    register_objects(mcp, connector)
    register_render(mcp, connector)
    register_scripting(mcp, connector)

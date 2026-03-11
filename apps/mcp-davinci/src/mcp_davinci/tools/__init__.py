from .project import register as register_project
from .markers import register as register_markers
from .macros import register as register_macros


def register_tools(mcp, connector):
    """Register all tool modules with the MCP server."""
    register_project(mcp, connector)
    register_markers(mcp, connector)
    register_macros(mcp, connector)

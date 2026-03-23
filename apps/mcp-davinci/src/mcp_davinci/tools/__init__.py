from .project import register as register_project
from .markers import register as register_markers
from .macros import register as register_macros
from .transcript import register as register_transcript
from .editing import register as register_editing
from .subtitles import register as register_subtitles
from .audio import register as register_audio
from .xml_export import register as register_xml_export


def register_tools(mcp, connector):
    """Register all tool modules with the MCP server."""
    register_project(mcp, connector)
    register_markers(mcp, connector)
    register_macros(mcp, connector)
    register_transcript(mcp, connector)
    register_editing(mcp, connector)
    register_subtitles(mcp, connector)
    register_audio(mcp, connector)
    register_xml_export(mcp, connector)

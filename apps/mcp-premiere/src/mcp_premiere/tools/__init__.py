def register_tools(mcp, connector):
    """Register all Premiere Pro tools."""
    from . import project
    from . import cutting
    from . import understanding
    from . import xml_tools
    from . import audio
    from . import transcript
    from . import subtitles

    project.register(mcp, connector)
    cutting.register(mcp, connector)
    understanding.register(mcp, connector)
    xml_tools.register(mcp, connector)
    audio.register(mcp, connector)
    transcript.register(mcp, connector)
    subtitles.register(mcp, connector)

def register_tools(mcp, connector):
    """Register all Premiere Pro tools."""
    from . import project
    from . import cutting
    from . import understanding

    project.register(mcp, connector)
    cutting.register(mcp, connector)
    understanding.register(mcp, connector)

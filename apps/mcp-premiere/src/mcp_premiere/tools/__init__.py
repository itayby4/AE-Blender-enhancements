def register_tools(mcp, connector):
    """Register all Premiere Pro tools."""
    from . import project
    from . import cutting
    from . import understanding
    from . import xml_tools

    project.register(mcp, connector)
    cutting.register(mcp, connector)
    understanding.register(mcp, connector)
    xml_tools.register(mcp, connector)

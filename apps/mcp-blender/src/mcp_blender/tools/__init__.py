def register_tools(mcp, connector):
    @mcp.tool()
    def ping() -> str:
        """Ping the Blender connector."""
        if connector.check_connection():
            return "Pong from Blender!"
        return "Failed to connect to Blender"

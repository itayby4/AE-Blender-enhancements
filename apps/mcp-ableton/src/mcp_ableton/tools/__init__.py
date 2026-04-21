def register_tools(mcp, connector):
    @mcp.tool()
    def ping() -> str:
        """Ping the Ableton Live connector."""
        if connector.check_connection():
            return "Pong from Ableton Live!"
        return "Failed to connect to Ableton Live"

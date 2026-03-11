def register(mcp, connector):
    @mcp.tool()
    def execute_macro(macro_id: str) -> str:
        """Execute a PipeFX macro in DaVinci Resolve.

        In the future this will trigger actual Resolve API calls
        based on the macro definition.

        Args:
            macro_id: The ID of the macro to execute (e.g. 'cut', 'grade_1', 'add_text').
        """
        connector.get_resolve()
        return f"Successfully executed macro: {macro_id} in DaVinci Resolve."

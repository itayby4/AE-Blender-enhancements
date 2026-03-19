from ..resolve_connector import ResolveNotRunningError


def register(mcp, connector):
    @mcp.tool()
    def execute_macro(macro_id: str) -> str:
        """Execute a PipeFX macro in DaVinci Resolve.

        In the future this will trigger actual Resolve API calls
        based on the macro definition.

        Args:
            macro_id: The ID of the macro to execute (e.g. 'cut', 'grade_1', 'add_text').
        """
        try:
            connector.get_resolve()
        except ResolveNotRunningError as exc:
            return str(exc)
        return f"Successfully executed macro: {macro_id} in DaVinci Resolve."

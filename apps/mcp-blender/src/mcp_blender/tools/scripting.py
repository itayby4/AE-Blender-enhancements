from ..blender_connector import BlenderExecutionError, BlenderNotRunningError


def register(mcp, connector):
    @mcp.tool()
    def ping_blender() -> str:
        """Check that the PipeFX Bridge addon is reachable inside Blender."""
        try:
            info = connector.ping()
            return f"OK — Blender {info.get('blender', '?')}"
        except BlenderNotRunningError as exc:
            return str(exc)

    @mcp.tool()
    def execute_python(code: str) -> str:
        """Execute arbitrary Python code in Blender's main thread.

        The 'bpy' and 'json' modules are pre-imported. Set ``__result__`` to
        a JSON string to return data — anything else returns "(no result)".

        Example:
            code = "import json; __result__ = json.dumps([o.name for o in bpy.data.objects])"

        Use this only when no dedicated tool exists. Code runs with full
        access to the user's Blender session.
        """
        try:
            result = connector.execute(code)
            if result is None:
                return "(no result)"
            return result if isinstance(result, str) else str(result)
        except BlenderNotRunningError as exc:
            return str(exc)
        except BlenderExecutionError as exc:
            return f"Blender error: {exc}"

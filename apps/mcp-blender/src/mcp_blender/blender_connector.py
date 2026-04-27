import json
import urllib.error
import urllib.request

from .constants import BLENDER_BRIDGE_HOST, BLENDER_BRIDGE_PORT, BLENDER_BRIDGE_TIMEOUT


class BlenderNotRunningError(RuntimeError):
    """Blender is not reachable — addon not loaded or wrong port."""


class BlenderExecutionError(RuntimeError):
    """Code executed in Blender raised an exception."""


class BlenderConnector:
    """HTTP client that talks to the PipeFX Bridge addon running inside Blender.

    The addon listens on localhost:PIPEFX_BRIDGE_PORT (default 9876) and
    executes Python code on Blender's main thread, returning JSON results.
    """

    def __init__(
        self,
        host: str = BLENDER_BRIDGE_HOST,
        port: int = BLENDER_BRIDGE_PORT,
        timeout: float = BLENDER_BRIDGE_TIMEOUT,
    ):
        self._base = f"http://{host}:{port}"
        self._timeout = timeout

    # ------------------------------------------------------------------
    # Low-level transport
    # ------------------------------------------------------------------

    def _post(self, path: str, payload: dict) -> dict:
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"{self._base}{path}",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.URLError as exc:
            raise BlenderNotRunningError(
                f"Cannot reach PipeFX Bridge at {self._base}. "
                "Make sure Blender is open and the PipeFX Bridge addon is enabled "
                "(Edit > Preferences > Add-ons > PipeFX Bridge)."
            ) from exc

    def ping(self) -> dict:
        """Returns {ok: true, blender: '<version>'} if the bridge is up."""
        try:
            req = urllib.request.Request(f"{self._base}/ping")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read())
        except urllib.error.URLError as exc:
            raise BlenderNotRunningError(
                f"Cannot reach PipeFX Bridge at {self._base}."
            ) from exc

    # ------------------------------------------------------------------
    # Primary interface used by tool modules
    # ------------------------------------------------------------------

    def execute(self, code: str):
        """Execute Python code in Blender's main thread.

        The code may set ``__result__`` to any JSON-serialisable value.
        Returns that value (already parsed), or None.

        Raises BlenderNotRunningError if the bridge is unreachable.
        Raises BlenderExecutionError if the code raised an exception inside Blender.
        """
        result = self._post("/execute", {"code": code})
        if result.get("error"):
            raise BlenderExecutionError(result["error"])
        return result.get("result")

    def eval_expr(self, expr: str):
        """Evaluate a single Python expression and return the JSON-decoded result.

        Convenience wrapper — the expression must be JSON-serialisable.
        Example: connector.eval_expr("bpy.context.scene.name")
        """
        code = f"import json as _j; __result__ = _j.dumps({expr})"
        raw = self.execute(code)
        if raw is None:
            return None
        return json.loads(raw)

    def check_connection(self) -> bool:
        try:
            self.ping()
            return True
        except BlenderNotRunningError:
            return False

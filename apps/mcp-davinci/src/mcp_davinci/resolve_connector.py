import importlib.machinery
import importlib.util
import os
import time

from .constants import get_fusionscript_path


class ResolveNotRunningError(RuntimeError):
    pass


class NoProjectError(RuntimeError):
    pass


class NoTimelineError(RuntimeError):
    pass


class ResolveConnector:
    """Manages a connection to DaVinci Resolve with caching.

    Caching strategy:
      - fusionscript native module: cached permanently (never changes at runtime)
      - resolve instance: cached with TTL (user might restart Resolve)
      - project / timeline: NEVER cached (user switches these constantly)
    """

    def __init__(self, ttl_seconds: float = 5.0):
        self._module = None
        self._resolve = None
        self._resolve_time: float = 0
        self._ttl = ttl_seconds

    def _load_module(self):
        """Load the fusionscript native module once for the process lifetime."""
        if self._module is not None:
            return self._module

        lib_path = get_fusionscript_path()
        if not os.path.exists(lib_path):
            raise FileNotFoundError(
                f"Could not find fusionscript at {lib_path}. "
                "Set RESOLVE_SCRIPT_LIB to override."
            )

        loader = importlib.machinery.ExtensionFileLoader("fusionscript", lib_path)
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        self._module = module
        return self._module

    def get_resolve(self):
        """Get the Resolve scripting instance, cached with TTL."""
        now = time.monotonic()
        if self._resolve and (now - self._resolve_time) < self._ttl:
            return self._resolve

        try:
            bmd = self._load_module()
        except FileNotFoundError as exc:
            raise ResolveNotRunningError(str(exc)) from exc

        self._resolve = bmd.scriptapp("Resolve")
        self._resolve_time = now

        if not self._resolve:
            raise ResolveNotRunningError(
                "DaVinci Resolve is not responding. "
                "Ensure it is running and External Scripting is set to 'Local' "
                "in Preferences > System > General."
            )
        return self._resolve

    def get_project(self):
        """Get the current project (always fetched fresh)."""
        resolve = self.get_resolve()
        project = resolve.GetProjectManager().GetCurrentProject()
        if not project:
            raise NoProjectError("No project is currently open in DaVinci Resolve.")
        return project

    def get_timeline(self):
        """Get the current timeline (always fetched fresh)."""
        project = self.get_project()
        timeline = project.GetCurrentTimeline()
        if not timeline:
            raise NoTimelineError("No active timeline in the current project.")
        return timeline

import pymiere

class PremiereNotRunningError(RuntimeError):
    pass

class NoProjectError(RuntimeError):
    pass

class PremiereConnector:
    """Manages a connection to Adobe Premiere Pro with proper error handling.
    
    Note: pymiere establishes a live link to the ExtendScript CEP engine.
    Caching the application object is done locally, but calls pass through.
    """
    def __init__(self):
        self._app = None

    def get_app(self):
        """Get the Premiere application object, verifying the connection."""
        if not self._app:
            try:
                self._app = pymiere.objects.app
            except Exception as e:
                raise PremiereNotRunningError(f"Failed to connect to Premiere: {str(e)}")

        # Verify the application connection is alive by checking if a document is open
        try:
            if not self._app.isDocumentOpen():
                raise NoProjectError("No project is currently open in Adobe Premiere Pro.")
            return self._app
        except Exception as e:
            if isinstance(e, NoProjectError):
                raise
            # If the app object throws randomly, it might be stale.
            raise PremiereNotRunningError("Adobe Premiere connection lost. Is it running?")

    def get_project(self):
        """Get the currently open project."""
        app = self.get_app()
        project = app.project
        if not project:
            raise NoProjectError("Adobe Premiere is open, but no active project found.")
        return project

    def get_active_sequence(self):
        """Get the active timeline (sequence)."""
        project = self.get_project()
        sequence = project.activeSequence
        if not sequence:
            raise NoProjectError(f"Project '{project.name}' is open, but no timeline (sequence) is active.")
        return sequence

    def eval_qe(self, script: str):
        """Convenience method to execute QE DOM ExtendScript directly."""
        # QE DOM evaluations don't require the standard app wrapper necessarily,
        # but we ensure the app is running first.
        self.get_app()
        return pymiere.core.eval_script(script)

"""
Standalone resolve_export_xml and resolve_import_xml MCP tools for the AutoPod pipeline.
These are separate from xml_export.py (which has the combined split_timeline_from_srt_via_xml tool).
"""
import json
import os
import tempfile

from ..resolve_connector import NoProjectError, NoTimelineError, ResolveNotRunningError


def register(mcp, connector):
    @mcp.tool()
    def resolve_export_xml(export_path: str) -> str:
        """
        Exports the currently active DaVinci Resolve timeline as FCPXML 1.8.
        Returns JSON with success status and the file path.
        """
        try:
            resolve = connector.get_resolve()
            project = connector.get_project()
            timeline = connector.get_timeline()
        except (NoProjectError, NoTimelineError, ResolveNotRunningError) as exc:
            return json.dumps({"error": str(exc)})

        try:
            abs_path = os.path.abspath(export_path)

            # Export as FCPXML 1.8. The enum value is typically 6.
            # Try the attribute first, fall back to magic number.
            export_type = getattr(resolve, 'EXPORT_FCPXML_1_8', 6)
            export_subtype = getattr(resolve, 'EXPORT_NONE', 0)

            success = timeline.Export(abs_path, export_type, export_subtype)
            if not success:
                # Fallback to raw magic number
                success = timeline.Export(abs_path, 6, 0)
                if not success:
                    return json.dumps({"error": "Failed to export timeline to FCPXML."})

            timeline_name = timeline.GetName()
            return json.dumps({
                "success": True,
                "path": abs_path,
                "message": f"Exported '{timeline_name}' to {abs_path}"
            })

        except Exception as e:
            return json.dumps({"error": f"Error during FCPXML export: {str(e)}"})

    @mcp.tool()
    def resolve_import_xml(import_path: str) -> str:
        """
        Imports an FCPXML file into DaVinci Resolve as a new timeline in the Media Pool.
        """
        try:
            resolve = connector.get_resolve()
            project = connector.get_project()
            media_pool = project.GetMediaPool()
        except (NoProjectError, ResolveNotRunningError) as exc:
            return json.dumps({"error": str(exc)})

        try:
            abs_path = os.path.abspath(import_path)
            if not os.path.exists(abs_path):
                return json.dumps({"error": f"File does not exist: {abs_path}"})

            file_size = os.path.getsize(abs_path)
            if file_size == 0:
                return json.dumps({"error": f"FCPXML file is empty: {abs_path}"})

            # Import the FCPXML as a new timeline
            import_options = {}
            new_timeline = media_pool.ImportTimelineFromFile(abs_path, import_options)

            if not new_timeline:
                return json.dumps({
                    "error": f"DaVinci Resolve failed to import the FCPXML. File at: {abs_path}",
                    "xml_path": abs_path
                })

            # Set the imported timeline as active
            timeline_name = new_timeline.GetName()
            project.SetCurrentTimeline(new_timeline)

            return json.dumps({
                "success": True,
                "message": f"Imported FCPXML as timeline '{timeline_name}'.",
                "xml_path": abs_path,
                "timeline_name": timeline_name
            })

        except Exception as e:
            return json.dumps({
                "error": f"Error during FCPXML import: {str(e)}. File at: {abs_path}",
                "xml_path": abs_path
            })

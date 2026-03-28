import json
import os
import tempfile
import time

from .xml_slicer import slice_fcpxml
from ..resolve_connector import NoProjectError, NoTimelineError, ResolveNotRunningError

def register(mcp, connector):
    @mcp.tool()
    def split_timeline_from_srt_via_xml(
        intervals_json: str
    ) -> str:
        """
        Exports the current DaVinci Resolve timeline as FCPXML, mathematically slices it
        into multiple smaller timelines based on the provided intervals, and imports
        them back into the Media Pool as new Timelines.

        Args:
            intervals_json: A JSON string representing an array of segments to slice.
                            Each segment contains an array of disjoint sub-cuts to assemble.
                            Format: '[{"name": "Reel 1", "cuts": [{"start_seconds": 10.0, "end_seconds": 15.0}, {"start_seconds": 45.0, "end_seconds": 55.0}]}]'
        """
        try:
            intervals = json.loads(intervals_json)
        except json.JSONDecodeError:
            return "Error: intervals_json must be a valid JSON array of objects."
            
        try:
            resolve = connector.get_resolve()
            project = connector.get_project()
            timeline = connector.get_timeline()
            media_pool = project.GetMediaPool()
        except (NoProjectError, NoTimelineError, ResolveNotRunningError) as exc:
            return str(exc)

        # 1. Export the current timeline to FCPXML 1.8
        temp_dir = tempfile.gettempdir()
        timeline_name = timeline.GetName()
        
        # Clean up timeline name for filesystem
        safe_name = "".join(c for c in timeline_name if c.isalnum() or c in (' ', '_', '-')).strip()
        export_path = os.path.join(temp_dir, f"{safe_name}_original.fcpxml")
        
        # EXPORT_FCPXML_1_8 enum value is not always available directly on resolve, 
        # it depends on the Resolve version. The magic string for import is often used,
        # but the export API uses enums. FCPXML 1.8 is typically an integer or attribute:
        # resolve.EXPORT_FCPXML_1_8 or resolve.EXPORT_FCP_7_XML
        export_enum = getattr(resolve, 'EXPORT_FCPXML_1_8', 0) # Fallback to 0 if attribute missing
        if getattr(resolve, 'EXPORT_FCP_7_XML', None):
            export_enum = resolve.EXPORT_FCP_7_XML # Fallback widely supported one
            
        success = timeline.Export(export_path, getattr(resolve, 'EXPORT_FCPXML_1_8', 6), getattr(resolve, 'EXPORT_NONE', 0))
        if not success:
            # Fallback to magic numbers if enum fails (Resolve 18/19 compatibility)
            success = timeline.Export(export_path, 6, 0) # 6 = FCPXML 1.8 usually
            if not success:
                return "Error: Failed to export active timeline to FCPXML."
                
        # 2. Slice and Import for each interval
        imported_timelines = []
        
        for idx, chunk in enumerate(intervals):
            name = str(chunk.get("name", f"{safe_name}_Part_{idx+1}"))
            cuts = chunk.get("cuts")
            
            if not cuts or not isinstance(cuts, list):
                # Fallback to old format if AI messes up
                start_sec = float(chunk.get("start_seconds", 0))
                duration_sec = float(chunk.get("duration_seconds", 90))
                cuts = [{"start_seconds": start_sec, "end_seconds": start_sec + duration_sec}]
            
            sliced_path = os.path.join(temp_dir, f"{name}.fcpxml")
            
            try:
                slice_fcpxml(export_path, sliced_path, cuts)
            except Exception as e:
                return f"Error mathematically slicing FCPXML for chunk {idx}: {str(e)}"
                
            # 3. Import back into DaVinci
            # ImportTimelineFromFile(filePath, importOptions)
            # importOptions is a dictionary
            import_options = {
                "timelineName": name
            }
            new_timeline = media_pool.ImportTimelineFromFile(sliced_path, import_options)
            if new_timeline:
                imported_timelines.append(name)
            else:
                # Sometimes FCPXML import fails silently. Let's record it.
                imported_timelines.append(f"{name} (Import Failed)")
                
        return json.dumps({
            "success": True,
            "message": f"Exported original timeline, sliced mathematically, and attempted import.",
            "timelines": imported_timelines
        })

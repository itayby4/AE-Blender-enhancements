from ..blender_connector import BlenderExecutionError, BlenderNotRunningError


def register(mcp, connector):
    @mcp.tool()
    def get_scene_info() -> str:
        """Get information about the active Blender scene: name, file path,
        frame range, FPS, resolution, and render engine."""
        code = """
import json, bpy
scene = bpy.context.scene
render = scene.render
__result__ = json.dumps({
    "scene_name": scene.name,
    "filepath": bpy.data.filepath or "(unsaved)",
    "blender_version": bpy.app.version_string,
    "frame_start": scene.frame_start,
    "frame_end": scene.frame_end,
    "frame_current": scene.frame_current,
    "fps": render.fps,
    "resolution_x": render.resolution_x,
    "resolution_y": render.resolution_y,
    "resolution_percentage": render.resolution_percentage,
    "render_engine": render.engine,
    "object_count": len(bpy.data.objects),
    "mesh_count": len(bpy.data.meshes),
    "material_count": len(bpy.data.materials),
    "camera": scene.camera.name if scene.camera else None,
})
"""
        try:
            return connector.execute(code)
        except BlenderNotRunningError as exc:
            return str(exc)
        except BlenderExecutionError as exc:
            return f"Blender error: {exc}"

    @mcp.tool()
    def list_collections() -> str:
        """List all collections in the scene, with object counts and
        visibility flags."""
        code = """
import json, bpy

def _col_info(col):
    return {
        "name": col.name,
        "hide_viewport": col.hide_viewport,
        "objects": [o.name for o in col.objects],
        "children": [_col_info(c) for c in col.children],
    }

__result__ = json.dumps(_col_info(bpy.context.scene.collection))
"""
        try:
            return connector.execute(code)
        except BlenderNotRunningError as exc:
            return str(exc)
        except BlenderExecutionError as exc:
            return f"Blender error: {exc}"

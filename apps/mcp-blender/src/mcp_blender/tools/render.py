import json

from ..blender_connector import BlenderExecutionError, BlenderNotRunningError

_VALID_ENGINES = {"BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES", "BLENDER_WORKBENCH"}


def _safe_call(connector, code: str) -> str:
    try:
        return connector.execute(code)
    except BlenderNotRunningError as exc:
        return str(exc)
    except BlenderExecutionError as exc:
        return f"Blender error: {exc}"


def register(mcp, connector):
    @mcp.tool()
    def get_render_settings() -> str:
        """Get the current render settings: engine, resolution, frame range,
        sample count, output path."""
        code = """
import json, bpy
scene = bpy.context.scene
render = scene.render
info = {
    "engine": render.engine,
    "resolution_x": render.resolution_x,
    "resolution_y": render.resolution_y,
    "resolution_percentage": render.resolution_percentage,
    "frame_start": scene.frame_start,
    "frame_end": scene.frame_end,
    "fps": render.fps,
    "filepath": render.filepath,
    "file_format": render.image_settings.file_format,
}
if render.engine == "CYCLES":
    info["samples"] = scene.cycles.samples
elif render.engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    info["samples"] = scene.eevee.taa_render_samples
__result__ = json.dumps(info)
"""
        return _safe_call(connector, code)

    @mcp.tool()
    def set_render_settings(
        engine: str | None = None,
        resolution_x: int | None = None,
        resolution_y: int | None = None,
        samples: int | None = None,
        frame_start: int | None = None,
        frame_end: int | None = None,
        output_path: str | None = None,
    ) -> str:
        """Update render settings. Any argument left as None is unchanged.

        engine must be one of BLENDER_EEVEE, BLENDER_EEVEE_NEXT, CYCLES,
        BLENDER_WORKBENCH.
        """
        if engine is not None and engine not in _VALID_ENGINES:
            return f"Invalid engine '{engine}'. Must be one of: {sorted(_VALID_ENGINES)}"

        lines = []
        if engine is not None:
            lines.append(f"render.engine = {json.dumps(engine)}")
        if resolution_x is not None:
            lines.append(f"render.resolution_x = {resolution_x}")
        if resolution_y is not None:
            lines.append(f"render.resolution_y = {resolution_y}")
        if frame_start is not None:
            lines.append(f"scene.frame_start = {frame_start}")
        if frame_end is not None:
            lines.append(f"scene.frame_end = {frame_end}")
        if output_path is not None:
            lines.append(f"render.filepath = {json.dumps(output_path)}")
        if samples is not None:
            lines.append(
                f"""if render.engine == "CYCLES":
    scene.cycles.samples = {samples}
elif render.engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    scene.eevee.taa_render_samples = {samples}"""
            )

        if not lines:
            return "No render settings supplied — nothing to do."

        body = "\n".join(lines)
        code = f"""
import json, bpy
scene = bpy.context.scene
render = scene.render
{body}
__result__ = json.dumps({{
    "engine": render.engine,
    "resolution_x": render.resolution_x,
    "resolution_y": render.resolution_y,
    "frame_start": scene.frame_start,
    "frame_end": scene.frame_end,
    "filepath": render.filepath,
}})
"""
        return _safe_call(connector, code)

    @mcp.tool()
    def render_frame(frame: int | None = None, output_path: str = "") -> str:
        """Render a single frame.

        frame: which frame to render (defaults to the current frame).
        output_path: write the rendered image here (e.g. /tmp/out.png). If
        empty, uses the scene's current render filepath.
        """
        set_frame = "" if frame is None else f"scene.frame_set({frame})"
        set_path = "" if not output_path else f"scene.render.filepath = {json.dumps(output_path)}"
        code = f"""
import json, bpy
scene = bpy.context.scene
{set_frame}
{set_path}
bpy.ops.render.render(write_still=True)
__result__ = json.dumps({{
    "rendered_frame": scene.frame_current,
    "output_path": scene.render.filepath,
}})
"""
        return _safe_call(connector, code)

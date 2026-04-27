import json

from ..blender_connector import BlenderExecutionError, BlenderNotRunningError

_VALID_PRIMITIVES = {"CUBE", "SPHERE", "CYLINDER", "PLANE", "CONE", "TORUS", "MONKEY"}


def _safe_call(connector, code: str) -> str:
    try:
        return connector.execute(code)
    except BlenderNotRunningError as exc:
        return str(exc)
    except BlenderExecutionError as exc:
        return f"Blender error: {exc}"


def register(mcp, connector):
    @mcp.tool()
    def list_objects() -> str:
        """List all objects in the current scene with type, location, and
        visibility."""
        code = """
import json, bpy
items = []
for obj in bpy.context.scene.objects:
    items.append({
        "name": obj.name,
        "type": obj.type,
        "location": [round(v, 4) for v in obj.location],
        "rotation_euler": [round(v, 4) for v in obj.rotation_euler],
        "scale": [round(v, 4) for v in obj.scale],
        "hide_viewport": obj.hide_viewport,
        "hide_render": obj.hide_render,
    })
__result__ = json.dumps(items)
"""
        return _safe_call(connector, code)

    @mcp.tool()
    def get_object_info(name: str) -> str:
        """Get detailed information about a single object: transform,
        dimensions, materials, mesh stats (if applicable)."""
        code = f"""
import json, bpy
obj = bpy.data.objects.get({json.dumps(name)})
if obj is None:
    __result__ = json.dumps({{"error": "Object not found: " + {json.dumps(name)}}})
else:
    info = {{
        "name": obj.name,
        "type": obj.type,
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "dimensions": list(obj.dimensions),
        "parent": obj.parent.name if obj.parent else None,
        "materials": [m.name for m in obj.data.materials] if hasattr(obj.data, "materials") else [],
    }}
    if obj.type == "MESH":
        info["vertex_count"] = len(obj.data.vertices)
        info["polygon_count"] = len(obj.data.polygons)
    __result__ = json.dumps(info)
"""
        return _safe_call(connector, code)

    @mcp.tool()
    def create_primitive(
        primitive: str,
        name: str = "",
        location_x: float = 0.0,
        location_y: float = 0.0,
        location_z: float = 0.0,
    ) -> str:
        """Add a primitive mesh to the scene.

        primitive must be one of: CUBE, SPHERE, CYLINDER, PLANE, CONE, TORUS, MONKEY.
        If name is given the new object is renamed to it.
        """
        prim = primitive.upper()
        if prim not in _VALID_PRIMITIVES:
            return f"Invalid primitive '{primitive}'. Must be one of: {sorted(_VALID_PRIMITIVES)}"

        op_map = {
            "CUBE": "primitive_cube_add",
            "SPHERE": "primitive_uv_sphere_add",
            "CYLINDER": "primitive_cylinder_add",
            "PLANE": "primitive_plane_add",
            "CONE": "primitive_cone_add",
            "TORUS": "primitive_torus_add",
            "MONKEY": "primitive_monkey_add",
        }
        op = op_map[prim]

        code = f"""
import json, bpy
bpy.ops.mesh.{op}(location=({location_x}, {location_y}, {location_z}))
obj = bpy.context.active_object
new_name = {json.dumps(name)}
if new_name:
    obj.name = new_name
__result__ = json.dumps({{
    "name": obj.name,
    "type": obj.type,
    "location": list(obj.location),
}})
"""
        return _safe_call(connector, code)

    @mcp.tool()
    def delete_object(name: str) -> str:
        """Delete an object by name."""
        code = f"""
import json, bpy
obj = bpy.data.objects.get({json.dumps(name)})
if obj is None:
    __result__ = json.dumps({{"deleted": False, "reason": "not found"}})
else:
    bpy.data.objects.remove(obj, do_unlink=True)
    __result__ = json.dumps({{"deleted": True, "name": {json.dumps(name)}}})
"""
        return _safe_call(connector, code)

    @mcp.tool()
    def set_transform(
        name: str,
        location_x: float | None = None,
        location_y: float | None = None,
        location_z: float | None = None,
        rotation_x: float | None = None,
        rotation_y: float | None = None,
        rotation_z: float | None = None,
        scale_x: float | None = None,
        scale_y: float | None = None,
        scale_z: float | None = None,
    ) -> str:
        """Set transform values on an object. Any axis left as None is
        unchanged. Rotation is in radians."""
        updates = []
        loc = (location_x, location_y, location_z)
        rot = (rotation_x, rotation_y, rotation_z)
        sca = (scale_x, scale_y, scale_z)
        for axis, val in zip(range(3), loc):
            if val is not None:
                updates.append(f"obj.location[{axis}] = {val}")
        for axis, val in zip(range(3), rot):
            if val is not None:
                updates.append(f"obj.rotation_euler[{axis}] = {val}")
        for axis, val in zip(range(3), sca):
            if val is not None:
                updates.append(f"obj.scale[{axis}] = {val}")

        if not updates:
            return "No transform values supplied — nothing to do."

        body = "\n    ".join(updates)
        code = f"""
import json, bpy
obj = bpy.data.objects.get({json.dumps(name)})
if obj is None:
    __result__ = json.dumps({{"error": "Object not found: " + {json.dumps(name)}}})
else:
    {body}
    __result__ = json.dumps({{
        "name": obj.name,
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
    }})
"""
        return _safe_call(connector, code)

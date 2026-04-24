"""
PipeFX ΓÇö User Script Skills tool registration.

Discovers user-created Python script skills and registers them as MCP tools.
Each script becomes a callable tool prefixed with `skill_`.
"""

import json
import logging
import traceback

from ..skill_loader import load_all_scripts, get_scripts_dir, ScriptSkill

logger = logging.getLogger(__name__)


def _build_tool_schema(skill: ScriptSkill) -> dict:
    """Convert a ScriptSkill's parameters into a JSON Schema for MCP."""
    if not skill.parameters:
        return {"type": "object", "properties": {}}

    properties = {}
    required = []

    for param_name, param_def in skill.parameters.items():
        prop = {
            "type": param_def.get("type", "string"),
            "description": param_def.get("description", ""),
        }
        if "enum" in param_def:
            prop["enum"] = param_def["enum"]
        if "default" in param_def:
            prop["default"] = param_def["default"]
        properties[param_name] = prop

        if param_def.get("required", False):
            required.append(param_name)

    schema = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


def register(mcp, connector):
    """
    Discover and register all user script skills as MCP tools.
    Each skill becomes a tool named `skill_<name>`.
    """
    scripts_dir = get_scripts_dir()
    skills, errors = load_all_scripts(scripts_dir)

    for error in errors:
        logger.warning(
            f"[UserSkills] Skipping {error.path.name}: {error.error}"
        )

    if not skills:
        logger.info(
            f"[UserSkills] No script skills found in {scripts_dir}"
        )
        return

    logger.info(
        f"[UserSkills] Registering {len(skills)} script skill(s) from {scripts_dir}"
    )

    for skill in skills:
        _register_single_skill(mcp, connector, skill)


def _register_single_skill(mcp, connector, skill: ScriptSkill):
    """Register a single script skill as an MCP tool."""
    tool_name = f"skill_{skill.name}"

    @mcp.tool(name=tool_name, description=skill.description)
    def skill_tool(**kwargs) -> str:
        try:
            result = skill.run_fn(connector, kwargs)
            if isinstance(result, str):
                return result
            return json.dumps(result, default=str)
        except Exception as e:
            tb = traceback.format_exc()
            logger.error(f"[UserSkills] Error in {skill.name}: {e}\n{tb}")
            return f"Error executing skill '{skill.name}': {e}"

    logger.info(f"[UserSkills] Registered tool: {tool_name}")

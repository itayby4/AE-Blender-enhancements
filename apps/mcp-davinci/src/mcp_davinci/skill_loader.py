"""
PipeFX Script Skills ΓÇö Dynamic skill loader.

Discovers, validates, and registers user-created Python scripts as MCP tools.
Each script must export a SKILL_META dict and a run(connector, args) function.
"""

import importlib.util
import logging
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

# ΓöÇΓöÇ Script Skill Protocol ΓöÇΓöÇ

REQUIRED_META_KEYS = {"name", "description"}
REQUIRED_FUNCTIONS = {"run"}


class ScriptSkill:
    """Represents a loaded user script skill."""

    def __init__(
        self,
        path: Path,
        name: str,
        description: str,
        parameters: dict[str, Any],
        run_fn: Callable,
    ):
        self.path = path
        self.name = name
        self.description = description
        self.parameters = parameters
        self.run_fn = run_fn

    def __repr__(self) -> str:
        return f"ScriptSkill({self.name!r}, path={self.path})"


class SkillLoadError:
    """Describes why a script failed to load."""

    def __init__(self, path: Path, error: str):
        self.path = path
        self.error = error

    def __repr__(self) -> str:
        return f"SkillLoadError({self.path.name}: {self.error})"


def _validate_and_load(script_path: Path) -> ScriptSkill | SkillLoadError:
    """
    Load a single script file into a ScriptSkill.
    Returns SkillLoadError if anything is wrong.
    """
    try:
        spec = importlib.util.spec_from_file_location(
            f"pipefx_skill_{script_path.stem}", str(script_path)
        )
        if spec is None or spec.loader is None:
            return SkillLoadError(script_path, "Cannot create module spec")

        module = importlib.util.module_from_spec(spec)
        # Prevent polluting global module namespace
        sys.modules[f"pipefx_skill_{script_path.stem}"] = module
        spec.loader.exec_module(module)

        # Validate SKILL_META
        meta = getattr(module, "SKILL_META", None)
        if meta is None or not isinstance(meta, dict):
            return SkillLoadError(script_path, "Missing SKILL_META dict")

        missing_keys = REQUIRED_META_KEYS - set(meta.keys())
        if missing_keys:
            return SkillLoadError(
                script_path, f"SKILL_META missing keys: {missing_keys}"
            )

        # Validate run function
        run_fn = getattr(module, "run", None)
        if run_fn is None or not callable(run_fn):
            return SkillLoadError(script_path, "Missing run(connector, args) function")

        name = meta["name"]
        description = meta["description"]
        parameters = meta.get("parameters", {})

        return ScriptSkill(
            path=script_path,
            name=name,
            description=description,
            parameters=parameters,
            run_fn=run_fn,
        )

    except Exception as e:
        tb = traceback.format_exc()
        return SkillLoadError(
            script_path, f"Import error: {e}\n{tb}"
        )
    finally:
        # Clean up module reference to allow re-import
        key = f"pipefx_skill_{script_path.stem}"
        if key in sys.modules:
            del sys.modules[key]


def discover_scripts(scripts_dir: str | Path) -> list[Path]:
    """Find all .py script files in the scripts directory."""
    scripts_path = Path(scripts_dir)
    if not scripts_path.exists():
        return []
    return sorted(
        p for p in scripts_path.glob("*.py")
        if not p.name.startswith("_") and p.name != "skill_template.py"
    )


def load_all_scripts(
    scripts_dir: str | Path,
) -> tuple[list[ScriptSkill], list[SkillLoadError]]:
    """
    Discover and load all script skills from the scripts directory.
    Returns (loaded_skills, errors).
    """
    scripts = discover_scripts(scripts_dir)
    skills: list[ScriptSkill] = []
    errors: list[SkillLoadError] = []

    for script_path in scripts:
        result = _validate_and_load(script_path)
        if isinstance(result, ScriptSkill):
            skills.append(result)
            logger.info(f"Loaded script skill: {result.name} from {script_path.name}")
        else:
            errors.append(result)
            logger.warning(f"Failed to load {script_path.name}: {result.error}")

    return skills, errors


def get_scripts_dir() -> Path:
    """
    Get the scripts directory path.
    Uses PIPEFX_SCRIPTS_DIR env var, or defaults to data/scripts/ next to the workspace.
    """
    env_dir = os.environ.get("PIPEFX_SCRIPTS_DIR")
    if env_dir:
        return Path(env_dir)

    # Default: workspace_root/data/scripts/
    # Walk up from this file to find the workspace root
    current = Path(__file__).resolve()
    # mcp_davinci/skill_loader.py ΓåÆ apps/mcp-davinci/src/mcp_davinci/
    workspace_root = current.parent.parent.parent.parent.parent
    scripts_dir = workspace_root / "data" / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    return scripts_dir

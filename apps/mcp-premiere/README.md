# `@pipefx/mcp-premiere`

MCP server for Adobe Premiere Pro. Part of the PipeFX monorepo.

**Status:** functional.
**IPC mode:** stdio.
**Language:** Python >= 3.10 (FastMCP + Pymiere).
**Backend connector id:** `premiere` — see [apps/backend/src/config.ts](../../apps/backend/src/config.ts).

## Tools

Registered in [src/mcp_premiere/tools/__init__.py](src/mcp_premiere/tools/__init__.py). Categories: project, cutting, understanding, xml_tools, audio, transcript, subtitles. Each module exposes `def register(mcp, connector):`.

## Nx targets

```powershell
pnpm nx serve @pipefx/mcp-premiere   # .\venv\Scripts\python.exe -m mcp_premiere.server
pnpm nx test  @pipefx/mcp-premiere   # import-smoke
```

---

## Details

This is the Model Context Protocol (MCP) server for Adobe Premiere Pro, part of the **PipeFX** application. It allows our AI to natively control and edit videos on the Premiere Pro timeline.

## Technology Stack

- **Python >= 3.10**
- **FastMCP**: Provides the MCP server interface for AI agents.
- **Pymiere**: An open-source Python library used to communicate with Adobe Premiere Pro natively.
- **ExtendScript**: Used internally via Pymiere to execute deep `Quality Engineering (QE)` DOM scripts in Premiere.

---

## 🚀 Setup & Installation (For Developers)

To develop tools for Premiere Pro, you need to set up the connection between this Python server and your installed version of Premiere Pro.

### 1. Install Python Dependencies

The virtual environment should ideally be created automatically. Make sure you install the project's dependencies!
From the root of this app (`apps/mcp-premiere`):

```bash
python -m venv venv

# Windows
.\venv\Scripts\activate

# Install dependencies
pip install -e .
# Note: setuptools is required for compatibility with Python 3.12+
```

### 2. Install the Pymiere Link Extension (CRITICAL)

Pymiere requires a tiny Adobe Premiere Extension (`pymiere_link`) to act as a bridge between Python and Premiere. We've included a script to automate this installation and configure your Windows Registry to allow debugging unsigned extensions.

Run the installer script:

```bash
python install_pymiere_link.py
```

> **What this script does:**
>
> 1. Explores `Regedit` and sets `PlayerDebugMode` to `1` for all Adobe CSXS versions (required to load third-party extensions).
> 2. Downloads the `pymiere_link` extension and extracts it to `C:\Users\<USER>\AppData\Roaming\Adobe\CEP\extensions`.

### 3. Restart Services

Always restart Premiere Pro after running the extension installer.
If you add or modify tools here, **you must restart the PipeFX backend** (`pnpm nx serve backend`), as the backend mounts this Python MCP server when it starts.

---

## 🛠️ Adding New AI Tools

1. Create a new python file in `src/mcp_premiere/tools/` (e.g., `export.py`).
2. Add a `register(mcp)` function in your new file:

   ```python
   import pymiere

   def register(mcp):
       @mcp.tool()
       def premiere_do_something(param: str) -> str:
           """
           Detailed docstring describing what the tool does.
           The AI reads this to know when and how to use it!
           """
           if not pymiere.objects.app.isDocumentOpen():
               return "Error: No project open."

           # Use Pymiere or ExtendScript bridging here!
           return f"Action complete: {param}"
   ```

3. Import and call your `register` function inside `src/mcp_premiere/tools/__init__.py`.

## 📚 Resources

- [Pymiere GitHub & Documentation](https://github.com/qmasingarbe/pymiere)
- [Adobe Premiere Pro Scripting Reference (ExtendScript)](https://premiereonscript.com/extendscript-api/)

import sys
from mcp.server.fastmcp import FastMCP

from .blender_connector import BlenderConnector
from .tools import register_tools

mcp = FastMCP("Blender")
connector = BlenderConnector()

# Register all capabilities
register_tools(mcp, connector)

def main():
    print("Starting Blender MCP Server...", file=sys.stderr)
    mcp.run()

if __name__ == "__main__":
    main()

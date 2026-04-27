import logging
import sys

from mcp.server.fastmcp import FastMCP

from .blender_connector import BlenderConnector
from .tools import register_tools

logging.getLogger("mcp.server").setLevel(logging.WARNING)

mcp = FastMCP("blender")
connector = BlenderConnector()
register_tools(mcp, connector)


def main():
    print("Starting Blender MCP Server...", file=sys.stderr)
    mcp.run()


if __name__ == "__main__":
    main()

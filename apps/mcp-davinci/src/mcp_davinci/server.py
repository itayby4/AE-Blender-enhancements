import sys
import logging

from mcp.server.fastmcp import FastMCP

# Silence the repetitive MCP CallToolRequest logs
logging.getLogger("mcp.server").setLevel(logging.WARNING)


from .resolve_connector import ResolveConnector
from .tools import register_tools

mcp = FastMCP("davinci_resolve")
connector = ResolveConnector()
register_tools(mcp, connector)


def main():
    print("Starting DaVinci Resolve MCP Server...", file=sys.stderr)
    mcp.run()


if __name__ == "__main__":
    main()

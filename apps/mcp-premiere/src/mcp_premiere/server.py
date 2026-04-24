import sys
from mcp.server.fastmcp import FastMCP

from .premiere_connector import PremiereConnector
from .tools import register_tools

mcp = FastMCP("PremierePro")
connector = PremiereConnector()

# Register all capabilities
register_tools(mcp, connector)

def main():
    print("Starting Premiere Pro MCP Server...", file=sys.stderr)
    mcp.run()

if __name__ == "__main__":
    main()

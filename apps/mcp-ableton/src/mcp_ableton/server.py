import sys
from mcp.server.fastmcp import FastMCP

from .ableton_connector import AbletonConnector
from .tools import register_tools

mcp = FastMCP("Ableton")
connector = AbletonConnector()

# Register all capabilities
register_tools(mcp, connector)

def main():
    print("Starting Ableton Live MCP Server...", file=sys.stderr)
    mcp.run()

if __name__ == "__main__":
    main()

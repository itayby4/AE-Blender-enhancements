import sys
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("AfterEffects")

@mcp.tool()
def get_ae_status() -> str:
    """Gets the status of the After Effects connection."""
    return "Connected to After Effects (Placeholder)"

def main():
    mcp.run()

if __name__ == "__main__":
    main()

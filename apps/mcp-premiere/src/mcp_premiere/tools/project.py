import json

def register(mcp, connector):
    
    @mcp.tool()
    def premiere_get_project_info() -> str:
        """
        Gets information about the currently open Adobe Premiere Pro project and timeline (sequence).
        Returns the project name, path, active sequence name, framerate, and the number of video/audio tracks.
        Always run this before attempting to make edits.
        """
        try:
            app = connector.get_app()
            project = connector.get_project()
            sequence = connector.get_active_sequence()

            return json.dumps({
                "project_name": project.name,
                "project_path": project.path,
                "active_sequence": {
                    "name": sequence.name,
                    "id": sequence.sequenceID,
                    "timebase": sequence.timebase,
                    "video_tracks": sequence.videoTracks.numTracks,
                    "audio_tracks": sequence.audioTracks.numTracks
                }
            }, indent=2)

        except Exception as e:
            return f"Error getting Premiere info: {str(e)}"

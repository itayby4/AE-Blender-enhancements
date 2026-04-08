import math

def format_timecode(total_seconds: float, fps: float) -> str:
    """Formats seconds into Premiere-compatible timecode HH:MM:SS:FF"""
    frames = int(round((total_seconds % 1) * fps))
    total_seconds_int = int(total_seconds)
    hours = total_seconds_int // 3600
    minutes = (total_seconds_int % 3600) // 60
    seconds = total_seconds_int % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}:{frames:02d}"

def register(mcp, connector):

    @mcp.tool()
    def premiere_razor_cut_clips(interval_seconds: float) -> str:
        """
        Calculates and executes cuts across the Premiere Pro timeline for ALL clips at the specified interval in seconds.
        For example: passing 4.0 will add a cut every 4 seconds from 0 to the end of the sequence.
        """
        try:
            sequence = connector.get_active_sequence()

            # Calculate the sequence end time (in seconds)
            end_time_ticks = int(sequence.end)
            ticks_per_second = 254016000000
            end_time_seconds = float(end_time_ticks) / ticks_per_second
            
            # Determine FPS to generate correct format string
            timebase_ticks = int(sequence.timebase)
            fps = float(ticks_per_second) / timebase_ticks

            cuts_made = 0
            current_time = interval_seconds
            timecodes = []
            
            while current_time < end_time_seconds:
                tc = format_timecode(current_time, fps)
                timecodes.append(tc)
                current_time += interval_seconds
                cuts_made += 1
                
            if not timecodes:
                return f"Interval {interval_seconds}s is larger than sequence length ({end_time_seconds:.2f}s). No cuts needed."

            # Pass the pre-computed cut array directly into ExtendScript to run at once using Eval
            tc_array_str = str(timecodes)
            
            qe_script = f"""
            app.enableQE();
            var qeSeq = qe.project.getActiveSequence();
            var cutsConfigured = 0;
            if (qeSeq) {{
                var cuts = {tc_array_str};
                // Get all active video tracks and cut them
                var numT = qeSeq.numVideoTracks;
                for (var t = 0; t < numT; t++) {{
                    var track = qeSeq.getVideoTrackAt(t);
                    if (track) {{
                        for (var i = 0; i < cuts.length; i++) {{
                            track.razor(cuts[i]);
                            cutsConfigured++;
                        }}
                    }}
                }}
            }}
            cutsConfigured;
            """
            
            result = connector.eval_qe(qe_script)

            report = []
            report.append(f"Successfully Analyzed and Sliced Timeline '{sequence.name}'")
            report.append(f"Total Video Tracks scanned.")
            report.append(f"Calculated Cuts per track: {cuts_made}")
            report.append(f"QE API Reported total razor executions: {result}")
            
            return "\\n".join(report)

        except Exception as e:
             return f"Failed to execute cut on timeline: {str(e)}"

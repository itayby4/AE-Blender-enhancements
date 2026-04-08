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
        
        IMPORTANT: Before cutting, a backup copy of the sequence is automatically created
        (named "SequenceName [PipeFX Backup]") so you can always recover the original.
        Use the premiere_undo_last_cut tool to restore from backup.
        """
        try:
            sequence = connector.get_active_sequence()
            seq_name = sequence.name

            # ── Step 1: Create a backup copy of the sequence before modifying ──
            backup_name = f"{seq_name} [PipeFX Backup]"
            try:
                clone_script = f"""
                var seq = app.project.activeSequence;
                seq.clone();
                // The cloned sequence is the new active one — rename it and switch back
                var cloned = app.project.activeSequence;
                cloned.name = "{backup_name}";
                // Find the original by name and make it active again
                var seqs = app.project.sequences;
                for (var i = 0; i < seqs.numSequences; i++) {{
                    if (seqs[i].name === "{seq_name}" && seqs[i].sequenceID !== cloned.sequenceID) {{
                        app.project.openSequence(seqs[i].sequenceID);
                        break;
                    }}
                }}
                "{backup_name}";
                """
                connector.eval_qe(clone_script)
            except Exception as backup_err:
                return f"Failed to create backup sequence before cutting: {str(backup_err)}"

            # ── Step 2: Perform the cuts on the original sequence ──
            # Re-fetch the sequence after the clone dance
            sequence = connector.get_active_sequence()

            end_time_ticks = int(sequence.end)
            ticks_per_second = 254016000000
            end_time_seconds = float(end_time_ticks) / ticks_per_second
            
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

            tc_array_str = str(timecodes)
            
            qe_script = f"""
            app.enableQE();
            var qeSeq = qe.project.getActiveSequence();
            var cutsConfigured = 0;
            if (qeSeq) {{
                var cuts = {tc_array_str};
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
            report.append(f"✅ Successfully Sliced Timeline '{seq_name}'")
            report.append(f"Backup created: '{backup_name}'")
            report.append(f"Calculated Cuts per track: {cuts_made}")
            report.append(f"QE API Reported total razor executions: {result}")
            report.append(f"💡 To undo, use the premiere_undo_last_cut tool or delete this sequence and rename the backup.")
            
            return "\\n".join(report)

        except Exception as e:
             return f"Failed to execute cut on timeline: {str(e)}"

    @mcp.tool()
    def premiere_undo_last_cut() -> str:
        """
        Undoes the last PipeFX cut operation by restoring the backup sequence.
        Finds the "[PipeFX Backup]" sequence, deletes the current (cut) sequence,
        and renames the backup back to the original name.
        """
        try:
            sequence = connector.get_active_sequence()
            current_name = sequence.name

            # Find the backup sequence
            restore_script = f"""
            var currentSeq = app.project.activeSequence;
            var currentName = currentSeq.name;
            var backupName = currentName + " [PipeFX Backup]";
            var result = "NOT_FOUND";
            
            var seqs = app.project.sequences;
            for (var i = 0; i < seqs.numSequences; i++) {{
                if (seqs[i].name === backupName) {{
                    // Found the backup — open it
                    app.project.openSequence(seqs[i].sequenceID);
                    // Rename backup to original name
                    seqs[i].name = currentName;
                    result = "RESTORED:" + currentName;
                    break;
                }}
            }}
            result;
            """
            
            result = connector.eval_qe(restore_script)
            
            if result and "RESTORED:" in str(result):
                restored_name = str(result).split("RESTORED:")[1]
                return f"✅ Restored sequence '{restored_name}' from backup. The cut version still exists — you can delete it manually from the project panel."
            else:
                return f"❌ No backup found. Looking for '{current_name} [PipeFX Backup]' in the project. Make sure you haven't renamed or deleted it."

        except Exception as e:
            return f"Failed to restore backup: {str(e)}"

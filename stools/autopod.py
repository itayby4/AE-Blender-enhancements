import json
import argparse
import os
import sys

# Import our VAD tool
from vad import get_speech_intervals

def calculate_overlap(tracks_activity: dict, fps: float, total_duration_sec: float, mapping: dict, fallback: str) -> list:
    """
    Tracks activity: { 'AudioTrackPath': [{'start': 0.0, 'end': 2.0}, ...] }
    mapping: {"1": ["AudioTrackPath1", "AudioTrackPath2"], "2": ["AudioTrackPath3"]}
    fallback: "1" (Video track to use if overlap/silence)
    
    Returns a sequence of cuts: [{"start_sec": 0.0, "end_sec": 1.5, "camera": "1"}, ...]
    """
    total_frames = int(total_duration_sec * fps)
    
    # Pre-calculate active frames per 'Camera' (Video Track)
    camera_frames = {str(cam): [False] * total_frames for cam in mapping.keys()}

    # Fill frame activity
    for cam, audio_keys in mapping.items():
        for audio_key in audio_keys:
            if audio_key not in tracks_activity:
                continue
            for interval in tracks_activity[audio_key]:
                start_f = int(interval['start'] * fps)
                end_f = int(interval['end'] * fps)
                for f in range(start_f, min(end_f, total_frames)):
                    camera_frames[str(cam)][f] = True

    # Build sequence
    # Heuristics:
    # If 1 camera active -> use it.
    # If >1 camera active -> stay on the one that was previously active (L-cut/J-cut prevention of rapid switching)
    # If 0 cameras active -> fallback
    
    raw_sequence = []
    current_cam = fallback
    
    for f in range(total_frames):
        active_cams = [cam for cam, frames in camera_frames.items() if frames[f]]
        
        if len(active_cams) == 1:
            current_cam = active_cams[0]
        elif len(active_cams) > 1:
            # Overlap. If we are already on an active cam, stay on it.
            if current_cam not in active_cams:
                current_cam = fallback if fallback in active_cams else active_cams[0]
        else:
            # Silence
            current_cam = fallback
            
        raw_sequence.append(current_cam)

    # Hysteresis (Smoothing) - Remove cuts shorter than 1.5 seconds (unless it's the end of video)
    min_frames = int(1.5 * fps)
    
    smoothed_sequence = list(raw_sequence)
    
    # 1st pass: Eliminate micro-cuts
    current_val = smoothed_sequence[0]
    run_length = 0
    run_start = 0
    
    for f in range(total_frames):
        if smoothed_sequence[f] == current_val:
            run_length += 1
        else:
            if run_length < min_frames:
                # Too short! Revert this run to the previous stable value (or next stable value)
                # Let's revert to whatever the block before it was
                replace_val = smoothed_sequence[run_start - 1] if run_start > 0 else smoothed_sequence[f]
                for i in range(run_start, f):
                    smoothed_sequence[i] = replace_val
            
            current_val = smoothed_sequence[f]
            run_start = f
            run_length = 1

    # Convert smoothed frames back to time intervals
    cuts = []
    if total_frames > 0:
        current_cam = smoothed_sequence[0]
        start_f = 0
        for f in range(1, total_frames):
            if smoothed_sequence[f] != current_cam:
                cuts.append({
                    "start_seconds": start_f / fps,
                    "end_seconds": f / fps,
                    "camera": current_cam
                })
                current_cam = smoothed_sequence[f]
                start_f = f
                
        # Append last
        cuts.append({
            "start_seconds": start_f / fps,
            "end_seconds": total_frames / fps,
            "camera": current_cam
        })
        
    return cuts

def main():
    parser = argparse.ArgumentParser(description="AutoPod Video Follows Audio Algorithm")
    parser.add_argument("--mapping", type=str, required=True, help='JSON string like {"Video1": ["mic1.wav", "mic2.wav"], "Video2": ["mic3.wav"]}')
    parser.add_argument("--fallback", type=str, required=True, help='Video track to fallback to during silence or intense overlap (e.g. "Video1")')
    parser.add_argument("--fps", type=float, default=24.0, help="Timeline Framerate")
    parser.add_argument("--duration", type=float, required=True, help="Total duration of sequence in seconds")
    parser.add_argument("--out", type=str, required=True, help="Path to save JSON cut list")

    args = parser.parse_args()

    mapping = json.loads(args.mapping)
    fallback = args.fallback

    # Run VAD on all unique audio files
    tracks_activity = {}
    
    for cam, audio_files in mapping.items():
        for af in audio_files:
            if af not in tracks_activity:
                # Check file exists
                if os.path.exists(af):
                    print(f"Running VAD on {af}...")
                    # Aggressiveness=3 (High), Padding=400ms to keep breathing natural
                    intervals = get_speech_intervals(af, aggressiveness=3, padding_duration_ms=400)
                    tracks_activity[af] = intervals
                else:
                    print(f"WARNING: Audio file not found: {af}")
                    tracks_activity[af] = []

    # Calculate overlaps and generate cuts
    print("Calculating multicam cuts with hysteresis and overlap resolution...")
    cuts = calculate_overlap(tracks_activity, args.fps, args.duration, mapping, fallback)
    
    print(f"Generated {len(cuts)} cuts.")
    
    with open(args.out, 'w') as f:
        json.dump(cuts, f, indent=2)
        
    print(f"Saved cut list to {args.out}")

if __name__ == '__main__':
    main()

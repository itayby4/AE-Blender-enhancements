import sys
import json
import os
import subprocess
import tempfile
import argparse

# Suppress stdout from vad module
import contextlib
with contextlib.redirect_stdout(None):
    from vad import get_speech_intervals

def extract_to_wav(media_path: str, sample_rate: int = 16000) -> str:
    temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name
    cmd = [
        'ffmpeg', '-y',
        '-i', media_path,
        '-ac', '1',
        '-ar', str(sample_rate),
        '-f', 'wav',
        '-acodec', 'pcm_s16le',
        '-loglevel', 'error',
        temp_wav
    ]
    subprocess.run(cmd, check=True)
    return temp_wav

def slice_audio(original_path: str, start: float, end: float, index: int, out_dir: str) -> str:
    out_path = os.path.join(out_dir, f"vad_slice_{index}.mp3")
    cmd = [
        'ffmpeg', '-y',
        '-i', original_path,
        '-ss', str(start),
        '-to', str(end),
        '-c:a', 'libmp3lame',
        '-q:a', '5', # Good enough quality
        '-loglevel', 'error',
        out_path
    ]
    subprocess.run(cmd, check=True)
    return out_path

def main():
    parser = argparse.ArgumentParser(description="VAD Audio Splitter for PipeFX")
    parser.add_argument("audio_path", help="Path to exported audio chunk (MP3)")
    parser.add_argument("base_offset", type=float, help="Base timeline offset in seconds")
    parser.add_argument("--padding", type=int, default=2500, help="VAD padding in ms (default 2500 for 2.5s)")
    parser.add_argument("--aggressiveness", type=int, default=1, help="VAD aggressiveness (0-3), lower is more sensitive")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.audio_path):
        print(json.dumps({"error": f"Audio file not found: {args.audio_path}"}))
        sys.exit(1)
        
    temp_wav = None
    try:
        # Extract to 16kHz WAV for VAD analysis
        temp_wav = extract_to_wav(args.audio_path)
        
        # Run VAD
        # Padding 2500ms means it combines any speech separated by less than 2.5 seconds of silence.
        intervals = get_speech_intervals(temp_wav, aggressiveness=args.aggressiveness, padding_duration_ms=args.padding)
        
        # If no intervals detected, or just noise
        if not intervals:
            print(json.dumps([]))
            return

        # Filter chunks that are incredibly short (e.g., < 0.5 sec) to avoid bad API calls
        valid_intervals = [iv for iv in intervals if (iv['end'] - iv['start']) > 0.5]
        
        out_dir = tempfile.gettempdir()

        # BATCH OPTIMIZATION:
        # Instead of launching FFmpeg synchronously 100+ times (which takes minutes),
        # we run them in parallel utilizing all CPU cores. This reduces time by nearly 10x-20x.
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def process_chunk(i, iv):
            start = iv['start']
            end = iv['end']
            sliced_path = slice_audio(args.audio_path, start, end, i, out_dir)
            
            return {
                "index": i,
                "path": sliced_path,
                "offset_seconds": args.base_offset + start
            }

        with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as executor:
            futures = [executor.submit(process_chunk, i, iv) for i, iv in enumerate(valid_intervals)]
            
            # Collect results and sort back by original index since parallel threads finish out of order
            unordered_chunks = [f.result() for f in as_completed(futures)]
            
        result_chunks = sorted(unordered_chunks, key=lambda x: x["index"])
        
        # Remove the 'index' temp key before dumping JSON
        for chunk in result_chunks:
            chunk.pop("index")
            
        print(json.dumps(result_chunks))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    finally:
        if temp_wav and os.path.exists(temp_wav):
            os.remove(temp_wav)

if __name__ == '__main__':
    main()

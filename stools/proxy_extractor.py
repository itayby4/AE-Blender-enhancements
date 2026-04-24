"""
proxy_extractor.py
Uses ffmpeg to:
  1. Extract a short, tiny 360p proxy clip from each camera video file
  2. Split a multi-channel audio file into individual mono 16kHz 16-bit WAV files
     (compatible with webrtcvad)

Requires: ffmpeg in PATH
"""
import argparse
import json
import os
import subprocess
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass


def check_ffmpeg():
    """Verify ffmpeg is available."""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except FileNotFoundError:
        print("ERROR: ffmpeg not found in PATH. Please install ffmpeg.", flush=True)
        sys.exit(1)


def get_media_duration(filepath: str) -> float:
    """Use ffprobe to get duration in seconds."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                filepath,
            ],
            capture_output=True, text=True, encoding='utf-8',
        )
        info = json.loads(result.stdout)
        return float(info["format"]["duration"])
    except Exception:
        return 0.0


def get_audio_channels(filepath: str) -> int:
    """Use ffprobe to discover how many audio channels a file has."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_streams",
                "-select_streams", "a:0",
                filepath,
            ],
            capture_output=True, text=True, encoding='utf-8',
        )
        info = json.loads(result.stdout)
        streams = info.get("streams", [])
        if streams:
            return int(streams[0].get("channels", 1))
    except Exception:
        pass
    return 1


def extract_proxy_clip(
    video_path: str,
    out_path: str,
    start_sec: float = 300.0,
    duration_sec: float = 15.0,
):
    """
    Extract a short, ultra-compressed 360p proxy clip from a video file.
    If the video is shorter than start_sec, we sample from the middle.
    """
    total = get_media_duration(video_path)
    if total <= 0:
        total = 600.0  # fallback assume 10min

    # Pick a sample point: prefer ~5min in, but clamp to middle if short
    if total < start_sec + duration_sec:
        start_sec = max(0, (total - duration_sec) / 2.0)

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-i", video_path,
        "-t", str(duration_sec),
        "-vf", "scale=640:-2",       # 640px wide, maintain aspect
        "-r", "10",                   # 10 fps — plenty for lip reading
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "35",                 # very low quality, tiny file
        "-an",                        # strip audio from the proxy video
        out_path,
    ]
    print(f"  Extracting proxy clip: {os.path.basename(video_path)} "
          f"@ {start_sec:.0f}s for {duration_sec:.0f}s ...", flush=True)
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def split_audio_channels(
    audio_path: str,
    out_dir: str,
    num_channels: int | None = None,
) -> list[str]:
    """
    Split a multi-channel audio file into individual mono 16kHz 16-bit WAVs.
    Returns list of output file paths.
    """
    if num_channels is None:
        num_channels = get_audio_channels(audio_path)

    print(f"  Splitting {num_channels} audio channel(s) from: "
          f"{os.path.basename(audio_path)} ...", flush=True)

    outputs = []
    for ch in range(num_channels):
        out_path = os.path.join(out_dir, f"channel_{ch + 1}.wav")
        cmd = [
            "ffmpeg", "-y",
            "-i", audio_path,
            "-filter_complex", f"[0:a]pan=mono|c0=c{ch}[out]",
            "-map", "[out]",
            "-ar", "16000",          # 16kHz sample rate (webrtcvad requirement)
            "-sample_fmt", "s16",    # 16-bit (webrtcvad requirement)
            "-ac", "1",              # mono
            out_path,
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        outputs.append(out_path)

    return outputs


def extract_audio_sample(
    audio_path: str,
    out_path: str,
    start_sec: float = 300.0,
    duration_sec: float = 15.0,
):
    """Extract a short audio sample for Gemini analysis (lightweight mono mp3)."""
    total = get_media_duration(audio_path)
    if total <= 0:
        total = 600.0
    if total < start_sec + duration_sec:
        start_sec = max(0, (total - duration_sec) / 2.0)

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-i", audio_path,
        "-t", str(duration_sec),
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "libmp3lame",
        "-b:a", "64k",
        out_path,
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def main():
    parser = argparse.ArgumentParser(description="Extract proxies for AutoPod")
    parser.add_argument("--config", required=True,
                        help="Path to discover_media JSON config")
    parser.add_argument("--out-dir", required=True,
                        help="Directory to write proxy files")
    parser.add_argument("--sample-start", type=float, default=300.0,
                        help="Seconds into the timeline to sample from (default 300 = 5 min)")
    parser.add_argument("--sample-duration", type=float, default=15.0,
                        help="Duration of each proxy sample in seconds (default 15)")
    args = parser.parse_args()

    check_ffmpeg()

    with open(args.config, 'r', encoding='utf-8') as f:
        media_config = json.load(f)

    video_paths = media_config.get("videos", [])
    master_audio = media_config.get("master_audio", "")
    duration_sec = media_config.get("duration_sec", 3600.0)

    os.makedirs(args.out_dir, exist_ok=True)

    # ---- 1. Create tiny proxy clips for each camera ----
    print("Creating proxy video clips...", flush=True)
    proxy_videos = []
    for i, vp in enumerate(video_paths):
        proxy_path = os.path.join(args.out_dir, f"proxy_cam_{i + 1}.mp4")
        try:
            extract_proxy_clip(vp, proxy_path, args.sample_start, args.sample_duration)
            proxy_videos.append(proxy_path)
        except subprocess.CalledProcessError as e:
            print(f"  WARNING: Failed to extract proxy for {vp}: {e}", flush=True)

    # ---- 2. Extract a short audio sample for Gemini ----
    print("Creating audio sample for AI analysis...", flush=True)
    audio_sample_path = os.path.join(args.out_dir, "audio_sample.mp3")
    try:
        extract_audio_sample(master_audio, audio_sample_path,
                             args.sample_start, args.sample_duration)
    except subprocess.CalledProcessError as e:
        print(f"  WARNING: Failed to extract audio sample: {e}", flush=True)
        audio_sample_path = ""

    # ---- 3. Split full audio into individual channel WAVs for VAD ----
    print("Splitting audio channels for VAD analysis...", flush=True)
    channel_wavs = []
    try:
        channel_wavs = split_audio_channels(master_audio, args.out_dir)
    except subprocess.CalledProcessError as e:
        print(f"  WARNING: Failed to split audio channels: {e}", flush=True)

    # ---- Output ----
    result = {
        "proxy_videos": proxy_videos,
        "audio_sample": audio_sample_path,
        "channel_wavs": channel_wavs,
        "num_channels": len(channel_wavs),
        "num_cameras": len(proxy_videos),
        "sample_start_sec": args.sample_start,
        "sample_duration_sec": args.sample_duration,
    }

    out_path = os.path.join(args.out_dir, "proxy_config.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Proxy extraction complete: {len(proxy_videos)} video(s), "
          f"{len(channel_wavs)} audio channel(s)", flush=True)


if __name__ == '__main__':
    main()

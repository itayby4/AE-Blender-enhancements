"""
sentient_mapper.py
Lightweight LLM-based camera-to-audio mapper.

Uploads ONLY tiny proxy clips (15 seconds, 360p, ~200KB each) and a short
audio sample to Gemini. Asks the AI to watch the clips, identify speakers
by lip movement, and output a mapping of camera -> audio channel(s).

This mapping is then fed into the local VAD engine (autopod.py) which does
the actual frame-precise cutting entirely offline.
"""
import argparse
import json
import os
import sys
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

try:
    from google import genai
    from google.genai import types
except ImportError:
    import subprocess
    print("google-genai not found. Auto-installing...", flush=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "google-genai"])
    from google import genai
    from google.genai import types


def wait_for_files_active(client, files):
    """Wait for uploaded files to finish server-side processing."""
    for f in files:
        while True:
            info = client.files.get(name=f.name)
            if info.state.name == "ACTIVE":
                break
            elif info.state.name == "FAILED":
                raise Exception(f"File {f.name} failed to process on server.")
            time.sleep(1)


def generate_mapping(
    api_key: str,
    proxy_videos: list[str],
    audio_sample: str,
    num_channels: int,
    channel_wavs: list[str],
    out_path: str,
):
    client = genai.Client(api_key=api_key)
    uploaded = []

    # Upload proxy videos (tiny ~200KB each)
    print(f"Uploading {len(proxy_videos)} proxy clip(s) to Gemini...", flush=True)
    for i, vp in enumerate(proxy_videos):
        print(f"  Uploading proxy camera {i + 1} ({os.path.getsize(vp) // 1024} KB)...", flush=True)
        uf = client.files.upload(file=vp, config={"display_name": f"Camera_{i + 1}"})
        uploaded.append(uf)

    # Upload audio sample
    if audio_sample and os.path.exists(audio_sample):
        print(f"  Uploading audio sample ({os.path.getsize(audio_sample) // 1024} KB)...", flush=True)
        ua = client.files.upload(file=audio_sample, config={"display_name": "Audio_Sample"})
        uploaded.append(ua)

    print("Waiting for server processing...", flush=True)
    wait_for_files_active(client, uploaded)

    # Build the prompt
    cam_labels = ", ".join([f"Camera_{i+1}" for i in range(len(proxy_videos))])
    ch_labels = ", ".join([f"channel_{i+1}" for i in range(num_channels)])

    prompt = f"""You are a professional podcast editor analyzing a multi-camera shoot.

I have provided {len(proxy_videos)} synchronized camera angle(s): {cam_labels}.
The podcast has {num_channels} audio channel(s) (individual microphones): {ch_labels}.

TASK:
1. Watch each camera clip carefully. Identify who is visible in each angle based on their position, face, and body.
2. Listen to the audio sample carefully. Pay attention to when each person speaks.
3. Cross-reference lip movements in the video clips with the voices in the audio to determine which audio channel belongs to which person.
4. Map each camera to the audio channel(s) of the person/people primarily visible in that camera.

RULES:
- A camera can map to multiple audio channels if multiple speakers are visible.
- Every audio channel should be assigned to at least one camera.
- Camera IDs are "1", "2", etc. (matching Camera_1, Camera_2, ...).
- Audio channels are the file paths I will provide below.

The audio channel file paths are:
{json.dumps(channel_wavs, indent=2)}

OUTPUT FORMAT:
Return a JSON object where keys are camera IDs (strings) and values are arrays of audio channel file paths.
Example: {{"1": ["{channel_wavs[0] if channel_wavs else 'channel_1.wav'}"], "2": ["{channel_wavs[1] if len(channel_wavs) > 1 else 'channel_2.wav'}"]}}

Also include a "fallback" key with the camera ID that shows the widest/group shot (best for silence/overlap moments).
"""

    print("Requesting AI camera-to-microphone mapping...", flush=True)

    response = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=uploaded + [prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,  # very deterministic
        ),
    )

    # Parse
    try:
        mapping = json.loads(response.text)
    except json.JSONDecodeError:
        print("ERROR: Gemini did not return valid JSON.", flush=True)
        print(response.text, flush=True)
        sys.exit(1)

    # Save
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=2)

    # Extract fallback
    fallback = mapping.pop("fallback", "1")
    cam_count = len([k for k in mapping.keys() if k.isdigit()])

    print(f"AI Mapping complete: {cam_count} camera(s) mapped, fallback='{fallback}'", flush=True)
    for cam, channels in mapping.items():
        if cam == "fallback":
            continue
        print(f"  Camera {cam} -> {channels}", flush=True)

    # Cleanup remote files
    for uf in uploaded:
        try:
            client.files.delete(name=uf.name)
        except Exception:
            pass

    return mapping, fallback


def main():
    parser = argparse.ArgumentParser(description="AI Camera-to-Microphone Mapper")
    parser.add_argument("--proxy-config", required=True,
                        help="Path to proxy_config.json from proxy_extractor")
    parser.add_argument("--out", required=True,
                        help="Path to save the mapping JSON")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable not set.", flush=True)
        sys.exit(1)

    with open(args.proxy_config, 'r', encoding='utf-8') as f:
        proxy_config = json.load(f)

    generate_mapping(
        api_key=api_key,
        proxy_videos=proxy_config["proxy_videos"],
        audio_sample=proxy_config.get("audio_sample", ""),
        num_channels=proxy_config["num_channels"],
        channel_wavs=proxy_config["channel_wavs"],
        out_path=args.out,
    )


if __name__ == '__main__':
    main()

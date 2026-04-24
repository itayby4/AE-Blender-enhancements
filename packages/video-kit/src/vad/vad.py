import collections
import contextlib
import sys
import wave

import importlib

# webrtcvad depends on pkg_resources (from setuptools), which was REMOVED in setuptools v70+.
# We must ensure an older setuptools is installed before importing webrtcvad.
try:
    import pkg_resources  # noqa: F401
except (ImportError, ModuleNotFoundError):
    import subprocess
    print("Installing setuptools<70 (required by webrtcvad)...", flush=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "setuptools<70"],
                          stdout=subprocess.DEVNULL)
    importlib.invalidate_caches()

try:
    import webrtcvad
except (ImportError, ModuleNotFoundError):
    import subprocess
    print("Installing webrtcvad...", flush=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "webrtcvad"])
    importlib.invalidate_caches()
    import webrtcvad

def read_wave(path):
    """Reads a .wav file.
    Takes the path, and returns (PCM audio data, sample rate).
    """
    with contextlib.closing(wave.open(path, 'rb')) as wf:
        num_channels = wf.getnchannels()
        assert num_channels == 1, "Only mono audio is supported for VAD."
        sample_width = wf.getsampwidth()
        assert sample_width == 2, "Only 16-bit audio is supported for VAD."
        sample_rate = wf.getframerate()
        assert sample_rate in (8000, 16000, 32000, 48000), "Unsupported sample rate."
        pcm_data = wf.readframes(wf.getnframes())
        return pcm_data, sample_rate


class Frame(object):
    """Represents a "frame" of audio data."""
    def __init__(self, bytes, timestamp, duration):
        self.bytes = bytes
        self.timestamp = timestamp
        self.duration = duration


def frame_generator(frame_duration_ms, audio, sample_rate):
    """Generates audio frames from PCM audio data.
    Takes the desired frame duration in milliseconds, the PCM data, and
    the sample rate.
    Yields Frames of the requested duration.
    """
    n = int(sample_rate * (frame_duration_ms / 1000.0) * 2)
    offset = 0
    timestamp = 0.0
    duration = (float(n) / sample_rate) / 2.0
    while offset + n < len(audio):
        yield Frame(audio[offset:offset + n], timestamp, duration)
        timestamp += duration
        offset += n


def vad_collector(sample_rate, frame_duration_ms, padding_duration_ms, vad, frames):
    """Filters out non-voiced audio frames.
    Given a webrtcvad.Vad and a source of audio frames, yields blocks of
    voiced audio (with start and end timestamps). It uses a smoothed window
    to prevent stuttering.
    """
    num_padding_frames = int(padding_duration_ms / frame_duration_ms)
    # We use a deque for our sliding window/ring buffer.
    ring_buffer = collections.deque(maxlen=num_padding_frames)
    
    # We have two states: TRIGGERED and NOT TRIGGERED.
    triggered = False

    voiced_frames = []
    
    for frame in frames:
        is_speech = vad.is_speech(frame.bytes, sample_rate)
        
        sys.stdout.write('1' if is_speech else '0')
        if not triggered:
            ring_buffer.append((frame, is_speech))
            num_voiced = len([f for f, speech in ring_buffer if speech])
            # If we're NOT triggered and more than 90% of the frames in
            # the ring buffer are voiced frames, then enter the
            # TRIGGERED state.
            if num_voiced > 0.9 * ring_buffer.maxlen:
                triggered = True
                sys.stdout.write('+(%s)' % (ring_buffer[0][0].timestamp,))
                
                # We want to yield all the audio we see from now until
                # we are NOT TRIGGERED, but we have to start with the
                # audio that's already in the ring buffer.
                for f, s in ring_buffer:
                    voiced_frames.append(f)
                ring_buffer.clear()
        else:
            # We are in the TRIGGERED state, so collect the audio data
            # and add it to the ring buffer.
            voiced_frames.append(frame)
            ring_buffer.append((frame, is_speech))
            num_unvoiced = len([f for f, speech in ring_buffer if not speech])
            # If more than 90% of the frames in the ring buffer are
            # unvoiced, then enter NOT TRIGGERED and yield whatever
            # audio we've collected.
            if num_unvoiced > 0.9 * ring_buffer.maxlen:
                sys.stdout.write('-(%s)' % (frame.timestamp + frame.duration))
                triggered = False
                
                # Yield the segment
                yield {
                    "start": voiced_frames[0].timestamp,
                    "end": voiced_frames[-1].timestamp + voiced_frames[-1].duration
                }
                ring_buffer.clear()
                voiced_frames = []

    # If we have any leftover voiced audio when we run out of input,
    # yield it.
    if voiced_frames:
        yield {
            "start": voiced_frames[0].timestamp,
            "end": voiced_frames[-1].timestamp + voiced_frames[-1].duration
        }


def get_speech_intervals(wav_path: str, aggressiveness: int = 3, padding_duration_ms: int = 300) -> list[dict]:
    """
    Reads a 16kHz Mono 16-bit WAV file and returns continuous segments of speech.
    
    Args:
        wav_path: Path to the properly formatted WAV file.
        aggressiveness: VAD filtering aggressiveness (0 to 3, where 3 is most aggressive at filtering out non-speech).
        
    Returns:
        List of dictionaries with 'start' and 'end' floats in seconds.
    """
    audio, sample_rate = read_wave(wav_path)
    
    vad = webrtcvad.Vad(aggressiveness)
    
    # 30ms is optimal for WebRTC
    frames = frame_generator(30, audio, sample_rate)
    
    # We use the specified window for smoothing (default 300ms, using 2000ms for subtitle processing)
    segments = list(vad_collector(sample_rate, 30, padding_duration_ms, vad, frames))
    
    sys.stdout.write('\n') # clear buffer
    
    return segments

# For direct testing
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Test VAD isolated module")
    parser.add_argument("wav_file", help="Path to 16kHz Mono 16-bit WAV file")
    args = parser.parse_args()
    
    print(f"Running VAD on {args.wav_file}...")
    intervals = get_speech_intervals(args.wav_file, aggressiveness=3)
    print("\nSpeech Segments Detected:")
    for i, seg in enumerate(intervals):
        print(f"Segment {i+1}: {seg['start']:.2f}s - {seg['end']:.2f}s")

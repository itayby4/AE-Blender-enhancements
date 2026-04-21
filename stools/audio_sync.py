import subprocess
import os
import sys
import tempfile
import numpy as np
import wave

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

def extract_audio(media_path: str, sample_rate: int = 16000) -> str:
    """Extracts mono audio using ffmpeg to a temporary wav file."""
    # Look for bundled ffmpeg next to this script first
    script_dir = os.path.dirname(os.path.abspath(__file__))
    ffmpeg = os.path.join(script_dir, 'ffmpeg.exe')
    if not os.path.exists(ffmpeg):
        ffmpeg = 'ffmpeg'  # Fallback to system PATH

    temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name
    try:
        cmd = [
            ffmpeg, '-y',
            '-i', media_path,
            '-ac', '1',
            '-ar', str(sample_rate),
            '-f', 'wav',
            '-acodec', 'pcm_s16le', # Force 16-bit PCM for wave module
            temp_wav
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg extract failed for {media_path}:\n{result.stderr.decode()}")
        return temp_wav
    except Exception as e:
        if os.path.exists(temp_wav):
            os.remove(temp_wav)
        raise e

def read_wav_data(wav_path: str) -> np.ndarray:
    """Reads a WAV file and returns the data as a numpy array."""
    with wave.open(wav_path, 'rb') as wf:
        n_frames = wf.getnframes()
        frames = wf.readframes(n_frames)
        # Convert 16-bit PCM bytes to signed integers, then to float
        return np.frombuffer(frames, dtype=np.int16).astype(np.float32)

def fast_correlate(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Computes fast Cross-Correlation using FFT (like scipy.signal.correlate)."""
    len_a = len(a)
    len_b = len(b)
    out_len = len_a + len_b - 1
    
    # Fast FFT size (next power of 2)
    N = 2 ** int(np.ceil(np.log2(out_len)))
    
    # RFFT (real FFT) is memory efficient and much faster
    A = np.fft.rfft(a, n=N)
    B = np.fft.rfft(b[::-1], n=N) # reverse b for correlation
    
    res = np.fft.irfft(A * B, n=N)
    return res[:out_len]

def find_audio_offset(reference_file: str, target_file: str) -> float:
    """
    Finds the exact offset (in seconds) that target_file (the external mic)
    is shifted relative to the reference_file (the camera video).
    
    If positive, target starts AFTER reference. If negative, target starts BEFORE reference.
    """
    # DOWN-SAMPLING OPTIMIZATION: 
    # Using 4000Hz instead of 16000Hz drops memory by 4x and speeds up the FFT Cross-Correlation immensely,
    # while still giving us sub-millisecond precision (0.25ms is far smaller than a 25fps 40ms frame).
    sr = 4000
    print(f"[*] Extracting reference audio (camera) at {sr}Hz: {reference_file}")
    ref_wav = extract_audio(reference_file, sr)
    
    print(f"[*] Extracting target audio (external mic): {target_file}")
    tar_wav = extract_audio(target_file, sr)
    
    print(f"[*] Calculating fast FFT cross-correlation sync point (this might take a moment)...")
    try:
        ref_data = read_wav_data(ref_wav)
        tar_data = read_wav_data(tar_wav)
        
        # Normalize briefly so volume doesn't bias the FFT
        ref_data /= (np.max(np.abs(ref_data)) + 1e-8)
        tar_data /= (np.max(np.abs(tar_data)) + 1e-8)

        # Correlate
        correlation = fast_correlate(ref_data, tar_data)
        
        delay_index = np.argmax(correlation)
        # Calculate lag. 
        # When lag is positive, the target matches a segment in the right half of reference.
        lag = delay_index - (len(tar_data) - 1)
        offset_seconds = lag / sr
        
        print(f"[*] Sync found! External mic is shifted by: {offset_seconds:.3f} seconds.")
        return offset_seconds
        
    finally:
        # Cleanup temporary audio files
        if os.path.exists(ref_wav):
            os.remove(ref_wav)
        if os.path.exists(tar_wav):
            os.remove(tar_wav)

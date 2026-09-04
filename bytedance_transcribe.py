#!/usr/bin/env python3
"""
T1era Music - ByteDance Piano Transcription (standalone subprocess script)
============================================================================
Runs in an ISOLATED subprocess, the same way input_file_0.py (Basic Pitch)
does. This keeps PyTorch (used here by ByteDance's model) from ever loading
inside the same long-running Gunicorn worker process as TensorFlow (used
by Basic Pitch for the other models) - avoiding framework conflicts.

Usage:
    python bytedance_transcribe.py <input_audio_path> <output_midi_path>

Uses ByteDance's official "piano_transcription_inference" model
(High-resolution Piano Transcription with Pedals by Regressing Onset and
Offset Times - Kong et al.). This model is purpose-built for SOLO PIANO
audio only:
  - Single instrument (piano) recordings only.
  - Not multi-instrument mixes, bands, vocals, or other instruments.
It has no built-in "wrong instrument" detection - feeding it non-piano
audio will not error, it will simply produce a nonsense transcription.
That constraint is enforced at the UI level (model description / picker),
not in this script.

Install requirements (on the server, inside the t1era conda env):
    pip install piano_transcription_inference torch torchlibrosa
"""

import os
import sys

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')


def main():
    if len(sys.argv) < 3:
        print("Usage: python bytedance_transcribe.py <input_audio_path> <output_midi_path>")
        sys.exit(1)

    input_audio_path = sys.argv[1]
    output_midi_path = sys.argv[2]

    try:
        from piano_transcription_inference import PianoTranscription, sample_rate, load_audio
    except ImportError:
        print("Error: 'piano_transcription_inference' package is required.")
        print("Install via: pip install piano_transcription_inference torch torchlibrosa")
        sys.exit(1)

    try:
        import torch
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
    except ImportError:
        device = 'cpu'

    print(f"[BYTEDANCE] Memuatkan audio: {input_audio_path}")
    try:
        audio, _ = load_audio(input_audio_path, sr=sample_rate, mono=True)
    except Exception as e:
        print(f"[BYTEDANCE ERROR] Gagal memuatkan fail audio: {e}")
        sys.exit(1)

    print(f"[BYTEDANCE] Menginisialisasi model PianoTranscription pada peranti: {device}")
    try:
        transcriptor = PianoTranscription(device=device)
    except Exception as e:
        print(f"[BYTEDANCE ERROR] Gagal memuatkan model: {e}")
        sys.exit(1)

    print("[BYTEDANCE] Menjalankan transkripsi piano (onset, offset, velocity, pedal)...")
    try:
        transcriptor.transcribe(audio, output_midi_path)
    except Exception as e:
        print(f"[BYTEDANCE ERROR] Transkripsi gagal: {e}")
        sys.exit(1)

    if not os.path.exists(output_midi_path):
        print("[BYTEDANCE ERROR] Transkripsi selesai tetapi tiada fail MIDI dihasilkan.")
        sys.exit(1)

    print(f"[BYTEDANCE SUCCESS] Fail MIDI ditulis ke: {output_midi_path}")


if __name__ == "__main__":
    main()

# pyright: reportMissingImports=false
import os
import sys
import time
from pathlib import Path
# Import the free local audio-to-midi model
from basic_pitch.inference import predict  # type: ignore

# ==========================================================
# PORTABLE CONFIGURATION (CROSS-PLATFORM FALLBACKS)
# ==========================================================
# Menggunakan folder relatif "." jika pemboleh ubah persekitaran tidak ditetapkan
BASE_DIR = Path(os.environ.get("MIDI_PIPELINE_BASE_DIR", "."))
INPUT_FILE_DEFAULT = BASE_DIR / "input" / "input_audio.mp3"
OUTPUT_DIR_DEFAULT = BASE_DIR / "output"

def get_unique_output_path(directory: Path, base_name: str = "MusicgptV") -> Path:
    """
    Checks the output folder and increments the version number so
    previous conversions are not overwritten.
    """
    directory.mkdir(parents=True, exist_ok=True)
    version = 1
    while True:
        target_path = directory / f"{base_name}{version}.mid"
        if not target_path.exists():
            return target_path
        version += 1

def run_stage0(input_file_path: Path, output_file_path: Path) -> bool:
    """
    Menjalankan transkripsi audio tempatan (Basic Pitch) secara dinamik
    berdasarkan laluan fail yang dihantar oleh fail orkestrator.
    """
    if not input_file_path.exists():
        print(f"Error: Input file does not exist at: {input_file_path}")
        return False

    print(f"Target Save Path: {output_file_path}")
    print(f"Transcribing '{input_file_path.name}' locally using Spotify's Basic Pitch...")
    
    start_time = time.time()
    try:
        # Memastikan direktori output dibina terlebih dahulu
        output_file_path.parent.mkdir(parents=True, exist_ok=True)

        # Melarikan pemprosesan Spotify Basic Pitch
        # predict() mengembalikan (model_output, midi_data, note_events)
        _, midi_data, _ = predict(str(input_file_path))
        
        print("Transcription complete! Saving MIDI...")
        
        # Menyimpan fail MIDI yang dihasilkan
        midi_data.write(str(output_file_path))
        
        elapsed_time = time.time() - start_time
        print(f"Successfully saved MIDI to: {output_file_path} (Took {elapsed_time:.2f} seconds)")
        return True
        
    except Exception as e:
        print(f"An error occurred during local transcription: {e}")
        print("Please ensure 'basic-pitch' is correctly installed via pip.")
        return False

def main():
    input_file = None
    output_file = None

    # 1. Periksa jika laluan dihantar menggunakan argumen terminal (CLI)
    if len(sys.argv) > 2:
        input_file = Path(sys.argv[1])
        output_file = Path(sys.argv[2])
        print("CLI Paths Detected:")
        print(f"  Input:  {input_file}")
        print(f"  Output: {output_file}")
    else:
        # 2. Mod Ujian Tempatan: Imbas folder 'input/' secara automatik untuk sebarang fail audio
        input_dir = BASE_DIR / "input"
        audio_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.ogg'}
        audio_files = []
        
        if input_dir.exists():
            audio_files = [
                f for f in input_dir.iterdir() 
                if f.is_file() and f.suffix.lower() in audio_extensions
            ]
        
        if audio_files:
            input_file = audio_files[0]
            print(f"Auto-detected audio file in input/ folder: '{input_file.name}'")
        else:
            input_file = INPUT_FILE_DEFAULT
            print(f"No audio file found in input/ folder. Falling back to default: '{input_file}'")

        # Jana laluan output unik menggunakan sistem penomboran versi tempatan
        output_file = get_unique_output_path(OUTPUT_DIR_DEFAULT)

    # Jalankan proses transkripsi
    run_stage0(input_file, output_file)

if __name__ == "__main__":
    main()

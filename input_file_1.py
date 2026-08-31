r"""
============================================================
Stage 1 - MIDI Cleanup
============================================================

Input:
    stage0_raw.mid

Output:
    stage1_clean.mid
    stage1_log.txt

Purpose:
    Safe cleanup of raw AI-generated MIDI.

Operations:
    ✓ Sort notes
    ✓ Remove notes shorter than threshold
    ✓ Remove impossible long notes
    ✓ Remove notes outside piano range
    ✓ Remove exact duplicate notes
    ✓ Optional velocity normalization
    ✓ Generate detailed report

Author: ChatGPT
============================================================
"""

import os
import sys
from pathlib import Path
from datetime import datetime
import pretty_midi

# ==========================================================
# PORTABLE CONFIGURATION (CROSS-PLATFORM FALLBACKS)
# ==========================================================
# Menggunakan folder relatif "." jika pemboleh ubah persekitaran tidak ditetapkan
BASE_DIR = Path(os.environ.get("MIDI_PIPELINE_BASE_DIR", "."))

INPUT_MIDI_DEFAULT = BASE_DIR / "output" / "stage0_raw.mid"
OUTPUT_DIR_DEFAULT = BASE_DIR / "output"

OUTPUT_MIDI_DEFAULT = OUTPUT_DIR_DEFAULT / "stage1_clean.mid"
OUTPUT_LOG_DEFAULT = OUTPUT_DIR_DEFAULT / "stage1_log.txt"

# Nilai kawalan tetap pembersihan MIDI (Tidak disentuh)
MIN_NOTE_MS = 40
MAX_NOTE_MS = 30000

MIN_PITCH = 21      # Piano A0
MAX_PITCH = 108     # Piano C8

REMOVE_DUPLICATES = True
NORMALIZE_VELOCITY = False

TIME_EPSILON = 0.005    # 5 ms


def run_stage1(input_midi_path: Path = None, output_midi_path: Path = None, output_log_path: Path = None):
    """
    Menjalankan proses pembersihan MIDI secara dinamik berdasarkan laluan
    yang diterima daripada fail pengawal (main.py) di awan.
    """
    # Menggunakan laluan dinamik atau fallback ke laluan relatif tempatan
    input_midi = input_midi_path or INPUT_MIDI_DEFAULT
    output_midi = output_midi_path or OUTPUT_MIDI_DEFAULT
    output_log = output_log_path or OUTPUT_LOG_DEFAULT

    print("=" * 60)
    print("STAGE 1 - MIDI CLEANUP")
    print("=" * 60)

    if not input_midi.exists():
        raise FileNotFoundError(f"Input MIDI not found at: {input_midi}")

    print(f"Loading : {input_midi}")
    midi = pretty_midi.PrettyMIDI(str(input_midi))

    # ==========================================================
    # STATISTICS (LOGIK ASAL TIDAK DISENTUH)
    # ==========================================================
    original_notes = 0
    final_notes = 0

    removed_short = 0
    removed_long = 0
    removed_range = 0
    removed_duplicates = 0

    velocity_modified = 0

    lowest_pitch = 999
    highest_pitch = -999

    total_duration = 0.0
    total_velocity = 0

    # ==========================================================
    # ORIGINAL NOTE COUNT
    # ==========================================================
    for inst in midi.instruments:
        original_notes += len(inst.notes)

    # ==========================================================
    # CLEANUP (LOGIK ASAL TIDAK DISENTUH)
    # ==========================================================
    for instrument in midi.instruments:
        instrument.notes.sort(
            key=lambda n: (n.start, n.pitch)
        )

        cleaned_notes = []
        seen = []

        for note in instrument.notes:
            duration_ms = (note.end - note.start) * 1000

            # Remove short notes
            if duration_ms < MIN_NOTE_MS:
                removed_short += 1
                continue

            # Remove impossible long notes
            if duration_ms > MAX_NOTE_MS:
                removed_long += 1
                continue

            # Piano range
            if note.pitch < MIN_PITCH or note.pitch > MAX_PITCH:
                removed_range += 1
                continue

            # Duplicate detection
            duplicate = False
            if REMOVE_DUPLICATES:
                for old in seen:
                    if (
                        old.pitch == note.pitch
                        and abs(old.start - note.start) < TIME_EPSILON
                        and abs(old.end - note.end) < TIME_EPSILON
                    ):
                        duplicate = True
                        break

                if duplicate:
                    removed_duplicates += 1
                    continue

                seen.append(note)

            # Velocity normalization
            if NORMALIZE_VELOCITY:
                old_vel = note.velocity
                if note.velocity < 40:
                    note.velocity = 40
                elif note.velocity > 110:
                    note.velocity = 110
                if old_vel != note.velocity:
                    velocity_modified += 1

            cleaned_notes.append(note)

            lowest_pitch = min(lowest_pitch, note.pitch)
            highest_pitch = max(highest_pitch, note.pitch)

            total_duration += duration_ms
            total_velocity += note.velocity

        instrument.notes = cleaned_notes

    # ==========================================================
    # FINAL STATISTICS
    # ==========================================================
    for inst in midi.instruments:
        final_notes += len(inst.notes)

    removed_total = original_notes - final_notes

    if final_notes > 0:
        average_duration = total_duration / final_notes
        average_velocity = total_velocity / final_notes
    else:
        average_duration = 0
        average_velocity = 0

    # Memastikan folder output dibina
    output_midi.parent.mkdir(parents=True, exist_ok=True)
    midi.write(str(output_midi))

    # ==========================================================
    # WRITE LOG (LOGIK ASAL TIDAK DISENTUH)
    # ==========================================================
    with open(output_log, "w", encoding="utf-8") as log:
        log.write("=" * 70 + "\n")
        log.write("STAGE 1 MIDI CLEANUP REPORT\n")
        log.write("=" * 70 + "\n\n")

        log.write(f"Generated : {datetime.now()}\n\n")
        log.write(f"Input MIDI : {input_midi}\n")
        log.write(f"Output MIDI: {output_midi}\n\n")

        log.write("GENERAL\n")
        log.write("-" * 70 + "\n")
        log.write(f"Original Notes : {original_notes}\n")
        log.write(f"Final Notes    : {final_notes}\n")
        log.write(f"Removed Notes  : {removed_total}\n")

        if original_notes:
            reduction = removed_total / original_notes * 100
        else:
            reduction = 0

        log.write(f"Reduction      : {reduction:.2f}%\n\n")

        log.write("REMOVAL BREAKDOWN\n")
        log.write("-" * 70 + "\n")
        log.write(f"Short Notes Removed      : {removed_short}\n")
        log.write(f"Long Notes Removed       : {removed_long}\n")
        log.write(f"Out-of-Range Removed     : {removed_range}\n")
        log.write(f"Duplicate Notes Removed  : {removed_duplicates}\n")
        log.write(f"Velocity Modified        : {velocity_modified}\n\n")

        log.write("MIDI STATISTICS\n")
        log.write("-" * 70 + "\n")
        log.write(f"Lowest Pitch     : {lowest_pitch}\n")
        log.write(f"Highest Pitch    : {highest_pitch}\n")
        log.write(f"Average Duration : {average_duration:.2f} ms\n")
        log.write(f"Average Velocity : {average_velocity:.2f}\n")

    # ==========================================================
    # CONSOLE OUTPUT (LOGIK ASAL TIDAK DISENTUH)
    # ==========================================================
    print()
    print("=" * 60)
    print("STAGE 1 COMPLETE")
    print("=" * 60)

    print(f"Original Notes : {original_notes}")
    print(f"Final Notes    : {final_notes}")
    print(f"Removed        : {removed_total}")

    if original_notes:
        print(f"Reduction      : {removed_total / original_notes * 100:.2f}%")

    print()
    print("Breakdown")
    print("-" * 30)
    print(f"Short Notes    : {removed_short}")
    print(f"Long Notes     : {removed_long}")
    print(f"Out of Range   : {removed_range}")
    print(f"Duplicates     : {removed_duplicates}")
    print(f"Velocity Edit  : {velocity_modified}")

    print()
    print("Statistics")
    print("-" * 30)
    print(f"Lowest Pitch   : {lowest_pitch}")
    print(f"Highest Pitch  : {highest_pitch}")
    print(f"Avg Duration   : {average_duration:.2f} ms")
    print(f"Avg Velocity   : {average_velocity:.2f}")

    print()
    print(f"Saved MIDI : {output_midi}")
    print(f"Saved Log  : {output_log}")
    print("=" * 60)


def main():
    # Mengendalikan hantaran CLI tempatan pilihan
    if len(sys.argv) > 3:
        input_p = Path(sys.argv[1])
        output_p = Path(sys.argv[2])
        log_p = Path(sys.argv[3])
        run_stage1(input_p, output_p, log_p)
    else:
        run_stage1()


if __name__ == "__main__":
    main()

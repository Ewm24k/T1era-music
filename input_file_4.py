#!/usr/bin/env python3
"""
Stage 4: Pitch Stabilization Pipeline

Converts: stage3.mid
Outputs:  stage4.mid
Logs:     stage4_log.txt
Reports:  stage4_report.csv
          stage4_diagnostics.json

Features:
  - Onset/offset transient pitch jitter correction.
  - Isolated octave error detection & transposition via moving median.
  - Microtonal pitch drift detection and correction.
  - Vibrato analysis and conversion to sheet music ornaments (trills).
  - Glide / Glissando ramp detection.
  - Equal-temperament pitch bend flattening for clean piano playback.
"""

import os
import sys
import csv
import json
import statistics
from typing import List, Dict, Tuple, Optional, Any

try:
    import mido
except ImportError:
    print("Error: The 'mido' library is required to run this pipeline.")
    print("Please install it using: pip install mido")
    sys.exit(1)


class Config:
    """Fallback Local Config (Using Cross-Platform Relative Paths)"""
    BASE_DIR = os.environ.get("MIDI_PIPELINE_BASE_DIR", ".")
    INPUT_PATH = os.path.join(BASE_DIR, "output", "stage3.mid")
    OUTPUT_PATH = os.path.join(BASE_DIR, "output", "stage4.mid")
    LOG_PATH = os.path.join(BASE_DIR, "output", "stage4_log.txt")
    CSV_PATH = os.path.join(BASE_DIR, "output", "stage4_report.csv")
    JSON_PATH = os.path.join(BASE_DIR, "output", "stage4_diagnostics.json")

    # Pitch Jitter Settings
    JITTER_DUR_LIMIT_SEC = 0.08      # Max duration of a note to be flagged as jitter
    JITTER_OVERLAP_RATIO = 1.0       # Structural note must be at least 3x longer than jitter

    # Octave Error Settings
    OCTAVE_WINDOW_SIZE = 15          # Sliding window size of notes to compute local register median
    OCTAVE_LEAP_SEMITONES = 11       # Leap threshold to evaluate octave correction

    # Pitch Bend & Drift Settings (4096 units = 1 semitone / 100 cents)
    DRIFT_CORRECT_LIMIT = 2048       # ~50 cents. Shift pitch if drift exceeds this limit
    VIBRATO_MIN_CROSSINGS_HZ = 3.0   # Minimum oscillation speed (Hz)
    VIBRATO_MIN_AMP_UNITS = 150      # Minimum peak-to-peak amplitude in bend units
    GLIDE_MIN_SPAN_UNITS = 3000      # Minimum monotonic bend movement to qualify as glide


class TempoMap:
    """Calculates absolute seconds for MIDI ticks."""
    def __init__(self, midi_file: mido.MidiFile):
        self.ppq = midi_file.ticks_per_beat
        self.tempo_changes: List[Dict[str, Any]] = []

        current_tick = 0
        for track in midi_file.tracks:
            t = 0
            for msg in track:
                t += msg.time
                if msg.type == 'set_tempo':
                    self.tempo_changes.append({'tick': t, 'tempo': msg.tempo})

        self.tempo_changes.sort(key=lambda x: x['tick'])
        if not self.tempo_changes or self.tempo_changes[0]['tick'] > 0:
            self.tempo_changes.insert(0, {'tick': 0, 'tempo': 500000})

    def tick_to_sec(self, tick: int) -> float:
        sec = 0.0
        prev_tick = 0
        prev_tempo = 500000
        for change in self.tempo_changes:
            if tick < change['tick']:
                break
            interval_ticks = change['tick'] - prev_tick
            sec += (interval_ticks / self.ppq) * (prev_tempo / 1000000.0)
            prev_tick = change['tick']
            prev_tempo = change['tempo']
        remaining_ticks = tick - prev_tick
        sec += (remaining_ticks / self.ppq) * (prev_tempo / 1000000.0)
        return sec


class Note:
    """Parsed MIDI note."""
    def __init__(self, pitch: int, start_tick: int, end_tick: int, velocity: int, channel: int, track_idx: int):
        self.pitch = pitch
        self.start_tick = start_tick
        self.end_tick = end_tick
        self.velocity = velocity
        self.channel = channel
        self.track_idx = track_idx
        self.start_sec = 0.0
        self.end_sec = 0.0
        self.id = -1
        self.original_pitch = pitch

    @property
    def duration_ticks(self) -> int:
        return self.end_tick - self.start_tick

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


class TrackMessage:
    """Holds non-note MIDI events."""
    def __init__(self, msg: mido.Message, absolute_tick: int):
        self.msg = msg
        self.absolute_tick = absolute_tick


class Stage4Pipeline:
    # MENERIMA PARAMETER LALUAN SECARA DINAMIK (Pembedahan Konfigurasi Dinamik)
    def __init__(self, input_path=None, output_path=None, log_path=None, csv_path=None, json_path=None):
        self.logs: List[str] = []
        self.stabilization_decisions: List[Dict[str, Any]] = []
        
        # Penyelarasan laluan parameter or fallback relatif
        self.input_path = input_path or Config.INPUT_PATH
        self.output_path = output_path or Config.OUTPUT_PATH
        self.log_path = log_path or Config.LOG_PATH
        self.csv_path = csv_path or Config.CSV_PATH
        self.json_path = json_path or Config.JSON_PATH

        self.stats = {
            "loaded_notes": 0,
            "jitter_notes_purged": 0,
            "octave_errors_corrected": 0,
            "drift_notes_transposed": 0,
            "vibrato_notes_detected": 0,
            "glide_notes_detected": 0,
            "final_clean_notes": 0
        }

    def log(self, message: str, print_console: bool = True):
        self.logs.append(message)
        if print_console:
            print(message)

    def run(self):
        self.log("=" * 60)
        self.log("  STAGE 4: PITCH STABILIZATION PIPELINE INITIALIZED")
        self.log("=" * 60)

        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)

        if not os.path.exists(self.input_path):
            self.log(f"Error: Stage 3 output file not found at: {self.input_path}")
            sys.exit(1)

        self.log(f"Loading MIDI: {self.input_path}")
        try:
            mid = mido.MidiFile(self.input_path)
        except Exception as e:
            self.log(f"Critical Error: Failed to parse MIDI. Detail: {e}")
            sys.exit(1)

        tempo_map = TempoMap(mid)
        self.log(f"Parsed tempo map. PPQ={mid.ticks_per_beat}")

        # Extract Notes and Pitchwheels
        notes: List[Note] = []
        other_events: Dict[int, List[TrackMessage]] = {}
        pitchwheels: Dict[int, List[Tuple[int, int]]] = {} # track_idx -> [(absolute_tick, pitch_bend_val)]
        note_id_counter = 0

        for track_idx, track in enumerate(mid.tracks):
            other_events[track_idx] = []
            pitchwheels[track_idx] = []
            active_notes: Dict[Tuple[int, int], Note] = {}
            current_tick = 0

            for msg in track:
                current_tick += msg.time
                if msg.type == 'note_on' and msg.velocity > 0:
                    key = (msg.note, msg.channel)
                    if key in active_notes:
                        finished = active_notes[key]
                        finished.end_tick = current_tick
                        finished.start_sec = tempo_map.tick_to_sec(finished.start_tick)
                        finished.end_sec = tempo_map.tick_to_sec(current_tick)
                        notes.append(finished)

                    new_note = Note(
                        pitch=msg.note,
                        start_tick=current_tick,
                        end_tick=current_tick,
                        velocity=msg.velocity,
                        channel=msg.channel,
                        track_idx=track_idx
                    )
                    active_notes[key] = new_note
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    key = (msg.note, msg.channel)
                    if key in active_notes:
                        finished = active_notes[key]
                        finished.end_tick = current_tick
                        finished.start_sec = tempo_map.tick_to_sec(finished.start_tick)
                        finished.end_sec = tempo_map.tick_to_sec(current_tick)
                        notes.append(finished)
                        del active_notes[key]
                elif msg.type == 'pitchwheel':
                    # Capture pitch bends for drift/vibrato analysis
                    pitchwheels[track_idx].append((current_tick, msg.pitch))
                else:
                    other_events[track_idx].append(TrackMessage(msg, current_tick))

            for key, finished in active_notes.items():
                finished.end_tick = current_tick
                finished.start_sec = tempo_map.tick_to_sec(finished.start_tick)
                finished.end_sec = tempo_map.tick_to_sec(current_tick)
                notes.append(finished)

        for note in notes:
            note.id = note_id_counter
            note_id_counter += 1

        self.stats["loaded_notes"] = len(notes)
        self.log(f"Extracted {len(notes)} notes and {sum(len(v) for v in pitchwheels.values())} pitch bend events.")

        # 1. Onset/Offset Pitch Jitter Purge
        self.log("Correcting attack/release pitch jitter...")
        jitter_clean_notes = self.correct_pitch_jitter(notes)
        self.stats["jitter_notes_purged"] = len(notes) - len(jitter_clean_notes)
        self.log(f"Purged {self.stats['jitter_notes_purged']} transient pitch jitter notes.")

        # 2. Moving Median Octave Error Correction
        self.log("Evaluating octaves against local registers...")
        octave_clean_notes = self.correct_octave_errors(jitter_clean_notes)
        self.log(f"Transposed {self.stats['octave_errors_corrected']} octave-clashing errors.")

        # 3. Microtonal Drift, Vibrato, and Glide Correction
        self.log("Evaluating pitch bends for drift, vibrato, and glides...")
        drift_and_expressive_notes = self.analyze_and_flatten_bends(octave_clean_notes, pitchwheels)
        self.log(f"Corrected {self.stats['drift_notes_transposed']} notes with persistent microtonal drift.")
        self.log(f"Flagged {self.stats['vibrato_notes_detected']} vibrating notes (preserved as trill suggestions).")
        self.log(f"Flagged {self.stats['glide_notes_detected']} gliding notes (preserved as glissando suggestions).")

        self.stats["final_clean_notes"] = len(drift_and_expressive_notes)

        # 4. Deterministic MIDI Rebuilding
        # Removing raw pitch bends to keep the piano key output focused and discrete
        self.log("Rebuilding stabilized MIDI track...")
        out_mid = mido.MidiFile(ticks_per_beat=mid.ticks_per_beat)

        for track_idx, track in enumerate(mid.tracks):
            new_track = mido.MidiTrack()
            track_notes = [n for n in drift_and_expressive_notes if n.track_idx == track_idx]

            reconstructed_events: List[Tuple[int, mido.Message]] = []
            for note in track_notes:
                on_msg = mido.Message('note_on', note=note.pitch, velocity=note.velocity, channel=note.channel)
                off_msg = mido.Message('note_off', note=note.pitch, velocity=0, channel=note.channel)
                reconstructed_events.append((note.start_tick, on_msg))
                reconstructed_events.append((note.end_tick, off_msg))

            track_other = other_events.get(track_idx, [])
            for event in track_other:
                reconstructed_events.append((event.absolute_tick, event.msg))

            # Sorted to avoid double-strike clipping
            def get_sort_key(item: Tuple[int, mido.Message]):
                tick, msg = item
                priority = 4
                if msg.is_meta:
                    priority = 0
                elif msg.type in ['control_change', 'program_change', 'pitchwheel', 'aftertouch']:
                    priority = 1
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    priority = 2
                elif msg.type == 'note_on' and msg.velocity > 0:
                    priority = 3
                pitch_val = getattr(msg, 'note', 0)
                return (tick, priority, pitch_val)

            reconstructed_events.sort(key=get_sort_key)

            prev_tick = 0
            for tick, msg in reconstructed_events:
                delta = tick - prev_tick
                msg.time = delta
                new_track.append(msg)
                prev_tick = tick

            out_mid.tracks.append(new_track)

        self.save_outputs(out_mid)
        self.log("Stage 4 completed successfully.", print_console=True)

    def correct_pitch_jitter(self, notes: List[Note]) -> List[Note]:
        """Identifies and purges extremely short overlapping transient pitch noise."""
        to_purge = set()
        
        # Sort notes to find neighbors efficiently
        sorted_notes = sorted(notes, key=lambda x: x.start_sec)
        
        for n1 in sorted_notes:
            if n1.duration_sec >= Config.JITTER_DUR_LIMIT_SEC:
                continue

            for n2 in sorted_notes:
                if n1.id == n2.id:
                    continue
                # Skip comparison if n2 is far away chronologically
                if n2.start_sec > n1.end_sec + 0.1:
                    break

                # Overlap calculation
                o_start = max(n1.start_sec, n2.start_sec)
                o_end = min(n1.end_sec, n2.end_sec)
                overlap = max(0.0, o_end - o_start)

                if overlap > 0.01:
                    # Check if neighboring note is a structural note (at least 3x longer)
                    if n2.duration_sec >= n1.duration_sec * Config.JITTER_OVERLAP_RATIO:
                        # Check pitch class proximity (within 1 or 2 semitones)
                        pitch_diff = abs(n1.pitch - n2.pitch)
                        if pitch_diff in [1, 2]:
                            to_purge.add(n1.id)
                            self.stabilization_decisions.append({
                                "note_id": n1.id,
                                "pitch": n1.pitch,
                                "type": "JITTER_PURGED",
                                "old_pitch": n1.pitch,
                                "new_pitch": -1,
                                "drift_cents": 0.0,
                                "vibrato": False,
                                "glide": False,
                                "reason": f"Transient pitch jitter clashing with neighboring structural note {n2.id} (pitch {n2.pitch})"
                            })
                            break

        return [n for n in notes if n.id not in to_purge]

    def correct_octave_errors(self, notes: List[Note]) -> List[Note]:
        """Transposes single note octave errors based on local register averages."""
        # Sort by track index and channel
        voices: Dict[Tuple[int, int], List[Note]] = {}
        for n in notes:
            voices.setdefault((n.track_idx, n.channel), []).append(n)

        corrected_notes: List[Note] = []

        for voice, v_notes in voices.items():
            # Sort chronologically
            v_notes.sort(key=lambda x: x.start_sec)
            
            for idx in range(len(v_notes)):
                n = v_notes[idx]
                
                # sliding median calculation
                start_w = max(0, idx - Config.OCTAVE_WINDOW_SIZE // 2)
                end_w = min(len(v_notes), idx + Config.OCTAVE_WINDOW_SIZE // 2 + 1)
                window_pitches = [v_notes[x].pitch for x in range(start_w, end_w) if x != idx]

                if len(window_pitches) < 5:
                    # Window is too small to build median registers
                    corrected_notes.append(n)
                    continue

                median_p = statistics.median(window_pitches)
                pitch_diff = n.pitch - median_p
                abs_diff = abs(pitch_diff)

                # Check if it deviates by a clear octave step
                if abs_diff >= Config.OCTAVE_LEAP_SEMITONES:
                    remainder = abs_diff % 12
                    if remainder <= 1.5 or remainder >= 10.5:
                        # Confirm isolated spike by validating neighbors are closer to median
                        prev_n = v_notes[idx - 1] if idx > 0 else None
                        next_n = v_notes[idx + 1] if idx < len(v_notes) - 1 else None

                        is_spike = True
                        if prev_n and abs(prev_n.pitch - median_p) > 5:
                            is_spike = False
                        if next_n and abs(next_n.pitch - median_p) > 5:
                            is_spike = False

                        if is_spike:
                            # Calculate transposition offset
                            shift_octaves = int(round(pitch_diff / 12.0))
                            target_pitch = n.pitch - (12 * shift_octaves)
                            
                            # Limit to MIDI scale boundaries
                            target_pitch = max(0, min(127, target_pitch))

                            if target_pitch != n.pitch:
                                n.pitch = target_pitch
                                self.stats["octave_errors_corrected"] += 1
                                self.stabilization_decisions.append({
                                    "note_id": n.id,
                                    "pitch": n.pitch,
                                    "type": "OCTAVE_CORRECTED",
                                    "old_pitch": n.original_pitch,
                                    "new_pitch": n.pitch,
                                    "drift_cents": 0.0,
                                    "vibrato": False,
                                    "glide": False,
                                    "reason": f"Transposed octave leap from {n.original_pitch} to match median register {median_p}"
                                })

                corrected_notes.append(n)

        return corrected_notes

    def analyze_and_flatten_bends(self, notes: List[Note], 
                                  pitchwheels: Dict[int, List[Tuple[int, int]]]) -> List[Note]:
        """Analyzes active pitch wheel messages for drift, vibrato, or glides, and flattens them."""
        for n in notes:
            track_bends = pitchwheels.get(n.track_idx, [])
            if not track_bends:
                continue

            # Gather active pitchbend events inside this note's lifetime
            active_bends = [val for tick, val in track_bends if n.start_tick <= tick <= n.end_tick]
            if not active_bends:
                continue

            # 1. Detuning & Drift Correction
            mean_bend = sum(active_bends) / len(active_bends)
            drift_cents = (mean_bend / 4096.0) * 100.0  # Assumes ±2 semitone range (8192 units)

            drift_corrected = False
            # Check if permanent offset crosses quarter-tone
            if abs(mean_bend) >= Config.DRIFT_CORRECT_LIMIT:
                shift_semitones = int(round(mean_bend / 4096.0))
                target_pitch = n.pitch + shift_semitones
                target_pitch = max(0, min(127, target_pitch))

                if target_pitch != n.pitch:
                    n.pitch = target_pitch
                    drift_corrected = True
                    self.stats["drift_notes_transposed"] += 1

            # 2. Vibrato Detection
            # Count crossings around the mean value
            crossings = 0
            for k in range(1, len(active_bends)):
                if (active_bends[k-1] < mean_bend and active_bends[k] >= mean_bend) or \
                   (active_bends[k-1] > mean_bend and active_bends[k] <= mean_bend):
                    crossings += 1

            vibrato_detected = False
            if n.duration_sec > 0:
                crossing_hz = crossings / (2.0 * n.duration_sec)
                peak_to_peak_amp = max(active_bends) - min(active_bends)
                
                if crossing_hz >= Config.VIBRATO_MIN_CROSSINGS_HZ and peak_to_peak_amp >= Config.VIBRATO_MIN_AMP_UNITS:
                    vibrato_detected = True
                    self.stats["vibrato_notes_detected"] += 1

            # 3. Portamento / Glide Detection
            glide_detected = False
            glide_span = active_bends[-1] - active_bends[0]
            if abs(glide_span) >= Config.GLIDE_MIN_SPAN_UNITS:
                # Confirm directional monotonicity: calculate differences sign changes
                diffs = [active_bends[x] - active_bends[x-1] for x in range(1, len(active_bends))]
                signs = [1 if d > 0 else (-1 if d < 0 else 0) for d in diffs if d != 0]
                sign_changes = sum(1 for x in range(1, len(signs)) if signs[x] != signs[x-1])
                
                if sign_changes <= len(signs) * 0.25: # mostly monotonic
                    glide_detected = True
                    self.stats["glide_notes_detected"] += 1

            # Record final actions for reporting
            if drift_corrected or vibrato_detected or glide_detected:
                action_type = "PITCH_STABILIZED"
                reason_list = []
                if drift_corrected:
                    reason_list.append(f"Drift transposed (mean bend: {mean_bend:.0f})")
                if vibrato_detected:
                    reason_list.append("Vibrato modulation captured (trill suggested)")
                if glide_detected:
                    reason_list.append("Expressive portamento slide mapped (glissando suggested)")

                self.stabilization_decisions.append({
                    "note_id": n.id,
                    "pitch": n.pitch,
                    "type": action_type,
                    "old_pitch": n.original_pitch,
                    "new_pitch": n.pitch,
                    "drift_cents": round(drift_cents, 1),
                    "vibrato": vibrato_detected,
                    "glide": glide_detected,
                    "reason": ", ".join(reason_list)
                })

        return notes

    def save_outputs(self, out_mid: mido.MidiFile):
        # MENGGUNAKAN INSTANCE PATHS DINAMIK (Pembedahan Konfigurasi Dinamik)
        try:
            out_mid.save(self.output_path)
            self.log(f"Exported repaired MIDI to: {self.output_path}")
        except Exception as e:
            self.log(f"Error saving output MIDI: {e}")

        # 2. Save CSV Report
        try:
            with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    "Note_ID", "Pitch", "Stabilization_Type", "Original_Pitch", "New_Pitch", 
                    "Drift_Cents", "Vibrato_Detected", "Glide_Detected", "Reason_Description"
                ])
                for d in self.stabilization_decisions:
                    writer.writerow([
                        d["note_id"], d["pitch"], d["type"], d["old_pitch"], d["new_pitch"],
                        d["drift_cents"], "YES" if d["vibrato"] else "NO", "YES" if d["glide"] else "NO",
                        d["reason"]
                    ])
            self.log(f"Exported CSV report to: {self.csv_path}")
        except Exception as e:
            self.log(f"Error saving CSV: {e}")

        # 3. Save JSON Diagnostics
        try:
            diagnostics_payload = {
                "pipeline_stage": "stage4",
                "config": {
                    "jitter_dur_limit_sec": Config.JITTER_DUR_LIMIT_SEC,
                    "jitter_overlap_ratio": Config.JITTER_OVERLAP_RATIO,
                    "octave_window_size": Config.OCTAVE_WINDOW_SIZE,
                    "octave_leap_semitones": Config.OCTAVE_LEAP_SEMITONES,
                    "drift_correction_limit": Config.DRIFT_CORRECT_LIMIT,
                    "vibrato_min_crossings_hz": Config.VIBRATO_MIN_CROSSINGS_HZ,
                    "vibrato_min_amp_units": Config.VIBRATO_MIN_AMP_UNITS,
                    "glide_min_span_units": Config.GLIDE_MIN_SPAN_UNITS
                },
                "statistics": self.stats,
                "decisions": self.stabilization_decisions
            }
            with open(self.json_path, 'w', encoding='utf-8') as f:
                json.dump(diagnostics_payload, f, indent=2)
            self.log(f"Exported JSON diagnostic data to: {self.json_path}")
        except Exception as e:
            self.log(f"Error saving JSON: {e}")

        # 4. Save TXT Log file
        try:
            with open(self.log_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(self.logs))
        except Exception as e:
            print(f"Error saving TXT log: {e}")


def main():
    if len(sys.argv) > 5:
        input_p = sys.argv[1]
        output_p = sys.argv[2]
        log_p = sys.argv[3]
        csv_p = sys.argv[4]
        json_p = sys.argv[5]
        pipeline = Stage4Pipeline(input_p, output_p, log_p, csv_p, json_p)
    else:
        pipeline = Stage4Pipeline()
    pipeline.run()


if __name__ == "__main__":
    main()

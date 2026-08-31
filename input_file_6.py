#!/usr/bin/env python3
"""
Stage 5: Adaptive Musical Quantization Pipeline

Converts: stage4.mid
Outputs:  stage5.mid
Logs:     stage5_log.txt
Reports:  stage5_report.csv
          stage5_diagnostics.json

Features:
  - Onset-autocorrelation local tempo extraction (50-180 BPM range).
  - Dynamic beat-grid tracking (tracks rubato and expressive stretch).
  - Beat-by-beat triplet and swing classification.
  - Metrical timeline warping (perfect notation grids + expressive playback).
  - Safe post-quantization overlap and hang protection.
"""

import os
import sys
import csv
import json
import math
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
    INPUT_PATH = os.path.join(BASE_DIR, "output", "stage4.mid")
    OUTPUT_PATH = os.path.join(BASE_DIR, "output", "stage5.mid")
    LOG_PATH = os.path.join(BASE_DIR, "output", "stage5_log.txt")
    CSV_PATH = os.path.join(BASE_DIR, "output", "stage5_report.csv")
    JSON_PATH = os.path.join(BASE_DIR, "output", "stage5_diagnostics.json")

    # Local Tempo Analysis Settings
    MIN_TEMPO_BPM = 600.0
    MAX_TEMPO_BPM = 120.0
    TEMPO_WINDOW_SEC = 3.0           # Size of sliding window to analyze local tempo
    TEMPO_STEP_SEC = 1.0             # Step size of the local tempo sweep

    # Swing and Triplet Grid Boundaries
    SWING_RATIO_MIN = 0.58           # Lower bound of swing phase delay (nominal 0.66)
    SWING_RATIO_MAX = 0.70           # Upper bound of swing phase delay
    TRIPLET_TOLERANCE = 0.02         # Deviation allowed to snap to a triplet subdivision (0.33, 0.67)


class Note:
    """Structure for a MIDI note being quantized."""
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
        
        # Output Quantized Metrical Ticks
        self.quant_start_tick = 0
        self.quant_end_tick = 0
        self.feel_detected = "straight"

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


class TrackMessage:
    """Non-note MIDI message holder with absolute tick positions."""
    def __init__(self, msg: mido.Message, absolute_tick: int):
        self.msg = msg
        self.absolute_tick = absolute_tick


class TempoMap:
    """Initial parsing of absolute seconds for incoming MIDI files."""
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


class Stage5Pipeline:
    # MENERIMA PARAMETER LALUAN SECARA DINAMIK (Pembedahan Konfigurasi Dinamik)
    def __init__(self, input_path=None, output_path=None, log_path=None, csv_path=None, json_path=None):
        self.logs: List[str] = []
        self.quant_report: List[Dict[str, Any]] = []
        
        # Penyelarasan laluan parameter or fallback relatif
        self.input_path = input_path or Config.INPUT_PATH
        self.output_path = output_path or Config.OUTPUT_PATH
        self.log_path = log_path or Config.LOG_PATH
        self.csv_path = csv_path or Config.CSV_PATH
        self.json_path = json_path or Config.JSON_PATH

        self.stats = {
            "loaded_notes": 0,
            "estimated_global_tempo_bpm": 120.0,
            "swing_beats_detected": 0,
            "triplet_beats_detected": 0,
            "total_quantized_notes": 0
        }

    def log(self, message: str, print_console: bool = True):
        self.logs.append(message)
        if print_console:
            print(message)

    def run(self):
        self.log("=" * 60)
        self.log("  STAGE 5: ADAPTIVE QUANTIZATION PIPELINE INITIALIZED")
        self.log("=" * 60)

        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)

        if not os.path.exists(self.input_path):
            self.log(f"Error: Stage 4 output file not found at: {self.input_path}")
            sys.exit(1)

        self.log(f"Loading MIDI: {self.input_path}")
        try:
            mid = mido.MidiFile(self.input_path)
        except Exception as e:
            self.log(f"Critical Error: Failed to parse MIDI. Detail: {e}")
            sys.exit(1)

        tempo_map = TempoMap(mid)
        ppq = mid.ticks_per_beat
        self.log(f"File timing: PPQ={ppq}")

        # Parse Notes
        notes: List[Note] = []
        other_events: Dict[int, List[TrackMessage]] = {}
        note_id_counter = 0

        for track_idx, track in enumerate(mid.tracks):
            other_events[track_idx] = []
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
                else:
                    if msg.type != 'set_tempo': # We will generate our own dynamic tempo track
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
        if len(notes) == 0:
            self.log("Empty MIDI file loaded. Exiting.")
            sys.exit(0)

        # 1. Sweep and Build Adaptive Tempo Curve B(t)
        self.log("Estimating local tempo trajectory via onset autocorrelation...")
        tempo_curve = self.estimate_local_tempo_curve(notes)
        
        # Calculate nominal global tempo as the median of the curve
        global_tempo = statistics.median([b for t, b in tempo_curve])
        self.stats["estimated_global_tempo_bpm"] = round(global_tempo, 1)
        self.log(f"Calculated overall global median tempo: {global_tempo:.1f} BPM.")

        # Helper to lookup tempo curve at a given absolute second
        def get_tempo_at(sec: float) -> float:
            for t_val, bpm_val in reversed(tempo_curve):
                if sec >= t_val:
                    return bpm_val
            return tempo_curve[0][1]

        # 2. Build the Adaptive Beat Grid
        self.log("Synthesizing dynamic beat-grid...")
        first_onset = min(n.start_sec for n in notes)
        last_offset = max(n.end_sec for n in notes)

        beat_times: List[float] = [first_onset]
        while beat_times[-1] < last_offset + 5.0:
            curr_t = beat_times[-1]
            local_bpm = get_tempo_at(curr_t)
            beat_duration = 60.0 / local_bpm
            beat_times.append(curr_t + beat_duration)

        self.log(f"Synthesized beat grid with {len(beat_times)} beats aligned to performance stretch.")

        # 3. Dynamic Quantization
        self.log("Performing metrical timeline warping...")
        self.quantize_performance(notes, beat_times, get_tempo_at, ppq)

        # 4. Safe post-quantization check to avoid overlapping notes of the same pitch
        self.log("Validating and correcting overlap clashes...")
        notes.sort(key=lambda x: x.quant_start_tick)
        for i in range(len(notes)):
            n1 = notes[i]
            for j in range(i + 1, len(notes)):
                n2 = notes[j]
                if n2.quant_start_tick >= n1.quant_end_tick:
                    break
                if n1.pitch == n2.pitch and n1.channel == n2.channel and n1.track_idx == n2.track_idx:
                    # Snip end of first note to prevent overlaps
                    n1.quant_end_tick = max(n1.quant_start_tick + int(ppq * 0.25), n2.quant_start_tick)

        # 5. Output MIDI Construction
        out_mid = mido.MidiFile(ticks_per_beat=ppq)

        # Track 0: Pure Tempo and Meta Track
        track0 = mido.MidiTrack()
        # Insert dynamic tempo changes at every quantized beat to preserve original performance expressivity
        prev_tick = 0
        for idx, b_time in enumerate(beat_times[:-1]):
            bpm_val = get_tempo_at(b_time)
            tempo_us = int(round(60000000.0 / bpm_val))
            nominal_tick = idx * ppq
            
            # set_tempo event (Using MetaMessage instead of Message)
            delta = nominal_tick - prev_tick
            track0.append(mido.MetaMessage('set_tempo', tempo=tempo_us, time=delta))
            prev_tick = nominal_tick
        out_mid.tracks.append(track0)

        # Note Tracks
        for track_idx, track in enumerate(mid.tracks):
            new_track = mido.MidiTrack()
            track_notes = [n for n in notes if n.track_idx == track_idx]

            reconstructed_events: List[Tuple[int, mido.Message]] = []
            for note in track_notes:
                on_msg = mido.Message('note_on', note=note.pitch, velocity=note.velocity, channel=note.channel)
                off_msg = mido.Message('note_off', note=note.pitch, velocity=0, channel=note.channel)
                reconstructed_events.append((note.quant_start_tick, on_msg))
                reconstructed_events.append((note.quant_end_tick, off_msg))

            # Non-note events are mapped to the beat times
            track_other = other_events.get(track_idx, [])
            for event in track_other:
                # Map old absolute time in seconds to our warped metrical grid
                # Find nearest beat
                old_sec = tempo_map.tick_to_sec(event.absolute_tick)
                warped_tick = self.sec_to_warped_tick(old_sec, beat_times, ppq)
                reconstructed_events.append((warped_tick, event.msg))

            # Event sorting
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
        self.log("Stage 5 completed successfully.", print_console=True)

    def estimate_local_tempo_curve(self, notes: List[Note]) -> List[Tuple[float, float]]:
        """Calculates a series of time-stamped tempo values using onset optimization."""
        onsets = sorted(list(set(n.start_sec for n in notes)))
        if len(onsets) < 3:
            return [(0.0, 120.0)]

        max_sec = max(onsets)
        tempo_curve: List[Tuple[float, float]] = []

        curr_sec = 0.0
        while curr_sec <= max_sec:
            # Capture local onsets inside sliding window
            w_start = curr_sec - (Config.TEMPO_WINDOW_SEC / 2.0)
            w_end = curr_sec + (Config.TEMPO_WINDOW_SEC / 2.0)
            local_onsets = [o for o in onsets if w_start <= o <= w_end]

            if len(local_onsets) < 3:
                # Not enough data, inherit previous tempo
                prev_bpm = tempo_curve[-1][1] if tempo_curve else 120.0
                tempo_curve.append((curr_sec, prev_bpm))
                curr_sec += Config.TEMPO_STEP_SEC
                continue

            # Core grid search optimization
            best_bpm = 120.0
            min_phase_error = float('inf')

            # Test potential tempo range
            for candidate_bpm in range(int(Config.MIN_TEMPO_BPM), int(Config.MAX_TEMPO_BPM) + 1, 2):
                beat_len = 60.0 / candidate_bpm
                
                # Fitness evaluator: calculate deviation relative to straight and triplet divisions
                errors = []
                ref_time = local_onsets[0]
                for o in local_onsets:
                    phase = ((o - ref_time) / beat_len) % 1.0
                    
                    # Distances to standard subdivisions
                    subdivisions = [0.0, 0.25, 0.3333, 0.5, 0.6667, 0.75, 1.0]
                    err = min(abs(phase - x) for x in subdivisions)
                    errors.append(err)

                mean_err = sum(errors) / len(errors)
                if mean_err < min_phase_error:
                    min_phase_error = mean_err
                    best_bpm = candidate_bpm

            tempo_curve.append((curr_sec, float(best_bpm)))
            curr_sec += Config.TEMPO_STEP_SEC

        # Smooth the curve using rolling average
        smoothed_curve: List[Tuple[float, float]] = []
        for idx, (t, bpm) in enumerate(tempo_curve):
            start_idx = max(0, idx - 2)
            end_idx = min(len(tempo_curve), idx + 3)
            avg_bpm = sum(tempo_curve[x][1] for x in range(start_idx, end_idx)) / (end_idx - start_idx)
            smoothed_curve.append((t, avg_bpm))

        return smoothed_curve

    def quantize_performance(self, notes: List[Note], beat_times: List[float], 
                             get_tempo_at: Any, ppq: int):
        """Quantizes onsets and note lengths onto straight, swing, or triplet divisions."""
        self.stats["total_quantized_notes"] = len(notes)

        # Pre-compute feel classifications for each beat
        beat_feels: Dict[int, str] = {}
        for j in range(len(beat_times) - 1):
            b_start = beat_times[j]
            b_end = beat_times[j+1]

            # Gather notes onsets falling inside this beat
            local_notes = [n for n in notes if b_start <= n.start_sec < b_end]
            if not local_notes:
                beat_feels[j] = "straight"
                continue

            # Phase voter
            triplet_votes = 0
            straight_votes = 0
            swing_votes = 0

            for ln in local_notes:
                phase = (ln.start_sec - b_start) / (b_end - b_start)
                
                # Check triplet bounds
                triplet_err = min(abs(phase - 0.3333), abs(phase - 0.6667))
                # Check straight 16th bounds
                straight_err = min(abs(phase - 0.25), abs(phase - 0.5), abs(phase - 0.75))

                if triplet_err < Config.TRIPLET_TOLERANCE:
                    triplet_votes += 1
                elif Config.SWING_RATIO_MIN <= phase <= Config.SWING_RATIO_MAX:
                    swing_votes += 1
                elif straight_err < 0.08:
                    straight_votes += 1

            if triplet_votes > straight_votes and triplet_votes > swing_votes:
                beat_feels[j] = "triplet"
                self.stats["triplet_beats_detected"] += 1
            elif swing_votes > straight_votes:
                beat_feels[j] = "swing"
                self.stats["swing_beats_detected"] += 1
            else:
                beat_feels[j] = "straight"

        # Apply snapping
        for n in notes:
            # 1. Onset Snap
            # Find closest beat index
            b_idx = 0
            for idx, b_time in enumerate(beat_times[:-1]):
                if beat_times[idx] <= n.start_sec < beat_times[idx+1]:
                    b_idx = idx
                    break
            else:
                if n.start_sec < beat_times[0]:
                    b_idx = 0
                else:
                    b_idx = len(beat_times) - 2

            b_start = beat_times[b_idx]
            b_end = beat_times[b_idx+1]
            original_phase = (n.start_sec - b_start) / (b_end - b_start)

            # Define snapping targets based on local feel classification
            feel = beat_feels.get(b_idx, "straight")
            n.feel_detected = feel

            if feel == "triplet":
                targets = [0.0, 0.3333, 0.6667, 1.0]
            elif feel == "swing":
                # Swing notes are mapped to standard straight eighths (0.5) for clean sheet music notation
                targets = [0.0, 0.5, 1.0]
            else: # straight
                targets = [0.0, 0.25, 0.5, 0.75, 1.0]

            snapped_phase = min(targets, key=lambda x: abs(original_phase - x))
            
            # Map snapped phase to nominal warped metrical tick
            n.quant_start_tick = int(round((b_idx + snapped_phase) * ppq))

            # 2. Duration Snap
            # Calculate length in beats
            local_bpm = get_tempo_at(n.start_sec)
            beat_len_sec = 60.0 / local_bpm
            duration_beats = n.duration_sec / beat_len_sec

            # Snap duration to nearest logical structural unit
            standard_durations = [0.25, 0.3333, 0.5, 0.6667, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0]
            snapped_dur = min(standard_durations, key=lambda x: abs(duration_beats - x))
            
            n.quant_end_tick = n.quant_start_tick + int(round(snapped_dur * ppq))

            # Record
            self.quant_report.append({
                "note_id": n.id,
                "pitch": n.pitch,
                "feel": feel,
                "old_start": round(n.start_sec, 3),
                "old_duration": round(n.duration_sec, 3),
                "quant_start_tick": n.quant_start_tick,
                "quant_duration_beats": snapped_dur
            })

    def sec_to_warped_tick(self, sec: float, beat_times: List[float], ppq: int) -> int:
        """Converts physical time into warped metrical ticks for structural non-note events."""
        for idx in range(len(beat_times) - 1):
            if beat_times[idx] <= sec < beat_times[idx+1]:
                phase = (sec - beat_times[idx]) / (beat_times[idx+1] - beat_times[idx])
                return int(round((idx + phase) * ppq))
        if sec < beat_times[0]:
            return 0
        return int(round((len(beat_times) - 1) * ppq))

    def save_outputs(self, out_mid: mido.MidiFile):
        # MENGGUNAKAN INSTANCE PATHS DINAMIK (Pembedahan Konfigurasi Dinamik)
        try:
            out_mid.save(self.output_path)
            self.log(f"Exported warped/quantized MIDI to: {self.output_path}")
        except Exception as e:
            self.log(f"Error saving output MIDI: {e}")

        # 2. Save CSV Report
        try:
            with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    "Note_ID", "Pitch", "Local_Feel", "Original_Start_Sec", 
                    "Original_Duration_Sec", "Nominal_Start_Tick", "Quantized_Duration_Beats"
                ])
                for d in self.quant_report:
                    writer.writerow([
                        d["note_id"], d["pitch"], d["feel"], d["old_start"],
                        d["old_duration"], d["quant_start_tick"], d["quant_duration_beats"]
                    ])
            self.log(f"Exported CSV report to: {self.csv_path}")
        except Exception as e:
            self.log(f"Error saving CSV: {e}")

        # 3. Save JSON Diagnostics
        try:
            diagnostics_payload = {
                "pipeline_stage": "stage5",
                "config": {
                    "min_tempo_bpm": Config.MIN_TEMPO_BPM,
                    "max_tempo_bpm": Config.MAX_TEMPO_BPM,
                    "tempo_window_sec": Config.TEMPO_WINDOW_SEC,
                    "tempo_step_sec": Config.TEMPO_STEP_SEC,
                    "swing_ratio_min": Config.SWING_RATIO_MIN,
                    "swing_ratio_max": Config.SWING_RATIO_MAX,
                    "triplet_tolerance": Config.TRIPLET_TOLERANCE
                },
                "statistics": self.stats,
                "decisions": self.quant_report
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
        pipeline = Stage5Pipeline(input_p, output_p, log_p, csv_p, json_p)
    else:
        pipeline = Stage5Pipeline()
    pipeline.run()


if __name__ == "__main__":
    main()

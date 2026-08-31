#!/usr/bin/env python3
"""
Stage 3: Melodic Reconstruction & Gap Repair Pipeline

Converts: stage2.mid
Outputs:  stage3.mid
Logs:     stage3_log.txt
Reports:  stage3_report.csv
          stage3_diagnostics.json

Features:
  - Redundant duplicate note cleaning across tracks/channels.
  - Melodic skyline extraction & phrase segmentation.
  - Directional melodic run (contour) step-wise reconstruction.
  - Accompaniment-aware clash avoidance.
  - High-confidence deterministic note insertion.
"""

import os
import sys
import csv
import json
import math
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
    INPUT_PATH = os.path.join(BASE_DIR, "output", "stage2.mid")
    OUTPUT_PATH = os.path.join(BASE_DIR, "output", "stage3.mid")
    LOG_PATH = os.path.join(BASE_DIR, "output", "stage3_log.txt")
    CSV_PATH = os.path.join(BASE_DIR, "output", "stage3_report.csv")
    JSON_PATH = os.path.join(BASE_DIR, "output", "stage3_diagnostics.json")

    # Duplicate Cleaning Thresholds
    DUPLICATE_OVERLAP_THRESHOLD = 0.70  # Clean note if overlap > 70% of shorter duration

    # Melodic Phrase Parameters
    PHRASE_GAP_THRESHOLD_SEC = 0.35     # Gaps > 0.5s segment melody into new phrases

    # Note Insertion Parameters (Never invent notes with low confidence)
    MIN_MELODY_INSERT_CONFIDENCE = 95.0 # Strict threshold to prevent hallucination
    MAX_GAP_INSERT_SEC = 0.60           # Gaps wider than this are left as rests
    MIN_GAP_INSERT_SEC = 0.12           # Gaps narrower than this are left as performance articulation

    # Confidence Weights
    WEIGHT_RHYTHMIC_ALIGNMENT = 0.40    # Gap matches surrounding note lengths
    WEIGHT_CONTOUR_CONTINUITY = 0.40    # Part of a larger ascending/descending run
    WEIGHT_ACCOMPANIMENT_HARMONY = 0.50 # Harmonically clean (no unison clash)


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

    def sec_to_tick(self, sec: float) -> int:
        prev_tick = 0
        prev_tempo = 500000
        prev_sec = 0.0
        for change in self.tempo_changes:
            interval_ticks = change['tick'] - prev_tick
            interval_sec = (interval_ticks / self.ppq) * (prev_tempo / 1000000.0)
            if sec < prev_sec + interval_sec:
                break
            prev_sec += interval_sec
            prev_tick = change['tick']
            prev_tempo = change['tempo']
        remaining_sec = sec - prev_sec
        remaining_ticks = (remaining_sec * 1000000.0 * self.ppq) / prev_tempo
        return int(round(prev_tick + remaining_ticks))


class Note:
    """Clean structure of a parsed MIDI note."""
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
        self.is_inserted = False

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


class Stage3Pipeline:
    # MENERIMA PARAMETER LALUAN SECARA DINAMIK (Pembedahan Konfigurasi Dinamik)
    def __init__(self, input_path=None, output_path=None, log_path=None, csv_path=None, json_path=None):
        self.logs: List[str] = []
        self.actions_log: List[Dict[str, Any]] = []
        
        # Penyelarasan laluan parameter or fallback relatif
        self.input_path = input_path or Config.INPUT_PATH
        self.output_path = output_path or Config.OUTPUT_PATH
        self.log_path = log_path or Config.LOG_PATH
        self.csv_path = csv_path or Config.CSV_PATH
        self.json_path = json_path or Config.JSON_PATH

        self.stats = {
            "loaded_note_count": 0,
            "duplicate_notes_removed": 0,
            "melody_notes_detected": 0,
            "melody_notes_inserted": 0,
            "rejected_insertion_candidates": 0,
            "final_note_count": 0
        }

    def log(self, message: str, print_console: bool = True):
        self.logs.append(message)
        if print_console:
            print(message)

    def run(self):
        self.log("=" * 60)
        self.log("  STAGE 3: MELODIC RECONSTRUCTION PIPELINE INITIALIZED")
        self.log("=" * 60)

        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)

        if not os.path.exists(self.input_path):
            self.log(f"Error: Stage 2 output file not found at: {self.input_path}")
            sys.exit(1)

        self.log(f"Loading MIDI: {self.input_path}")
        try:
            mid = mido.MidiFile(self.input_path)
        except Exception as e:
            self.log(f"Critical Error: Failed to parse MIDI. Detail: {e}")
            sys.exit(1)

        tempo_map = TempoMap(mid)
        self.log(f"Parsed tempo map. PPQ={mid.ticks_per_beat}")

        # 1. Parsing Notes and Track Messages
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
                    other_events[track_idx].append(TrackMessage(msg, current_tick))

            for key, finished in active_notes.items():
                finished.end_tick = current_tick
                finished.start_sec = tempo_map.tick_to_sec(finished.start_tick)
                finished.end_sec = tempo_map.tick_to_sec(current_tick)
                notes.append(finished)

        for note in notes:
            note.id = note_id_counter
            note_id_counter += 1

        self.stats["loaded_note_count"] = len(notes)
        self.log(f"Successfully loaded {len(notes)} notes.")

        # 2. Duplicate Note Cleaning
        self.log("Analyzing and purging redundant duplicate notes...")
        clean_notes = self.remove_duplicate_notes(notes)
        self.stats["duplicate_notes_removed"] = len(notes) - len(clean_notes)
        self.log(f"Removed {self.stats['duplicate_notes_removed']} duplicate/clashing notes.")

        # 3. Melody Skyline Extraction
        self.log("Performing melodic contour & skyline tracking...")
        melody_notes = self.extract_melodic_skyline(clean_notes)
        self.stats["melody_notes_detected"] = len(melody_notes)
        self.log(f"Identified {len(melody_notes)} notes acting as primary melodic voice.")

        # 4. Phrase Segmentation & Melodic Gap Repair
        self.log("Segmenting voice into phrases and repairing melodic dropouts...")
        reconstructed_notes, note_id_counter = self.repair_melodic_gaps(
            clean_notes, melody_notes, tempo_map, note_id_counter
        )

        self.stats["final_note_count"] = len(reconstructed_notes)

        # 5. Re-building MIDI Tracks
        self.log("Reweaving MIDI tracks with newly interpolated notes...")
        out_mid = mido.MidiFile(ticks_per_beat=mid.ticks_per_beat)

        for track_idx, track in enumerate(mid.tracks):
            new_track = mido.MidiTrack()
            track_notes = [n for n in reconstructed_notes if n.track_idx == track_idx]

            reconstructed_events: List[Tuple[int, mido.Message]] = []
            for note in track_notes:
                on_msg = mido.Message('note_on', note=note.pitch, velocity=note.velocity, channel=note.channel)
                off_msg = mido.Message('note_off', note=note.pitch, velocity=0, channel=note.channel)
                reconstructed_events.append((note.start_tick, on_msg))
                reconstructed_events.append((note.end_tick, off_msg))

            track_other = other_events.get(track_idx, [])
            for event in track_other:
                reconstructed_events.append((event.absolute_tick, event.msg))

            # Deterministic Event Sorting
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
        self.log("Stage 3 completed successfully.", print_console=True)

    def remove_duplicate_notes(self, notes: List[Note]) -> List[Note]:
        """Identifies and purges heavily overlapping identical notes."""
        sorted_notes = sorted(notes, key=lambda x: (x.pitch, x.start_sec))
        to_remove = set()

        for i in range(len(sorted_notes)):
            n1 = sorted_notes[i]
            if n1.id in to_remove:
                continue

            for j in range(i + 1, len(sorted_notes)):
                n2 = sorted_notes[j]
                if n2.pitch != n1.pitch:
                    break  # Out of range

                # Calculate overlap duration
                overlap_start = max(n1.start_sec, n2.start_sec)
                overlap_end = min(n1.end_sec, n2.end_sec)
                overlap = max(0.0, overlap_end - overlap_start)

                shorter_dur = min(n1.duration_sec, n2.duration_sec)
                if shorter_dur > 0 and (overlap / shorter_dur) >= Config.DUPLICATE_OVERLAP_THRESHOLD:
                    # Retain the note with higher velocity, mark other for deletion
                    if n1.velocity >= n2.velocity:
                        to_remove.add(n2.id)
                        self.actions_log.append({
                            "type": "duplicate_removal",
                            "removed_id": n2.id,
                            "retained_id": n1.id,
                            "pitch": n1.pitch,
                            "overlap_ratio": round(overlap / shorter_dur, 2)
                        })
                    else:
                        to_remove.add(n1.id)
                        self.actions_log.append({
                            "type": "duplicate_removal",
                            "removed_id": n1.id,
                            "retained_id": n2.id,
                            "pitch": n1.pitch,
                            "overlap_ratio": round(overlap / shorter_dur, 2)
                        })
                        break

        return [n for n in notes if n.id not in to_remove]

    def extract_melodic_skyline(self, notes: List[Note]) -> List[Note]:
        """Identifies note sequences acting as the primary melody (highest active pitches)."""
        melody_set = set()
        for n1 in notes:
            # We filter out very low accompaniment bass notes (typically <= Midi pitch 48 / C3)
            if n1.pitch < 48:
                continue

            is_skyline = True
            for n2 in notes:
                if n2.id == n1.id:
                    continue
                # Evaluate chronological overlap
                overlap_start = max(n1.start_sec, n2.start_sec)
                overlap_end = min(n1.end_sec, n2.end_sec)
                if overlap_end > overlap_start:
                    # If an overlapping note has a strictly higher pitch, n1 is not melody
                    if n2.pitch > n1.pitch:
                        is_skyline = False
                        break

            if is_skyline:
                melody_set.add(n1.id)

        return [n for n in notes if n.id in melody_set]

    def repair_melodic_gaps(self, all_notes: List[Note], melody_notes: List[Note], 
                             tempo_map: TempoMap, next_id: int) -> Tuple[List[Note], int]:
        """Finds musical pauses inside phrase boundaries and infers high-confidence missing steps."""
        reconstructed = list(all_notes)
        
        # Group melody notes by Track & Channel
        voices: Dict[Tuple[int, int], List[Note]] = {}
        for mn in melody_notes:
            voices.setdefault((mn.track_idx, mn.channel), []).append(mn)

        inserted_count = 0

        for (track_idx, channel), v_notes in voices.items():
            # Sort chronologically
            v_notes.sort(key=lambda x: x.start_sec)
            if len(v_notes) < 2:
                continue

            # Segment into phrases
            phrases: List[List[Note]] = []
            curr_phrase = [v_notes[0]]

            for k in range(1, len(v_notes)):
                prev_n = v_notes[k-1]
                curr_n = v_notes[k]
                gap = curr_n.start_sec - prev_n.end_sec
                if gap > Config.PHRASE_GAP_THRESHOLD_SEC:
                    phrases.append(curr_phrase)
                    curr_phrase = [curr_n]
                else:
                    curr_phrase.append(curr_n)
            phrases.append(curr_phrase)

            # Analyze gaps inside each phrase
            for phrase in phrases:
                if len(phrase) < 2:
                    continue

                for idx in range(len(phrase) - 1):
                    m1 = phrase[idx]
                    m2 = phrase[idx + 1]
                    gap_sec = m2.start_sec - m1.end_sec

                    # Candidate filter: gap must be reasonable
                    if gap_sec < Config.MIN_GAP_INSERT_SEC or gap_sec > Config.MAX_GAP_INSERT_SEC:
                        continue

                    # Strict step-wise contour search: pitch difference must be exactly 2 semitones
                    # (This is the most deterministic step missing, e.g. D missing between C and E)
                    pitch_diff = m2.pitch - m1.pitch
                    if abs(pitch_diff) != 2:
                        continue

                    target_pitch = (m1.pitch + m2.pitch) // 2

                    # Compute Confidence Score
                    confidence, details = self.calculate_insertion_confidence(
                        m1, m2, idx, phrase, target_pitch, gap_sec, all_notes
                    )

                    if confidence >= Config.MIN_MELODY_INSERT_CONFIDENCE:
                        # Construct Missing Note
                        start_sec = m1.end_sec
                        end_sec = m2.start_sec
                        
                        start_tick = tempo_map.sec_to_tick(start_sec)
                        end_tick = tempo_map.sec_to_tick(end_sec)
                        avg_vel = int(round((m1.velocity + m2.velocity) / 2.0))
                        
                        new_note = Note(
                            pitch=target_pitch,
                            start_tick=start_tick,
                            end_tick=end_tick,
                            velocity=avg_vel,
                            channel=m1.channel,
                            track_idx=m1.track_idx
                        )
                        new_note.id = next_id
                        next_id += 1
                        new_note.start_sec = start_sec
                        new_note.end_sec = end_sec
                        new_note.is_inserted = True

                        reconstructed.append(new_note)
                        inserted_count += 1

                        self.actions_log.append({
                            "type": "melodic_insertion",
                            "inserted_id": new_note.id,
                            "pitch": target_pitch,
                            "start_sec": round(start_sec, 3),
                            "end_sec": round(end_sec, 3),
                            "confidence": round(confidence, 1),
                            "reason": f"High confidence scale interpolation between {m1.pitch} and {m2.pitch}",
                            "details": details
                        })
                    else:
                        self.stats["rejected_insertion_candidates"] += 1
                        self.actions_log.append({
                            "type": "rejected_candidate",
                            "pitch": target_pitch,
                            "gap_sec": round(gap_sec, 3),
                            "confidence": round(confidence, 1),
                            "reason": "Score fell below strict minimum threshold.",
                            "details": details
                        })

        self.stats["melody_notes_inserted"] = inserted_count
        self.log(f"Reconstruction complete. Interpolated {inserted_count} missing melody notes.")
        return reconstructed, next_id

    def calculate_insertion_confidence(self, m1: Note, m2: Note, idx: int, phrase: List[Note], 
                                      target_pitch: int, gap_sec: float, all_notes: List[Note]) -> Tuple[float, Dict[str, Any]]:
        """Calculates 0-100 score evaluating mathematical and contour likelihood of a missing note."""
        
        # 1. Rhythmic Alignment Component (Max 40 points)
        # Check if the gap duration aligns cleanly with the lengths of surrounding notes
        target_dur = (m1.duration_sec + m2.duration_sec) / 2.0
        dur_ratio = gap_sec / target_dur if target_dur > 0 else 1.0
        # If gap is roughly the size of a standard structural beat duration, award high score
        if 0.5 <= dur_ratio <= 1.5:
            s_rhythm = 40.0
        else:
            s_rhythm = max(0.0, 40.0 * (1.0 - abs(1.0 - dur_ratio)))

        # 2. Scale Contour Continuity (Max 40 points)
        # Search if the surrounding notes form a larger, coherent directional movement (up or down)
        s_contour = 0.0
        has_run = False
        
        # Ascending Check
        if m2.pitch > m1.pitch:
            # Check left context
            left_asc = False
            if idx > 0 and phrase[idx-1].pitch < m1.pitch:
                left_asc = True
            # Check right context
            right_asc = False
            if idx < len(phrase) - 2 and phrase[idx+2].pitch > m2.pitch:
                right_asc = True
            
            if left_asc or right_asc:
                s_contour = 40.0 if (left_asc and right_asc) else 30.0
                has_run = True
        # Descending Check
        else:
            left_desc = False
            if idx > 0 and phrase[idx-1].pitch > m1.pitch:
                left_desc = True
            right_desc = False
            if idx < len(phrase) - 2 and phrase[idx+2].pitch < m2.pitch:
                right_desc = True

            if left_desc or right_desc:
                s_contour = 40.0 if (left_desc and right_desc) else 30.0
                has_run = True

        if not has_run:
            # Melodic step-wise leap with direction pivot
            s_contour = 15.0

        # 3. Accompaniment Clashing Check (Max 20 points)
        # If another note already plays this exact pitch during the gap, we penalize insertion
        s_harmony = 20.0
        overlap_clash = False
        for n in all_notes:
            if n.pitch == target_pitch:
                # Check for temporal overlap inside the gap interval
                o_start = max(m1.end_sec, n.start_sec)
                o_end = min(m2.start_sec, n.end_sec)
                if o_end > o_start:
                    overlap_clash = True
                    break

        if overlap_clash:
            s_harmony = 0.0

        total_score = s_rhythm + s_contour + s_harmony
        
        details = {
            "rhythm_score": round(s_rhythm, 2),
            "contour_score": round(s_contour, 2),
            "harmony_score": round(s_harmony, 2),
            "gap_sec": round(gap_sec, 3),
            "duration_ratio": round(dur_ratio, 2)
        }
        
        return total_score, details

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
                writer.writerow(["Action_Type", "Target_ID", "Pitch", "Start_Sec", "End_Sec", "Confidence", "Reason"])
                for a in self.actions_log:
                    if a["type"] == "duplicate_removal":
                        writer.writerow([
                            "DUPLICATE_REMOVED", a["removed_id"], a["pitch"], "", "", "", 
                            f"Overlapped heavily with ID {a['retained_id']}"
                        ])
                    elif a["type"] == "melodic_insertion":
                        writer.writerow([
                            "MELODIC_INSERTION", a["inserted_id"], a["pitch"], a["start_sec"], a["end_sec"],
                            a["confidence"], a["reason"]
                        ])
                    elif a["type"] == "rejected_candidate":
                        writer.writerow([
                            "REJECTED_CANDIDATE", "", a["pitch"], "", "", a["confidence"], a["reason"]
                        ])
            self.log(f"Exported CSV report to: {self.csv_path}")
        except Exception as e:
            self.log(f"Error saving CSV: {e}")

        # 3. Save JSON Diagnostics
        try:
            diagnostics_payload = {
                "pipeline_stage": "stage3",
                "config": {
                    "duplicate_overlap_threshold": Config.DUPLICATE_OVERLAP_THRESHOLD,
                    "phrase_gap_threshold_sec": Config.PHRASE_GAP_THRESHOLD_SEC,
                    "min_melody_insert_confidence": Config.MIN_MELODY_INSERT_CONFIDENCE,
                    "max_gap_insert_sec": Config.MAX_GAP_INSERT_SEC,
                    "min_gap_insert_sec": Config.MIN_GAP_INSERT_SEC
                },
                "statistics": self.stats,
                "decisions": self.actions_log
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
        pipeline = Stage3Pipeline(input_p, output_p, log_p, csv_p, json_p)
    else:
        pipeline = Stage3Pipeline()
    pipeline.run()


if __name__ == "__main__":
    main()

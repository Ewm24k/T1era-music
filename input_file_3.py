#!/usr/bin/env python3
"""
Stage 2: Fragmented Note Repair Pipeline (Register-Aware)

Converts: stage1_clean.mid
Outputs:  stage2.mid
Logs:     stage2_log.txt
Reports:  stage2_report.csv
          stage2_diagnostics.json

Features:
  - Register-Aware Confidence Engine (differentiates Bass and Treble characteristics).
  - Tempo-aware precise absolute-time mapping.
  - Multi-feature weighted confidence scoring (0-100).
  - Phrase boundary & local density checking (scaled for Treble activity).
  - Motor-rhythm/staccato protection (calibrated for register arpeggios).
  - Configurable merge chain limits.
  - Comprehensive, deterministic MIDI rebuilding.
"""

import os
import sys
import csv
import json
import math
from typing import List, Dict, Tuple, Optional, Any

# Ensure standard MIDI library mido is available
try:
    import mido
except ImportError:
    print("Error: The 'mido' library is required to run this pipeline.")
    print("Please install it using: pip install mido")
    sys.exit(1)


class Config:
    """Fallback Local Config (Using Cross-Platform Relative Paths)"""
    # File Paths
    BASE_DIR = os.environ.get("MIDI_PIPELINE_BASE_DIR", ".")
    INPUT_PATH = os.path.join(BASE_DIR, "output", "stage1_clean.mid")
    OUTPUT_PATH = os.path.join(BASE_DIR, "output", "stage2.mid")
    LOG_PATH = os.path.join(BASE_DIR, "output", "stage2_log.txt")
    CSV_PATH = os.path.join(BASE_DIR, "output", "stage2_report.csv")
    JSON_PATH = os.path.join(BASE_DIR, "output", "stage2_diagnostics.json")

    # Register boundary: MIDI pitch 60 = C4 ("Middle C"). Anything BELOW this
    # (C2 up to, but not including, C4) is treated as bass clef. C4 and
    # everything above it is treated as treble clef.
    REGISTER_BOUNDARY_PITCH = 60


class BassConfig:
    """Merge-engine dials for notes below C4 (pitch < 60)."""
    # Merge Engine Constants (Same Pitches)
    MAX_GAP_SEC = 0.25                # Maximum base gap (seconds) between notes
    MIN_CONFIDENCE_THRESHOLD = 70.0   # Merge only if confidence score >= this value
    MAX_CHAIN_LIMIT = 2               # Maximum number of consecutive merges allowed

    # Legato Overlap Constants (Different Pitches)
    LEGATO_GAP_LIMIT_SEC = 0.05       # Close silent gaps smaller than this to create legato flow
    KEY_RELEASE_GAP_SEC = 0.010       # Standard key-release gap (10ms) before the next onset

    # Phrase Detection
    PHRASE_GAP_THRESHOLD_SEC = 0.40   # Base boundary rest threshold

    # Weights for the Confidence Engine (must sum to 1.0)
    WEIGHT_GAP = 0.35                 # Weight for temporal proximity
    WEIGHT_VELOCITY = 0.20            # Weight for volume similarity
    WEIGHT_DURATION_RATIO = 0.15      # Weight for duration structure
    WEIGHT_DENSITY = 0.15             # Weight for local context
    WEIGHT_RHYTHMIC_REGULARITY = 0.15 # Penalty weight if staccato pattern is detected

    # Performance Protection Thresholds
    GLITCH_DURATION_SEC = 0.08        # Notes shorter than this are treated as transient glitches
    RHYTHMIC_MATCH_TOLERANCE = 0.05   # Seconds of deviation allowed to identify regular patterns

    # Internal: velocity-similarity divisor (kept register-specific, not in your list,
    # but moved here so it's visible/tunable rather than hidden in the scoring code)
    VELOCITY_DIVISOR = 127.0


class TrebleConfig(BassConfig):
    """Same dials as BassConfig, for notes at C4 and above (pitch >= 60) -
    only MIN_CONFIDENCE_THRESHOLD differs by default. Change anything else
    here independently whenever you want treble to behave differently from bass."""
    MIN_CONFIDENCE_THRESHOLD = 85.0
    VELOCITY_DIVISOR = 150.0  # unchanged from the original single-Config behavior


def get_register_config(pitch: int):
    """Returns BassConfig for anything below C4, TrebleConfig for C4 and above."""
    return BassConfig if pitch < Config.REGISTER_BOUNDARY_PITCH else TrebleConfig


class TempoMap:
    """Calculates absolute seconds for MIDI ticks by analyzing tempo events."""
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

    def tempo_at_tick(self, tick: int) -> int:
        tempo = 500000
        for change in self.tempo_changes:
            if change['tick'] <= tick:
                tempo = change['tempo']
            else:
                break
        return tempo

    def sec_to_ticks(self, tick_position: int, delta_sec: float) -> int:
        """Converts a small seconds-duration near tick_position into ticks,
        using whatever tempo is active at that point. Good enough for the
        short gaps the legato-closing pass works with."""
        tempo = self.tempo_at_tick(tick_position)
        if tempo <= 0:
            return 0
        return int(round((delta_sec / (tempo / 1000000.0)) * self.ppq))


class Note:
    """Represents a clean note event parsed from the MIDI file."""
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
        self.merge_chain_count = 0

    @property
    def duration_ticks(self) -> int:
        return self.end_tick - self.start_tick

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


class TrackMessage:
    """Holds non-note MIDI messages preserving absolute ticks."""
    def __init__(self, msg: mido.Message, absolute_tick: int):
        self.msg = msg
        self.absolute_tick = absolute_tick


class Stage2Pipeline:
    # MENERIMA PARAMETER LALUAN SECARA DINAMIK (Pembedahan Konfigurasi Dinamik)
    def __init__(self, input_path=None, output_path=None, log_path=None, csv_path=None, json_path=None):
        self.logs: List[str] = []
        self.merge_decisions: List[Dict[str, Any]] = []
        
        # Penyelarasan laluan parameter or fallback relatif
        self.input_path = input_path or Config.INPUT_PATH
        self.output_path = output_path or Config.OUTPUT_PATH
        self.log_path = log_path or Config.LOG_PATH
        self.csv_path = csv_path or Config.CSV_PATH
        self.json_path = json_path or Config.JSON_PATH

        self.stats = {
            "original_note_count": 0,
            "merged_note_count": 0,
            "rejected_merge_count": 0,
            "legato_gaps_closed": 0,
            "average_confidence": 0.0,
            "average_gap_sec": 0.0,
            "max_merge_chain": 0,
            "pitch_histogram": {},
            "velocity_histogram": {}
        }

    def log(self, message: str, print_console: bool = True):
        self.logs.append(message)
        if print_console:
            print(message)

    def run(self):
        self.log("=" * 60)
        self.log("  STAGE 2: REGISTER-AWARE NOTE REPAIR PIPELINE INITIALIZED")
        self.log("=" * 60)

        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)

        if not os.path.exists(self.input_path):
            self.log(f"Error: Stage 1 output file not found at: {self.input_path}")
            sys.exit(1)

        self.log(f"Loading MIDI: {self.input_path}")
        try:
            mid = mido.MidiFile(self.input_path)
        except Exception as e:
            self.log(f"Critical Error: Failed to parse MIDI file. Detail: {e}")
            sys.exit(1)

        tempo_map = TempoMap(mid)
        self.log(f"Parsed tempo map with {len(tempo_map.tempo_changes)} tempo marker(s). PPQ={mid.ticks_per_beat}")

        # Extract Notes and other events
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

        for i, note in enumerate(notes):
            note.id = i

        self.stats["original_note_count"] = len(notes)
        self.log(f"Extracted {len(notes)} notes.")

        final_notes: List[Note] = []
        confidences_evaluated: List[float] = []
        gaps_evaluated: List[float] = []

        track_channels = set((n.track_idx, n.channel) for n in notes)

        for track_idx, channel in track_channels:
            chan_notes = [n for n in notes if n.track_idx == track_idx and n.channel == channel]
            track_all_notes = [n for n in notes if n.track_idx == track_idx]
            
            pitch_groups: Dict[int, List[Note]] = {}
            for note in chan_notes:
                pitch_groups.setdefault(note.pitch, []).append(note)

            for pitch, group in pitch_groups.items():
                group.sort(key=lambda x: x.start_tick)

                merged_group: List[Note] = []
                i = 0
                while i < len(group):
                    if i == len(group) - 1:
                        merged_group.append(group[i])
                        break
                    
                    n1 = group[i]
                    n2 = group[i+1]
                    
                    gap_sec = n2.start_sec - n1.end_sec
                    cfg = get_register_config(n1.pitch)
                    
                    if gap_sec < 0 or gap_sec > cfg.MAX_GAP_SEC:
                        merged_group.append(n1)
                        i += 1
                        continue
                    
                    confidence, reason, details = self.evaluate_merge(n1, n2, track_all_notes, gap_sec)
                    confidences_evaluated.append(confidence)
                    gaps_evaluated.append(gap_sec)
                    
                    is_candidate_approved = (confidence >= cfg.MIN_CONFIDENCE_THRESHOLD)
                    is_chain_limit_safe = (n1.merge_chain_count < cfg.MAX_CHAIN_LIMIT)
                    
                    if is_candidate_approved and is_chain_limit_safe:
                        total_dur = n1.duration_ticks + n2.duration_ticks
                        new_vel = n1.velocity
                        if total_dur > 0:
                            new_vel = int(round((n1.velocity * n1.duration_ticks + n2.velocity * n2.duration_ticks) / total_dur))
                        
                        merged_note = Note(
                            pitch=n1.pitch,
                            start_tick=n1.start_tick,
                            end_tick=n2.end_tick,
                            velocity=new_vel,
                            channel=n1.channel,
                            track_idx=n1.track_idx
                        )
                        merged_note.id = n1.id
                        merged_note.start_sec = n1.start_sec
                        merged_note.end_sec = n2.end_sec
                        merged_note.merge_chain_count = n1.merge_chain_count + 1
                        
                        self.stats["merged_note_count"] += 1
                        self.stats["max_merge_chain"] = max(self.stats["max_merge_chain"], merged_note.merge_chain_count)
                        
                        self.record_decision(n1, n2, confidence, reason, details, accepted=True)
                        
                        group[i+1] = merged_note
                        i += 1
                    else:
                        self.stats["rejected_merge_count"] += 1
                        if not is_chain_limit_safe:
                            reason = "Rejected: Maximum consecutive merge chain limit reached"
                        self.record_decision(n1, n2, confidence, reason, details, accepted=False)
                        merged_group.append(n1)
                        i += 1
                
                final_notes.extend(merged_group)

        self.log("Applying legato gap-closing between different pitches...")
        self.apply_legato_closing(final_notes, tempo_map)

        if confidences_evaluated:
            self.stats["average_confidence"] = sum(confidences_evaluated) / len(confidences_evaluated)
            self.stats["average_gap_sec"] = sum(gaps_evaluated) / len(gaps_evaluated)

        for n in final_notes:
            self.stats["pitch_histogram"][n.pitch] = self.stats["pitch_histogram"].get(n.pitch, 0) + 1
            v_bin = f"{(n.velocity // 10) * 10}-{((n.velocity // 10) * 10) + 9}"
            self.stats["velocity_histogram"][v_bin] = self.stats["velocity_histogram"].get(v_bin, 0) + 1

        self.log(f"Merging complete: Merged {self.stats['merged_note_count']} notes. Remaining active notes: {len(final_notes)}")

        self.log("Reconstructing MIDI structures and event timings...")
        out_mid = mido.MidiFile(ticks_per_beat=mid.ticks_per_beat)

        for track_idx, track in enumerate(mid.tracks):
            new_track = mido.MidiTrack()
            track_notes = [n for n in final_notes if n.track_idx == track_idx]
            
            reconstructed_events: List[Tuple[int, mido.Message]] = []
            for note in track_notes:
                on_msg = mido.Message('note_on', note=note.pitch, velocity=note.velocity, channel=note.channel)
                off_msg = mido.Message('note_off', note=note.pitch, velocity=0, channel=note.channel)
                reconstructed_events.append((note.start_tick, on_msg))
                reconstructed_events.append((note.end_tick, off_msg))

            track_other = other_events.get(track_idx, [])
            for event in track_other:
                reconstructed_events.append((event.absolute_tick, event.msg))

            def get_event_sort_key(item):
                tick, msg = item
                priority = 4
                if msg.is_meta:
                    priority = 0
                elif msg.type in ['control_change', 'program_change', 'pitchwheel', 'aftertouch', 'polytouch']:
                    priority = 1
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    priority = 2
                elif msg.type == 'note_on' and msg.velocity > 0:
                    priority = 3
                pitch_val = getattr(msg, 'note', 0)
                return (tick, priority, pitch_val)

            reconstructed_events.sort(key=get_event_sort_key)

            prev_tick = 0
            for tick, msg in reconstructed_events:
                delta = tick - prev_tick
                msg.time = delta
                new_track.append(msg)
                prev_tick = tick

            out_mid.tracks.append(new_track)

        self.save_outputs(out_mid)
        self.log("Stage 2 successfully completed.", print_console=True)

    def apply_legato_closing(self, notes: List[Note], tempo_map: TempoMap):
        groups: Dict[Tuple[int, int], List[Note]] = {}
        for n in notes:
            groups.setdefault((n.track_idx, n.channel), []).append(n)

        closed_count = 0
        for _, group in groups.items():
            group.sort(key=lambda x: x.start_tick)
            for i in range(len(group) - 1):
                n1 = group[i]
                n2 = group[i + 1]

                if n2.pitch == n1.pitch:
                    continue  

                gap_sec = n2.start_sec - n1.end_sec
                if gap_sec <= 0:
                    continue  

                cfg = get_register_config(n1.pitch)
                if gap_sec > cfg.LEGATO_GAP_LIMIT_SEC:
                    continue  

                target_gap_sec = cfg.KEY_RELEASE_GAP_SEC
                if gap_sec <= target_gap_sec:
                    continue  

                shrink_sec = gap_sec - target_gap_sec
                shrink_ticks = tempo_map.sec_to_ticks(n1.end_tick, shrink_sec)
                if shrink_ticks <= 0:
                    continue

                new_end_tick = min(n1.end_tick + shrink_ticks, n2.start_tick - 1)
                if new_end_tick <= n1.end_tick:
                    continue

                old_end_sec = n1.end_sec
                n1.end_tick = new_end_tick
                n1.end_sec = tempo_map.tick_to_sec(new_end_tick)
                closed_count += 1

                self.merge_decisions.append({
                    "n1_id": n1.id,
                    "n2_id": n2.id,
                    "pitch": n1.pitch,
                    "n1_start_sec": round(n1.start_sec, 4),
                    "n1_end_sec": round(n1.end_sec, 4),
                    "n2_start_sec": round(n2.start_sec, 4),
                    "n2_end_sec": round(n2.end_sec, 4),
                    "gap_sec": round(gap_sec, 4),
                    "confidence": 100.0,
                    "accepted": True,
                    "reason": f"Legato: closed {gap_sec*1000:.0f}ms gap to {target_gap_sec*1000:.0f}ms "
                              f"key-release gap (next note pitch {n2.pitch})",
                    "details": {
                        "old_end_sec": round(old_end_sec, 4),
                        "n2_pitch": n2.pitch,
                        "gap_before_sec": round(gap_sec, 4),
                        "gap_after_sec": round(target_gap_sec, 4)
                    }
                })

        self.stats["legato_gaps_closed"] = closed_count
        self.log(f"Legato closing complete: {closed_count} gap(s) tightened.")

    def evaluate_merge(self, n1: Note, n2: Note, track_notes: List[Note], gap_sec: float) -> Tuple[float, str, Dict[str, Any]]:
        is_treble = (n1.pitch >= Config.REGISTER_BOUNDARY_PITCH)
        cfg = get_register_config(n1.pitch)

        s_gap = 100.0 * (1.0 - (gap_sec / cfg.MAX_GAP_SEC))
        s_gap = max(0.0, min(100.0, s_gap))

        delta_vel = abs(n1.velocity - n2.velocity)
        vel_divisor = cfg.VELOCITY_DIVISOR
        s_vel = 100.0 * (1.0 - (delta_vel / vel_divisor))
        s_vel = max(0.0, min(100.0, s_vel))

        min_dur = min(n1.duration_sec, n2.duration_sec)
        glitch_limit = cfg.GLITCH_DURATION_SEC
        if min_dur < glitch_limit:
            s_dur = 100.0
        else:
            avg_dur = (n1.duration_sec + n2.duration_sec) / 2.0
            ratio = gap_sec / avg_dur if avg_dur > 0 else 1.0
            s_dur = 100.0 * math.exp(-ratio)
            s_dur = max(0.0, min(100.0, s_dur))

        window_start = n1.start_sec - 0.5
        window_end = n2.end_sec + 0.5
        local_notes = [
            n for n in track_notes 
            if (n.start_sec >= window_start and n.start_sec <= window_end) or
               (n.end_sec >= window_start and n.end_sec <= window_end)
        ]
        local_density = len(local_notes)
        effective_density = local_density

        if effective_density <= 2:
            s_density = 100.0
        elif effective_density >= 8:
            s_density = 50.0
        else:
            s_density = 100.0 - (100.0 - 50.0) * ((effective_density - 2) / 6.0)

        same_pitch = sorted([n for n in track_notes if n.pitch == n1.pitch], key=lambda x: x.start_tick)
        
        r_regularity_detected = False
        try:
            n1_idx = same_pitch.index(n1)
            n2_idx = same_pitch.index(n2)
            
            if n1_idx > 0:
                n0 = same_pitch[n1_idx - 1]
                prev_gap = n1.start_sec - n0.end_sec
                if abs(prev_gap - gap_sec) < cfg.RHYTHMIC_MATCH_TOLERANCE and abs(n0.duration_sec - n1.duration_sec) < cfg.RHYTHMIC_MATCH_TOLERANCE:
                    r_regularity_detected = True

            if n2_idx < len(same_pitch) - 1:
                n3 = same_pitch[n2_idx + 1]
                next_gap = n3.start_sec - n2.end_sec
                if abs(next_gap - gap_sec) < cfg.RHYTHMIC_MATCH_TOLERANCE and abs(n3.duration_sec - n2.duration_sec) < cfg.RHYTHMIC_MATCH_TOLERANCE:
                    r_regularity_detected = True
        except ValueError:
            pass

        score = (
            s_gap * cfg.WEIGHT_GAP +
            s_vel * cfg.WEIGHT_VELOCITY +
            s_dur * cfg.WEIGHT_DURATION_RATIO +
            s_density * cfg.WEIGHT_DENSITY
        )

        if r_regularity_detected:
            score -= (cfg.WEIGHT_RHYTHMIC_REGULARITY * 100.0)

        score = max(0.0, min(100.0, score))

        details = {
            "gap_sec": round(gap_sec, 4),
            "delta_vel": delta_vel,
            "min_duration_sec": round(min_dur, 4),
            "local_density": local_density,
            "effective_density": round(effective_density, 2),
            "motor_rhythm_detected": r_regularity_detected,
            "is_treble": is_treble,
            "components": {
                "s_gap": round(s_gap, 2),
                "s_vel": round(s_vel, 2),
                "s_dur": round(s_dur, 2),
                "s_density": round(s_density, 2)
            }
        }

        phrase_boundary_limit = cfg.PHRASE_GAP_THRESHOLD_SEC
        if gap_sec > phrase_boundary_limit:
            return 0.0, "Rejected: Phrase boundary break (gap exceeds safety threshold)", details

        if r_regularity_detected:
            reason = "Rejected: Active performance rhythm pattern detected (preserved staccato/repeated attacks)"
        elif min_dur < glitch_limit:
            reason = "Approved: Transient audio fragmentation glitch corrected"
        elif score >= cfg.MIN_CONFIDENCE_THRESHOLD:
            reason = f"Approved: Strong correlation score ({score:.1f}/100)"
        else:
            reason = f"Rejected: Insufficient confidence score ({score:.1f}/100)"

        return score, reason, details

    def record_decision(self, n1: Note, n2: Note, confidence: float, reason: str, details: Dict[str, Any], accepted: bool):
        self.merge_decisions.append({
            "n1_id": n1.id,
            "n2_id": n2.id,
            "pitch": n1.pitch,
            "n1_start_sec": round(n1.start_sec, 4),
            "n1_end_sec": round(n1.end_sec, 4),
            "n2_start_sec": round(n2.start_sec, 4),
            "n2_end_sec": round(n2.end_sec, 4),
            "gap_sec": details["gap_sec"],
            "confidence": round(confidence, 2),
            "accepted": accepted,
            "reason": reason,
            "details": details
        })

    def save_outputs(self, out_mid: mido.MidiFile):
        # SIMPAN LAPORAN MENGGUNAKAN LALUAN DINAMIK INSTANCE
        try:
            out_mid.save(self.output_path)
            self.log(f"Exported repaired MIDI to: {self.output_path}")
        except Exception as e:
            self.log(f"Error saving output MIDI: {e}")

        try:
            with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    "Note_ID_1", "Note_ID_2", "Pitch", "N1_Start_Sec", "N1_End_Sec", 
                    "N2_Start_Sec", "N2_End_Sec", "Gap_Sec", "Confidence", "Accepted", "Reason"
                ])
                for d in self.merge_decisions:
                    writer.writerow([
                        d["n1_id"], d["n2_id"], d["pitch"], d["n1_start_sec"], d["n1_end_sec"],
                        d["n2_start_sec"], d["n2_end_sec"], d["gap_sec"], d["confidence"],
                        "YES" if d["accepted"] else "NO", d["reason"]
                    ])
            self.log(f"Exported CSV report to: {self.csv_path}")
        except Exception as e:
            self.log(f"Error saving CSV: {e}")

        try:
            diagnostics_payload = {
                "pipeline_stage": "stage2",
                "config": {
                    "register_boundary_pitch": Config.REGISTER_BOUNDARY_PITCH,
                    "bass": {
                        "max_gap_sec": BassConfig.MAX_GAP_SEC,
                        "min_confidence_threshold": BassConfig.MIN_CONFIDENCE_THRESHOLD,
                        "max_chain_limit": BassConfig.MAX_CHAIN_LIMIT,
                        "legato_gap_limit_sec": BassConfig.LEGATO_GAP_LIMIT_SEC,
                        "key_release_gap_sec": BassConfig.KEY_RELEASE_GAP_SEC,
                        "phrase_gap_threshold_sec": BassConfig.PHRASE_GAP_THRESHOLD_SEC,
                        "glitch_duration_sec": BassConfig.GLITCH_DURATION_SEC,
                        "rhythmic_match_tolerance": BassConfig.RHYTHMIC_MATCH_TOLERANCE,
                        "velocity_divisor": BassConfig.VELOCITY_DIVISOR,
                        "weights": {
                            "weight_gap": BassConfig.WEIGHT_GAP,
                            "weight_velocity": BassConfig.WEIGHT_VELOCITY,
                            "weight_duration_ratio": BassConfig.WEIGHT_DURATION_RATIO,
                            "weight_density": BassConfig.WEIGHT_DENSITY,
                            "weight_rhythmic_regularity": BassConfig.WEIGHT_RHYTHMIC_REGULARITY
                        }
                    },
                    "treble": {
                        "max_gap_sec": TrebleConfig.MAX_GAP_SEC,
                        "min_confidence_threshold": TrebleConfig.MIN_CONFIDENCE_THRESHOLD,
                        "max_chain_limit": TrebleConfig.MAX_CHAIN_LIMIT,
                        "legato_gap_limit_sec": TrebleConfig.LEGATO_GAP_LIMIT_SEC,
                        "key_release_gap_sec": TrebleConfig.KEY_RELEASE_GAP_SEC,
                        "phrase_gap_threshold_sec": TrebleConfig.PHRASE_GAP_THRESHOLD_SEC,
                        "glitch_duration_sec": TrebleConfig.GLITCH_DURATION_SEC,
                        "rhythmic_match_tolerance": TrebleConfig.RHYTHMIC_MATCH_TOLERANCE,
                        "velocity_divisor": TrebleConfig.VELOCITY_DIVISOR,
                        "weights": {
                            "weight_gap": TrebleConfig.WEIGHT_GAP,
                            "weight_velocity": TrebleConfig.WEIGHT_VELOCITY,
                            "weight_duration_ratio": TrebleConfig.WEIGHT_DURATION_RATIO,
                            "weight_density": TrebleConfig.WEIGHT_DENSITY,
                            "weight_rhythmic_regularity": TrebleConfig.WEIGHT_RHYTHMIC_REGULARITY
                        }
                    }
                },
                "statistics": self.stats,
                "decisions": self.merge_decisions
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
        pipeline = Stage2Pipeline(input_p, output_p, log_p, csv_p, json_p)
    else:
        pipeline = Stage2Pipeline()
    pipeline.run()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Stage 5: Piano Arrangement & Styling Pipeline (Pop2Piano-style, section-aware)
SINGLE комбинированный MIDI-файл - "Rancak" Onset Edition (Walking Bass & Polyphony Safe)

Inputs:   stage4.mid (Single Combined MIDI)
Outputs:  stage5.mid
Logs:     stage5_log.txt
Reports:  stage5_report.csv
          stage5_diagnostics.json
Sections: sections.json   (optional)
"""

import os
import sys
import csv
import json
from typing import List, Dict, Tuple, Optional, Any
from enum import Enum

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
    SECTIONS_JSON_PATH = os.path.join(BASE_DIR, "output", "sections.json")

    # Piano channel/program (0 = Acoustic Grand Piano)
    PIANO_PROGRAM = 0
    RH_CHANNEL = 0
    LH_CHANNEL = 1

    # Hand split
    SPLIT_PITCH = 60          # Middle C (C4). Notes >= this default to RH.
    SPLIT_HYSTERESIS = 3

    # RH polyphony cap (applies to "styled" sections only)
    MAX_NOTES_RH = 4
    CHORD_CLUSTER_WINDOW_SEC = 0.06
    MAX_COMFORTABLE_SPAN_SEMITONES = 14   # ~ a 10th, flagged only

    # ------------------------------------------------------------------
    # SECTION MAP
    # ------------------------------------------------------------------
    DEFAULT_SECTIONS = [
        {"label": "intro", "start_sec": 0.0, "end_sec": 11.5},
        {"label": "verse", "start_sec": 11.5, "end_sec": 999999.0},
    ]

    # label -> style name. "untouched" = copy the original stage4 notes
    SECTION_STYLE_MAP = {
        "intro": "untouched",                 # Keep the original intro EXACTLY as-is
        "verse": "pop_ballad_arpeggio",       # Flowing arpeggios start when the melody starts
        "prechorus": "pop_ballad_arpeggio",
        "chorus": "ballad_waltz",
        "bridge": "pop_ballad_arpeggio",
        "outro": "block",
    }

    Style_used = "pop_ballad_arpeggio"
    ARRANGEMENT_STYLE = "pop_ballad_arpeggio"

    # Beats per bar for the pattern grid; None = pick a sensible default per style
    BEATS_PER_BAR: Optional[int] = None

    # If set (BPM), overrides the tempo read from the MIDI file when laying out style patterns.
    STYLE_BPM_OVERRIDE: Optional[float] = None

    # How similar two consecutive LH chord "hits" must be to merge into one harmonic segment
    SEGMENT_SIMILARITY_THRESHOLD = 0.5
    SEGMENT_MAX_GAP_SEC = 1.5

    # Note-length fractions inside generated patterns
    WALTZ_BASS_LEN_FRAC = 0.9
    WALTZ_CHORD_LEN_FRAC = 0.45
    BROKEN_NOTE_LEN_FRAC = 0.85
    ALBERTI_NOTE_LEN_FRAC = 0.9
    ALTERNATING_BASS_LEN_FRAC = 0.9
    ALTERNATING_CHORD_LEN_FRAC = 0.7
    POP_ARPEGGIO_NOTE_LEN_FRAC = 0.92

    MAX_CHORD_TONES_IN_PATTERN = 2

    # Dynamics shaping (styled notes only)
    MELODY_VELOCITY_BOOST = 12
    ACCOMPANIMENT_VELOCITY_SCALE = 0.78
    DOWNBEAT_ACCENT = 8
    VELOCITY_MIN = 20
    VELOCITY_MAX = 120

    # Sustain pedal: one press per harmonic (sub-)segment.
    PEDAL_ENABLE = True
    PEDAL_CC = 64
    PEDAL_ON_VALUE = 100
    PEDAL_OFF_VALUE = 0
    PEDAL_LIFT_LEAD_SEC = 0.03


class NoteRole(Enum):
    MELODY = "MELODY"
    HARMONY = "HARMONY"
    BASS = "BASS"


class Note:
    def __init__(self, pitch: int, start_sec: float, end_sec: float,
                 velocity: int, source_track: int, source_channel: int, note_id: int):
        self.pitch = pitch
        self.start_sec = start_sec
        self.end_sec = end_sec
        self.velocity = velocity
        self.source_track = source_track
        self.source_channel = source_channel
        self.id = note_id

        self.role: Optional[NoteRole] = None
        self.hand: Optional[str] = None
        self.cluster_id: Optional[int] = None
        self.original_velocity = velocity

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


class HarmonicSegment:
    """A stretch of time where the LH harmony stays effectively the same."""
    def __init__(self, seg_id: int, start_sec: float, end_sec: float,
                 pitches: List[int], velocity: int,
                 style: Optional[str] = None, section_label: Optional[str] = None):
        self.id = seg_id
        self.start_sec = start_sec
        self.end_sec = end_sec
        self.pitches = sorted(set(pitches))
        self.velocity = velocity
        self.style = style
        self.section_label = section_label

    @property
    def bass_pitch(self) -> int:
        return self.pitches[0]

    @property
    def chord_tones(self) -> List[int]:
        return self.pitches[1:]

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)


class TempoMap:
    def __init__(self, midi_file: mido.MidiFile):
        self.ppq = midi_file.ticks_per_beat
        self.tempo_changes: List[Dict[str, Any]] = []

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
        ticks_elapsed = 0
        sec_elapsed = 0.0
        prev_tempo = 500000
        prev_tick = 0
        for change in self.tempo_changes:
            seg_ticks = change['tick'] - prev_tick
            seg_sec = (seg_ticks / self.ppq) * (prev_tempo / 1000000.0)
            if sec_elapsed + seg_sec >= sec:
                remaining_sec = sec - sec_elapsed
                remaining_ticks = int(remaining_sec * self.ppq / (prev_tempo / 1000000.0))
                return prev_tick + remaining_ticks
            sec_elapsed += seg_sec
            ticks_elapsed = change['tick']
            prev_tick = change['tick']
            prev_tempo = change['tempo']
        remaining_sec = sec - sec_elapsed
        remaining_ticks = int(remaining_sec * self.ppq / (prev_tempo / 1000000.0)) if prev_tempo else 0
        return ticks_elapsed + remaining_ticks

    def dominant_beat_seconds(self) -> float:
        if len(self.tempo_changes) == 1:
            return self.tempo_changes[0]['tempo'] / 1000000.0
        weights: Dict[int, int] = {}
        for i, change in enumerate(self.tempo_changes):
            next_tick = self.tempo_changes[i + 1]['tick'] if i + 1 < len(self.tempo_changes) else change['tick'] + self.ppq * 4
            span = max(0, next_tick - change['tick'])
            weights[change['tempo']] = weights.get(change['tempo'], 0) + span
        dominant_tempo = max(weights, key=weights.get)
        return dominant_tempo / 1000000.0


STYLE_DEFAULT_BEATS_PER_BAR = {
    "block": 4,
    "alternating": 4,
    "ballad_waltz": 3,
    "ballad_broken_arpeggio": 4,
    "alberti_bass": 4,
    "pop_ballad_arpeggio": 4,
}


class Stage5Pipeline:
    # MENERIMA PARAMETER LALUAN SECARA DINAMIK (Pembedahan Konfigurasi Dinamik)
    def __init__(self, input_path=None, output_path=None, log_path=None, csv_path=None, json_path=None, sections_json_path=None):
        self.logs: List[str] = []
        self.decisions: List[Dict[str, Any]] = []
        
        # Penyelarasan laluan parameter or fallback relatif
        self.input_path = input_path or Config.INPUT_PATH
        self.output_path = output_path or Config.OUTPUT_PATH
        self.log_path = log_path or Config.LOG_PATH
        self.csv_path = csv_path or Config.CSV_PATH
        self.json_path = json_path or Config.JSON_PATH
        self.sections_json_path = sections_json_path or Config.SECTIONS_JSON_PATH

        self.stats = {
            "loaded_notes": 0,
            "melody_notes": 0,
            "harmony_notes": 0,
            "bass_notes": 0,
            "rh_notes_untouched": 0,
            "rh_notes_styled_final": 0,
            "lh_notes_untouched": 0,
            "lh_notes_styled_final": 0,
            "notes_dropped_polyphony_cap": 0,
            "harmonic_segments_raw": 0,
            "harmonic_segments_after_section_split": 0,
            "span_warnings": 0,
            "pedal_events": 0,
        }

    def log(self, message: str, print_console: bool = True):
        self.logs.append(message)
        if print_console:
            print(message)

    def run(self):
        self.log("=" * 60)
        self.log("  STAGE 5: PIANO ARRANGEMENT & STYLING PIPELINE INITIALIZED")
        self.log(f"  Default style: {Config.ARRANGEMENT_STYLE}")
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
        notes = self.extract_notes(mid, tempo_map)
        self.stats["loaded_notes"] = len(notes)
        self.log(f"Extracted {len(notes)} notes from {len(mid.tracks)} track(s).")

        self.log("Assigning note roles (melody / harmony / bass)...")
        self.assign_roles(notes)

        self.log("Assigning hands (RH / LH) by role and register...")
        self.assign_hands(notes)

        beat_sec = self.resolve_beat_seconds(tempo_map)
        default_bar_beats = STYLE_DEFAULT_BEATS_PER_BAR.get(Config.ARRANGEMENT_STYLE, 4)
        self.log(f"Tempo grid: {beat_sec:.3f}s/beat ({60.0 / beat_sec:.1f} BPM); "
                 f"default {default_bar_beats} beats/bar.")

        self.first_vocal_time = self._detect_intro_end_time(notes, beat_sec)

        sections = self.load_sections()
        self.log(f"Loaded {len(sections)} section(s):")
        for s in sections:
            style = Config.SECTION_STYLE_MAP.get(s["label"], Config.ARRANGEMENT_STYLE)
            self.log(f"    - {s['label']:<10} {s['start_sec']:>7.2f}s -> {s['end_sec']:>7.2f}s   style={style}")
        
        rh_notes = [n for n in notes if n.hand == "RH"]
        lh_notes = [n for n in notes if n.hand == "LH"]

        self.log("Sanitizing and Quantizing Right Hand vocal melody to clean eighth-note grid...")
        rh_notes = self._sanitize_and_quantize_melody(rh_notes, beat_sec)

        rh_untouched, rh_styled = self.split_by_touch(rh_notes, sections)
        lh_untouched, lh_styled = self.split_by_touch(lh_notes, sections)
        self.stats["rh_notes_untouched"] = len(rh_untouched)
        self.stats["lh_notes_untouched"] = len(lh_untouched)
        self.log(f"RH: {len(rh_untouched)} untouched note(s), {len(rh_styled)} to arrange.")
        self.log(f"LH: {len(lh_untouched)} untouched note(s), {len(lh_styled)} to arrange.")

        self.log("Clustering + capping RH polyphony (styled sections only)...")
        self.cluster_notes(rh_styled)
        rh_styled = self.cap_rh_polyphony(rh_styled)
        self.check_hand_span(rh_styled, "RH")

        self.log("Merging LH note hits into harmonic segments (styled sections only)...")
        raw_segments = self.build_harmonic_segments(lh_styled, beat_sec)
        self.stats["harmonic_segments_raw"] = len(raw_segments)

        self.log("Clipping segments at section boundaries and assigning per-section style...")
        segments = self.split_segments_by_section(raw_segments, sections)
        self.stats["harmonic_segments_after_section_split"] = len(segments)
        self.log(f"{len(raw_segments)} raw segment(s) -> {len(segments)} section-clipped segment(s).")

        self.log("Generating clean Right-Hand harmonies (Melody-over-Chords) using active Left-Hand chords...")
        rh_styled = self._harmonize_right_hand(rh_styled, segments, beat_sec)

        self.log("Rendering per-segment styles...")
        styled_lh_notes = self.render_style(segments, beat_sec)

        self.log("Shaping dynamics (styled notes only: melody forward, accompaniment softened)...")
        self.shape_dynamics(rh_styled, styled_lh_notes, segments, beat_sec)

        self.stats["rh_notes_styled_final"] = len(rh_styled)
        self.stats["lh_notes_styled_final"] = len(styled_lh_notes)

        pedal_events: List[Tuple[float, int]] = []
        if Config.PEDAL_ENABLE:
            self.log("Generating sustain pedal (CC64) per styled harmonic segment...")
            pedal_events = self.generate_pedal(segments)
            self.stats["pedal_events"] = len(pedal_events)

        all_notes = rh_untouched + rh_styled + lh_untouched + styled_lh_notes

        self.log("Rebuilding arranged piano MIDI (RH / LH tracks)...")
        out_mid = self.build_output_midi(tempo_map.ppq, all_notes, pedal_events, tempo_map)

        self.save_outputs(out_mid)
        self.log("Stage 5 completed successfully.", print_console=True)

    def extract_notes(self, mid: mido.MidiFile, tempo_map: TempoMap) -> List[Note]:
        notes: List[Note] = []
        note_id = 0
        for track_idx, track in enumerate(mid.tracks):
            active: Dict[Tuple[int, int], Tuple[int, int]] = {}
            current_tick = 0
            for msg in track:
                current_tick += msg.time
                if msg.type == 'note_on' and msg.velocity > 0:
                    active[(msg.note, msg.channel)] = (current_tick, msg.velocity)
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    key = (msg.note, msg.channel)
                    if key in active:
                        start_tick, vel = active.pop(key)
                        notes.append(Note(
                            pitch=msg.note,
                            start_sec=tempo_map.tick_to_sec(start_tick),
                            end_sec=tempo_map.tick_to_sec(current_tick),
                            velocity=vel,
                            source_track=track_idx,
                            source_channel=msg.channel,
                            note_id=note_id,
                        ))
                        note_id += 1
            for (pitch, channel), (start_tick, vel) in active.items():
                notes.append(Note(
                    pitch=pitch,
                    start_sec=tempo_map.tick_to_sec(start_tick),
                    end_sec=tempo_map.tick_to_sec(current_tick),
                    velocity=vel,
                    source_track=track_idx,
                    source_channel=channel,
                    note_id=note_id,
                ))
                note_id += 1
        notes.sort(key=lambda n: n.start_sec)
        return notes

    def _detect_intro_end_time(self, notes: List[Note], beat_sec: float) -> float:
        melody_notes = [n for n in notes if n.role == NoteRole.MELODY]
        lh_notes = [n for n in notes if n.hand == "LH"]
        
        if not melody_notes:
            return 11.5 
            
        melody_starts = sorted([n.start_sec for n in melody_notes])
        
        real_verse_start = melody_starts[0]
        for i in range(len(melody_starts) - 1):
            gap = melody_starts[i+1] - melody_starts[i]
            if gap > 3.0:  
                real_verse_start = melody_starts[i+1]
                break
                
        if real_verse_start < 4.0:
            if lh_notes:
                lh_starts = sorted([n.start_sec for n in lh_notes])
                initial_lh = [t for t in lh_starts if t < 4.0]
                initial_density = len(initial_lh) / 4.0 if len(initial_lh) > 0 else 0.0
                
                if initial_density >= 1.5:
                    real_verse_start = 0.0
                else:
                    max_time = max(lh_starts)
                    bins = [0] * int(max_time + 2)
                    for t in lh_starts:
                        bin_idx = int(t)
                        if bin_idx < len(bins):
                            bins[bin_idx] += 1
                    
                    smoothed = []
                    for i in range(len(bins)):
                        window = bins[max(0, i-1):min(len(bins), i+2)]
                        smoothed.append(sum(window) / len(window) if window else 0)
                    
                    for t_sec in range(4, len(smoothed)):
                        if smoothed[t_sec] >= 2.0:
                            real_verse_start = float(t_sec)
                            break
                            
        max_duration = max(n.end_sec for n in notes) if notes else 0.0
        if real_verse_start < 3.0 and max_duration > 30.0:
            real_verse_start = 12.0
            
        return real_verse_start

    def _clean_and_monophonize_melody(self, notes: List[Note]) -> List[Note]:
        if not notes:
            return []
            
        filtered = [
            n for n in notes 
            if n.duration_sec >= 0.06 and n.original_velocity >= 20
        ]
        if not filtered:
            filtered = notes 
            
        filtered.sort(key=lambda n: n.start_sec)
        
        final_filtered = []
        for idx, n in enumerate(filtered):
            is_glitch = False
            if idx > 0 and idx < len(filtered) - 1:
                prev_n = filtered[idx - 1]
                next_n = filtered[idx + 1]
                if n.duration_sec < 0.15:
                    jump_prev = abs(n.pitch - prev_n.pitch)
                    jump_next = abs(n.pitch - next_n.pitch)
                    if jump_prev > 15 and jump_next > 12:
                        is_glitch = True
            if not is_glitch:
                final_filtered.append(n)
        
        monophonic: List[Note] = []
        for n in final_filtered:
            if not monophonic:
                monophonic.append(n)
                continue
                
            prev = monophonic[-1]
            
            if n.start_sec < prev.end_sec:
                prev.end_sec = n.start_sec
                
            if prev.duration_sec < 0.01:
                mid_time = (prev.start_sec + n.start_sec) / 2.0
                prev.end_sec = mid_time
                n.start_sec = mid_time
                
            if n.start_sec - prev.end_sec < 0.05:
                prev.end_sec = n.start_sec
                
            monophonic.append(n)
                
        return monophonic

    def _sanitize_and_quantize_melody(self, notes: List[Note], beat_sec: float) -> List[Note]:
        if not notes:
            return []

        melody_notes = [n for n in notes if n.role == NoteRole.MELODY]
        harmony_notes = [n for n in notes if n.role != NoteRole.MELODY]

        melody_notes.sort(key=lambda n: n.start_sec)
        merged_melody: List[Note] = []
        i = 0
        while i < len(melody_notes):
            anchor = melody_notes[i]
            group = [anchor]
            j = i + 1
            while j < len(melody_notes):
                candidate = melody_notes[j]
                gap = candidate.start_sec - group[-1].end_sec
                pitch_diff = abs(candidate.pitch - anchor.pitch)
                
                if gap < 0.08 and pitch_diff <= 2 and candidate.duration_sec < 0.3:
                    group.append(candidate)
                    j += 1
                else:
                    break
            
            if len(group) > 1:
                dominant_note = max(group, key=lambda n: n.duration_sec)
                anchor.pitch = dominant_note.pitch
                anchor.end_sec = group[-1].end_sec
                anchor.velocity = max(n.velocity for n in group)
            
            merged_melody.append(anchor)
            i = j

        all_rh_notes = merged_melody + harmony_notes
        all_rh_notes.sort(key=lambda n: n.start_sec)

        grid_step = beat_sec * 0.5  
        if grid_step < 0.05:
            grid_step = 0.25

        quantized: List[Note] = []
        for n in all_rh_notes:
            q_start = round(n.start_sec / grid_step) * grid_step
            q_end = round(n.end_sec / grid_step) * grid_step
            
            if q_end <= q_start:
                q_end = q_start + grid_step
                
            n.start_sec = q_start
            n.end_sec = q_end
            quantized.append(n)
            
        return quantized

    def _harmonize_right_hand(self, rh_notes: List[Note], segments: List[HarmonicSegment], beat_sec: float) -> List[Note]:
        harmonized: List[Note] = []
        note_id = 800000
        
        downbeat_step = beat_sec * 2.0 
        
        for n in rh_notes:
            harmonized.append(n)
            
            time_since_downbeat = n.start_sec % downbeat_step
            is_downbeat = (time_since_downbeat < 0.1) or (downbeat_step - time_since_downbeat < 0.1)
            
            if is_downbeat:
                active_seg = None
                for seg in segments:
                    if seg.start_sec <= n.start_sec < seg.end_sec:
                        active_seg = seg
                        break
                
                if active_seg and active_seg.chord_tones:
                    harmony_candidates = [
                        p for p in active_seg.chord_tones
                        if (n.pitch - 12) <= p <= (n.pitch - 3) and p >= 55
                    ]
                    
                    if harmony_candidates:
                        harmony_pitch = max(harmony_candidates)
                        
                        harmony_note = Note(
                            pitch=harmony_pitch,
                            start_sec=n.start_sec,
                            end_sec=n.end_sec,
                            velocity=int(n.velocity * 0.72),
                            source_track=-1,
                            source_channel=Config.RH_CHANNEL,
                            note_id=note_id
                        )
                        harmony_note.hand = "RH"
                        harmony_note.role = NoteRole.HARMONY
                        harmonized.append(harmony_note)
                        note_id += 1
                        
        return harmonized

    def load_sections(self) -> List[Dict[str, Any]]:
        sections = None
        if os.path.exists(self.sections_json_path):
            try:
                with open(self.sections_json_path, 'r', encoding='utf-8') as f:
                    sections = json.load(f)
                self.log(f"Loaded section map from {self.sections_json_path}")
            except Exception as e:
                self.log(f"Warning: failed to read sections.json ({e}); using DEFAULT_SECTIONS.")
                sections = None
        if not sections:
            first_vocal = getattr(self, "first_vocal_time", 11.5)
            if first_vocal > 2.0:
                self.log(f"No sections.json found. Auto-detected Intro from 0.0s to {first_vocal:.2f}s based on melody onset.")
                sections = [
                    {"label": "intro", "start_sec": 0.0, "end_sec": first_vocal},
                    {"label": "verse", "start_sec": first_vocal, "end_sec": 999999.0},
                ]
            else:
                self.log("No sections.json found, and melody starts immediately. Skipping intro.")
                sections = [
                    {"label": "verse", "start_sec": 0.0, "end_sec": 999999.0},
                ]
        return sorted(sections, key=lambda s: s["start_sec"])

    def resolve_section(self, t: float, sections: List[Dict[str, Any]]) -> Dict[str, Any]:
        for s in sections:
            if s["start_sec"] <= t < s["end_sec"]:
                return s
        return {"label": "unassigned", "start_sec": t, "end_sec": t + 1.0}

    def split_by_touch(self, notes: List[Note], sections: List[Dict[str, Any]]) -> Tuple[List[Note], List[Note]]:
        untouched, styled = [], []
        for n in notes:
            sec = self.resolve_section(n.start_sec, sections)
            style = Config.SECTION_STYLE_MAP.get(sec["label"], Config.ARRANGEMENT_STYLE)
            (untouched if style == "untouched" else styled).append(n)
        return untouched, styled

    def assign_roles(self, notes: List[Note]):
        by_time: Dict[float, List[Note]] = {}
        for n in notes:
            key = round(n.start_sec, 2)
            by_time.setdefault(key, []).append(n)

        for _, group in by_time.items():
            if len(group) == 1:
                group[0].role = NoteRole.MELODY
                continue
            group.sort(key=lambda n: n.pitch)
            group[0].role = NoteRole.BASS
            group[-1].role = NoteRole.MELODY
            for n in group[1:-1]:
                n.role = NoteRole.HARMONY

        self.stats["melody_notes"] = sum(1 for n in notes if n.role == NoteRole.MELODY)
        self.stats["harmony_notes"] = sum(1 for n in notes if n.role == NoteRole.HARMONY)
        self.stats["bass_notes"] = sum(1 for n in notes if n.role == NoteRole.BASS)

    def assign_hands(self, notes: List[Note]):
        for n in notes:
            if n.role == NoteRole.MELODY:
                n.hand = "RH"
            elif n.role == NoteRole.BASS:
                n.hand = "LH"
            elif n.pitch >= Config.SPLIT_PITCH + Config.SPLIT_HYSTERESIS:
                n.hand = "RH"
            elif n.pitch < Config.SPLIT_PITCH - Config.SPLIT_HYSTERESIS:
                n.hand = "LH"
            else:
                n.hand = "RH" if n.role == NoteRole.MELODY else "LH"

    def cluster_notes(self, notes: List[Note]):
        sorted_notes = sorted(notes, key=lambda n: n.start_sec)
        cluster_id = 0
        i = 0
        while i < len(sorted_notes):
            anchor = sorted_notes[i]
            if anchor.cluster_id is not None:
                i += 1
                continue
            group = [anchor]
            j = i + 1
            while j < len(sorted_notes) and sorted_notes[j].start_sec - anchor.start_sec <= Config.CHORD_CLUSTER_WINDOW_SEC:
                group.append(sorted_notes[j])
                j += 1
            for n in group:
                n.cluster_id = cluster_id
            cluster_id += 1
            i += 1

    def cap_rh_polyphony(self, notes: List[Note]) -> List[Note]:
        by_cluster: Dict[int, List[Note]] = {}
        for n in notes:
            by_cluster.setdefault(n.cluster_id, []).append(n)

        keep_ids = set()
        for cluster_id, group in by_cluster.items():
            melody_in_group = [n for n in group if n.role == NoteRole.MELODY]
            for n in melody_in_group:
                keep_ids.add(n.id)
                
            if len(group) <= Config.MAX_NOTES_RH:
                for n in group:
                    keep_ids.add(n.id)
                continue
                
            remaining_slots = Config.MAX_NOTES_RH - len(melody_in_group)
            if remaining_slots > 0:
                other_notes = [n for n in group if n.role != NoteRole.MELODY]
                other_notes.sort(key=lambda n: -n.velocity)
                for n in other_notes[:remaining_slots]:
                    keep_ids.add(n.id)
                    
            kept_count = sum(1 for n in group if n.id in keep_ids)
            dropped = len(group) - kept_count
            self.stats["notes_dropped_polyphony_cap"] += dropped
            self.decisions.append({
                "ref": f"rh_cluster_{cluster_id}",
                "type": "RH_POLYPHONY_CAPPED",
                "hand": "RH",
                "detail": f"{len(group)} notes -> kept melody + {max(0, remaining_slots)} harmony notes, dropped {dropped}",
            })
        return [n for n in notes if n.id in keep_ids]

    def check_hand_span(self, notes: List[Note], hand: str):
        by_cluster: Dict[int, List[Note]] = {}
        for n in notes:
            by_cluster.setdefault(n.cluster_id, []).append(n)
        for cluster_id, group in by_cluster.items():
            if len(group) < 2:
                continue
            span = max(n.pitch for n in group) - min(n.pitch for n in group)
            if span > Config.MAX_COMFORTABLE_SPAN_SEMITONES:
                self.stats["span_warnings"] += 1
                self.decisions.append({
                    "ref": f"{hand.lower()}_cluster_{cluster_id}",
                    "type": "SPAN_WARNING",
                    "hand": hand,
                    "detail": f"Span of {span} semitones exceeds comfortable reach "
                              f"({Config.MAX_COMFORTABLE_SPAN_SEMITONES}).",
                })

    def build_harmonic_segments(self, lh_notes: List[Note], beat_sec: float) -> List[HarmonicSegment]:
        if not lh_notes:
            return []

        start_time = min(n.start_sec for n in lh_notes)
        end_time = max(n.end_sec for n in lh_notes)

        grid_duration = beat_sec * 2.0 

        segments: List[HarmonicSegment] = []
        seg_id = 0

        t = 0.0
        while t < end_time:
            seg_start = t
            seg_end = min(t + grid_duration, end_time)

            window_notes = [n for n in lh_notes if n.start_sec < seg_end and n.end_sec > seg_start]

            if not window_notes:
                t = seg_end
                continue

            bass_notes = [n for n in window_notes if n.role == NoteRole.BASS]
            if bass_notes:
                bass_pitches = [n.pitch for n in bass_notes]
                root = max(set(bass_pitches), key=bass_pitches.count)
            else:
                all_pitches = [n.pitch for n in window_notes]
                root = min(all_pitches) if all_pitches else 48

            while root > 48:
                root -= 12
            while root < 24:
                root += 12

            harmony_notes = [n for n in window_notes if n.role == NoteRole.HARMONY]
            harm_pitches = [n.pitch for n in harmony_notes]
            
            pitch_classes = [p % 12 for p in harm_pitches]
            unique_classes = sorted(set(pitch_classes), key=pitch_classes.count, reverse=True)

            chord_tones = []
            for pc in unique_classes[:3]:
                tone = 48 + pc
                if tone != root:
                    chord_tones.append(tone)

            chord_tones = sorted(set(chord_tones))
            pitches = [root] + chord_tones

            avg_vel = int(sum(n.velocity for n in window_notes) / len(window_notes))

            segments.append(HarmonicSegment(
                seg_id=seg_id,
                start_sec=seg_start,
                end_sec=seg_end,
                pitches=pitches,
                velocity=avg_vel
            ))

            seg_id += 1
            t = seg_end

        return segments

    def split_segments_by_section(self, segments: List[HarmonicSegment],
                                   sections: List[Dict[str, Any]]) -> List[HarmonicSegment]:
        out: List[HarmonicSegment] = []
        next_id = 0
        for seg in segments:
            inner_bounds = [
                s["start_sec"] for s in sections
                if seg.start_sec < s["start_sec"] < seg.end_sec
            ] + [
                s["end_sec"] for s in sections
                if seg.start_sec < s["end_sec"] < seg.end_sec
            ]
            boundaries = sorted(set([seg.start_sec, seg.end_sec] + inner_bounds))

            for a, b in zip(boundaries[:-1], boundaries[1:]):
                if b - a < 1e-6:
                    continue
                mid_t = (a + b) / 2.0
                sec = self.resolve_section(mid_t, sections)
                style = Config.SECTION_STYLE_MAP.get(sec["label"], Config.ARRANGEMENT_STYLE)
                if style == "untouched":
                    continue
                out.append(HarmonicSegment(
                    next_id, a, b, seg.pitches, seg.velocity,
                    style=style, section_label=sec["label"],
                ))
                next_id += 1
        return out

    def resolve_beat_seconds(self, tempo_map: TempoMap) -> float:
        if Config.STYLE_BPM_OVERRIDE:
            return 60.0 / Config.STYLE_BPM_OVERRIDE
        return tempo_map.dominant_beat_seconds()

    def render_style(self, segments: List[HarmonicSegment], beat_sec: float) -> List[Note]:
        renderers = {
            "block": self._render_block,
            "alternating": self._render_alternating,
            "ballad_waltz": self._render_waltz,
            "ballad_broken_arpeggio": self._render_broken_arpeggio,
            "alberti_bass": self._render_alberti,
            "pop_ballad_arpeggio": self._render_pop_ballad_arpeggio,
        }

        out: List[Note] = []
        next_id = 900000
        for seg in segments:
            style = seg.style or Config.ARRANGEMENT_STYLE
            renderer = renderers.get(style)
            if renderer is None:
                self.log(f"Warning: unknown style '{style}' on segment {seg.id}, using 'block'.")
                renderer = self._render_block
            bar_beats = Config.BEATS_PER_BAR or STYLE_DEFAULT_BEATS_PER_BAR.get(style, 4)

            generated = renderer(seg, beat_sec, bar_beats)
            for pitch, start, end, vel in generated:
                n = Note(
                    pitch=pitch, start_sec=start, end_sec=max(end, start + 0.03),
                    velocity=vel, source_track=-1, source_channel=Config.LH_CHANNEL,
                    note_id=next_id,
                )
                n.hand = "LH"
                out.append(n)
                next_id += 1

            self.decisions.append({
                "ref": f"segment_{seg.id} ({seg.section_label})",
                "type": f"LH_STYLED_{style.upper()}",
                "hand": "LH",
                "detail": f"[{seg.start_sec:.2f}s-{seg.end_sec:.2f}s] pitches={seg.pitches} "
                          f"-> {len(generated)} generated note(s)",
            })
        return out

    def _chord_tones_for_pattern(self, seg: HarmonicSegment) -> List[int]:
        tones = seg.chord_tones
        if len(tones) > Config.MAX_CHORD_TONES_IN_PATTERN:
            tones = [tones[0], tones[-1]] if len(tones) >= 2 else tones
        return tones

    def _render_block(self, seg: HarmonicSegment, beat_sec: float, bar_beats: int):
        return [(p, seg.start_sec, seg.end_sec, seg.velocity) for p in seg.pitches]

    def _render_alternating(self, seg: HarmonicSegment, beat_sec: float, bar_beats: int):
        bar_len = beat_sec * bar_beats
        bass = seg.bass_pitch
        chord = self._chord_tones_for_pattern(seg)
        events = []
        t = seg.start_sec
        while t < seg.end_sec - 1e-6:
            bass_len = min(beat_sec * Config.ALTERNATING_BASS_LEN_FRAC, seg.end_sec - t)
            events.append((bass, t, t + bass_len, seg.velocity))
            chord_t = t + beat_sec * 0.5
            if chord_t < seg.end_sec:
                chord_len = min(beat_sec * Config.ALTERNATING_CHORD_LEN_FRAC, seg.end_sec - chord_t)
                for p in chord:
                    events.append((p, chord_t, chord_t + chord_len, int(seg.velocity * 0.9)))
            t += bar_len if bar_len > 0 else beat_sec
        return events

    def _render_waltz(self, seg: HarmonicSegment, beat_sec: float, bar_beats: int):
        bass = seg.bass_pitch
        chord = self._chord_tones_for_pattern(seg)
        events = []
        beats_per_bar = bar_beats or 3
        t = seg.start_sec
        beat_idx = 0
        while t < seg.end_sec - 1e-6:
            remaining = seg.end_sec - t
            beat_in_bar = beat_idx % beats_per_bar
            if beat_in_bar == 0:
                length = min(beat_sec * Config.WALTZ_BASS_LEN_FRAC, remaining)
                events.append((bass, t, t + length, seg.velocity))
            else:
                length = min(beat_sec * Config.WALTZ_CHORD_LEN_FRAC, remaining)
                for p in chord:
                    events.append((p, t, t + length, int(seg.velocity * 0.85)))
            t += beat_sec
            beat_idx += 1
        return events

    def _render_broken_arpeggio(self, seg: HarmonicSegment, beat_sec: float, bar_beats: int):
        step = beat_sec / 2.0
        pitches = seg.pitches if len(seg.pitches) >= 2 else seg.pitches * 2
        events = []
        t = seg.start_sec
        idx = 0
        while t < seg.end_sec - 1e-6:
            p = pitches[idx % len(pitches)]
            remaining = seg.end_sec - t
            length = min(step * (1.0 + Config.BROKEN_NOTE_LEN_FRAC), remaining)
            vel = seg.velocity if idx % len(pitches) == 0 else int(seg.velocity * 0.82)
            events.append((p, t, t + length, vel))
            t += step
            idx += 1
        return events

    def _render_alberti(self, seg: HarmonicSegment, beat_sec: float, bar_beats: int):
        pitches = seg.pitches
        if len(pitches) < 3:
            return self._render_alternating(seg, beat_sec, bar_beats)
        low, mid, high = pitches[0], pitches[len(pitches) // 2], pitches[-1]
        pattern = [low, high, mid, high]
        step = beat_sec / 2.0
        events = []
        t = seg.start_sec
        idx = 0
        while t < seg.end_sec - 1e-6:
            p = pattern[idx % len(pattern)]
            remaining = seg.end_sec - t
            length = min(step * Config.ALBERTI_NOTE_LEN_FRAC, remaining)
            vel = seg.velocity if p == low else int(seg.velocity * 0.85)
            events.append((p, t, t + length, vel))
            t += step
            idx += 1
        return events

    def _render_pop_ballad_arpeggio(self, seg: HarmonicSegment, beat_sec: float, bar_beats: int):
        root = seg.bass_pitch
        chord = seg.chord_tones

        p1 = root
        p2 = root + 7 if root + 7 <= 127 else root

        if chord:
            p3 = min(chord, key=lambda p: abs(p - (root + 12)))
        else:
            p3 = root + 12 if root + 12 <= 127 else root

        p4 = p2

        if p2 - p1 > 12:
            p2 = p1 + 7
        if p3 - p2 > 12:
            p3 = p2 + 5
        if abs(p4 - p3) > 12:
            p4 = p2

        pattern = [p1, p2, p3, p4]

        step = beat_sec / 2.0  
        events = []
        t = seg.start_sec
        idx = 0
        while t < seg.end_sec - 1e-6:
            p = pattern[idx % len(pattern)]
            remaining = seg.end_sec - t
            length = min(step * Config.POP_ARPEGGIO_NOTE_LEN_FRAC, remaining)
            vel = seg.velocity if idx % len(pattern) == 0 else int(seg.velocity * 0.8)
            events.append((p, t, t + length, vel))
            t += step
            idx += 1
        return events

    def shape_dynamics(self, rh_styled: List[Note], lh_styled: List[Note],
                        segments: List[HarmonicSegment], beat_sec: float):
        for n in rh_styled:
            v = n.original_velocity + Config.MELODY_VELOCITY_BOOST
            n.velocity = max(Config.VELOCITY_MIN, min(Config.VELOCITY_MAX, v))

        for n in lh_styled:
            v = int(n.velocity * Config.ACCOMPANIMENT_VELOCITY_SCALE)
            n.velocity = max(Config.VELOCITY_MIN, min(Config.VELOCITY_MAX, v))

        for seg in segments:
            bar_beats = Config.BEATS_PER_BAR or STYLE_DEFAULT_BEATS_PER_BAR.get(seg.style or Config.ARRANGEMENT_STYLE, 4)
            t = seg.start_sec
            beat_idx = 0
            while t < seg.end_sec - 1e-6:
                if beat_idx % bar_beats == 0:
                    for n in lh_styled:
                        if abs(n.start_sec - t) < 0.02 and seg.start_sec <= n.start_sec < seg.end_sec:
                            n.velocity = max(Config.VELOCITY_MIN,
                                              min(Config.VELOCITY_MAX, n.velocity + Config.DOWNBEAT_ACCENT))
                t += beat_sec
                beat_idx += 1

    def generate_pedal(self, segments: List[HarmonicSegment]) -> List[Tuple[float, int]]:
        events: List[Tuple[float, int]] = []
        for seg in segments:
            lift_time = max(0.0, seg.end_sec - Config.PEDAL_LIFT_LEAD_SEC)
            events.append((seg.start_sec, Config.PEDAL_ON_VALUE))
            events.append((lift_time, Config.PEDAL_OFF_VALUE))
        events.sort(key=lambda e: e[0])
        return events

    def build_output_midi(self, ppq: int, notes: List[Note],
                           pedal_events: List[Tuple[float, int]],
                           tempo_map: TempoMap) -> mido.MidiFile:
        out_mid = mido.MidiFile(ticks_per_beat=ppq)

        meta_track = mido.MidiTrack()
        meta_track.append(mido.MetaMessage('track_name', name='Stage5 Arrangement Meta', time=0))
        meta_track.append(mido.Message('program_change', program=Config.PIANO_PROGRAM,
                                        channel=Config.RH_CHANNEL, time=0))
        meta_track.append(mido.Message('program_change', program=Config.PIANO_PROGRAM,
                                        channel=Config.LH_CHANNEL, time=0))
        out_mid.tracks.append(meta_track)

        for hand, channel, name in (
            ("RH", Config.RH_CHANNEL, "Right Hand (Melody)"),
            ("LH", Config.LH_CHANNEL, "Left Hand (section-styled + untouched)"),
        ):
            track = mido.MidiTrack()
            track.append(mido.MetaMessage('track_name', name=name, time=0))

            events: List[Tuple[int, mido.Message]] = []
            for n in notes:
                if n.hand != hand:
                    continue
                on_tick = max(0, tempo_map.sec_to_tick(n.start_sec))
                off_tick = max(on_tick + 1, tempo_map.sec_to_tick(n.end_sec))
                events.append((on_tick, mido.Message('note_on', note=n.pitch,
                                                       velocity=n.velocity, channel=channel)))
                events.append((off_tick, mido.Message('note_off', note=n.pitch,
                                                        velocity=0, channel=channel)))

            if hand == "LH":
                for sec, val in pedal_events:
                    tick = max(0, tempo_map.sec_to_tick(sec))
                    events.append((tick, mido.Message('control_change', control=Config.PEDAL_CC,
                                                        value=val, channel=channel)))

            def sort_key(item):
                tick, msg = item
                priority = 1
                if msg.type == 'control_change':
                    priority = 0
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    priority = 1
                elif msg.type == 'note_on':
                    priority = 2
                return (tick, priority)

            events.sort(key=sort_key)
            prev_tick = 0
            for tick, msg in events:
                msg.time = max(0, tick - prev_tick)
                track.append(msg)
                prev_tick = tick

            out_mid.tracks.append(track)

        return out_mid

    def save_outputs(self, out_mid: mido.MidiFile):
        # MENGGUNAKAN INSTANCE PATHS DINAMIK (Pembedahan Konfigurasi Dinamik)
        try:
            out_mid.save(self.output_path)
            self.log(f"Exported arranged piano MIDI to: {self.output_path}")
        except Exception as e:
            self.log(f"Error saving output MIDI: {e}")

        try:
            with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(["Reference", "Type", "Hand", "Detail"])
                for d in self.decisions:
                    writer.writerow([d["ref"], d["type"], d.get("hand", ""), d.get("detail", "")])
            self.log(f"Exported CSV report to: {self.csv_path}")
        except Exception as e:
            self.log(f"Error saving CSV: {e}")

        try:
            payload = {
                "pipeline_stage": "stage5",
                "config": {
                    "default_arrangement_style": Config.ARRANGEMENT_STYLE,
                    "section_style_map": Config.SECTION_STYLE_MAP,
                    "beats_per_bar": Config.BEATS_PER_BAR,
                    "style_bpm_override": Config.STYLE_BPM_OVERRIDE,
                    "split_pitch": Config.SPLIT_PITCH,
                    "max_notes_rh": Config.MAX_NOTES_RH,
                    "segment_similarity_threshold": Config.SEGMENT_SIMILARITY_THRESHOLD,
                    "pedal_enable": Config.PEDAL_ENABLE,
                },
                "statistics": self.stats,
                "decisions": self.decisions,
            }
            with open(self.json_path, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2)
            self.log(f"Exported JSON diagnostic data to: {self.json_path}")
        except Exception as e:
            print(f"Error saving JSON: {e}")

        try:
            with open(self.log_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(self.logs))
        except Exception as e:
            print(f"Error saving TXT log: {e}")


def main():
    if len(sys.argv) > 6:
        input_p = sys.argv[1]
        output_p = sys.argv[2]
        log_p = sys.argv[3]
        csv_p = sys.argv[4]
        json_p = sys.argv[5]
        sec_json_p = sys.argv[6]
        pipeline = Stage5Pipeline(input_p, output_p, log_p, csv_p, json_p, sec_json_p)
    else:
        pipeline = Stage5Pipeline()
    pipeline.run()


if __name__ == "__main__":
    main()

// --- Music Theory Profiles (Krumhansl-Schmuckler Key Finding) ---
const K_K_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const K_K_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Speller maps for accurate diatonic rendering matching the target Key Signatures
const KEY_MAPS = {
    "C":  ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"],
    "G":  ["C", "^C", "D", "^D", "E", "=F", "F", "G", "^G", "A", "^A", "B"],
    "D":  ["=C", "C", "D", "^D", "E", "=F", "F", "G", "^G", "A", "^A", "B"],
    "A":  ["=C", "C", "D", "^D", "E", "=F", "F", "=G", "G", "A", "^A", "B"],
    "E":  ["=C", "C", "=D", "D", "E", "=F", "F", "=G", "G", "A", "^A", "B"],
    "B":  ["=C", "C", "=D", "D", "E", "=F", "F", "=G", "G", "=A", "A", "B"],
    "F#": ["=C", "C", "=D", "D", "=E", "E", "F", "=G", "G", "=A", "A", "B"],
    "F":  ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "B", "=B"],
    "Bb": ["C", "^C", "D", "^D", "=E", "E", "^F", "G", "^G", "A", "B", "=B"],
    "Eb": ["C", "^C", "D", "^D", "=E", "E", "^F", "G", "=A", "A", "B", "=B"],
    "Ab": ["C", "C", "D", "^D", "=E", "E", "^F", "G", "=A", "A", "B", "=B"],
    "Db": ["C", "C", "D", "^D", "=E", "E", "F", "G", "=A", "A", "B", "=B"]
};
// Map minors as aliases to relative major scale sets
KEY_MAPS["Am"] = KEY_MAPS["C"]; KEY_MAPS["Em"] = KEY_MAPS["G"]; KEY_MAPS["Bm"] = KEY_MAPS["D"];
KEY_MAPS["F#m"] = KEY_MAPS["A"]; KEY_MAPS["C#m"] = KEY_MAPS["E"]; KEY_MAPS["G#m"] = KEY_MAPS["B"];
KEY_MAPS["Dm"] = KEY_MAPS["F"]; KEY_MAPS["Gm"] = KEY_MAPS["Bb"]; KEY_MAPS["Cm"] = KEY_MAPS["Eb"];
KEY_MAPS["Fm"] = KEY_MAPS["Ab"]; KEY_MAPS["Bbm"] = KEY_MAPS["Db"];

// --- Layout Range Variables (Standard 88 Keys, Static Keyboard) ---
const RANGE_START = 21; // A0 (Fixed full 88-key layout)
const RANGE_END = 108;  // C8 (Fixed full 88-key layout)
const IS_BLACK_KEY = [false, true, false, true, false, false, true, false, true, false, true, false];

// --- Application State ---
let midiData = null;
let isPlaying = false;
let isLooping = false;
let playbackSpeed = 1.0;
let noteSpeed = 200; // Falling speed in pixels/sec
let totalDuration = 0;
let currentPlaybackTime = 0;
let lastFrameTime = performance.now();
let lastTriggeredTime = 0;

// Optimized Audio Trigger Heads
let playbackNoteIndex = 0;
let sheetPlaybackNoteIndex = 0;
let verticalPlaybackNoteIndex = 0;
let studioPlaybackNoteIndex = 0;
let maxNoteDuration = 5; // Updated dynamically upon loading file

// DSP nodes
let activeInstrument = null;
let samplerPiano = null;
let samplerLoaded = false;
let reverbNode = null;
let volNode = null;

// Audio Optimization DSP Nodes
let masterCompressor = null;
let masterLimiter = null;

// --- Voice Management (added for polyphony / dropout fix) ---
// Tracks currently-sounding voices so we can gracefully release the quietest
// one before hitting the polyphony ceiling, instead of letting the sampler
// hard-cut the oldest voice (which is what produced the audible "choke" /
// sudden silence when many keys played at once).
const MAX_ACTIVE_VOICES = 32; // tune per device; try 24-40
let activeVoiceLog = []; // { note, velocity, releaseTime }

// Per-pitch bookkeeping: if the same key is retriggered while its previous
// hit is still ringing (common in dense/repeated-note passages), calling
// triggerAttack again on top of it makes two overlapping voices on the same
// sample, which phases/smears and can sound like a glitch. We release the
// old one first.
let activeVoiceByPitch = new Map(); // noteName -> releaseTime

// Mega-chord / massive-burst congestion control: if an unusually large
// number of note-on events land inside the same short window (e.g. a giant
// block chord or a dense multi-hand run hits all at once), triggering every
// single one synchronously is what causes the remaining "bit buggy" stutter
// even after the voice-guard fix above. We cap how many *new* voices we're
// willing to start per burst window and silently skip the extra low-velocity
// ones — visually the keys still light up (that's driven elsewhere), but we
// stop asking the audio engine to spin up more voices than it can service
// smoothly in one instant.
const BURST_WINDOW_SEC = 0.02;   // ~20ms — notes this close together count as one "burst"
const MAX_TRIGGERS_PER_BURST = 18; // hard ceiling on new voices started within a burst
let burstWindowStart = 0;
let burstTriggerCount = 0;

function triggerNoteWithVoiceGuard(noteName, duration, time, velocity) {
    if (!activeInstrument) return;

    const now = Tone.now();
    const scheduledTime = time || now;

    // --- Burst congestion control ---
    if (scheduledTime - burstWindowStart > BURST_WINDOW_SEC) {
        // New burst window
        burstWindowStart = scheduledTime;
        burstTriggerCount = 0;
    }
    burstTriggerCount++;
    if (burstTriggerCount > MAX_TRIGGERS_PER_BURST && (velocity || 0.8) < 0.55) {
        // We're deep into a massive simultaneous-note burst and this is one
        // of the quieter notes in it — skip starting a new voice for it
        // entirely rather than adding more load on top of an already
        // saturated instant. Louder/melody notes still get through.
        return;
    }

    // --- Same-pitch retrigger guard ---
    if (activeVoiceByPitch.has(noteName) && activeVoiceByPitch.get(noteName) > now) {
        if (typeof activeInstrument.triggerRelease === 'function') {
            activeInstrument.triggerRelease(noteName, now);
        }
        activeVoiceLog = activeVoiceLog.filter(v => v.note !== noteName);
    }

    // --- Overall polyphony guard (existing behavior) ---
    activeVoiceLog = activeVoiceLog.filter(v => v.releaseTime > now);
    if (activeVoiceLog.length >= MAX_ACTIVE_VOICES) {
        // Release the quietest currently-held voice instead of letting the
        // engine hard-kill the oldest one — much less audible.
        activeVoiceLog.sort((a, b) => a.velocity - b.velocity);
        const victim = activeVoiceLog.shift();
        if (victim && typeof activeInstrument.triggerRelease === 'function') {
            activeInstrument.triggerRelease(victim.note, now);
        }
        activeVoiceByPitch.delete(victim?.note);
    }

    activeInstrument.triggerAttackRelease(noteName, duration, time, velocity);
    const releaseTime = scheduledTime + (duration || 0.1) + 0.15;
    activeVoiceLog.push({ note: noteName, velocity: velocity || 0.8, releaseTime });
    activeVoiceByPitch.set(noteName, releaseTime);
}

// Hardware Clock PLL Synchronization State Anchors
let audioStartTime = 0;
let logicalStartTime = 0;

// Setup a global variable for splendid piano
let splendidPiano = null;
let splendidLoaded = false;

// Note tracking maps
let activeNotesMemory = [];
let pianoKeysMap = new Map();
let particles = [];

// Layout metrics scaled dynamically
let totalWhiteKeys = 0;
let whiteKeyWidth = 0;
let blackKeyWidth = 0;

// --- Studio State ---
let studioNotesMemory = [];
let isStudioUnlocked = false;
let isStudioPlaying = false;
let studioPlaybackTime = 0;
let studioLastFrameTime = 0;
let studioPlaybackTimer = null;

// DOM Elements
const elCanvas = document.getElementById('visualizer-canvas');
const ctx = elCanvas.getContext('2d');
const elKeyboard = document.getElementById('piano-keyboard');
const elTimeline = document.getElementById('timeline');
const elTimeDisplay = document.getElementById('time-display');

const btnPlay = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const btnStop = document.getElementById('btn-stop');
const btnRestart = document.getElementById('btn-restart');
const btnSheet = document.getElementById('btn-sheet');
const btnLoop = document.getElementById('btn-loop');
const selectSpeed = document.getElementById('select-speed');
const sliderZoom = document.getElementById('slider-zoom');
const selectInstrument = document.getElementById('select-instrument');
const sliderVolume = document.getElementById('slider-volume');
const sliderReverb = document.getElementById('slider-reverb');
const fileInput = document.getElementById('midi-file');
const elSamplerStatus = document.getElementById('sampler-status');

// Sheet Music Elements
const elSheetModal = document.getElementById('sheet-modal');
const btnCloseSheet = document.getElementById('btn-close-sheet');
const elSheetMusicNotation = document.getElementById('sheet-music-notation');

// Playback Sync Memory
let sheetMusicPlaying = false;
let sheetMusicPlaybackTime = 0;
let sheetMusicLastFrameTime = 0;
let sheetMusicPlaybackTimer = null;
const pixelsPerSecond = 120; // Proportional horizontal scale

// Vertical Portrait Sheet Playback states
let isVerticalPlaying = false;
let verticalPlaybackTime = 0;
let verticalLastFrameTime = 0;
let verticalPlaybackTimer = null;
let activeVerticalContainerId = "";

// Class wrapper to seamlessly connect smplr SplendidGrandPiano with Tone.js syntax
class SmplrToneWrapper {
    constructor(smplrInstance) {
        this.smplr = smplrInstance;
    }
    triggerAttackRelease(noteName, duration, time, velocity) {
        // smplr expects midi-scaled velocity values from 0 to 127
        const midiVelocity = Math.round((velocity || 0.8) * 127);
        this.smplr.start({
            note: noteName,
            time: time,
            duration: duration,
            velocity: midiVelocity
        });
    }
    // Added specific triggerRelease mapping to stop notes individually and prevent voice stacking
    triggerRelease(noteName, time) {
        try {
            if (this.smplr && typeof this.smplr.stop === 'function') {
                this.smplr.stop(noteName, time);
            }
        } catch (e) {
            // Safe silent catch
        }
    }
    releaseAll() {
        if (this.smplr && typeof this.smplr.stop === 'function') {
            this.smplr.stop();
        }
    }
    dispose() {
        // Kept alive globally to avoid reloading buffers from CDN
    }
}

// --- Audio Synthesizer Construction ---
function setupAudioEngine() {
    // 1. Optimize internal latency of Tone scheduler queue to preserve lookahead buffer
    // Raised from 0.08 -> 0.15: dense chords/runs were blowing past the old
    // 80ms buffer while the render loop was also doing canvas/particle work
    // on the same thread, causing the scheduler to fall behind and produce
    // the "laggy / cuts out for a second" symptom under heavy polyphony.
    Tone.context.lookAhead = 0.15;
    // Smaller scheduler tick so playback stays smoother when many notes
    // are queued back-to-back.
    Tone.context.updateInterval = 0.03;
    // "playback" trades a little extra output latency for a larger, more
    // forgiving audio buffer under the hood — worth it here since this is a
    // visualizer/player, not a live-input instrument, and it's the setting
    // that matters most for surviving massive simultaneous-note bursts
    // without underrunning.
    try { Tone.context.latencyHint = "playback"; } catch (e) { /* not all contexts allow reassignment after construction; safe to ignore */ }

    // 2. Create a Master Limiter to physically clamp clipping spikes above -1dB
    masterLimiter = new Tone.Limiter(-1).toDestination();

    // 3. Create a Master Compressor to dynamically smooth heavy chords
    // Softened attack/ratio slightly so sudden bursts of many simultaneous
    // notes don't get slammed all at once (which read as an abrupt dip/choke).
    masterCompressor = new Tone.Compressor({
        threshold: -18, // DB compression trigger offset
        ratio: 3,       // dynamic compression ratio (was 4)
        attack: 0.03,   // slower attack avoids grabbing every transient (was 0.015)
        release: 0.25   // release envelope (was 0.12)
    }).connect(masterLimiter);

    // 4. Connect Reverb Unit to Compressor
    reverbNode = new Tone.Reverb({
        roomSize: 0.8,  // Clean decay width
        wet: 0.25       // Lower wet mix slightly to preserve transient attacks
    }).connect(masterCompressor);

    // 5. Connect Master Volume to Reverb
    volNode = new Tone.Volume(-12).connect(reverbNode); // Lowered baseline output level to preserve digital headroom

    // Initiate loading of sampled piano assets asynchronously immediately
    loadSampledPiano();

    // Set initial fallback/dynamic instrument
    setInstrument('sampled');
}

// Load premium real concert piano samples asynchronously
function loadSampledPiano() {
    if (samplerPiano) return;

    elSamplerStatus.textContent = "• Loading Samples...";
    elSamplerStatus.style.color = "#fbbf24";

    samplerPiano = new Tone.Sampler({
        urls: {
            "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
            "A1": "A1.mp3", "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
            "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
            "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
            "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
            "A5": "A5.mp3", "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
            "A6": "A6.mp3", "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
            "A7": "A7.mp3", "C8": "C8.mp3"
        },
        // Lowered from 1.5 -> 1.1 previously; lowered further to 0.7 here.
        // A long release keeps voices "held" long after a note visually ends,
        // which fills the polyphony ceiling much faster during dense passages
        // and triggers voice-stealing sooner than it looks like it should.
        release: 0.7,
        maxPolyphony: 32, // Raised from 24 — was hitting the ceiling too easily on dense chords/runs
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        onload: () => {
            samplerLoaded = true;
            elSamplerStatus.textContent = "• Ready";
            elSamplerStatus.style.color = "#10b981";
            
            // If the active dropdown choice is 'sampled', smoothly route it live
            if (selectInstrument.value === 'sampled') {
                if (activeInstrument && activeInstrument !== samplerPiano) {
                    activeInstrument.releaseAll();
                    activeInstrument.dispose();
                }
                activeInstrument = samplerPiano;
                activeInstrument.connect(volNode);
            }
        },
        onerror: (err) => {
            console.warn("Could not load high-def sampler nodes. Falling back to synthesized engines.", err);
            elSamplerStatus.textContent = "• Error";
            elSamplerStatus.style.color = "#ef4444";
        }
    });
}

async function setInstrument(type) {
    // Stop prior notes
    if (activeInstrument) {
        activeInstrument.releaseAll();
        // Avoid disposing of our premium sample node or splendid wrapper
        if (activeInstrument !== samplerPiano && activeInstrument !== splendidPiano) {
            activeInstrument.dispose();
        }
    }

    // Clear voice-guard state whenever the instrument changes so stale
    // entries from the previous instrument don't cause unnecessary early
    // releases or bogus burst-window counts.
    activeVoiceLog = [];
    activeVoiceByPitch.clear();
    burstWindowStart = 0;
    burstTriggerCount = 0;

    if (type === 'splendid') {
        if (!splendidPiano) {
            elSamplerStatus.textContent = "• Loading HD Steinway...";
            elSamplerStatus.style.color = "#fbbf24";

            try {
                // Dynamically import the ES module directly from the browser CDN
                const { SplendidGrandPiano } = await import("https://unpkg.com/smplr/dist/index.mjs");
                
                const inst = new SplendidGrandPiano(Tone.context.rawContext, {
                    destination: volNode.input
                });

                const loadPromise = inst.ready || inst.load || Promise.resolve();
                await loadPromise;

                splendidLoaded = true;
                splendidPiano = new SmplrToneWrapper(inst);
                elSamplerStatus.textContent = "• Ready";
                elSamplerStatus.style.color = "#10b981";
                if (selectInstrument.value === 'splendid') {
                    activeInstrument = splendidPiano;
                }
            } catch (err) {
                console.error("Failed to load Splendid Grand Piano ES Module:", err);
                elSamplerStatus.textContent = "• Error Loading";
                elSamplerStatus.style.color = "#ef4444";
            }
        } else {
            activeInstrument = splendidPiano;
            if (splendidLoaded) {
                elSamplerStatus.textContent = "• Ready";
                elSamplerStatus.style.color = "#10b981";
            }
        }
    } else if (type === 'sampled') {
        if (samplerLoaded) {
            activeInstrument = samplerPiano;
            activeInstrument.connect(volNode);
        } else {
            // Temporary warm synth fallback while downloading (Optimized with voice caps)
            activeInstrument = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 32, // Raised from 24
                oscillator: { type: "sine" },
                envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 0.8 }
            }).connect(volNode);
        }
    } else if (type === 'grand') {
        activeInstrument = new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: 32, // Raised from 24
            oscillator: { type: "sine" },
            envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 0.8 }
        }).connect(volNode);
    } else if (type === 'rhodes') {
        activeInstrument = new Tone.PolySynth(Tone.FMSynth, {
            maxPolyphony: 32, // Raised from 24
            harmonicity: 3.05,
            modulationIndex: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.008, decay: 1.5, sustain: 0.1, release: 0.8 },
            modulation: { type: "triangle" },
            modulationEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.0, release: 0.25 }
        }).connect(volNode);
    } else if (type === 'ambient') {
        activeInstrument = new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: 16, // Capped lower to prevent CPU buffer underruns
            oscillator: { type: "triangle" },
            envelope: { attack: 0.15, decay: 2.0, sustain: 0.5, release: 2.0 }
        }).connect(volNode);
    } else if (type === 'chiptune') {
        activeInstrument = new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: 32, // Raised from 24
            oscillator: { type: "square" },
            envelope: { attack: 0.002, decay: 0.3, sustain: 0.15, release: 0.3 }
        }).connect(volNode);
    }
}

// --- Parsing Management Engine ---
function loadMidi(buffer) {
    stopPlayback();
    
    midiData = new Midi(buffer);
    activeNotesMemory = [];

    // Rebuild Graphics & Keys matching 88 standard keys
    calculateLayoutMetrics();
    createKeyboard();

    // Populate active playback buffer
    let noteCount = 0;
    midiData.tracks.forEach(track => {
        track.notes.forEach(note => {
            if (note.midi >= RANGE_START && note.midi <= RANGE_END) {
                activeNotesMemory.push({
                    midi: note.midi,
                    time: note.time,
                    duration: note.duration,
                    name: note.name,
                    velocity: note.velocity,
                });
                noteCount++;
            }
        });
    });

    activeNotesMemory.sort((a, b) => a.time - b.time);

    totalDuration = midiData.duration;
    lastTriggeredTime = 0;

    // Extract maximum length parameters to dynamically calculate visual canvas boundaries
    maxNoteDuration = activeNotesMemory.reduce((max, n) => Math.max(max, n.duration), 2);
    if (maxNoteDuration > 15) maxNoteDuration = 15; // Cap to keep render checks small

    // Seeding dynamic non-destructive studio database immediately
    initStudioData();

    // KEY SIGNATURE RESOLUTION: Extract native metadata directly from file
    const detectedKeyName = getMidiKeySignature();

    // Populate DOM elements instantly
    document.getElementById('stat-name').textContent = midiData.name || "Untitled";
    document.getElementById('stat-duration').textContent = Math.round(totalDuration) + "s";
    document.getElementById('stat-tempo').textContent = Math.round(midiData.header.tempos[0]?.bpm || 120) + " BPM";
    document.getElementById('stat-tracks').textContent = midiData.tracks.length;
    document.getElementById('stat-notes').textContent = noteCount;
    document.getElementById('stat-key').textContent = detectedKeyName;

    // Timeline ranges update
    elTimeline.max = totalDuration;
    elTimeline.value = 0;
    currentPlaybackTime = 0;
    updateTimeDisplay();

    // Enable Interactive states
    btnPlay.disabled = false;
    btnStop.disabled = false;
    btnRestart.disabled = false;
    btnSheet.disabled = false;
    elTimeline.disabled = false;
    
    playbackNoteIndex = 0;
    updatePlaybackNoteIndex();
}

// --- Audio & Playback Control Operations ---
function startPlayback() {
    if (isPlaying) return;
    if (Tone.context.state !== 'running') {
        Tone.start();
    }
    isPlaying = true;
    lastFrameTime = performance.now();
    
    // Anchor the Phase-Locked Loop Hardware Clocks
    audioStartTime = Tone.now();
    logicalStartTime = currentPlaybackTime;
    
    btnPlay.disabled = true;
    btnPause.disabled = false;
    updatePlaybackNoteIndex();
}

// Pause operation
function pausePlayback() {
    isPlaying = false;
    btnPlay.disabled = false;
    btnPause.disabled = true;
    activeInstrument.releaseAll();
    activeVoiceLog = [];
    activeVoiceByPitch.clear();
}

function stopPlayback() {
    isPlaying = false;
    currentPlaybackTime = 0;
    lastTriggeredTime = 0;
    playbackNoteIndex = 0;
    elTimeline.value = 0;
    updateTimeDisplay();
    btnPlay.disabled = (midiData === null);
    btnPause.disabled = true;
    activeInstrument.releaseAll();
    activeVoiceLog = [];
    activeVoiceByPitch.clear();
}

function updatePlaybackNoteIndex() {
    if (!activeNotesMemory || activeNotesMemory.length === 0) return;
    let low = 0;
    let high = activeNotesMemory.length - 1;
    let ans = activeNotesMemory.length;
    while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (activeNotesMemory[mid].time >= currentPlaybackTime) {
            ans = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    playbackNoteIndex = ans;
}

function seekTo(time) {
    currentPlaybackTime = Math.max(0, Math.min(time, totalDuration));
    lastTriggeredTime = currentPlaybackTime;
    
    // Re-Anchor the Phase-Locked Loop Clocks on seek
    audioStartTime = Tone.now();
    logicalStartTime = currentPlaybackTime;
    
    updatePlaybackNoteIndex();
    updateTimeDisplay();
    activeInstrument.releaseAll();
    activeVoiceLog = [];
    activeVoiceByPitch.clear();
}

function updateTimeDisplay() {
    const format = (t) => {
        const m = Math.floor(t / 60).toString().padStart(2, '0');
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    elTimeDisplay.textContent = `${format(currentPlaybackTime)} / ${format(totalDuration)}`;
}

// --- Studio Initialization and Rendering Handlers ---
function initStudioData() {
    if (!activeNotesMemory) return;
    // Create a local deep copy of notes to avoid mutating live data before save
    studioNotesMemory = activeNotesMemory.map(note => ({ ...note }));
    isStudioUnlocked = false;

    // Hide/Lock filter controls by default
    document.getElementById('studio-filter-controls').style.display = 'none';
    document.getElementById('studio-removal-preview-container').style.display = 'none';
    
    const unlockBtn = document.getElementById('btn-studio-unlock');
    if (unlockBtn) {
        unlockBtn.textContent = "Unlock Edit";
        unlockBtn.style.backgroundColor = "#fbbf24";
        unlockBtn.style.color = "#111115";
    }

    updateStudioTable();
    updateStudioPreview();
    renderStudioSheetMusic('sheet-music-notation-studio');
}

function updateStudioPreview() {
    const thresholdInput = document.getElementById('input-studio-cut-velo');
    const threshold = parseFloat(thresholdInput.value) || 0.48;
    document.getElementById('lbl-studio-current-threshold').textContent = threshold.toFixed(2);

    const previewContainer = document.getElementById('studio-removal-preview-container');
    const previewList = document.getElementById('studio-removal-preview-list');

    // Find all elements configured to be removed (velocity <= threshold value)
    const toRemove = studioNotesMemory.filter(note => (note.velocity || 0.8) <= threshold);

    if (toRemove.length > 0 && isStudioUnlocked) {
        previewContainer.style.display = 'flex';
        previewList.innerHTML = toRemove.map(note => {
            return `<span style="background: #3b0712; border: 1px solid #991b1b; padding: 4px 8px; border-radius: 4px; display: inline-block; font-size: 0.8rem; color: #fecaca;">
                Key: <strong>${note.name}</strong>, Time: ${note.time.toFixed(2)}s, Velo: <strong>${(note.velocity || 0.8).toFixed(2)}</strong>
            </span>`;
        }).join('');
    } else {
        previewContainer.style.display = 'none';
        previewList.innerHTML = '';
    }
}

function updateStudioTable() {
    const tableBody = document.getElementById('studio-event-table-body');
    tableBody.innerHTML = '';

    studioNotesMemory.forEach((note, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--panel-border)';
        if (index % 2 === 1) {
            tr.style.background = '#20202c';
        }

        const inputStyle = "background: transparent; border: none; color: inherit; font-family: inherit; font-size: inherit; width: 60px; outline: none; padding: 2px;";
        const editableInputStyle = "background: #20202c; border: 1px solid var(--panel-border); color: #fff; font-family: inherit; font-size: inherit; width: 65px; border-radius: 4px; padding: 2px;";

        // # Index
        const tdIndex = document.createElement('td');
        tdIndex.style.padding = '10px 12px';
        tdIndex.style.color = 'var(--text-muted)';
        tdIndex.textContent = index + 1;
        tr.appendChild(tdIndex);

        // Time (s)
        const tdTime = document.createElement('td');
        tdTime.style.padding = '10px 12px';
        const inputTime = document.createElement('input');
        inputTime.type = 'number';
        inputTime.step = '0.001';
        inputTime.value = note.time.toFixed(4);
        inputTime.disabled = !isStudioUnlocked;
        inputTime.style.cssText = isStudioUnlocked ? editableInputStyle : inputStyle;
        inputTime.addEventListener('change', (e) => {
            note.time = parseFloat(e.target.value) || 0;
            studioNotesMemory.sort((a, b) => a.time - b.time);
            updateStudioTable();
            renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdTime.appendChild(inputTime);
        tr.appendChild(tdTime);

        // Pitch (MIDI)
        const tdPitch = document.createElement('td');
        tdPitch.style.padding = '10px 12px';
        const inputPitch = document.createElement('input');
        inputPitch.type = 'number';
        inputPitch.min = RANGE_START;
        inputPitch.max = RANGE_END;
        inputPitch.value = note.midi;
        inputPitch.disabled = !isStudioUnlocked;
        inputPitch.style.cssText = isStudioUnlocked ? editableInputStyle : inputStyle;
        inputPitch.addEventListener('change', (e) => {
            const newMidi = parseInt(e.target.value) || 60;
            note.midi = Math.max(RANGE_START, Math.min(newMidi, RANGE_END));
            note.name = Tone.Frequency(note.midi, "midi").toNote();
            updateStudioTable();
            renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdPitch.appendChild(inputPitch);
        tr.appendChild(tdPitch);

        // Name
        const tdName = document.createElement('td');
        tdName.style.padding = '10px 12px';
        tdName.style.fontWeight = '600';
        tdName.style.color = 'var(--accent-color)';
        tdName.textContent = note.name;
        tr.appendChild(tdName);

        // Duration (s)
        const tdDuration = document.createElement('td');
        tdDuration.style.padding = '10px 12px';
        const inputDuration = document.createElement('input');
        inputDuration.type = 'number';
        inputDuration.step = '0.001';
        inputDuration.value = note.duration.toFixed(4);
        inputDuration.disabled = !isStudioUnlocked;
        inputDuration.style.cssText = isStudioUnlocked ? editableInputStyle : inputStyle;
        inputDuration.addEventListener('change', (e) => {
            note.duration = Math.max(0.001, parseFloat(e.target.value) || 0.1);
            renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdDuration.appendChild(inputDuration);
        tr.appendChild(tdDuration);

        // Velocity
        const tdVelocity = document.createElement('td');
        tdVelocity.style.padding = '10px 12px';
        const inputVelocity = document.createElement('input');
        inputVelocity.type = 'number';
        inputVelocity.step = '0.01';
        inputVelocity.min = '0';
        inputVelocity.max = '1';
        inputVelocity.value = (note.velocity || 0.8).toFixed(2);
        inputVelocity.disabled = !isStudioUnlocked;
        inputVelocity.style.cssText = isStudioUnlocked ? editableInputStyle : inputStyle;
        inputVelocity.addEventListener('change', (e) => {
            note.velocity = Math.max(0, Math.min(parseFloat(e.target.value) || 0.8, 1));
            updateStudioPreview();
        });
        tdVelocity.appendChild(inputVelocity);
        tr.appendChild(tdVelocity);

        // Actions (Single manual delete column)
        const tdActions = document.createElement('td');
        tdActions.style.padding = '10px 12px';
        const btnDelete = document.createElement('button');
        btnDelete.textContent = "Delete";
        btnDelete.style.cssText = "background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600;";
        btnDelete.disabled = !isStudioUnlocked;
        if (!isStudioUnlocked) btnDelete.style.opacity = '0.3';
        btnDelete.addEventListener('click', () => {
            studioNotesMemory.splice(index, 1);
            updateStudioTable();
            updateStudioPreview();
            renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdActions.appendChild(btnDelete);
        tr.appendChild(tdActions);

        tableBody.appendChild(tr);
    });
}

// --- Event Listener Mapping ---
function setupEventListeners() {
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => loadMidi(event.target.result);
        reader.readAsArrayBuffer(file);
    });

    btnPlay.addEventListener('click', startPlayback);
    btnPause.addEventListener('click', pausePlayback);
    btnStop.addEventListener('click', stopPlayback);
    btnRestart.addEventListener('click', () => { seekTo(0); startPlayback(); });

    // Tab interface handlers inside the Sheet Music Modal
    const btnTabNotation = document.getElementById('btn-tab-notation');
    const btnTabRaw = document.getElementById('btn-tab-raw');
    const btnTabStudio = document.getElementById('btn-tab-studio');

    const contentNotation = document.getElementById('sheet-tab-notation-content');
    const contentRaw = document.getElementById('sheet-tab-raw-content');
    const contentStudio = document.getElementById('sheet-tab-studio-content');

    // Sheet Playback Controls
    const btnPlaySheet = document.getElementById('btn-play-sheet');
    const btnStopSheet = document.getElementById('btn-stop-sheet');

    // Embedded Section 2 Controls
    const btnPlaySecond = document.getElementById('btn-play-second');
    const btnStopSecond = document.getElementById('btn-stop-second');
    const btnMaximizeSecond = document.getElementById('btn-maximize-second');
    const btnDownloadSecond = document.getElementById('btn-download-second');
    const chkShowColors = document.getElementById('chk-show-colors');

    // Maximized Popup Modal Elements
    const secondSheetMaxModal = document.getElementById('second-sheet-max-modal');
    const btnPlayMax = document.getElementById('btn-play-max');
    const btnStopMax = document.getElementById('btn-stop-max');
    const btnDownloadMax = document.getElementById('btn-download-max');
    const btnCloseMax = document.getElementById('btn-close-max');

    // Custom studio nodes
    const btnStudioUnlock = document.getElementById('btn-studio-unlock');
    const studioFilterControls = document.getElementById('studio-filter-controls');
    const btnStudioApplyFilter = document.getElementById('btn-studio-apply-filter');
    const inputStudioCutVelo = document.getElementById('input-studio-cut-velo');
    const btnStudioSave = document.getElementById('btn-studio-save');
    const btnStudioPlayScore = document.getElementById('btn-studio-play-score');
    const btnStudioStopScore = document.getElementById('btn-studio-stop-score');

    btnTabNotation.addEventListener('click', () => {
        stopSheetPlayback();
        stopVerticalPlayback();
        stopStudioPlayback();
        btnTabNotation.style.backgroundColor = 'var(--accent-color)';
        btnTabNotation.style.color = 'var(--text-color)';
        btnTabRaw.style.backgroundColor = '#20202c';
        btnTabRaw.style.color = 'var(--text-muted)';
        btnTabStudio.style.backgroundColor = '#20202c';
        btnTabStudio.style.color = 'var(--text-muted)';
        contentNotation.style.display = 'block';
        contentRaw.style.display = 'none';
        contentStudio.style.display = 'none';

        btnPlaySheet.style.display = 'inline-block';
        btnStopSheet.style.display = 'inline-block';
    });

    btnTabRaw.addEventListener('click', () => {
        stopSheetPlayback();
        stopVerticalPlayback();
        stopStudioPlayback();
        btnTabRaw.style.backgroundColor = 'var(--accent-color)';
        btnTabRaw.style.color = 'var(--text-color)';
        btnTabNotation.style.backgroundColor = '#20202c';
        btnTabNotation.style.color = 'var(--text-muted)';
        btnTabStudio.style.backgroundColor = '#20202c';
        btnTabStudio.style.color = 'var(--text-muted)';
        contentNotation.style.display = 'none';
        contentRaw.style.display = 'flex';
        contentStudio.style.display = 'none';
        populateRawMidiData();

        btnPlaySheet.style.display = 'none';
        btnStopSheet.style.display = 'none';
    });

    btnTabStudio.addEventListener('click', () => {
        stopSheetPlayback();
        stopVerticalPlayback();
        stopStudioPlayback();
        btnTabStudio.style.backgroundColor = 'var(--accent-color)';
        btnTabStudio.style.color = 'var(--text-color)';
        btnTabNotation.style.backgroundColor = '#20202c';
        btnTabNotation.style.color = 'var(--text-muted)';
        btnTabRaw.style.backgroundColor = '#20202c';
        btnTabRaw.style.color = 'var(--text-muted)';
        contentNotation.style.display = 'none';
        contentRaw.style.display = 'none';
        contentStudio.style.display = 'flex';
        
        updateStudioTable();
        updateStudioPreview();
        renderStudioSheetMusic('sheet-music-notation-studio');

        btnPlaySheet.style.display = 'none';
        btnStopSheet.style.display = 'none';
    });

    btnPlaySheet.addEventListener('click', () => {
        startSheetPlayback();
    });

    btnStopSheet.addEventListener('click', stopSheetPlayback);

    // Embedded Section 2 Control bindings
    btnPlaySecond.addEventListener('click', () => {
        if (isVerticalPlaying && activeVerticalContainerId === 'sheet-music-notation-vertical') {
            stopVerticalPlayback();
        } else {
            startVerticalPlayback('sheet-music-notation-vertical');
        }
    });
    btnStopSecond.addEventListener('click', stopVerticalPlayback);
    btnDownloadSecond.addEventListener('click', () => downloadVerticalSVG('sheet-music-notation-vertical'));

    // Toggle show colors
    chkShowColors.addEventListener('change', () => {
        renderVerticalSheetMusic('sheet-music-notation-vertical');
        renderStudioSheetMusic('sheet-music-notation-studio');
        if (secondSheetMaxModal.style.display === "flex") {
            renderVerticalSheetMusic('sheet-music-notation-max');
        }
    });

    // Maximized Score Modal controls and triggers
    btnMaximizeSecond.addEventListener('click', () => {
        stopSheetPlayback();
        stopVerticalPlayback();
        stopStudioPlayback();
        secondSheetMaxModal.style.display = "flex";
        renderVerticalSheetMusic('sheet-music-notation-max');
    });

    btnCloseMax.addEventListener('click', () => {
        stopVerticalPlayback();
        stopStudioPlayback();
        secondSheetMaxModal.style.display = "none";
    });

    btnPlayMax.addEventListener('click', () => {
        if (isVerticalPlaying && activeVerticalContainerId === 'sheet-music-notation-max') {
            stopVerticalPlayback();
        } else {
            startVerticalPlayback('sheet-music-notation-max');
        }
    });
    btnStopMax.addEventListener('click', stopVerticalPlayback);
    btnDownloadMax.addEventListener('click', () => downloadVerticalSVG('sheet-music-notation-max'));

    // Studio editing and saving systems listeners
    btnStudioUnlock.addEventListener('click', () => {
        isStudioUnlocked = !isStudioUnlocked;
        if (isStudioUnlocked) {
            btnStudioUnlock.textContent = "Lock Edit";
            btnStudioUnlock.style.backgroundColor = "#ef4444";
            btnStudioUnlock.style.color = "#ffffff";
            studioFilterControls.style.display = 'flex';
        } else {
            btnStudioUnlock.textContent = "Unlock Edit";
            btnStudioUnlock.style.backgroundColor = "#fbbf24";
            btnStudioUnlock.style.color = "#111115";
            studioFilterControls.style.display = 'none';
        }
        updateStudioTable();
        updateStudioPreview();
    });

    inputStudioCutVelo.addEventListener('input', () => {
        updateStudioPreview();
    });

    btnStudioApplyFilter.addEventListener('click', () => {
        const threshold = parseFloat(inputStudioCutVelo.value) || 0.48;
        // Keep only notes that have velocity strictly greater than the threshold value
        studioNotesMemory = studioNotesMemory.filter(note => (note.velocity || 0.8) > threshold);
        
        updateStudioTable();
        updateStudioPreview();
        renderStudioSheetMusic('sheet-music-notation-studio');
    });

    btnStudioSave.addEventListener('click', () => {
        if (!confirm("Overwrite the original sequencer notes with your Studio workspace changes?")) {
            return;
        }
        // Overwrite master notes database array with modified sequence
        activeNotesMemory = studioNotesMemory.map(note => ({ ...note }));
        
        // Update note counts on master stats bar
        document.getElementById('stat-notes').textContent = activeNotesMemory.length;

        // Re-render master sheet notation displays
        renderSheetMusic();
        alert("Changes successfully saved and applied to the main sequencer and staves.");
    });

    btnStudioPlayScore.addEventListener('click', startStudioPlayback);
    btnStudioStopScore.addEventListener('click', stopStudioPlayback);

    // Popup Sheet Music Event Handlers
    btnSheet.addEventListener('click', () => {
        if (!midiData) return;
        pausePlayback();
        elSheetModal.style.display = "flex";
        renderSheetMusic();
    });

    btnCloseSheet.addEventListener('click', () => {
        stopSheetPlayback();
        stopVerticalPlayback();
        stopStudioPlayback();
        elSheetModal.style.display = "none";
    });

    btnLoop.addEventListener('click', () => {
        isLooping = !isLooping;
        btnLoop.textContent = `Loop: ${isLooping ? 'On' : 'Off'}`;
        btnLoop.style.backgroundColor = isLooping ? 'var(--accent-color)' : '#20202c';
    });

    selectSpeed.addEventListener('change', (e) => {
        playbackSpeed = parseFloat(e.target.value);
    });

    sliderZoom.addEventListener('input', (e) => {
        noteSpeed = parseFloat(e.target.value);
    });

    selectInstrument.addEventListener('change', (e) => {
        setInstrument(e.target.value);
    });

    sliderVolume.addEventListener('input', (e) => {
        volNode.volume.value = parseFloat(e.target.value);
    });

    sliderReverb.addEventListener('input', (e) => {
        reverbNode.wet.value = parseFloat(e.target.value);
    });

    elTimeline.addEventListener('input', (e) => {
        seekTo(parseFloat(e.target.value));
    });
}

// Global initialization starter template
function init() {
    setupAudioEngine();
    handleResize();
    setupEventListeners();
    window.addEventListener('resize', handleResize);
    requestAnimationFrame(renderFrame);
}

// Auto-Load Hook for External Storage Systems
window.addEventListener("DOMContentLoaded", () => {
  // 1. Ekstrak URL fail MIDI daripada parameter URL (?midi=...) atau Storage tempatan
  const urlParams = new URLSearchParams(window.location.search);
  const midiUrl = urlParams.get("midi") || localStorage.getItem("t1era_current_midi");

  if (midiUrl) {
    console.log("[T1ERA AUTO-LOAD] Aliran fail MIDI dikesan:", midiUrl);
    
    // 2. Muat turun fail MIDI asal sebagai data binari (ArrayBuffer)
    fetch(midiUrl)
      .then(res => {
        if (!res.ok) throw new Error("Gagal mengambil fail MIDI dari Firebase Storage.");
        return res.arrayBuffer();
      })
      .then(arrayBuffer => {
        // 3. Masukkan data binari fail ke dalam sistem pemain Midiano anda
        
        // KES A: Jika Midiano sedia ada anda mendedahkan fungsi pemuatan ArrayBuffer global
        if (window.midiano && typeof window.midiano.loadArrayBuffer === "function") {
          window.midiano.loadArrayBuffer(arrayBuffer, "t1era_score.mid");
          console.log("[T1ERA AUTO-LOAD] Fail MIDI berjaya disuap ke objek midiano.");
        } 
        // KES B: Jika menggunakan fungsi tersuai
        else if (typeof window.loadMidiArrayBuffer === "function") {
          window.loadMidiArrayBuffer(arrayBuffer);
          console.log("[T1ERA AUTO-LOAD] Fail MIDI berjaya disuap ke fungsi global.");
        } 
        // KES C (Fail-Safe): Mensimulasikan kemasukan fail terus ke dalam kotak input fail <input type="file">
        // yang biasa digunakan oleh pelantar asal Midiano untuk memuat turun fail
        else {
          const file = new File([arrayBuffer], "t1era_score.mid", { type: "audio/midi" });
          const container = new DataTransfer();
          container.items.add(file);
          
          // Cari input fail asli di halaman midiano.html anda
          const fileInput = document.querySelector("input[type='file']");
          if (fileInput) {
            fileInput.files = container.files;
            // Cetuskan acara tukar (change event) supaya Midiano sedar fail baru telah dimasukkan
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("[T1ERA AUTO-LOAD] Fail MIDI disimulasikan ke input fail Midiano.");
          } else {
            console.warn("[T1ERA AUTO-LOAD] Tiada input fail atau fungsi pemuatan dikesan di midiano.html.");
          }
        }
      })
      .catch(err => {
        console.error("[T1ERA AUTO-LOAD ERROR] Gagal memuatkan fail MIDI secara automatik:", err);
      });
  }
});

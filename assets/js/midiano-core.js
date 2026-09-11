// --- Music Theory Profiles (Krumhansl-Schmuckler Key Finding) ---
const K_K_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const K_K_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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

KEY_MAPS["Am"] = KEY_MAPS["C"]; KEY_MAPS["Em"] = KEY_MAPS["G"]; KEY_MAPS["Bm"] = KEY_MAPS["D"];
KEY_MAPS["F#m"] = KEY_MAPS["A"]; KEY_MAPS["C#m"] = KEY_MAPS["E"]; KEY_MAPS["G#m"] = KEY_MAPS["B"];
KEY_MAPS["Dm"] = KEY_MAPS["F"]; KEY_MAPS["Gm"] = KEY_MAPS["Bb"]; KEY_MAPS["Cm"] = KEY_MAPS["Eb"];
KEY_MAPS["Fm"] = KEY_MAPS["Ab"]; KEY_MAPS["Bbm"] = KEY_MAPS["Db"];

const RANGE_START = 21; // A0
const RANGE_END = 108;  // C8
const IS_BLACK_KEY = [false, true, false, true, false, false, true, false, true, false, true, false];

const IS_MOBILE_DEVICE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

let midiData = null;
let isPlaying = false;
let isLooping = false;
let playbackSpeed = 1.0;
let noteSpeed = 200; 
let totalDuration = 0;
let currentPlaybackTime = 0;
let lastFrameTime = performance.now();
let lastTriggeredTime = 0;

let playbackNoteIndex = 0;
let sheetPlaybackNoteIndex = 0;
let verticalPlaybackNoteIndex = 0;
let studioPlaybackNoteIndex = 0;
let maxNoteDuration = 5;

let activeInstrument = null;
let samplerPiano = null;
let samplerLoaded = false;
let reverbNode = null;
let volNode = null;

let masterCompressor = null;
let masterLimiter = null;

const MAX_ACTIVE_VOICES = IS_MOBILE_DEVICE ? 14 : 32;
let activeVoiceLog = [];
let activeVoiceByPitch = new Map();

const BURST_WINDOW_SEC = IS_MOBILE_DEVICE ? 0.035 : 0.02;
const MAX_TRIGGERS_PER_BURST = IS_MOBILE_DEVICE ? 8 : 18;
let burstWindowStart = 0;
let burstTriggerCount = 0;

function removeVoiceLogEntryByNote(noteName) {
    for (let i = activeVoiceLog.length - 1; i >= 0; i--) {
        if (activeVoiceLog[i].note === noteName) {
            activeVoiceLog.splice(i, 1);
        }
    }
}

function pruneExpiredVoiceLog(now) {
    for (let i = activeVoiceLog.length - 1; i >= 0; i--) {
        if (activeVoiceLog[i].releaseTime <= now) {
            activeVoiceLog.splice(i, 1);
        }
    }
}

function triggerNoteWithVoiceGuard(noteName, duration, time, velocity, strict) {
    if (!activeInstrument) return;

    const now = Tone.now();
    const scheduledTime = time || now;

    if (!strict) {
        if (scheduledTime - burstWindowStart > BURST_WINDOW_SEC) {
            burstWindowStart = scheduledTime;
            burstTriggerCount = 0;
        }
        burstTriggerCount++;
        if (burstTriggerCount > MAX_TRIGGERS_PER_BURST && (velocity || 0.8) < 0.55) {
            return;
        }
    }

    if (activeVoiceByPitch.has(noteName) && activeVoiceByPitch.get(noteName) > now) {
        if (typeof activeInstrument.triggerRelease === 'function') {
            activeInstrument.triggerRelease(noteName, now);
        }
        removeVoiceLogEntryByNote(noteName);
    }

    pruneExpiredVoiceLog(now);
    if (activeVoiceLog.length >= MAX_ACTIVE_VOICES) {
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

let audioStartTime = 0;
let logicalStartTime = 0;

let splendidPiano = null;
let splendidLoaded = false;

let activeNotesMemory = [];
let pianoKeysMap = new Map();
let particles = [];

let totalWhiteKeys = 0;
let whiteKeyWidth = 0;
let blackKeyWidth = 0;

let studioNotesMemory = [];
let isStudioUnlocked = false;
let isStudioPlaying = false;
let studioPlaybackTime = 0;
let studioLastFrameTime = 0;
let studioPlaybackTimer = null;

const elCanvas = document.getElementById('visualizer-canvas');
const ctx = elCanvas?.getContext('2d');
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

const elSheetModal = document.getElementById('sheet-modal');
const btnCloseSheet = document.getElementById('btn-close-sheet');
const elSheetMusicNotation = document.getElementById('sheet-music-notation');

let sheetMusicPlaying = false;
let sheetMusicPlaybackTime = 0;
let sheetMusicLastFrameTime = 0;
let sheetMusicPlaybackTimer = null;
const pixelsPerSecond = 120;

let isVerticalPlaying = false;
let verticalPlaybackTime = 0;
let verticalLastFrameTime = 0;
let verticalPlaybackTimer = null;
let activeVerticalContainerId = "";

class SmplrToneWrapper {
    constructor(smplrInstance) {
        this.smplr = smplrInstance;
    }
    triggerAttackRelease(noteName, duration, time, velocity) {
        const midiVelocity = Math.round((velocity || 0.8) * 127);
        this.smplr.start({
            note: noteName,
            time: time,
            duration: duration,
            velocity: midiVelocity
        });
    }
    triggerRelease(noteName, time) {
        try {
            if (this.smplr && typeof this.smplr.stop === 'function') {
                this.smplr.stop(noteName, time);
            }
        } catch (e) {}
    }
    releaseAll() {
        if (this.smplr && typeof this.smplr.stop === 'function') {
            this.smplr.stop();
        }
    }
    dispose() {}
}

function setupAudioEngine() {
    Tone.context.lookAhead = IS_MOBILE_DEVICE ? 0.25 : 0.15;
    Tone.context.updateInterval = IS_MOBILE_DEVICE ? 0.05 : 0.03;
    try { Tone.context.latencyHint = "playback"; } catch (e) { }

    masterLimiter = new Tone.Limiter(-1).toDestination();

    masterCompressor = new Tone.Compressor({
        threshold: -18,
        ratio: 3,
        attack: 0.03,
        release: 0.25
    }).connect(masterLimiter);

    reverbNode = new Tone.Reverb({
        roomSize: IS_MOBILE_DEVICE ? 0.5 : 0.8,
        wet: IS_MOBILE_DEVICE ? 0.15 : 0.25
    }).connect(masterCompressor);

    volNode = IS_MOBILE_DEVICE
        ? new Tone.Volume(-12).connect(masterCompressor)
        : new Tone.Volume(-12).connect(reverbNode);

    loadSampledPiano();
    setInstrument(IS_MOBILE_DEVICE ? 'grand' : 'sampled');
}

function loadSampledPiano() {
    if (samplerPiano) return;

    if (elSamplerStatus) {
        elSamplerStatus.textContent = "• Loading Samples...";
        elSamplerStatus.style.color = "#fbbf24";
    }

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
        release: 0.7,
        maxPolyphony: IS_MOBILE_DEVICE ? 16 : 32,
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        onload: () => {
            samplerLoaded = true;
            if (elSamplerStatus) {
                elSamplerStatus.textContent = "• Ready";
                elSamplerStatus.style.color = "#10b981";
            }
            
            if (selectInstrument && selectInstrument.value === 'sampled') {
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
            if (elSamplerStatus) {
                elSamplerStatus.textContent = "• Error";
                elSamplerStatus.style.color = "#ef4444";
            }
        }
    });
}

async function setInstrument(type) {
    if (activeInstrument) {
        activeInstrument.releaseAll();
        if (activeInstrument !== samplerPiano && activeInstrument !== splendidPiano) {
            activeInstrument.dispose();
        }
    }

    activeVoiceLog = [];
    activeVoiceByPitch.clear();
    burstWindowStart = 0;
    burstTriggerCount = 0;

    if (type === 'splendid') {
        if (!splendidPiano) {
            if (elSamplerStatus) {
                elSamplerStatus.textContent = "• Loading HD Steinway...";
                elSamplerStatus.style.color = "#fbbf24";
            }

            try {
                const { SplendidGrandPiano } = await import("https://unpkg.com/smplr/dist/index.mjs");
                
                const inst = new SplendidGrandPiano(Tone.context.rawContext, {
                    destination: volNode.input
                });

                const loadPromise = inst.ready || inst.load || Promise.resolve();
                await loadPromise;

                splendidLoaded = true;
                splendidPiano = new SmplrToneWrapper(inst);
                if (elSamplerStatus) {
                    elSamplerStatus.textContent = "• Ready";
                    elSamplerStatus.style.color = "#10b981";
                }
                if (selectInstrument && selectInstrument.value === 'splendid') {
                    activeInstrument = splendidPiano;
                }
            } catch (err) {
                console.error("Failed to load Splendid Grand Piano ES Module:", err);
                if (elSamplerStatus) {
                    elSamplerStatus.textContent = "• Error Loading";
                    elSamplerStatus.style.color = "#ef4444";
                }
            }
        } else {
            activeInstrument = splendidPiano;
            if (splendidLoaded && elSamplerStatus) {
                elSamplerStatus.textContent = "• Ready";
                elSamplerStatus.style.color = "#10b981";
            }
        }
    } else if (type === 'sampled') {
        if (samplerLoaded) {
            activeInstrument = samplerPiano;
            activeInstrument.connect(volNode);
        } else {
            activeInstrument = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: IS_MOBILE_DEVICE ? 16 : 32,
                oscillator: { type: "sine" },
                envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 0.8 }
            }).connect(volNode);
        }
    } else if (type === 'grand') {
        activeInstrument = new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: IS_MOBILE_DEVICE ? 16 : 32,
            oscillator: { type: "sine" },
            envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 0.8 }
        }).connect(volNode);
    } else if (type === 'rhodes') {
        activeInstrument = new Tone.PolySynth(Tone.FMSynth, {
            maxPolyphony: IS_MOBILE_DEVICE ? 16 : 32,
            harmonicity: 3.05,
            modulationIndex: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.008, decay: 1.5, sustain: 0.1, release: 0.8 },
            modulation: { type: "triangle" },
            modulationEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.0, release: 0.25 }
        }).connect(volNode);
    } else if (type === 'ambient') {
        activeInstrument = new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: IS_MOBILE_DEVICE ? 10 : 16,
            oscillator: { type: "triangle" },
            envelope: { attack: 0.15, decay: 2.0, sustain: 0.5, release: 2.0 }
        }).connect(volNode);
    } else if (type === 'chiptune') {
        activeInstrument = new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: IS_MOBILE_DEVICE ? 16 : 32,
            oscillator: { type: "square" },
            envelope: { attack: 0.002, decay: 0.3, sustain: 0.15, release: 0.3 }
        }).connect(volNode);
    }
}

function getMidiKeySignature() {
    if (!activeNotesMemory || activeNotesMemory.length === 0) return "C Major";
    const pitchCounts = new Array(12).fill(0);
    activeNotesMemory.forEach(note => {
        const pitchClass = note.midi % 12;
        pitchCounts[pitchClass] += (note.duration || 0.5);
    });

    let bestKey = "C";
    let bestCorrelation = -Infinity;
    let isMinor = false;

    for (let root = 0; root < 12; root++) {
        let corrMajor = 0;
        let corrMinor = 0;
        for (let i = 0; i < 12; i++) {
            const count = pitchCounts[(root + i) % 12];
            corrMajor += count * K_K_MAJOR[i];
            corrMinor += count * K_K_MINOR[i];
        }
        if (corrMajor > bestCorrelation) {
            bestCorrelation = corrMajor;
            bestKey = PITCH_NAMES[root];
            isMinor = false;
        }
        if (corrMinor > bestCorrelation) {
            bestCorrelation = corrMinor;
            bestKey = PITCH_NAMES[root] + "m";
            isMinor = true;
        }
    }
    return isMinor ? `${bestKey}` : `${bestKey} Major`;
}

// --- Parsing & Visualizer Loader ---
function loadMidi(buffer, customTitle) {
    stopPlayback();
    
    midiData = new Midi(buffer);
    activeNotesMemory = [];

    if (typeof calculateLayoutMetrics === "function") calculateLayoutMetrics();
    if (typeof createKeyboard === "function") createKeyboard();

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
                    ticks: note.ticks,
                    durationTicks: note.durationTicks
                });
                noteCount++;
            }
        });
    });

    activeNotesMemory.sort((a, b) => a.time - b.time);

    totalDuration = midiData.duration;
    lastTriggeredTime = 0;

    maxNoteDuration = activeNotesMemory.reduce((max, n) => Math.max(max, n.duration), 2);
    if (maxNoteDuration > 15) maxNoteDuration = 15;

    initStudioData();

    const detectedKeyName = getMidiKeySignature();
    const displayTitle = customTitle || (midiData.name && midiData.name !== "Untitled" ? midiData.name : null) || "Studio Transcribed Track";

    // --- SYNCHRONIZE TITLE WITH PIANO ROLL STATS & SHEET MUSIC ENGINE ---
    window.currentMidiTitle = displayTitle;
    if (typeof setSheetTitle === "function") {
        setSheetTitle(displayTitle);
    } else if (typeof resolvedSheetTitle !== "undefined") {
        resolvedSheetTitle = displayTitle;
    }

    const statNameEl = document.getElementById('stat-name');
    if (statNameEl) statNameEl.textContent = displayTitle;

    const mobileTrackTitleEl = document.getElementById('mobile-track-title');
    if (mobileTrackTitleEl) mobileTrackTitleEl.textContent = displayTitle;

    const statDurEl = document.getElementById('stat-duration');
    if (statDurEl) statDurEl.textContent = Math.round(totalDuration) + "s";

    const statTempoEl = document.getElementById('stat-tempo');
    if (statTempoEl) statTempoEl.textContent = Math.round(midiData.header.tempos[0]?.bpm || 120) + " BPM";

    const statTracksEl = document.getElementById('stat-tracks');
    if (statTracksEl) statTracksEl.textContent = midiData.tracks.length;

    const statNotesEl = document.getElementById('stat-notes');
    if (statNotesEl) statNotesEl.textContent = noteCount;

    const statKeyEl = document.getElementById('stat-key');
    if (statKeyEl) statKeyEl.textContent = detectedKeyName;

    if (elTimeline) {
        elTimeline.max = totalDuration;
        elTimeline.value = 0;
        elTimeline.disabled = false;
    }
    currentPlaybackTime = 0;
    updateTimeDisplay();

    if (btnPlay) btnPlay.disabled = false;
    if (btnStop) btnStop.disabled = false;
    if (btnRestart) btnRestart.disabled = false;
    if (btnSheet) btnSheet.disabled = false;

    const btnDownloadMenu = document.getElementById('btn-download-menu');
    if (btnDownloadMenu) btnDownloadMenu.disabled = false;
    
    playbackNoteIndex = 0;
    updatePlaybackNoteIndex();

    if (typeof handleResize === "function") handleResize();

    console.log(`[MIDIANO CORE] MIDI loaded into visualizer: "${displayTitle}" (${noteCount} notes).`);
}

window.loadMidi = loadMidi;
window.loadMidiArrayBuffer = loadMidi;

function startPlayback() {
    if (isPlaying) return;
    if (Tone.context.state !== 'running') {
        Tone.start();
    }
    isPlaying = true;
    lastFrameTime = performance.now();
    
    audioStartTime = Tone.now();
    logicalStartTime = currentPlaybackTime;
    
    if (btnPlay) btnPlay.disabled = true;
    if (btnPause) btnPause.disabled = false;
    updatePlaybackNoteIndex();
}

function pausePlayback() {
    isPlaying = false;
    if (btnPlay) btnPlay.disabled = false;
    if (btnPause) btnPause.disabled = true;
    if (activeInstrument) activeInstrument.releaseAll();
    activeVoiceLog = [];
    activeVoiceByPitch.clear();
}

function stopPlayback() {
    isPlaying = false;
    currentPlaybackTime = 0;
    lastTriggeredTime = 0;
    playbackNoteIndex = 0;
    if (elTimeline) elTimeline.value = 0;
    updateTimeDisplay();
    if (btnPlay) btnPlay.disabled = (midiData === null);
    if (btnPause) btnPause.disabled = true;
    if (activeInstrument) activeInstrument.releaseAll();
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
    
    audioStartTime = Tone.now();
    logicalStartTime = currentPlaybackTime;
    
    updatePlaybackNoteIndex();
    updateTimeDisplay();
    if (activeInstrument) activeInstrument.releaseAll();
    activeVoiceLog = [];
    activeVoiceByPitch.clear();
}

function updateTimeDisplay() {
    if (!elTimeDisplay) return;
    const format = (t) => {
        const m = Math.floor(t / 60).toString().padStart(2, '0');
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    elTimeDisplay.textContent = `${format(currentPlaybackTime)} / ${format(totalDuration)}`;
}

function initStudioData() {
    if (!activeNotesMemory) return;
    studioNotesMemory = activeNotesMemory.map(note => ({ ...note }));
    isStudioUnlocked = false;

    const filterControls = document.getElementById('studio-filter-controls');
    if (filterControls) filterControls.style.display = 'none';

    const previewContainer = document.getElementById('studio-removal-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';
    
    const unlockBtn = document.getElementById('btn-studio-unlock');
    if (unlockBtn) {
        unlockBtn.textContent = "Unlock Edit";
        unlockBtn.style.backgroundColor = "#fbbf24";
        unlockBtn.style.color = "#111115";
    }

    updateStudioTable();
    updateStudioPreview();
    if (typeof renderStudioSheetMusic === "function") {
        renderStudioSheetMusic('sheet-music-notation-studio');
    }
}

function updateStudioPreview() {
    const thresholdInput = document.getElementById('input-studio-cut-velo');
    if (!thresholdInput) return;
    const threshold = parseFloat(thresholdInput.value) || 0.48;
    const thresholdLbl = document.getElementById('lbl-studio-current-threshold');
    if (thresholdLbl) thresholdLbl.textContent = threshold.toFixed(2);

    const previewContainer = document.getElementById('studio-removal-preview-container');
    const previewList = document.getElementById('studio-removal-preview-list');
    if (!previewContainer || !previewList) return;

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
    if (!tableBody) return;
    tableBody.innerHTML = '';

    studioNotesMemory.forEach((note, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--panel-border)';
        if (index % 2 === 1) {
            tr.style.background = '#20202c';
        }

        const inputStyle = "background: transparent; border: none; color: inherit; font-family: inherit; font-size: inherit; width: 60px; outline: none; padding: 2px;";
        const editableInputStyle = "background: #20202c; border: 1px solid var(--panel-border); color: #fff; font-family: inherit; font-size: inherit; width: 65px; border-radius: 4px; padding: 2px;";

        const tdIndex = document.createElement('td');
        tdIndex.style.padding = '10px 12px';
        tdIndex.style.color = 'var(--text-muted)';
        tdIndex.textContent = index + 1;
        tr.appendChild(tdIndex);

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
            if (typeof renderStudioSheetMusic === "function") renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdTime.appendChild(inputTime);
        tr.appendChild(tdTime);

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
            if (typeof renderStudioSheetMusic === "function") renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdPitch.appendChild(inputPitch);
        tr.appendChild(tdPitch);

        const tdName = document.createElement('td');
        tdName.style.padding = '10px 12px';
        tdName.style.fontWeight = '600';
        tdName.style.color = 'var(--accent-color)';
        tdName.textContent = note.name;
        tr.appendChild(tdName);

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
            if (typeof renderStudioSheetMusic === "function") renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdDuration.appendChild(inputDuration);
        tr.appendChild(tdDuration);

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
            if (typeof renderStudioSheetMusic === "function") renderStudioSheetMusic('sheet-music-notation-studio');
        });
        tdActions.appendChild(btnDelete);
        tr.appendChild(tdActions);

        tableBody.appendChild(tr);
    });
}

function setupEventListeners() {
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => loadMidi(event.target.result, file.name);
            reader.readAsArrayBuffer(file);
        });
    }

    if (btnPlay) btnPlay.addEventListener('click', startPlayback);
    if (btnPause) btnPause.addEventListener('click', pausePlayback);
    if (btnStop) btnStop.addEventListener('click', stopPlayback);
    if (btnRestart) btnRestart.addEventListener('click', () => { seekTo(0); startPlayback(); });

    const btnTabNotation = document.getElementById('btn-tab-notation');
    const btnTabRaw = document.getElementById('btn-tab-raw');
    const btnTabStudio = document.getElementById('btn-tab-studio');

    const contentNotation = document.getElementById('sheet-tab-notation-content');
    const contentRaw = document.getElementById('sheet-tab-raw-content');
    const contentStudio = document.getElementById('sheet-tab-studio-content');

    const btnPlaySheet = document.getElementById('btn-play-sheet');
    const btnStopSheet = document.getElementById('btn-stop-sheet');

    const btnPlaySecond = document.getElementById('btn-play-second');
    const btnStopSecond = document.getElementById('btn-stop-second');
    const btnMaximizeSecond = document.getElementById('btn-maximize-second');
    const btnDownloadSecond = document.getElementById('btn-download-second');
    const chkShowColors = document.getElementById('chk-show-colors');

    const secondSheetMaxModal = document.getElementById('second-sheet-max-modal');
    const btnPlayMax = document.getElementById('btn-play-max');
    const btnStopMax = document.getElementById('btn-stop-max');
    const btnDownloadMax = document.getElementById('btn-download-max');
    const btnCloseMax = document.getElementById('btn-close-max');

    const btnStudioUnlock = document.getElementById('btn-studio-unlock');
    const studioFilterControls = document.getElementById('studio-filter-controls');
    const btnStudioApplyFilter = document.getElementById('btn-studio-apply-filter');
    const inputStudioCutVelo = document.getElementById('input-studio-cut-velo');
    const btnStudioSave = document.getElementById('btn-studio-save');
    const btnStudioPlayScore = document.getElementById('btn-studio-play-score');
    const btnStudioStopScore = document.getElementById('btn-studio-stop-score');

    if (btnTabNotation && contentNotation && contentRaw && contentStudio) {
        btnTabNotation.addEventListener('click', () => {
            if (typeof stopSheetPlayback === "function") stopSheetPlayback();
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            if (typeof stopStudioPlayback === "function") stopStudioPlayback();
            btnTabNotation.style.backgroundColor = 'var(--accent-color)';
            btnTabNotation.style.color = 'var(--text-color)';
            if (btnTabRaw) { btnTabRaw.style.backgroundColor = '#20202c'; btnTabRaw.style.color = 'var(--text-muted)'; }
            if (btnTabStudio) { btnTabStudio.style.backgroundColor = '#20202c'; btnTabStudio.style.color = 'var(--text-muted)'; }
            contentNotation.style.display = 'block';
            contentRaw.style.display = 'none';
            contentStudio.style.display = 'none';

            if (btnPlaySheet) btnPlaySheet.style.display = 'inline-block';
            if (btnStopSheet) btnStopSheet.style.display = 'inline-block';
        });
    }

    if (btnTabRaw && contentNotation && contentRaw && contentStudio) {
        btnTabRaw.addEventListener('click', () => {
            if (typeof stopSheetPlayback === "function") stopSheetPlayback();
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            if (typeof stopStudioPlayback === "function") stopStudioPlayback();
            btnTabRaw.style.backgroundColor = 'var(--accent-color)';
            btnTabRaw.style.color = 'var(--text-color)';
            if (btnTabNotation) { btnTabNotation.style.backgroundColor = '#20202c'; btnTabNotation.style.color = 'var(--text-muted)'; }
            if (btnTabStudio) { btnTabStudio.style.backgroundColor = '#20202c'; btnTabStudio.style.color = 'var(--text-muted)'; }
            contentNotation.style.display = 'none';
            contentRaw.style.display = 'flex';
            contentStudio.style.display = 'none';
            if (typeof populateRawMidiData === "function") populateRawMidiData();

            if (btnPlaySheet) btnPlaySheet.style.display = 'none';
            if (btnStopSheet) btnStopSheet.style.display = 'none';
        });
    }

    if (btnTabStudio && contentNotation && contentRaw && contentStudio) {
        btnTabStudio.addEventListener('click', () => {
            if (typeof stopSheetPlayback === "function") stopSheetPlayback();
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            if (typeof stopStudioPlayback === "function") stopStudioPlayback();
            btnTabStudio.style.backgroundColor = 'var(--accent-color)';
            btnTabStudio.style.color = 'var(--text-color)';
            if (btnTabNotation) { btnTabNotation.style.backgroundColor = '#20202c'; btnTabNotation.style.color = 'var(--text-muted)'; }
            if (btnTabRaw) { btnTabRaw.style.backgroundColor = '#20202c'; btnTabRaw.style.color = 'var(--text-muted)'; }
            contentNotation.style.display = 'none';
            contentRaw.style.display = 'none';
            contentStudio.style.display = 'flex';
            
            updateStudioTable();
            updateStudioPreview();
            if (typeof renderStudioSheetMusic === "function") renderStudioSheetMusic('sheet-music-notation-studio');

            if (btnPlaySheet) btnPlaySheet.style.display = 'none';
            if (btnStopSheet) btnStopSheet.style.display = 'none';
        });
    }

    if (btnPlaySheet) {
        btnPlaySheet.addEventListener('click', () => {
            if (typeof startSheetPlayback === "function") startSheetPlayback();
        });
    }

    if (btnStopSheet) {
        btnStopSheet.addEventListener('click', () => {
            if (typeof stopSheetPlayback === "function") stopSheetPlayback();
        });
    }

    if (btnPlaySecond) {
        btnPlaySecond.addEventListener('click', () => {
            if (isVerticalPlaying && activeVerticalContainerId === 'sheet-music-notation-vertical') {
                if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            } else {
                if (typeof startVerticalPlayback === "function") startVerticalPlayback('sheet-music-notation-vertical');
            }
        });
    }

    if (btnStopSecond) {
        btnStopSecond.addEventListener('click', () => {
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
        });
    }

    const downloadDropdownSecond = document.getElementById("download-dropdown-second");
    if (btnDownloadSecond && downloadDropdownSecond) {
        btnDownloadSecond.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdownMax = document.getElementById("download-dropdown-max");
            if (dropdownMax) dropdownMax.classList.remove("show");
            const mainDropdown = document.getElementById("download-dropdown");
            if (mainDropdown) mainDropdown.classList.remove("show");
            
            downloadDropdownSecond.classList.toggle("show");
        });
    }

    if (chkShowColors) {
        chkShowColors.addEventListener('change', () => {
            if (typeof renderVerticalSheetMusic === "function") renderVerticalSheetMusic('sheet-music-notation-vertical');
            if (typeof renderStudioSheetMusic === "function") renderStudioSheetMusic('sheet-music-notation-studio');
            if (secondSheetMaxModal && secondSheetMaxModal.style.display === "flex") {
                if (typeof renderVerticalSheetMusic === "function") renderVerticalSheetMusic('sheet-music-notation-max');
            }
        });
    }

    if (btnMaximizeSecond && secondSheetMaxModal) {
        btnMaximizeSecond.addEventListener('click', () => {
            if (typeof stopSheetPlayback === "function") stopSheetPlayback();
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            if (typeof stopStudioPlayback === "function") stopStudioPlayback();
            secondSheetMaxModal.style.display = "flex";
            if (typeof renderVerticalSheetMusic === "function") renderVerticalSheetMusic('sheet-music-notation-max');
        });
    }

    if (btnCloseMax && secondSheetMaxModal) {
        btnCloseMax.addEventListener('click', () => {
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            if (typeof stopStudioPlayback === "function") stopStudioPlayback();
            secondSheetMaxModal.style.display = "none";
        });
    }

    if (btnPlayMax) {
        btnPlayMax.addEventListener('click', () => {
            if (isVerticalPlaying && activeVerticalContainerId === 'sheet-music-notation-max') {
                if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            } else {
                if (typeof startVerticalPlayback === "function") startVerticalPlayback('sheet-music-notation-max');
            }
        });
    }

    if (btnStopMax) {
        btnStopMax.addEventListener('click', () => {
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
        });
    }

    const downloadDropdownMax = document.getElementById("download-dropdown-max");
    if (btnDownloadMax && downloadDropdownMax) {
        btnDownloadMax.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdownSecond = document.getElementById("download-dropdown-second");
            if (dropdownSecond) dropdownSecond.classList.remove("show");
            const mainDropdown = document.getElementById("download-dropdown");
            if (mainDropdown) mainDropdown.classList.remove("show");
            
            downloadDropdownMax.classList.toggle("show");
        });
    }

    if (btnStudioUnlock && studioFilterControls) {
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
    }

    if (inputStudioCutVelo) {
        inputStudioCutVelo.addEventListener('input', () => {
            updateStudioPreview();
        });
    }

    if (btnStudioApplyFilter && inputStudioCutVelo) {
        btnStudioApplyFilter.addEventListener('click', () => {
            const threshold = parseFloat(inputStudioCutVelo.value) || 0.48;
            studioNotesMemory = studioNotesMemory.filter(note => (note.velocity || 0.8) > threshold);
            
            updateStudioTable();
            updateStudioPreview();
            if (typeof renderStudioSheetMusic === "function") renderStudioSheetMusic('sheet-music-notation-studio');
        });
    }

    if (btnStudioSave) {
        btnStudioSave.addEventListener('click', () => {
            if (!confirm("Overwrite the original sequencer notes with your Studio workspace changes?")) {
                return;
            }
            activeNotesMemory = studioNotesMemory.map(note => ({ ...note }));
            const statNotesEl = document.getElementById('stat-notes');
            if (statNotesEl) statNotesEl.textContent = activeNotesMemory.length;
            if (typeof renderSheetMusic === "function") renderSheetMusic();
            alert("Changes successfully saved and applied to the main sequencer and staves.");
        });
    }

    if (btnStudioPlayScore) {
        btnStudioPlayScore.addEventListener('click', () => {
            if (typeof startStudioPlayback === "function") startStudioPlayback();
        });
    }

    if (btnStudioStopScore) {
        btnStudioStopScore.addEventListener('click', () => {
            if (typeof stopStudioPlayback === "function") stopStudioPlayback();
        });
    }

    if (btnSheet && elSheetModal) {
        btnSheet.addEventListener('click', () => {
            if (!midiData) return;
            pausePlayback();
            elSheetModal.style.display = "flex";
            if (typeof renderSheetMusic === "function") renderSheetMusic();
        });
    }

    if (btnCloseSheet && elSheetModal) {
        btnCloseSheet.addEventListener('click', () => {
            if (typeof stopSheetPlayback === "function") stopSheetPlayback();
            if (typeof stopVerticalPlayback === "function") stopVerticalPlayback();
            if (typeof stopStudioPlayback === "function") stopStudioPlayback();
            elSheetModal.style.display = "none";
        });
    }

    if (btnLoop) {
        btnLoop.addEventListener('click', () => {
            isLooping = !isLooping;
            btnLoop.textContent = `Loop: ${isLooping ? 'On' : 'Off'}`;
            btnLoop.style.backgroundColor = isLooping ? 'var(--accent-color)' : '#20202c';
        });
    }

    if (selectSpeed) {
        selectSpeed.addEventListener('change', (e) => {
            playbackSpeed = parseFloat(e.target.value);
        });
    }

    if (sliderZoom) {
        sliderZoom.addEventListener('input', (e) => {
            noteSpeed = parseFloat(e.target.value);
        });
    }

    if (selectInstrument) {
        selectInstrument.addEventListener('change', (e) => {
            setInstrument(e.target.value);
        });
    }

    if (sliderVolume && volNode) {
        sliderVolume.addEventListener('input', (e) => {
            volNode.volume.value = parseFloat(e.target.value);
        });
    }

    if (sliderReverb && reverbNode) {
        sliderReverb.addEventListener('input', (e) => {
            reverbNode.wet.value = parseFloat(e.target.value);
        });
    }

    if (elTimeline) {
        elTimeline.addEventListener('input', (e) => {
            seekTo(parseFloat(e.target.value));
        });
    }
}

let hasInitializedCore = false;
function init() {
    if (hasInitializedCore) return;
    hasInitializedCore = true;

    setupAudioEngine();
    if (typeof handleResize === "function") handleResize();
    setupEventListeners();
    if (typeof handleResize === "function") window.addEventListener('resize', handleResize);
    if (typeof renderFrame === "function") requestAnimationFrame(renderFrame);
}

// =======================================================
// INDEXEDDB DIRECT RECEIVER & BULLETPROOF AUTO-LOADER
// =======================================================
const DB_NAME = "T1ERA_STUDIO_DB";
const STORE_NAME = "midi_transfer";

function openMidiDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains(STORE_NAME)) {
                idb.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function loadMidiFromBridge() {
    try {
        const idb = await openMidiDB();
        return new Promise((resolve) => {
            const tx = idb.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const reqData = store.get("pending_midi");
            const reqTitle = store.get("pending_title");
            
            tx.oncomplete = () => {
                const buffer = reqData.result || null;
                const title = reqTitle.result || null;
                try {
                    const cleanTx = idb.transaction(STORE_NAME, "readwrite");
                    cleanTx.objectStore(STORE_NAME).clear();
                } catch(e) {}
                resolve({ buffer, title });
            };
            tx.onerror = () => resolve({ buffer: null, title: null });
        });
    } catch (e) {
        return { buffer: null, title: null };
    }
}

async function executeAutoLoadMidi() {
    const urlParams = new URLSearchParams(window.location.search);
    const trackTitle = urlParams.get("title") || localStorage.getItem("t1era_current_title") || "";
    const midiUrl = urlParams.get("midi") || urlParams.get("url") || localStorage.getItem("t1era_current_midi");

    const statNameEl = document.getElementById("stat-name");
    const mobileTitleEl = document.getElementById("mobile-track-title");

    if (trackTitle) {
        if (statNameEl) statNameEl.textContent = trackTitle;
        if (mobileTitleEl) mobileTitleEl.textContent = trackTitle;
    }

    // PRIORITY 1: Check IndexedDB in-memory bridge (0 network latency, no CORS)
    try {
        const bridgeData = await loadMidiFromBridge();
        if (bridgeData && bridgeData.buffer && bridgeData.buffer.byteLength > 0) {
            console.log("[T1ERA STUDIO] Loaded MIDI directly from IndexedDB Bridge:", bridgeData.buffer.byteLength, "bytes.");
            loadMidi(bridgeData.buffer, bridgeData.title || trackTitle);
            return;
        }
    } catch (bridgeErr) {
        console.warn("[T1ERA STUDIO] Bridge load check passed without result:", bridgeErr);
    }

    // PRIORITY 2: Fallback to remote URL fetch if bridge was empty
    if (!midiUrl) return;

    console.log("[T1ERA STUDIO] Bridge empty, fetching remote stream:", midiUrl);
    if (statNameEl) statNameEl.textContent = "Downloading MIDI stream...";

    fetch(midiUrl)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download MIDI file.`);
            return res.arrayBuffer();
        })
        .then(arrayBuffer => {
            loadMidi(arrayBuffer, trackTitle);
        })
        .catch(err => {
            console.error("[T1ERA STUDIO AUTO-LOAD ERROR] Failed to fetch remote MIDI:", err);
            if (statNameEl) statNameEl.textContent = "Error loading MIDI";
        });
}

window.addEventListener("load", () => {
    init();
    executeAutoLoadMidi();
});

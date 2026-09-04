// --- Optimization Cache Pools ---
const currentlyActiveMidiKeys = new Set(); // Reused to prevent garbage collection allocation
const pianoKeyStateCache = new Map();       // Tracks true state transitions of keys to eliminate DOM thrashing
const gradientCache = {};                    // Caches note gradient objects
let lastActiveKeysString = "";               // Prevents constant layout-triggering chord calculations

// --- Particle System Physics ---
const MAX_PARTICLES_LIMIT = 120; // Caps particle bloat during dense note segments

function spawnParticles(x, y, color) {
    // Drop the oldest particle burst if we exceed the physical buffer limit
    if (particles.length >= MAX_PARTICLES_LIMIT) {
        particles.splice(0, 8);
    }
    const numParticles = 8;
    for (let i = 0; i < numParticles; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 5 - 2,
            radius: Math.random() * 3 + 1,
            alpha: 1,
            decay: Math.random() * 0.03 + 0.01,
            color: color
        });
    }
}

// --- Layout Mapping Engine ---
function calculateLayoutMetrics() {
    totalWhiteKeys = 0;
    for (let m = RANGE_START; m <= RANGE_END; m++) {
        if (!IS_BLACK_KEY[m % 12]) totalWhiteKeys++;
    }
    const containerWidth = elCanvas.parentElement.clientWidth;
    whiteKeyWidth = containerWidth / totalWhiteKeys;
    blackKeyWidth = whiteKeyWidth * 0.58;
}

// Compute starting horizontal coordinate based on standard 88-key physical dimensions
function getNoteX(midi) {
    let whiteKeyIndex = 0;
    for (let m = RANGE_START; m < midi; m++) {
        if (!IS_BLACK_KEY[m % 12]) whiteKeyIndex++;
    }
    const baseLeft = whiteKeyIndex * whiteKeyWidth;
    if (IS_BLACK_KEY[midi % 12]) {
        return baseLeft - (blackKeyWidth / 2);
    }
    return baseLeft;
}

function createKeyboard() {
    elKeyboard.innerHTML = '';
    pianoKeysMap.clear();
    pianoKeyStateCache.clear(); // Flush key transitions cache

    // Render white keys first
    for (let m = RANGE_START; m <= RANGE_END; m++) {
        if (!IS_BLACK_KEY[m % 12]) buildKeyElement(m, false);
    }
    // Superimpose black keys on top
    for (let m = RANGE_START; m <= RANGE_END; m++) {
        if (IS_BLACK_KEY[m % 12]) buildKeyElement(m, true);
    }
}

function buildKeyElement(midi, isBlack) {
    const key = document.createElement('div');
    key.className = `key ${isBlack ? 'black' : 'white'}`;
    key.style.width = `${isBlack ? blackKeyWidth : whiteKeyWidth}px`;
    key.style.left = `${getNoteX(midi)}px`;
    
    elKeyboard.appendChild(key);
    pianoKeysMap.set(midi, key);
}

function handleResize() {
    elCanvas.width = elCanvas.parentElement.clientWidth;
    elCanvas.height = elCanvas.parentElement.clientHeight - 160;
    calculateLayoutMetrics();
    createKeyboard();
}

// --- Advanced Music Analysis Computations ---

// Pearson Correlation Coefficient calculation (Fallback)
function calculateCorrelation(x, y) {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    if (denX === 0 || denY === 0) return 0;
    return num / Math.sqrt(denX * denY);
}

// Mathematical Key Detection Fallback (Krumhansl-Schmuckler)
function analyzeKeySignature(notes) {
    if (!notes || notes.length === 0) return "Unknown";

    const pitchWeights = new Array(12).fill(0);
    notes.forEach(note => {
        const pitchClass = note.midi % 12;
        pitchWeights[pitchClass] += note.duration * (note.velocity || 0.8);
    });

    let bestMatchKey = "Undetermined";
    let highestCorrelation = -1;

    // Iterate major
    for (let shift = 0; shift < 12; shift++) {
        const rotatedModel = [];
        for (let i = 0; i < 12; i++) {
            rotatedModel.push(K_K_MAJOR[(i - shift + 12) % 12]);
        }
        const corr = calculateCorrelation(pitchWeights, rotatedModel);
        if (corr > highestCorrelation) {
            highestCorrelation = corr;
            bestMatchKey = `${PITCH_NAMES[shift]} Major`;
        }
    }

    // Iterate minor
    for (let shift = 0; shift < 12; shift++) {
        const rotatedModel = [];
        for (let i = 0; i < 12; i++) {
            rotatedModel.push(K_K_MINOR[(i - shift + 12) % 12]);
        }
        const corr = calculateCorrelation(pitchWeights, rotatedModel);
        if (corr > highestCorrelation) {
            highestCorrelation = corr;
            bestMatchKey = `${PITCH_NAMES[shift]} Minor`;
        }
    }

    return bestMatchKey;
}

// Native MIDI Key Signature Extractor (Primary Source Only)
function getMidiKeySignature() {
    if (midiData && midiData.header && midiData.header.keySignatures && midiData.header.keySignatures.length > 0) {
        const metaKey = midiData.header.keySignatures[0];
        const keyName = metaKey.key;
        const scaleType = metaKey.scale ? metaKey.scale.charAt(0).toUpperCase() + metaKey.scale.slice(1) : "Major";
        return `${keyName} ${scaleType}`;
    }
    // Strict system reconfig: Disable key signature auto-guessing
    return "C Major";
}

// Real-Time Chord Identification
function identifyCurrentChord(activeKeys) {
    if (activeKeys.size === 0) return "-";
    
    const pitchClasses = Array.from(new Set(Array.from(activeKeys).map(m => m % 12))).sort((a, b) => a - b);
    
    if (pitchClasses.length < 2) {
        if (pitchClasses.length === 1) return PITCH_NAMES[pitchClasses[0]];
        return "-";
    }

    const intervalsList = {
        "Major Triad": [0, 4, 7],
        "Minor Triad": [0, 3, 7],
        "Dominant 7th": [0, 4, 7, 10],
        "Major 7th": [0, 4, 7, 11],
        "Minor 7th": [0, 3, 7, 10],
        "Diminished Triad": [0, 3, 6],
        "Augmented Triad": [0, 4, 8],
        "Suspended 4th": [0, 5, 7],
        "Suspended 2nd": [0, 2, 7],
        "Perfect 5th": [0, 7]
    };

    for (let root of pitchClasses) {
        const calculatedIntervals = pitchClasses.map(p => (p - root + 12) % 12).sort((a, b) => a - b);
        
        for (let [name, pattern] of Object.entries(intervalsList)) {
            const matchesPattern = pattern.every(p => calculatedIntervals.includes(p));
            if (matchesPattern) {
                return `${PITCH_NAMES[root]} ${name}`;
            }
        }
    }

    return pitchClasses.map(p => PITCH_NAMES[p]).join("-");
}

// --- Optimized Visualizer Clipping binary bounds search ---
function getVisibleNotesSlice() {
    if (!activeNotesMemory || activeNotesMemory.length === 0) return [];
    
    const tMin = currentPlaybackTime - maxNoteDuration;
    const tMax = currentPlaybackTime + (elCanvas.height / noteSpeed) + 1;
    
    // Lower-bound search
    let start = 0;
    let low = 0, high = activeNotesMemory.length - 1;
    while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (activeNotesMemory[mid].time >= tMin) {
            start = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    
    // Upper-bound search
    let end = activeNotesMemory.length - 1;
    low = 0; high = activeNotesMemory.length - 1;
    while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (activeNotesMemory[mid].time <= tMax) {
            end = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    
    return activeNotesMemory.slice(start, end + 1);
}

// Retrieves or generates pre-allocated gradients to optimize paint iterations
function getCachedNoteGradient(ctx, x, yEnd, w, yStart, isBlack, isNoteActiveNow) {
    const height = Math.round(yStart - yEnd);
    const width = Math.round(w);
    const cacheKey = `${width}_${height}_${isBlack ? 'B' : 'W'}_${isNoteActiveNow ? 'A' : 'I'}`;
    
    if (gradientCache[cacheKey]) {
        return gradientCache[cacheKey];
    }
    
    const noteGrad = ctx.createLinearGradient(x, yEnd, x + w, yStart);
    if (isNoteActiveNow) {
        noteGrad.addColorStop(0, '#e879f9');
        noteGrad.addColorStop(1, '#a855f7');
    } else {
        noteGrad.addColorStop(0, isBlack ? '#4f46e5' : '#6366f1');
        noteGrad.addColorStop(1, isBlack ? '#1e1b4b' : '#312e81');
    }
    
    // Clear pool size limits to prevent excessive memory cache expansion
    if (Object.keys(gradientCache).length < 600) {
        gradientCache[cacheKey] = noteGrad;
    }
    return noteGrad;
}

// --- Real-Time Execution Tick & Canvas Render Loop ---
function renderFrame(now) {
    requestAnimationFrame(renderFrame);

    const delta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    if (isPlaying && midiData) {
        const prevTime = currentPlaybackTime;
        currentPlaybackTime += delta * playbackSpeed;
        
        if (currentPlaybackTime >= totalDuration) {
            if (isLooping) {
                seekTo(0);
            } else {
                stopPlayback();
            }
        }

        elTimeline.value = currentPlaybackTime;
        updateTimeDisplay();

        // Audio Note Trigger Scheduler (Highly Optimized Pointer check)
        while (playbackNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[playbackNoteIndex];
            if (note.time < currentPlaybackTime) {
                if (note.time >= prevTime) {
                    const playDelay = Math.max(0, note.time - prevTime) / playbackSpeed;
                    activeInstrument.triggerAttackRelease(note.name, note.duration, Tone.now() + playDelay, note.velocity);
                }
                playbackNoteIndex++;
            } else {
                break;
            }
        }
    }

    // Draw Process
    ctx.clearRect(0, 0, elCanvas.width, elCanvas.height);

    currentlyActiveMidiKeys.clear(); // Reused directly to eliminate GC frame pauses

    if (midiData) {
        // Fetch the clipped visible notes slice instead of scanning all notes
        const visibleSlice = getVisibleNotesSlice();
        
        visibleSlice.forEach(note => {
            // Compute visual spatial layout bounds
            const noteVisualYStart = elCanvas.height - ((note.time - currentPlaybackTime) * noteSpeed);
            const noteVisualHeight = note.duration * noteSpeed;
            const noteVisualYEnd = noteVisualYStart - noteVisualHeight;

            // Skip processing if rendering outside visible screen bounds
            if (noteVisualYStart < 0 || noteVisualYEnd > elCanvas.height) return;

            const isNoteActiveNow = (currentPlaybackTime >= note.time && currentPlaybackTime <= note.time + note.duration);
            if (isNoteActiveNow) {
                currentlyActiveMidiKeys.add(note.midi);
                
                // Particle collision generation (Condition altered non-destructively to respect setting toggles)
                if ((window.showSplashParticles !== false) && Math.random() < 0.25) {
                    const isBlack = IS_BLACK_KEY[note.midi % 12];
                    const noteX = getNoteX(note.midi) + (isBlack ? blackKeyWidth : whiteKeyWidth) / 2;
                    spawnParticles(noteX, elCanvas.height, isBlack ? '#a855f7' : '#818cf8');
                }
            }

            // Render dynamic linear-gradient visual paths
            const isBlack = IS_BLACK_KEY[note.midi % 12];
            const x = getNoteX(note.midi);
            const w = isBlack ? blackKeyWidth : whiteKeyWidth;

            // Fetch optimized cached gradient
            ctx.fillStyle = getCachedNoteGradient(ctx, x, noteVisualYEnd, w, noteVisualYStart, isBlack, isNoteActiveNow);
            ctx.beginPath();
            ctx.roundRect(x + 2, noteVisualYEnd, w - 4, noteVisualHeight, 6);
            ctx.fill();

            // Active glow trace element (Optimized to simulate neon without costly canvas shadowBlur context)
            if (isNoteActiveNow) {
                ctx.fillStyle = '#f3e8ff';
                ctx.fillRect(x + 2, elCanvas.height - 4, w - 4, 4);
                
                // Fast double-pass glow mapping
                ctx.fillStyle = 'rgba(192, 132, 252, 0.4)';
                ctx.fillRect(x, elCanvas.height - 6, w, 2);
            }
        });
    }

    // Real-time Live Chord computational readout (Optimized: DOM only updated on actual changes)
    const activeKeysArray = Array.from(currentlyActiveMidiKeys).sort((a, b) => a - b);
    const activeKeysString = activeKeysArray.join(",");
    if (activeKeysString !== lastActiveKeysString) {
        lastActiveKeysString = activeKeysString;
        document.getElementById('stat-chord').textContent = identifyCurrentChord(currentlyActiveMidiKeys);
    }

    // Update Physical DOM Keyboard Key highlights (Optimized: Eliminates constant DOM write thrashing)
    pianoKeysMap.forEach((elKey, midi) => {
        const isActive = currentlyActiveMidiKeys.has(midi);
        if (pianoKeyStateCache.get(midi) !== isActive) {
            pianoKeyStateCache.set(midi, isActive);
            if (isActive) {
                elKey.classList.add('active');
            } else {
                elKey.classList.remove('active');
            }
        }
    });

    // Animate kinetic particle physics
    particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // simulated grav force
        p.alpha -= p.decay;
        
        if (p.alpha <= 0) {
            particles.splice(idx, 1);
        } else {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
}

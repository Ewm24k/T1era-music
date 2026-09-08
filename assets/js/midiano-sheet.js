// Playback sync variables
let sheetVisualNoteIndex = 0;
let verticalVisualNoteIndex = 0;
let studioVisualNoteIndex = 0;
let sheetAudioStartTime = 0;
let sheetLogicalStartTime = 0;
let verticalAudioStartTime = 0;
let verticalLogicalStartTime = 0;
let studioAudioStartTime = 0;
let studioLogicalStartTime = 0;

// Global Resolved Title State Cache & Layout Offsets
let resolvedSheetTitle = "";
let currentHeaderOffset = 110; // Dynamic vertical spacer margin

// Inject modern responsive layout CSS for Section 2 controls inside the sheet music popup (iOS & Android optimized)
const styleNode = document.createElement('style');
styleNode.innerHTML = `
    /* Pinned Sticky Header Wrapper with Glassmorphic styling for Section 2 controls */
    div:has(> #btn-play-second) {
        position: sticky !important;
        top: 0 !important;
        z-index: 50 !important;
        background: rgba(11, 11, 15, 0.94) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        padding: 10px 16px !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
        margin-bottom: 14px !important;
    }

    /* Standard desktop overrides */
    #btn-play-second, #btn-stop-second, #btn-maximize-second, #btn-download-second {
        font-family: inherit !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
    }

    /* High-density, professional mobile viewport styling (iOS & Android) */
    @media (max-width: 768px) {
        /* Align parent sticky panel on mobile */
        div:has(> #btn-play-second) {
            padding: 8px 12px !important;
            gap: 6px !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
            margin-bottom: 8px !important;
        }

        /* Forces a neat 2x2 grid on narrow mobile screens so buttons never overflow */
        #btn-play-second, #btn-stop-second, #btn-maximize-second, #btn-download-second {
            font-size: 11px !important;
            padding: 0 8px !important;
            height: 32px !important;
            border-radius: 6px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-weight: 600 !important;
            border: none !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2) !important;
            margin: 0 !important;
            flex: 1 1 calc(50% - 6px) !important;
            white-space: nowrap !important;
        }

        /* Force show colors checkbox to center nicely below the button grid */
        label[for="chk-show-colors"], 
        div:has(> #chk-show-colors) {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            margin-top: 6px !important;
            font-size: 11.5px !important;
            color: rgba(255, 255, 255, 0.6) !important;
        }

        /* Fix scroll containers heights inside popup on phone devices */
        #sheet-tab-notation-content-vertical,
        #sheet-tab-studio-content-vertical {
            max-height: calc(100vh - 230px - env(safe-area-inset-bottom)) !important;
            overflow-y: auto !important;
            padding-bottom: 60px !important;
            -webkit-overflow-scrolling: touch !important;
        }
    }
`;
document.head.appendChild(styleNode);

// Intelligent SVG text wrapper helper
function wrapSvgText(text, maxCharsPerLine) {
    if (!text) return [];
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
            currentLine = (currentLine + " " + word).trim();
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

// Helper to extract clean track title directly from the URL filename as a fast fallback
function extractTitleFromUrl(url) {
    if (!url) return "";
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
        let decoded = decodeURIComponent(filename);
        decoded = decoded.replace(/\.mid(i)?$/i, '');
        if (decoded.includes('/')) {
            decoded = decoded.substring(decoded.lastIndexOf('/') + 1);
        }
        if (decoded === "final_score" || decoded === "t1era_score" || decoded === "demo1" || decoded === "demo2") {
            return "";
        }
        return decoded;
    } catch (e) {
        return "";
    }
}

// Algorithmic Title Resolver using URL parameters, localStorage, details.json, and URL-fallback systems
async function resolveSheetTitle() {
    if (resolvedSheetTitle) return resolvedSheetTitle;

    // Start with a default placeholder
    let title = "Untitled Track";
    if (midiData && midiData.name && midiData.name !== "Untitled" && midiData.name !== "t1era_score.mid") {
        title = midiData.name;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const currentMidiUrl = urlParams.get("midi") || localStorage.getItem("t1era_current_midi");

    // Case-insensitive check to identify generic placeholder names, specifically catching "Untitled Track" [1]
    const isGeneric = !title || 
                      title.toLowerCase().includes("untitled") || 
                      title === "Local Uploaded Track" || 
                      title.startsWith("YouTube Stream Audio") ||
                      title === "t1era_score.mid";

    // Replicate the exact title resolution query from dashboard.js if name is generic [1]
    if (isGeneric && currentMidiUrl) {
        try {
            // Replicate the exact replacement logic from dashboard.js [1]
            const detailsUrl = currentMidiUrl.replace("final_score.mid", "details.json");
            const response = await fetch(detailsUrl);
            if (response.ok) {
                const jsonDetails = await response.json();
                if (jsonDetails && jsonDetails.title) {
                    resolvedSheetTitle = jsonDetails.title;
                    return resolvedSheetTitle;
                }
            }
        } catch (e) {
            console.warn("[SHEET TITLE RESOLVE WARNING] Failed fetching details.json:", e);
        }

        // URL Filename Fallback
        const urlFilename = extractTitleFromUrl(currentMidiUrl);
        if (urlFilename) {
            resolvedSheetTitle = urlFilename;
            return resolvedSheetTitle;
        }
    }

    resolvedSheetTitle = title;
    return resolvedSheetTitle;
}

// Merges active note timelines to isolate all global silent segments (gaps) in the piece
function findSilenceGaps(notes) {
    if (!notes || notes.length === 0) return [];
    
    // Sort notes chronologically by onset time
    const sorted = [...notes].sort((a, b) => a.time - b.time);
    
    const activeIntervals = [];
    let current = { start: sorted[0].time, end: sorted[0].time + sorted[0].duration };
    
    for (let i = 1; i < sorted.length; i++) {
        const note = sorted[i];
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;
        
        if (noteStart <= current.end) {
            current.end = Math.max(current.end, noteEnd);
        } else {
            activeIntervals.push(current);
            current = { start: noteStart, end: noteEnd };
        }
    }
    activeIntervals.push(current);
    
    const gaps = [];
    
    // Check for an intro gap
    if (activeIntervals[0].start > 0.05) {
        gaps.push({ start: 0, end: activeIntervals[0].start });
    }
    
    // Check for mid-song gaps between playing blocks
    for (let i = 0; i < activeIntervals.length - 1; i++) {
        const gapStart = activeIntervals[i].end;
        const gapEnd = activeIntervals[i + 1].start;
        
        if (gapEnd - gapStart > 0.05) {
            gaps.push({ start: gapStart, end: gapEnd });
        }
    }
    
    return gaps;
}

// --- Helper Functions for Procedural Rests Rendering ---
function renderRestsForGap(svgContent, startX, endX, centerY, isRH) {
    const gapDuration = (endX - startX) / pixelsPerSecond;
    if (gapDuration <= 0.05) return svgContent;

    const bpm = (midiData && midiData.header && midiData.header.tempos && midiData.header.tempos[0]) 
        ? midiData.header.tempos[0].bpm 
        : 120;
    const beatDuration = 60 / bpm;

    const whole = 4 * beatDuration;
    const half = 2 * beatDuration;

    let remaining = gapDuration;
    let currentX = startX;

    const color = isRH ? "#818cf8" : "#fbbf24";
    const dy = 3; // spacing increment

    while (remaining > 0.05) {
        let restType = "";
        let restWidth = 0;

        if (remaining >= whole - 0.05) {
            restType = "whole";
            restWidth = whole * pixelsPerSecond;
            remaining -= whole;
        } else if (remaining >= half - 0.05) {
            restType = "half";
            restWidth = half * pixelsPerSecond;
            remaining -= half;
        } else {
            break;
        }

        const midX = currentX + restWidth / 2;

        if (restType === "whole") {
            const line4Y = centerY - 3 * dy;
            svgContent += `<rect x="${midX - 7}" y="${line4Y}" width="14" height="6" fill="${color}" opacity="0.85" />`;
        } else if (restType === "half") {
            svgContent += `<rect x="${midX - 7}" y="${centerY - 6}" width="14" height="6" fill="${color}" opacity="0.85" />`;
        }

        currentX += restWidth;
    }

    return svgContent;
}

function renderRestsForGapVertical(svgContent, startSecs, endSecs, systemDuration, systemHeight, rhStaffCenterY, lhStaffCenterY, localPixelsPerSecond, marginLeftValue, startPadding, scale, showColors) {
    const bpm = (midiData && midiData.header && midiData.header.tempos && midiData.header.tempos[0]) 
        ? midiData.header.tempos[0].bpm 
        : 120;
    const beatDuration = 60 / bpm;

    const whole = 4 * beatDuration;
    const half = 2 * beatDuration;

    let remaining = endSecs - startSecs;
    let currentSecs = startSecs;

    const dy = 3.0;

    while (remaining > 0.05) {
        let restType = "";
        let restSecs = 0;

        if (remaining >= whole - 0.05) {
            restType = "whole";
            restSecs = whole;
            remaining -= whole;
        } else if (remaining >= half - 0.05) {
            restType = "half";
            restSecs = half;
            remaining -= half;
        } else {
            break;
        }

        const systemIdx = Math.floor(currentSecs / systemDuration);
        const yOffset = systemIdx * systemHeight + currentHeaderOffset; // Aligned dynamically with the custom header margin [1]
        const systemTimeOffset = currentSecs - systemIdx * systemDuration;
        
        const restX = systemTimeOffset * localPixelsPerSecond + marginLeftValue + startPadding * scale;
        const midX = restX + (restSecs * localPixelsPerSecond) / 2;

        const rhColor = showColors ? "#4f46e5" : "#111115";
        const lhColor = showColors ? "#d97706" : "#111115";

        svgContent = drawSingleRestSVG(svgContent, midX, yOffset + rhStaffCenterY, restType, rhColor, dy, scale);
        svgContent = drawSingleRestSVG(svgContent, midX, yOffset + lhStaffCenterY, restType, lhColor, dy, scale);

        currentSecs += restSecs;
    }

    return svgContent;
}

function drawSingleRestSVG(svgContent, x, centerY, type, color, dy, scale) {
    if (type === "whole") {
        const line4Y = centerY - 3 * dy * scale;
        svgContent += `<rect x="${x - 7 * scale}" y="${line4Y}" width="${14 * scale}" height="${6 * scale}" fill="${color}" opacity="0.85" />`;
    } else if (type === "half") {
        svgContent += `<rect x="${x - 7 * scale}" y="${centerY - 6 * scale}" width="${14 * scale}" height="${6 * scale}" fill="${color}" opacity="0.85" />`;
    }
    return svgContent;
}

// --- Shared massive-key / anti-choke playback guard ---
// Prefers the triggerNoteWithVoiceGuard() function defined in the audio
// engine script (handles same-pitch choking, overall polyphony stealing,
// and massive-chord burst thinning in one place). Falls back to a plain
// choke+attack call if that script isn't loaded, so this file still works
// on its own.
function playNoteSafely(noteName, duration, time, velocity, strict) {
    if (typeof triggerNoteWithVoiceGuard === 'function') {
        triggerNoteWithVoiceGuard(noteName, duration, time, velocity, strict);
        return;
    }
    if (activeInstrument) {
        if (typeof activeInstrument.triggerRelease === 'function') {
            activeInstrument.triggerRelease(noteName, time);
        }
        activeInstrument.triggerAttackRelease(noteName, duration, time, velocity);
    }
}

// Algorithmic spelling engine: Converts pitch numbers into properly spelled notes based on current Key Signature
function midiToAbcPitch(midi, key) {
    const pitchClass = midi % 12;
    const octave = Math.floor(midi / 12) - 1; // 4 is Middle C
    
    // Retrieve correct spelled diatonic accidental arrays based on current key signature map
    const keyMap = KEY_MAPS[key] || KEY_MAPS["C"];
    let baseName = keyMap[pitchClass];

    let abc = "";
    if (octave === 4) {
        abc = baseName;
    } else if (octave > 4) {
        // If baseName contains accidentals, isolate and format lowercase characters correctly
        const match = baseName.match(/^([=^^_]*)([A-G])$/);
        if (match) {
            abc = match[1] + match[2].toLowerCase();
        } else {
            abc = baseName.toLowerCase();
        }
        const ticks = octave - 5;
        abc += "'".repeat(ticks);
    } else {
        abc = baseName;
        const commas = 4 - octave;
        abc += ",".repeat(commas);
    }
    return abc;
}

// Converts exact float durations into robust simplified fractions for abc notation formatting
function toAbcFraction(val) {
    if (val <= 0) return "";
    const rounded = Math.round(val * 1000) / 1000;
    if (rounded === 1) return "";
    
    const num = Math.round(rounded * 1000);
    const den = 1000;
    
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const d = gcd(num, den);
    const finalNum = num / d;
    const finalDen = den / d;
    
    if (finalDen === 1) {
        return finalNum === 1 ? "" : `${finalNum}`;
    }
    return `${finalNum}/${finalDen}`;
}

// Render piano-roll style grand staff notation directly from the raw activeNotesMemory events (Continuous Layout)
function renderSheetMusic() {
    if (!midiData || activeNotesMemory.length === 0) return;

    // Trigger Title Resolving asynchronously if not already loaded (Self redraw loop)
    if (!resolvedSheetTitle && midiData) {
        resolveSheetTitle().then(() => {
            renderSheetMusic();
        });
    }

    // Use absolute timeline progression starting from 0 seconds
    const firstNoteTime = 0;
    const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);
    const svgWidth = totalDurationSecs * pixelsPerSecond + 200; // Offset spacing
    const svgHeight = 320;

    // RH and LH staff centerline layouts
    const rhStaffCenterY = 80;
    const lhStaffCenterY = 220;
    const dy = 3; // 3px height increment per chromatic semitone

    let svgContent = "";

    // 1. Draw RH Staff lines (E4=64, G4=67, B4=71, D5=74, F5=77)
    const rhLines = [64, 67, 71, 74, 77];
    rhLines.forEach(pitch => {
        const y = rhStaffCenterY - (pitch - 71) * dy;
        svgContent += `<line x1="0" y1="${y}" x2="${svgWidth}" y2="${y}" stroke="#242432" stroke-width="1.5" />`;
    });

    // 2. Draw LH Staff lines (G2=43, B2=47, D3=50, F3=53, A3=57)
    const lhLines = [43, 47, 50, 53, 57];
    lhLines.forEach(pitch => {
        const y = lhStaffCenterY - (pitch - 50) * dy;
        svgContent += `<line x1="0" y1="${y}" x2="${svgWidth}" y2="${y}" stroke="#242432" stroke-width="1.5" />`;
    });

    // 3. Draw middle system linkages and labels
    svgContent += `<line x1="20" y1="30" x2="20" y2="270" stroke="#4b5563" stroke-width="2" />`;
    svgContent += `<text x="30" y="85" fill="#9ca3af" font-size="14" font-weight="bold">RH</text>`;
    svgContent += `<text x="30" y="225" fill="#9ca3af" font-size="14" font-weight="bold">LH</text>`;

    // 4. Render procedurally-drawn clef symbols
    svgContent += `
    <g transform="translate(60, 80)" stroke="#818cf8" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 5,-40 L 5,30 C 5,38 0,42 -5,42 C -9,42 -12,38 -12,34 C -12,30 -9,27 -6,27 C -3,27 0,31 0,34" />
        <circle cx="5" cy="-40" r="3" fill="#818cf8" />
        <path d="M 5,-15 C 5,-28 15,-32 15,-20 C 15,-10 5,0 5,10" />
        <path d="M 5,10 C 5,22 -8,22 -8,10 C -8,-2 13,-2 13,10 C 13,20 3,24 0,16" />
    </g>`;

    svgContent += `
    <g transform="translate(60, 220)" stroke="#fbbf24" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M -8,-10 C -2,-18 10,-18 10,-8 C 10,2 -2,10 -8,18 C -10,21 -12,25 -12,28" />
        <circle cx="-8" cy="-10" r="3.5" fill="#fbbf24" stroke="none" />
        <circle cx="16" cy="-15" r="2.5" fill="#fbbf24" stroke="none" />
        <circle cx="16" cy="-5" r="2.5" fill="#fbbf24" stroke="none" />
    </g>`;

    // 5. Detect and Render All Silent Rest Gaps Chronologically
    const gaps = findSilenceGaps(activeNotesMemory);
    gaps.forEach(gap => {
        const restsEndSecs = Math.max(0, gap.end - 0.1);
        if (restsEndSecs > gap.start + 0.05) {
            svgContent = renderRestsForGap(svgContent, gap.start * pixelsPerSecond + 100, restsEndSecs * pixelsPerSecond + 100, rhStaffCenterY, true);
            svgContent = renderRestsForGap(svgContent, gap.start * pixelsPerSecond + 100, restsEndSecs * pixelsPerSecond + 100, lhStaffCenterY, false);
        }

        // Draw separate vertical double bar lines strictly fitting inside the 5-lines on each staff
        const doubleBarX = gap.end * pixelsPerSecond + 100 - 10;
        svgContent += `<!-- Double Bar Lines strictly fitting inside the 5 lines of each staff -->`;
        
        // Treble staff double bar (dy = 3)
        svgContent += `<line x1="${doubleBarX - 3}" y1="${rhStaffCenterY - 6 * dy}" x2="${doubleBarX - 3}" y2="${rhStaffCenterY + 7 * dy}" stroke="#818cf8" stroke-width="1.2" opacity="0.8" />`;
        svgContent += `<line x1="${doubleBarX}" y1="${rhStaffCenterY - 6 * dy}" x2="${doubleBarX}" y2="${rhStaffCenterY + 7 * dy}" stroke="#818cf8" stroke-width="2.8" opacity="0.8" />`;
        
        // Bass staff double bar
        svgContent += `<line x1="${doubleBarX - 3}" y1="${lhStaffCenterY - 7 * dy}" x2="${doubleBarX - 3}" y2="${lhStaffCenterY + 7 * dy}" stroke="#fbbf24" stroke-width="1.2" opacity="0.8" />`;
        svgContent += `<line x1="${doubleBarX}" y1="${lhStaffCenterY - 7 * dy}" x2="${doubleBarX}" y2="${lhStaffCenterY + 7 * dy}" stroke="#fbbf24" stroke-width="2.8" opacity="0.8" />`;
    });

    const ppq = (midiData && midiData.header) ? (midiData.header.PPQ || midiData.header.ppq || 480) : 480;

    // 6. Render notes row-by-row strictly matching the raw activeNotesMemory log
    activeNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const x = shiftedStart * pixelsPerSecond + 100;
        const w = Math.max(10, note.duration * pixelsPerSecond); // Ensure a minimal width
        const pitch = note.midi;

        let y = 0;
        let color = "";
        let stemDirection = "";

        // Middle C (60) hard split mapping: >= 60 to RH, < 60 to LH
        if (pitch >= 60) {
            y = rhStaffCenterY - (pitch - 71) * dy;
            color = "#818cf8"; // Purple/indigo
            
            // Center line (Line 3) of RH Treble clef is B4 (MIDI 71)
            if (pitch >= 72) {
                stemDirection = "down";
            } else {
                stemDirection = "up";
            }
        } else {
            y = lhStaffCenterY - (pitch - 50) * dy;
            color = "#fbbf24"; // Amber/gold
            
            // Center line (Line 3) of LH Bass clef is D3 (MIDI 50)
            if (pitch >= 51) {
                stemDirection = "down";
            } else {
                stemDirection = "up";
            }
        }

        // Render dynamic ledger lines for notes that are placed off-staff
        if (pitch >= 60) {
            // RH (Treble) Ledger Lines
            if (pitch <= 60) { // Middle C (60)
                const ly = rhStaffCenterY - (60 - 71) * dy;
                svgContent += `<line x1="${x - 12}" y1="${ly}" x2="${x + 12}" y2="${ly}" stroke="${color}" stroke-width="1.5" />`;
            } else if (pitch >= 81) { // High ledger notes
                const rhLedgerLines = [81, 84, 88, 91, 95, 98, 101, 105, 108];
                rhLedgerLines.forEach(lp => {
                    if (lp <= pitch) {
                        const ly = rhStaffCenterY - (lp - 71) * dy;
                        svgContent += `<line x1="${x - 12}" y1="${ly}" x2="${x + 12}" y2="${ly}" stroke="${color}" stroke-width="1.5" />`;
                    }
                });
            }
        } else {
            // LH (Bass) Ledger Lines (Corrected loop wrapper to resolve reference error crash)
            if (pitch <= 40) { // Low ledger notes (such as E2 = 40)
                const lhLedgerLines = [40, 36, 33, 29, 26, 24, 21];
                lhLedgerLines.forEach(lp => {
                    if (lp >= pitch) {
                        const ly = lhStaffCenterY - (lp - 50) * dy;
                        svgContent += `<line x1="${x - 12}" y1="${ly}" x2="${x + 12}" y2="${ly}" stroke="${color}" stroke-width="1.5" />`;
                    }
                });
            }
        }

        // Note duration bar
        svgContent += `<rect x="${x}" y="${y - 4}" width="${w}" height="8" rx="4" fill="${color}" opacity="0.6" id="sheet-note-rect-${index}" />`;

        const durationTicks = note.durationTicks || (note.duration * 2 * ppq);
        const isWholeNote = durationTicks >= ppq * 3.2;
        const isHalfNote = durationTicks >= ppq * 1.6 && durationTicks < ppq * 3.2;

        // Notehead - Hollow open-center with border stroke for whole & half notes, solid fill for quarter notes (reduced stroke weight to 1.3)
        let noteheadFill = color;
        let noteheadStroke = "none";
        let strokeWidthAttr = "";
        if (isWholeNote || isHalfNote) {
            noteheadFill = "#0b0b0f"; // Masks background of horizontal system cleanly
            noteheadStroke = color;
            strokeWidthAttr = 'stroke-width="1.3"';
        }

        svgContent += `<ellipse cx="${x}" cy="${y}" rx="7" ry="5" fill="${noteheadFill}" stroke="${noteheadStroke}" ${strokeWidthAttr} id="sheet-notehead-${index}" transform="rotate(-15, ${x}, ${y})" />`;

        // Stems standard attachment (Whole notes do not have stems in standard engraving)
        if (!isWholeNote) {
            if (stemDirection === "up") {
                svgContent += `<line x1="${x + 6}" y1="${y}" x2="${x + 6}" y2="${y - 25}" stroke="${color}" stroke-width="1.5" id="sheet-stem-${index}" />`;
            } else {
                svgContent += `<line x1="${x - 6}" y1="${y}" x2="${x - 6}" y2="${y + 25}" stroke="${color}" stroke-width="1.5" id="sheet-stem-${index}" />`;
            }
        }
    });

    // Playback tracking cursor line
    svgContent += `<line id="sheet-playback-cursor" x1="100" y1="10" x2="100" y2="290" stroke="#ef4444" stroke-width="2" style="display: none;" />`;

    // Insert vector graphic content inside the display frame
    const svgString = `<svg width="${svgWidth}" height="${svgHeight}" style="background: #0b0b0f; border-radius: 8px;">${svgContent}</svg>`;
    elSheetMusicNotation.innerHTML = svgString;

    // Automatically populate the wrapped portrait score inside Section 2
    renderVerticalSheetMusic('sheet-music-notation-vertical');
}

// Render the vertically wrapped portrait-layout sheet music with adaptive mobile zoom configurations strictly for maximized modal
function renderVerticalSheetMusic(targetContainerId) {
    if (!midiData || activeNotesMemory.length === 0) return;

    // Trigger Title Resolving asynchronously if not already loaded (Self redraw loop)
    if (!resolvedSheetTitle && midiData) {
        resolveSheetTitle().then(() => {
            if (targetContainerId === 'sheet-music-notation-vertical') {
                renderVerticalSheetMusic('sheet-music-notation-vertical');
            } else if (targetContainerId === 'sheet-music-notation-max') {
                renderVerticalSheetMusic('sheet-music-notation-max');
            }
        });
    }

    const firstNoteTime = 0;
    const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

    const marginLeft = 100;

    // 1. Responsive Dynamic Width Scaling
    let containerWidth = 950; // default for desktop
    const parentWidth = document.getElementById(targetContainerId)?.parentElement?.clientWidth || window.innerWidth;
    
    if (targetContainerId === 'sheet-music-notation-max') {
        const container = document.getElementById('max-modal-scroll-container');
        if (container && container.clientWidth) {
            containerWidth = Math.max(320, container.clientWidth - 40);
        } else {
            containerWidth = Math.max(1200, window.innerWidth * 0.88);
        }
    } else {
        if (parentWidth < 950) {
            containerWidth = Math.max(320, parentWidth - 20);
        }
    }

    // 2. Mobile Layout & Geometry Scaling Parameters
    const isVerticalOrMax = (targetContainerId === 'sheet-music-notation-vertical' || targetContainerId === 'sheet-music-notation-max');
    const isPhoneView = containerWidth < 768;
    const shouldScale = isVerticalOrMax && isPhoneView; // Zoom out in standard popup and maximized state on mobile screens

    const scale = shouldScale ? 0.65 : 1.0;
    const systemDuration = shouldScale ? 6 : 10;            // Expands spacing horizontally by 66% on mobile
    const numSystems = Math.ceil(totalDurationSecs / systemDuration);

    const systemHeight = shouldScale ? 140 : 220;
    const rhStaffCenterY = shouldScale ? 40 : 60;
    const lhStaffCenterY = shouldScale ? 100 : 160;
    const dy = shouldScale ? 2.0 : 3.0;                      // Reduces vertical staff lines spacing
    
    const svgWidth = containerWidth;
    let marginLeftValue = marginLeft;
    let marginRightValue = 50;
    
    if (containerWidth < 600) {
        marginLeftValue = 40;
        marginRightValue = 15;
    }
    
    const systemWidth = svgWidth - marginLeftValue - marginRightValue;
    // Shifted entire layout down by 70px to make room for Title + Subtitle
    const svgHeight = numSystems * systemHeight + 170; 

    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    // 3. Proportional Scaling
    const startPadding = 45; // Space for clefs & signatures
    const localPixelsPerSecond = (systemWidth - startPadding * scale) / systemDuration;

    let svgContent = "";

    // 4. Centered Track Title & Subtitle inside the Sheet Music (Strictly inside Section 2 SVG Canvas) [1]
    const titleText = resolvedSheetTitle || "Loading Score...";
    const titleLines = wrapSvgText(titleText, containerWidth < 600 ? 25 : 50).slice(0, 2);
    
    // Scale system spacer dynamically depending on if title wraps to 2 lines [1]
    currentHeaderOffset = titleLines.length > 1 ? 135 : 110;
    const svgHeightVal = numSystems * systemHeight + currentHeaderOffset + 60; 

    if (titleLines.length === 1) {
        svgContent += `<text x="${svgWidth / 2}" y="45" text-anchor="middle" fill="#111115" font-size="20" font-weight="700" font-family="Georgia, serif">${titleLines[0]}</text>`;
        svgContent += `<text x="${svgWidth / 2}" y="65" text-anchor="middle" fill="#66666e" font-size="11" font-weight="500" font-family="-apple-system, sans-serif">(c) T1ERA Music Ai</text>`;
    } else if (titleLines.length > 1) {
        svgContent += `<text x="${svgWidth / 2}" y="40" text-anchor="middle" fill="#111115" font-size="18" font-weight="700" font-family="Georgia, serif">${titleLines[0]}</text>`;
        svgContent += `<text x="${svgWidth / 2}" y="65" text-anchor="middle" fill="#111115" font-size="18" font-weight="700" font-family="Georgia, serif">${titleLines[1]}</text>`;
        svgContent += `<text x="${svgWidth / 2}" y="88" text-anchor="middle" fill="#66666e" font-size="11" font-weight="500" font-family="-apple-system, sans-serif">(c) T1ERA Music Ai</text>`;
    }

    // Robust Time Signature Parsing from MIDI Header
    let timeSignatureNum = 4;
    let timeSignatureDen = 4;
    if (midiData && midiData.header && midiData.header.timeSignatures && midiData.header.timeSignatures.length > 0) {
        const ts = midiData.header.timeSignatures[0].timeSignature;
        if (Array.isArray(ts) && ts.length === 2) {
            timeSignatureNum = ts[0];
            timeSignatureDen = ts[1];
        }
    }

    for (let i = 0; i < numSystems; i++) {
        // Systems yOffset dynamically aligned [1]
        const yOffset = i * systemHeight + 110;

        // Draw Treble staff lines
        const rhLines = [64, 67, 71, 74, 77];
        rhLines.forEach(pitch => {
            const y = yOffset + rhStaffCenterY - (pitch - 71) * dy;
            svgContent += `<line x1="${marginLeftValue}" y1="${y}" x2="${marginLeftValue + systemWidth}" y2="${y}" stroke="#9ca3af" stroke-width="${0.75 * scale}" />`;
        });

        // Draw Bass staff lines
        const lhLines = [43, 47, 50, 53, 57];
        lhLines.forEach(pitch => {
            const yOffsetVal = yOffset;
            const y = yOffsetVal + lhStaffCenterY - (pitch - 50) * dy;
            svgContent += `<line x1="${marginLeftValue}" y1="${y}" x2="${marginLeftValue + systemWidth}" y2="${y}" stroke="#9ca3af" stroke-width="${0.75 * scale}" />`;
        });

        // Draw bracket linkage and labels (aligned cleanly to margins)
        const bracketX = marginLeftValue - (shouldScale ? 30 * scale : 80);
        svgContent += `<line x1="${bracketX}" y1="${yOffset + (rhStaffCenterY - 24) * scale}" x2="${bracketX}" y2="${yOffset + (lhStaffCenterY + 27) * scale}" stroke="#111115" stroke-width="${1.5 * scale}" />`;
        
        const labelX = marginLeftValue - (shouldScale ? 22 * scale : 60);
        svgContent += `<text x="${labelX}" y="${yOffset + rhStaffCenterY + 5 * scale}" fill="#111115" font-size="${14 * scale}" font-weight="bold" font-family="-apple-system, sans-serif">RH</text>`;
        svgContent += `<text x="${labelX}" y="${yOffset + lhStaffCenterY + 5 * scale}" fill="#111115" font-size="${14 * scale}" font-weight="bold" font-family="-apple-system, sans-serif">LH</text>`;

        // Treble Clef
        const clefX = marginLeftValue - (shouldScale ? 12 * scale : 30);
        svgContent += `
        <g transform="translate(${clefX}, ${yOffset + rhStaffCenterY}) scale(${scale})" stroke="#111115" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 5,-40 L 5,30 C 5,38 0,42 -5,42 C -9,42 -12,38 -12,34 C -12,30 -9,27 -6,27 C -3,27 0,31 0,34" />
            <circle cx="5" cy="-40" r="3" fill="#111115" />
            <path d="M 5,-15 C 5,-28 15,-32 15,-20 C 15,-10 5,0 5,10" />
            <path d="M 5,10 C 5,22 -8,22 -8,10 C -8,-2 13,-2 13,10 C 13,20 3,24 0,16" />
        </g>`;

        // Bass Clef
        svgContent += `
        <g transform="translate(${clefX}, ${yOffset + lhStaffCenterY}) scale(${scale})" stroke="#111115" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M -8,-10 C -2,-18 10,-18 10,-8 C 10,2 -2,10 -8,18 C -10,21 -12,25 -12,28" />
            <circle cx="-8" cy="-10" r="3.5" fill="#111115" stroke="none" />
            <circle cx="16" cy="-15" r="2.5" fill="#111115" stroke="none" />
            <circle cx="16" cy="-5" r="2.5" fill="#111115" stroke="none" />
        </g>`;

        // Draw Real Time Signature on the First System ONLY
        if (i === 0) {
            const tsX = marginLeftValue + (shouldScale ? 10 * scale : 12);
            // Treble Time Signature (RH)
            svgContent += `
            <g id="${targetContainerId}-time-signature-treble" fill="#111115" stroke="none">
                <text x="${tsX}" y="${yOffset + rhStaffCenterY - 4 * scale}" font-family="Georgia, serif" font-size="${24 * scale}" font-weight="bold" text-anchor="middle">${timeSignatureNum}</text>
                <text x="${tsX}" y="${yOffset + rhStaffCenterY + 12 * scale}" font-family="Georgia, serif" font-size="${24 * scale}" font-weight="bold" text-anchor="middle">${timeSignatureDen}</text>
            </g>`;

            // Bass Time Signature (LH)
            svgContent += `
            <g id="${targetContainerId}-time-signature-bass" fill="#111115" stroke="none">
                <text x="${tsX}" y="${yOffset + lhStaffCenterY - 4 * scale}" font-family="Georgia, serif" font-size="${24 * scale}" font-weight="bold" text-anchor="middle">${timeSignatureNum}</text>
                <text x="${tsX}" y="${yOffset + lhStaffCenterY + 12 * scale}" font-family="Georgia, serif" font-size="${24 * scale}" font-weight="bold" text-anchor="middle">${timeSignatureDen}</text>
            </g>`;
        }
    }

    // Detect and Render All Silent Rest Gaps Chronologically (Vertical score)
    const gaps = findSilenceGaps(activeNotesMemory);
    gaps.forEach(gap => {
        const restsEndSecs = Math.max(0, gap.end - 0.1);
        if (restsEndSecs > gap.start + 0.05) {
            svgContent = renderRestsForGapVertical(
                svgContent, gap.start, restsEndSecs, 
                systemDuration, systemHeight, rhStaffCenterY, lhStaffCenterY, 
                localPixelsPerSecond, marginLeftValue, startPadding, scale, showColors
            );
        }

        // Calculate system index based on actual gap end (first note start) to avoid system splits
        const firstNoteSystemIdx = Math.floor(gap.end / systemDuration);
        const yOffset = firstNoteSystemIdx * systemHeight + currentHeaderOffset; // Aligned dynamically [1]
        const systemTimeOffset = gap.end - firstNoteSystemIdx * systemDuration;
        
        // Compute exact scaled x position slightly before the note center
        const noteX = systemTimeOffset * localPixelsPerSecond + marginLeftValue + startPadding * scale;
        const doubleBarX = noteX - 10 * scale;

        svgContent += `<!-- Double Bar Lines strictly fitting inside the 5 lines of each staff (Vertical) -->`;
        
        // Treble staff double bar (y coordinates fit exactly inside the 5 lines without scale multiplication on rhStaffCenterY)
        svgContent += `<line x1="${doubleBarX - 3 * scale}" y1="${yOffset + rhStaffCenterY - 6 * dy}" x2="${doubleBarX - 3 * scale}" y2="${yOffset + rhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="${1.0 * scale}" />`;
        svgContent += `<line x1="${doubleBarX}" y1="${yOffset + rhStaffCenterY - 6 * dy}" x2="${doubleBarX}" y2="${yOffset + rhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="${2.4 * scale}" />`;
        
        // Bass staff double bar
        svgContent += `<line x1="${doubleBarX - 3 * scale}" y1="${yOffset + lhStaffCenterY - 7 * dy}" x2="${doubleBarX - 3 * scale}" y2="${yOffset + lhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="${1.0 * scale}" />`;
        svgContent += `<line x1="${doubleBarX}" y1="${yOffset + lhStaffCenterY - 7 * dy}" x2="${doubleBarX}" y2="${yOffset + lhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="${2.4 * scale}" />`;
    });

    const ppq = (midiData && midiData.header) ? (midiData.header.PPQ || midiData.header.ppq || 480) : 480;

    // 4. Draw the notes into their corresponding staff systems (Scale-fitted)
    activeNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const systemIdx = Math.floor(shiftedStart / systemDuration);
        if (systemIdx >= numSystems) return;

        const yOffset = systemIdx * systemHeight + currentHeaderOffset; // Aligned dynamically [1]
        const systemTimeOffset = shiftedStart - systemIdx * systemDuration;
        const noteX = systemTimeOffset * localPixelsPerSecond + marginLeftValue + startPadding * scale;
        
        // Prevent horizontal overflow past system bounds dynamically
        const maxAllowedWidth = (marginLeftValue + systemWidth) - noteX;
        const noteW = Math.min(Math.max(6 * scale, note.duration * localPixelsPerSecond), maxAllowedWidth);
        const pitch = note.midi;

        let y = 0;
        let color = "";
        let stemDirection = "";

        if (pitch >= 60) {
            y = yOffset + rhStaffCenterY - (pitch - 71) * dy;
            color = showColors ? "#4f46e5" : "#111115";
            stemDirection = (pitch >= 72) ? "down" : "up";
        } else {
            y = yOffset + lhStaffCenterY - (pitch - 50) * dy;
            color = showColors ? "#d97706" : "#111115";
            stemDirection = (pitch >= 51) ? "down" : "up";
        }

        // Render dynamic ledger lines for notes that are placed off-staff
        const lineStroke = showColors ? color : "#111115";
        if (pitch >= 60) {
            if (pitch <= 60) { // Middle C (60)
                const ly = yOffset + rhStaffCenterY - (60 - 71) * dy;
                svgContent += `<line x1="${noteX - 8 * scale}" y1="${ly}" x2="${noteX + 8 * scale}" y2="${ly}" stroke="${lineStroke}" stroke-width="${1.2 * scale}" />`;
            } else if (pitch >= 81) { // High ledger notes
                const rhLedgerLines = [81, 84, 88, 91, 95, 98, 101, 105, 108];
                rhLedgerLines.forEach(lp => {
                    if (lp <= pitch) {
                        const ly = yOffset + rhStaffCenterY - (lp - 71) * dy;
                        svgContent += `<line x1="${noteX - 8 * scale}" y1="${ly}" x2="${noteX + 8 * scale}" y2="${ly}" stroke="${lineStroke}" stroke-width="${1.2 * scale}" />`;
                    }
                });
            }
        } else {
            if (pitch <= 40) { // Low ledger notes (such as E2 = 40)
                const lhLedgerLines = [40, 36, 33, 29, 26, 24, 21];
                lhLedgerLines.forEach(lp => {
                    if (lp >= pitch) {
                        const ly = yOffset + lhStaffCenterY - (lp - 50) * dy;
                        svgContent += `<line x1="${noteX - 8 * scale}" y1="${ly}" x2="${noteX + 8 * scale}" y2="${ly}" stroke="${lineStroke}" stroke-width="${1.2 * scale}" />`;
                    }
                });
            }
        }

        // Note duration bar
        if (showColors) {
            svgContent += `<rect x="${noteX}" y="${y - 3 * scale}" width="${noteW}" height="${6 * scale}" rx="${3 * scale}" fill="${color}" opacity="0.6" id="${targetContainerId}-note-rect-${index}" />`;
        }

        const durationTicks = note.durationTicks || (note.duration * 2 * ppq);
        const isWholeNote = durationTicks >= ppq * 3.2;
        const isHalfNote = durationTicks >= ppq * 1.6 && durationTicks < ppq * 3.2;

        // Notehead
        let noteheadFill = color;
        let noteheadStroke = "none";
        let strokeWidthAttr = "";
        if (isWholeNote || isHalfNote) {
            noteheadFill = "#ffffff"; // Masks background cleanly in white portal viewports
            noteheadStroke = color;
            strokeWidthAttr = `stroke-width="${1.3 * scale}"`;
        }

        svgContent += `<ellipse cx="${noteX}" cy="${y}" rx="${5.5 * scale}" ry="${3.8 * scale}" fill="${noteheadFill}" stroke="${noteheadStroke}" ${strokeWidthAttr} id="${targetContainerId}-notehead-${index}" transform="rotate(-15, ${noteX}, ${y})" />`;

        // Stems standard attachment (No stem for Whole notes)
        if (!isWholeNote) {
            if (stemDirection === "up") {
                svgContent += `<line x1="${noteX + 4.5 * scale}" y1="${y}" x2="${noteX + 4.5 * scale}" y2="${y - 18 * scale}" stroke="${color}" stroke-width="${1.2 * scale}" id="${targetContainerId}-stem-${index}" />`;
            } else {
                svgContent += `<line x1="${noteX - 4.5 * scale}" y1="${y}" x2="${noteX - 4.5 * scale}" y2="${y + 18 * scale}" stroke="${color}" stroke-width="${1.2 * scale}" id="${targetContainerId}-stem-${index}" />`;
            }
        }
    });

    // Final Bold Double Bar Line (aligned dynamically to last note's completion)
    const lastNoteTimeShifted = totalDurationSecs;
    const lastSystemIdx = Math.floor(lastNoteTimeShifted / systemDuration);
    const lastSystemTimeOffset = lastNoteTimeShifted - lastSystemIdx * systemDuration;
    const endX = Math.min(lastSystemTimeOffset * localPixelsPerSecond + marginLeftValue + startPadding * scale, marginLeftValue + systemWidth);
    const lastSystemYOffset = lastSystemIdx * systemHeight + currentHeaderOffset;

    svgContent += `<!-- Double Bar Line at the End of Piece -->`;
    svgContent += `<line x1="${endX}" y1="${lastSystemYOffset + (rhStaffCenterY - 18) * scale}" x2="${endX}" y2="${lastSystemYOffset + (lhStaffCenterY + 21) * scale}" stroke="#111115" stroke-width="${1.2 * scale}" />`;
    svgContent += `<line x1="${endX + 3 * scale}" y1="${lastSystemYOffset + (rhStaffCenterY - 18) * scale}" x2="${endX + 3 * scale}" y2="${lastSystemYOffset + (lhStaffCenterY + 21) * scale}" stroke="#111115" stroke-width="${2.8 * scale}" />`;

    // Vertical playback tracking pointer cursor
    svgContent += `<line id="${targetContainerId}-playback-cursor" x1="${marginLeftValue + startPadding * scale}" y1="10" x2="${marginLeftValue + startPadding * scale}" y2="${svgHeightVal - 80}" stroke="#ef4444" stroke-width="2.5" style="display: none;" />`;

    // Draw footer copyright on the bottom center (Replaced unicode to prevent ?? errors)
    svgContent += `<text x="${svgWidth / 2}" y="${svgHeight - 15}" text-anchor="middle" fill="#111115" font-size="11" font-weight="600" font-family="-apple-system, sans-serif">(C) T1ERA Music Ai</text>`;

    const svgString = `<svg width="${svgWidth}" height="${svgHeightVal}" style="background: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">${svgContent}</svg>`;
    document.getElementById(targetContainerId).innerHTML = svgString;
}

// Direct playback audio engine: loop through the activeNotesMemory log sequentially (Vertical system)
function startVerticalPlayback(targetContainerId) {
    if (isVerticalPlaying) {
        stopVerticalPlayback();
    }
    if (Tone.context.state !== 'running') {
        Tone.start();
    }

    isVerticalPlaying = true;
    verticalAudioStartTime = Tone.now();
    verticalLogicalStartTime = verticalPlaybackTime || 0;
    activeVerticalContainerId = targetContainerId;

    // Sync play/stop buttons states
    updateVerticalPlayButtonStates(targetContainerId, true);

    // Stop other play loops to avoid sound overlap
    if (isPlaying) pausePlayback();
    if (sheetMusicPlaying) stopSheetPlayback();
    if (isStudioPlaying) stopStudioPlayback();

    const cursor = document.getElementById(`${targetContainerId}-playback-cursor`);
    if (cursor) cursor.style.display = "block";

    resetVerticalNoteHighlights(targetContainerId);

    const marginLeft = 100;

    // Dynamic width calculation matched exactly with renderVerticalSheetMusic
    let containerWidth = 950;
    const parentWidth = document.getElementById(targetContainerId)?.parentElement?.clientWidth || window.innerWidth;
    
    if (targetContainerId === 'sheet-music-notation-max') {
        const container = document.getElementById('max-modal-scroll-container');
        if (container && container.clientWidth) {
            containerWidth = Math.max(320, container.clientWidth - 60);
        } else {
            containerWidth = Math.max(1200, window.innerWidth * 0.88);
        }
    } else {
        if (parentWidth < 950) {
            containerWidth = Math.max(320, parentWidth - 20);
        }
    }
    
    let localMarginLeft = marginLeft;
    let localMarginRight = 50;
    if (containerWidth < 600) {
        localMarginLeft = 40;
        localMarginRight = 15;
    }
    
    const isVerticalOrMax = (targetContainerId === 'sheet-music-notation-vertical' || targetContainerId === 'sheet-music-notation-max');
    const isPhoneView = containerWidth < 768;
    const shouldScale = isVerticalOrMax && isPhoneView;

    const scale = shouldScale ? 0.65 : 1.0;
    const systemDuration = shouldScale ? 6 : 10;
    const systemHeight = shouldScale ? 140 : 220;
    const rhStaffCenterY = shouldScale ? 40 : 60;
    const lhStaffCenterY = shouldScale ? 100 : 160;

    const startPadding = 45; // Alignment with staves spacing
    const systemWidth = containerWidth - localMarginLeft - localMarginRight;
    const localPixelsPerSecond = (systemWidth - startPadding * scale) / systemDuration;

    const firstNoteTime = 0;
    
    // Fast seek of starting index
    verticalPlaybackNoteIndex = 0;
    while (verticalPlaybackNoteIndex < activeNotesMemory.length && Math.max(0, activeNotesMemory[verticalPlaybackNoteIndex].time - firstNoteTime) < verticalPlaybackTime) {
        verticalPlaybackNoteIndex++;
    }
    verticalVisualNoteIndex = 0;
    while (verticalVisualNoteIndex < activeNotesMemory.length && Math.max(0, activeNotesMemory[verticalVisualNoteIndex].time - firstNoteTime) < verticalPlaybackTime) {
        verticalVisualNoteIndex++;
    }

    let lastScrolledSystemIdx = -1;

    function updateVerticalFrame(now) {
        if (!isVerticalPlaying) return;

        // PLL Clock Sync: Update visual progression using exact audio hardware context elapsed duration
        const elapsedRealTime = Tone.now() - verticalAudioStartTime;
        const rawPlaybackTime = verticalLogicalStartTime + (elapsedRealTime * playbackSpeed);

        // COMPENSATE: Subtract processing and hardware output latency so visuals align with sound
        const rawCtx = Tone.context ? (Tone.context.rawContext || Tone.context) : null;
        const baseLatency = (rawCtx && rawCtx.baseLatency) ? rawCtx.baseLatency : 0;
        const outputLatency = (rawCtx && rawCtx.outputLatency) ? rawCtx.outputLatency : 0;
        const lookAhead = (Tone.context && Tone.context.lookAhead) ? Tone.context.lookAhead : 0;
        const totalAudioLatency = lookAhead + baseLatency + outputLatency;
        verticalPlaybackTime = Math.max(0, rawPlaybackTime - totalAudioLatency);

        const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

        if (verticalPlaybackTime >= totalDurationSecs) {
            stopVerticalPlayback();
            return;
        }

        // 1. Move pointer cursor vertically and horizontally
        const currentSystemIdx = Math.floor(verticalPlaybackTime / systemDuration);
        const systemTimeOffset = verticalPlaybackTime - currentSystemIdx * systemDuration;

        const cursorX = systemTimeOffset * localPixelsPerSecond + localMarginLeft + startPadding * scale;
        // Systems yOffset dynamically aligned [1]
        const yOffset = currentSystemIdx * systemHeight + currentHeaderOffset; 

        if (cursor) {
            cursor.setAttribute('x1', cursorX);
            cursor.setAttribute('x2', cursorX);
            cursor.setAttribute('y1', yOffset + (rhStaffCenterY - 18) * scale);
            cursor.setAttribute('y2', yOffset + (lhStaffCenterY + 21) * scale);
        }

        // 2. Smoothly scroll container vertically (only when row wraps)
        if (currentSystemIdx !== lastScrolledSystemIdx) {
            lastScrolledSystemIdx = currentSystemIdx;
            
            let scrollContainer = null;
            if (targetContainerId === 'sheet-music-notation-vertical') {
                scrollContainer = document.getElementById('sheet-tab-notation-content-vertical');
            } else if (targetContainerId === 'sheet-music-notation-max') {
                scrollContainer = document.getElementById('max-modal-scroll-container');
            }

            if (scrollContainer) {
                const targetScrollTop = currentSystemIdx * systemHeight - scrollContainer.clientHeight / 2 + systemHeight / 2;
                scrollContainer.scrollTop = Math.max(0, targetScrollTop);
            }
        }

        // 3. Audio Scheduling Loop (Pre-trigger future notes with lookahead)
        const lookahead = 0.100; // 100ms future queue window
        const nextWindowTime = rawPlaybackTime + lookahead;

        while (verticalPlaybackNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[verticalPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < nextWindowTime) {
                const targetTime = verticalAudioStartTime + (shiftedStart - verticalLogicalStartTime) / playbackSpeed;
                
                try {
                    const noteName = Tone.Frequency(note.midi, "midi").toNote();
                    const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                    const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                    
                    if (noteName && activeInstrument) {
                        if (Tone.context.state === 'suspended') {
                            Tone.context.resume();
                        }
                        playNoteSafely(noteName, duration, targetTime, velocity, true);
                    }
                } catch (e) {
                    console.warn("Vertical Playback voice skipped safely:", e);
                }
                verticalPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // 4. Visual Highlight Loop (Lights up notes exactly when heard)
        while (verticalVisualNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[verticalVisualNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart <= verticalPlaybackTime) {
                const noteHead = document.getElementById(`${targetContainerId}-notehead-${verticalVisualNoteIndex}`);
                const noteRect = document.getElementById(`${targetContainerId}-note-rect-${verticalVisualNoteIndex}`);
                if (noteHead) {
                    // Outlines border only for open hollow notes, fills standard notes solid
                    if (noteHead.getAttribute('stroke') !== 'none') {
                        noteHead.setAttribute('stroke', '#db2777');
                        noteHead.setAttribute('stroke-width', '1.3');
                    } else {
                        noteHead.setAttribute('fill', '#db2777');
                    }
                }
                if (noteRect) noteRect.setAttribute('fill', '#db2777');
                verticalVisualNoteIndex++;
            } else {
                break;
            }
        }

        // 5. Visual Release Loop (Reverts expired noteheads)
        const checkStart = Math.max(0, verticalVisualNoteIndex - 100);
        for (let i = checkStart; i < verticalVisualNoteIndex; i++) {
            const note = activeNotesMemory[i];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            const shiftedEnd = shiftedStart + note.duration;

            if (verticalPlaybackTime >= shiftedEnd) {
                const noteHead = document.getElementById(`${targetContainerId}-notehead-${i}`);
                const noteRect = document.getElementById(`${targetContainerId}-note-rect-${i}`);
                
                const chkShowColors = document.getElementById('chk-show-colors');
                const showColors = chkShowColors ? chkShowColors.checked : false;
                
                let defaultColor = "";
                if (note.midi >= 60) {
                    defaultColor = showColors ? '#4f46e5' : '#111115';
                } else {
                    defaultColor = showColors ? '#d97706' : '#111115';
                }
                
                if (noteHead) {
                    const isHollow = noteHead.getAttribute('stroke') !== 'none';
                    if (isHollow) {
                        if (noteHead.getAttribute('stroke') === '#db2777') {
                            noteHead.setAttribute('stroke', defaultColor);
                            noteHead.setAttribute('stroke-width', '1.3');
                        }
                    } else {
                        if (noteHead.getAttribute('fill') === '#db2777') {
                            noteHead.setAttribute('fill', defaultColor);
                        }
                    }
                }
                if (noteRect && noteRect.getAttribute('fill') === '#db2777') {
                    noteRect.setAttribute('fill', defaultColor);
                }
            }
        }

        verticalPlaybackTimer = requestAnimationFrame(updateVerticalFrame);
    }

    verticalPlaybackTimer = requestAnimationFrame(updateVerticalFrame);
}

function stopVerticalPlayback() {
    isVerticalPlaying = false;
    if (verticalPlaybackTimer) {
        cancelAnimationFrame(verticalPlaybackTimer);
        verticalPlaybackTimer = null;
    }
    verticalPlaybackTime = 0;
    activeInstrument.releaseAll();

    if (activeVerticalContainerId) {
        // Find isPhoneView matching the active system width
        const container = document.getElementById(activeVerticalContainerId);
        const containerWidth = container?.parentElement?.clientWidth || window.innerWidth;
        
        const isMaximizedView = (activeVerticalContainerId === 'sheet-music-notation-max');
        const isPhoneView = containerWidth < 768;
        const shouldScale = isMaximizedView && isPhoneView;
        
        const scale = shouldScale ? 0.65 : 1.0;
        const startPadding = 45;

        const cursor = document.getElementById(`${activeVerticalContainerId}-playback-cursor`);
        if (cursor) {
            cursor.setAttribute('x1', 100 + startPadding * scale);
            cursor.setAttribute('x2', 100 + startPadding * scale);
            cursor.style.display = "none";
        }

        let scrollContainer = null;
        if (activeVerticalContainerId === 'sheet-music-notation-vertical') {
            scrollContainer = document.getElementById('sheet-tab-notation-content-vertical');
        } else if (activeVerticalContainerId === 'sheet-music-notation-max') {
            scrollContainer = document.getElementById('max-modal-scroll-container');
        }
        if (scrollContainer) scrollContainer.scrollTop = 0;

        resetVerticalNoteHighlights(activeVerticalContainerId);
        updateVerticalPlayButtonStates(activeVerticalContainerId, false);
    }
}

function resetVerticalNoteHighlights(containerId) {
    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    const ppq = (midiData && midiData.header) ? (midiData.header.PPQ || midiData.header.ppq || 480) : 480;

    activeNotesMemory.forEach((note, index) => {
        const noteHead = document.getElementById(`${containerId}-notehead-${index}`);
        const noteRect = document.getElementById(`${containerId}-note-rect-${index}`);
        
        let defaultColor = "";
        if (note.midi >= 60) {
            defaultColor = showColors ? '#4f46e5' : '#111115';
        } else {
            defaultColor = showColors ? '#d97706' : '#111115';
        }

        const durationTicks = note.durationTicks || (note.duration * 2 * ppq);
        const isWholeNote = durationTicks >= ppq * 3.2;
        const isHalfNote = durationTicks >= ppq * 1.6 && durationTicks < ppq * 3.2;

        if (noteHead) {
            if (isWholeNote || isHalfNote) {
                noteHead.setAttribute('fill', '#ffffff');
                noteHead.setAttribute('stroke', defaultColor);
                noteHead.setAttribute('stroke-width', '1.3'); // updated to elegant 1.3 stroke
            } else {
                noteHead.setAttribute('fill', defaultColor);
                noteHead.setAttribute('stroke', 'none');
            }
        }
        if (noteRect) {
            if (showColors) {
                noteRect.setAttribute('fill', defaultColor);
                noteRect.style.display = 'block';
            } else {
                noteRect.style.display = 'none';
            }
        }
    });
}

function updateVerticalPlayButtonStates(containerId, isPlayingState) {
    if (containerId === 'sheet-music-notation-vertical') {
        const btnPlay = document.getElementById('btn-play-second');
        const btnStop = document.getElementById('btn-stop-second');
        if (isPlayingState) {
            btnPlay.textContent = "Pause Score";
            btnPlay.style.backgroundColor = "#fbbf24";
            btnStop.disabled = false;
        } else {
            btnPlay.textContent = "Play Vert. Score";
            btnPlay.style.backgroundColor = "#10b981";
            btnStop.disabled = true;
        }
    } else if (containerId === 'sheet-music-notation-max') {
        const btnPlay = document.getElementById('btn-play-max');
        const btnStop = document.getElementById('btn-stop-max');
        if (isPlayingState) {
            btnPlay.textContent = "Pause Score";
            btnPlay.style.backgroundColor = "#fbbf24";
            btnStop.disabled = false;
        } else {
            btnPlay.textContent = "Play Score";
            btnPlay.style.backgroundColor = "#10b981";
            btnStop.disabled = true;
        }
    }
}

// Export vector SVG directly to browser download queue
function downloadVerticalSVG(containerId) {
    const svgElement = document.querySelector(`#${containerId} svg`);
    if (!svgElement) return;
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = (midiData ? midiData.name || 'Untitled' : 'sheet_music') + '_wrapped.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

// Dump raw MIDI structural data chronologically and in raw JSON payload formats
function populateRawMidiData() {
    if (!midiData) return;

    // 1. Populate Raw JSON View
    const rawJsonView = document.getElementById('raw-midi-json-view');
    const jsonSummary = {
        header: midiData.header,
        durationSeconds: midiData.duration,
        totalNotesTracked: activeNotesMemory.length,
        tracksSummary: midiData.tracks.map((track, i) => ({
            trackIndex: i,
            name: track.name,
            instrument: track.instrument?.name || "Default",
            notesCount: track.notes.length
        }))
    };
    rawJsonView.value = JSON.stringify(jsonSummary, null, 2);

    // 2. Populate Chronological Table
    const tableBody = document.getElementById('raw-event-table-body');
    tableBody.innerHTML = '';

    activeNotesMemory.forEach((note, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--panel-border)';
        
        if (index % 2 === 1) {
            tr.style.background = '#20202c';
        }

        const staffMap = note.midi >= 60 ? "RH (Top Staff)" : "LH (Bottom Staff)";

        tr.innerHTML = `
            <td style="padding: 10px 12px; color: var(--text-muted);">${index + 1}</td>
            <td style="padding: 10px 12px; font-weight: 500; color: var(--text-color);">${note.time.toFixed(4)}</td>
            <td style="padding: 10px 12px; color: var(--text-color);">${note.midi}</td>
            <td style="padding: 10px 12px; font-weight: 600; color: var(--accent-color);">${note.name}</td>
            <td style="padding: 10px 12px; color: var(--text-muted);">${note.duration.toFixed(4)}</td>
            <td style="padding: 10px 12px; color: var(--text-muted);">${(note.velocity || 0.8).toFixed(2)}</td>
            <td style="padding: 10px 12px; font-weight: 500; color: ${note.midi >= 60 ? '#10b981' : '#f59e0b'};">${staffMap}</td>
        `;
        tableBody.appendChild(tr);
    });
}

// Direct playback audio engine: loop through the activeNotesMemory log sequentially
function startSheetPlayback() {
    if (sheetMusicPlaying) {
        pauseSheetPlayback();
        return;
    }
    if (Tone.context.state !== 'running') {
        Tone.start();
    }

    sheetMusicPlaying = true;
    sheetAudioStartTime = Tone.now();
    sheetLogicalStartTime = sheetMusicPlaybackTime || 0;

    document.getElementById('btn-play-sheet').textContent = "Pause Score";
    document.getElementById('btn-play-sheet').style.backgroundColor = "#fbbf24";
    document.getElementById('btn-stop-sheet').disabled = false;

    // Pause visualizer loops to avoid sound overlays
    if (isPlaying) {
        pausePlayback();
    }
    if (isStudioPlaying) stopStudioPlayback();

    const cursor = document.getElementById('sheet-playback-cursor');
    if (cursor) cursor.style.display = "block";

    resetSheetNoteHighlights();

    // Setup optimized index seek heads
    const firstNoteTime = 0;
    sheetPlaybackNoteIndex = 0;
    while (sheetPlaybackNoteIndex < activeNotesMemory.length && Math.max(0, activeNotesMemory[sheetPlaybackNoteIndex].time - firstNoteTime) < sheetMusicPlaybackTime) {
        sheetPlaybackNoteIndex++;
    }
    sheetVisualNoteIndex = 0;
    while (sheetVisualNoteIndex < activeNotesMemory.length && Math.max(0, activeNotesMemory[sheetVisualNoteIndex].time - firstNoteTime) < sheetMusicPlaybackTime) {
        sheetVisualNoteIndex++;
    }

    const bpm = (midiData && midiData.header && midiData.header.tempos && midiData.header.tempos[0]) 
        ? midiData.header.tempos[0].bpm 
        : 120;
    const beatDuration = 60 / bpm;

    // Frame scheduler to drive audio events and follow pointer visual states
    function updateSheetFrame(now) {
        if (!sheetMusicPlaying) return;

        // PLL Clock Sync: Update visual progression using exact audio hardware context elapsed duration
        const elapsedRealTime = Tone.now() - sheetAudioStartTime;
        const rawPlaybackTime = sheetLogicalStartTime + (elapsedRealTime * playbackSpeed);

        // COMPENSATE: Subtract processing and hardware output latency so visuals align with sound
        const rawCtx = Tone.context ? (Tone.context.rawContext || Tone.context) : null;
        const baseLatency = (rawCtx && rawCtx.baseLatency) ? rawCtx.baseLatency : 0;
        const outputLatency = (rawCtx && rawCtx.outputLatency) ? rawCtx.outputLatency : 0;
        const lookAhead = (Tone.context && Tone.context.lookAhead) ? Tone.context.lookAhead : 0;
        const totalAudioLatency = lookAhead + baseLatency + outputLatency;
        sheetMusicPlaybackTime = Math.max(0, rawPlaybackTime - totalAudioLatency);

        const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

        if (sheetMusicPlaybackTime >= totalDurationSecs) {
            stopSheetPlayback();
            return;
        }

        // 1. Move pointer line
        const cursorX = sheetMusicPlaybackTime * pixelsPerSecond + 100;
        if (cursor) {
            cursor.setAttribute('x1', cursorX);
            cursor.setAttribute('x2', cursorX);
        }

        // 2. Smoothly scroll container horizontally to follow cursor
        const contentContainer = document.getElementById('sheet-music-notation');
        if (contentContainer) {
            const targetScroll = cursorX - contentContainer.clientWidth / 2;
            contentContainer.scrollLeft = targetScroll;
        }

        // 3. Audio Triggering Scheduler (Pre-trigger future notes with 100ms lookahead)
        const lookahead = 0.100; // 100ms future queue window
        const nextWindowTime = rawPlaybackTime + lookahead;

        while (sheetPlaybackNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[sheetPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < nextWindowTime) {
                const targetTime = sheetAudioStartTime + (shiftedStart - sheetLogicalStartTime) / playbackSpeed;
                
                try {
                    const noteName = Tone.Frequency(note.midi, "midi").toNote();
                    const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                    const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                    
                    if (noteName && activeInstrument) {
                        if (Tone.context.state === 'suspended') {
                            Tone.context.resume();
                        }
                        playNoteSafely(noteName, duration, targetTime, velocity, true);
                    }
                } catch (e) {
                    console.warn("Sheet playback voice skipped safely:", e);
                }
                sheetPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // 4. Visual Highlight Loop (Lights up notes exactly when heard)
        while (sheetVisualNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[sheetVisualNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart <= sheetMusicPlaybackTime) {
                const noteHead = document.getElementById(`sheet-notehead-${sheetVisualNoteIndex}`);
                const noteRect = document.getElementById(`sheet-note-rect-${sheetVisualNoteIndex}`);
                if (noteHead) {
                    // Outlines border only for open hollow notes, fills standard notes solid (stroke decreased to 1.3)
                    if (noteHead.getAttribute('stroke') !== 'none') {
                        noteHead.setAttribute('stroke', '#e879f9');
                        noteHead.setAttribute('stroke-width', '1.3');
                    } else {
                        noteHead.setAttribute('fill', '#e879f9');
                    }
                }
                if (noteRect) noteRect.setAttribute('fill', '#e879f9');
                sheetVisualNoteIndex++;
            } else {
                break;
            }
        }

        // 5. Visual Release Loop (Reverts expired noteheads)
        const checkStart = Math.max(0, sheetVisualNoteIndex - 100);
        for (let i = checkStart; i < sheetVisualNoteIndex; i++) {
            const note = activeNotesMemory[i];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            const shiftedEnd = shiftedStart + note.duration;
            if (sheetMusicPlaybackTime >= shiftedEnd) {
                const noteHead = document.getElementById(`sheet-notehead-${i}`);
                const noteRect = document.getElementById(`sheet-note-rect-${i}`);
                if (noteHead) {
                    const isHollow = noteHead.getAttribute('stroke') !== 'none';
                    if (isHollow) {
                        if (noteHead.getAttribute('stroke') === '#e879f9') {
                            noteHead.setAttribute('stroke', note.midi >= 60 ? '#818cf8' : '#fbbf24');
                            noteHead.setAttribute('stroke-width', '1.3');
                        }
                    } else {
                        if (noteHead.getAttribute('fill') === '#e879f9') {
                            noteHead.setAttribute('fill', note.midi >= 60 ? '#818cf8' : '#fbbf24');
                        }
                    }
                }
                if (noteRect && noteRect.getAttribute('fill') === '#e879f9') {
                    noteRect.setAttribute('fill', note.midi >= 60 ? '#818cf8' : '#fbbf24');
                }
            }
        }

        sheetMusicPlaybackTimer = requestAnimationFrame(updateSheetFrame);
    }

    sheetMusicPlaybackTimer = requestAnimationFrame(updateSheetFrame);
}

function pauseSheetPlayback() {
    sheetMusicPlaying = false;
    if (sheetMusicPlaybackTimer) {
        cancelAnimationFrame(sheetMusicPlaybackTimer);
        sheetMusicPlaybackTimer = null;
    }
    activeInstrument.releaseAll();
    document.getElementById('btn-play-sheet').textContent = "Resume Score";
    document.getElementById('btn-play-sheet').style.backgroundColor = "#10b981";
}

function stopSheetPlayback() {
    sheetMusicPlaying = false;
    if (sheetMusicPlaybackTimer) {
        cancelAnimationFrame(sheetMusicPlaybackTimer);
        sheetMusicPlaybackTimer = null;
    }
    sheetMusicPlaybackTime = 0;
    activeInstrument.releaseAll();

    const cursor = document.getElementById('sheet-playback-cursor');
    if (cursor) {
        cursor.setAttribute('x1', 100);
        cursor.setAttribute('x2', 100);
        cursor.style.display = "none";
    }

    const contentContainer = document.getElementById('sheet-music-notation');
    if (contentContainer) contentContainer.scrollLeft = 0;

    resetSheetNoteHighlights();

    document.getElementById('btn-play-sheet').textContent = "Play Score";
    document.getElementById('btn-play-sheet').style.backgroundColor = "#10b981";
    document.getElementById('btn-stop-sheet').disabled = true;
}

function resetSheetNoteHighlights() {
    const ppq = (midiData && midiData.header) ? (midiData.header.PPQ || midiData.header.ppq || 480) : 480;

    activeNotesMemory.forEach((note, index) => {
        const noteHead = document.getElementById(`sheet-notehead-${index}`);
        const noteRect = document.getElementById(`sheet-note-rect-${index}`);
        const defaultColor = note.midi >= 60 ? '#818cf8' : '#fbbf24';

        const durationTicks = note.durationTicks || (note.duration * 2 * ppq);
        const isWholeNote = durationTicks >= ppq * 3.2;
        const isHalfNote = durationTicks >= ppq * 1.6 && durationTicks < ppq * 3.2;

        if (noteHead) {
            if (isWholeNote || isHalfNote) {
                noteHead.setAttribute('fill', '#0b0b0f');
                noteHead.setAttribute('stroke', defaultColor);
                noteHead.setAttribute('stroke-width', '1.3'); // updated to elegant 1.3 stroke
            } else {
                noteHead.setAttribute('fill', defaultColor);
                noteHead.setAttribute('stroke', 'none');
                noteHead.removeAttribute('stroke-width');
            }
        }
        if (noteRect) noteRect.setAttribute('fill', defaultColor);
    });
}

function renderStudioSheetMusic(targetContainerId) {
    if (!midiData || studioNotesMemory.length === 0) {
        document.getElementById(targetContainerId).innerHTML = "<div style='color: #9ca3af; padding: 20px; text-align: center;'>No notes in studio buffer. Apply a filter or load a MIDI file.</div>";
        return;
    }

    // Trigger Title Resolving asynchronously if not already loaded (Self redraw loop)
    if (!resolvedSheetTitle && midiData) {
        resolveSheetTitle().then(() => {
            renderStudioSheetMusic('sheet-music-notation-studio');
        });
    }

    const firstNoteTime = 0;
    const firstNoteActualTime = studioNotesMemory.length > 0 ? studioNotesMemory[0].time : 0;
    const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

    const marginLeft = 100;

    // 1. Dynamic Width Calculation for Studio layout viewports on mobile
    let containerWidth = 950;
    const parentWidth = document.getElementById(targetContainerId)?.parentElement?.clientWidth || window.innerWidth;
    if (parentWidth < 950) {
        containerWidth = Math.max(320, parentWidth - 20);
    }

    // Standard unscaled layout configurations matching standard vertical sheet settings
    const systemDuration = 10;
    const numSystems = Math.ceil(totalDurationSecs / systemDuration) || 1;

    const systemHeight = 220;
    const rhStaffCenterY = 60;
    const lhStaffCenterY = 160;
    const dy = 3.0;

    const marginRight = 50;
    const systemWidth = containerWidth - marginLeft - marginRight;
    const svgWidth = containerWidth;
    // Shifted entire layout down by 70px to make room for Title + Subtitle
    const svgHeight = numSystems * systemHeight + 170; 

    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    // Proportional Scaling mapping matching studio width parameters
    const startPadding = 45; // Space for clefs & signatures
    const localPixelsPerSecond = (systemWidth - startPadding) / systemDuration;

    let svgContent = "";

    // 4. Centered Track Title & Subtitle inside the Sheet Music (Studio Layout Canvas) [1]
    const titleText = resolvedSheetTitle || "Loading Score...";
    const titleLines = wrapSvgText(titleText, containerWidth < 600 ? 25 : 50).slice(0, 2);
    
    // Scale system spacer dynamically depending on if title wraps to 2 lines [1]
    currentHeaderOffset = titleLines.length > 1 ? 135 : 110;
    const svgHeightVal = numSystems * systemHeight + currentHeaderOffset + 60; 

    if (titleLines.length === 1) {
        svgContent += `<text x="${svgWidth / 2}" y="45" text-anchor="middle" fill="#111115" font-size="20" font-weight="700" font-family="Georgia, serif">${titleLines[0]}</text>`;
        svgContent += `<text x="${svgWidth / 2}" y="65" text-anchor="middle" fill="#66666e" font-size="11" font-weight="500" font-family="-apple-system, sans-serif">(c) T1ERA Studio Ai</text>`;
    } else if (titleLines.length > 1) {
        svgContent += `<text x="${svgWidth / 2}" y="40" text-anchor="middle" fill="#111115" font-size="18" font-weight="700" font-family="Georgia, serif">${titleLines[0]}</text>`;
        svgContent += `<text x="${svgWidth / 2}" y="65" text-anchor="middle" fill="#111115" font-size="18" font-weight="700" font-family="Georgia, serif">${titleLines[1]}</text>`;
        svgContent += `<text x="${svgWidth / 2}" y="88" text-anchor="middle" fill="#66666e" font-size="11" font-weight="500" font-family="-apple-system, sans-serif">(c) T1ERA Studio Ai</text>`;
    }

    // Robust Time Signature Parsing from MIDI Header
    let timeSignatureNum = 4;
    let timeSignatureDen = 4;
    if (midiData && midiData.header && midiData.header.timeSignatures && midiData.header.timeSignatures.length > 0) {
        const ts = midiData.header.timeSignatures[0].timeSignature;
        if (Array.isArray(ts) && ts.length === 2) {
            timeSignatureNum = ts[0];
            timeSignatureDen = ts[1];
        }
    }

    for (let i = 0; i < numSystems; i++) {
        // Systems yOffset dynamically aligned [1]
        const yOffset = i * systemHeight + 110;

        // Draw Treble (RH) Staves
        const rhLines = [64, 67, 71, 74, 77];
        rhLines.forEach(pitch => {
            const y = yOffset + rhStaffCenterY - (pitch - 71) * dy;
            svgContent += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + systemWidth}" y2="${y}" stroke="#9ca3af" stroke-width="0.75" />`;
        });

        // Draw Bass (LH) Staves
        const lhLines = [43, 47, 50, 53, 57];
        lhLines.forEach(pitch => {
            const y = yOffset + lhStaffCenterY - (pitch - 50) * dy;
            svgContent += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + systemWidth}" y2="${y}" stroke="#9ca3af" stroke-width="0.75" />`;
        });

        // Labels & System link bars
        svgContent += `<line x1="${marginLeft - 80}" y1="${yOffset + 20}" x2="${marginLeft - 80}" y2="${yOffset + 200}" stroke="#111115" stroke-width="1.5" />`;
        svgContent += `<text x="${marginLeft - 60}" y="${yOffset + rhStaffCenterY + 5}" fill="#111115" font-size="14" font-weight="bold" font-family="-apple-system, sans-serif">RH</text>`;
        svgContent += `<text x="${marginLeft - 60}" y="${yOffset + lhStaffCenterY + 5}" fill="#111115" font-size="14" font-weight="bold" font-family="-apple-system, sans-serif">LH</text>`;

        // Treble Clef
        svgContent += `
        <g transform="translate(${marginLeft - 30}, ${yOffset + rhStaffCenterY})" stroke="#111115" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 5,-40 L 5,30 C 5,38 0,42 -5,42 C -9,42 -12,38 -12,34 C -12,30 -9,27 -6,27 C -3,27 0,31 0,34" />
            <circle cx="5" cy="-40" r="3" fill="#111115" />
            <path d="M 5,-15 C 5,-28 15,-32 15,-20 C 15,-10 5,0 5,10" />
            <path d="M 5,10 C 5,22 -8,22 -8,10 C -8,-2 13,-2 13,10 C 13,20 3,24 0,16" />
        </g>`;

        // Bass Clef
        svgContent += `
        <g transform="translate(${marginLeft - 30}, ${yOffset + lhStaffCenterY})" stroke="#111115" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M -8,-10 C -2,-18 10,-18 10,-8 C 10,2 -2,10 -8,18 C -10,21 -12,25 -12,28" />
            <circle cx="-8" cy="-10" r="3.5" fill="#111115" stroke="none" />
            <circle cx="16" cy="-15" r="2.5" fill="#111115" stroke="none" />
            <circle cx="16" cy="-5" r="2.5" fill="#111115" stroke="none" />
        </g>`;

        // Draw Real Time Signature in Studio Mode on the First System
        if (i === 0) {
            const tsX = marginLeft + 12;
            svgContent += `
            <g id="studio-time-signature-treble" fill="#111115" stroke="none">
                <text x="${tsX}" y="${yOffset + rhStaffCenterY - 6}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureNum}</text>
                <text x="${tsX}" y="${yOffset + rhStaffCenterY + 18}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureDen}</text>
            </g>
            <g id="studio-time-signature-bass" fill="#111115" stroke="none">
                <text x="${tsX}" y="${yOffset + lhStaffCenterY - 6}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureNum}</text>
                <text x="${tsX}" y="${yOffset + lhStaffCenterY + 18}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureDen}</text>
            </g>`;
        }
    }

    // Detect and Render All Silent Rest Gaps Chronologically (Studio vertical score)
    const gaps = findSilenceGaps(studioNotesMemory);
    gaps.forEach(gap => {
        const restsEndSecs = Math.max(0, gap.end - 0.1);
        if (restsEndSecs > gap.start + 0.05) {
            svgContent = renderRestsForGapVertical(
                svgContent, gap.start, restsEndSecs, 
                systemDuration, systemHeight, rhStaffCenterY, lhStaffCenterY, 
                localPixelsPerSecond, marginLeft, startPadding, 1.0, showColors
            );
        }

        // Calculate system index based on actual gap end (first note start) to avoid system splits
        const firstNoteSystemIdx = Math.floor(gap.end / systemDuration);
        const yOffset = firstNoteSystemIdx * systemHeight + 110; // Shifted to 110px
        const systemTimeOffset = gap.end - firstNoteSystemIdx * systemDuration;
        
        // Compute exact x position slightly before the note center
        const noteX = systemTimeOffset * localPixelsPerSecond + marginLeft + startPadding;
        const doubleBarX = noteX - 10;

        svgContent += `<!-- Double Bar Lines strictly fitting inside the 5 lines of each staff (Studio) -->`;
        
        // Treble staff double bar (dy = 3, updated to elegant 1.0/2.4 stroke configurations)
        svgContent += `<line x1="${doubleBarX - 3}" y1="${yOffset + rhStaffCenterY - 6 * dy}" x2="${doubleBarX - 3}" y2="${yOffset + rhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="1.0" opacity="0.85" />`;
        svgContent += `<line x1="${doubleBarX}" y1="${yOffset + rhStaffCenterY - 6 * dy}" x2="${doubleBarX}" y2="${yOffset + rhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="2.4" opacity="0.85" />`;
        
        // Bass staff double bar
        svgContent += `<line x1="${doubleBarX - 3}" y1="${yOffset + lhStaffCenterY - 7 * dy}" x2="${doubleBarX - 3}" y2="${yOffset + lhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="1.0" opacity="0.85" />`;
        svgContent += `<line x1="${doubleBarX}" y1="${yOffset + lhStaffCenterY - 7 * dy}" x2="${doubleBarX}" y2="${yOffset + lhStaffCenterY + 7 * dy}" stroke="#111115" stroke-width="2.4" opacity="0.85" />`;
    });

    const ppq = (midiData && midiData.header) ? (midiData.header.PPQ || midiData.header.ppq || 480) : 480;

    studioNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const systemIdx = Math.floor(shiftedStart / systemDuration);
        if (systemIdx >= numSystems) return;

        const yOffset = systemIdx * systemHeight + 110; // Shifted to 110px
        const systemTimeOffset = shiftedStart - systemIdx * systemDuration;
        const noteX = systemTimeOffset * localPixelsPerSecond + marginLeft + startPadding;
        
        const maxAllowedWidth = (marginLeft + systemWidth) - noteX;
        const noteW = Math.min(Math.max(10, note.duration * localPixelsPerSecond), maxAllowedWidth);
        const pitch = note.midi;

        let y = 0;
        let color = "";
        let stemDirection = "";

        if (pitch >= 60) {
            y = yOffset + rhStaffCenterY - (pitch - 71) * dy;
            color = showColors ? "#4f46e5" : "#111115";
            stemDirection = (pitch >= 72) ? "down" : "up";
        } else {
            y = yOffset + lhStaffCenterY - (pitch - 50) * dy;
            color = showColors ? "#d97706" : "#111115";
            stemDirection = (pitch >= 51) ? "down" : "up";
        }

        // Ledger Line Render Engine
        const lineStroke = showColors ? color : "#111115";
        if (pitch >= 60) {
            if (pitch <= 60) {
                const ly = yOffset + rhStaffCenterY - (60 - 71) * dy;
                svgContent += `<line x1="${noteX - 12}" y1="${ly}" x2="${noteX + 12}" y2="${ly}" stroke="${lineStroke}" stroke-width="1.5" />`;
            } else if (pitch >= 81) {
                const rhLedgerLines = [81, 84, 88, 91, 95, 98, 101, 105, 108];
                rhLedgerLines.forEach(lp => {
                    if (lp <= pitch) {
                        const ly = yOffset + rhStaffCenterY - (lp - 71) * dy;
                        svgContent += `<line x1="${noteX - 12}" y1="${ly}" x2="${noteX + 12}" y2="${ly}" stroke="${lineStroke}" stroke-width="1.5" />`;
                    }
                });
            }
        } else {
            if (pitch <= 40) {
                const lhLedgerLines = [40, 36, 33, 29, 26, 24, 21];
                lhLedgerLines.forEach(lp => {
                    if (lp >= pitch) {
                        const ly = yOffset + lhStaffCenterY - (lp - 50) * dy;
                        svgContent += `<line x1="${noteX - 12}" y1="${ly}" x2="${noteX + 12}" y2="${ly}" stroke="${lineStroke}" stroke-width="1.5" />`;
                    }
                });
            }
        }

        if (showColors) {
            svgContent += `<rect x="${noteX}" y="${y - 4}" width="${noteW}" height="8" rx="4" fill="${color}" opacity="0.6" id="${targetContainerId}-note-rect-${index}" />`;
        }

        const durationTicks = note.durationTicks || (note.duration * 2 * ppq);
        const isWholeNote = durationTicks >= ppq * 3.2;
        const isHalfNote = durationTicks >= ppq * 1.6 && durationTicks < ppq * 3.2;

        // Notehead (reduced stroke-width to 1.3)
        let noteheadFill = color;
        let noteheadStroke = "none";
        let strokeWidthAttr = "";
        if (isWholeNote || isHalfNote) {
            noteheadFill = "#ffffff"; // Masks background cleanly in white portal viewports
            noteheadStroke = color;
            strokeWidthAttr = 'stroke-width="1.3"';
        }

        svgContent += `<ellipse cx="${noteX}" cy="${y}" rx="${7}" ry="${5}" fill="${noteheadFill}" stroke="${noteheadStroke}" ${strokeWidthAttr} id="${targetContainerId}-notehead-${index}" transform="rotate(-15, ${noteX}, ${y})" />`;

        // Stems standard attachment (No stem for Whole notes)
        if (!isWholeNote) {
            if (stemDirection === "up") {
                svgContent += `<line x1="${noteX + 6}" y1="${y}" x2="${noteX + 6}" y2="${y - 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
            } else {
                svgContent += `<line x1="${noteX - 6}" y1="${y}" x2="${noteX - 6}" y2="${y + 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
            }
        }
    });

    // Bold Double Bar Line at the End of Studio layout
    const lastNoteTimeShifted = totalDurationSecs;
    const lastSystemIdx = Math.floor(lastNoteTimeShifted / systemDuration);
    const lastSystemTimeOffset = lastNoteTimeShifted - lastSystemIdx * systemDuration;
    const endX = Math.min(lastSystemTimeOffset * localPixelsPerSecond + marginLeft + startPadding, marginLeft + systemWidth);
    const lastSystemYOffset = lastSystemIdx * systemHeight + 110;

    svgContent += `<!-- Double Bar Line at the End of Studio Piece -->`;
    svgContent += `<line x1="${endX}" y1="${lastSystemYOffset + rhStaffCenterY - 18}" x2="${endX}" y2="${lastSystemYOffset + lhStaffCenterY + 21}" stroke="#111115" stroke-width="1.5" />`;
    svgContent += `<line x1="${endX + 4}" y1="${lastSystemYOffset + rhStaffCenterY - 18}" x2="${endX + 4}" y2="${lastSystemYOffset + lhStaffCenterY + 21}" stroke="#111115" stroke-width="3.5" />`;

    // Tracking pointer cursor
    svgContent += `<line id="${targetContainerId}-playback-cursor" x1="${marginLeft + startPadding}" y1="10" x2="${marginLeft + startPadding}" y2="${svgHeightVal - 80}" stroke="#ef4444" stroke-width="2.5" style="display: none;" />`;

    const svgString = `<svg width="${svgWidth}" height="${svgHeightVal}" style="background: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">${svgContent}</svg>`;
    document.getElementById(targetContainerId).innerHTML = svgString;
}

// Dedicated playback loops for Studio scores
function startStudioPlayback() {
    if (isStudioPlaying) {
        stopStudioPlayback();
        return;
    }
    if (Tone.context.state !== 'running') {
        Tone.start();
    }

    isStudioPlaying = true;
    studioAudioStartTime = Tone.now();
    studioLogicalStartTime = studioPlaybackTime || 0;

    const btnPlay = document.getElementById('btn-studio-play-score');
    const btnStop = document.getElementById('btn-studio-stop-score');
    btnPlay.textContent = "Pause Studio Score";
    btnPlay.style.backgroundColor = "#fbbf24";
    btnStop.disabled = false;

    if (isPlaying) pausePlayback();
    if (sheetMusicPlaying) stopSheetPlayback();
    if (isVerticalPlaying) stopVerticalPlayback();

    const cursor = document.getElementById('sheet-music-notation-studio-playback-cursor');
    if (cursor) cursor.style.display = "block";

    resetStudioNoteHighlights();

    const systemHeight = 220; // fallback default
    const marginLeft = 100;

    // Synchronized width and pacing setup mirroring renderStudioSheetMusic exactly
    let containerWidth = 950;
    const parentWidth = document.getElementById('sheet-music-notation-studio')?.parentElement?.clientWidth || window.innerWidth;
    if (parentWidth < 950) {
        containerWidth = Math.max(320, parentWidth - 20);
    }
    const marginRight = 50;
    const systemWidth = containerWidth - marginLeft - marginRight;

    // Standard unscaled parameters
    const systemDuration = 10;
    const activeSystemHeight = 220;
    const rhStaffCenterY = 60;
    const lhStaffCenterY = 160;

    const startPadding = 45;
    const localPixelsPerSecond = (systemWidth - startPadding) / systemDuration;

    const firstNoteTime = 0;
    
    // Fast seek of starting studio indexes
    studioPlaybackNoteIndex = 0;
    while (studioPlaybackNoteIndex < studioNotesMemory.length && Math.max(0, studioNotesMemory[studioPlaybackNoteIndex].time - firstNoteTime) < studioPlaybackTime) {
        studioPlaybackNoteIndex++;
    }
    studioVisualNoteIndex = 0;
    while (studioVisualNoteIndex < studioNotesMemory.length && Math.max(0, studioNotesMemory[studioVisualNoteIndex].time - firstNoteTime) < studioPlaybackTime) {
        studioVisualNoteIndex++;
    }

    let lastScrolledSystemIdx = -1;

    function updateStudioFrame(now) {
        if (!isStudioPlaying) return;

        // PLL Clock Sync: Update visual progression using exact audio hardware context elapsed duration
        const elapsedRealTime = Tone.now() - studioAudioStartTime;
        const rawPlaybackTime = studioLogicalStartTime + (elapsedRealTime * playbackSpeed);

        // COMPENSATE: Subtract processing and hardware output latency so visuals align with sound
        const rawCtx = Tone.context ? (Tone.context.rawContext || Tone.context) : null;
        const baseLatency = (rawCtx && rawCtx.baseLatency) ? rawCtx.baseLatency : 0;
        const outputLatency = (rawCtx && rawCtx.outputLatency) ? rawCtx.outputLatency : 0;
        const lookAhead = (Tone.context && Tone.context.lookAhead) ? Tone.context.lookAhead : 0;
        const totalAudioLatency = lookAhead + baseLatency + outputLatency;
        studioPlaybackTime = Math.max(0, rawPlaybackTime - totalAudioLatency);

        const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

        if (studioPlaybackTime >= totalDurationSecs) {
            stopStudioPlayback();
            return;
        }

        const currentSystemIdx = Math.floor(studioPlaybackTime / systemDuration);
        const systemTimeOffset = studioPlaybackTime - currentSystemIdx * systemDuration;

        const cursorX = systemTimeOffset * localPixelsPerSecond + marginLeft + startPadding;
        const yOffset = currentSystemIdx * activeSystemHeight + 110; // Shifted to 110px

        if (cursor) {
            cursor.setAttribute('x1', cursorX);
            cursor.setAttribute('x2', cursorX);
            cursor.setAttribute('y1', yOffset + (rhStaffCenterY - 18));
            cursor.setAttribute('y2', yOffset + (lhStaffCenterY + 21));
        }

        // OPTIMIZED: only scroll Studio panel container when line wraps
        if (currentSystemIdx !== lastScrolledSystemIdx) {
            lastScrolledSystemIdx = currentSystemIdx;
            const scrollContainer = document.getElementById('sheet-tab-studio-content-vertical');
            if (scrollContainer) {
                const targetScrollTop = currentSystemIdx * activeSystemHeight - scrollContainer.clientHeight / 2 + activeSystemHeight / 2;
                scrollContainer.scrollTop = Math.max(0, targetScrollTop);
            }
        }

        // Audio Triggering Scheduler (Pre-trigger future notes with 100ms lookahead)
        const lookahead = 0.100; // 100ms future queue window
        const nextWindowTime = rawPlaybackTime + lookahead;

        while (studioPlaybackNoteIndex < studioNotesMemory.length) {
            const note = studioNotesMemory[studioPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < nextWindowTime) {
                const targetTime = studioAudioStartTime + (shiftedStart - studioLogicalStartTime) / playbackSpeed;
                
                try {
                    const noteName = Tone.Frequency(note.midi, "midi").toNote();
                    const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                    const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                    
                    if (noteName && activeInstrument) {
                        if (Tone.context.state === 'suspended') {
                            Tone.context.resume();
                        }
                        playNoteSafely(noteName, duration, targetTime, velocity, true);
                    }
                } catch (e) {
                    console.warn("Studio playback voice skipped safely:", e);
                }
                studioPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // Visual Highlight Loop (Lights up notes exactly when heard)
        while (studioVisualNoteIndex < studioNotesMemory.length) {
            const note = studioNotesMemory[studioVisualNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart <= studioPlaybackTime) {
                const noteHead = document.getElementById(`sheet-music-notation-studio-notehead-${studioVisualNoteIndex}`);
                const noteRect = document.getElementById(`sheet-music-notation-studio-note-rect-${studioVisualNoteIndex}`);
                if (noteHead) {
                    if (noteHead.getAttribute('stroke') !== 'none') {
                        noteHead.setAttribute('stroke', '#db2777');
                        noteHead.setAttribute('stroke-width', '1.3');
                    } else {
                        noteHead.setAttribute('fill', '#db2777');
                    }
                }
                if (noteRect) noteRect.setAttribute('fill', '#db2777');
                studioVisualNoteIndex++;
            } else {
                break;
            }
        }

        // Visual Release Loop (Reverts expired noteheads)
        const checkStart = Math.max(0, studioVisualNoteIndex - 100);
        for (let i = checkStart; i < studioVisualNoteIndex; i++) {
            const note = studioNotesMemory[i];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            const shiftedEnd = shiftedStart + note.duration;
            if (studioPlaybackTime >= shiftedEnd) {
                const noteHead = document.getElementById(`sheet-music-notation-studio-notehead-${i}`);
                const noteRect = document.getElementById(`sheet-music-notation-studio-note-rect-${i}`);
                
                const chkShowColors = document.getElementById('chk-show-colors');
                const showColors = chkShowColors ? chkShowColors.checked : false;

                let defaultColor = "";
                if (note.midi >= 60) {
                    defaultColor = showColors ? '#4f46e5' : '#111115';
                } else {
                    defaultColor = showColors ? '#d97706' : '#111115';
                }

                if (noteHead) {
                    const isHollow = noteHead.getAttribute('stroke') !== 'none';
                    if (isHollow) {
                        if (noteHead.getAttribute('stroke') === '#db2777') {
                            noteHead.setAttribute('stroke', defaultColor);
                            noteHead.setAttribute('stroke-width', '1.3');
                        }
                    } else {
                        if (noteHead.getAttribute('fill') === '#db2777') {
                            noteHead.setAttribute('fill', defaultColor);
                        }
                    }
                }
                if (noteRect && noteRect.getAttribute('fill') === '#db2777') {
                    noteRect.setAttribute('fill', defaultColor);
                }
            }
        }

        studioPlaybackTimer = requestAnimationFrame(updateStudioFrame);
    }

    studioPlaybackTimer = requestAnimationFrame(updateStudioFrame);
}

// Stop studio playback
function stopStudioPlayback() {
    isStudioPlaying = false;
    if (studioPlaybackTimer) {
        cancelAnimationFrame(studioPlaybackTimer);
        studioPlaybackTimer = null;
    }
    studioPlaybackTime = 0;
    activeInstrument.releaseAll();

    const btnPlay = document.getElementById('btn-studio-play-score');
    const btnStop = document.getElementById('btn-studio-stop-score');
    if (btnPlay) {
        btnPlay.textContent = "Play Studio Score";
        btnPlay.style.backgroundColor = "#10b981";
    }
    if (btnStop) {
        btnStop.disabled = true;
    }

    const startPadding = 45;
    const cursor = document.getElementById('sheet-music-notation-studio-playback-cursor');
    if (cursor) {
        cursor.setAttribute('x1', 100 + startPadding);
        cursor.setAttribute('x2', 100 + startPadding);
        cursor.style.display = "none";
    }

    const scrollContainer = document.getElementById('sheet-tab-studio-content-vertical');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    resetStudioNoteHighlights();
}

function resetStudioNoteHighlights() {
    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    const ppq = (midiData && midiData.header) ? (midiData.header.PPQ || midiData.header.ppq || 480) : 480;

    studioNotesMemory.forEach((note, index) => {
        const noteHead = document.getElementById(`sheet-music-notation-studio-notehead-${index}`);
        const noteRect = document.getElementById(`sheet-music-notation-studio-note-rect-${index}`);
        
        let defaultColor = "";
        if (note.midi >= 60) {
            defaultColor = showColors ? '#4f46e5' : '#111115';
        } else {
            defaultColor = showColors ? '#d97706' : '#111115';
        }

        const durationTicks = note.durationTicks || (note.duration * 2 * ppq);
        const isWholeNote = durationTicks >= ppq * 3.2;
        const isHalfNote = durationTicks >= ppq * 1.6 && durationTicks < ppq * 3.2;

        if (noteHead) {
            if (isWholeNote || isHalfNote) {
                noteHead.setAttribute('fill', '#ffffff');
                noteHead.setAttribute('stroke', defaultColor);
                noteHead.setAttribute('stroke-width', '1.3'); // updated to elegant 1.3 stroke
            } else {
                noteHead.setAttribute('fill', defaultColor);
                noteHead.setAttribute('stroke', 'none');
            }
        }
        if (noteRect) {
            if (showColors) {
                noteRect.setAttribute('fill', defaultColor);
                noteRect.style.display = 'block';
            } else {
                noteRect.style.display = 'none';
            }
        }
    });
}

// --- Initialize Sequence Runner ---
init();

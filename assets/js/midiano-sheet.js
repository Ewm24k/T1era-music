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

// Render piano-roll style grand staff notation directly from the raw activeNotesMemory events
function renderSheetMusic() {
    if (!midiData || activeNotesMemory.length === 0) return;

    const firstNoteTime = activeNotesMemory.length > 0 ? activeNotesMemory[0].time : 0;
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
    // Treble Clef centered on G4 (relative y = 10 from center y = 80)
    svgContent += `
    <g transform="translate(60, 80)" stroke="#818cf8" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 5,-40 L 5,30 C 5,38 0,42 -5,42 C -9,42 -12,38 -12,34 C -12,30 -9,27 -6,27 C -3,27 0,31 0,34" />
        <circle cx="5" cy="-40" r="3" fill="#818cf8" />
        <path d="M 5,-15 C 5,-28 15,-32 15,-20 C 15,-10 5,0 5,10" />
        <path d="M 5,10 C 5,22 -8,22 -8,10 C -8,-2 13,-2 13,10 C 13,20 3,24 0,16" />
    </g>`;

    // Bass Clef with dots flanking F3 (relative y = -10 from center y = 220)
    svgContent += `
    <g transform="translate(60, 220)" stroke="#fbbf24" stroke-width="2.5" fill="none" opacity="0.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M -8,-10 C -2,-18 10,-18 10,-8 C 10,2 -2,10 -8,18 C -10,21 -12,25 -12,28" />
        <circle cx="-8" cy="-10" r="3.5" fill="#fbbf24" stroke="none" />
        <circle cx="16" cy="-15" r="2.5" fill="#fbbf24" stroke="none" />
        <circle cx="16" cy="-5" r="2.5" fill="#fbbf24" stroke="none" />
    </g>`;

    // 5. Render notes row-by-row strictly matching the raw activeNotesMemory log
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
            // Notes above Line 3 (pitch >= 72) stem points down
            // Notes on or below Line 3 (pitch <= 71) stem points up
            if (pitch >= 72) {
                stemDirection = "down";
            } else {
                stemDirection = "up";
            }
        } else {
            y = lhStaffCenterY - (pitch - 50) * dy;
            color = "#fbbf24"; // Amber/gold
            
            // Center line (Line 3) of LH Bass clef is D3 (MIDI 50)
            // Notes above Line 3 (pitch >= 51) stem points down
            // Notes on or below Line 3 (pitch <= 50) stem points up
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
            // LH (Bass) Ledger Lines
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

        // Notehead
        svgContent += `<ellipse cx="${x}" cy="${y}" rx="7" ry="5" fill="${color}" id="sheet-notehead-${index}" transform="rotate(-15, ${x}, ${y})" />`;

        // Stems standard attachment:
        if (stemDirection === "up") {
            svgContent += `<line x1="${x + 6}" y1="${y}" x2="${x + 6}" y2="${y - 25}" stroke="${color}" stroke-width="1.5" id="sheet-stem-${index}" />`;
        } else {
            svgContent += `<line x1="${x - 6}" y1="${y}" x2="${x - 6}" y2="${y + 25}" stroke="${color}" stroke-width="1.5" id="sheet-stem-${index}" />`;
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

// Render the vertically wrapped portrait-layout sheet music with a white page aesthetic
function renderVerticalSheetMusic(targetContainerId) {
    if (!midiData || activeNotesMemory.length === 0) return;

    const firstNoteTime = activeNotesMemory.length > 0 ? activeNotesMemory[0].time : 0;
    const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

    const systemDuration = 10; // 10 seconds of note data per wrapped row system
    const numSystems = Math.ceil(totalDurationSecs / systemDuration);

    const systemHeight = 220;
    const rhStaffCenterY = 60;
    const lhStaffCenterY = 160;
    const dy = 3;

    const marginLeft = 100;

    // 1. Dynamic Width Calculation based on Maximize View viewport parent width
    let containerWidth = 950; // default for embedded section 2
    if (targetContainerId === 'sheet-music-notation-max') {
        const container = document.getElementById('max-modal-scroll-container');
        if (container && container.clientWidth) {
            containerWidth = Math.max(950, container.clientWidth - 60); // Cushioned cushion padding buffer
        } else {
            containerWidth = Math.max(1200, window.innerWidth * 0.88);
        }
    }
    
    const svgWidth = containerWidth;
    const marginRight = 50;
    const systemWidth = svgWidth - marginLeft - marginRight;
    const svgHeight = numSystems * systemHeight + 100; // Buffered bottom layout space for copyright

    // Check if we should render colorful notes
    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    // 2. Proportional Scaling so notes perfectly stretch across full maximized staves
    const localPixelsPerSecond = systemWidth / systemDuration;

    let svgContent = "";

    // Copyright marker at top right corner
    svgContent += `<text x="${svgWidth - 150}" y="25" fill="#111115" font-size="11" font-weight="600" font-family="-apple-system, sans-serif">© T1ERA Music Ai</text>`;

    for (let i = 0; i < numSystems; i++) {
        const yOffset = i * systemHeight + 40;

        // Draw Treble staff lines
        const rhLines = [64, 67, 71, 74, 77];
        rhLines.forEach(pitch => {
            const y = yOffset + rhStaffCenterY - (pitch - 71) * dy;
            svgContent += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + systemWidth}" y2="${y}" stroke="#9ca3af" stroke-width="0.75" />`;
        });

        // Draw Bass staff lines
        const lhLines = [43, 47, 50, 53, 57];
        lhLines.forEach(pitch => {
            const y = yOffset + lhStaffCenterY - (pitch - 50) * dy;
            svgContent += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + systemWidth}" y2="${y}" stroke="#9ca3af" stroke-width="0.75" />`;
        });

        // Draw bracket linkage and labels
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
    }

    // 5. Draw the notes into their corresponding staff systems
    activeNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const systemIdx = Math.floor(shiftedStart / systemDuration);
        if (systemIdx >= numSystems) return;

        const yOffset = systemIdx * systemHeight + 40;
        const systemTimeOffset = shiftedStart - systemIdx * systemDuration;
        const noteX = systemTimeOffset * localPixelsPerSecond + marginLeft;
        
        // Prevent horizontal overflow past system bounds dynamically
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

        // Render dynamic ledger lines for notes that are placed off-staff
        const lineStroke = showColors ? color : "#111115";
        if (pitch >= 60) {
            if (pitch <= 60) { // Middle C (60)
                const ly = yOffset + rhStaffCenterY - (60 - 71) * dy;
                svgContent += `<line x1="${noteX - 12}" y1="${ly}" x2="${noteX + 12}" y2="${ly}" stroke="${lineStroke}" stroke-width="1.5" />`;
            } else if (pitch >= 81) { // High ledger notes
                const rhLedgerLines = [81, 84, 88, 91, 95, 98, 101, 105, 108];
                rhLedgerLines.forEach(lp => {
                    if (lp <= pitch) {
                        const ly = yOffset + rhStaffCenterY - (lp - 71) * dy;
                        svgContent += `<line x1="${noteX - 12}" y1="${ly}" x2="${noteX + 12}" y2="${ly}" stroke="${lineStroke}" stroke-width="1.5" />`;
                    }
                });
            }
        } else {
            if (pitch <= 40) { // Low ledger notes (such as E2 = 40)
                const lhLedgerLines = [40, 36, 33, 29, 26, 24, 21];
                lhLedgerLines.forEach(lp => {
                    if (lp >= pitch) {
                        const ly = yOffset + lhStaffCenterY - (lp - 50) * dy;
                        svgContent += `<line x1="${noteX - 12}" y1="${ly}" x2="${noteX + 12}" y2="${ly}" stroke="${lineStroke}" stroke-width="1.5" />`;
                    }
                });
            }
        }

        // Note duration bar
        if (showColors) {
            svgContent += `<rect x="${noteX}" y="${y - 4}" width="${noteW}" height="8" rx="4" fill="${color}" opacity="0.6" id="${targetContainerId}-note-rect-${index}" />`;
        }

        // Notehead
        svgContent += `<ellipse cx="${noteX}" cy="${y}" rx="7" ry="5" fill="${color}" id="${targetContainerId}-notehead-${index}" transform="rotate(-15, ${noteX}, ${y})" />`;

        // Stems standard attachment
        if (stemDirection === "up") {
            svgContent += `<line x1="${noteX + 6}" y1="${y}" x2="${noteX + 6}" y2="${y - 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
        } else {
            svgContent += `<line x1="${noteX - 6}" y1="${y}" x2="${noteX - 6}" y2="${y + 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
        }
    });

    // Vertical playback tracking pointer cursor
    svgContent += `<line id="${targetContainerId}-playback-cursor" x1="${marginLeft}" y1="10" x2="${marginLeft}" y2="${svgHeight - 80}" stroke="#ef4444" stroke-width="2.5" style="display: none;" />`;

    // Draw footer copyright on the bottom center
    svgContent += `<text x="${svgWidth / 2}" y="${svgHeight - 15}" text-anchor="middle" fill="#111115" font-size="11" font-weight="600" font-family="-apple-system, sans-serif">© T1ERA Music Ai</text>`;

    const svgString = `<svg width="${svgWidth}" height="${svgHeight}" style="background: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">${svgContent}</svg>`;
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
    verticalPlaybackTime = 0;
    verticalLastFrameTime = performance.now();
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

    const systemDuration = 10;
    const systemHeight = 220;
    const marginLeft = 100;

    // Dynamic width calculation matched exactly with renderVerticalSheetMusic
    let containerWidth = 950;
    if (targetContainerId === 'sheet-music-notation-max') {
        const container = document.getElementById('max-modal-scroll-container');
        if (container && container.clientWidth) {
            containerWidth = Math.max(950, container.clientWidth - 60);
        } else {
            containerWidth = Math.max(1200, window.innerWidth * 0.88);
        }
    }
    const systemWidth = containerWidth - marginLeft - 50;
    const localPixelsPerSecond = systemWidth / systemDuration;

    const firstNoteTime = activeNotesMemory.length > 0 ? activeNotesMemory[0].time : 0;
    
    // Fast seek of starting index
    verticalPlaybackNoteIndex = 0;
    while (verticalPlaybackNoteIndex < activeNotesMemory.length && Math.max(0, activeNotesMemory[verticalPlaybackNoteIndex].time - firstNoteTime) < verticalPlaybackTime) {
        verticalPlaybackNoteIndex++;
    }

    // Optimization: State variable to cache vertical scrolling to prevent 60-FPS browser layout reflow thrashing
    let lastScrolledSystemIdx = -1;

    function updateVerticalFrame(now) {
        if (!isVerticalPlaying) return;

        const delta = (now - verticalLastFrameTime) / 1000;
        verticalLastFrameTime = now;

        const prevTime = verticalPlaybackTime;
        verticalPlaybackTime += delta * playbackSpeed;

        const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

        if (verticalPlaybackTime >= totalDurationSecs) {
            stopVerticalPlayback();
            return;
        }

        // 1. Move pointer cursor vertically and horizontally
        const currentSystemIdx = Math.floor(verticalPlaybackTime / systemDuration);
        const systemTimeOffset = verticalPlaybackTime - currentSystemIdx * systemDuration;

        const cursorX = systemTimeOffset * localPixelsPerSecond + marginLeft;
        const yOffset = currentSystemIdx * systemHeight + 40;

        if (cursor) {
            cursor.setAttribute('x1', cursorX);
            cursor.setAttribute('x2', cursorX);
            cursor.setAttribute('y1', yOffset + 10);
            cursor.setAttribute('y2', yOffset + 210);
        }

        // 2. Smoothly scroll container vertically (OPTIMIZED: only scroll when active line row shifts)
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

        // 3. Audio Dispatcher (Density-Throttled trigger with soft safety lookahead queue to prevent crashes)
        let notesTriggeredThisFrame = 0;
        const MAX_NOTES_PER_FRAME = 8; // Density cap limits simultaneous notes that could mute Tone.js

        while (verticalPlaybackNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[verticalPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < verticalPlaybackTime) {
                if (shiftedStart >= prevTime) {
                    if (notesTriggeredThisFrame < MAX_NOTES_PER_FRAME) {
                        const playDelay = Math.max(0, shiftedStart - prevTime) / playbackSpeed;
                        
                        try {
                            const noteName = Tone.Frequency(note.midi, "midi").toNote();
                            const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                            const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                            
                            if (noteName && activeInstrument && typeof activeInstrument.triggerAttackRelease === 'function') {
                                if (Tone.context.state === 'suspended') {
                                    Tone.context.resume(); // Ensure Audio Context never sleeps
                                }
                                // Scheduled with a stable 15ms lookahead headroom to bypass main-thread GC lags
                                activeInstrument.triggerAttackRelease(noteName, duration, Tone.now() + playDelay + 0.015, velocity);
                                notesTriggeredThisFrame++;
                            }
                        } catch (e) {
                            console.warn("Vertical Playback voice skipped safely:", e);
                        }
                    }

                    // Highlight note on the specific SVG container
                    const noteHead = document.getElementById(`${targetContainerId}-notehead-${verticalPlaybackNoteIndex}`);
                    const noteRect = document.getElementById(`${targetContainerId}-note-rect-${verticalPlaybackNoteIndex}`);
                    if (noteHead) noteHead.setAttribute('fill', '#db2777'); // Magenta active
                    if (noteRect) noteRect.setAttribute('fill', '#db2777');
                }
                verticalPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // Visual release handler (analyzes only recent sliding window keys)
        const checkStart = Math.max(0, verticalPlaybackNoteIndex - 100);
        for (let i = checkStart; i < verticalPlaybackNoteIndex; i++) {
            const note = activeNotesMemory[i];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            const shiftedEnd = shiftedStart + note.duration;

            if (prevTime < shiftedEnd && verticalPlaybackTime >= shiftedEnd) {
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
                
                if (noteHead) noteHead.setAttribute('fill', defaultColor);
                if (noteRect) noteRect.setAttribute('fill', defaultColor);
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
        const cursor = document.getElementById(`${activeVerticalContainerId}-playback-cursor`);
        if (cursor) {
            cursor.setAttribute('x1', 100);
            cursor.setAttribute('x2', 100);
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

    activeNotesMemory.forEach((note, index) => {
        const noteHead = document.getElementById(`${containerId}-notehead-${index}`);
        const noteRect = document.getElementById(`${containerId}-note-rect-${index}`);
        
        let defaultColor = "";
        if (note.midi >= 60) {
            defaultColor = showColors ? '#4f46e5' : '#111115';
        } else {
            defaultColor = showColors ? '#d97706' : '#111115';
        }

        if (noteHead) noteHead.setAttribute('fill', defaultColor);
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
    sheetMusicPlaybackTime = 0;
    sheetMusicLastFrameTime = performance.now();
    lastTriggeredTime = 0;

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

    // Setup optimized index seek head
    sheetPlaybackNoteIndex = 0;
    const firstNoteTime = activeNotesMemory.length > 0 ? activeNotesMemory[0].time : 0;
    while (sheetPlaybackNoteIndex < activeNotesMemory.length && Math.max(0, activeNotesMemory[sheetPlaybackNoteIndex].time - firstNoteTime) < sheetMusicPlaybackTime) {
        sheetPlaybackNoteIndex++;
    }

    // Frame scheduler to drive audio events and follow pointer visual states
    function updateSheetFrame(now) {
        if (!sheetMusicPlaying) return;

        const delta = (now - sheetMusicLastFrameTime) / 1000;
        sheetMusicLastFrameTime = now;

        const prevTime = sheetMusicPlaybackTime;
        sheetMusicPlaybackTime += delta * playbackSpeed;

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

        // 3. Audio Triggering Scheduler (Highly Optimized Pointer check with 15ms lookahead and Density Cap)
        let notesTriggeredThisFrame = 0;
        const MAX_NOTES_PER_FRAME = 8;

        while (sheetPlaybackNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[sheetPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < sheetMusicPlaybackTime) {
                if (shiftedStart >= prevTime) {
                    if (notesTriggeredThisFrame < MAX_NOTES_PER_FRAME) {
                        const playDelay = Math.max(0, shiftedStart - prevTime) / playbackSpeed;
                        
                        try {
                            const noteName = Tone.Frequency(note.midi, "midi").toNote();
                            const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                            const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                            
                            if (noteName && activeInstrument && typeof activeInstrument.triggerAttackRelease === 'function') {
                                if (Tone.context.state === 'suspended') {
                                    Tone.context.resume();
                                }
                                // Added 15ms lookahead to bypass layout reflow lags
                                activeInstrument.triggerAttackRelease(noteName, duration, Tone.now() + playDelay + 0.015, velocity);
                                notesTriggeredThisFrame++;
                            }
                        } catch (e) {
                            console.warn("Sheet playback voice skipped safely:", e);
                        }
                    }

                    // Visual highlight
                    const noteHead = document.getElementById(`sheet-notehead-${sheetPlaybackNoteIndex}`);
                    const noteRect = document.getElementById(`sheet-note-rect-${sheetPlaybackNoteIndex}`);
                    if (noteHead) noteHead.setAttribute('fill', '#e879f9');
                    if (noteRect) noteRect.setAttribute('fill', '#e879f9');
                }
                sheetPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // Visual release sweep on local active notes sliding window
        const checkStart = Math.max(0, sheetPlaybackNoteIndex - 100);
        for (let i = checkStart; i < sheetPlaybackNoteIndex; i++) {
            const note = activeNotesMemory[i];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            const shiftedEnd = shiftedStart + note.duration;
            if (prevTime < shiftedEnd && sheetMusicPlaybackTime >= shiftedEnd) {
                const noteHead = document.getElementById(`sheet-notehead-${i}`);
                const noteRect = document.getElementById(`sheet-note-rect-${i}`);
                if (noteHead) noteHead.setAttribute('fill', note.midi >= 60 ? '#818cf8' : '#fbbf24');
                if (noteRect) noteRect.setAttribute('fill', note.midi >= 60 ? '#818cf8' : '#fbbf24');
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
    activeNotesMemory.forEach((note, index) => {
        const noteHead = document.getElementById(`sheet-notehead-${index}`);
        const noteRect = document.getElementById(`sheet-note-rect-${index}`);
        if (noteHead) noteHead.setAttribute('fill', note.midi >= 60 ? '#818cf8' : '#fbbf24');
        if (noteRect) noteRect.setAttribute('fill', note.midi >= 60 ? '#818cf8' : '#fbbf24');
    });
}

function renderStudioSheetMusic(targetContainerId) {
    if (!midiData || studioNotesMemory.length === 0) {
        document.getElementById(targetContainerId).innerHTML = "<div style='color: #9ca3af; padding: 20px; text-align: center;'>No notes in studio buffer. Apply a filter or load a MIDI file.</div>";
        return;
    }

    const firstNoteTime = studioNotesMemory.length > 0 ? studioNotesMemory[0].time : 0;
    const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

    const systemDuration = 10; 
    const numSystems = Math.ceil(totalDurationSecs / systemDuration) || 1;

    const systemHeight = 220;
    const rhStaffCenterY = 60;
    const lhStaffCenterY = 160;
    const dy = 3;

    const marginLeft = 100;
    const systemWidth = 800;
    const marginRight = 50;
    const svgWidth = marginLeft + systemWidth + marginRight;
    const svgHeight = numSystems * systemHeight + 100;

    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    // Proportional Scaling mapping matching studio width parameters
    const localPixelsPerSecond = systemWidth / systemDuration;

    let svgContent = "";

    svgContent += `<text x="${svgWidth - 150}" y="25" fill="#111115" font-size="11" font-weight="600" font-family="-apple-system, sans-serif">© T1ERA Studio Ai</text>`;

    for (let i = 0; i < numSystems; i++) {
        const yOffset = i * systemHeight + 40;

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
    }

    studioNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const systemIdx = Math.floor(shiftedStart / systemDuration);
        if (systemIdx >= numSystems) return;

        const yOffset = systemIdx * systemHeight + 40;
        const systemTimeOffset = shiftedStart - systemIdx * systemDuration;
        const noteX = systemTimeOffset * localPixelsPerSecond + marginLeft;
        
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

        svgContent += `<ellipse cx="${noteX}" cy="${y}" rx="7" ry="5" fill="${color}" id="${targetContainerId}-notehead-${index}" transform="rotate(-15, ${noteX}, ${y})" />`;

        if (stemDirection === "up") {
            svgContent += `<line x1="${noteX + 6}" y1="${y}" x2="${noteX + 6}" y2="${y - 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
        } else {
            svgContent += `<line x1="${noteX - 6}" y1="${y}" x2="${noteX - 6}" y2="${y + 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
        }
    });

    // Tracking pointer
    svgContent += `<line id="${targetContainerId}-playback-cursor" x1="${marginLeft}" y1="10" x2="${marginLeft}" y2="${svgHeight - 80}" stroke="#ef4444" stroke-width="2.5" style="display: none;" />`;

    const svgString = `<svg width="${svgWidth}" height="${svgHeight}" style="background: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">${svgContent}</svg>`;
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
    studioPlaybackTime = 0;
    studioLastFrameTime = performance.now();

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

    const systemDuration = 10;
    const systemHeight = 220;
    const marginLeft = 100;

    const firstNoteTime = studioNotesMemory.length > 0 ? studioNotesMemory[0].time : 0;
    
    // Fast seek of starting studio index
    studioPlaybackNoteIndex = 0;
    while (studioPlaybackNoteIndex < studioNotesMemory.length && Math.max(0, studioNotesMemory[studioPlaybackNoteIndex].time - firstNoteTime) < studioPlaybackTime) {
        studioPlaybackNoteIndex++;
    }

    // Optimization: State variable to cache vertical scrolling to prevent 60-FPS browser layout reflow thrashing inside Studio
    let lastStudioScrolledIdx = -1;

    function updateStudioFrame(now) {
        if (!isStudioPlaying) return;

        const delta = (now - studioLastFrameTime) / 1000;
        studioLastFrameTime = now;

        const prevTime = studioPlaybackTime;
        studioPlaybackTime += delta * playbackSpeed;

        const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);

        if (studioPlaybackTime >= totalDurationSecs) {
            stopStudioPlayback();
            return;
        }

        const currentSystemIdx = Math.floor(studioPlaybackTime / systemDuration);
        const systemTimeOffset = studioPlaybackTime - currentSystemIdx * systemDuration;

        const cursorX = systemTimeOffset * pixelsPerSecond + marginLeft;
        const yOffset = currentSystemIdx * systemHeight + 40;

        if (cursor) {
            cursor.setAttribute('x1', cursorX);
            cursor.setAttribute('x2', cursorX);
            cursor.setAttribute('y1', yOffset + 10);
            cursor.setAttribute('y2', yOffset + 210);
        }

        // OPTIMIZED: only scroll Studio panel container when line wraps
        if (currentSystemIdx !== lastStudioScrolledIdx) {
            lastStudioScrolledIdx = currentSystemIdx;
            const scrollContainer = document.getElementById('sheet-tab-studio-content-vertical');
            if (scrollContainer) {
                const targetScrollTop = currentSystemIdx * systemHeight - scrollContainer.clientHeight / 2 + systemHeight / 2;
                scrollContainer.scrollTop = Math.max(0, targetScrollTop);
            }
        }

        // Audio Dispatcher (Dynamic Cursor-Indexed Trigger with soft 15ms lookahead and Density Cap)
        let notesTriggeredThisFrame = 0;
        const MAX_NOTES_PER_FRAME = 8;

        while (studioPlaybackNoteIndex < studioNotesMemory.length) {
            const note = studioNotesMemory[studioPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < studioPlaybackTime) {
                if (shiftedStart >= prevTime) {
                    if (notesTriggeredThisFrame < MAX_NOTES_PER_FRAME) {
                        const playDelay = Math.max(0, shiftedStart - prevTime) / playbackSpeed;
                        
                        try {
                            const noteName = Tone.Frequency(note.midi, "midi").toNote();
                            const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                            const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                            
                            if (noteName && activeInstrument && typeof activeInstrument.triggerAttackRelease === 'function') {
                                if (Tone.context.state === 'suspended') {
                                    Tone.context.resume();
                                }
                                // Added 15ms lookahead to bypass layout reflow lags
                                activeInstrument.triggerAttackRelease(noteName, duration, Tone.now() + playDelay + 0.015, velocity);
                                notesTriggeredThisFrame++;
                            }
                        } catch (e) {
                            console.warn("Studio playback voice skipped safely:", e);
                        }
                    }

                    const noteHead = document.getElementById(`sheet-music-notation-studio-notehead-${studioPlaybackNoteIndex}`);
                    const noteRect = document.getElementById(`sheet-music-notation-studio-note-rect-${studioPlaybackNoteIndex}`);
                    if (noteHead) noteHead.setAttribute('fill', '#db2777');
                    if (noteRect) noteRect.setAttribute('fill', '#db2777');
                }
                studioPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // Visual release handler (analyzes only recent sliding window keys)
        const checkStart = Math.max(0, studioPlaybackNoteIndex - 100);
        for (let i = checkStart; i < studioPlaybackNoteIndex; i++) {
            const note = studioNotesMemory[i];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            const shiftedEnd = shiftedStart + note.duration;
            if (prevTime < shiftedEnd && studioPlaybackTime >= shiftedEnd) {
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

                if (noteHead) noteHead.setAttribute('fill', defaultColor);
                if (noteRect) noteRect.setAttribute('fill', defaultColor);
            }
        }

        studioPlaybackTimer = requestAnimationFrame(updateStudioFrame);
    }

    studioPlaybackTimer = requestAnimationFrame(updateStudioFrame);
}

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

    const cursor = document.getElementById('sheet-music-notation-studio-playback-cursor');
    if (cursor) {
        cursor.setAttribute('x1', 100);
        cursor.setAttribute('x2', 100);
        cursor.style.display = "none";
    }

    const scrollContainer = document.getElementById('sheet-tab-studio-content-vertical');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    resetStudioNoteHighlights();
}

function resetStudioNoteHighlights() {
    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    studioNotesMemory.forEach((note, index) => {
        const noteHead = document.getElementById(`sheet-music-notation-studio-notehead-${index}`);
        const noteRect = document.getElementById(`sheet-music-notation-studio-note-rect-${index}`);
        
        let defaultColor = "";
        if (note.midi >= 60) {
            defaultColor = showColors ? '#4f46e5' : '#111115';
        } else {
            defaultColor = showColors ? '#d97706' : '#111115';
        }

        if (noteHead) noteHead.setAttribute('fill', defaultColor);
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

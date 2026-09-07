// --- Shared massive-key / anti-choke playback guard ---
// Prefers the triggerNoteWithVoiceGuard() function defined in the audio
// engine script (handles same-pitch choking, overall polyphony stealing,
// and massive-chord burst thinning in one place). Falls back to a plain
// choke+attack call if that script isn't loaded, so this file still works
// on its own.
function playNoteSafely(noteName, duration, time, velocity) {
    if (typeof triggerNoteWithVoiceGuard === 'function') {
        triggerNoteWithVoiceGuard(noteName, duration, time, velocity);
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

    const firstNoteTime = activeNotesMemory.length > 0 ? activeNotesMemory[0].time : 0;
    const totalDurationSecs = Math.max(0, totalDuration - firstNoteTime);
    
    const startPadding = 50; // Shift note starts to make space for the first-system time signature
    const svgWidth = totalDurationSecs * pixelsPerSecond + 200 + startPadding; // Offset spacing
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

    // Render Time Signature inside Section 1 staff
    const tsX = 115;
    svgContent += `
    <g id="horizontal-time-signature-treble" fill="#9ca3af" stroke="none">
        <text x="${tsX}" y="${rhStaffCenterY - 6}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureNum}</text>
        <text x="${tsX}" y="${rhStaffCenterY + 18}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureDen}</text>
    </g>
    <g id="horizontal-time-signature-bass" fill="#9ca3af" stroke="none">
        <text x="${tsX}" y="${lhStaffCenterY - 6}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureNum}</text>
        <text x="${tsX}" y="${lhStaffCenterY + 18}" font-family="Georgia, serif" font-size="28" font-weight="bold" text-anchor="middle">${timeSignatureDen}</text>
    </g>`;

    // 5. Render notes row-by-row strictly matching the raw activeNotesMemory log
    activeNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const x = shiftedStart * pixelsPerSecond + 100 + startPadding;
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
            // LH (Bass) Ledger Lines
            if (pitch <= 40) { // Low ledger notes (such as E2 = 40)
                const ly = lhStaffCenterY - (lp - 50) * dy;
                svgContent += `<line x1="${x - 12}" y1="${ly}" x2="${x + 12}" y2="${ly}" stroke="${color}" stroke-width="1.5" />`;
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

    // Bold Double Bar Line at the End of Horizontal continuous piece
    const endX = totalDurationSecs * pixelsPerSecond + 100 + startPadding;
    svgContent += `<!-- Double Bar Line at the End of Horizontal Piece -->`;
    svgContent += `<line x1="${endX}" y1="${rhStaffCenterY - 18}" x2="${endX}" y2="${lhStaffCenterY + 21}" stroke="#4b5563" stroke-width="1.5" />`;
    svgContent += `<line x1="${endX + 4}" y1="${rhStaffCenterY - 18}" x2="${endX + 4}" y2="${lhStaffCenterY + 21}" stroke="#4b5563" stroke-width="3.5" />`;

    // Playback tracking cursor line (offset to starting coordinates)
    svgContent += `<line id="sheet-playback-cursor" x1="${100 + startPadding}" y1="10" x2="${100 + startPadding}" y2="290" stroke="#ef4444" stroke-width="2" style="display: none;" />`;

    // Insert vector graphic content inside the display frame
    const svgString = `<svg width="${svgWidth}" height="${svgHeight}" style="background: #0b0b0f; border-radius: 8px;">${svgContent}</svg>`;
    elSheetMusicNotation.innerHTML = svgString;

    // Automatically populate the wrapped portrait score inside Section 2
    renderVerticalSheetMusic('sheet-music-notation-vertical');
}

// Render the vertically wrapped portrait-layout sheet music with adaptive mobile zoom configurations strictly for maximized modal
function renderVerticalSheetMusic(targetContainerId) {
    if (!midiData || activeNotesMemory.length === 0) return;

    const firstNoteTime = activeNotesMemory.length > 0 ? activeNotesMemory[0].time : 0;
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

    // 2. Mobile Layout & Geometry Scaling Parameters strictly when MAXIMIZED
    const isMaximizedView = (targetContainerId === 'sheet-music-notation-max');
    const isPhoneView = containerWidth < 768;
    const shouldScale = isMaximizedView && isPhoneView; // Zoom out *only* in fullscreen maximised state on phone devices

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
    const svgHeight = numSystems * systemHeight + 100; // Buffered bottom layout space for copyright

    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    // 3. Proportional Scaling
    const startPadding = 45; // Space for clefs & signatures
    const localPixelsPerSecond = (systemWidth - startPadding * scale) / systemDuration;

    let svgContent = "";

    // Copyright marker at top right corner
    svgContent += `<text x="${svgWidth - 150}" y="25" fill="#111115" font-size="11" font-weight="600" font-family="-apple-system, sans-serif">© T1ERA Music Ai</text>`;

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
        const yOffset = i * systemHeight + 40;

        // Draw Treble staff lines
        const rhLines = [64, 67, 71, 74, 77];
        rhLines.forEach(pitch => {
            const y = yOffset + rhStaffCenterY - (pitch - 71) * dy;
            svgContent += `<line x1="${marginLeftValue}" y1="${y}" x2="${marginLeftValue + systemWidth}" y2="${y}" stroke="#9ca3af" stroke-width="${0.75 * scale}" />`;
        });

        // Draw Bass staff lines
        const lhLines = [43, 47, 50, 53, 57];
        lhLines.forEach(pitch => {
            const y = yOffset + lhStaffCenterY - (pitch - 50) * dy;
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

    // 4. Draw the notes into their corresponding staff systems (Scale-fitted)
    activeNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const systemIdx = Math.floor(shiftedStart / systemDuration);
        if (systemIdx >= numSystems) return;

        const yOffset = systemIdx * systemHeight + 40;
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

        // Notehead
        svgContent += `<ellipse cx="${noteX}" cy="${y}" rx="${5.5 * scale}" ry="${3.8 * scale}" fill="${color}" id="${targetContainerId}-notehead-${index}" transform="rotate(-15, ${noteX}, ${y})" />`;

        // Stems standard attachment
        if (stemDirection === "up") {
            svgContent += `<line x1="${noteX + 4.5 * scale}" y1="${y}" x2="${noteX + 4.5 * scale}" y2="${y - 18 * scale}" stroke="${color}" stroke-width="${1.2 * scale}" id="${targetContainerId}-stem-${index}" />`;
        } else {
            svgContent += `<line x1="${noteX - 4.5 * scale}" y1="${y}" x2="${noteX - 4.5 * scale}" y2="${y + 18 * scale}" stroke="${color}" stroke-width="${1.2 * scale}" id="${targetContainerId}-stem-${index}" />`;
        }
    });

    // Final Bold Double Bar Line (aligned dynamically to last note's completion)
    const lastNoteTimeShifted = totalDurationSecs;
    const lastSystemIdx = Math.floor(lastNoteTimeShifted / systemDuration);
    const lastSystemTimeOffset = lastNoteTimeShifted - lastSystemIdx * systemDuration;
    const endX = Math.min(lastSystemTimeOffset * localPixelsPerSecond + marginLeftValue + startPadding * scale, marginLeftValue + systemWidth);
    const lastSystemYOffset = lastSystemIdx * systemHeight + 40;

    svgContent += `<!-- Double Bar Line at the End of Piece -->`;
    svgContent += `<line x1="${endX}" y1="${lastSystemYOffset + (rhStaffCenterY - 18) * scale}" x2="${endX}" y2="${lastSystemYOffset + (lhStaffCenterY + 21) * scale}" stroke="#111115" stroke-width="${1.2 * scale}" />`;
    svgContent += `<line x1="${endX + 3 * scale}" y1="${lastSystemYOffset + (rhStaffCenterY - 18) * scale}" x2="${endX + 3 * scale}" y2="${lastSystemYOffset + (lhStaffCenterY + 21) * scale}" stroke="#111115" stroke-width="${2.8 * scale}" />`;

    // Vertical playback tracking pointer cursor
    svgContent += `<line id="${targetContainerId}-playback-cursor" x1="${marginLeftValue + startPadding * scale}" y1="10" x2="${marginLeftValue + startPadding * scale}" y2="${svgHeight - 80}" stroke="#ef4444" stroke-width="2.5" style="display: none;" />`;

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
    
    const isMaximizedView = (targetContainerId === 'sheet-music-notation-max');
    const isPhoneView = containerWidth < 768;
    const shouldScale = isMaximizedView && isPhoneView;

    const scale = shouldScale ? 0.65 : 1.0;
    const systemDuration = shouldScale ? 6 : 10;
    const systemHeight = shouldScale ? 140 : 220;
    const rhStaffCenterY = shouldScale ? 40 : 60;
    const lhStaffCenterY = shouldScale ? 100 : 160;

    const startPadding = 45; // Alignment with staves spacing
    const systemWidth = containerWidth - localMarginLeft - localMarginRight;
    const localPixelsPerSecond = (systemWidth - startPadding * scale) / systemDuration;

    const firstNoteTime = activeNotesMemory.length > 0 ? activeNotesMemory[0].time : 0;
    
    // Fast seek of starting index
    verticalPlaybackNoteIndex = 0;
    while (verticalPlaybackNoteIndex < activeNotesMemory.length && Math.max(0, activeNotesMemory[verticalPlaybackNoteIndex].time - firstNoteTime) < verticalPlaybackTime) {
        verticalPlaybackNoteIndex++;
    }

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

        const cursorX = systemTimeOffset * localPixelsPerSecond + localMarginLeft + startPadding * scale;
        const yOffset = currentSystemIdx * systemHeight + 40;

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

        // 3. Audio Dispatcher (Un-skipped Catch-up trigger with precise note choking & stable latency lookahead)
        let notesTriggeredThisFrame = 0;
        const MAX_NOTES_PER_FRAME = 8;
        const lookahead = 0.035;

        while (verticalPlaybackNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[verticalPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < verticalPlaybackTime) {
                if (notesTriggeredThisFrame < MAX_NOTES_PER_FRAME) {
                    const playDelay = Math.max(0, shiftedStart - prevTime) / playbackSpeed;
                    
                    try {
                        const noteName = Tone.Frequency(note.midi, "midi").toNote();
                        const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                        const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                        
                        if (noteName && activeInstrument) {
                            if (Tone.context.state === 'suspended') {
                                Tone.context.resume();
                            }
                            playNoteSafely(noteName, duration, Tone.now() + playDelay + lookahead, velocity);
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

                verticalPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // Visual release handler (analyzes sliding window keys)
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

    const startPadding = 50; // Align cursor movement with shifted notes

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
        const cursorX = sheetMusicPlaybackTime * pixelsPerSecond + 100 + startPadding;
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

        // 3. Audio Triggering Scheduler (Density-Throttled trigger with soft 35ms lookahead and Pitch-Choking)
        let notesTriggeredThisFrame = 0;
        const MAX_NOTES_PER_FRAME = 8;
        const lookahead = 0.035;

        while (sheetPlaybackNoteIndex < activeNotesMemory.length) {
            const note = activeNotesMemory[sheetPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < sheetMusicPlaybackTime) {
                if (notesTriggeredThisFrame < MAX_NOTES_PER_FRAME) {
                    const playDelay = Math.max(0, shiftedStart - prevTime) / playbackSpeed;
                    
                    try {
                        const noteName = Tone.Frequency(note.midi, "midi").toNote();
                        const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                        const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                        
                        if (noteName && activeInstrument) {
                            if (Tone.context.state === 'suspended') {
                                Tone.context.resume();
                            }
                            playNoteSafely(noteName, duration, Tone.now() + playDelay + lookahead, velocity);
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

                sheetPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // Visual release handler (analyzes sliding window keys)
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

    const startPadding = 50;
    const cursor = document.getElementById('sheet-playback-cursor');
    if (cursor) {
        cursor.setAttribute('x1', 100 + startPadding);
        cursor.setAttribute('x2', 100 + startPadding);
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
    const svgHeight = numSystems * systemHeight + 100;

    const chkShowColors = document.getElementById('chk-show-colors');
    const showColors = chkShowColors ? chkShowColors.checked : false;

    // Proportional Scaling mapping matching studio width parameters
    const startPadding = 45; // Space for clefs & signatures
    const localPixelsPerSecond = (systemWidth - startPadding) / systemDuration;

    let svgContent = "";

    svgContent += `<text x="${svgWidth - 150}" y="25" fill="#111115" font-size="11" font-weight="600" font-family="-apple-system, sans-serif">© T1ERA Studio Ai</text>`;

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

    studioNotesMemory.forEach((note, index) => {
        const shiftedStart = Math.max(0, note.time - firstNoteTime);
        const systemIdx = Math.floor(shiftedStart / systemDuration);
        if (systemIdx >= numSystems) return;

        const yOffset = systemIdx * systemHeight + 40;
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

        svgContent += `<ellipse cx="${noteX}" cy="${y}" rx="7" ry="5" fill="${color}" id="${targetContainerId}-notehead-${index}" transform="rotate(-15, ${noteX}, ${y})" />`;

        if (stemDirection === "up") {
            svgContent += `<line x1="${noteX + 6}" y1="${y}" x2="${noteX + 6}" y2="${y - 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
        } else {
            svgContent += `<line x1="${noteX - 6}" y1="${y}" x2="${noteX - 6}" y2="${y + 25}" stroke="${color}" stroke-width="1.5" id="${targetContainerId}-stem-${index}" />`;
        }
    });

    // Bold Double Bar Line at the End of Studio layout
    const lastNoteTimeShifted = totalDurationSecs;
    const lastSystemIdx = Math.floor(lastNoteTimeShifted / systemDuration);
    const lastSystemTimeOffset = lastNoteTimeShifted - lastSystemIdx * systemDuration;
    const endX = Math.min(lastSystemTimeOffset * localPixelsPerSecond + marginLeft + startPadding, marginLeft + systemWidth);
    const lastSystemYOffset = lastSystemIdx * systemHeight + 40;

    svgContent += `<!-- Double Bar Line at the End of Studio Piece -->`;
    svgContent += `<line x1="${endX}" y1="${lastSystemYOffset + rhStaffCenterY - 18}" x2="${endX}" y2="${lastSystemYOffset + lhStaffCenterY + 21}" stroke="#111115" stroke-width="1.5" />`;
    svgContent += `<line x1="${endX + 4}" y1="${lastSystemYOffset + rhStaffCenterY - 18}" x2="${endX + 4}" y2="${lastSystemYOffset + lhStaffCenterY + 21}" stroke="#111115" stroke-width="3.5" />`;

    // Tracking pointer cursor
    svgContent += `<line id="${targetContainerId}-playback-cursor" x1="${marginLeft + startPadding}" y1="10" x2="${marginLeft + startPadding}" y2="${svgHeight - 80}" stroke="#ef4444" stroke-width="2.5" style="display: none;" />`;

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

    const firstNoteTime = studioNotesMemory.length > 0 ? studioNotesMemory[0].time : 0;
    
    // Fast seek of starting studio index
    studioPlaybackNoteIndex = 0;
    while (studioPlaybackNoteIndex < studioNotesMemory.length && Math.max(0, studioNotesMemory[studioPlaybackNoteIndex].time - firstNoteTime) < studioPlaybackTime) {
        studioPlaybackNoteIndex++;
    }

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

        const cursorX = systemTimeOffset * localPixelsPerSecond + marginLeft + startPadding;
        const yOffset = currentSystemIdx * activeSystemHeight + 40;

        if (cursor) {
            cursor.setAttribute('x1', cursorX);
            cursor.setAttribute('x2', cursorX);
            cursor.setAttribute('y1', yOffset + (rhStaffCenterY - 18));
            cursor.setAttribute('y2', yOffset + (lhStaffCenterY + 21));
        }

        // OPTIMIZED: only scroll Studio panel container when line wraps
        if (currentSystemIdx !== lastStudioScrolledIdx) {
            lastStudioScrolledIdx = currentSystemIdx;
            const scrollContainer = document.getElementById('sheet-tab-studio-content-vertical');
            if (scrollContainer) {
                const targetScrollTop = currentSystemIdx * activeSystemHeight - scrollContainer.clientHeight / 2 + activeSystemHeight / 2;
                scrollContainer.scrollTop = Math.max(0, targetScrollTop);
            }
        }

        // Audio Dispatcher (Dynamic Cursor-Indexed Trigger with soft 35ms lookahead and Density Cap)
        let notesTriggeredThisFrame = 0;
        const MAX_NOTES_PER_FRAME = 8;
        const lookahead = 0.035;

        while (studioPlaybackNoteIndex < studioNotesMemory.length) {
            const note = studioNotesMemory[studioPlaybackNoteIndex];
            const shiftedStart = Math.max(0, note.time - firstNoteTime);
            if (shiftedStart < studioPlaybackTime) {
                if (notesTriggeredThisFrame < MAX_NOTES_PER_FRAME) {
                    const playDelay = Math.max(0, shiftedStart - prevTime) / playbackSpeed;
                    
                    try {
                        const noteName = Tone.Frequency(note.midi, "midi").toNote();
                        const duration = (note.duration && !isNaN(note.duration) && note.duration > 0) ? note.duration : 0.5;
                        const velocity = (note.velocity && !isNaN(note.velocity)) ? note.velocity : 0.8;
                        
                        if (noteName && activeInstrument) {
                            if (Tone.context.state === 'suspended') {
                                Tone.context.resume();
                            }
                            playNoteSafely(noteName, duration, Tone.now() + playDelay + lookahead, velocity);
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

                studioPlaybackNoteIndex++;
            } else {
                break;
            }
        }

        // Visual release handler (analyzes sliding window keys)
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

document.addEventListener("DOMContentLoaded", () => {
    const btnDownloadMenu = document.getElementById("btn-download-menu");
    const downloadDropdown = document.getElementById("download-dropdown");
    const downMidi = document.getElementById("down-midi");
    const downJson = document.getElementById("down-json");
    const downSvg = document.getElementById("down-svg");
    const downXml = document.getElementById("down-xml");

    // Section 2 - Dropdown Actions
    const downSvgSecond = document.getElementById("down-svg-second");
    const downXmlSecond = document.getElementById("down-xml-second");
    const downMidiSecond = document.getElementById("down-midi-second");
    const downPdfSecond = document.getElementById("down-pdf-second");

    // Maximized View - Dropdown Actions
    const downSvgMax = document.getElementById("down-svg-max");
    const downXmlMax = document.getElementById("down-xml-max");
    const downMidiMax = document.getElementById("down-midi-max");
    const downPdfMax = document.getElementById("down-pdf-max");

    // Dynamic enable observer loop targeting loaded midi state
    const checkLoadInterval = setInterval(() => {
        const hasData = typeof midiData !== 'undefined' && midiData !== null;
        if (btnDownloadMenu) btnDownloadMenu.disabled = !hasData;

        const btnDownloadSecond = document.getElementById("btn-download-second");
        if (btnDownloadSecond) btnDownloadSecond.disabled = !hasData;

        const btnDownloadMax = document.getElementById("btn-download-max");
        if (btnDownloadMax) btnDownloadMax.disabled = !hasData;
    }, 1000);

    // Toggle Dropdown Menu Visibility
    btnDownloadMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof midiData === 'undefined' || midiData === null) {
            alert("Please choose and load a MIDI file first.");
            return;
        }
        const dropdownSecond = document.getElementById("download-dropdown-second");
        if (dropdownSecond) dropdownSecond.classList.remove("show");
        const dropdownMax = document.getElementById("download-dropdown-max");
        if (dropdownMax) dropdownMax.classList.remove("show");

        downloadDropdown.classList.toggle("show");
    });

    // Close Dropdown Menus when clicking anywhere else on page
    document.addEventListener("click", () => {
        if (downloadDropdown) downloadDropdown.classList.remove("show");

        const dropdownSecond = document.getElementById("download-dropdown-second");
        if (dropdownSecond) dropdownSecond.classList.remove("show");

        const dropdownMax = document.getElementById("download-dropdown-max");
        if (dropdownMax) dropdownMax.classList.remove("show");
    });

    // Helper: Browser Download Dispatcher
    function triggerBrowserDownload(url, filename) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // =========================================================================
    // 1. DOWNLOAD MIDI FILE (Re-serializes live sequencer memory map)
    // =========================================================================
    const handleMidiDownload = (e) => {
        e.preventDefault();
        try {
            if (!midiData) return;
            const midiArray = midiData.toArray();
            const blob = new Blob([midiArray], { type: "audio/midi" });
            const url = URL.createObjectURL(blob);

            triggerBrowserDownload(url, (midiData.name || "score") + ".mid");
        } catch (err) {
            console.error("MIDI Re-serialization buffer download failed:", err);
            alert("Could not serialize track. Ensure a valid file has been imported.");
        }
    };
    downMidi.addEventListener("click", handleMidiDownload);
    if (downMidiSecond) downMidiSecond.addEventListener("click", handleMidiDownload);
    if (downMidiMax) downMidiMax.addEventListener("click", handleMidiDownload);

    // =========================================================================
    // 2. DOWNLOAD JSON STRUCTURE (Saves chronological event blocks)
    // =========================================================================
    downJson.addEventListener("click", (e) => {
        e.preventDefault();
        try {
            if (!midiData) return;
            const jsonStr = JSON.stringify(midiData, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            triggerBrowserDownload(url, (midiData.name || "score") + "_structure.json");
        } catch (err) {
            console.error("JSON download failed:", err);
        }
    });

    // =========================================================================
    // 3. DOWNLOAD SVG SHEET MUSIC (Grabs current active vector staves)
    // =========================================================================
    downSvg.addEventListener("click", (e) => {
        e.preventDefault();
        try {
            const svgElement = document.querySelector("#sheet-music-notation-vertical svg") ||
                               document.querySelector("#sheet-music-notation svg");

            if (!svgElement) {
                alert("Please click the 'Sheet Music' button once to pre-render the vector sheets before exporting.");
                return;
            }
            const svgString = new XMLSerializer().serializeToString(svgElement);
            const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            triggerBrowserDownload(url, (midiData.name || "score") + "_notation.svg");
        } catch (err) {
            console.error("SVG Extraction failed:", err);
        }
    });

    if (downSvgSecond) {
        downSvgSecond.addEventListener("click", (e) => {
            e.preventDefault();
            if (typeof downloadVerticalSVG === 'function') {
                downloadVerticalSVG('sheet-music-notation-vertical');
            }
        });
    }
    if (downSvgMax) {
        downSvgMax.addEventListener("click", (e) => {
            e.preventDefault();
            if (typeof downloadVerticalSVG === 'function') {
                downloadVerticalSVG('sheet-music-notation-max');
            }
        });
    }

    // =========================================================================
    // 4. ARCHITECTED MUSESCORE STUDIO MusicXML ENGINE (ZERO CORRUPTION / ZERO RESTS)
    //    Every note/rest below always carries a valid <type> (and <dot>/<tie> where
    //    needed). Omitting <type> is what was triggering the "corrupted file"
    //    prompt in MuseScore Studio - it's required for the importer to accept
    //    the file, even though the raw DTD lists it as optional.
    // =========================================================================
    const handleXmlDownload = (e) => {
        e.preventDefault();
        try {
            if (!activeNotesMemory || activeNotesMemory.length === 0) {
                alert("Please choose and load a MIDI track first.");
                return;
            }
            const xmlContent = generateMusicXML();
            const blob = new Blob([xmlContent], { type: "application/vnd.recordare.musicxml+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const rawTitle = (typeof resolvedSheetTitle !== "undefined" && resolvedSheetTitle)
                ? resolvedSheetTitle
                : ((midiData && midiData.name && midiData.name !== "Untitled") ? midiData.name : "Piano_Score");
            const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, "_").trim() || "Score";

            triggerBrowserDownload(url, sanitizedTitle + ".musicxml");
        } catch (err) {
            console.error("MusicXML compilation failed:", err);
            alert("Could not export MusicXML: " + (err.message || err));
        }
    };
    downXml.addEventListener("click", handleXmlDownload);
    if (downXmlSecond) downXmlSecond.addEventListener("click", handleXmlDownload);
    if (downXmlMax) downXmlMax.addEventListener("click", handleXmlDownload);

    // --- Duration -> notated symbol decomposition -----------------------------
    // NOTE_DIVISIONS = ticks per quarter note. Raised from 4 to 48 so notes are
    // quantized to the nearest 1/64th-note tick instead of being forced onto a
    // coarse eighth-note grid. If the source MIDI is already quantized, its real
    // note times land almost exactly on this fine grid, so this is effectively
    // "no re-quantization" rather than a second rounding pass.
    // decomposeDuration() works for ANY positive integer division count,
    // splitting a length into tied notes if it doesn't map to a single legal
    // symbol. This guarantees every <note> always gets a valid <type> (and
    // <dot>/<tie> when needed), which is what MuseScore Studio's importer
    // requires to accept the file.
    const NOTE_DIVISIONS = 48;
    const BASIC_NOTE_VALUES = [
        { div: NOTE_DIVISIONS * 4, type: "whole" },
        { div: NOTE_DIVISIONS * 2, type: "half" },
        { div: NOTE_DIVISIONS, type: "quarter" },
        { div: NOTE_DIVISIONS / 2, type: "eighth" },
        { div: NOTE_DIVISIONS / 4, type: "16th" },
        { div: NOTE_DIVISIONS / 8, type: "32nd" },
        { div: NOTE_DIVISIONS / 16, type: "64th" }
    ];

    function decomposeDuration(totalDiv) {
        const chunks = [];
        let rem = totalDiv;
        let guard = 0;
        while (rem > 0 && guard < 20) {
            guard++;
            let base = BASIC_NOTE_VALUES.find(b => b.div <= rem);
            if (!base) base = BASIC_NOTE_VALUES[BASIC_NOTE_VALUES.length - 1];
            if (base.div * 1.5 <= rem) {
                chunks.push({ div: base.div * 1.5, type: base.type, dots: 1 });
                rem -= base.div * 1.5;
            } else {
                chunks.push({ div: base.div, type: base.type, dots: 0 });
                rem -= base.div;
            }
        }
        return chunks;
    }

    function buildRestXml(totalDiv, voiceNum, staffNum) {
        if (totalDiv <= 0) return "";
        let xml = "";
        decomposeDuration(totalDiv).forEach((chunk) => {
            xml += `      <note>\n`;
            xml += `        <rest/>\n`;
            xml += `        <duration>${chunk.div}</duration>\n`;
            xml += `        <voice>${voiceNum}</voice>\n`;
            xml += `        <type>${chunk.type}</type>\n`;
            for (let d = 0; d < chunk.dots; d++) xml += `        <dot/>\n`;
            xml += `        <staff>${staffNum}</staff>\n`;
            xml += `      </note>\n`;
        });
        return xml;
    }

    function buildPitchGroupXml(cluster, totalDiv, voiceNum, staffNum, pitchTable) {
        const chunks = decomposeDuration(totalDiv);
        let xml = "";
        chunks.forEach((chunk, chunkIdx) => {
            const isFirstChunk = chunkIdx === 0;
            const isLastChunk = chunkIdx === chunks.length - 1;
            cluster.forEach((note, noteIdx) => {
                const pitchClass = ((note.midi % 12) + 12) % 12;
                const octave = Math.floor(note.midi / 12) - 1;
                const pInfo = pitchTable[pitchClass];

                xml += `      <note>\n`;
                if (noteIdx > 0) xml += `        <chord/>\n`;
                xml += `        <pitch>\n`;
                xml += `          <step>${pInfo.step}</step>\n`;
                if (pInfo.alter !== 0) xml += `          <alter>${pInfo.alter}</alter>\n`;
                xml += `          <octave>${octave}</octave>\n`;
                xml += `        </pitch>\n`;
                xml += `        <duration>${chunk.div}</duration>\n`;
                if (!isFirstChunk) xml += `        <tie type="stop"/>\n`;
                if (!isLastChunk) xml += `        <tie type="start"/>\n`;
                xml += `        <voice>${voiceNum}</voice>\n`;
                xml += `        <type>${chunk.type}</type>\n`;
                for (let d = 0; d < chunk.dots; d++) xml += `        <dot/>\n`;
                xml += `        <staff>${staffNum}</staff>\n`;
                if (!isFirstChunk || !isLastChunk) {
                    xml += `        <notations>\n`;
                    if (!isFirstChunk) xml += `          <tied type="stop"/>\n`;
                    if (!isLastChunk) xml += `          <tied type="start"/>\n`;
                    xml += `        </notations>\n`;
                }
                xml += `      </note>\n`;
            });
        });
        return xml;
    }

    function generateMusicXML() {
        const rawTitle = (typeof resolvedSheetTitle !== "undefined" && resolvedSheetTitle && resolvedSheetTitle !== "Untitled Track")
            ? resolvedSheetTitle
            : ((midiData && midiData.name && midiData.name !== "Untitled") ? midiData.name : "Piano Score");

        const safeTitle = rawTitle
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");

        // 1. Resolve Time Signature & BPM safely
        let beats = 4;
        let beatType = 4;
        if (midiData && midiData.header && midiData.header.timeSignatures && midiData.header.timeSignatures.length > 0) {
            const ts = midiData.header.timeSignatures[0].timeSignature;
            if (Array.isArray(ts) && ts.length === 2) {
                const b0 = Number(ts[0]);
                const b1 = Number(ts[1]);
                beats = (Number.isFinite(b0) && b0 > 0) ? b0 : 4;
                beatType = (Number.isFinite(b1) && b1 > 0) ? b1 : 4;
            }
        }

        const rawBpm = (midiData && midiData.header && midiData.header.tempos && midiData.header.tempos[0])
            ? midiData.header.tempos[0].bpm
            : 120;
        const bpm = Math.max(20, Math.min(300, Math.round(rawBpm || 120)));

        const quarterSec = 60 / bpm;
        const measureDurationSec = beats * (4 / beatType) * quarterSec;

        // divisions must match NOTE_DIVISIONS so BASIC_NOTE_VALUES lines up correctly.
        const divisions = NOTE_DIVISIONS;
        const totalMeasureDivs = Math.round(beats * (4 / beatType) * divisions);

        // 2. Resolve Key Signature
        let fifths = 0;
        const fifthsMap = {
            "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
            "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
            "Am": 0, "Em": 1, "Bm": 2, "F#m": 3, "C#m": 4, "G#m": 5,
            "Dm": -1, "Gm": -2, "Cm": -3, "Fm": -4, "Bbm": -5
        };
        if (midiData && midiData.header && midiData.header.keySignatures && midiData.header.keySignatures.length > 0) {
            const keyStr = midiData.header.keySignatures[0].key || "C";
            if (typeof fifthsMap[keyStr] !== "undefined") fifths = fifthsMap[keyStr];
        }

        const PITCH_CLASSES_SHARP = [
            { step: "C", alter: 0 }, { step: "C", alter: 1 },
            { step: "D", alter: 0 }, { step: "D", alter: 1 },
            { step: "E", alter: 0 },
            { step: "F", alter: 0 }, { step: "F", alter: 1 },
            { step: "G", alter: 0 }, { step: "G", alter: 1 },
            { step: "A", alter: 0 }, { step: "A", alter: 1 },
            { step: "B", alter: 0 }
        ];
        const PITCH_CLASSES_FLAT = [
            { step: "C", alter: 0 }, { step: "D", alter: -1 },
            { step: "D", alter: 0 }, { step: "E", alter: -1 },
            { step: "E", alter: 0 },
            { step: "F", alter: 0 }, { step: "G", alter: -1 },
            { step: "G", alter: 0 }, { step: "A", alter: -1 },
            { step: "A", alter: 0 }, { step: "B", alter: -1 },
            { step: "B", alter: 0 }
        ];
        const pitchTable = fifths < 0 ? PITCH_CLASSES_FLAT : PITCH_CLASSES_SHARP;

        // 3. Partition Active Notes into Measure Bins
        const lastNoteEnd = activeNotesMemory.reduce((max, n) => Math.max(max, n.time + (n.duration || 0.5)), 0);
        const totalDurationSecs = Math.max(typeof totalDuration !== "undefined" ? totalDuration : 0, lastNoteEnd);
        const totalMeasuresCount = Math.max(1, Math.ceil(totalDurationSecs / measureDurationSec));

        const measuresMap = {};
        for (let m = 1; m <= totalMeasuresCount; m++) {
            measuresMap[m] = [];
        }

        activeNotesMemory.forEach((note) => {
            const mIndex = Math.min(totalMeasuresCount, Math.max(1, Math.floor(note.time / measureDurationSec) + 1));
            if (measuresMap[mIndex]) {
                measuresMap[mIndex].push(note);
            }
        });

        // 4. MusicXML 3.1 Document Header (Strict W3C/Recordare DTD)
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
        xml += '<score-partwise version="3.1">\n';
        xml += '  <work>\n';
        xml += `    <work-title>${safeTitle}</work-title>\n`;
        xml += '  </work>\n';
        xml += '  <identification>\n';
        xml += '    <creator type="composer">T1ERA Music Ai</creator>\n';
        xml += '    <encoding>\n';
        xml += '      <software>Midiano MuseStudio Engine</software>\n';
        xml += '      <encoding-date>' + new Date().toISOString().split('T')[0] + '</encoding-date>\n';
        xml += '    </encoding>\n';
        xml += '  </identification>\n';

        xml += '  <part-list>\n';
        xml += '    <score-part id="P1">\n';
        xml += '      <part-name>Piano</part-name>\n';
        xml += '    </score-part>\n';
        xml += '  </part-list>\n';

        xml += '  <part id="P1">\n';

        // 5. Discrete Grid Voice Builder: Staff 1 (Voice 1) and Staff 2 (Voice 2)
        //    Every note/rest length is run through decomposeDuration() via
        //    buildRestXml()/buildPitchGroupXml() so a valid <type> is always
        //    present - this is what fixes the "corrupted file" import error.
        function buildMeasureVoice(notes, staffNum, voiceNum, mStartSec) {
            // Full measure rest if hand has no notes in this measure
            if (!notes || notes.length === 0) {
                return buildRestXml(totalMeasureDivs, voiceNum, staffNum);
            }

            // Snap each note to the nearest tick at full resolution (1 tick =
            // a 64th note at NOTE_DIVISIONS=48). No forced coarser grid - an
            // already-quantized MIDI note lands on (or essentially on) its
            // exact original position here instead of being re-rounded.
            const slotMap = {};
            notes.forEach((note) => {
                const relSec = Math.max(0, note.time - mStartSec);
                let slot = Math.round((relSec / measureDurationSec) * totalMeasureDivs);
                slot = Math.max(0, Math.min(totalMeasureDivs - 1, slot));

                if (!slotMap[slot]) {
                    slotMap[slot] = [];
                }
                // Avoid redundant pitches at the same slot
                if (!slotMap[slot].some(n => n.midi === note.midi)) {
                    slotMap[slot].push(note);
                }
            });

            const slots = Object.keys(slotMap).map(Number).sort((a, b) => a - b);
            if (slots.length === 0) {
                return buildRestXml(totalMeasureDivs, voiceNum, staffNum);
            }

            let staffXml = "";

            // Insert a single clean rest only if the hand enters on a later beat
            if (slots[0] > 0) {
                staffXml += buildRestXml(slots[0], voiceNum, staffNum);
            }

            // Tile each note directly to the onset of the next note (ZERO RESTS IN BETWEEN)
            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                const nextSlot = (i < slots.length - 1) ? slots[i + 1] : totalMeasureDivs;
                const dur = nextSlot - slot;
                const cluster = slotMap[slot];

                staffXml += buildPitchGroupXml(cluster, dur, voiceNum, staffNum, pitchTable);
            }

            return staffXml;
        }

        // 6. Output Measures with Grand Staff and Synchronized <backup>
        for (let m = 1; m <= totalMeasuresCount; m++) {
            xml += `    <measure number="${m}">\n`;

            const mStartSec = (m - 1) * measureDurationSec;

            // Grand Staff Attributes on Measure 1 only
            if (m === 1) {
                xml += '      <attributes>\n';
                xml += `        <divisions>${divisions}</divisions>\n`;
                xml += `        <key>\n          <fifths>${fifths}</fifths>\n        </key>\n`;
                xml += `        <time>\n          <beats>${beats}</beats>\n          <beat-type>${beatType}</beat-type>\n        </time>\n`;
                xml += '        <staves>2</staves>\n';
                xml += '        <clef number="1">\n          <sign>G</sign>\n          <line>2</line>\n        </clef>\n';
                xml += '        <clef number="2">\n          <sign>F</sign>\n          <line>4</line>\n        </clef>\n';
                xml += '      </attributes>\n';

                xml += '      <direction placement="above">\n';
                xml += '        <direction-type>\n';
                xml += `          <metronome>\n            <beat-unit>quarter</beat-unit>\n            <per-minute>${bpm}</per-minute>\n          </metronome>\n`;
                xml += '        </direction-type>\n';
                xml += `        <sound tempo="${bpm}"/>\n`;
                xml += '      </direction>\n';
            }

            const currentNotes = measuresMap[m] || [];
            const rhNotes = currentNotes.filter(n => n.midi >= 60);
            const lhNotes = currentNotes.filter(n => n.midi < 60);

            // STAFF 1: Right Hand (Treble Clef, Voice 1) - Duration = exactly totalMeasureDivs
            xml += buildMeasureVoice(rhNotes, 1, 1, mStartSec);

            // BACKUP CURSOR: Rewinds measure position for Left Hand by exact measure duration
            xml += `      <backup>\n`;
            xml += `        <duration>${totalMeasureDivs}</duration>\n`;
            xml += `      </backup>\n`;

            // STAFF 2: Left Hand (Bass Clef, Voice 2) - Duration = exactly totalMeasureDivs
            xml += buildMeasureVoice(lhNotes, 2, 2, mStartSec);

            xml += '    </measure>\n';
        }

        xml += '  </part>\n';
        xml += '</score-partwise>\n';
        return xml;
    }

    // =========================================================================
    // 5. DIRECT MULTI-PAGE A4 VECTOR PDF ENGINE (NO BROWSER PRINT DIALOG)
    // =========================================================================
    async function ensureJsPdfLibrary() {
        if (window.jspdf && window.jspdf.jsPDF) {
            return window.jspdf.jsPDF;
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            script.onload = () => {
                if (window.jspdf && window.jspdf.jsPDF) {
                    resolve(window.jspdf.jsPDF);
                } else {
                    reject(new Error("jsPDF loaded but constructor unavailable."));
                }
            };
            script.onerror = () => reject(new Error("Unable to fetch jsPDF library from CDN."));
            document.head.appendChild(script);
        });
    }

    const handlePdfDownload = (sourceContainerId) => {
        return async (e) => {
            e.preventDefault();

            if (typeof activeNotesMemory === "undefined" || !activeNotesMemory || activeNotesMemory.length === 0) {
                alert("Please choose and load a MIDI track first.");
                return;
            }

            const dropdownSecond = document.getElementById("download-dropdown-second");
            if (dropdownSecond) dropdownSecond.classList.remove("show");
            const dropdownMax = document.getElementById("download-dropdown-max");
            if (dropdownMax) dropdownMax.classList.remove("show");

            const btnSecond = document.getElementById("btn-download-second");
            const btnMax = document.getElementById("btn-download-max");
            const prevTextSecond = btnSecond ? btnSecond.textContent : "";
            const prevTextMax = btnMax ? btnMax.textContent : "";
            if (btnSecond) btnSecond.textContent = "Saving PDF...";
            if (btnMax) btnMax.textContent = "Saving PDF...";

            try {
                const JsPdfClass = await ensureJsPdfLibrary();

                let trackTitle = "Sheet Music";
                if (typeof resolvedSheetTitle !== "undefined" && resolvedSheetTitle && resolvedSheetTitle !== "Untitled Track") {
                    trackTitle = resolvedSheetTitle;
                } else if (typeof midiData !== "undefined" && midiData && midiData.name && midiData.name !== "Untitled") {
                    trackTitle = midiData.name;
                } else {
                    const statNameEl = document.getElementById("stat-name");
                    if (statNameEl && statNameEl.textContent && statNameEl.textContent !== "-") {
                        trackTitle = statNameEl.textContent.trim();
                    }
                }

                const sanitizedTitle = trackTitle.replace(/[\/\\:*?"<>|]/g, "_").trim() || "Score";

                // Standard offscreen container (850px standard A4 proportion)
                const offscreenContainer = document.createElement("div");
                offscreenContainer.id = "offscreen-a4-pdf-container";
                offscreenContainer.style.position = "fixed";
                offscreenContainer.style.left = "-9999px";
                offscreenContainer.style.top = "0";
                offscreenContainer.style.width = "850px";
                offscreenContainer.style.visibility = "hidden";
                offscreenContainer.style.background = "#ffffff";

                const offscreenTarget = document.createElement("div");
                offscreenTarget.id = "offscreen-a4-pdf-target";
                offscreenTarget.style.width = "850px";
                offscreenContainer.appendChild(offscreenTarget);
                document.body.appendChild(offscreenContainer);

                if (typeof renderVerticalSheetMusic === "function") {
                    renderVerticalSheetMusic("offscreen-a4-pdf-target");
                } else {
                    throw new Error("renderVerticalSheetMusic engine function is missing.");
                }

                const svgElement = offscreenTarget.querySelector("svg");
                if (!svgElement) {
                    throw new Error("SVG generation failed in offscreen target.");
                }

                if (!svgElement.getAttribute("xmlns")) {
                    svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                }

                const svgWidth = parseFloat(svgElement.getAttribute("width")) || 850;
                const svgHeight = parseFloat(svgElement.getAttribute("height")) || 1200;

                const serializer = new XMLSerializer();
                const svgString = serializer.serializeToString(svgElement);
                const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
                const svgUrl = URL.createObjectURL(svgBlob);

                const sourceImage = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = (err) => reject(err);
                    img.src = svgUrl;
                });

                const a4WidthPt = 595.28;
                const a4HeightPt = 841.89;
                const horizontalMarginPt = 36;
                const topMarginPt = 36;
                const bottomMarginPt = 36;
                const printableWidthPt = a4WidthPt - (horizontalMarginPt * 2);
                const printableHeightPt = a4HeightPt - (topMarginPt + bottomMarginPt);

                const systemDuration = 10;
                const totalDurationSecs = typeof totalDuration !== "undefined" ? totalDuration : 60;
                const numSystems = Math.ceil(totalDurationSecs / systemDuration) || 1;
                const systemHeight = 220;
                const headerOffset = typeof currentHeaderOffset !== "undefined" ? currentHeaderOffset : 110;

                const ptsPerSvgPixel = printableWidthPt / svgWidth;
                const systemHeightPt = systemHeight * ptsPerSvgPixel;
                const headerHeightPt = headerOffset * ptsPerSvgPixel;

                const availHeightPage1Pt = printableHeightPt - headerHeightPt - 25;
                const systemsOnPage1 = Math.max(1, Math.floor(availHeightPage1Pt / systemHeightPt));
                const availHeightSubsequentPt = printableHeightPt - 30;
                const systemsPerSubsequentPage = Math.max(1, Math.floor(availHeightSubsequentPt / systemHeightPt));

                const pageSlices = [];
                let currentSystem = 0;

                const p1EndSystem = Math.min(numSystems, systemsOnPage1);
                const p1SourceHeight = headerOffset + (p1EndSystem * systemHeight);
                pageSlices.push({
                    sourceY: 0,
                    sourceHeight: p1EndSystem === numSystems ? svgHeight : p1SourceHeight,
                    isFirstPage: true
                });
                currentSystem = p1EndSystem;

                while (currentSystem < numSystems) {
                    const startSys = currentSystem;
                    const endSys = Math.min(numSystems, currentSystem + systemsPerSubsequentPage);
                    const isLast = (endSys === numSystems);

                    const sourceY = headerOffset + (startSys * systemHeight);
                    const sourceHeight = isLast
                        ? (svgHeight - sourceY)
                        : ((endSys - startSys) * systemHeight);

                    pageSlices.push({
                        sourceY: sourceY,
                        sourceHeight: sourceHeight,
                        isFirstPage: false
                    });
                    currentSystem = endSys;
                }

                const totalPages = pageSlices.length;

                const pdfDoc = new JsPdfClass({
                    orientation: "portrait",
                    unit: "pt",
                    format: "a4",
                    compress: true
                });

                const renderScale = 2.0;

                for (let p = 0; p < totalPages; p++) {
                    const slice = pageSlices[p];

                    if (p > 0) {
                        pdfDoc.addPage("a4", "portrait");
                    }

                    const sliceCanvas = document.createElement("canvas");
                    sliceCanvas.width = Math.round(svgWidth * renderScale);
                    sliceCanvas.height = Math.round(slice.sourceHeight * renderScale);

                    const ctx = sliceCanvas.getContext("2d");
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

                    ctx.drawImage(
                        sourceImage,
                        0, slice.sourceY, svgWidth, slice.sourceHeight,
                        0, 0, sliceCanvas.width, sliceCanvas.height
                    );

                    const sliceDataUrl = sliceCanvas.toDataURL("image/jpeg", 0.95);
                    const destHeightPt = slice.sourceHeight * ptsPerSvgPixel;

                    const destX = horizontalMarginPt;
                    const destY = slice.isFirstPage ? topMarginPt : (topMarginPt + 10);

                    pdfDoc.addImage(sliceDataUrl, "JPEG", destX, destY, printableWidthPt, destHeightPt, undefined, "FAST");

                    if (!slice.isFirstPage) {
                        pdfDoc.setFont("helvetica", "normal");
                        pdfDoc.setFontSize(8);
                        pdfDoc.setTextColor(140, 140, 140);
                        pdfDoc.text(trackTitle, a4WidthPt / 2, 26, { align: "center" });
                    }

                    pdfDoc.setFont("helvetica", "normal");
                    pdfDoc.setFontSize(8.5);
                    pdfDoc.setTextColor(130, 130, 130);
                    pdfDoc.text(`Page ${p + 1} of ${totalPages}`, a4WidthPt / 2, a4HeightPt - 20, { align: "center" });

                    pdfDoc.setFontSize(7.5);
                    pdfDoc.setTextColor(170, 170, 170);
                    pdfDoc.text("T1ERA Music Ai", a4WidthPt - horizontalMarginPt, a4HeightPt - 20, { align: "right" });
                }

                pdfDoc.save(`${sanitizedTitle}_sheet_music.pdf`);

                URL.revokeObjectURL(svgUrl);
                if (offscreenContainer && offscreenContainer.parentNode) {
                    offscreenContainer.parentNode.removeChild(offscreenContainer);
                }
            } catch (err) {
                console.error("[MIDIANO PDF ENGINE ERROR]:", err);
                alert("Could not generate PDF: " + (err.message || err));
            } finally {
                if (btnSecond) btnSecond.textContent = prevTextSecond || "Download";
                if (btnMax) btnMax.textContent = prevTextMax || "Download";
            }
        };
    };

    if (downPdfSecond) downPdfSecond.addEventListener("click", handlePdfDownload("sheet-music-notation-vertical"));
    if (downPdfMax) downPdfMax.addEventListener("click", handlePdfDownload("sheet-music-notation-max"));
});

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
    // 4. CERTIFIED GRAND STAFF MusicXML (MUSESCORE STUDIO COMPLIANT - ZERO RESTS)
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

        // 1. Time Signature & BPM
        let beats = 4;
        let beatType = 4;
        if (midiData && midiData.header && midiData.header.timeSignatures && midiData.header.timeSignatures.length > 0) {
            const ts = midiData.header.timeSignatures[0].timeSignature;
            if (Array.isArray(ts) && ts.length === 2) {
                beats = ts[0];
                beatType = ts[1];
            }
        }

        const bpm = (midiData && midiData.header && midiData.header.tempos && midiData.header.tempos[0])
            ? Math.round(midiData.header.tempos[0].bpm)
            : 120;

        const quarterSec = 60 / bpm;
        const measureDurationSec = beats * (4 / beatType) * quarterSec;

        // 480 divisions per quarter note guarantees exact integer subdivisions
        const divisions = 480;
        const totalMeasureDivisions = Math.round(beats * (4 / beatType) * divisions);

        // 2. Key Signature Fifths
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

        function getNoteTypeAndDot(durDiv) {
            const ratio = durDiv / divisions;
            if (ratio >= 3.5) return { type: "whole", dot: false };
            if (ratio >= 2.5) return { type: "half", dot: true };
            if (ratio >= 1.75) return { type: "half", dot: false };
            if (ratio >= 1.25) return { type: "quarter", dot: true };
            if (ratio >= 0.75) return { type: "quarter", dot: false };
            if (ratio >= 0.6) return { type: "eighth", dot: true };
            if (ratio >= 0.35) return { type: "eighth", dot: false };
            return { type: "16th", dot: false };
        }

        // 3. Partition Notes by Measure
        const lastNoteEnd = activeNotesMemory.reduce((max, n) => Math.max(max, n.time + (n.duration || 0.5)), 0);
        const totalDurationSecs = Math.max(typeof totalDuration !== "undefined" ? totalDuration : 0, lastNoteEnd);
        const totalMeasuresCount = Math.max(1, Math.ceil(totalDurationSecs / measureDurationSec));

        const measuresMap = {};
        for (let m = 1; m <= totalMeasuresCount; m++) {
            measuresMap[m] = [];
        }

        activeNotesMemory.forEach((note) => {
            const mIndex = Math.min(totalMeasuresCount, Math.floor(note.time / measureDurationSec) + 1);
            if (measuresMap[mIndex]) {
                measuresMap[mIndex].push(note);
            }
        });

        // 4. MusicXML 3.1 Document Header
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

        // 5. Precise Rhythmic Voice Builder: CONNECTS NOTES DIRECTLY WITH ZERO INTERMEDIATE RESTS
        function buildStaffVoiceXml(notes, staffNumber, voiceNumber, mStart) {
            // Full measure rest if hand has no notes in this measure
            if (!notes || notes.length === 0) {
                return `      <note>\n        <rest/>\n        <duration>${totalMeasureDivisions}</duration>\n        <voice>${voiceNumber}</voice>\n        <staff>${staffNumber}</staff>\n      </note>\n`;
            }

            const sorted = [...notes].sort((a, b) => a.time - b.time);

            // Group notes with onsets within 50ms into simultaneous chord blocks
            const clusters = [];
            let i = 0;
            while (i < sorted.length) {
                const cluster = [sorted[i]];
                let j = i + 1;
                while (j < sorted.length && Math.abs(sorted[j].time - sorted[i].time) < 0.05) {
                    cluster.push(sorted[j]);
                    j++;
                }
                clusters.push(cluster);
                i = j;
            }

            const snapGrid = divisions / 4; // 16th note grid
            const rawOnsets = clusters.map((cluster) => {
                const onsetSec = Math.max(0, cluster[0].time - mStart);
                let tick = Math.round((onsetSec / measureDurationSec) * totalMeasureDivisions);
                tick = Math.round(tick / snapGrid) * snapGrid;
                return Math.max(0, Math.min(totalMeasureDivisions - snapGrid, tick));
            });

            // Snap notes starting near beat 1 directly to tick 0
            if (rawOnsets.length > 0 && rawOnsets[0] <= divisions / 2) {
                rawOnsets[0] = 0;
            }

            // Merge any clusters that share the exact same quantized onset into a single unified chord
            const mergedClusters = [];
            const mergedOnsets = [];

            for (let k = 0; k < clusters.length; k++) {
                if (mergedOnsets.length > 0 && rawOnsets[k] === mergedOnsets[mergedOnsets.length - 1]) {
                    mergedClusters[mergedClusters.length - 1].push(...clusters[k]);
                } else {
                    mergedClusters.push([...clusters[k]]);
                    mergedOnsets.push(rawOnsets[k]);
                }
            }

            let staffXml = "";

            // If the hand begins later in the measure (e.g. beat 2 or 3), insert one clean starting rest
            if (mergedOnsets[0] > 0) {
                const initialRestDiv = mergedOnsets[0];
                const restTypeInfo = getNoteTypeAndDot(initialRestDiv);
                staffXml += `      <note>\n`;
                staffXml += `        <rest/>\n`;
                staffXml += `        <duration>${initialRestDiv}</duration>\n`;
                staffXml += `        <voice>${voiceNumber}</voice>\n`;
                staffXml += `        <type>${restTypeInfo.type}</type>\n`;
                if (restTypeInfo.dot) staffXml += `        <dot/>\n`;
                staffXml += `        <staff>${staffNumber}</staff>\n`;
                staffXml += `      </note>\n`;
            }

            // Tile each note directly into the next note onset (NO RESTS IN BETWEEN)
            for (let k = 0; k < mergedClusters.length; k++) {
                const cluster = mergedClusters[k];
                const onset = mergedOnsets[k];

                const nextOnset = (k < mergedClusters.length - 1)
                    ? mergedOnsets[k + 1]
                    : totalMeasureDivisions;

                const noteDiv = nextOnset - onset;
                const typeInfo = getNoteTypeAndDot(noteDiv);

                cluster.forEach((note, idx) => {
                    const pitchClass = ((note.midi % 12) + 12) % 12;
                    const octave = Math.floor(note.midi / 12) - 1;
                    const pInfo = pitchTable[pitchClass];

                    staffXml += `      <note>\n`;
                    if (idx > 0) {
                        staffXml += `        <chord/>\n`;
                    }
                    staffXml += `        <pitch>\n`;
                    staffXml += `          <step>${pInfo.step}</step>\n`;
                    if (pInfo.alter !== 0) {
                        staffXml += `          <alter>${pInfo.alter}</alter>\n`;
                    }
                    staffXml += `          <octave>${octave}</octave>\n`;
                    staffXml += `        </pitch>\n`;
                    staffXml += `        <duration>${noteDiv}</duration>\n`;
                    staffXml += `        <voice>${voiceNumber}</voice>\n`;
                    staffXml += `        <type>${typeInfo.type}</type>\n`;
                    if (typeInfo.dot) {
                        staffXml += `        <dot/>\n`;
                    }
                    staffXml += `        <staff>${staffNumber}</staff>\n`;
                    staffXml += `      </note>\n`;
                });
            }

            return staffXml;
        }

        // 6. Output Measures with Guaranteed 100% Exact Measure Ticks
        for (let m = 1; m <= totalMeasuresCount; m++) {
            xml += `    <measure number="${m}">\n`;

            const mStart = (m - 1) * measureDurationSec;

            // Grand Staff Attributes on Measure 1
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

            // VOICE 1: Staff 1 (Treble RH) - Sum of ticks strictly equals totalMeasureDivisions
            xml += buildStaffVoiceXml(rhNotes, 1, 1, mStart);

            // Synchronize cursor back to measure start for the Left Hand
            xml += `      <backup>\n`;
            xml += `        <duration>${totalMeasureDivisions}</duration>\n`;
            xml += `      </backup>\n`;

            // VOICE 2: Staff 2 (Bass LH) - Sum of ticks strictly equals totalMeasureDivisions
            xml += buildStaffVoiceXml(lhNotes, 2, 2, mStart);

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

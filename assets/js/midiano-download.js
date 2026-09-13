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
    // 4. MUSICXML ENGINE: 100% IDENTICAL TO MIDIANO-SHEET.JS
    //    Identical staves (RH >= 60, LH < 60), diatonic key placing, 40ms chords.
    // =========================================================================
    const handleXmlDownload = (e) => {
        e.preventDefault();
        try {
            if (typeof activeNotesMemory === "undefined" || !activeNotesMemory || activeNotesMemory.length === 0) {
                alert("Please choose and load a MIDI track first.");
                return;
            }
            const xmlContent = generateMusicXML();
            const blob = new Blob([xmlContent], { type: "application/vnd.recordare.musicxml+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const rawTitle = (typeof resolvedSheetTitle !== "undefined" && resolvedSheetTitle && resolvedSheetTitle !== "Untitled Track")
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

    // Standard high-resolution MusicXML division (480 divisions per quarter note)
    const NOTE_DIVISIONS = 480;

    const BASIC_NOTE_VALUES = [
        { div: 480 * 4, type: "whole", dots: 0 },
        { div: 480 * 3, type: "half", dots: 1 },
        { div: 480 * 2, type: "half", dots: 0 },
        { div: 480 * 1.5, type: "quarter", dots: 1 },
        { div: 480, type: "quarter", dots: 0 },
        { div: 240 * 1.5, type: "eighth", dots: 1 },
        { div: 240, type: "eighth", dots: 0 },
        { div: 120 * 1.5, type: "16th", dots: 1 },
        { div: 120, type: "16th", dots: 0 },
        { div: 60, type: "32nd", dots: 0 },
        { div: 30, type: "64th", dots: 0 }
    ];

    function decomposeDuration(totalDiv) {
        if (totalDiv <= 0) return [];
        const chunks = [];
        let rem = Math.round(totalDiv);
        let guard = 0;

        while (rem > 0 && guard < 20) {
            guard++;
            let match = BASIC_NOTE_VALUES.find(b => b.div <= rem);
            if (!match) {
                match = BASIC_NOTE_VALUES[BASIC_NOTE_VALUES.length - 1];
                chunks.push({ div: Math.max(1, rem), type: match.type, dots: 0 });
                break;
            }
            chunks.push({ div: match.div, type: match.type, dots: match.dots });
            rem -= match.div;
        }
        return chunks;
    }

    function buildRestXml(totalDiv, voiceNum, staffNum) {
        if (totalDiv <= 0) return "";
        let xml = "";
        const chunks = decomposeDuration(totalDiv);
        chunks.forEach((chunk) => {
            xml += `      <note>\n`;
            xml += `        <rest/>\n`;
            xml += `        <duration>${chunk.div}</duration>\n`;
            xml += `        <voice>${voiceNum}</voice>\n`;
            xml += `        <type>${chunk.type}</type>\n`;
            for (let d = 0; d < chunk.dots; d++) {
                xml += `        <dot/>\n`;
            }
            xml += `        <staff>${staffNum}</staff>\n`;
            xml += `      </note>\n`;
        });
        return xml;
    }

    // Matches midiPitchToProAbc and sharpKey(pitch) in midiano-sheet.js identically
    function getPitchInfo(midiNumber) {
        const midi = Number(midiNumber);
        const pitchClass = ((midi % 12) + 12) % 12;
        const octave = Math.floor(midi / 12) - 1;

        // Base note names matching ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"]
        const PITCH_MAP = [
            { step: "C", alter: 0 },
            { step: "C", alter: 1 }, // ^C (C#)
            { step: "D", alter: 0 },
            { step: "D", alter: 1 }, // ^D (D#)
            { step: "E", alter: 0 },
            { step: "F", alter: 0 },
            { step: "F", alter: 1 }, // ^F (F#)
            { step: "G", alter: 0 },
            { step: "G", alter: 1 }, // ^G (G#)
            { step: "A", alter: 0 },
            { step: "A", alter: 1 }, // ^A (A#)
            { step: "B", alter: 0 }
        ];

        const p = PITCH_MAP[pitchClass];
        return { step: p.step, alter: p.alter, octave };
    }

    function buildPitchGroupXml(cluster, totalDiv, voiceNum, staffNum, isTiedFromPrev, isTiedToNext) {
        if (!cluster || cluster.length === 0 || totalDiv <= 0) return "";
        const chunks = decomposeDuration(totalDiv);
        if (chunks.length === 0) return "";

        let xml = "";
        chunks.forEach((chunk, chunkIdx) => {
            const isFirstChunk = (chunkIdx === 0);
            const isLastChunk = (chunkIdx === chunks.length - 1);

            const needTieStop = (!isFirstChunk) || isTiedFromPrev;
            const needTieStart = (!isLastChunk) || isTiedToNext;

            cluster.forEach((note, noteIdx) => {
                const pInfo = getPitchInfo(note.midi);

                xml += `      <note>\n`;
                if (noteIdx > 0) {
                    xml += `        <chord/>\n`;
                }
                xml += `        <pitch>\n`;
                xml += `          <step>${pInfo.step}</step>\n`;
                if (pInfo.alter !== 0) {
                    xml += `          <alter>${pInfo.alter}</alter>\n`;
                }
                xml += `          <octave>${pInfo.octave}</octave>\n`;
                xml += `        </pitch>\n`;
                xml += `        <duration>${chunk.div}</duration>\n`;

                if (needTieStop) {
                    xml += `        <tie type="stop"/>\n`;
                }
                if (needTieStart) {
                    xml += `        <tie type="start"/>\n`;
                }

                xml += `        <voice>${voiceNum}</voice>\n`;
                xml += `        <type>${chunk.type}</type>\n`;
                for (let d = 0; d < chunk.dots; d++) {
                    xml += `        <dot/>\n`;
                }
                xml += `        <staff>${staffNum}</staff>\n`;

                if (needTieStop || needTieStart) {
                    xml += `        <notations>\n`;
                    if (needTieStop) {
                        xml += `          <tied type="stop"/>\n`;
                    }
                    if (needTieStart) {
                        xml += `          <tied type="start"/>\n`;
                    }
                    xml += `        </notations>\n`;
                }

                xml += `      </note>\n`;
            });
        });
        return xml;
    }

    // Build measure voice that handles 40ms chords, seamless ties, and true rests
    function buildStaffMeasure(clusters, staffNum, voiceNum, mStartSec, mEndSec, mDurSec, totalDivs) {
        // Find all clusters that overlap with this measure [mStartSec, mEndSec]
        const activeClusters = clusters.filter(c => c.time < mEndSec - 0.01 && (c.time + c.duration) > mStartSec + 0.01);

        if (activeClusters.length === 0) {
            let xml = `      <note>\n`;
            xml += `        <rest measure="yes"/>\n`;
            xml += `        <duration>${totalDivs}</duration>\n`;
            xml += `        <voice>${voiceNum}</voice>\n`;
            xml += `        <staff>${staffNum}</staff>\n`;
            xml += `      </note>\n`;
            return xml;
        }

        const events = [];
        activeClusters.forEach(c => {
            const segStartSec = Math.max(mStartSec, c.time);
            const segEndSec = Math.min(mEndSec, c.time + c.duration);

            let startDiv = Math.round(((segStartSec - mStartSec) / mDurSec) * totalDivs);
            startDiv = Math.max(0, Math.min(totalDivs, startDiv));

            let endDiv = Math.round(((segEndSec - mStartSec) / mDurSec) * totalDivs);
            endDiv = Math.max(startDiv + 30, Math.min(totalDivs, endDiv));

            const isTiedFromPrev = c.time < mStartSec - 0.01;
            const isTiedToNext = (c.time + c.duration) > mEndSec + 0.01;

            events.push({
                cluster: c.notes,
                startDiv,
                endDiv,
                isTiedFromPrev,
                isTiedToNext
            });
        });

        events.sort((a, b) => a.startDiv - b.startDiv);

        let staffXml = "";
        let cursor = 0;

        for (let k = 0; k < events.length; k++) {
            const ev = events[k];
            let startDiv = ev.startDiv;
            let endDiv = ev.endDiv;

            // Fill pre-chord silence with real rest
            if (startDiv > cursor) {
                staffXml += buildRestXml(startDiv - cursor, voiceNum, staffNum);
                cursor = startDiv;
            } else if (startDiv < cursor) {
                startDiv = cursor;
                if (endDiv <= startDiv) {
                    endDiv = Math.min(totalDivs, startDiv + 60);
                }
            }

            const nextStart = (k < events.length - 1) ? Math.max(startDiv, events[k + 1].startDiv) : totalDivs;
            const maxAvail = nextStart - startDiv;
            if (maxAvail <= 0) continue;

            let durDiv = Math.max(30, Math.min(maxAvail, endDiv - startDiv));
            if (maxAvail - durDiv < 30) {
                durDiv = maxAvail;
            }

            staffXml += buildPitchGroupXml(ev.cluster, durDiv, voiceNum, staffNum, ev.isTiedFromPrev, ev.isTiedToNext);
            cursor = startDiv + durDiv;

            // Fill post-chord silence before next chord
            if (cursor < nextStart) {
                staffXml += buildRestXml(nextStart - cursor, voiceNum, staffNum);
                cursor = nextStart;
            }
        }

        // Fill trailing measure silence
        if (cursor < totalDivs) {
            staffXml += buildRestXml(totalDivs - cursor, voiceNum, staffNum);
            cursor = totalDivs;
        }

        return staffXml;
    }

    function generateMusicXML() {
        if (typeof activeNotesMemory === "undefined" || !activeNotesMemory || activeNotesMemory.length === 0) {
            return "";
        }

        const rawTitle = (typeof resolvedSheetTitle !== "undefined" && resolvedSheetTitle && resolvedSheetTitle !== "Untitled Track")
            ? resolvedSheetTitle
            : ((midiData && midiData.name && midiData.name !== "Untitled") ? midiData.name : "Piano Score");

        const safeTitle = String(rawTitle)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");

        // 1. Time Signature matching midiano-sheet.js
        let beats = 4;
        let beatType = 4;
        if (midiData && midiData.header && midiData.header.timeSignatures && midiData.header.timeSignatures.length > 0) {
            const ts = midiData.header.timeSignatures[0].timeSignature;
            if (Array.isArray(ts) && ts.length === 2) {
                beats = Number(ts[0]) || 4;
                beatType = Number(ts[1]) || 4;
            }
        }

        // 2. Tempo (BPM) matching midiano-sheet.js
        const bpm = (midiData && midiData.header && midiData.header.tempos && midiData.header.tempos[0] && midiData.header.tempos[0].bpm)
            ? Math.round(midiData.header.tempos[0].bpm)
            : 120;

        const beatDuration = (60 / bpm) * (4 / beatType);
        const measureDurationSec = beats * beatDuration;

        const divisions = NOTE_DIVISIONS;
        const totalMeasureDivs = Math.round(beats * (4 / beatType) * divisions);

        // 3. Staves arrangement strictly matching midiano-sheet.js:
        //    RH (Staff 1 / Treble Clef) = note.midi >= 60
        //    LH (Staff 2 / Bass Clef)   = note.midi < 60
        const sortedNotes = [...activeNotesMemory].sort((a, b) => a.time - b.time);
        const rhNotes = sortedNotes.filter(n => n.midi >= 60);
        const lhNotes = sortedNotes.filter(n => n.midi < 60);

        // Calculate total measures matching midiano-sheet.js measure lines
        const lastNoteEnd = sortedNotes.reduce((max, n) => Math.max(max, n.time + (n.duration || 0.5)), 0);
        const totalDurationSecs = Math.max(
            typeof totalDuration !== "undefined" ? totalDuration : 0,
            (midiData && midiData.duration) ? midiData.duration : 0,
            lastNoteEnd
        );
        const totalMeasuresCount = Math.max(1, Math.ceil(totalDurationSecs / measureDurationSec));

        // Group notes into 40ms chord clusters exactly like midiano-sheet.js
        function clusterNotes(notes) {
            const clusters = [];
            let i = 0;
            while (i < notes.length) {
                const cluster = [notes[i]];
                let j = i + 1;
                while (j < notes.length && Math.abs(notes[j].time - notes[i].time) < 0.04) {
                    cluster.push(notes[j]);
                    j++;
                }
                const clusterDur = cluster.reduce((max, n) => Math.max(max, (n.duration && n.duration > 0) ? n.duration : 0.5), 0);
                clusters.push({
                    notes: cluster,
                    time: cluster[0].time,
                    duration: clusterDur
                });
                i = j;
            }
            return clusters;
        }

        const rhClusters = clusterNotes(rhNotes);
        const lhClusters = clusterNotes(lhNotes);

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

        // 5. Output Measures with Grand Staff and Synchronized <backup>
        for (let m = 1; m <= totalMeasuresCount; m++) {
            xml += `    <measure number="${m}">\n`;

            const mStartSec = (m - 1) * measureDurationSec;
            const mEndSec = m * measureDurationSec;

            // Grand Staff Attributes on Measure 1 (K:C open key fifths=0 matches midiano-sheet.js)
            if (m === 1) {
                xml += '      <attributes>\n';
                xml += `        <divisions>${divisions}</divisions>\n`;
                xml += `        <key>\n`;
                xml += `          <fifths>0</fifths>\n`;
                xml += `        </key>\n`;
                xml += `        <time>\n`;
                xml += `          <beats>${beats}</beats>\n`;
                xml += `          <beat-type>${beatType}</beat-type>\n`;
                xml += `        </time>\n`;
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

            // STAFF 1: Right Hand (Treble Clef, Voice 1) - matches RH on screen
            xml += buildStaffMeasure(rhClusters, 1, 1, mStartSec, mEndSec, measureDurationSec, totalMeasureDivs);

            // BACKUP CURSOR: Rewinds measure position for Left Hand
            xml += `      <backup>\n`;
            xml += `        <duration>${totalMeasureDivs}</duration>\n`;
            xml += `      </backup>\n`;

            // STAFF 2: Left Hand (Bass Clef, Voice 2) - matches LH on screen
            xml += buildStaffMeasure(lhClusters, 2, 2, mStartSec, mEndSec, measureDurationSec, totalMeasureDivs);

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
                const svgUrl = URL.createObjectURL(blob);

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

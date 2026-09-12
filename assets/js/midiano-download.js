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

    // 1. DOWNLOAD MIDI FILE (Re-serializes live sequencer memory map)
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

    // 2. DOWNLOAD JSON STRUCTURE (Saves chronological event blocks)
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

    // 3. DOWNLOAD SVG SHEET MUSIC (Grabs current active vector staves)
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

    // Section 2 and Max view SVG downloads
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

    // 4. DOWNLOAD MusicXML SHEET (Procedurally converts notes array into structured XML staves)
    const handleXmlDownload = (e) => {
        e.preventDefault();
        try {
            if (!activeNotesMemory || activeNotesMemory.length === 0) return;
            const xmlContent = generateMusicXML();
            const blob = new Blob([xmlContent], { type: "application/vnd.recordare.musicxml+xml" });
            const url = URL.createObjectURL(blob);
            
            triggerBrowserDownload(url, (midiData.name || "score") + ".musicxml");
        } catch (err) {
            console.error("MusicXML compilation failed:", err);
        }
    };
    downXml.addEventListener("click", handleXmlDownload);
    if (downXmlSecond) downXmlSecond.addEventListener("click", handleXmlDownload);
    if (downXmlMax) downXmlMax.addEventListener("click", handleXmlDownload);

    // Procedural MusicXML Generator Engine
    function generateMusicXML() {
        let xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
        xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
        xml += '<score-partwise version="3.0">\n';
        xml += '  <work>\n';
        xml += `    <work-title>${midiData.name || "Untitled Score"}</work-title>\n`;
        xml += '  </work>\n';
        xml += '  <part-list>\n';
        xml += '    <score-part id="P1">\n';
        xml += '      <part-name>Piano</part-name>\n';
        xml += '    </score-part>\n';
        xml += '  </part-list>\n';
        xml += '  <part id="P1">\n';
        
        const measureDuration = 4.0; 
        const measuresMap = {};
        
        activeNotesMemory.forEach((note) => {
            const mIndex = Math.floor(note.time / measureDuration) + 1;
            if (!measuresMap[mIndex]) {
                measuresMap[mIndex] = [];
            }
            measuresMap[mIndex].push(note);
        });
        
        const measureKeys = Object.keys(measuresMap).sort((a, b) => a - b);
        const totalMeasuresCount = measureKeys.length > 0 ? Math.max(...measureKeys.map(Number)) : 1;
        
        for (let i = 1; i <= totalMeasuresCount; i++) {
            xml += `    <measure number="${i}">\n`;
            
            if (i === 1) {
                xml += '      <attributes>\n';
                xml += '        <divisions>256</divisions>\n';
                xml += '        <key>\n';
                xml += '          <fifths>0</fifths>\n';
                xml += '        </key>\n';
                xml += '        <time>\n';
                xml += '          <beats>4</beats>\n';
                xml += '          <beat-type>4</beat-type>\n';
                xml += '        </time>\n';
                xml += '        <clef>\n';
                xml += '          <sign>G</sign>\n';
                xml += '          <line>2</line>\n';
                xml += '        </clef>\n';
                xml += '      </attributes>\n';
            }
            
            const currentMeasureNotes = measuresMap[i] || [];
            currentMeasureNotes.forEach((note) => {
                const stepChar = note.name.charAt(0);
                const isSharp = note.name.includes('#');
                const octaveIndex = note.name.match(/\d+/)?.[0] || '4';
                const xmlDivisionsDuration = Math.round(note.duration * 256);
                
                xml += '      <note>\n';
                xml += '        <pitch>\n';
                xml += `          <step>${stepChar}</step>\n`;
                if (isSharp) {
                    xml += '          <alter>1</alter>\n';
                }
                xml += `          <octave>${octaveIndex}</octave>\n`;
                xml += '        </pitch>\n';
                xml += `        <duration>${xmlDivisionsDuration}</duration>\n`;
                xml += '        <voice>1</voice>\n';
                xml += '        <type>quarter</type>\n';
                xml += '      </note>\n';
            });
            
            xml += '    </measure>\n';
        }
        
        xml += '  </part>\n';
        xml += '</score-partwise>\n';
        return xml;
    }

    // =========================================================================
    // 5. DIRECT MULTI-PAGE A4 VECTOR PDF ENGINE (NO BROWSER PRINT DIALOG)
    // =========================================================================

    // Fallback dynamic loader if jsPDF script wasn't cached in head
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

            // Close any open dropdown menu
            const dropdownSecond = document.getElementById("download-dropdown-second");
            if (dropdownSecond) dropdownSecond.classList.remove("show");
            const dropdownMax = document.getElementById("download-dropdown-max");
            if (dropdownMax) dropdownMax.classList.remove("show");

            // Temporary visual indicator on buttons during generation
            const btnSecond = document.getElementById("btn-download-second");
            const btnMax = document.getElementById("btn-download-max");
            const prevTextSecond = btnSecond ? btnSecond.textContent : "";
            const prevTextMax = btnMax ? btnMax.textContent : "";
            if (btnSecond) btnSecond.textContent = "Saving PDF...";
            if (btnMax) btnMax.textContent = "Saving PDF...";

            try {
                const JsPdfClass = await ensureJsPdfLibrary();

                // 1. Resolve Track Title
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

                // Clean title for safe filesystem filename
                const sanitizedTitle = trackTitle.replace(/[\/\\:*?"<>|]/g, "_").trim() || "Score";

                // 2. Render to a standardized offscreen A4 container (width: 850px)
                // This ensures maximized (1600px+) or phone screens (360px) don't distort staff proportions in the PDF.
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

                // Render into offscreen target with standard A4 desktop proportions
                if (typeof renderVerticalSheetMusic === "function") {
                    renderVerticalSheetMusic("offscreen-a4-pdf-target");
                } else {
                    throw new Error("renderVerticalSheetMusic engine function is missing.");
                }

                const svgElement = offscreenTarget.querySelector("svg");
                if (!svgElement) {
                    throw new Error("SVG generation failed in offscreen target.");
                }

                // Guarantee valid XML namespace for rasterization
                if (!svgElement.getAttribute("xmlns")) {
                    svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                }

                const svgWidth = parseFloat(svgElement.getAttribute("width")) || 850;
                const svgHeight = parseFloat(svgElement.getAttribute("height")) || 1200;

                // 3. Serialize SVG into an Image Object
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

                // 4. Calculate Slicing & Pagination Metrics
                // Standard A4 dimensions in PDF points (72 points/inch)
                const a4WidthPt = 595.28;
                const a4HeightPt = 841.89;
                const horizontalMarginPt = 36; // 0.5 in
                const topMarginPt = 36;
                const bottomMarginPt = 36;
                const printableWidthPt = a4WidthPt - (horizontalMarginPt * 2);  // 523.28 pt
                const printableHeightPt = a4HeightPt - (topMarginPt + bottomMarginPt); // 769.89 pt

                // System layout metrics from midiano-sheet.js
                const systemDuration = 10;
                const totalDurationSecs = typeof totalDuration !== "undefined" ? totalDuration : 60;
                const numSystems = Math.ceil(totalDurationSecs / systemDuration) || 1;
                const systemHeight = 220; // Height of each staff system at scale 1.0
                const headerOffset = typeof currentHeaderOffset !== "undefined" ? currentHeaderOffset : 110;

                // Scale ratio between PDF points and SVG pixels
                const ptsPerSvgPixel = printableWidthPt / svgWidth;
                const systemHeightPt = systemHeight * ptsPerSvgPixel;
                const headerHeightPt = headerOffset * ptsPerSvgPixel;

                // Determine systems per page without splitting any staff line
                // Page 1 includes the title header block
                const availHeightPage1Pt = printableHeightPt - headerHeightPt - 25;
                const systemsOnPage1 = Math.max(1, Math.floor(availHeightPage1Pt / systemHeightPt));

                // Subsequent pages have full vertical space
                const availHeightSubsequentPt = printableHeightPt - 30;
                const systemsPerSubsequentPage = Math.max(1, Math.floor(availHeightSubsequentPt / systemHeightPt));

                // Slice systems across page boundaries
                const pageSlices = [];
                let currentSystem = 0;

                // Page 1
                const p1EndSystem = Math.min(numSystems, systemsOnPage1);
                const p1SourceHeight = headerOffset + (p1EndSystem * systemHeight);
                pageSlices.push({
                    sourceY: 0,
                    sourceHeight: p1EndSystem === numSystems ? svgHeight : p1SourceHeight,
                    isFirstPage: true
                });
                currentSystem = p1EndSystem;

                // Subsequent pages
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

                // 5. Initialize jsPDF Document (A4, Portrait)
                const pdfDoc = new JsPdfClass({
                    orientation: "portrait",
                    unit: "pt",
                    format: "a4",
                    compress: true
                });

                // High-resolution rendering multiplier (2.0 = crisp vector-equivalent print quality)
                const renderScale = 2.0;

                for (let p = 0; p < totalPages; p++) {
                    const slice = pageSlices[p];

                    if (p > 0) {
                        pdfDoc.addPage("a4", "portrait");
                    }

                    // Create offscreen slicing canvas
                    const sliceCanvas = document.createElement("canvas");
                    sliceCanvas.width = Math.round(svgWidth * renderScale);
                    sliceCanvas.height = Math.round(slice.sourceHeight * renderScale);

                    const ctx = sliceCanvas.getContext("2d");
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

                    // Draw only this vertical slice from the complete SVG
                    ctx.drawImage(
                        sourceImage,
                        0, slice.sourceY, svgWidth, slice.sourceHeight,      // Source coordinates
                        0, 0, sliceCanvas.width, sliceCanvas.height          // Destination canvas
                    );

                    const sliceDataUrl = sliceCanvas.toDataURL("image/jpeg", 0.95);
                    const destHeightPt = slice.sourceHeight * ptsPerSvgPixel;

                    const destX = horizontalMarginPt;
                    const destY = slice.isFirstPage ? topMarginPt : (topMarginPt + 10);

                    pdfDoc.addImage(sliceDataUrl, "JPEG", destX, destY, printableWidthPt, destHeightPt, undefined, "FAST");

                    // Running header on page 2 and later
                    if (!slice.isFirstPage) {
                        pdfDoc.setFont("helvetica", "normal");
                        pdfDoc.setFontSize(8);
                        pdfDoc.setTextColor(140, 140, 140);
                        pdfDoc.text(trackTitle, a4WidthPt / 2, 26, { align: "center" });
                    }

                    // Footer page numbering and branding
                    pdfDoc.setFont("helvetica", "normal");
                    pdfDoc.setFontSize(8.5);
                    pdfDoc.setTextColor(130, 130, 130);
                    pdfDoc.text(`Page ${p + 1} of ${totalPages}`, a4WidthPt / 2, a4HeightPt - 20, { align: "center" });

                    pdfDoc.setFontSize(7.5);
                    pdfDoc.setTextColor(170, 170, 170);
                    pdfDoc.text("T1ERA Music Ai", a4WidthPt - horizontalMarginPt, a4HeightPt - 20, { align: "right" });
                }

                // 6. Save directly to PDF file (No browser print dialog)
                pdfDoc.save(`${sanitizedTitle}_sheet_music.pdf`);

                // 7. Clean up
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

    // Attach to both Section 2 and Maximized view PDF dropdown buttons
    if (downPdfSecond) downPdfSecond.addEventListener("click", handlePdfDownload("sheet-music-notation-vertical"));
    if (downPdfMax) downPdfMax.addEventListener("click", handlePdfDownload("sheet-music-notation-max"));
});

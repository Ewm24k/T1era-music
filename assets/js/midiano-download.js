document.addEventListener("DOMContentLoaded", () => {
    const btnDownloadMenu = document.getElementById("btn-download-menu");
    const downloadDropdown = document.getElementById("download-dropdown");
    const downMidi = document.getElementById("down-midi");
    const downJson = document.getElementById("down-json");
    const downSvg = document.getElementById("down-svg");
    const downXml = document.getElementById("down-xml");

    // Section 2 - Dropdown Actions [Added]
    const downSvgSecond = document.getElementById("down-svg-second");
    const downXmlSecond = document.getElementById("down-xml-second");
    const downMidiSecond = document.getElementById("down-midi-second");
    const downPdfSecond = document.getElementById("down-pdf-second");

    // Maximized View - Dropdown Actions [Added]
    const downSvgMax = document.getElementById("down-svg-max");
    const downXmlMax = document.getElementById("down-xml-max");
    const downMidiMax = document.getElementById("down-midi-max");
    const downPdfMax = document.getElementById("down-pdf-max");

    // Dynamic enable observer loop targeting loaded midi state [Modified to support all download wrappers]
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

    // Close Dropdown Menus when clicking anywhere else on page [Modified]
    document.addEventListener("click", () => {
        if (downloadDropdown) downloadDropdown.classList.remove("show");
        
        const dropdownSecond = document.getElementById("download-dropdown-second");
        if (dropdownSecond) dropdownSecond.classList.remove("show");
        
        const dropdownMax = document.getElementById("download-dropdown-max");
        if (dropdownMax) dropdownMax.classList.remove("show");
    });

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

    // Custom bindings for Section 2 and Max view SVG downloads [Added]
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

    // 5. HIGH-FIDELITY VECTOR PDF DOWNLOAD ENGINE [Added]
    const handlePdfDownload = (containerId) => {
        return (e) => {
            e.preventDefault();
            try {
                const svgElement = document.querySelector(`#${containerId} svg`);
                if (!svgElement) {
                    alert("Please pre-render the sheet music notation first.");
                    return;
                }
                
                // Create an invisible iframe to isolate the SVG element and trigger print mapping natively
                const iframe = document.createElement('iframe');
                iframe.style.position = 'absolute';
                iframe.style.width = '0px';
                iframe.style.height = '0px';
                iframe.style.border = 'none';
                document.body.appendChild(iframe);
                
                const doc = iframe.contentWindow.document;
                const svgString = new XMLSerializer().serializeToString(svgElement);
                const docTitle = (typeof midiData !== 'undefined' && midiData && midiData.name) ? midiData.name : 'sheet_music';
                
                doc.write(`
                    <html>
                    <head>
                        <title>${docTitle}</title>
                        <style>
                            body {
                                margin: 0;
                                padding: 0;
                                display: flex;
                                justify-content: center;
                                background-color: #ffffff;
                            }
                            svg {
                                width: 100%;
                                height: auto;
                                max-width: 100%;
                            }
                            @media print {
                                body, html {
                                    background-color: #ffffff !important;
                                    -webkit-print-color-adjust: exact;
                                    print-color-adjust: exact;
                                }
                                svg {
                                    page-break-inside: avoid;
                                }
                            }
                        </style>
                    </head>
                    <body>
                        ${svgString}
                        <script>
                            window.onload = function() {
                                setTimeout(function() {
                                    window.print();
                                    setTimeout(function() {
                                        window.frameElement.remove();
                                    }, 100);
                                }, 300);
                            };
                        </script>
                    </body>
                    </html>
                `);
                doc.close();
            } catch (err) {
                console.error("PDF print generation failed:", err);
            }
        };
    };
    if (downPdfSecond) downPdfSecond.addEventListener("click", handlePdfDownload('sheet-music-notation-vertical'));
    if (downPdfMax) downPdfMax.addEventListener("click", handlePdfDownload('sheet-music-notation-max'));

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
});

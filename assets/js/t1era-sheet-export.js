// ==========================================
// T1ERA STUDIO - INTEGRATED DOWNLOAD ENGINE
// ==========================================

// Global state trackers
let activeDownloadContainerId = "";
let currentOpenMenuElement = null;

// Inject modern responsive styling for Dropdowns and Mobile Bottom Sheets on load
const dStyle = document.createElement("style");
dStyle.innerHTML = `
    /* Desktop Glassmorphic Dropdown Menu */
    .t1era-dropdown-menu {
        position: absolute;
        background: rgba(18, 18, 24, 0.94);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        width: 170px;
        padding: 6px 0;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        animation: t1eraFadeIn 0.15s ease-out;
    }

    .t1era-dropdown-item {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        text-align: left;
        padding: 8px 16px;
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.2s ease;
    }

    .t1era-dropdown-item:hover {
        background: rgba(243, 95, 34, 0.08);
        color: #ffffff;
    }

    .t1era-dropdown-item svg {
        color: rgba(255, 255, 255, 0.5);
        transition: color 0.2s ease;
    }

    .t1era-dropdown-item:hover svg {
        color: #f35f22;
    }

    /* Print media stylesheet to scale SVG and isolate staves strictly for A4 portrait outputs */
    @media print {
        body * {
            visibility: hidden !important;
        }
        
        #sheet-modal, #second-sheet-max-modal,
        .printable-container, .printable-container svg {
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: #ffffff !important;
            color: #111115 !important;
            box-shadow: none !important;
            overflow: visible !important;
            page-break-inside: avoid !important;
        }

        .printable-container text {
            fill: #111115 !important;
        }

        .printable-container line {
            stroke: #9ca3af !important;
        }

        .printable-container ellipse {
            fill: #111115 !important;
            stroke: #111115 !important;
        }

        @page {
            size: A4 portrait;
            margin: 1.5cm;
        }
    }

    /* Mobile Bottom Sheet Overlay menu */
    .t1era-sheet-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(4, 4, 6, 0.5);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 99999;
        display: flex;
        align-items: flex-end;
        animation: t1eraFadeIn 0.2s ease-out;
    }

    .t1era-bottom-sheet {
        background: rgba(18, 18, 24, 0.96);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px 16px 0 0;
        width: 100%;
        padding: 16px 16px calc(16px + env(safe-area-inset-bottom)) 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
        transform: translateY(0);
        animation: t1eraSlideUp 0.25s cubic-bezier(0.25, 1, 0.5, 1);
    }

    .t1era-sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .t1era-sheet-title {
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
    }

    .t1era-sheet-close {
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.4);
        padding: 4px;
        cursor: pointer;
    }

    .t1era-sheet-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: #ffffff;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        width: 100%;
        text-align: left;
    }

    .t1era-sheet-item:active {
        background: rgba(243, 95, 34, 0.1);
        border-color: rgba(243, 95, 34, 0.3);
    }

    @keyframes t1eraFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes t1eraSlideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
    }
`;
document.head.appendChild(dStyle);

// Standard Svg Icon Nodes
const iconMidi = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
const iconSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
const iconXml = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
const iconPdf = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

// Entry hook: displays the dropdown or bottom sheet depending on screen size
function showDownloadMenu(e, containerId) {
    e.stopPropagation();
    activeDownloadContainerId = containerId;
    dismissDownloadMenu();

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        showMobileBottomSheet();
    } else {
        showDesktopDropdown(e.currentTarget);
    }
}

// Generate and position desktop floating dropdown
function showDesktopDropdown(targetButton) {
    const menu = document.createElement("div");
    menu.className = "t1era-dropdown-menu";

    menu.innerHTML = `
        <button class="t1era-dropdown-item" onclick="triggerMidiDownload()">
            ${iconMidi} Download MIDI
        </button>
        <button class="t1era-dropdown-item" onclick="triggerSvgDownload()">
            ${iconSvg} Download SVG
        </button>
        <button class="t1era-dropdown-item" onclick="triggerXmlDownload()">
            ${iconXml} Download MusicXML
        </button>
        <button class="t1era-dropdown-item" onclick="triggerPdfDownload()">
            ${iconPdf} Download PDF
        </button>
    `;

    document.body.appendChild(menu);
    currentOpenMenuElement = menu;

    const rect = targetButton.getBoundingClientRect();
    const menuWidth = 170;
    
    // Align dropdown perfectly below the button on desktop
    let leftPos = rect.left + window.scrollX;
    if (leftPos + menuWidth > window.innerWidth) {
        leftPos = rect.right + window.scrollX - menuWidth;
    }

    menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
    menu.style.left = `${leftPos}px`;

    // Catch clicking outside to close
    setTimeout(() => {
        window.addEventListener("click", closeDropdownOnClickOutside);
    }, 50);
}

// Generate mobile bottom sheet slider
function showMobileBottomSheet() {
    const overlay = document.createElement("div");
    overlay.className = "t1era-sheet-overlay";
    overlay.id = "t1era-sheet-overlay";

    overlay.innerHTML = `
        <div class="t1era-bottom-sheet">
            <div class="t1era-sheet-header">
                <span class="t1era-sheet-title">Export & Download Score</span>
                <button class="t1era-sheet-close" onclick="dismissDownloadMenu()">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <button class="t1era-sheet-item" onclick="triggerMidiDownload()">
                ${iconMidi} Download MIDI file (.mid)
            </button>
            <button class="t1era-sheet-item" onclick="triggerSvgDownload()">
                ${iconSvg} Download Vector Graphics (.svg)
            </button>
            <button class="t1era-sheet-item" onclick="triggerXmlDownload()">
                ${iconXml} Download MusicXML Sheet (.musicxml)
            </button>
            <button class="t1era-sheet-item" onclick="triggerPdfDownload()">
                ${iconPdf} Download Printable PDF (.pdf)
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    currentOpenMenuElement = overlay;

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) dismissDownloadMenu();
    });
}

function dismissDownloadMenu() {
    if (currentOpenMenuElement) {
        currentOpenMenuElement.remove();
        currentOpenMenuElement = null;
    }
    window.removeEventListener("click", closeDropdownOnClickOutside);
}

function closeDropdownOnClickOutside(e) {
    if (currentOpenMenuElement && !currentOpenMenuElement.contains(e.target)) {
        dismissDownloadMenu();
    }
}

// Channel 1 Exporter: Retrieves raw source MIDI URL and triggers download [1]
function triggerMidiDownload() {
    dismissDownloadMenu();
    const urlParams = new URLSearchParams(window.location.search);
    const currentMidiUrl = urlParams.get("midi") || localStorage.getItem("t1era_current_midi");

    if (currentMidiUrl) {
        const title = window.resolvedSheetTitle || "T1ERA_score";
        const downloadLink = document.createElement("a");
        downloadLink.href = currentMidiUrl;
        downloadLink.download = `${title}.mid`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    } else {
        alert("Active MIDI source URL could not be resolved.");
    }
}

// Channel 2 Exporter: Triggers the sheet music's native SVG vector assembly download
function triggerSvgDownload() {
    dismissDownloadMenu();
    if (typeof downloadVerticalSVG === "function") {
        downloadVerticalSVG(activeDownloadContainerId);
    } else {
        alert("SVG exporter is not loaded.");
    }
}

// Channel 3 Exporter: Generates standard XML structural partwise notes on the fly
function triggerXmlDownload() {
    dismissDownloadMenu();
    const title = window.resolvedSheetTitle || "MIDI Score";
    
    // Choose appropriate note buffer
    const sourceNotes = activeDownloadContainerId === "sheet-music-notation-studio" ? window.studioNotesMemory : window.activeNotesMemory;
    if (!sourceNotes || sourceNotes.length === 0) {
        alert("The active notes buffer is empty.");
        return;
    }

    // Build partwise MusicXML 3.1 valid skeleton [1]
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${title}</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name>Piano Roll</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</time>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>\n`;

    // Process notes chronologically up to 120 elements for a clean standard score
    const notesToExport = sourceNotes.slice(0, 120);
    notesToExport.forEach(note => {
        const step = note.name ? note.name.charAt(0) : "C";
        const alter = note.name && note.name.includes("#") ? "1" : "0";
        const octave = note.name ? note.name.replace(/[^0-9]/g, "") : "4";
        
        xml += `      <note>
        <pitch>
          <step>${step}</step>
          ${alter !== "0" ? `<alter>${alter}</alter>` : ""}
          <octave>${octave}</octave>
        </pitch>
        <duration>256</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>\n`;
    });

    xml += `    </measure>
  </part>
</score-partwise>`;

    const blob = new Blob([xml], { type: "application/vnd.recordare.musicxml+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `${title}.musicxml`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

// Channel 4 Exporter: Isolates target SVG staves and prints cleanly using printable A4 media queries
function triggerPdfDownload() {
    dismissDownloadMenu();
    const container = document.getElementById(activeDownloadContainerId);
    if (!container) {
        alert("Visual sheet music container is missing.");
        return;
    }

    // Add printable isolation class
    container.classList.add("printable-container");
    
    // Delay slightly to allow the browser thread to paint the print class layout
    setTimeout(() => {
        window.print();
        container.classList.remove("printable-container");
    }, 150);
}

// Export hooks globally
window.showDownloadMenu = showDownloadMenu;
window.triggerMidiDownload = triggerMidiDownload;
window.triggerSvgDownload = triggerSvgDownload;
window.triggerXmlDownload = triggerXmlDownload;
window.triggerPdfDownload = triggerPdfDownload;
window.dismissDownloadMenu = dismissDownloadMenu;

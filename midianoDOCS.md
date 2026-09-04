# Developer Documentation & Handover Manual: `midiano`

This document serves as a detailed technical manual and handover guide for the **Professional MIDI Piano Visualizer & Analyzer** (`midiano`). It outlines the system architecture, file dependencies, styling maps, state management, and critical logical pathways to help subsequent developers or AI agents maintain, extend, or refactor the application.

---

## 1. Architectural Overview

The application is a web-based, client-side interactive MIDI visualizer, sheet music generator, and note sequencer. It converts loaded standard MIDI files (`.mid`/`.midi`) into three output channels:
1.  **3D-styled falling-note roll** over an interactive 88-key piano keyboard (utilizing HTML5 Canvas).
2.  **Procedural vector SVG sheet music** rendered in both a horizontal continuous strip and a portrait-wrapped page format.
3.  **An interactive Studio/Workspace** where developers or users can filter out soft notes by velocity threshold or edit individual note metadata (pitch, timing, duration) and save those modifications back to the master track database.

---

## 2. File Directory & Dependencies

### Currently Linked Files
The core codebase is separated into three main files:
*   **`midiano.html`**: The structural backbone of the UI. It hosts the controls, layouts, modals, tabs, and references the CSS and JS files.
*   **`assets/css/midiano.css`**: Handles all color styling, themes, interactive keyboard layouts, responsive flex configurations, modals, and notation containers.
*   **`assets/js/midiano.js`**: Contains the master sequencer logic, audio DSP mapping, Krumhansl-Schmuckler key signature calculation, chord estimation, vector notation rendering engines, event dispatchers, and studio-workspace filters.

### External Libraries (CDN Integration)
The application relies on these external dependencies loaded inside `<head>`:
1.  **Tone.js (v14.8.49)**: Orchestrates audio contexts, synthesis, sample scheduling, volume decibel metering, and spatial/ambient reverb wet controls.
2.  **@tonejs/midi**: Parses raw binary MIDI buffer files into parsed JSON track-notes structures.
3.  **abcjs-basic-min.js (v6.3.0)**: Declared for raw abc notation compatibility fallback hooks.

---

## 3. CSS Style Mapping (`midiano.css`)

The style layer handles the application's dark space aesthetic, neon glow interfaces, interactive keyboard layouts, and standard notation sheet templates.

### Key CSS Declarations to Target:
*   **Global Design Variables (`:root`)**:
    *   Controls the palette: `--bg-color` (`#0f0f13`), `--panel-color` (`#16161e`), and the primary neon indicator accent `--accent-color` (`#6366f1`). Modify these to update the theme.
*   **Physical Key Dimensions & Offsets**:
    *   `.key.white`: Standardized with vertical gradients from `#ffffff` down to `#cccccc`, a distinct bottom border (`#b5b5bd`), and a curved baseline radius.
    *   `.key.black`: Styled with a strict absolute elevation (`height: 58%`, `z-index: 2`) and layered drop-shadows to realistically simulate overhang depth.
    *   `.key.white.active` & `.key.black.active`: Triggers instantly during real-time sequencer ticks. White active keys transition to a soft pastel purple gradient with a bright glowing border (`#a855f7`). Black active keys shift to a high-contrast dark-violet styling.
*   **Notation Visual overrides**:
    *   `#sheet-tab-notation-content` / `#sheet-tab-notation-content-vertical`: Manages the aesthetic transition between the main app's dark interface (continuous horizontal strip section) and standard paper formats (portraitwrapped white page sheet).
    *   `#sheet-music-notation-vertical` uses deep vector path strokes to ensure black ledger lines, noteheads, and clef systems are visible against light page backgrounds.

---

## 4. Javascript Function Map & Code Architecture (`midiano.js`)

The JavaScript engine is structured around three core lifecycles: **File Injection**, **Sequencing/Audio Dispatching**, and **Procedural Notation Rendering**. Below is a precise functional directory.

### 4.1 State Management Variables
Before modifying any logic, monitor these variables:
*   `activeNotesMemory`: Array containing the active sorted notes (`{ midi, time, duration, name, velocity }`) of the parsed MIDI. Keep this sorted chronologically by `time`.
*   `currentPlaybackTime`: Master float pointer representing the active playback position.
*   `playbackSpeed`: Sequencer speed scaling multiplier (ranges from `0.5` to `2.0`).
*   `noteSpeed`: Canvas scaling coordinate representing the falling note rate (pixels/sec).
*   `studioNotesMemory`: Clone array of the active notes allocated strictly for non-destructive edits inside the Studio sandbox.

---

### 4.2 Audio & DSP Functions
*   **`setupAudioEngine()`**
    *   *Purpose*: Initializes the global DSP output chain.
    *   *Details*: Connects a `Tone.Volume` node (`volNode`) directly into a master `Tone.Reverb` node (`reverbNode`), routing the mixed signals directly to the destination speaker.
*   **`loadSampledPiano()`**
    *   *Purpose*: Pulls high-definition audio sample files for the primary instrument.
    *   *Details*: Pre-loads multi-sampled Salamander Grand Piano mp3 clips from an external repository directly into memory. Updates `elSamplerStatus` indicators on success.
*   **`setInstrument(type)`**
    *   *Purpose*: Dynamically swaps the active synthesizer or sampler.
    *   *Details*: Can construct several options:
        *   `sampled`: Direct pipeline to the pre-loaded multi-sampler.
        *   `splendid`: Spawns a custom ESM import of `SplendidGrandPiano` dynamically from CDNs and wraps it using the custom `SmplrToneWrapper` interface layer.
        *   `grand`, `rhodes`, `ambient`, `chiptune`: Custom synthesized fallback configurations using Tone's `PolySynth`, `Synth`, and `FMSynth`.

---

### 4.3 Drawing & Animation Engines (Canvas)
*   **`renderFrame(now)`**
    *   *Purpose*: The master `requestAnimationFrame` render loop running at the browser's refresh rate.
    *   *Details*:
        *   Calculates frame time deltas (`delta`) and increments the sequencer clock (`currentPlaybackTime`).
        *   Triggers synchronized audio notes via an optimized pointer-index loop when notes cross the zero-time boundary.
        *   Erases the canvas, scans current active keys, and draws rounded rectangles (`ctx.roundRect`) with linear neon gradients.
        *   Updates active key statuses inside the DOM keyboard structure (`pianoKeysMap`).
        *   Calculates active particle physics velocity vectors (`particles` array) to render collision sparks at the key contact point.
*   **`getVisibleNotesSlice()`**
    *   *Purpose*: Optimizes rendering performance.
    *   *Details*: Uses a double binary search (lower-bound and upper-bound) to scan the massive sequential `activeNotesMemory` array and return only the notes currently visible within the canvas viewport. Prevents performance bottlenecks on large files.

---

### 4.4 Analytical & Musical Engines
*   **`getMidiKeySignature()`**
    *   *Purpose*: Retrieves key meta-messages.
    *   *Details*: Inspects raw file key headers parsed by `@tonejs/midi`. Defaults to `C Major` if empty.
*   **`analyzeKeySignature(notes)`**
    *   *Purpose*: Backup key detection algorithm.
    *   *Details*: Evaluates key profile vectors against loaded notes weights via Pearson Correlation Coefficients (`calculateCorrelation()`), scoring pitch frequencies against Krumhansl-Schmuckler major/minor matrices.
*   **`identifyCurrentChord(activeKeys)`**
    *   *Purpose*: Parses real-time interval clusters.
    *   *Details*: Reduces playing pitches to 12 chroma values. Matches interval spacing patterns relative to root keys to identify triads, dominant chords, sevenths, suspensions, or custom pitch configurations.

---

### 4.5 Notation Rendering Engines
*   **`renderSheetMusic()`**
    *   *Purpose*: Builds continuous horizontal notation.
    *   *Details*: Procedurally constructs a wide inline SVG. Plots double-clef staves, scales horizontal intervals via `pixelsPerSecond`, maps notes to treble (>= Middle C60) or bass clef systems (<60), and constructs ledger lines, note-heads, stems, and vertical cursor lines.
*   **`renderVerticalSheetMusic(targetContainerId)`**
    *   *Purpose*: Renders standard wrapped page structures.
    *   *Details*: Segments the MIDI sequence into wrapped row rows based on `systemDuration` (10 seconds/line). Iterates positions within boundary margins to draw rows with soft-grey staff line systems, clefs, noteheads, stems, and ledger lines.

---

### 4.6 Studio sequencer Workspace
*   **`initStudioData()`**
    *   *Purpose*: Initializes the non-destructive editing workbench.
    *   *Details*: Populates `studioNotesMemory` with clean clones, locks state variables, and updates visual tables.
*   **`updateStudioTable()`**
    *   *Purpose*: Renders the active note configuration table inside the DOM.
    *   *Details*: Generates text fields and number fields for note parameters. Attaches listener triggers to automatically update note values in the workspace array when modified.
*   **`btn-studio-apply-filter` (Click Event)**
    *   *Purpose*: Automatically cuts notes below a specified velocity threshold.
    *   *Details*: Checks the threshold set by `input-studio-cut-velo` and removes matching notes from `studioNotesMemory`. Updates the visual table and sheet music workspace on completion.

---

### 4.7 Auto-Load Injection Script
Located at the bottom of `assets/js/midiano.js`:
*   *Purpose*: Automatically loads target MIDI files on page startup.
*   *Details*: Monitors url query variables (`?midi=...`) or `localStorage` caches. Initiates binary requests (`fetch(url)`) to download files as `ArrayBuffer` payloads. If detected, it creates a new mock `File` target and constructs a standard `DataTransfer` transfer, triggering an input change event so the main sequencer handles loading without manual upload actions.

---

## 5. Developer Handover Map (Troubleshooting Guide)

If a subsequent AI agent or developer needs to complete a specific task, refer to this quick directory to find the code block to modify:

| Goal / Specific Task | Target Function to Edit | Implementation Advice |
| :--- | :--- | :--- |
| **Change the falling note colors** | `renderFrame()` (Canvas gradients) | Adjust the `noteGrad.addColorStop` variables for the active and inactive note states. |
| **Modify falling note physics** | `renderFrame()` (Canvas heights) | Modify the height formulas using `noteSpeed` to change how velocities or lengths affect the note sizes. |
| **Add a new instrument fallback** | `setInstrument()` | Add a new `case` conditional statement inside the switch list and declare custom parameters for `Tone.PolySynth` or sampler nodes. |
| **Adjust notation drawing or clef ranges** | `renderSheetMusic()` / `renderVerticalSheetMusic()` | Change the threshold limit (currently fixed at pitch `60` / Middle C) to adjust the treble/bass split point. |
| **Refine chord detection logic** | `identifyCurrentChord()` | Add new key configurations to the `intervalsList` dictionary mapping the target semitone intervals. |
| **Add workspace batch editing macros** | `updateStudioTable()` | Create helper loops to run batch modifications over target indices inside `studioNotesMemory`. |
| **Adjust key signature spelling (Sharps vs Flats)** | `KEY_MAPS` (Speller dictionary) | Update array indexes to modify the diatonic sharp/flat symbols mapped to specific keys. |

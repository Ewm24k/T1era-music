// =========================================================================
// MIDIANO PRO SHEET: MuseStudio / MuseScore Style Music Engraving Engine
// =========================================================================

/**
 * Quantizes MIDI ticks/seconds into standard musical rhythmic fractions
 */
function quantizeToAbcDuration(durationSecs, unitSecs) {
    const ratio = durationSecs / unitSecs;
    if (ratio >= 3.5) return "4";        // Whole note
    if (ratio >= 2.6) return "3";        // Dotted half note
    if (ratio >= 1.7) return "2";        // Half note
    if (ratio >= 1.25) return "3/2";     // Dotted quarter note
    if (ratio >= 0.85) return "";        // Quarter note (unit 1)
    if (ratio >= 0.65) return "3/4";     // Dotted eighth note
    if (ratio >= 0.40) return "/2";      // Eighth note
    return "/4";                         // Sixteenth note
}

/**
 * Converts a MIDI note pitch into accurate diatonic ABC notation pitch
 */
function midiPitchToProAbc(midi) {
    const noteNames = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
    const pitchClass = midi % 12;
    const octave = Math.floor(midi / 12) - 1; // 4 is Middle C
    const base = noteNames[pitchClass];

    if (octave === 4) {
        return base;
    } else if (octave > 4) {
        const match = base.match(/^(\^?)([A-G])$/);
        const acc = match ? match[1] : "";
        const letter = (match ? match[2] : base).toLowerCase();
        const ticks = octave - 5;
        return acc + letter + "'".repeat(Math.max(0, ticks));
    } else {
        const commas = 4 - octave;
        return base + ",".repeat(commas);
    }
}

/**
 * Compiles active MIDI events into a clean, measure-grouped ABC Grand Staff Score
 */
function generateMuseStudioAbc() {
    if (!activeNotesMemory || activeNotesMemory.length === 0) return "";

    const bpm = (midiData && midiData.header && midiData.header.tempos && midiData.header.tempos[0])
        ? Math.round(midiData.header.tempos[0].bpm)
        : 120;

    let timeSig = "4/4";
    let beatsPerMeasure = 4;
    let beatUnit = 4;
    if (midiData && midiData.header && midiData.header.timeSignatures && midiData.header.timeSignatures.length > 0) {
        const ts = midiData.header.timeSignatures[0].timeSignature;
        if (Array.isArray(ts) && ts.length === 2) {
            beatsPerMeasure = ts[0];
            beatUnit = ts[1];
            timeSig = `${beatsPerMeasure}/${beatUnit}`;
        }
    }

    const quarterSec = 60 / bpm;
    const measureDurationSec = beatsPerMeasure * (4 / beatUnit) * quarterSec;
    const title = resolvedSheetTitle || (midiData && midiData.name ? midiData.name : "Studio Score");

    let abc = `X:1\n`;
    abc += `T:${title}\n`;
    abc += `C:T1ERA Music Ai\n`;
    abc += `M:${timeSig}\n`;
    abc += `L:1/4\n`;
    abc += `Q:1/4=${bpm}\n`;
    abc += `K:C\n`;
    abc += `%%score {RH | LH}\n`;
    abc += `V:RH clef=treble name="RH"\n`;
    abc += `V:LH clef=bass name="LH"\n`;

    // Group notes into RH (>= 60) and LH (< 60)
    const rhNotes = activeNotesMemory.filter(n => n.midi >= 60);
    const lhNotes = activeNotesMemory.filter(n => n.midi < 60);

    function buildVoiceLine(notes) {
        if (!notes || notes.length === 0) return "z4 |";
        let out = "";
        let currentTime = 0;
        let measureElapsed = 0;

        // Group notes that start at approximately the same millisecond into chords
        const clusters = [];
        let i = 0;
        while (i < notes.length) {
            const cluster = [notes[i]];
            let j = i + 1;
            while (j < notes.length && Math.abs(notes[j].time - notes[i].time) < 0.04) {
                cluster.push(notes[j]);
                j++;
            }
            clusters.push(cluster);
            i = j;
        }

        clusters.forEach((cluster) => {
            const onset = cluster[0].time;
            const gap = onset - currentTime;

            // Insert rest if there is an audible pause
            if (gap >= quarterSec * 0.45) {
                const restLen = quantizeToAbcDuration(gap, quarterSec);
                out += `z${restLen} `;
                measureElapsed += gap;
                while (measureElapsed >= measureDurationSec - 0.05) {
                    out += "| ";
                    measureElapsed -= measureDurationSec;
                }
            }

            // Longest note duration in chord cluster
            const clusterDur = cluster.reduce((m, n) => Math.max(m, n.duration), 0);
            const abcDur = quantizeToAbcDuration(clusterDur, quarterSec);

            if (cluster.length === 1) {
                out += `${midiPitchToProAbc(cluster[0].midi)}${abcDur} `;
            } else {
                // Chord bracket [CEG]
                const chordPitches = cluster.map(n => midiPitchToProAbc(n.midi)).join("");
                out += `[${chordPitches}]${abcDur} `;
            }

            currentTime = onset + clusterDur;
            measureElapsed += clusterDur;

            if (measureElapsed >= measureDurationSec - 0.05) {
                out += "| ";
                measureElapsed = 0;
            }
        });

        out += "||";
        return out;
    }

    abc += `[V:RH] ${buildVoiceLine(rhNotes)}\n`;
    abc += `[V:LH] ${buildVoiceLine(lhNotes)}\n`;

    return abc;
}

/**
 * Public function to render the MuseStudio Engraved Score into the targeted container
 */
function renderProMuseScore(targetContainerId) {
    const container = document.getElementById(targetContainerId);
    if (!container) return;

    if (typeof ABCJS === "undefined") {
        container.innerHTML = "<div style='color:#ef4444; padding:20px; text-align:center;'>Engraving engine (abcjs) is loading... Please wait.</div>";
        return;
    }

    const abcString = generateMuseStudioAbc();
    if (!abcString) {
        container.innerHTML = "<div style='color:#9ca3af; padding:20px; text-align:center;'>No note events available to engrave.</div>";
        return;
    }

    container.innerHTML = "";

    const visualOptions = {
        responsive: "resize",
        add_classes: true,
        staffwidth: Math.max(300, (container.clientWidth || window.innerWidth) - 40),
        scale: 1.15,
        paddingtop: 15,
        paddingbottom: 25,
        paddingleft: 15,
        paddingright: 15
    };

    ABCJS.renderAbc(targetContainerId, abcString, visualOptions);

    // Apply crisp classical styling
    const renderedSvg = container.querySelector("svg");
    if (renderedSvg) {
        renderedSvg.style.backgroundColor = "#ffffff";
        renderedSvg.style.borderRadius = "8px";
        renderedSvg.style.boxShadow = "0 4px 15px rgba(0,0,0,0.12)";
        renderedSvg.style.display = "block";
        renderedSvg.style.margin = "0 auto";
    }
}

window.renderProMuseScore = renderProMuseScore;

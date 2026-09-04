// =========================================================
// T1ERA MUSIC - IVORY-2 (BYTEDANCE) PROGRESS CHECKLIST MODULE
// Handles the visual progress terminal + Firestore status
// listening for the Ivory-2 model - a dedicated single-pass
// ByteDance solo-piano transcription engine. This pipeline does
// NOT go through the Stage 0-4 clean/repair/reconstruct/stabilize
// chain used by the other models, so the checklist is shorter.
// =========================================================

import { db } from "./firebase-config.js";
import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function createByteDanceProgressCardMarkup() {
  return `
    <div class="proc-card">
      <div class="proc-header">
        <h3 class="proc-title">T1ERA Ivory-2 Engine (ByteDance)</h3>
        <span class="proc-progress-pct" id="proc-pct">0%</span>
      </div>
      <div class="proc-bar-container">
        <div class="proc-bar-fill" id="proc-bar" style="width: 0%"></div>
      </div>
      <div class="proc-steps">
        <div class="proc-step" id="step-init">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Initializing Session Verification</span>
        </div>
        <div class="proc-step" id="step-download">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Receiving Uploaded Audio</span>
        </div>
        <div class="proc-step" id="step-details">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Syncing Track Details</span>
        </div>
        <div class="proc-step" id="step-temp">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Caching Raw Track to Workspace</span>
        </div>
        <div class="proc-step" id="step-transcribe">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">ByteDance Piano Transcription (Onset / Offset / Velocity / Pedal)</span>
        </div>
        <div class="proc-step" id="step-complete">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Synchronizing Final MIDI</span>
        </div>
      </div>
      <div id="proc-action-area" style="text-align: center;"></div>
    </div>
  `;
}

export function setByteDanceStepStatus(stepId, state) {
  const stepEl = document.getElementById(stepId);
  if (!stepEl) return;
  stepEl.classList.remove("active", "completed");
  const statusContainer = stepEl.querySelector(".step-status");
  if (state === "loading") {
    stepEl.classList.add("active");
    statusContainer.innerHTML = `<span class="step-spinner"></span>`;
  } else if (state === "success") {
    stepEl.classList.add("completed");
    statusContainer.innerHTML = `<span class="step-check">✓</span>`;
  } else {
    statusContainer.innerHTML = `<span class="step-circle"></span>`;
  }
}

export function showByteDanceTerminalFailure(message) {
  const progressBar = document.getElementById("proc-bar");
  if (progressBar) {
    progressBar.style.background = "#ff4a4a";
    progressBar.style.boxShadow = "0 0 12px rgba(255, 74, 74, 0.5)";
  }
  const actionArea = document.getElementById("proc-action-area");
  if (actionArea) {
    actionArea.innerHTML = `
      <div style="color:#ff4a4a; font-weight:bold; font-size:0.8rem; margin-top:10px; line-height:1.4;">PROCESSING FAILED: ${String(message).toUpperCase()}</div>
      <button onclick="document.getElementById('verification-screen').classList.remove('active')" class="web3-action-btn" style="margin-top:10px; border-color:#ff4a4a; color:#ff4a4a; font-size:0.75rem;">[ CLOSE KONSOL ]</button>
    `;
  }
}

/**
 * Watches Firestore for job status updates and drives the Ivory-2
 * (ByteDance) progress checklist - a single transcription pass, not
 * the multi-stage clean/repair/reconstruct/stabilize chain.
 * Falls back to a simulated progress timeline if Firestore snapshot
 * listening is blocked (mirrors the other models' fallback behaviour).
 */
export function openByteDanceLiveTerminalConsole(userId, jobId) {
  const verificationTerminal = document.getElementById("verification-terminal");
  const dropzoneLabelText = document.getElementById("dropzone-label-text");
  const verificationScreen = document.getElementById("verification-screen");

  const hasCard = document.querySelector(".proc-card");
  if (!hasCard) { verificationTerminal.innerHTML = createByteDanceProgressCardMarkup(); }

  setByteDanceStepStatus("step-init", "success");
  setByteDanceStepStatus("step-download", "success");
  setByteDanceStepStatus("step-details", "loading");
  setByteDanceStepStatus("step-temp", "success");

  const progressBar = document.getElementById("proc-bar");
  const progressPct = document.getElementById("proc-pct");

  let isFirestoreActive = true;
  let detailsSynced = false;

  const handleByteDanceMidiComplete = (midiUrl) => {
    setByteDanceStepStatus("step-transcribe", "success");
    setByteDanceStepStatus("step-complete", "success");

    if (progressBar) progressBar.style.width = "100%";
    if (progressPct) progressPct.textContent = "100%";

    localStorage.setItem("t1era_current_midi", midiUrl);

    const actionArea = document.getElementById("proc-action-area");
    if (actionArea) {
      actionArea.innerHTML = `<div style="color:#00df89; font-weight:bold; letter-spacing:1px; font-size:0.9rem; margin-top:10px;">[ REDIRECTING TO PIANO STUDIO... ]</div>`;
    }
    setTimeout(() => {
      window.location.href = "midiano.html?midi=" + encodeURIComponent(midiUrl);
    }, 1500);
  };

  const fallbackTimeout = setTimeout(() => {
    if (isFirestoreActive) {
      isFirestoreActive = false;
      console.warn("[FIRESTORE BYPASS - IVORY-2/BYTEDANCE] Active snapshot listening blocked. Switching to fallback...");

      if (!detailsSynced) {
        detailsSynced = true;
        setByteDanceStepStatus("step-details", "success");
      }

      const constructedMidiUrl = `https://firebasestorage.googleapis.com/v0/b/t1era-musicv1.firebasestorage.app/o/users%2F${userId}%2Ftranscriptions%2F${jobId}%2Ffinal_score.mid?alt=media`;

      let fakeProgress = 30;
      const fakeInterval = setInterval(() => {
        fakeProgress += 5;
        if (progressBar) progressBar.style.width = `${Math.min(99, fakeProgress)}%`;
        if (progressPct) progressPct.textContent = `${Math.min(99, fakeProgress)}%`;

        if (fakeProgress >= 40 && fakeProgress < 95) {
          setByteDanceStepStatus("step-transcribe", "loading");
        } else if (fakeProgress >= 95) {
          clearInterval(fakeInterval);
          handleByteDanceMidiComplete(constructedMidiUrl);
        }
      }, 750);
    }
  }, 4000);

  if (db && userId !== "guest_studio_creator") {
    const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
    const unsubscribe = onSnapshot(jobRef, (snapshot) => {
      if (!snapshot.exists()) return;

      clearTimeout(fallbackTimeout);
      isFirestoreActive = true;

      const data = snapshot.data();
      const status = data.status;
      const progress = data.progress || 0;

      if (!detailsSynced && data.title) {
        detailsSynced = true;
        setByteDanceStepStatus("step-details", "success");
      }

      if (progressBar) progressBar.style.width = `${progress}%`;
      if (progressPct) progressPct.textContent = `${progress}%`;

      if (status === "QUEUED") {
        setByteDanceStepStatus("step-init", "success");
        setByteDanceStepStatus("step-download", "loading");
      } else if (status === "REQUESTING_YT_LINK" || status === "DOWNLOADING_AUDIO") {
        setByteDanceStepStatus("step-init", "success");
        setByteDanceStepStatus("step-download", "loading");
        const stepDownloadLabel = document.querySelector("#step-download .step-label");
        if (stepDownloadLabel) {
          stepDownloadLabel.textContent = status === "REQUESTING_YT_LINK"
            ? `Requesting YouTube Link: ${progress}%`
            : "Downloading Storage Audio";
        }
      } else if (status === "CACHING_AUDIO") {
        setByteDanceStepStatus("step-init", "success");
        setByteDanceStepStatus("step-download", "success");
        setByteDanceStepStatus("step-temp", "loading");
      } else if (status === "TRANSCRIBING_PIANO") {
        setByteDanceStepStatus("step-init", "success");
        setByteDanceStepStatus("step-download", "success");
        setByteDanceStepStatus("step-temp", "success");
        if (!detailsSynced) {
          detailsSynced = true;
          setByteDanceStepStatus("step-details", "success");
        }
        setByteDanceStepStatus("step-transcribe", "loading");
      } else if (status === "UPLOADING_RESULTS") {
        setByteDanceStepStatus("step-transcribe", "success");
        setByteDanceStepStatus("step-complete", "loading");
      } else if (status === "COMPLETED") {
        unsubscribe();
        handleByteDanceMidiComplete(data.midiUrl);
      } else if (status === "FAILED") {
        unsubscribe();
        showByteDanceTerminalFailure(data.error || "Unknown pipeline error.");
      }
    }, (error) => {
      console.warn("[FIRESTORE WARNING - IVORY-2/BYTEDANCE] Active snapshot listening blocked.", error);
    });
  }

  verificationScreen.addEventListener("click", (e) => {
    if (e.target === verificationScreen) {
      const actionArea = document.getElementById("proc-action-area");
      if (actionArea && (actionArea.innerHTML.includes("REDIRECTING") || actionArea.innerHTML.includes("FAILED"))) {
        verificationScreen.classList.remove("active");
        if (dropzoneLabelText) dropzoneLabelText.textContent = "Select Music File";
      }
    }
  });
}

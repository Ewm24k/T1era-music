# T1era Music API - Ivory-2 (ByteDance Piano Engine) Documentation
### Handover Guide for AI Assistants & Orchestrator Agents

This documentation outlines the architecture, constraints, file structure, storage mechanisms, historical issues, and debugging practices for the **Ivory-2 (ByteDance Solo Piano Engine)** transcription pipeline on the `t1era-music-server` VM. 

---

## 1. Capabilities & Constraints
* **Engine Type:** Ivory-2 is a single-pass, high-resolution solo piano transcription pipeline. It is distinct from the multi-stage cleanup pipelines used in Vortex-Ultra and Ivory-4.
* **Core Model:** Powered by ByteDance's open-source `piano_transcription_inference` library (Kong et al.).
* **Outputs:** Generates MIDI files containing onsets, offsets, velocities, and sustain pedal events.
* **Constraint:** This model is designed for **solo piano recordings only**. It has no built-in instrument classification; processing vocal tracks, full bands, or other instruments will not trigger an error but will output unuseable MIDI data. This rule is enforced at the user-interface level.

---

## 2. Infrastructure & Pipeline Architecture

### Execution Flow
1. **Trigger:** The client triggers the pipeline by sending a `POST` request to `/transcribe-bytedance`.
2. **Asynchronous Threading:** The Flask handler in `bytedance_orchestrator.py` boots a background thread (`process_incoming_cloud_job`) and immediately responds to the client with `202 QUEUED`.
3. **Audio Pre-processing:** The orchestrator resolves the audio input (downloading from YouTube via the `youtube-mp36` API or downloading an uploaded file from Firebase Storage), writes it temporarily to the `/tmp/` directory, and syncs a copy back to Firebase Storage.
4. **Subprocess Isolation:** To prevent memory deadlocks and framework conflicts (e.g., PyTorch used by ByteDance vs. TensorFlow used by Basic Pitch in Stage 0), the actual transcription is executed inside an **isolated Python subprocess**.
5. **Transcription Run:** The subprocess executes `bytedance_transcribe.py` using PyTorch on CPU (since GPU acceleration is not active on this specific VM). This takes **20–22 minutes** for a standard 3–4 minute song.
6. **Result Upload:** Upon success, the orchestrator uploads the MIDI results to Firebase Storage, updates the Firestore document status to `COMPLETED`, and deletes the temporary MP3 cache to save space.

### Core File Map
* `/home/tengkufiboking/T1era-music/main.py`: Contains the `CentralOrchestrator` base class. It handles database initialization, status updates, YouTube metadata querying, and the central `upload_to_storage` utility.
* `/home/tengkufiboking/T1era-music/bytedance_orchestrator.py`: Houses the `ByteDanceOrchestrator` subclass. It implements the isolated subprocess executor (`bytedance_transcribe.py`) and exposes the `/transcribe-bytedance` Flask route.
* `/home/tengkufiboking/T1era-music/bytedance_transcribe.py`: The standalone script running inside the subprocess. It executes the PyTorch model and writes the final MIDI output.

---

## 3. Storage & Database Schema

### Firebase Storage Path Conventions
* **Cached MP3 Source:** `users/{userId}/transcriptions/{jobId}/youtube_audio.mp3` *(Deleted upon job completion/failure)*.
* **Track Title metadata:** `users/{userId}/transcriptions/{jobId}/details.json`
* **Final Transcribed MIDI:** `users/{userId}/transcriptions/{jobId}/final_score.mid`

### Firestore Database Schema
Documents are updated under the collection path:  
`users/{userId}/midi_jobs/{jobId}`

**Active Status States:**
* `QUEUED` -> `REQUESTING_YT_LINK` / `DOWNLOADING_AUDIO` -> `CACHING_AUDIO` -> `TRANSCRIBING_PIANO` -> `UPLOADING_RESULTS` -> `COMPLETED` / `FAILED`

**Firestore Completion Payload:**
```json
{
  "status": "COMPLETED",
  "progress": 100,
  "midiUrl": "https://firebasestorage.googleapis.com/v0/b/t1era-musicv1.firebasestorage.app/o/users%2F{userId}%2Ftranscriptions%2F{jobId}%2Ffinal_score.mid?alt=media&token={download_token}",
  "originalMidiUrl": "https://firebasestorage.googleapis.com/v0/b/t1era-musicv1.firebasestorage.app/o/users%2F{userId}%2Ftranscriptions%2F{jobId}%2Ffinal_score.mid?alt=media&token={download_token}",
  "completedAt": "SERVER_TIMESTAMP",
  "title": "Track Title"
}
```

---

## 4. History of Technical Issues & Resolutions
For future context, here are the critical technical blocks identified and resolved in this pipeline:

### A. Python Standard Output Buffering (Backend)
* **Problem:** Progress logs like `[PROGRESS] 40%` were not printing to `journalctl` or `/home/tengkufiboking/T1era-music/error.log` in real-time. They were held in memory by Gunicorn, making the pipeline look entirely frozen.
* **Resolution:** Added `Environment="PYTHONUNBUFFERED=1"` to the Gunicorn systemd service configuration (`/etc/systemd/system/t1era-music.service`).

### B. Conda Package Incompatibilities (Backend)
* **Problem:** The system python was running `librosa 1.0.0` inside Python 3.12, which deprecated the core API paths used by `piano_transcription_inference`. Additionally, standard modern environments lacked `pkg_resources` (which was removed from `setuptools` in version `82.0.0` in early 2026).
* **Resolution:** 
  * Downgraded `librosa` to version `0.9.2`.
  * Downgraded `setuptools` to version `81.0.0` inside the `t1era` conda environment.

### C. Systemd Path Restrictions / Missing FFmpeg (Backend)
* **Problem:** Even though `ffmpeg` was installed globally, Gunicorn was unable to locate it because the systemd service restricted the environment's `PATH` to the isolated Conda env bin folder (`Environment="PATH=/home/tengkufiboking/miniconda/envs/t1era/bin"`). This caused `librosa.load` to crash silently.
* **Resolution:** Updated the path in the service file to include global bin locations:  
  `Environment="PATH=/home/tengkufiboking/miniconda/envs/t1era/bin:/usr/local/bin:/usr/bin:/bin"`

### D. Warning Messages Treated as Subprocess Failures (Backend)
* **Problem:** Python outputs `UserWarning` details directly to `stderr`. Because the orchestrator raised a crash condition if `result.stderr` was not empty, harmless deprecation warnings caused false-positive pipeline aborts.
* **Resolution:** Added `Environment="PYTHONWARNINGS=ignore"` inside the systemd service file.

### E. Inverted Frontend Listener Logic (Frontend)
* **Problem:** The JavaScript console had an inverted check (`if (isFirestoreActive) { isFirestoreActive = false; ... }`). This immediately booted a fast, fake fallback progress interval (which finished in 10 seconds), causing the frontend to redirect the user to a non-existent file on Storage before the server's 20-minute CPU job was completed.
* **Resolution:** Modified the frontend logic to start `isFirestoreActive` as `false`, correctly check `if (!isFirestoreActive)` inside the timeout, and slowed down the fake interval timer in case active connections are blocked.

---

## 5. Troubleshooting & Debugging Guide

If this pipeline runs into an error in the future, follow these steps to diagnose it:

### 1. Check if the PyTorch subprocess is active
Because CPU inference runs for 20+ minutes, verify if the engine is working by running:
```bash
ps aux | grep bytedance_transcribe.py
```
If you see the script running with **99%+ CPU usage**, the server is functioning normally and simply processing segments in the background.

### 2. Follow the real-time application log stream
Because Gunicorn redirects its standard output directly to log files on this machine, read the end of the error log directly:
```bash
tail -f /home/tengkufiboking/T1era-music/error.log
```
*Note: Due to the `capture_output=True` argument inside the orchestrator's subprocess executor, segment-by-segment updates (e.g., `Segment 10 / 71`) will only write to the log all at once when the script completes successfully or crashes.*

### 3. Diagnose dependency imports manually
If you suspect an environment update has broken PyTorch or Librosa, execute an isolated import test in the exact Conda context used by Gunicorn:
```bash
/home/tengkufiboking/miniconda/envs/t1era/bin/python -c "import torch; import torchlibrosa; import piano_transcription_inference; print('SUCCESS: All imports worked!')"
```
If this prints `SUCCESS`, your runtime libraries are properly installed and ready.

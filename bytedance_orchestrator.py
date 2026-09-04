#!/usr/bin/env python3
"""
T1era Music - ByteDance Piano Engine Orchestrator Extension (Ivory-2)
=======================================================================
This file does NOT modify main.py, vortex_orchestrator.py, or
ivory_orchestrator.py.

Unlike Vortex-Ultra and Ivory-4 (which reuse Stage 0's Basic Pitch output
and then run a subset of the internal cleanup/repair/reconstruct/stabilize
stages), this model is a COMPLETELY DIFFERENT PIPELINE. It does not call
input_file_0.py through input_file_4.py at all. Instead it runs
bytedance_transcribe.py - a single, purpose-built solo-piano transcription
model (ByteDance's "piano_transcription_inference") that produces a
polished MIDI directly in one pass (onsets, offsets, velocity, pedal).

It imports the Flask `app` and CentralOrchestrator straight from
ivory_orchestrator.py (which chains through vortex_orchestrator.py and
main.py), subclasses the orchestrator with its own run_pipeline(), and
registers ONE additional route on the SAME Flask app:

    POST /transcribe-bytedance

Because this chains through ivory_orchestrator.py -> vortex_orchestrator.py
-> main.py, importing THIS file brings up all four routes at once:
    /transcribe             (Nexus-6,      Stage 0-6, from main.py)
    /transcribe-vortex      (Vortex-Ultra, Stage 0-5, from vortex_orchestrator.py)
    /transcribe-ivory       (Ivory-4,      Stage 0-4, from ivory_orchestrator.py)
    /transcribe-bytedance   (Ivory-2,      ByteDance single-pass piano engine, from this file)

RULE (enforced at the UI/description level, not audio content analysis):
This model is for SOLO PIANO audio only - single instrument, piano sound.
It has no built-in instrument classifier; feeding it anything else will
not error, it will just produce a nonsense transcription.

DEPLOYMENT NOTE:
Point Gunicorn at THIS file so all four routes register together:

    gunicorn bytedance_orchestrator:app

Install requirements first (inside the t1era conda env, on the server):

    pip install piano_transcription_inference torch torchlibrosa
"""

import sys
import time
import traceback
import threading
import subprocess
from pathlib import Path

from flask import request, jsonify

# Reuse everything already built and working - nothing here re-implements
# Firebase init, CORS, the Flask app, or the base orchestrator. Importing
# this also runs ivory_orchestrator.py -> vortex_orchestrator.py -> main.py,
# so the shared Firebase-attach fix (patched in vortex_orchestrator.py) is
# inherited automatically here too.
from ivory_orchestrator import (
    app,
    CentralOrchestrator,
    firestore,
    storage,
)


class ByteDanceOrchestrator(CentralOrchestrator):
    """
    A different pipeline shape from the other three models. Does NOT call
    input_file_0.py through input_file_4.py. Runs bytedance_transcribe.py
    once, in an isolated subprocess (same reasoning as Stage 0's Basic
    Pitch isolation), and uses its output directly as the final MIDI.
    Save/upload/Firestore/cleanup behaviour matches the other orchestrators
    (same job document schema, same "final_score.mid" filename convention).
    """

    def run_pipeline(self, input_audio_path: Path, temp_work_dir: Path, is_cloud: bool,
                      user_id: str = None, job_id: str = None, bucket_name: str = None,
                      raw_audio_storage_path: str = None, track_title: str = None):
        start_time = time.time()
        print("\n" + "=" * 70)
        print(f"MULAKAN PIPELINE T1ERA MUSIC [IVORY-2 / BYTEDANCE] | Mode: {'CLOUD' if is_cloud else 'LOCAL'}")
        print("=" * 70)

        final_midi_path = temp_work_dir / "bytedance_final.mid"
        filename_base = "final_score"

        try:
            # -------------------------------------------------------------
            # SINGLE PASS: ByteDance Solo Piano Transcription (Subprocess Isolation)
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "TRANSCRIBING_PIANO", 40)

            print("[BYTEDANCE] Melarikan transkripsi piano di dalam subprocess berasingan...")
            cmd = [sys.executable, "bytedance_transcribe.py", str(input_audio_path), str(final_midi_path)]
            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode != 0:
                print(f"[BYTEDANCE ERROR] Subprocess gagal dengan kod exit {result.returncode}")
                print(f"STDOUT:\n{result.stdout}")
                print(f"STDERR:\n{result.stderr}")
                raise RuntimeError(f"ByteDance Piano Transcription gagal menghasilkan output: {result.stderr}")
            else:
                print("[BYTEDANCE SUCCESS] Subprocess selesai dengan jayanya.")
                print(f"STDOUT:\n{result.stdout}")

            # -------------------------------------------------------------
            # UPLOAD FINAL MIDI TO FIREBASE STORAGE
            # -------------------------------------------------------------
            total_time = time.time() - start_time
            print("\n" + "=" * 70)
            print(f"PROSES SELESAI JAYA [IVORY-2 / BYTEDANCE]! Tempoh aliran: {total_time:.2f} saat.")
            print("=" * 70)

            if is_cloud and self.firebase_active and user_id and job_id:
                self.update_status(user_id, job_id, "UPLOADING_RESULTS", 90)

                remote_path = f"users/{user_id}/transcriptions/{job_id}/{filename_base}.mid"
                download_url = self.upload_to_storage(final_midi_path, remote_path, bucket_name)

                job_ref = self.db.collection("users").document(user_id).collection("midi_jobs").document(job_id)
                job_update_payload = {
                    "status": "COMPLETED",
                    "progress": 100,
                    "midiUrl": download_url,
                    "originalMidiUrl": download_url,
                    "completedAt": firestore.SERVER_TIMESTAMP
                }
                if track_title:
                    job_update_payload["title"] = track_title

                job_ref.update(job_update_payload)
                print(f"[CLOUD] Fail MIDI akhir (ByteDance) dimuat naik ke Firebase Storage: {download_url}")

                if raw_audio_storage_path:
                    try:
                        print(f"[CLOUD CLEANUP] Memulakan pembersihan fail audio mentah dari Firebase Storage: {raw_audio_storage_path}")
                        target_bucket = self.bucket
                        if bucket_name:
                            try:
                                target_bucket = storage.bucket(bucket_name)
                            except Exception as b_err:
                                print(f"[CLOUD CLEANUP WARNING] Gagal mendapatkan baldi '{bucket_name}', menggunakan baldi utama: {b_err}")
                                target_bucket = self.bucket

                        blob = target_bucket.blob(raw_audio_storage_path)
                        try:
                            blob.delete()
                            print(f"[CLOUD CLEANUP SUCCESS] Fail audio asal '{raw_audio_storage_path}' berjaya dipadamkan.")
                            job_ref.update({"audioUrl": None})
                        except Exception as del_err:
                            if "404" in str(del_err) or "not found" in str(del_err).lower():
                                print(f"[CLOUD CLEANUP] Fail '{raw_audio_storage_path}' sudah tiada dalam Storage (Telah dipadam sebelumnya).")
                                job_ref.update({"audioUrl": None})
                            else:
                                raise del_err
                    except Exception as cleanup_err:
                        print(f"[CLOUD CLEANUP ERROR] Gagal memadam fail audio mentah: {cleanup_err}")
                        traceback.print_exc()
            else:
                print(f"[LOCAL] Fail MIDI akhir (ByteDance) disimpan di: {final_midi_path}")

        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"\nRalat Pada Aliran Kerja [IVORY-2 / BYTEDANCE]: {e}\n{error_trace}")
            if is_cloud and self.firebase_active and user_id and job_id:
                self.update_status(user_id, job_id, "FAILED", 100, error_msg=str(e))

    # process_incoming_cloud_job is inherited unchanged from CentralOrchestrator.
    # It calls self.run_pipeline(...) internally, which Python resolves to the
    # override above - so YouTube resolving, audio download/caching, Firestore
    # title sync, etc. all behave exactly like the other models. Only the
    # transcription step itself is a completely different engine.


bytedance_orchestrator = ByteDanceOrchestrator()


@app.route("/transcribe-bytedance", methods=["POST"])
def transcribe_bytedance_trigger():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload received"}), 400

    user_id = data.get("userId")
    job_id = data.get("jobId")
    audio_url = data.get("audioUrl")
    youtube_url = data.get("youtubeUrl")

    if not user_id or not job_id:
        return jsonify({"error": "Missing required fields (userId, jobId)"}), 400

    if not audio_url and not youtube_url:
        return jsonify({"error": "Please provide an audioUrl or a youtubeUrl"}), 400

    thread = threading.Thread(
        target=bytedance_orchestrator.process_incoming_cloud_job,
        args=(user_id, job_id, audio_url, youtube_url)
    )
    thread.start()

    return jsonify({
        "status": "QUEUED",
        "message": "Ivory-2 (ByteDance) piano transcription job triggered successfully.",
        "jobId": job_id
    }), 202

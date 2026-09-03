#!/usr/bin/env python3
"""
T1era Music - Ivory-4 Orchestrator Extension
==============================================
This file does NOT modify main.py or vortex_orchestrator.py.

It imports the Flask `app` and CentralOrchestrator straight from
vortex_orchestrator.py (which itself imports main.py), subclasses the
orchestrator so the pipeline STOPS after Stage 4 (Pitch Stabilization) -
skipping Stage 5 (Piano Arrangement & Styling) and Stage 6 (Adaptive
Musical Quantization) entirely - and registers ONE additional route on
the SAME Flask app:

    POST /transcribe-ivory

Because this chains through vortex_orchestrator.py -> main.py, importing
THIS file brings up all three routes at once:
    /transcribe          (Nexus-6,     Stage 0-6, from main.py)
    /transcribe-vortex   (Vortex-Ultra, Stage 0-5, from vortex_orchestrator.py)
    /transcribe-ivory    (Ivory-4,      Stage 0-4, from this file)

DEPLOYMENT NOTE:
Point Gunicorn at THIS file so all three routes register together:

    gunicorn ivory_orchestrator:app
"""

import time
import traceback
import threading
from pathlib import Path

from flask import request, jsonify

# Reuse everything already built and working - nothing here re-implements
# Firebase init, CORS, the Flask app, or the base pipeline. Importing this
# also runs vortex_orchestrator.py, which patches CentralOrchestrator's
# Firebase-attach logic (see vortex_orchestrator.py) - Ivory-4 inherits
# that fix automatically.
from vortex_orchestrator import (
    app,
    CentralOrchestrator,
    firestore,
    storage,
)

import input_file_1
import input_file_2
import input_file_3
import input_file_4


class IvoryOrchestrator(CentralOrchestrator):
    """
    Identical to CentralOrchestrator (main.py), except run_pipeline()
    stops right after Stage 4 (Pitch Stabilization). Stage 5 (Piano
    Arrangement & Styling) and Stage 6 (Quantization) never run, so the
    solo-piano performance's original expressive dynamics and voicing
    are captured as-is. Save/upload/Firestore behaviour is otherwise
    the same.

    Note: the Firebase-attach fix (correctly attaching to an already-
    initialized Firebase app regardless of which orchestrator instance
    initializes it first) is inherited automatically - it's patched onto
    the shared CentralOrchestrator class in vortex_orchestrator.py, which
    this file imports transitively. No need to redefine it here.
    """

    def run_pipeline(self, input_audio_path: Path, temp_work_dir: Path, is_cloud: bool,
                      user_id: str = None, job_id: str = None, bucket_name: str = None,
                      raw_audio_storage_path: str = None, track_title: str = None):
        """Runs Stage 0 through Stage 4 only. Styling (5) and quantization (6) are skipped."""
        start_time = time.time()
        print("\n" + "=" * 70)
        print(f"MULAKAN PIPELINE T1ERA MUSIC [IVORY-4] | Mode: {'CLOUD' if is_cloud else 'LOCAL'}")
        print("=" * 70)

        stage0_raw_mid = temp_work_dir / "stage0_raw.mid"
        stage1_clean_mid = temp_work_dir / "stage1_clean.mid"
        stage2_repaired_mid = temp_work_dir / "stage2_repaired.mid"
        stage3_reconstructed_mid = temp_work_dir / "stage3_reconstructed.mid"
        stage4_stabilized_mid = temp_work_dir / "stage4_stabilized.mid"  # FINAL output for Ivory-4

        try:
            # -------------------------------------------------------------
            # STAGE 0: Basic Pitch Transcription (Subprocess Isolation)
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "TRANSCRIBING_AUDIO", 20)

            import subprocess, sys
            print("[STAGE 0] Melarikan transkripsi di dalam subprocess berasingan untuk mengelakkan ralat deadlock...")
            cmd = [sys.executable, "input_file_0.py", str(input_audio_path), str(stage0_raw_mid)]
            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode != 0:
                print(f"[STAGE 0 ERROR] Subprocess gagal dengan kod exit {result.returncode}")
                print(f"STDOUT:\n{result.stdout}")
                print(f"STDERR:\n{result.stderr}")
                raise RuntimeError(f"Tahap 0 (Basic Pitch) gagal menghasilkan output: {result.stderr}")
            else:
                print("[STAGE 0 SUCCESS] Subprocess selesai dengan jayanya.")
                print(f"STDOUT:\n{result.stdout}")

            # Kekalkan nama fail Storage TETAP sebagai "final_score" supaya sentiasa
            # sepadan dengan URL fallback yang dijangka oleh frontend (app.js / ivory-progress.js)
            filename_base = "final_score"
            original_midi_url = ""

            if is_cloud and self.firebase_active and user_id and job_id:
                try:
                    remote_stage0_path = f"users/{user_id}/transcriptions/{job_id}/{filename_base}_stage0.mid"
                    print(f"[CLOUD] Memulakan muat naik Stage 0 MIDI ke: {remote_stage0_path}")
                    original_midi_url = self.upload_to_storage(stage0_raw_mid, remote_stage0_path, bucket_name)
                    print(f"[CLOUD SUCCESS] Fail MIDI asal (Stage 0) dimuat naik ke Firebase Storage: {original_midi_url}")

                    job_ref = self.db.collection("users").document(user_id).collection("midi_jobs").document(job_id)
                    job_ref.set({"originalMidiUrl": original_midi_url}, merge=True)
                except Exception as stage0_err:
                    print(f"[CLOUD ERROR] Gagal memproses muat naik Stage 0 MIDI: {stage0_err}")
                    traceback.print_exc()

            # -------------------------------------------------------------
            # STAGE 1: MIDI Cleanup
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "CLEANING_MIDI", 40)
            input_file_1.run_stage1(
                input_midi_path=stage0_raw_mid,
                output_midi_path=stage1_clean_mid,
                output_log_path=temp_work_dir / "stage1_log.txt"
            )

            # -------------------------------------------------------------
            # STAGE 2: Fragmented Note Repair
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "REPAIRING_NOTES", 55)
            stage2 = input_file_2.Stage2Pipeline(
                input_path=stage1_clean_mid,
                output_path=stage2_repaired_mid,
                log_path=temp_work_dir / "stage2_log.txt",
                csv_path=temp_work_dir / "stage2_report.csv",
                json_path=temp_work_dir / "stage2_diagnostics.json"
            )
            stage2.run()

            # -------------------------------------------------------------
            # STAGE 3: Melodic Reconstruction
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "RECONSTRUCTING_MELODY", 70)
            stage3 = input_file_3.Stage3Pipeline(
                input_path=stage2_repaired_mid,
                output_path=stage3_reconstructed_mid,
                log_path=temp_work_dir / "stage3_log.txt",
                csv_path=temp_work_dir / "stage3_report.csv",
                json_path=temp_work_dir / "stage3_diagnostics.json"
            )
            stage3.run()

            # -------------------------------------------------------------
            # STAGE 4: Pitch Stabilization - FINAL STAGE FOR IVORY-4
            # Stage 5 (Styling) and Stage 6 (Quantization) are intentionally
            # skipped to preserve the authentic, unstyled solo performance.
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "STABILIZING_PITCH", 90)
            stage4 = input_file_4.Stage4Pipeline(
                input_path=stage3_reconstructed_mid,
                output_path=stage4_stabilized_mid,
                log_path=temp_work_dir / "stage4_log.txt",
                csv_path=temp_work_dir / "stage4_report.csv",
                json_path=temp_work_dir / "stage4_diagnostics.json"
            )
            stage4.run()

            # -------------------------------------------------------------
            # UPLOAD FINAL MIDI (Stage 4 output) TO FIREBASE STORAGE
            # -------------------------------------------------------------
            total_time = time.time() - start_time
            print("\n" + "=" * 70)
            print(f"PROSES SELESAI JAYA [IVORY-4]! Tempoh aliran: {total_time:.2f} saat.")
            print("=" * 70)

            if is_cloud and self.firebase_active and user_id and job_id:
                self.update_status(user_id, job_id, "UPLOADING_RESULTS", 95)

                remote_path = f"users/{user_id}/transcriptions/{job_id}/{filename_base}.mid"
                download_url = self.upload_to_storage(stage4_stabilized_mid, remote_path, bucket_name)

                job_ref = self.db.collection("users").document(user_id).collection("midi_jobs").document(job_id)
                job_update_payload = {
                    "status": "COMPLETED",
                    "progress": 100,
                    "midiUrl": download_url,
                    "completedAt": firestore.SERVER_TIMESTAMP
                }
                if original_midi_url:
                    job_update_payload["originalMidiUrl"] = original_midi_url
                if track_title:
                    job_update_payload["title"] = track_title

                job_ref.update(job_update_payload)
                print(f"[CLOUD] Fail MIDI akhir (Stage 4) dimuat naik ke Firebase Storage: {download_url}")

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
                print(f"[LOCAL] Semua fail perantara (Stage 0 - 4) disimpan di: {temp_work_dir}")

        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"\nRalat Pada Aliran Kerja [IVORY-4]: {e}\n{error_trace}")
            if is_cloud and self.firebase_active and user_id and job_id:
                self.update_status(user_id, job_id, "FAILED", 100, error_msg=str(e))

    # process_incoming_cloud_job is inherited unchanged from CentralOrchestrator.
    # It calls self.run_pipeline(...) internally, which Python resolves to the
    # override above - so YouTube resolving, audio download/caching, Firestore
    # title sync, etc. all behave exactly like main.py, only the pipeline depth differs.


ivory_orchestrator = IvoryOrchestrator()


@app.route("/transcribe-ivory", methods=["POST"])
def transcribe_ivory_trigger():
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
        target=ivory_orchestrator.process_incoming_cloud_job,
        args=(user_id, job_id, audio_url, youtube_url)
    )
    thread.start()

    return jsonify({
        "status": "QUEUED",
        "message": "Ivory-4 transcription job triggered successfully.",
        "jobId": job_id
    }), 202

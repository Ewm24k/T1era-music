#!/usr/bin/env python3
"""
T1era Music MIDI Transcription & Styling Central Orchestrator
Menguruskan fail perantara sebagai fail sementara (dipadamkan secara automatik di Render),
berjalan sebagai pelayan Flask API untuk menyokong "auto-wake" pelan percuma Render,
dan menyimpan hasil akhir ke Firebase Storage [PerQueryResult].
"""

import os
import sys
import time
import tempfile
import traceback
from pathlib import Path

# Impor Flask untuk binaan API Web awan
try:
    from flask import Flask, request, jsonify
except ImportError:
    print("Error: 'flask' diperlukan untuk menjalankan pelayan API.")
    print("Sila pasang melalui: pip install flask")
    sys.exit(1)

# Periksa integrasi Firebase
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

# Import semua peringkat pipeline sedia ada anda (T1era-music)
try:
    import input_file_0  # Stage 0: Basic Pitch Transcription
    import input_file_1  # Stage 1: MIDI Cleanup
    import input_file_2  # Stage 2: Fragmented Note Repair
    import input_file_3  # Stage 3: Melodic Reconstruction
    import input_file_4  # Stage 4: Pitch Stabilization
    import input_file_5  # Stage 5: Piano Arrangement & Styling (TestPopPiano)
    import input_file_6  # Stage 6: Adaptive Musical Quantization (Final Step)
except ImportError as e:
    print(f"Ralat Import: Sila pastikan semua fail input_file_X.py berada di folder utama yang sama. Detail: {e}")
    sys.exit(1)


class OrchestratorConfig:
    FIREBASE_KEY_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "firebase-key.json")
    BUCKET_NAME = os.environ.get("FIREBASE_STORAGE_BUCKET", "t1era-music.appspot.com")


class CentralOrchestrator:
    def __init__(self):
        self.firebase_active = False
        if FIREBASE_AVAILABLE:
            self._init_firebase()

    def _init_firebase(self):
        try:
            if not firebase_admin._apps:
                if os.path.exists(OrchestratorConfig.FIREBASE_KEY_PATH):
                    cred = credentials.Certificate(OrchestratorConfig.FIREBASE_KEY_PATH)
                    firebase_admin.initialize_app(cred, {
                        'storageBucket': OrchestratorConfig.BUCKET_NAME
                    })
                    self.db = firestore.client()
                    self.bucket = storage.bucket()
                    self.firebase_active = True
                    print("[FIREBASE] Cloud Mode Aktif (T1era Music).")
                else:
                    print("[FIREBASE] Fail kredensial tidak ditemui. Berjalan dalam Mod Tempatan (VS Code).")
        except Exception as e:
            print(f"[FIREBASE] Gagal mengaktifkan Firebase: {e}. Mod Tempatan digunakan.")
            self.firebase_active = False

    def update_status(self, user_id: str, job_id: str, status: str, progress: int, error_msg: str = None):
        if self.firebase_active and user_id and job_id:
            try:
                job_ref = self.db.collection("users").document(user_id).collection("midi_jobs").document(job_id)
                payload = {
                    "status": status,
                    "progress": progress,
                    "updatedAt": firestore.SERVER_TIMESTAMP
                }
                if error_msg:
                    payload["error"] = error_msg
                job_ref.update(payload)
            except Exception as e:
                print(f"[FIREBASE ERROR] Gagal kemaskini status Firestore: {e}")
        
        print(f"[PROGRESS] {progress}% | Status: {status}")

    def upload_final_midi(self, local_path: Path, remote_path: str) -> str:
        """Hanya memuat naik fail MIDI akhir yang telah ditala (Stage 6) ke Firebase Storage"""
        if self.firebase_active:
            blob = self.bucket.blob(remote_path)
            blob.upload_from_filename(str(local_path))
            blob.make_public()
            return blob.public_url
        return ""

    def run_pipeline(self, input_audio_path: Path, temp_work_dir: Path, is_cloud: bool, user_id: str = None, job_id: str = None):
        """Menjalankan rantaian transkripsi Stage 0 ke 6 secara berturutan"""
        start_time = time.time()
        print("\n" + "=" * 70)
        print(f"MULAKAN PIPELINE T1ERA MUSIC | Mode: {'CLOUD' if is_cloud else 'LOCAL'}")
        print("=" * 70)

        stage0_raw_mid = temp_work_dir / "stage0_raw.mid"
        stage1_clean_mid = temp_work_dir / "stage1_clean.mid"
        stage2_repaired_mid = temp_work_dir / "stage2_repaired.mid"
        stage3_reconstructed_mid = temp_work_dir / "stage3_reconstructed.mid"
        stage4_stabilized_mid = temp_work_dir / "stage4_stabilized.mid"
        stage5_arranged_mid = temp_work_dir / "stage5_arranged.mid"    # Output dari TestPopPiano (input_file_5)
        stage6_final_mid = temp_work_dir / "stage6_final.mid"          # Output Akhir dari Quantization (input_file_6)

        try:
            # -------------------------------------------------------------
            # STAGE 0: Basic Pitch Transcription
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "TRANSCRIBING_AUDIO", 15)
            input_file_0.run_stage0(input_audio_path, stage0_raw_mid)

            # -------------------------------------------------------------
            # STAGE 1: MIDI Cleanup
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "CLEANING_MIDI", 30)
            input_file_1.run_stage1(
                input_midi_path=stage0_raw_mid,
                output_midi_path=stage1_clean_mid,
                output_log_path=temp_work_dir / "stage1_log.txt"
            )

            # -------------------------------------------------------------
            # STAGE 2: Fragmented Note Repair (input_file_2)
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "REPAIRING_NOTES", 45)
            stage2 = input_file_2.Stage2Pipeline(
                input_path=stage1_clean_mid,
                output_path=stage2_repaired_mid,
                log_path=temp_work_dir / "stage2_log.txt",
                csv_path=temp_work_dir / "stage2_report.csv",
                json_path=temp_work_dir / "stage2_diagnostics.json"
            )
            stage2.run()

            # -------------------------------------------------------------
            # STAGE 3: Melodic Reconstruction (input_file_3)
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "RECONSTRUCTING_MELODY", 60)
            stage3 = input_file_3.Stage3Pipeline(
                input_path=stage2_repaired_mid,
                output_path=stage3_reconstructed_mid,
                log_path=temp_work_dir / "stage3_log.txt",
                csv_path=temp_work_dir / "stage3_report.csv",
                json_path=temp_work_dir / "stage3_diagnostics.json"
            )
            stage3.run()

            # -------------------------------------------------------------
            # STAGE 4: Pitch Stabilization (input_file_4)
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "STABILIZING_PITCH", 75)
            stage4 = input_file_4.Stage4Pipeline(
                input_path=stage3_reconstructed_mid,
                output_path=stage4_stabilized_mid,
                log_path=temp_work_dir / "stage4_log.txt",
                csv_path=temp_work_dir / "stage4_report.csv",
                json_path=temp_work_dir / "stage4_diagnostics.json"
            )
            stage4.run()

            # -------------------------------------------------------------
            # STAGE 5: Piano Arrangement & Styling / TestPopPiano (input_file_5)
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "ARRANGING_PIANO_STYLE", 85)
            stage5 = input_file_5.Stage5Pipeline(
                input_path=stage4_stabilized_mid,
                output_path=stage5_arranged_mid,
                log_path=temp_work_dir / "stage5_log.txt",
                csv_path=temp_work_dir / "stage5_report.csv",
                json_path=temp_work_dir / "stage5_diagnostics.json",
                sections_json_path=temp_work_dir / "sections.json"
            )
            stage5.run()

            # -------------------------------------------------------------
            # STAGE 6: Adaptive Musical Quantization / Final Step (input_file_6)
            # -------------------------------------------------------------
            self.update_status(user_id, job_id, "QUANTIZING_TIMELINE", 90)
            stage6 = input_file_6.Stage5Pipeline(
                input_path=stage5_arranged_mid,
                output_path=stage6_final_mid,
                log_path=temp_work_dir / "stage6_log.txt",
                csv_path=temp_work_dir / "stage6_report.csv",
                json_path=temp_work_dir / "stage6_diagnostics.json"
            )
            stage6.run()

            # -------------------------------------------------------------
            # UPLOAD HANYA 1 MIDI AKHIR KE FIREBASE STORAGE
            # -------------------------------------------------------------
            total_time = time.time() - start_time
            print("\n" + "=" * 70)
            print(f"PROSES SELESAI JAYA! Tempoh aliran: {total_time:.2f} saat.")
            print("=" * 70)

            if is_cloud and self.firebase_active and user_id and job_id:
                self.update_status(user_id, job_id, "UPLOADING_RESULTS", 95)
                
                remote_path = f"users/{user_id}/transcriptions/{job_id}/final_score.mid"
                download_url = self.upload_final_midi(stage6_final_mid, remote_path)
                
                # Kemaskini Firestore
                job_ref = self.db.collection("users").document(user_id).collection("midi_jobs").document(job_id)
                job_ref.update({
                    "status": "COMPLETED",
                    "progress": 100,
                    "midiUrl": download_url,
                    "completedAt": firestore.SERVER_TIMESTAMP
                })
                print(f"[CLOUD] Fail MIDI akhir dimuat naik ke Firebase Storage: {download_url}")
            else:
                print(f"[LOCAL] Semua fail perantara (Stage 0 - 6) disimpan di: {temp_work_dir}")

        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"\nRalat Pada Aliran Kerja: {e}\n{error_trace}")
            if is_cloud and self.firebase_active and user_id and job_id:
                self.update_status(user_id, job_id, "FAILED", 100, error_msg=str(e))

    def process_incoming_cloud_job(self, user_id: str, job_id: str, remote_audio_path: str):
        """Memproses tugasan individu di dalam workspace sementara Render"""
        print(f"[CLOUD PROCESSING] Memulakan tugasan: {job_id} untuk Pengguna: {user_id}")
        
        with tempfile.TemporaryDirectory(prefix=f"t1era_{job_id}_") as tmp_dir:
            temp_work_path = Path(tmp_dir)
            local_audio_path = temp_work_path / "input_audio.mp3"
            
            try:
                # Ambil fail audio asal dari Firebase Storage
                print(f"[{job_id}] Memuat turun audio dari Storage...")
                
                # Pembersihan format URL jika mengandungi parameter muat turun luaran
                if "firebasestorage.googleapis.com" in remote_audio_path:
                    path_start = remote_audio_path.find("/o/") + 3
                    path_end = remote_audio_path.find("?alt=media")
                    from urllib.parse import unquote
                    remote_audio_path = unquote(remote_audio_path[path_start:path_end])

                blob = self.bucket.blob(remote_audio_path)
                blob.download_to_filename(str(local_audio_path))
                
                # Jalankan pipeline pemprosesan
                self.run_pipeline(
                    input_audio_path=local_audio_path,
                    temp_work_dir=temp_work_path,
                    is_cloud=True,
                    user_id=user_id,
                    job_id=job_id
                )
            except Exception as e:
                print(f"[{job_id}] Gagal memproses fail awan: {e}")
                self.update_status(user_id, job_id, "FAILED", 100, error_msg=str(e))


# =========================================================
# FLASK WEB SERVER BLOCK (AUTO-WAKE CONFIGURATION FOR RENDER)
# =========================================================
app = Flask(__name__)
orchestrator = CentralOrchestrator()

@app.route("/", methods=["GET"])
def index():
    # Tindak balas kesihatan pelayan (Render Health Check)
    return jsonify({
        "server": "T1era Music API",
        "status": "ONLINE",
        "firebase_connected": orchestrator.firebase_active
    }), 200

@app.route("/transcribe", methods=["POST"])
def transcribe_trigger():
    """
    Endpoint HTTP POST yang dipanggil oleh Webapp selepas lagu dimuat naik.
    Panggilan masuk ke endpoint ini akan mengejutkan Render daripada mode tidur.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload received"}), 400

    user_id = data.get("userId")
    job_id = data.get("jobId")
    remote_audio_path = data.get("audioUrl") # Laluan fail audio di Firebase Storage

    if not user_id or not job_id or not remote_audio_path:
        return jsonify({"error": "Missing required fields (userId, jobId, audioUrl)"}), 400

    # Jalankan tugasan secara tidak segerak (asynchronous) supaya panggilan HTTP tidak luput masa (timeout)
    import threading
    thread = threading.Thread(
        target=orchestrator.process_incoming_cloud_job,
        args=(user_id, job_id, remote_audio_path)
    )
    thread.start()

    return jsonify({
        "status": "QUEUED",
        "message": "Transcription job triggered successfully. Render is processing.",
        "jobId": job_id
    }), 202


def run_local_test():
    """Mod Ujian Tempatan di PC (VS Code)"""
    print("[LOCAL START] Membina simulasi ujian tempatan T1era Music di PC...")
    
    base_dir = Path(".")
    input_dir = base_dir / "input"
    output_dir = base_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    audio_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.ogg'}
    audio_files = []
    if input_dir.exists():
        audio_files = [
            f for f in input_dir.iterdir() 
            if f.is_file() and f.suffix.lower() in audio_extensions
        ]
        
    if audio_files:
        target_audio = audio_files[0]
        orchestrator.run_pipeline(
            input_audio_path=target_audio,
            temp_work_dir=output_dir,
            is_cloud=False
        )
    else:
        print("Ralat: Sila letakkan fail audio ujian (.mp3 atau .wav) di dalam folder 'input/' terlebih dahulu.")


if __name__ == "__main__":
    # Jika dijalankan di pelayan Render, ia mengesan pemboleh ubah PORT
    port = int(os.environ.get("PORT", 10000))
    
    if os.environ.get("RENDER"):
        # Mod Awan: Mulakan pelayan API Flask di Render
        app.run(host="0.0.0.0", port=port)
    else:
        # Mod Tempatan: Jalankan ujian simulasi local
        run_local_test()

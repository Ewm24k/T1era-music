import { auth, googleProvider, db, storage } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Pautan URL Pelayan Render API T1era Music
const RENDER_BACKEND_URL = "https://t1era-music.onrender.com/transcribe";

// UI DOM Elements
const overlay = document.getElementById("interactive-overlay");
const loadingScreen = document.getElementById("loading-screen");
const landingScreen = document.getElementById("landing-screen");
const typewriterElement = document.getElementById("typewriter");
const sound = document.getElementById("bg-sound");
const v1 = document.getElementById("vid1");
const v2 = document.getElementById("vid2");
const enterBtn = document.getElementById("enter-studio-btn");

// Auth Controls
const authOverlay = document.getElementById("auth-overlay");
const authTitle = document.getElementById("auth-title");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authErrorMsg = document.getElementById("auth-error-msg");
const authSwitchView = document.getElementById("auth-switch-view");
const googleAuthBtn = document.getElementById("google-auth-btn");

// Menu Footer Profile UI elements
const menuFooter = document.getElementById("menu-footer");
const userNameEl = document.getElementById("user-name");
const userEmailEl = document.getElementById("user-email");
const userAvatarEl = document.getElementById("user-avatar");
const avatarFallbackEl = document.getElementById("avatar-fallback");
const logoutBtn = document.getElementById("logout-btn");

// Sign Out Feedback Screen Controls
const signoutOverlay = document.getElementById("signout-overlay");
const signoutStatusText = document.getElementById("signout-status-text");

// Maintenance Popups Controls
const maintenanceOverlay = document.getElementById("maintenance-overlay");
const maintenanceCloseBtn = document.getElementById("maintenance-close-btn");

// Services Hub & Swap Screen Controls
const servicesOverlay = document.getElementById("services-overlay");
const consoleTitle = document.getElementById("console-title");
const mainServicesGrid = document.getElementById("main-services-grid");
const uploadServicesGrid = document.getElementById("upload-services-grid");
const generateSheetCard = document.getElementById("generate-sheet-card");
const backToConsoleBtn = document.getElementById("back-to-console-btn");

// Verification screen Controls
const verificationScreen = document.getElementById("verification-screen");
const verificationTerminal = document.getElementById("verification-terminal");

// Web3 Upload Panel Controls
const youtubeLinkInput = document.getElementById("youtube-link-input");
const youtubeSubmitBtn = document.getElementById("youtube-submit-btn");
const fileDropzoneTrigger = document.getElementById("file-dropzone-trigger");
const audioFileInput = document.getElementById("audio-file-input");
const dropzoneLabelText = document.getElementById("dropzone-label-text");

let isSignUpState = false;

// Track Auth State & Live sync profile variables
let currentUserObj = null;

if (auth) {
  onAuthStateChanged(auth, (user) => {
    currentUserObj = user;
    if (user) {
      // Update Menu Profile info with active user parameters from database
      userNameEl.textContent = user.displayName || "Studio Creator";
      userEmailEl.textContent = user.email || "";

      if (user.photoURL) {
        userAvatarEl.src = user.photoURL;
        userAvatarEl.style.display = "block";
        avatarFallbackEl.style.display = "none";
      } else {
        userAvatarEl.style.display = "none";
        avatarFallbackEl.style.display = "flex";
        // Render initials as a default avatar
        const initials = user.email
          ? user.email.substring(0, 2).toUpperCase()
          : "ST";
        avatarFallbackEl.textContent = initials;
      }

      // Render menu footer
      menuFooter.style.display = "flex";
    } else {
      // Hide menu footer on log out
      menuFooter.style.display = "none";
    }
  });
}

// App Loading Logic
const textToType = "T1ERA Music Studio ...";
let charIndex = 0;

// Fullscreen capability checks
function triggerNativeFullscreen() {
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) {
    docEl
      .requestFullscreen()
      .catch((err) => console.log("Fullscreen request rejected", err));
  } else if (docEl.webkitRequestFullscreen) {
    docEl.webkitRequestFullscreen();
  } else if (docEl.msRequestFullscreen) {
    docEl.msRequestFullscreen();
  }
}

function launchFullscreenStudio() {
  triggerNativeFullscreen();

  overlay.style.opacity = "0";
  setTimeout(() => {
    overlay.style.display = "none";
  }, 1200);

  if (sound) {
    sound.play().catch((err) => {
      console.warn(
        "Background audio playback is restricted or file is missing:",
        err,
      );
    });
  }

  loadingScreen.style.opacity = "1";

  try {
    v1.load();
    v2.load();
  } catch (e) {
    console.warn("Video resources failed to load:", e);
  }

  setTimeout(typeEffect, 1200);
}

function typeEffect() {
  if (charIndex < textToType.length) {
    typewriterElement.textContent += textToType.charAt(charIndex);
    charIndex++;
    setTimeout(typeEffect, 150);
  } else {
    setTimeout(() => {
      if (sound) {
        try {
          sound.pause();
        } catch (e) {}
      }
      loadingScreen.style.opacity = "0";

      v1.muted = false;
      v1.play()
        .then(() => {
          landingScreen.classList.add("active");
        })
        .catch((e) => {
          v1.muted = true;
          v1.play()
            .then(() => {
              landingScreen.classList.add("active");
            })
            .catch((err) => {
              console.error("Critical: Videos failed to auto-play.", err);
              landingScreen.classList.add("active");
            });
        });
    }, 1500);
  }
}

overlay.addEventListener("click", launchFullscreenStudio);

// Video transition logic
v1.addEventListener("ended", () => {
  v2.play()
    .then(() => {
      v2.style.opacity = "1";
      v1.style.opacity = "0";

      setTimeout(() => {
        enterBtn.classList.add("show");
      }, 4000);
    })
    .catch((err) => {
      console.warn("Loop transition failed:", err);
    });
});

// Slide Menu
const menuToggle = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");
const menuOverlay = document.getElementById("menu-overlay");

function toggleMenu() {
  menuToggle.classList.toggle("active");
  sideMenu.classList.toggle("open");
  menuOverlay.classList.toggle("active");
}

menuToggle.addEventListener("click", toggleMenu);
menuOverlay.addEventListener("click", toggleMenu);

// Interactive Modal Action: Evaluates checks dynamically every time clicked
enterBtn.addEventListener("click", () => {
  enterBtn.classList.remove("show");
  runSessionVerification();
});

// Flip between login and registration layouts
authSwitchView.addEventListener("click", () => {
  isSignUpState = !isSignUpState;
  authErrorMsg.style.display = "none";

  if (isSignUpState) {
    authTitle.textContent = "Create Account";
    authSubmitBtn.textContent = "Register";
    authSwitchView.innerHTML = "Already have an account? <span>Sign In</span>";
  } else {
    authTitle.textContent = "Sign In";
    authSubmitBtn.textContent = "Access";
    authSwitchView.innerHTML = "Don't have an account? <span>Sign Up</span>";
  }
});

// Intercept form submissions
authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authErrorMsg.style.display = "none";

  const email = authEmail.value;
  const password = authPassword.value;

  if (isSignUpState) {
    authOverlay.classList.remove("active");
    maintenanceOverlay.classList.add("active");
  } else {
    if (!auth) {
      authErrorMsg.textContent = "Database connection offline.";
      authErrorMsg.style.display = "block";
      enterBtn.classList.add("show");
      return;
    }
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        authOverlay.classList.remove("active");
        runSessionVerification();
      })
      .catch((error) => {
        authErrorMsg.textContent = formatAuthErrors(error.code);
        authErrorMsg.style.display = "block";
        enterBtn.classList.add("show");
      });
  }
});

// Handle Google Sign-In with robust configuration and domain checks
googleAuthBtn.addEventListener("click", async () => {
  authErrorMsg.style.display = "none";
  if (!auth) {
    authErrorMsg.textContent = "Firebase is uninitialized.";
    authErrorMsg.style.display = "block";
    return;
  }

  try {
    await signInWithPopup(auth, googleProvider);
    authOverlay.classList.remove("active");
    runSessionVerification();
  } catch (error) {
    if (
      error.code === "auth/configuration-not-found" ||
      error.message.includes("CONFIGURATION_NOT_FOUND")
    ) {
      authErrorMsg.innerHTML =
        "<strong>Firebase Setup Required:</strong><br>Please enable the Google login provider inside your Firebase Console.";
    } else if (
      error.code === "auth/unauthorized-domain" ||
      error.message.includes("unauthorized-domain")
    ) {
      authErrorMsg.innerHTML =
        "<strong>Domain Not Authorized:</strong><br>Please add <code>t1era-music.netlify.app</code> to the Authorized Domains list in your Firebase Console (Authentication > Settings).";
    } else {
      authErrorMsg.textContent = "Google Login failed. Please try again.";
    }
    authErrorMsg.style.display = "block";
    enterBtn.classList.add("show");
    console.error("Firebase Auth Exception:", error);
  }
});

// Dismiss maintenance alert modal
maintenanceCloseBtn.addEventListener("click", () => {
  maintenanceOverlay.classList.remove("active");
  setTimeout(() => {
    authOverlay.classList.add("active");
  }, 400);
});

function formatAuthErrors(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Invalid email formatting.";
    case "auth/wrong-password":
      return "Incorrect password details.";
    case "auth/user-not-found":
      return "No account matches this address.";
    default:
      return "Authentication failed. Try again.";
  }
}

// Dismiss auth forms on outside click
authOverlay.addEventListener("click", (e) => {
  if (e.target === authOverlay) {
    authOverlay.classList.remove("active");
    setTimeout(() => {
      enterBtn.classList.add("show");
    }, 500);
  }
});

// Dismiss Services overlay on outside click
servicesOverlay.addEventListener("click", (e) => {
  if (e.target === servicesOverlay) {
    resetConsoleState();
    servicesOverlay.classList.remove("active");
    setTimeout(() => {
      enterBtn.classList.add("show");
    }, 500);
  }
});

// Option 2 ("Generate Raw Sheet Music") triggers the card dismissal & upload menu transition
generateSheetCard.addEventListener("click", switchToUploadMenu);
backToConsoleBtn.addEventListener("click", switchToMainMenu);

function switchToUploadMenu() {
  // Fade out main console cards
  mainServicesGrid.classList.remove("grid-visible");
  mainServicesGrid.classList.add("grid-hidden");

  setTimeout(() => {
    mainServicesGrid.style.display = "none";
    uploadServicesGrid.style.display = "grid";

    // Reflow trigger for transition
    void uploadServicesGrid.offsetWidth;

    uploadServicesGrid.classList.remove("grid-hidden");
    uploadServicesGrid.classList.add("grid-visible");

    // Dynamic label and back navigation integration
    consoleTitle.style.opacity = "0";
    setTimeout(() => {
      consoleTitle.textContent = "Upload Media Source";
      consoleTitle.style.opacity = "1";
    }, 200);

    backToConsoleBtn.classList.add("show");
  }, 400);
}

function switchToMainMenu() {
  // Fade out upload console cards
  uploadServicesGrid.classList.remove("grid-visible");
  uploadServicesGrid.classList.add("grid-hidden");

  setTimeout(() => {
    uploadServicesGrid.style.display = "none";
    mainServicesGrid.style.display = "grid";

    // Reflow trigger for transition
    void mainServicesGrid.offsetWidth;

    mainServicesGrid.classList.remove("grid-hidden");
    mainServicesGrid.classList.add("grid-visible");

    // Restore main console state
    consoleTitle.style.opacity = "0";
    setTimeout(() => {
      consoleTitle.textContent = "Studio Console";
      consoleTitle.style.opacity = "1";
    }, 200);

    backToConsoleBtn.classList.remove("show");
  }, 400);
}

function resetConsoleState() {
  mainServicesGrid.classList.remove("grid-hidden");
  mainServicesGrid.classList.add("grid-visible");
  mainServicesGrid.style.display = "grid";

  uploadServicesGrid.classList.remove("grid-visible");
  uploadServicesGrid.classList.add("grid-hidden");
  uploadServicesGrid.style.display = "none";

  consoleTitle.textContent = "Studio Console";
  backToConsoleBtn.classList.remove("show");
}

// Session Verification Logic
function runSessionVerification() {
  verificationScreen.classList.add("active");
  verificationTerminal.style.color = "#ffffff";
  verificationTerminal.style.textShadow = "0 0 10px #ffffff";

  verificationTerminal.textContent = "Verifying authorization sequence...";

  setTimeout(() => {
    verificationTerminal.textContent = "Querying live session credentials...";

    setTimeout(() => {
      const user = auth ? auth.currentUser : null;

      if (user) {
        verificationTerminal.textContent = `Active Session Found: ${user.email}`;

        setTimeout(() => {
          verificationTerminal.textContent =
            "Syncing listening database events...";

          setTimeout(() => {
            verificationTerminal.style.color = "#00ff66";
            verificationTerminal.style.textShadow = "0 0 15px #00ff66";
            verificationTerminal.textContent = "Status: AUTHORIZED.";

            setTimeout(() => {
              verificationScreen.classList.remove("active");
              
              // FIX: Show the 3-option menu overlay on the landing page instead of redirecting directly
              servicesOverlay.classList.add("active"); 
            }, 1200);
          }, 1200);
        }, 1200);
      } else {
        verificationTerminal.style.color = "#ff4a4a";
        verificationTerminal.style.textShadow = "0 0 15px #ff4a4a";
        verificationTerminal.textContent =
          "Status: UNRESOLVED. Directing to authentication gate...";

        setTimeout(() => {
          verificationScreen.classList.remove("active");
          authOverlay.classList.add("active");
        }, 1500);
      }
    }, 1200);
  }, 1200);
}

// Sign Out Logic & Live Sync Process
logoutBtn.addEventListener("click", () => {
  // 1. Instantly close the sliding sidebar
  toggleMenu();

  // 2. Load the disconnection overlay
  signoutOverlay.style.display = "flex";
  setTimeout(() => {
    signoutOverlay.classList.add("active");
  }, 10);

  signoutStatusText.style.color = "#ffffff";
  signoutStatusText.style.textShadow = "0 0 8px rgba(255, 255, 255, 0.3)";
  signoutStatusText.textContent = "Disconnecting session...";

  // 3. Simulates database sync sequence before closing session
  setTimeout(() => {
    signoutStatusText.textContent = "Syncing local database events...";

    setTimeout(() => {
      signOut(auth)
        .then(() => {
          // Success feedback after successful backend event verification
          signoutStatusText.style.color = "#ff4a4a";
          signoutStatusText.style.textShadow = "0 0 15px #ff4a4a";
          signoutStatusText.textContent = "Sign out Successful.";

          // Hide existing services layout
          resetConsoleState();
          servicesOverlay.classList.remove("active");

          setTimeout(() => {
            // Turn off and reset signout page state
            signoutOverlay.classList.remove("active");
            setTimeout(() => {
              signoutOverlay.style.display = "none";
              // Re-trigger visual "Enter Studio" action button
              enterBtn.classList.add("show");
            }, 600);
          }, 1500);
        })
        .catch((err) => {
          console.error("Firebase Signout Failure:", err);
          signoutStatusText.textContent = "Session Signout Failed.";
          setTimeout(() => {
            signoutOverlay.classList.remove("active");
            setTimeout(() => {
              signoutOverlay.style.display = "none";
            }, 600);
          }, 1500);
        });
    }, 1000);
  }, 1000);
});


// =========================================================
// --- T1ERA MUSIC WEB3 UPLOAD & PIPELINE INTEGRATION ---
// =========================================================

// Pembantu pengesanan format URL YouTube sedia ada
function isValidYouTubeUrl(url) {
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return pattern.test(url);
}

// 1. PENGENDALI TRANSAKSI ALIRAN YOUTUBE (Dengan Simulasi 3-Fasa Pengesahan & Butang Continue)
youtubeSubmitBtn.addEventListener("click", () => {
  const urlValue = youtubeLinkInput.value.trim();
  
  if (!urlValue) {
    alert("Please enter a YouTube video URL first.");
    return;
  }
  
  if (!isValidYouTubeUrl(urlValue)) {
    alert("Invalid address. Please enter a structured YouTube link.");
    return;
  }

  if (!currentUserObj) {
    alert("Authorization lost. Please sign in again.");
    return;
  }

  const userId = currentUserObj.uid;
  const jobId = "yt_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

  // Tutup panel konsol perkhidmatan utama
  servicesOverlay.classList.remove("active");

  // Tampilkan skrin terminal untuk visualisasi muat turun YouTube
  verificationScreen.classList.add("active");
  verificationTerminal.style.color = "#ffffff";
  verificationTerminal.style.textShadow = "0 0 10px #ffffff";

  // SIMULASI DETAL 3-FASA MUAT TURUN & EKSTRAKSI YOUTUBE
  updateTerminalText(`[T1ERA ENGINE] Initializing Stream Downloader...`);

  setTimeout(() => {
    updateTerminalText(
      `[T1ERA ENGINE] Initializing Stream Downloader...<br>` +
      `[PHASE 1] Loading YouTube link... <span style="color:#00ff66;">[SUCCESS ✓]</span>`
    );

    setTimeout(() => {
      updateTerminalText(
        `[T1ERA ENGINE] Initializing Stream Downloader...<br>` +
        `[PHASE 1] Loading YouTube link... <span style="color:#00ff66;">[SUCCESS ✓]</span><br>` +
        `[PHASE 2] Extracting stream into high-fidelity audio... <span style="color:#00ff66;">[SUCCESS ✓]</span>`
      );

      setTimeout(() => {
        updateTerminalText(
          `[T1ERA ENGINE] Initializing Stream Downloader...<br>` +
          `[PHASE 1] Loading YouTube link... <span style="color:#00ff66;">[SUCCESS ✓]</span><br>` +
          `[PHASE 2] Extracting stream into high-fidelity audio... <span style="color:#00ff66;">[SUCCESS ✓]</span><br>` +
          `[PHASE 3] Caching raw track to local temp workspace... <span style="color:#00ff66;">[SUCCESS ✓]</span>`
        );

        // PAPARKAN BUTANG CONTINUE UNTUK MEMICU ALIRAN KERJA PIPELINE PENUH
        const continueBtnId = `continue-btn-${jobId}`;
        verificationTerminal.innerHTML += `
          <br><br>
          <button id="${continueBtnId}" class="web3-action-btn pulse-glow-blue" style="margin-top:15px; padding:10px 24px; font-size:0.85rem; border-color:#ff914d; color:#ff914d; font-weight:bold;">
            [ CONTINUE TO STUDIO SCORING ]
          </button>
        `;

        // Daftar pendengar klik pada butang Continue
        document.getElementById(continueBtnId).addEventListener("click", () => {
          updateTerminalText(`[SYSTEM] Starting transcription pipeline sequence...`);
          
          // Daftarkan dokumen kerja (Job Document) baru ke Firestore subcollection
          const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
          setDoc(jobRef, {
            status: "QUEUED",
            progress: 0,
            youtubeUrl: urlValue,
            createdAt: serverTimestamp()
          })
          .then(() => {
            // Tukar mod terminal untuk mendengar kemas kini progress secara langsung dari Render
            openLiveTerminalConsole(userId, jobId);

            // Kirim permintaan HTTP POST ke pelayan Render untuk memicu transkripsi Stage 0 - 6
            fetch(RENDER_BACKEND_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: userId,
                jobId: jobId,
                youtubeUrl: urlValue
              })
            })
            .then(res => {
              if (!res.ok) throw new Error("Server failed to respond.");
              return res.json();
            })
            .then(data => {
              console.log("Render T1era Music backend transcription triggered:", data);
            })
            .catch(err => {
              console.warn("Render waking up (Cold start latency normal):", err);
            });
          })
          .catch(err => {
            alert("Failed to register job document in Firestore: " + err.message);
          });
        });

      }, 1200);
    }, 1200);
  }, 1000);
});

// 2. Trigger native device folder selection on click
fileDropzoneTrigger.addEventListener("click", () => {
  audioFileInput.click();
});

// 3. Pengendali Muat Naik Fail Audio Tempatan (Firebase Storage Upload + Render Trigger)
audioFileInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) {
    dropzoneLabelText.textContent = "Select Music File";
    dropzoneLabelText.style.color = "";
    dropzoneLabelText.style.textShadow = "";
    return;
  }

  const selectedFile = files[0];
  
  if (!currentUserObj) {
    alert("Authorization lost. Please sign in again.");
    return;
  }

  const userId = currentUserObj.uid;
  const jobId = "file_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

  // Tutup panel konsol perkhidmatan
  servicesOverlay.classList.remove("active");

  // Kemaskini teks Dropzone sementara memproses
  dropzoneLabelText.textContent = "UPLOADING...";
  dropzoneLabelText.style.color = "#10b981";
  dropzoneLabelText.style.textShadow = "0 0 10px rgba(16, 185, 129, 0.4)";

  // Tampilkan Konsol Skrin Terminal untuk memaparkan status muat naik
  verificationScreen.classList.add("active");
  updateTerminalText(`[STORAGE] Initiating upload for: ${selectedFile.name.substring(0, 15)}...`);

  // Takrifkan rujukan muat naik Firebase Storage
  const storageRef = ref(storage, `users/${userId}/transcriptions/${jobId}/${selectedFile.name}`);
  const uploadTask = uploadBytesResumable(storageRef, selectedFile);

  uploadTask.on("state_changed", 
    (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      updateTerminalText(`[STORAGE] Uploading file to Cloud: ${percent}%`);
    }, 
    (error) => {
      alert("Failed to upload audio to Cloud Storage: " + error.message);
      verificationScreen.classList.remove("active");
      dropzoneLabelText.textContent = "Select Music File";
    }, 
    () => {
      // Muat naik ke Storage Selesai
      getDownloadURL(uploadTask.snapshot.ref).then((downloadUrl) => {
        updateTerminalText("[STORAGE] Upload success. Creating Firestore tracking document...");
        
        // Daftarkan dokumen kerja di Firestore
        const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
        setDoc(jobRef, {
          status: "QUEUED",
          progress: 0,
          audioUrl: downloadUrl,
          createdAt: serverTimestamp()
        })
        .then(() => {
          // Beralih ke paparan pemantauan pipeline Render di terminal
          openLiveTerminalConsole(userId, jobId);

          // Trigger API Render
          fetch(RENDER_BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: userId,
              jobId: jobId,
              audioUrl: downloadUrl
            })
          });
        })
        .catch(err => {
          alert("Failed to write tracking document in Firestore: " + err.message);
          verificationScreen.classList.remove("active");
        });
      });
    }
  );
});

// Helper untuk mengemas kini teks terminal
function updateTerminalText(text) {
  verificationTerminal.innerHTML = text;
}

// 4. Konsol Pemantauan Status Pipeline Masa Nyata & Automasi Redirection `midiano.html`
function openLiveTerminalConsole(userId, jobId) {
  verificationScreen.classList.add("active");
  verificationTerminal.style.color = "#ffffff";
  verificationTerminal.style.textShadow = "0 0 10px #ffffff";
  updateTerminalText("[SYSTEM] Connecting to T1era Cloud Synthesizer...");

  const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
  
  // Daftarkan Firestore onSnapshot Listener secara real-time
  const unsubscribe = onSnapshot(jobRef, (snapshot) => {
    if (!snapshot.exists()) return;

    const data = snapshot.to_dict();
    const status = data.status;
    const progress = data.progress || 0;

    // Menampilkan status kemajuan peringkat pemprosesan sepadan dengan nama pipeline Render
    if (status === "QUEUED") {
      updateTerminalText(`[SYSTEM] Job queued. Render is waking up...<br>[PROGRESS] ${progress}%`);
    } else if (status === "DOWNLOADING_YOUTUBE") {
      updateTerminalText(`[STAGE 0] Downloading YouTube Audio stream...<br>[PROGRESS] ${progress}%`);
    } else if (status === "DOWNLOADING_AUDIO") {
      updateTerminalText(`[STAGE 0] Downloading raw audio file...<br>[PROGRESS] ${progress}%`);
    } else if (status === "TRANSCRIBING_AUDIO") {
      updateTerminalText(`[STAGE 0] Running Basic Pitch model transcribing...<br>[PROGRESS] ${progress}%`);
    } else if (status === "CLEANING_MIDI") {
      updateTerminalText(`[STAGE 1] Running Stage 1 MIDI Cleanup...<br>[PROGRESS] ${progress}%`);
    } else if (status === "REPAIRING_NOTES") {
      updateTerminalText(`[STAGE 2] Register-Aware Fragmented Note Repairing...<br>[PROGRESS] ${progress}%`);
    } else if (status === "RECONSTRUCTING_MELODY") {
      updateTerminalText(`[STAGE 3] Melody Contour & Melodic Reconstruction...<br>[PROGRESS] ${progress}%`);
    } else if (status === "STABILIZING_PITCH") {
      updateTerminalText(`[STAGE 4] Octave Correction & Pitch Stabilization...<br>[PROGRESS] ${progress}%`);
    } else if (status === "ARRANGING_PIANO_STYLE") {
      updateTerminalText(`[STAGE 5] Arranging Piano Accompaniment (TestPopPiano)...<br>[PROGRESS] ${progress}%`);
    } else if (status === "QUANTIZING_TIMELINE") {
      updateTerminalText(`[STAGE 6] Timeline Warping & Quantization...<br>[PROGRESS] ${progress}%`);
    } else if (status === "UPLOADING_RESULTS") {
      updateTerminalText(`[SUCCESS] Compiling results. Uploading MIDI file...<br>[PROGRESS] ${progress}%`);
    } else if (status === "COMPLETED") {
      const midiUrl = data.midiUrl;

      // SIMPAN URL FAIL MIDI KE LOCAL STORAGE (Sistem Autoload Fail Fail-Safe)
      localStorage.setItem("t1era_current_midi", midiUrl);

      updateTerminalText(
        `[SYSTEM] CONSOLE OK.<br>` +
        `[SUCCESS] MIDI Generated!<br>` +
        `[REDIRECT] Launching T1era Player...`
      );
      
      // Hentikan pendengar Firestore secara selamat sebelum pusingan navigasi
      unsubscribe();

      // AUTOMATIK BUKA DAN AUTOLOAD FAIL MIDI DI MIDIANO.HTML SELEPAS 1.5 SAAT
      setTimeout(() => {
        window.location.href = "midiano.html?midi=" + encodeURIComponent(midiUrl);
      }, 1500);

    } else if (status === "FAILED") {
      const error = data.error || "Unknown pipeline error.";
      updateTerminalText(`[ERROR] Processing failed: ${error}<br><br><span style="color:#ff4a4a; cursor:pointer;" onclick="document.getElementById('verification-screen').classList.remove('active')">[ CLOSE TERMINAL ]</span>`);
      unsubscribe();
    }
  });

  // Benarkan terminal ditutup apabila di klik di luar ruang teks (hanya apabila Selesai/Gagal)
  verificationScreen.addEventListener("click", (e) => {
    if (e.target === verificationScreen) {
      const text = verificationTerminal.innerHTML;
      if (text.includes("CONSOLE OK") || text.includes("ERROR") || text.includes("REDIRECT")) {
        verificationScreen.classList.remove("active");
        dropzoneLabelText.textContent = "Select Music File";
      }
    }
  });
}

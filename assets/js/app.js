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

// =========================================================
// INJEKSI STYLING NEON KONSOL PEMPROSESAN (AAA GRADE UI/UX)
// =========================================================
const customStyle = document.createElement("style");
customStyle.innerHTML = `
  #verification-terminal {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    width: 100% !important;
  }
  .proc-card {
    width: 100%;
    max-width: 500px;
    background: rgba(10, 7, 22, 0.88);
    border: 1px solid rgba(255, 145, 77, 0.25);
    box-shadow: 0 20px 80px rgba(255, 145, 77, 0.15), 0 0 35px rgba(60, 42, 107, 0.25);
    border-radius: 18px;
    padding: 30px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .proc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .proc-title {
    font-family: monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
  }
  .proc-progress-pct {
    font-family: monospace;
    font-weight: 700;
    color: #ff914d;
    font-size: 18px;
  }
  .proc-bar-container {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 50px;
    overflow: hidden;
  }
  .proc-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #3976f0, #ff914d);
    width: 0%;
    transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1);
    border-radius: 50px;
    box-shadow: 0 0 12px rgba(255, 145, 77, 0.5);
  }
  .proc-steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .proc-step {
    display: flex;
    align-items: center;
    gap: 14px;
    opacity: 0.25;
    transition: all 0.3s ease;
  }
  .proc-step.active {
    opacity: 1;
  }
  .proc-step.completed {
    opacity: 1;
  }
  .step-status {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .step-circle {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
  }
  .proc-step.active .step-circle {
    background: #ff914d;
    box-shadow: 0 0 10px #ff914d;
  }
  .step-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(57, 118, 240, 0.15);
    border-top-color: #3976f0;
    border-radius: 50%;
    animation: proc-spin 0.8s linear infinite;
  }
  .step-check {
    color: #00df89;
    font-size: 16px;
    font-weight: bold;
    animation: proc-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .step-label {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.8px;
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
  }
  .proc-step.active .step-label {
    color: #ff914d;
    font-weight: 600;
    text-shadow: 0 0 8px rgba(255, 145, 77, 0.2);
  }
  @keyframes proc-spin {
    100% { transform: rotate(360deg); }
  }
  @keyframes proc-pop {
    0% { transform: scale(0); }
    100% { transform: scale(1); }
  }
`;
document.head.appendChild(customStyle);

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

// Struktur Kad Kemajuan Dinamik (Suntikan HTML Reka Bentuk Baru)
function createProgressCardMarkup() {
  return `
    <div class="proc-card">
      <div class="proc-header">
        <h3 class="proc-title">T1ERA Studio Engine</h3>
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
          <span class="step-label">Acquiring YouTube Audio Stream</span>
        </div>
        <div class="proc-step" id="step-temp">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Caching Raw Track to Workspace</span>
        </div>
        <div class="proc-step" id="step-transcribe">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Neural Pitch Transcription</span>
        </div>
        <div class="proc-step" id="step-repair">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Structural Clean & Note Repair</span>
        </div>
        <div class="proc-step" id="step-reconstruct">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Melodic Reconstruction & Skyline</span>
        </div>
        <div class="proc-step" id="step-stabilize">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Stabilizing Pitch Classes</span>
        </div>
        <div class="proc-step" id="step-styling">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Arranging Piano Styles</span>
        </div>
        <div class="proc-step" id="step-quantize">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Quantizing Timeline Grid</span>
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

// Helper untuk mengemas kini status barisan ikon
function setStepStatus(stepId, state) {
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

  // Tampilkan skrin terminal dan suntik rupa bentuk kad kemajuan baru
  verificationScreen.classList.add("active");
  verificationTerminal.innerHTML = createProgressCardMarkup();

  // FASA 1: Mengesahkan Sesi Pengguna
  setStepStatus("step-init", "loading");

  setTimeout(() => {
    setStepStatus("step-init", "success");
    // FASA 2: Muat turun Audio Stream YouTube
    setStepStatus("step-download", "loading");

    setTimeout(() => {
      setStepStatus("step-download", "success");
      // FASA 3: Salin fail audio ke ruang kerja sementara
      setStepStatus("step-temp", "loading");

      setTimeout(() => {
        setStepStatus("step-temp", "success");

        // PAPARKAN BUTANG CONTINUE UNTUK MEMICU ALIRAN KERJA PIPELINE PENUH DI RENDER
        const actionArea = document.getElementById("proc-action-area");
        if (actionArea) {
          actionArea.innerHTML = `
            <button id="continue-scoring-btn" class="web3-action-btn pulse-glow-blue" style="margin-top:15px; padding:10px 24px; font-size:0.85rem; border-color:#ff914d; color:#ff914d; font-weight:bold; width: 100%;">
              [ CONTINUE TO STUDIO SCORING ]
            </button>
          `;

          // Buka pendengar klik untuk memulakan pemprosesan sebenar
          document.getElementById("continue-scoring-btn").addEventListener("click", () => {
            // Bersihkan butang tindakan semasa berjalan
            actionArea.innerHTML = "";
            
            // Sediakan dokumen tugasan di Firestore (Ini akan memicu Render)
            const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
            setDoc(jobRef, {
              status: "QUEUED",
              progress: 0,
              youtubeUrl: urlValue,
              createdAt: serverTimestamp()
            })
            .then(() => {
              // Beralih ke pemantauan penalaan progress secara langsung dari Firestore
              openLiveTerminalConsole(userId, jobId);

              // Kirim permintaan HTTP POST ke pelayan Render
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
        }

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
  verificationTerminal.innerHTML = createProgressCardMarkup();

  // Aktifkan visual muat naik storan awan (Stage 0)
  setStepStatus("step-init", "loading");

  // Takrifkan rujukan muat naik Firebase Storage
  const storageRef = ref(storage, `users/${userId}/transcriptions/${jobId}/${selectedFile.name}`);
  const uploadTask = uploadBytesResumable(storageRef, selectedFile);

  uploadTask.on("state_changed", 
    (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      const progressBar = document.getElementById("proc-bar");
      const progressPct = document.getElementById("proc-pct");
      if (progressBar) progressBar.style.width = `${percent / 4}%`; // Skala muat naik adalah 25% dari bar kemajuan penuh
      if (progressPct) progressPct.textContent = `${Math.round(percent / 4)}%`;
      
      const stepInitLabel = document.querySelector("#step-init .step-label");
      if (stepInitLabel) stepInitLabel.textContent = `Uploading File: ${percent}%`;
    }, 
    (error) => {
      alert("Failed to upload audio to Cloud Storage: " + error.message);
      verificationScreen.classList.remove("active");
      dropzoneLabelText.textContent = "Select Music File";
    }, 
    () => {
      // Muat naik ke Storage Selesai
      setStepStatus("step-init", "success");
      setStepStatus("step-download", "loading");

      getDownloadURL(uploadTask.snapshot.ref).then((downloadUrl) => {
        setStepStatus("step-download", "success");
        setStepStatus("step-temp", "loading");
        
        // Daftarkan dokumen kerja di Firestore
        const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
        setDoc(jobRef, {
          status: "QUEUED",
          progress: 0,
          audioUrl: downloadUrl,
          createdAt: serverTimestamp()
        })
        .then(() => {
          setStepStatus("step-temp", "success");
          
          // Beralih ke pemantauan pipeline Render di terminal secara real-time
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
  // Memastikan rupa bentuk progress card sedia aktif
  const hasCard = document.querySelector(".proc-card");
  if (!hasCard) {
    verificationTerminal.innerHTML = createProgressCardMarkup();
  }

  // Setkan status 3-langkah muat naik awal kepada sukses jika dikesan dari isyarat Render
  setStepStatus("step-init", "success");
  setStepStatus("step-download", "success");
  setStepStatus("step-temp", "success");

  const progressBar = document.getElementById("proc-bar");
  const progressPct = document.getElementById("proc-pct");

  const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
  
  // Daftarkan Firestore onSnapshot Listener secara real-time
  const unsubscribe = onSnapshot(jobRef, (snapshot) => {
    if (!snapshot.exists()) return;

    const data = snapshot.to_dict();
    const status = data.status;
    const progress = data.progress || 0;

    // Laraskan bar kemajuan linear dan peratusan di skrin secara dinamik
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (progressPct) progressPct.textContent = `${progress}%`;

    // Menampilkan status kemajuan peringkat pemprosesan sepadan dengan nama pipeline Render
    if (status === "QUEUED") {
      setStepStatus("step-transcribe", "loading");
    } else if (status === "DOWNLOADING_YOUTUBE" || status === "DOWNLOADING_AUDIO") {
      setStepStatus("step-init", "success");
      setStepStatus("step-download", "success");
      setStepStatus("step-temp", "success");
    } else if (status === "TRANSCRIBING_AUDIO") {
      setStepStatus("step-transcribe", "loading");
    } else if (status === "CLEANING_MIDI") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "loading");
    } else if (status === "REPAIRING_NOTES") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "loading");
    } else if (status === "RECONSTRUCTING_MELODY") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "success");
      setStepStatus("step-reconstruct", "loading");
    } else if (status === "STABILIZING_PITCH") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "success");
      setStepStatus("step-reconstruct", "success");
      setStepStatus("step-stabilize", "loading");
    } else if (status === "ARRANGING_PIANO_STYLE") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "success");
      setStepStatus("step-reconstruct", "success");
      setStepStatus("step-stabilize", "success");
      setStepStatus("step-styling", "loading");
    } else if (status === "QUANTIZING_TIMELINE") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "success");
      setStepStatus("step-reconstruct", "success");
      setStepStatus("step-stabilize", "success");
      setStepStatus("step-styling", "success");
      setStepStatus("step-quantize", "loading");
    } else if (status === "UPLOADING_RESULTS") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "success");
      setStepStatus("step-reconstruct", "success");
      setStepStatus("step-stabilize", "success");
      setStepStatus("step-styling", "success");
      setStepStatus("step-quantize", "success");
      setStepStatus("step-complete", "loading");
    } else if (status === "COMPLETED") {
      setStepStatus("step-transcribe", "success");
      setStepStatus("step-repair", "success");
      setStepStatus("step-reconstruct", "success");
      setStepStatus("step-stabilize", "success");
      setStepStatus("step-styling", "success");
      setStepStatus("step-quantize", "success");
      setStepStatus("step-complete", "success");

      const midiUrl = data.midiUrl;

      // SIMPAN URL FAIL MIDI KE LOCAL STORAGE (Sistem Autoload Fail Fail-Safe)
      localStorage.setItem("t1era_current_midi", midiUrl);

      // Berikan maklum balas visual pemprosesan selesai di atas kad
      const actionArea = document.getElementById("proc-action-area");
      if (actionArea) {
        actionArea.innerHTML = `
          <div style="color:#00df89; font-weight:bold; letter-spacing:1px; font-size:0.9rem; margin-top:10px; animation: proc-pop 0.3s ease;">
            [ REDIRECTING TO PIANO STUDIO... ]
          </div>
        `;
      }
      
      // Hentikan pendengar Firestore secara selamat sebelum pusingan navigasi
      unsubscribe();

      // AUTOMATIK BUKA DAN AUTOLOAD FAIL MIDI DI MIDIANO.HTML SELEPAS 1.5 SAAT
      setTimeout(() => {
        window.location.href = "midiano.html?midi=" + encodeURIComponent(midiUrl);
      }, 1500);

    } else if (status === "FAILED") {
      const error = data.error || "Unknown pipeline error.";
      
      // Setkan bar berwarna merah jika gagal
      if (progressBar) {
        progressBar.style.background = "#ff4a4a";
        progressBar.style.boxShadow = "0 0 12px rgba(255, 74, 74, 0.5)";
      }

      const actionArea = document.getElementById("proc-action-area");
      if (actionArea) {
        actionArea.innerHTML = `
          <div style="color:#ff4a4a; font-weight:bold; font-size:0.8rem; margin-top:10px; line-height:1.4;">
            PROCESSING FAILED: ${error.toUpperCase()}
          </div>
          <button onclick="document.getElementById('verification-screen').classList.remove('active')" class="web3-action-btn" style="margin-top:10px; border-color:#ff4a4a; color:#ff4a4a; font-size:0.75rem;">
            [ CLOSE KONSOL ]
          </button>
        `;
      }
      unsubscribe();
    }
  });

  // Benarkan terminal ditutup apabila di klik di luar ruang teks (hanya apabila Selesai/Gagal)
  verificationScreen.addEventListener("click", (e) => {
    if (e.target === verificationScreen) {
      const actionArea = document.getElementById("proc-action-area");
      if (actionArea && (actionArea.innerHTML.includes("REDIRECTING") || actionArea.innerHTML.includes("FAILED"))) {
        verificationScreen.classList.remove("active");
        dropzoneLabelText.textContent = "Select Music File";
      }
    }
  });
}

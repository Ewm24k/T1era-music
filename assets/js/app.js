import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase App Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDpVqwUVpM2c41y2RF5IlPQwKW71iyyhc8",
  authDomain: "t1era-musicv1.firebaseapp.com",
  projectId: "t1era-musicv1",
  storageBucket: "t1era-musicv1.firebasestorage.app",
  messagingSenderId: "878684058813",
  appId: "1:878684058813:web:58f21cf930740fa68bb3d4",
  measurementId: "G-XX6MGLBDE4",
};

// Initialize Firebase App
let app, auth, googleProvider;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.error("Firebase SDK initialization error:", e);
}

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

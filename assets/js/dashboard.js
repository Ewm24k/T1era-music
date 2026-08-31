import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Local hardcoded mock tracks arrays mimicking the reference layout
const popularTracksData = [
    {
        id: 1,
        title: "Golden Days",
        artist: "Felix Carter",
        duration: "3:12",
        art: "https://picsum.photos/id/65/300/300"
    },
    {
        id: 2,
        title: "Fading Horizon",
        artist: "Ella Hunt",
        duration: "4:05",
        art: "https://picsum.photos/id/1025/300/300"
    },
    {
        id: 3,
        title: "Waves of Time",
        artist: "Lana Rivers",
        duration: "2:54",
        art: "https://picsum.photos/id/322/300/300"
    },
    {
        id: 4,
        title: "Electric Dreams",
        artist: "Mia Lowell",
        duration: "3:40",
        art: "https://picsum.photos/id/338/300/300"
    },
    {
        id: 5,
        title: "Shadows & Light",
        artist: "Ryan Miles",
        duration: "3:22",
        art: "https://picsum.photos/id/352/300/300"
    },
    {
        id: 6,
        title: "Echoes of Midnight",
        artist: "Jon Hickman",
        duration: "3:58",
        art: "https://picsum.photos/id/322/300/300"
    }
];

// Document Selectors
const popularGrid = document.getElementById("popular-tracks-grid");
const categoriesRow = document.getElementById("categories-row");

// Player details selectors
const playerAlbumArt = document.getElementById("player-album-art");
const playerTrackTitle = document.getElementById("player-track-title");
const playerTrackArtist = document.getElementById("player-track-artist");
const trackLength = document.getElementById("track-length");
const currentTime = document.getElementById("current-time");

const playPauseBtn = document.getElementById("player-play-btn");
const playPauseIcon = document.getElementById("play-pause-icon");

// Timeline trackers
const timelineTrack = document.getElementById("timeline-track");
const timelineFill = document.getElementById("timeline-fill");
const timelineThumb = document.getElementById("timeline-thumb");

// Volume trackers
const volumeTrack = document.getElementById("volume-track");
const volumeFill = document.getElementById("volume-fill");
const volumeThumb = document.getElementById("volume-thumb");

let isPlaying = false;
let activeTrack = popularTracksData[5]; // Default active track: "Echoes of Midnight"
let tickerInterval = null;
let currentSeconds = 53; // Mock default matching reference image (0:53)

// Monitor Auth State and secure the dashboard page
if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in, update profile UI dynamically [1]
      const profileName = document.getElementById("profile-name");
      const profileAvatar = document.getElementById("profile-avatar");
      
      if (profileName) {
        profileName.textContent = user.displayName || "Studio Creator";
      }
      
      if (profileAvatar) {
        if (user.photoURL) {
          profileAvatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
          // Render initials as a default avatar inside the circle
          const initials = user.email ? user.email.substring(0, 2).toUpperCase() : "ST";
          profileAvatar.textContent = initials;
          profileAvatar.style.fontSize = "0.85rem";
          profileAvatar.style.fontWeight = "bold";
          profileAvatar.style.color = "rgba(255,255,255,0.7)";
        }
      }
    } else {
      // No user session found, redirect back to authentication gateway [1]
      window.location.href = "index.html";
    }
  });
}

// 1. Populate the Track Cards dynamically
function renderPopularTracks() {
    popularGrid.innerHTML = "";
    popularTracksData.forEach(track => {
        const card = document.createElement("div");
        card.className = "track-card";
        card.innerHTML = `
            <img src="${track.art}" class="track-card-art" alt="Art">
            <div class="track-card-meta">
                <span class="track-card-title">${track.title}</span>
                <span class="track-card-artist">${track.artist}</span>
            </div>
        `;
        
        // Clicking a card loads it into the active player fader bar
        card.addEventListener("click", () => {
            selectAndPlayTrack(track);
        });
        popularGrid.appendChild(card);
    });
}

function selectAndPlayTrack(track) {
    activeTrack = track;
    playerAlbumArt.src = track.art;
    playerTrackTitle.textContent = track.title;
    playerTrackArtist.textContent = track.artist;
    trackLength.textContent = track.duration;
    
    // Reset tracker progression parameters
    currentSeconds = 0;
    currentTime.textContent = "0:00";
    timelineFill.style.width = "0%";
    timelineThumb.style.left = "0%";
    
    startPlaybackState();
}

// 2. Play/Pause toggle operations
playPauseBtn.addEventListener("click", () => {
    if (isPlaying) {
        pausePlaybackState();
    } else {
        startPlaybackState();
    }
});

function startPlaybackState() {
    isPlaying = true;
    playPauseIcon.textContent = "⏸";
    playPauseBtn.style.transform = "scale(1.1)";
    
    // Simple simulated timer progression tick
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(updatePlayerTick, 1000);
}

function pausePlaybackState() {
    isPlaying = false;
    playPauseIcon.textContent = "▶";
    playPauseBtn.style.transform = "";
    if (tickerInterval) clearInterval(tickerInterval);
}

// Translate tracker timers into readable output formatting
function updatePlayerTick() {
    currentSeconds++;
    
    // Split track duration parts
    const lengthParts = activeTrack.duration.split(":");
    const totalDurationSeconds = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);

    if (currentSeconds >= totalDurationSeconds) {
        currentSeconds = 0;
        pausePlaybackState();
    }

    const minutes = Math.floor(currentSeconds / 60);
    const seconds = (currentSeconds % 60).toString().padStart(2, "0");
    currentTime.textContent = `${minutes}:${seconds}`;

    // Fill percent calculate
    const percentage = (currentSeconds / totalDurationSeconds) * 100;
    timelineFill.style.width = `${percentage}%`;
    timelineThumb.style.left = `${percentage}%`;
}

// 3. Volume dragging adjustments (UI mock simulation)
volumeTrack.addEventListener("click", (e) => {
    const rect = volumeTrack.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * 100;
    volumeFill.style.width = `${percent}%`;
    volumeThumb.style.left = `${percent}%`;
});

// 4. select category capsule click switching
categoriesRow.addEventListener("click", (e) => {
    if (e.target.classList.contains("capsule")) {
        document.querySelectorAll(".capsule").forEach(c => c.classList.remove("active"));
        e.target.classList.add("active");
    }
});

// 5. Real Firebase Logout Action
document.getElementById("dashboard-logout-btn").addEventListener("click", () => {
    if (confirm("Disconnect session?")) {
        if (auth) {
          signOut(auth)
            .then(() => {
                window.location.href = "index.html";
            })
            .catch((err) => {
                console.error("Logout failed:", err);
                alert("Session disconnect failed. Try again.");
            });
        } else {
          window.location.href = "index.html";
        }
    }
});

// Initial load
renderPopularTracks();

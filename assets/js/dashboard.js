import { auth, db, storage } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot,
    doc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    ref as sRef, 
    getMetadata 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Global, long-lived Client Cache registries to prevent layout blocking network storms
const resolvedTitleCache = new Map();
const validatedMidiCache = new Set();

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

// Tab Navigation elements
const navHome = document.getElementById("nav-home");
const navTranscriptions = document.getElementById("nav-transcriptions");
const homeView = document.getElementById("home-view");
const transcriptionsView = document.getElementById("transcriptions-view");
const transcriptionsList = document.getElementById("transcriptions-list");

let isPlaying = false;
let activeTrack = popularTracksData[5]; 
let tickerInterval = null;
let currentSeconds = 53; 

// Sidebar Navigation
if (navHome && navTranscriptions) {
    navHome.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveTab(navHome, homeView);
    });

    navTranscriptions.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveTab(navTranscriptions, transcriptionsView);
        loadUserTranscriptions();
    });
}

function setActiveTab(activeNavItem, activeViewElement) {
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    activeNavItem.classList.add("active");

    homeView.style.display = "none";
    transcriptionsView.style.display = "none";
    activeViewElement.style.display = "block";
}

// Monitor Auth State and secure the dashboard page
let currentUser = null;

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      const profileName = document.getElementById("profile-name");
      const profileAvatar = document.getElementById("profile-avatar");
      
      if (profileName) {
        profileName.textContent = user.displayName || "Studio Creator";
      }
      
      if (profileAvatar) {
        if (user.photoURL) {
          profileAvatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
          const initials = user.email ? user.email.substring(0, 2).toUpperCase() : "ST";
          profileAvatar.textContent = initials;
          profileAvatar.style.fontSize = "0.85rem";
          profileAvatar.style.fontWeight = "bold";
          profileAvatar.style.color = "rgba(255,255,255,0.7)";
        }
      }
    } else {
      window.location.href = "index.html";
    }
  });
}

// ------------------------------------------------------------------
// MUAT TURUN SENARAI TRANSKRIPSI NYATA DARI FIRESTORE (My Transcriptions)
// ------------------------------------------------------------------
let snapshotUnsubscribe = null;

function loadUserTranscriptions() {
    if (!currentUser || !db) {
        renderTranscriptionsList(getMockTranscriptions());
        return;
    }

    // Retain list structure during fetches to prevent layout blinking
    if (!transcriptionsList.children.length) {
        transcriptionsList.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.4); font-size:0.9rem; padding:40px 0;">Loading transcriptions database...</div>`;
    }

    // Clean up any stale listeners to avoid duplicates
    if (snapshotUnsubscribe) {
        snapshotUnsubscribe();
    }

    const jobsRef = collection(db, "users", currentUser.uid, "midi_jobs");
    const q = query(jobsRef, where("status", "==", "COMPLETED"));

    snapshotUnsubscribe = onSnapshot(q, async (snapshot) => {
        const rawJobs = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            const fallbackTitle = data.youtubeUrl ? extractYouTubeTitle(data.youtubeUrl) : "Local Uploaded Track";
            
            rawJobs.push({
                id: doc.id,
                title: data.title || fallbackTitle, 
                fallbackTitle: fallbackTitle,
                source: data.youtubeUrl ? "YOUTUBE" : "UPLOAD",
                midiUrl: data.midiUrl, 
                originalMidiUrl: data.originalMidiUrl || null, 
                completedAt: data.completedAt || null,
                date: data.completedAt ? new Date(data.completedAt.seconds * 1000).toLocaleDateString() : "Just Now"
            });
        });

        // ------------------------------------------------------------------
        // RESOLVE REAL TITLES FROM Storage (details.json) WITH LOCAL CACHE
        // ------------------------------------------------------------------
        const resolveTitlesPromises = rawJobs.map(async (job) => {
            // Check cache registry first to bypass redundant network requests
            if (resolvedTitleCache.has(job.id)) {
                job.title = resolvedTitleCache.get(job.id);
                return job;
            }

            const isGeneric = !job.title || 
                              job.title === "Local Uploaded Track" || 
                              job.title.startsWith("YouTube Stream Audio");
            
            if (isGeneric && job.midiUrl) {
                try {
                    const detailsUrl = job.midiUrl.replace("final_score.mid", "details.json");
                    const response = await fetch(detailsUrl);
                    if (response.ok) {
                        const jsonDetails = await response.json();
                        if (jsonDetails && jsonDetails.title) {
                            job.title = jsonDetails.title;
                            resolvedTitleCache.set(job.id, jsonDetails.title); // Store in cache
                            return job;
                        }
                    }
                } catch (e) {
                    console.warn(`[STORAGE TITLE RESOLVE WARNING] Failed to retrieve details.json for Job ${job.id}:`, e);
                }
            }

            // Fallback: cache standard resolved title to prevent repeating network queries
            resolvedTitleCache.set(job.id, job.title);
            return job;
        });

        const resolvedJobs = await Promise.all(resolveTitlesPromises);

        // ------------------------------------------------------------------
        // METADATA SELF-HEALING SYSTEM WITH MEMORY RETENTION
        // ------------------------------------------------------------------
        if (storage && resolvedJobs.length > 0) {
            const validationPromises = resolvedJobs.map(async (job) => {
                if (!job.midiUrl) return null;
                
                // If this file has already been verified, proceed immediately (bypasses network checking)
                if (validatedMidiCache.has(job.midiUrl)) {
                    return job;
                }
                
                try {
                    const fileRef = sRef(storage, job.midiUrl);
                    await getMetadata(fileRef);
                    validatedMidiCache.add(job.midiUrl); // Save verification state
                    return job; 
                } catch (error) {
                    if (error.code === 'storage/object-not-found' || error.message.includes('not found')) {
                        console.warn(`[DATA SELF-HEAL] File missing for Job ${job.id}. Purging metadata...`);
                        try {
                            await deleteDoc(doc(db, "users", currentUser.uid, "midi_jobs", job.id));
                        } catch (fs_err) {
                            console.error("[DATA SELF-HEAL ERROR] Cleanup failed:", fs_err);
                        }
                    }
                    return null; 
                }
            });

            const results = await Promise.all(validationPromises);
            const validatedJobs = results.filter(job => job !== null);

            if (validatedJobs.length === 0) {
                renderTranscriptionsList(getMockTranscriptions());
            } else {
                validatedJobs.sort((a, b) => {
                    const timeA = a.completedAt ? a.completedAt.seconds : 0;
                    const timeB = b.completedAt ? b.completedAt.seconds : 0;
                    return timeB - timeA; 
                });
                renderTranscriptionsList(validatedJobs);
            }
        } else {
            if (resolvedJobs.length === 0) {
                renderTranscriptionsList(getMockTranscriptions());
            } else {
                resolvedJobs.sort((a, b) => {
                    const timeA = a.completedAt ? a.completedAt.seconds : 0;
                    const timeB = b.completedAt ? b.completedAt.seconds : 0;
                    return timeB - timeA;
                });
                renderTranscriptionsList(resolvedJobs);
            }
        }
    }, (error) => {
        console.error("Firestore read failure:", error);
        renderTranscriptionsList(getMockTranscriptions());
    });
}

function extractYouTubeTitle(url) {
    try {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return `YouTube Stream Audio (${match[2]})`;
        }
    } catch (e) {}
    return "YouTube Track Asset";
}

// ------------------------------------------------------------------
// HIGH PERFORMANCE DOCUMENT FRAGMENT RENDERING (Zero Jank painting)
// ------------------------------------------------------------------
function renderTranscriptionsList(list) {
    transcriptionsList.innerHTML = "";
    
    // Create an in-memory document fragment to hold generated rows
    const fragment = document.createDocumentFragment();

    list.forEach((track, index) => {
        const indexStr = (index + 1).toString().padStart(2, "0");
        const row = document.createElement("div");
        row.className = "trans-row";
        
        const isYT = track.source === "YOUTUBE";
        const artClass = isYT ? "youtube" : "upload";
        const artIcon = isYT ? "📺" : "📁";
        const badgeLabel = isYT ? "YouTube" : "Upload";
        const badgeClass = isYT ? "youtube" : "upload";

        row.innerHTML = `
            <div class="trans-row__left">
                <span class="trans-row__index">${indexStr}</span>
                <div class="trans-row__art-wrap ${artClass}">${artIcon}</div>
                <div class="trans-row__meta">
                    <span class="trans-row__title">${track.title}</span>
                    <span class="trans-row__artist">${track.date || 'T1ERA Studio'}</span>
                </div>
            </div>
            <div class="trans-row__right">
                <span class="trans-badge ${badgeClass}">${badgeLabel}</span>
                <button class="trans-row__action" type="button">
                    <span>🎹</span> Open Studio
                </button>
            </div>
        `;

        row.addEventListener("click", () => {
            openStudioWithMidi(track.midiUrl);
        });

        fragment.appendChild(row);
    });

    // Append all nodes inside a single paint cycle
    transcriptionsList.appendChild(fragment);
}

function openStudioWithMidi(midiUrl) {
    localStorage.setItem("t1era_current_midi", midiUrl);
    window.location.href = "midiano.html?midi=" + encodeURIComponent(midiUrl);
}

function getMockTranscriptions() {
    return [
        {
            id: "mock_1",
            title: "Scorpions - Still Loving You (Piano Arr.)",
            source: "YOUTUBE",
            midiUrl: "https://example.com/demo1.mid",
            date: "2026-08-30"
        },
        {
            id: "mock_2",
            title: "Custom Golden Days Session.wav",
            source: "UPLOAD",
            midiUrl: "https://example.com/demo2.mid",
            date: "2026-08-28"
        }
    ];
}

// ------------------------------------------------------------------
// PEMAIN POPULAR SONGS (Sedia Ada)
// ------------------------------------------------------------------
function renderPopularTracks() {
    popularGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();

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
        
        card.addEventListener("click", () => {
            selectAndPlayTrack(track);
        });
        fragment.appendChild(card);
    });

    popularGrid.appendChild(fragment);
}

function selectAndPlayTrack(track) {
    activeTrack = track;
    playerAlbumArt.src = track.art;
    playerTrackTitle.textContent = track.title;
    playerTrackArtist.textContent = track.artist;
    trackLength.textContent = track.duration;
    
    currentSeconds = 0;
    currentTime.textContent = "0:00";
    timelineFill.style.width = "0%";
    timelineThumb.style.left = "0%";
    
    startPlaybackState();
}

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
    
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(updatePlayerTick, 1000);
}

function pausePlaybackState() {
    isPlaying = false;
    playPauseIcon.textContent = "▶";
    playPauseBtn.style.transform = "";
    if (tickerInterval) clearInterval(tickerInterval);
}

function updatePlayerTick() {
    currentSeconds++;
    
    const lengthParts = activeTrack.duration.split(":");
    const totalDurationSeconds = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);

    if (currentSeconds >= totalDurationSeconds) {
        currentSeconds = 0;
        pausePlaybackState();
    }

    const minutes = Math.floor(currentSeconds / 60);
    const seconds = (currentSeconds % 60).toString().padStart(2, "0");
    currentTime.textContent = `${minutes}:${seconds}`;

    const percentage = (currentSeconds / totalDurationSeconds) * 100;
    timelineFill.style.width = `${percentage}%`;
    timelineThumb.style.left = `${percentage}%`;
}

volumeTrack.addEventListener("click", (e) => {
    const rect = volumeTrack.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * 100;
    volumeFill.style.width = `${percent}%`;
    volumeThumb.style.left = `${percent}%`;
});

categoriesRow.addEventListener("click", (e) => {
    if (e.target.classList.contains("capsule")) {
        document.querySelectorAll(".capsule").forEach(c => c.classList.remove("active"));
        e.target.classList.add("active");
    }
});

// Logout Action
document.getElementById("dashboard-logout-btn").addEventListener("click", () => {
    if (confirm("Disconnect session?")) {
        // Clean up open database handles
        if (snapshotUnsubscribe) {
            snapshotUnsubscribe();
        }

        if (auth) {
          signOut(auth)
            .then(() => {
                localStorage.removeItem("t1era_logged_in");
                window.location.href = "index.html";
            })
            .catch((err) => {
                console.error("Logout failed:", err);
                alert("Session disconnect failed. Try again.");
            });
        } else {
          localStorage.removeItem("t1era_logged_in");
          window.location.href = "index.html";
        }
    }
});

// Initial load
renderPopularTracks();

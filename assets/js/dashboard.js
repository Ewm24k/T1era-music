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

// ==========================================
// CONFIGURATION & GLOBAL CONSTANTS
// ==========================================
// Official documented public test client ID for catalog read methods
const JAMENDO_CLIENT_ID = "709fa152"; 

// SVG Icon definitions
const playIconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const pauseIconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`;

const youtubeIconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#ff4d4d" style="display:block;"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
const uploadIconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#00df89" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const studioIconSvg = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M6 3v11"/><path d="M10 3v11"/><path d="M14 3v11"/><path d="M18 3v11"/><path d="M2 14h20"/></svg>`;

// Global Cache registries
const resolvedTitleCache = new Map();
const validatedMidiCache = new Set();

// Reliable fallback static tracks array (used seamlessly if API limits or errors occur)
const popularTracksDataMockFallback = [
    { id: 1, title: "Golden Days", artist: "Felix Carter", duration: "3:12", art: "https://picsum.photos/id/65/300/300" },
    { id: 2, title: "Fading Horizon", artist: "Ella Hunt", duration: "4:05", art: "https://picsum.photos/id/1025/300/300" },
    { id: 3, title: "Waves of Time", artist: "Lana Rivers", duration: "2:54", art: "https://picsum.photos/id/322/300/300" },
    { id: 4, title: "Electric Dreams", artist: "Mia Lowell", duration: "3:40", art: "https://picsum.photos/id/338/300/300" },
    { id: 5, title: "Shadows & Light", artist: "Ryan Miles", duration: "3:22", art: "https://picsum.photos/id/352/300/300" },
    { id: 6, title: "Echoes of Midnight", artist: "Jon Hickman", duration: "3:58", art: "https://picsum.photos/id/322/300/300" }
];

// Document Selectors
const popularGrid = document.getElementById("popular-tracks-grid");
const categoriesRow = document.getElementById("categories-row");
const searchInput = document.getElementById("search-input");

// Player Details Selectors
const playerAlbumArt = document.getElementById("player-album-art");
const playerTrackTitle = document.getElementById("player-track-title");
const playerTrackArtist = document.getElementById("player-track-artist");
const trackLength = document.getElementById("track-length");
const currentTime = document.getElementById("current-time");

const playPauseBtn = document.getElementById("player-play-btn");
const playPauseIcon = document.getElementById("play-pause-icon");
const prevBtn = document.getElementById("player-prev-btn");
const nextBtn = document.getElementById("player-next-btn");

// Timeline Trackers
const timelineTrack = document.getElementById("timeline-track");
const timelineFill = document.getElementById("timeline-fill");
const timelineThumb = document.getElementById("timeline-thumb");

// Volume Trackers
const volumeTrack = document.getElementById("volume-track");
const volumeFill = document.getElementById("volume-fill");
const volumeThumb = document.getElementById("volume-thumb");

// Tab Navigation Elements
const navHome = document.getElementById("nav-home");
const navTranscriptions = document.getElementById("nav-transcriptions");
const homeView = document.getElementById("home-view");
const transcriptionsView = document.getElementById("transcriptions-view");
const transcriptionsList = document.getElementById("transcriptions-list");

// Real Audio & Playback States
const audioPlayer = new Audio();
let isPlaying = false;
let isRealPlayback = false; // flag indicating real Jamendo MP3 stream vs mockup ticker
let currentTrackList = [];  // keeps track of the currently loaded lists (for prev/next navigation)
let currentTrackIndex = -1;
let tickerInterval = null;  // ticker fallback for static items
let currentSeconds = 0;
let currentVolume = 0.7;    // volume state (0.0 to 1.0)
let activeTrack = { title: "Echoes of Midnight", artist: "Jon Hickman", duration: "3:58", art: "https://picsum.photos/id/322/100/100" };

// Set initial volume visually
if (volumeFill && volumeThumb) {
    volumeFill.style.width = "70%";
    volumeThumb.style.left = "70%";
    audioPlayer.volume = currentVolume;
}

// ==========================================
// NAVIGATION & AUTHENTICATION SECURE
// ==========================================
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
          profileAvatar.style.fontSize = "10px";
          profileAvatar.style.fontWeight = "bold";
          profileAvatar.style.color = "rgba(255,255,255,0.7)";
        }
      }
    } else {
      window.location.href = "index.html";
    }
  });
}

// ==========================================
// FIRESTORE TRANSCRIPTIONS LOAD & RENDER
// ==========================================
let snapshotUnsubscribe = null;

function loadUserTranscriptions() {
    if (!currentUser || !db) {
        renderTranscriptionsList(getMockTranscriptions());
        return;
    }

    if (!transcriptionsList.children.length) {
        transcriptionsList.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.4); font-size:0.85rem; padding:40px 0;">Loading transcriptions database...</div>`;
    }

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

        const resolveTitlesPromises = rawJobs.map(async (job) => {
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
                            resolvedTitleCache.set(job.id, jsonDetails.title);
                            return job;
                        }
                    }
                } catch (e) {
                    console.warn(`[STORAGE TITLE RESOLVE WARNING] Failed to retrieve details.json for Job ${job.id}:`, e);
                }
            }

            resolvedTitleCache.set(job.id, job.title);
            return job;
        });

        const resolvedJobs = await Promise.all(resolveTitlesPromises);

        if (storage && resolvedJobs.length > 0) {
            const validationPromises = resolvedJobs.map(async (job) => {
                if (!job.midiUrl) return null;
                
                if (validatedMidiCache.has(job.midiUrl)) {
                    return job;
                }
                
                try {
                    const fileRef = sRef(storage, job.midiUrl);
                    await getMetadata(fileRef);
                    validatedMidiCache.add(job.midiUrl);
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

function renderTranscriptionsList(list) {
    transcriptionsList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    list.forEach((track, index) => {
        const indexStr = (index + 1).toString().padStart(2, "0");
        const row = document.createElement("div");
        row.className = "trans-row";
        
        const isYT = track.source === "YOUTUBE";
        const artClass = isYT ? "youtube" : "upload";
        const artIcon = isYT ? youtubeIconSvg : uploadIconSvg;
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
                    ${studioIconSvg} Open Studio
                </button>
            </div>
        `;

        row.addEventListener("click", () => {
            openStudioWithMidi(track.midiUrl);
        });

        fragment.appendChild(row);
    });

    transcriptionsList.appendChild(fragment);
}

function openStudioWithMidi(midiUrl) {
    localStorage.setItem("t1era_current_midi", midiUrl);
    window.location.href = "midiano.html?midi=" + encodeURIComponent(midiUrl);
}

function getMockTranscriptions() {
    return [
        { id: "mock_1", title: "Scorpions - Still Loving You (Piano Arr.)", source: "YOUTUBE", midiUrl: "https://example.com/demo1.mid", date: "2026-08-30" },
        { id: "mock_2", title: "Custom Golden Days Session.wav", source: "UPLOAD", midiUrl: "https://example.com/demo2.mid", date: "2026-08-28" }
    ];
}

// ==========================================
// JAMENDO MUSIC API INTEGRATION (POPULAR SONGS)
// ==========================================
async function fetchJamendoTracks(params = {}) {
    const queryParams = new URLSearchParams({
        client_id: JAMENDO_CLIENT_ID,
        format: "json",
        limit: "12",
        ...params
    });

    // Elegant loading state inside layout grid
    popularGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.4); padding: 40px 0; font-size: 11.5px; font-weight: 500;">
            Retrieving songs from Jamendo API...
        </div>
    `;

    try {
        const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${queryParams}`);
        if (!response.ok) throw new Error("API Network connection failed");
        
        const data = await response.json();
        
        // Handle API failures wrapped in successful HTTP statuses (e.g. invalid client_id)
        if (data.headers && data.headers.status === "failed") {
            throw new Error(data.headers.error_message || "API call returned a failed status");
        }
        
        if (data.results && data.results.length > 0) {
            currentTrackList = data.results.map(track => ({
                id: track.id,
                title: track.name,
                artist: track.artist_name,
                duration: formatDuration(track.duration),
                duration_seconds: track.duration,
                art: track.image || "https://picsum.photos/id/1025/300/300",
                audio: track.audio
            }));
            renderPopularTracks(currentTrackList);
        } else {
            // Displays cleanly only if search parameter returns no results
            popularGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.4); padding: 40px 0; font-size: 11.5px;">
                    No tracks match your query. Try searching another term!
                </div>
            `;
        }
    } catch (error) {
        console.warn("[JAMENDO API FALLBACK] Loading local premium database layout. Reason:", error.message);
        currentTrackList = popularTracksDataMockFallback;
        renderPopularTracks(currentTrackList);
    }
}

function fetchJamendoTracksByGenre(genre) {
    if (genre === "all") {
        fetchJamendoTracks({ order: "popularity_total" });
    } else {
        // Tag search matches the precise capsule filter
        fetchJamendoTracks({ fuzzytags: genre, order: "popularity_total" });
    }
}

// Helper to translate seconds into M:SS standard notation
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
}

// ==========================================
// POPULAR SONGS RENDERING
// ==========================================
function renderPopularTracks(tracks) {
    popularGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    tracks.forEach((track, index) => {
        const card = document.createElement("div");
        card.className = "track-card";
        card.innerHTML = `
            <img src="${track.art}" class="track-card-art" alt="Art" onerror="this.src='https://picsum.photos/id/322/300/300'">
            <div class="track-card-meta">
                <span class="track-card-title">${track.title}</span>
                <span class="track-card-artist">${track.artist}</span>
            </div>
        `;
        
        card.addEventListener("click", () => {
            currentTrackIndex = index;
            selectAndPlayTrack(track);
        });
        fragment.appendChild(card);
    });

    popularGrid.appendChild(fragment);
}

// ==========================================
// REAL-TIME AUDIO STREAMING PLAYER
// ==========================================
function selectAndPlayTrack(track) {
    activeTrack = track;
    playerAlbumArt.src = track.art;
    playerTrackTitle.textContent = track.title;
    playerTrackArtist.textContent = track.artist;
    
    // Reset player timers
    if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
    }

    if (track.audio) {
        // Play real music stream directly from Jamendo 
        isRealPlayback = true;
        audioPlayer.src = track.audio;
        audioPlayer.volume = currentVolume;
        
        audioPlayer.play()
            .then(() => {
                isPlaying = true;
                playPauseIcon.innerHTML = pauseIconSvg;
                playPauseBtn.style.transform = "scale(1.05)";
            })
            .catch(err => {
                console.warn("[PLAYBACK INTERRUPTED] Stream is loaded or playing elsewhere:", err);
            });
    } else {
        // Fallback to static mockup ticker behavior
        isRealPlayback = false;
        audioPlayer.pause();
        
        trackLength.textContent = track.duration;
        currentSeconds = 0;
        currentTime.textContent = "0:00";
        timelineFill.style.width = "0%";
        timelineThumb.style.left = "0%";
        
        startPlaybackState();
    }
}

// Player controls actions
playPauseBtn.addEventListener("click", () => {
    if (isRealPlayback) {
        if (isPlaying) {
            audioPlayer.pause();
            isPlaying = false;
            playPauseIcon.innerHTML = playIconSvg;
            playPauseBtn.style.transform = "";
        } else {
            audioPlayer.play()
                .then(() => {
                    isPlaying = true;
                    playPauseIcon.innerHTML = pauseIconSvg;
                    playPauseBtn.style.transform = "scale(1.05)";
                })
                .catch(err => console.warn("Failed to play track stream:", err));
        }
    } else {
        if (isPlaying) {
            pausePlaybackState();
        } else {
            startPlaybackState();
        }
    }
});

// Previous and Next buttons handlers
if (prevBtn) {
    prevBtn.addEventListener("click", () => {
        if (currentTrackList.length > 0 && currentTrackIndex > 0) {
            currentTrackIndex--;
            selectAndPlayTrack(currentTrackList[currentTrackIndex]);
        }
    });
}

if (nextBtn) {
    nextBtn.addEventListener("click", () => {
        if (currentTrackList.length > 0 && currentTrackIndex < currentTrackList.length - 1) {
            currentTrackIndex++;
            selectAndPlayTrack(currentTrackList[currentTrackIndex]);
        }
    });
}

// Mock Player State handlers
function startPlaybackState() {
    isPlaying = true;
    playPauseIcon.innerHTML = pauseIconSvg;
    playPauseBtn.style.transform = "scale(1.05)";
    
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(updatePlayerTick, 1000);
}

function pausePlaybackState() {
    isPlaying = false;
    playPauseIcon.innerHTML = playIconSvg;
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

// ==========================================
// AUDIO SYSTEM EVENT LISTENERS (REAL PROGRESSION)
// ==========================================
audioPlayer.addEventListener("timeupdate", () => {
    if (!isRealPlayback) return;
    const current = audioPlayer.currentTime;
    const duration = audioPlayer.duration || activeTrack.duration_seconds || 1;
    
    currentTime.textContent = formatDuration(current);
    const percentage = (current / duration) * 100;
    timelineFill.style.width = `${percentage}%`;
    timelineThumb.style.left = `${percentage}%`;
});

audioPlayer.addEventListener("loadedmetadata", () => {
    if (!isRealPlayback) return;
    trackLength.textContent = formatDuration(audioPlayer.duration);
});

audioPlayer.addEventListener("ended", () => {
    if (!isRealPlayback) return;
    // Auto-advance to the next track if available
    if (currentTrackList.length > 0 && currentTrackIndex < currentTrackList.length - 1) {
        currentTrackIndex++;
        selectAndPlayTrack(currentTrackList[currentTrackIndex]);
    } else {
        isPlaying = false;
        playPauseIcon.innerHTML = playIconSvg;
        playPauseBtn.style.transform = "";
    }
});

// Interactive Seek Bar (Timeline) click event
timelineTrack.addEventListener("click", (e) => {
    const rect = timelineTrack.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    
    if (isRealPlayback && audioPlayer.duration) {
        audioPlayer.currentTime = percent * audioPlayer.duration;
    } else if (!isRealPlayback) {
        const lengthParts = activeTrack.duration.split(":");
        const totalDurationSeconds = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);
        currentSeconds = Math.floor(percent * totalDurationSeconds);
        
        const minutes = Math.floor(currentSeconds / 60);
        const seconds = (currentSeconds % 60).toString().padStart(2, "0");
        currentTime.textContent = `${minutes}:${seconds}`;
        timelineFill.style.width = `${percent * 100}%`;
        timelineThumb.style.left = `${percent * 100}%`;
    }
});

// Volume Bar setting logic
volumeTrack.addEventListener("click", (e) => {
    const rect = volumeTrack.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    currentVolume = percent;
    volumeFill.style.width = `${percent * 100}%`;
    volumeThumb.style.left = `${percent * 100}%`;
    
    audioPlayer.volume = percent;
});

// ==========================================
// FILTER CAPSULES & DEBOUNCED SEARCH ACTIONS
// ==========================================
categoriesRow.addEventListener("click", (e) => {
    if (e.target.classList.contains("capsule")) {
        document.querySelectorAll(".capsule").forEach(c => c.classList.remove("active"));
        e.target.classList.add("active");
        
        // Reset Search Input to avoid UI state mismatch
        if (searchInput) searchInput.value = "";
        
        const genre = e.target.dataset.genre;
        fetchJamendoTracksByGenre(genre);
    }
});

// Debounced Live Search event mapping
let searchTimeout = null;
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        
        searchTimeout = setTimeout(() => {
            if (query.length > 0) {
                // Fetch tracks matching fuzzy text parameters (titles, artists, genres)
                fetchJamendoTracks({ search: query });
            } else {
                // Restore search defaults based on selected capsule
                const activeCapsule = document.querySelector(".capsule.active");
                const genre = activeCapsule ? activeCapsule.dataset.genre : "all";
                fetchJamendoTracksByGenre(genre);
            }
        }, 400); // 400ms delay to balance latency and rate limits
    });
}

// ==========================================
// SESSION DISCONNECT ACTIONS
// ==========================================
document.getElementById("dashboard-logout-btn").addEventListener("click", () => {
    if (confirm("Disconnect session?")) {
        audioPlayer.pause();
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

// Initial boot logic
fetchJamendoTracksByGenre("all");

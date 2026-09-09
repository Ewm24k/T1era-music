import { auth, db, storage } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    ref as sRef, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ==========================================
// CONFIGURATION & GLOBAL CONSTANTS
// ==========================================
const playIconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const pauseIconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`;

const youtubeIconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#ff4d4d" style="display:block;"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
const uploadIconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#00df89" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const midiIconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#e9af51" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`;
const studioIconSvg = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M6 3v11"/><path d="M10 3v11"/><path d="M14 3v11"/><path d="M18 3v11"/><path d="M2 14h20"/></svg>`;

const popularTracksDataMockFallback = [
    { id: 1, title: "Golden Days", artist: "Felix Carter", duration: "3:12", art: "https://picsum.photos/id/65/300/300" },
    { id: 2, title: "Fading Horizon", artist: "Ella Hunt", duration: "4:05", art: "https://picsum.photos/id/1025/300/300" },
    { id: 3, title: "Waves of Time", artist: "Lana Rivers", duration: "2:54", art: "https://picsum.photos/id/322/300/300" },
    { id: 4, title: "Electric Dreams", artist: "Mia Lowell", duration: "3:40", art: "https://picsum.photos/id/338/300/300" },
    { id: 5, title: "Shadows & Light", artist: "Ryan Miles", duration: "3:22", art: "https://picsum.photos/id/352/300/300" },
    { id: 6, title: "Echoes of Midnight", artist: "Jon Hickman", duration: "3:58", art: "https://picsum.photos/id/322/300/300" }
];

const popularGrid = document.getElementById("popular-tracks-grid");
const categoriesRow = document.getElementById("categories-row");
const searchInput = document.getElementById("search-input");

const playerAlbumArt = document.getElementById("player-album-art");
const playerTrackTitle = document.getElementById("player-track-title");
const playerTrackArtist = document.getElementById("player-track-artist");
const trackLength = document.getElementById("track-length");
const currentTime = document.getElementById("current-time");

const playPauseBtn = document.getElementById("player-play-btn");
const playPauseIcon = document.getElementById("play-pause-icon");
const prevBtn = document.getElementById("player-prev-btn");
const nextBtn = document.getElementById("player-next-btn");

const timelineTrack = document.getElementById("timeline-track");
const timelineFill = document.getElementById("timeline-fill");
const timelineThumb = document.getElementById("timeline-thumb");

const volumeTrack = document.getElementById("volume-track");
const volumeFill = document.getElementById("volume-fill");
const volumeThumb = document.getElementById("volume-thumb");

// Tab Navigation Elements
const navHome = document.getElementById("nav-home");
const navTranscriptions = document.getElementById("nav-transcriptions");
const mobileNavHome = document.getElementById("mobile-nav-home");
const mobileNavTranscriptions = document.getElementById("mobile-nav-transcriptions");

const homeView = document.getElementById("home-view");
const transcriptionsView = document.getElementById("transcriptions-view");
const transcriptionsList = document.getElementById("transcriptions-list");

// Audio States
const audioPlayer = new Audio();
let isPlaying = false;
let isRealPlayback = false; 
let currentTrackList = [];  
let currentTrackIndex = -1;
let tickerInterval = null;  
let currentSeconds = 0;
let currentVolume = 0.7;    
let activeTrack = { title: "Echoes of Midnight", artist: "Jon Hickman", duration: "3:58", art: "https://picsum.photos/id/322/100/100" };

if (volumeFill && volumeThumb) {
    volumeFill.style.width = "70%";
    volumeThumb.style.left = "70%";
    audioPlayer.volume = currentVolume;
}

// ==========================================
// UNIFIED DESKTOP & MOBILE TAB NAVIGATION
// ==========================================
function syncActiveNav(tabId) {
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".mobile-nav-item").forEach(item => item.classList.remove("active"));

    if (tabId === "home") {
        if (navHome) navHome.classList.add("active");
        if (mobileNavHome) mobileNavHome.classList.add("active");
        if (homeView) homeView.style.display = "block";
        if (transcriptionsView) transcriptionsView.style.display = "none";
    } else if (tabId === "transcriptions") {
        if (navTranscriptions) navTranscriptions.classList.add("active");
        if (mobileNavTranscriptions) mobileNavTranscriptions.classList.add("active");
        if (homeView) homeView.style.display = "none";
        if (transcriptionsView) transcriptionsView.style.display = "block";
        loadUserTranscriptions();
    }
}

if (navHome) {
    navHome.addEventListener("click", (e) => {
        e.preventDefault();
        syncActiveNav("home");
    });
}
if (mobileNavHome) {
    mobileNavHome.addEventListener("click", (e) => {
        e.preventDefault();
        syncActiveNav("home");
    });
}

if (navTranscriptions) {
    navTranscriptions.addEventListener("click", (e) => {
        e.preventDefault();
        syncActiveNav("transcriptions");
    });
}
if (mobileNavTranscriptions) {
    mobileNavTranscriptions.addEventListener("click", (e) => {
        e.preventDefault();
        syncActiveNav("transcriptions");
    });
}

// ==========================================
// AUTHENTICATION STATE CONTROL
// ==========================================
let currentUser = null;
let isAuthReady = false;

if (auth) {
  onAuthStateChanged(auth, (user) => {
    isAuthReady = true;
    if (user) {
      currentUser = user;
      const profileName = document.getElementById("profile-name");
      const profileAvatar = document.getElementById("profile-avatar");
      
      if (profileName) {
        profileName.textContent = user.displayName || user.email?.split("@")[0] || "Studio Creator";
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

      if (transcriptionsView && transcriptionsView.style.display !== "none") {
          loadUserTranscriptions();
      }
    } else {
      window.location.href = "index.html";
    }
  });
}

// ==========================================
// TITLE SANITIZATION & RESOLUTION ENGINE
// ==========================================
function isValidTitle(val) {
    if (!val || typeof val !== "string") return false;
    const clean = val.trim().toLowerCase();
    if (!clean) return false;
    if (clean === "local uploaded track" || clean === "uploaded track" || clean === "audio" || clean === "untitled") return false;
    if (clean.startsWith("youtube stream audio") || clean === "youtube track asset") return false;
    return true;
}

function cleanTitleFormat(name) {
    if (!name) return "";
    let clean = name.trim();
    clean = clean.replace(/\.(mid|midi|mp3|wav|m4a|ogg|aac|flac|json)$/i, "");
    clean = clean.replace(/[-_]+/g, " ");
    clean = clean.replace(/\s+/g, " ").trim();
    return clean.split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function extractFilenameFromUrl(url) {
    if (!url) return "";
    try {
        const decoded = decodeURIComponent(url);
        const withoutQuery = decoded.split("?")[0];
        const segments = withoutQuery.split("/").filter(Boolean);
        if (segments.length === 0) return "";
        
        let file = segments[segments.length - 1];
        if (["final_score.mid", "score.mid", "output.mid"].includes(file.toLowerCase())) {
            if (segments.length >= 2) {
                const folderName = segments[segments.length - 2];
                if (folderName && !["midi_jobs", "midi", "uploads", "transcriptions"].includes(folderName.toLowerCase())) {
                    return folderName;
                }
            }
        }
        return file;
    } catch (e) {
        return "";
    }
}

function extractYouTubeVideoId(url) {
    if (!url) return null;
    try {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|[?&]v=)([^#&?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return match[2];
        }
    } catch (e) {}
    return null;
}

function resolveJobTitle(data, docId) {
    if (isValidTitle(data.title)) return cleanTitleFormat(data.title);
    if (isValidTitle(data.songTitle)) return cleanTitleFormat(data.songTitle);
    if (isValidTitle(data.trackTitle)) return cleanTitleFormat(data.trackTitle);
    if (isValidTitle(data.trackName)) return cleanTitleFormat(data.trackName);
    
    const directFile = data.fileName || data.originalFileName || data.filename || data.name || data.audioFileName;
    if (isValidTitle(directFile)) return cleanTitleFormat(directFile);

    if (isValidTitle(data.youtubeTitle)) return cleanTitleFormat(data.youtubeTitle);
    if (isValidTitle(data.videoTitle)) return cleanTitleFormat(data.videoTitle);

    const urlCandidate = data.midiUrl || data.originalMidiUrl || data.audioUrl || data.sourceUrl;
    if (urlCandidate) {
        const parsedFile = extractFilenameFromUrl(urlCandidate);
        if (isValidTitle(parsedFile)) return cleanTitleFormat(parsedFile);
    }

    if (data.youtubeUrl) {
        const ytId = extractYouTubeVideoId(data.youtubeUrl);
        if (ytId) return `YouTube Video (${ytId})`;
    }

    return `Transcription Track #${docId ? docId.substring(0, 6) : "Studio"}`;
}

// ==========================================
// FIRESTORE TRANSCRIPTIONS SYNC
// ==========================================
let snapshotUnsubscribe = null;

function loadUserTranscriptions() {
    if (!transcriptionsList) return;

    if (!isAuthReady) {
        transcriptionsList.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.4); font-size:0.85rem; padding:40px 0;">Authenticating user session...</div>`;
        return;
    }

    if (!currentUser || !db) {
        renderEmptyTranscriptions();
        return;
    }

    transcriptionsList.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.4); font-size:0.85rem; padding:40px 0;">Loading your transcriptions...</div>`;

    if (snapshotUnsubscribe) {
        snapshotUnsubscribe();
    }

    const jobsRef = collection(db, "users", currentUser.uid, "midi_jobs");

    snapshotUnsubscribe = onSnapshot(jobsRef, async (snapshot) => {
        const userJobs = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            const rawStatus = (data.status || "").toString().toUpperCase();
            const isCompleted = !data.status || ["COMPLETED", "READY", "DONE", "SUCCESS", "FINISHED"].includes(rawStatus);
            const midiUrl = data.midiUrl || data.midi_url || data.downloadUrl || data.url || data.originalMidiUrl;

            if (isCompleted && midiUrl) {
                const resolvedTitle = resolveJobTitle(data, docSnap.id);
                
                let source = "UPLOAD";
                if (data.youtubeUrl || data.source === "YOUTUBE") {
                    source = "YOUTUBE";
                } else if (resolvedTitle.endsWith(".mid") || (data.mimeType && data.mimeType.includes("midi"))) {
                    source = "MIDI";
                }

                userJobs.push({
                    id: docSnap.id,
                    title: resolvedTitle,
                    source: source,
                    midiUrl: midiUrl,
                    originalMidiUrl: data.originalMidiUrl || null,
                    completedAt: data.completedAt || data.createdAt || null,
                    date: data.completedAt 
                        ? new Date(data.completedAt.seconds * 1000).toLocaleDateString() 
                        : (data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : "Ready")
                });
            }
        });

        if (userJobs.length === 0) {
            renderEmptyTranscriptions();
            return;
        }

        userJobs.sort((a, b) => {
            const timeA = a.completedAt?.seconds || 0;
            const timeB = b.completedAt?.seconds || 0;
            return timeB - timeA;
        });

        renderTranscriptionsList(userJobs);

    }, (error) => {
        console.error("[FIRESTORE SYNC ERROR] Failed to fetch midi_jobs:", error);
        renderEmptyTranscriptions();
    });
}

function renderEmptyTranscriptions() {
    if (!transcriptionsList) return;
    transcriptionsList.innerHTML = `
        <div class="trans-empty-state">
            <div class="trans-empty-icon">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="20" height="18" rx="2"/>
                    <path d="M6 3v11"/><path d="M10 3v11"/><path d="M14 3v11"/><path d="M18 3v11"/><path d="M2 14h20"/>
                </svg>
            </div>
            <h4 class="trans-empty-title">No Transcriptions Found</h4>
            <p class="trans-empty-desc">You haven't converted any tracks yet. Transcribe a YouTube video or upload audio files to access interactive piano sheet music.</p>
            <a href="midiano.html" class="trans-empty-btn">
                Launch Piano Studio
            </a>
        </div>
    `;
}

function renderTranscriptionsList(list) {
    if (!transcriptionsList) return;
    transcriptionsList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    list.forEach((track, index) => {
        const indexStr = (index + 1).toString().padStart(2, "0");
        const row = document.createElement("div");
        row.className = "trans-row";
        
        let artClass = "upload";
        let artIcon = uploadIconSvg;
        let badgeLabel = "Audio Upload";
        let badgeClass = "upload";

        if (track.source === "YOUTUBE") {
            artClass = "youtube";
            artIcon = youtubeIconSvg;
            badgeLabel = "YouTube";
            badgeClass = "youtube";
        } else if (track.source === "MIDI") {
            artClass = "midi";
            artIcon = midiIconSvg;
            badgeLabel = "MIDI File";
            badgeClass = "midi";
        }

        row.innerHTML = `
            <div class="trans-row__left">
                <span class="trans-row__index">${indexStr}</span>
                <div class="trans-row__art-wrap ${artClass}">${artIcon}</div>
                <div class="trans-row__meta">
                    <span class="trans-row__title" title="${track.title}">${track.title}</span>
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
            const actionBtn = row.querySelector(".trans-row__action");
            if (actionBtn) {
                actionBtn.textContent = "Loading...";
                actionBtn.style.opacity = "0.7";
            }
            openStudioWithTrack(track);
        });

        fragment.appendChild(row);
    });

    transcriptionsList.appendChild(fragment);
}

// ==========================================
// SEAMLESS MIDI STUDIO REDIRECTOR
// ==========================================
async function openStudioWithTrack(track) {
    if (!track || !track.midiUrl) return;

    let finalUrl = track.midiUrl;

    // Resolve storage paths or gs:// URLs to public HTTP download URLs
    const isStoragePath = finalUrl.startsWith("gs://") || 
        (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("blob:") && !finalUrl.startsWith("data:"));

    if (storage && isStoragePath) {
        try {
            const cleanPath = finalUrl.startsWith("gs://") 
                ? finalUrl.replace(/^gs:\/\/[^\/]+\//, "") 
                : finalUrl;
            const fileRef = sRef(storage, cleanPath);
            finalUrl = await getDownloadURL(fileRef);
        } catch (err) {
            console.warn("[STORAGE RESOLVE ERROR] Could not get download URL, using raw URL:", err);
        }
    }

    // Persist to localStorage across all common key aliases
    localStorage.setItem("t1era_current_midi", finalUrl);
    localStorage.setItem("t1era_current_title", track.title);
    localStorage.setItem("midiUrl", finalUrl);
    localStorage.setItem("current_midi", finalUrl);

    // Build URL query string with both MIDI URL and track title
    const queryParams = new URLSearchParams({
        midi: finalUrl,
        url: finalUrl,
        file: finalUrl,
        title: track.title
    });

    window.location.href = "midiano.html?" + queryParams.toString();
}

// =======================================================
// DEEZER MUSIC API VIA JSONP (KEYLESS CORS BYPASS)
// =======================================================
function makeDeezerJSONPRequest(endpoint, params) {
    return new Promise((resolve, reject) => {
        const callbackName = "deezerCallback_" + Math.floor(Math.random() * 1000000);
        const queryParams = new URLSearchParams({
            output: "jsonp",
            callback: callbackName,
            ...params
        });

        const script = document.createElement("script");
        script.src = `https://api.deezer.com/${endpoint}?${queryParams.toString()}`;
        
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Request timed out."));
        }, 4000);

        window[callbackName] = function(data) {
            cleanup();
            if (data.error) {
                reject(new Error(data.error.message || "API Failure"));
            } else {
                resolve(data);
            }
        };

        script.onerror = function() {
            cleanup();
            reject(new Error("Network connection blocked script load."));
        };

        function cleanup() {
            clearTimeout(timeoutId);
            delete window[callbackName];
            script.remove();
        }

        document.head.appendChild(script);
    });
}

async function fetchDeezerTracks(params = {}) {
    if (!popularGrid) return;

    popularGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.4); padding: 40px 0; font-size: 11.5px; font-weight: 500;">
            Retrieving songs from Deezer...
        </div>
    `;

    try {
        const data = await makeDeezerJSONPRequest("search", params);
        if (data.data && data.data.length > 0) {
            currentTrackList = data.data.map(track => ({
                id: track.id,
                title: track.title,
                artist: track.artist.name,
                duration: formatDuration(track.duration),
                duration_seconds: track.duration,
                art: track.album.cover_medium || track.album.cover || "https://picsum.photos/id/1025/300/300",
                audio: track.preview 
            }));
            renderPopularTracks(currentTrackList);
        } else {
            popularGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.4); padding: 40px 0; font-size: 11.5px;">
                    No tracks match your query. Try searching another term!
                </div>
            `;
        }
    } catch (error) {
        console.warn("[HYBRID DATA RESOLVER] Routing locally. Reason:", error.message);
        
        if (params.q) {
            const searchFiltered = searchLocalMockTracks(params.q);
            currentTrackList = searchFiltered;
            renderPopularTracks(searchFiltered);
        } else {
            currentTrackList = popularTracksDataMockFallback;
            renderPopularTracks(currentTrackList);
        }
    }
}

function fetchDeezerTracksByGenre(genre) {
    if (genre === "all") {
        fetchDeezerTracks({ q: "top hits" }); 
    } else {
        fetchDeezerTracks({ q: genre });
    }
}

function searchLocalMockTracks(queryText) {
    const lowerQuery = queryText.toLowerCase();
    const matches = popularTracksDataMockFallback.filter(track => 
        track.title.toLowerCase().includes(lowerQuery) || 
        track.artist.toLowerCase().includes(lowerQuery)
    );
    return matches.length > 0 ? matches : [];
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
}

function renderPopularTracks(tracks) {
    if (!popularGrid) return;
    popularGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    if (tracks.length === 0) {
        popularGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.4); padding: 40px 0; font-size: 11.5px;">
                No matches found.
            </div>
        `;
        return;
    }

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
// AUDIO PLAYBACK CONTROLS
// ==========================================
function selectAndPlayTrack(track) {
    activeTrack = track;
    if (playerAlbumArt) playerAlbumArt.src = track.art;
    if (playerTrackTitle) playerTrackTitle.textContent = track.title;
    if (playerTrackArtist) playerTrackArtist.textContent = track.artist;
    
    audioPlayer.pause();
    if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
    }

    if (track.audio) {
        isRealPlayback = true;
        audioPlayer.src = track.audio;
        audioPlayer.volume = currentVolume;
        audioPlayer.play()
            .then(() => {
                isPlaying = true;
                if (playPauseIcon) playPauseIcon.innerHTML = pauseIconSvg;
                if (playPauseBtn) playPauseBtn.style.transform = "scale(1.05)";
            })
            .catch(err => {
                console.warn("[PLAYBACK INTERRUPTED] Playback halted:", err);
            });
    } else {
        isRealPlayback = false;
        if (trackLength) trackLength.textContent = track.duration;
        currentSeconds = 0;
        if (currentTime) currentTime.textContent = "0:00";
        if (timelineFill) timelineFill.style.width = "0%";
        if (timelineThumb) timelineThumb.style.left = "0%";
        startPlaybackState();
    }
}

if (playPauseBtn) {
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
                    .catch(err => console.warn("Failed play track preview:", err));
            }
        } else {
            if (isPlaying) {
                pausePlaybackState();
            } else {
                startPlaybackState();
            }
        }
    });
}

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

function startPlaybackState() {
    isPlaying = true;
    if (playPauseIcon) playPauseIcon.innerHTML = pauseIconSvg;
    if (playPauseBtn) playPauseBtn.style.transform = "scale(1.05)";
    
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(updatePlayerTick, 1000);
}

function pausePlaybackState() {
    isPlaying = false;
    if (playPauseIcon) playPauseIcon.innerHTML = playIconSvg;
    if (playPauseBtn) playPauseBtn.style.transform = "";
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
    if (currentTime) currentTime.textContent = `${minutes}:${seconds}`;

    const percentage = (currentSeconds / totalDurationSeconds) * 100;
    if (timelineFill) timelineFill.style.width = `${percentage}%`;
    if (timelineThumb) timelineThumb.style.left = `${percentage}%`;
}

audioPlayer.addEventListener("timeupdate", () => {
    if (!isRealPlayback) return;
    const current = audioPlayer.currentTime;
    const duration = audioPlayer.duration || activeTrack.duration_seconds || 1;
    
    if (currentTime) currentTime.textContent = formatDuration(current);
    const percentage = (current / duration) * 100;
    if (timelineFill) timelineFill.style.width = `${percentage}%`;
    if (timelineThumb) timelineThumb.style.left = `${percentage}%`;
});

audioPlayer.addEventListener("loadedmetadata", () => {
    if (!isRealPlayback) return;
    if (trackLength) trackLength.textContent = formatDuration(audioPlayer.duration);
});

audioPlayer.addEventListener("ended", () => {
    if (!isRealPlayback) return;
    if (currentTrackList.length > 0 && currentTrackIndex < currentTrackList.length - 1) {
        currentTrackIndex++;
        selectAndPlayTrack(currentTrackList[currentTrackIndex]);
    } else {
        isPlaying = false;
        if (playPauseIcon) playPauseIcon.innerHTML = playIconSvg;
        if (playPauseBtn) playPauseBtn.style.transform = "";
    }
});

if (timelineTrack) {
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
            if (currentTime) currentTime.textContent = `${minutes}:${seconds}`;
            if (timelineFill) timelineFill.style.width = `${percent * 100}%`;
            if (timelineThumb) timelineThumb.style.left = `${percent * 100}%`;
        }
    });
}

if (volumeTrack) {
    volumeTrack.addEventListener("click", (e) => {
        const rect = volumeTrack.getBoundingClientRect();
        const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        currentVolume = percent;
        if (volumeFill) volumeFill.style.width = `${percent * 100}%`;
        if (volumeThumb) volumeThumb.style.left = `${percent * 100}%`;
        
        audioPlayer.volume = percent;
    });
}

if (categoriesRow) {
    categoriesRow.addEventListener("click", (e) => {
        if (e.target.classList.contains("capsule")) {
            document.querySelectorAll(".capsule").forEach(c => c.classList.remove("active"));
            e.target.classList.add("active");
            
            if (searchInput) searchInput.value = "";
            
            const genre = e.target.dataset.genre;
            fetchDeezerTracksByGenre(genre);
        }
    });
}

let searchTimeout = null;
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        
        searchTimeout = setTimeout(() => {
            if (query.length > 0) {
                fetchDeezerTracks({ q: query });
            } else {
                const activeCapsule = document.querySelector(".capsule.active");
                const genre = activeCapsule ? activeCapsule.dataset.genre : "all";
                fetchDeezerTracksByGenre(genre);
            }
        }, 400); 
    });
}

const disclaimerModal = document.getElementById("disclaimer-modal");
const closeDisclaimerBtn = document.getElementById("close-disclaimer-btn");
const acknowledgeDisclaimerBtn = document.getElementById("acknowledge-disclaimer-btn");

if (disclaimerModal) {
    const isAcknowledged = localStorage.getItem("t1era_disclaimer_acknowledged");
    if (!isAcknowledged) {
        disclaimerModal.style.display = "flex";
    }

    const closePopup = () => {
        disclaimerModal.style.display = "none";
        localStorage.setItem("t1era_disclaimer_acknowledged", "true");
    };

    if (closeDisclaimerBtn) {
        closeDisclaimerBtn.addEventListener("click", closePopup);
    }
    if (acknowledgeDisclaimerBtn) {
        acknowledgeDisclaimerBtn.addEventListener("click", closePopup);
    }
}

const logoutBtn = document.getElementById("dashboard-logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
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
}

// Boot initial genre
fetchDeezerTracksByGenre("all");

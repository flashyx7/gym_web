(function () {
  function tracks() {
    return PLAYLISTS[state.genre].tracks;
  }

  const state = {
    genre: DEFAULT_GENRE,
    order: PLAYLISTS[DEFAULT_GENRE].tracks.map((_, i) => i), // playback order (shuffled or not)
    pos: 0, // index into `order`
    shuffled: false,
    playing: false,
    player: null,
    ready: false,
    progressTimer: null,
  };

  const els = {
    ytLink: document.getElementById("ytLink"),
    hypeBtn: document.getElementById("hypeBtn"),
    hypeAudio: document.getElementById("hypeAudio"),
    trackListItems: document.getElementById("trackListItems"),
    trackList: document.getElementById("trackList"),
    art: document.getElementById("art"),
    disc: document.getElementById("disc"),
    trackTitle: document.getElementById("trackTitle"),
    trackArtist: document.getElementById("trackArtist"),
    seek: document.getElementById("seek"),
    seekFill: document.getElementById("seekFill"),
    seekKnob: document.getElementById("seekKnob"),
    curTime: document.getElementById("curTime"),
    durTime: document.getElementById("durTime"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    prevBtn: document.getElementById("prevBtn"),
    playBtn: document.getElementById("playBtn"),
    nextBtn: document.getElementById("nextBtn"),
    playlistBtn: document.getElementById("playlistBtn"),
    playIcon: document.getElementById("playIcon"),
    pauseIcon: document.getElementById("pauseIcon"),
  };

  function updateYtLink() {
    els.ytLink.href = PLAYLISTS[state.genre].url || "#";
  }
  updateYtLink();

  // ---- live clock ----
  const clockEl = document.getElementById("clock");
  function updateClock() {
    clockEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ---- live presence (real) ----
  // Pings /api/presence every 30s with a per-tab session id; the server
  // counts distinct ids seen in the last 75s. Stays hidden until a real
  // count arrives -- never shows a made-up number. Requires deploying to
  // Vercel with Upstash Redis configured (see .env.example); under a plain
  // static server (e.g. `npx serve`), /api/presence doesn't exist and the
  // indicator correctly stays hidden.
  (function trackPresence() {
    const indicator = document.getElementById("presence");
    const countEl = document.getElementById("listeners");
    const BEAT_MS = 30000;

    let sid;
    try {
      sid = sessionStorage.getItem("gym-sid");
      if (!sid) {
        sid = crypto.randomUUID();
        sessionStorage.setItem("gym-sid", sid);
      }
    } catch {
      sid = crypto.randomUUID();
    }

    let everWorked = false;

    async function beat() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/presence?id=${encodeURIComponent(sid)}`);
        if (!res.ok) throw new Error(String(res.status));
        const { count } = await res.json();
        countEl.textContent = String(count);
        indicator.hidden = false;
        everWorked = true;
      } catch {
        if (!everWorked) indicator.hidden = true;
      }
    }

    indicator.hidden = true;
    beat();
    setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) beat();
    });
  })();

  // ---- rotating motivational quotes ----
  const QUOTES = [
    "Hit play and get to work.",
    "One more rep than yesterday.",
    "Sweat now, shine later.",
    "Discipline beats motivation.",
    "Show up. Lift. Repeat.",
    "Your only competition is you.",
    "Strong body, stronger mind.",
    "Earn it.",
  ];
  const quoteEl = document.getElementById("quote");
  let quoteIndex = 0;
  function rotateQuote() {
    quoteEl.style.opacity = "0";
    setTimeout(() => {
      quoteIndex = (quoteIndex + 1) % QUOTES.length;
      quoteEl.textContent = QUOTES[quoteIndex];
      quoteEl.style.opacity = "1";
    }, 300);
  }
  setInterval(rotateQuote, 4500);

  let hypeAnimTimer = null;
  els.hypeBtn.addEventListener("click", () => {
    els.hypeAudio.currentTime = 0;
    els.hypeAudio.play().catch(() => {});

    els.hypeBtn.classList.remove("is-hit");
    void els.hypeBtn.offsetWidth; // restart the animation even on rapid re-clicks
    els.hypeBtn.classList.add("is-hit");
    clearTimeout(hypeAnimTimer);
    hypeAnimTimer = setTimeout(() => els.hypeBtn.classList.remove("is-hit"), 650);
  });

  function currentTrackIndex() {
    return state.order[state.pos];
  }

  function renderList() {
    els.trackListItems.innerHTML = "";
    tracks().forEach((track, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.index = String(i);
      btn.innerHTML =
        '<span class="track__title">' + escapeHtml(track.title) + "</span>" +
        '<span class="track__artist">' + escapeHtml(track.artist) + "</span>";
      btn.addEventListener("click", () => {
        const posInOrder = state.order.indexOf(i);
        state.pos = posInOrder === -1 ? 0 : posInOrder;
        loadCurrent(true);
        closeList();
      });
      li.appendChild(btn);
      els.trackListItems.appendChild(li);
    });
    highlightActive();
  }

  function highlightActive() {
    const activeIndex = currentTrackIndex();
    els.trackListItems.querySelectorAll("li").forEach((li) => {
      const btn = li.querySelector("button");
      li.classList.toggle("is-current", Number(btn.dataset.index) === activeIndex);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const horns = document.querySelector(".horns");
  function openList() {
    els.trackList.classList.add("is-open");
    els.playlistBtn.classList.add("is-active");
    horns.classList.add("is-suppressed");
  }
  function closeList() {
    els.trackList.classList.remove("is-open");
    els.playlistBtn.classList.remove("is-active");
    horns.classList.remove("is-suppressed");
  }
  els.playlistBtn.addEventListener("click", () => {
    els.trackList.classList.contains("is-open") ? closeList() : openList();
  });

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function updateNowPlayingUI() {
    const track = tracks()[currentTrackIndex()];
    if (!track) return;
    els.trackTitle.textContent = track.title;
    els.trackArtist.textContent = track.artist;
    els.art.src = "https://img.youtube.com/vi/" + track.videoId + "/hqdefault.jpg";
    els.art.alt = track.title;
    highlightActive();
  }

  function loadCurrent(autoplay) {
    updateNowPlayingUI();
    if (!state.ready) return;
    const track = tracks()[currentTrackIndex()];
    if (autoplay) {
      state.player.loadVideoById(track.videoId);
      state.playing = true;
    } else {
      state.player.cueVideoById(track.videoId);
      state.playing = false;
    }
    setPlayIcon();
  }

  function setPlayIcon() {
    els.playIcon.style.display = state.playing ? "none" : "";
    els.pauseIcon.style.display = state.playing ? "" : "none";
    els.playBtn.title = state.playing ? "Pause" : "Play";
    els.playBtn.setAttribute("aria-label", state.playing ? "Pause" : "Play");
    els.disc.classList.toggle("is-spinning", state.playing);
  }

  els.playBtn.addEventListener("click", () => {
    if (!state.ready) return;
    if (state.playing) {
      state.player.pauseVideo();
    } else {
      state.player.playVideo();
    }
  });

  function step(delta) {
    state.pos = (state.pos + delta + state.order.length) % state.order.length;
    loadCurrent(true);
  }
  els.nextBtn.addEventListener("click", () => step(1));
  els.prevBtn.addEventListener("click", () => step(-1));

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  els.shuffleBtn.addEventListener("click", () => {
    const activeIndex = currentTrackIndex();
    state.shuffled = !state.shuffled;
    els.shuffleBtn.classList.toggle("is-active", state.shuffled);
    if (state.shuffled) {
      const rest = shuffleArray(tracks().map((_, i) => i).filter((i) => i !== activeIndex));
      state.order = [activeIndex, ...rest];
    } else {
      state.order = tracks().map((_, i) => i);
    }
    state.pos = state.order.indexOf(activeIndex);
  });

  function renderSeek(pct) {
    pct = Math.max(0, Math.min(100, pct));
    els.seekFill.style.transform = `scaleX(${pct / 100})`;
    els.seekKnob.style.left = pct + "%";
    els.seek.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function pctFromPointer(clientX) {
    const rect = els.seek.getBoundingClientRect();
    const ratio = rect.width ? (clientX - rect.left) / rect.width : 0;
    return Math.max(0, Math.min(100, ratio * 100)) ;
  }

  let seeking = false;
  els.seek.addEventListener("pointerdown", (e) => {
    if (!state.ready) return;
    seeking = true;
    els.seek.setPointerCapture(e.pointerId);
    renderSeek(pctFromPointer(e.clientX));
  });
  els.seek.addEventListener("pointermove", (e) => {
    if (!seeking) return;
    renderSeek(pctFromPointer(e.clientX));
  });
  function endSeek(e) {
    if (!seeking) return;
    seeking = false;
    if (!state.ready) return;
    const duration = state.player.getDuration() || 0;
    const pct = pctFromPointer(e.clientX);
    state.player.seekTo((pct / 100) * duration, true);
  }
  els.seek.addEventListener("pointerup", endSeek);
  els.seek.addEventListener("pointercancel", () => { seeking = false; });

  els.seek.addEventListener("keydown", (e) => {
    if (!state.ready) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const duration = state.player.getDuration() || 0;
    const current = state.player.getCurrentTime() || 0;
    const delta = e.key === "ArrowRight" ? 5 : -5;
    const target = Math.max(0, Math.min(duration, current + delta));
    state.player.seekTo(target, true);
  });

  function pollProgress() {
    if (!state.ready || seeking) return;
    let duration = 0, current = 0;
    try {
      duration = state.player.getDuration() || 0;
      current = state.player.getCurrentTime() || 0;
    } catch (e) { return; }
    els.durTime.textContent = formatTime(duration);
    els.curTime.textContent = formatTime(current);
    renderSeek(duration ? (current / duration) * 100 : 0);
  }

  const genreTabs = document.querySelectorAll(".genre-tab");
  function setActiveTab() {
    genreTabs.forEach((tab) => {
      const isActive = tab.dataset.genre === state.genre;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
  }
  function switchGenre(genre) {
    if (genre === state.genre || !PLAYLISTS[genre]) return;
    const wasPlaying = state.playing;
    state.genre = genre;
    state.shuffled = false;
    els.shuffleBtn.classList.remove("is-active");
    state.order = tracks().map((_, i) => i);
    state.pos = 0;
    setActiveTab();
    updateYtLink();
    renderList();
    loadCurrent(wasPlaying);
  }
  genreTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchGenre(tab.dataset.genre));
  });
  setActiveTab();

  renderList();
  updateNowPlayingUI();

  window.onYouTubeIframeAPIReady = function () {
    state.player = new YT.Player("ytPlayer", {
      height: "1",
      width: "1",
      videoId: tracks()[currentTrackIndex()].videoId,
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: function () {
          state.ready = true;
          state.progressTimer = setInterval(pollProgress, 500);
        },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.PLAYING) {
            state.playing = true;
            setPlayIcon();
          } else if (e.data === YT.PlayerState.PAUSED) {
            state.playing = false;
            setPlayIcon();
          } else if (e.data === YT.PlayerState.ENDED) {
            step(1);
          }
        },
      },
    });
  };
})();

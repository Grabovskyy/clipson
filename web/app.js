'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const MODE_LABELS = { av: 'MP4', v: 'MP4 video', a: 'WAV', gif: 'GIF', png: 'PNG' };

const S = {
  api: null,
  player: null,
  playerReady: false,
  videoId: null,
  title: '',
  duration: 0,
  inT: null,
  outT: null,
  previewing: false,
  pendingStart: 0,
  mode: 'av',
  quality: '1080',
  accurate: true,
  jobs: {},
};

/* ---------- time helpers ---------- */

const round1 = (x) => Math.round(x * 10) / 10;

function fmt(t) {
  if (t == null || isNaN(t)) return '';
  t = Math.max(0, round1(t));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`;
}

function parseTime(str) {
  str = String(str || '').trim().replace(',', '.');
  if (!str) return null;
  if (!/^\d+(:\d+){0,2}(\.\d*)?$/.test(str)) return NaN;
  return round1(str.split(':').reduce((acc, part) => acc * 60 + parseFloat(part || '0'), 0));
}

function parseYtTime(str) {
  if (!str) return 0;
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const m = str.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

function extractVideo(text) {
  text = (text || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return { id: text, start: 0 };
  const m = text.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (!m) return null;
  const t = text.match(/[?&#](?:t|start)=([0-9hms.]+)/);
  return { id: m[1], start: t ? parseYtTime(t[1]) : 0 };
}

/* ---------- toasts ---------- */

function toast(title, text = '', kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<b></b><span></span>`;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 8000 : 5000);
}

/* ---------- URL input ---------- */

let urlTimer = null;

function handleUrl(immediate) {
  clearTimeout(urlTimer);
  const run = () => {
    const box = $('#urlBox');
    const text = $('#url').value;
    const video = extractVideo(text);
    box.classList.toggle('invalid', !!text.trim() && !video);
    if (video && video.id !== S.videoId) loadVideo(video.id, video.start);
  };
  immediate ? run() : (urlTimer = setTimeout(run, 350));
}

$('#url').addEventListener('input', () => handleUrl(false));
$('#url').addEventListener('paste', () => setTimeout(() => handleUrl(true), 0));
$('#clearUrl').addEventListener('click', () => {
  $('#url').value = '';
  $('#urlBox').classList.remove('invalid');
  $('#url').focus();
});

document.addEventListener('paste', (e) => {
  if (isTyping(e.target)) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (extractVideo(text)) {
    $('#url').value = text.trim();
    handleUrl(true);
  }
});

/* ---------- YouTube player ---------- */

let apiReadyResolve;
const ytApiReady = new Promise((r) => (apiReadyResolve = r));
window.onYouTubeIframeAPIReady = () => apiReadyResolve();

async function loadVideo(id, start = 0) {
  S.videoId = id;
  S.title = '';
  S.duration = 0;
  S.inT = S.outT = null;
  S.previewing = false;
  S.pendingStart = start;
  $('#empty').classList.add('hidden');
  $('#editor').classList.remove('hidden');
  $('#videoTitle').textContent = 'Ładowanie...';
  $('#urlBox').classList.add('loaded');
  $('#url').blur();
  updateMarks();

  await ytApiReady;
  if (S.player && S.playerReady) {
    S.player.cueVideoById({ videoId: id, startSeconds: start });
    return;
  }
  if (S.player) return;
  S.player = new YT.Player('player', {
    videoId: id,
    playerVars: {
      autoplay: 0, rel: 0, modestbranding: 1, playsinline: 1,
      enablejsapi: 1, origin: location.origin, start: Math.floor(start),
    },
    events: {
      onReady: () => {
        S.playerReady = true;
        if (S.player.getVideoData().video_id !== S.videoId) {
          S.player.cueVideoById({ videoId: S.videoId, startSeconds: S.pendingStart });
        }
        requestAnimationFrame(tick);
      },
      onStateChange: (e) => {
        $('#playBtn').innerHTML = e.data === YT.PlayerState.PLAYING ? '&#10074;&#10074;' : '&#9654;';
        if (e.data !== YT.PlayerState.PLAYING && e.data !== YT.PlayerState.BUFFERING) S.previewing = false;
      },
      onError: (e) => {
        const msg = {
          2: 'Nieprawidłowe ID filmu.',
          5: 'Błąd odtwarzacza HTML5.',
          100: 'Film nie istnieje albo jest prywatny.',
          101: 'Właściciel zablokował odtwarzanie poza YouTube. Możesz wpisać czasy IN/OUT ręcznie i pobrać fragment.',
          150: 'Właściciel zablokował odtwarzanie poza YouTube. Możesz wpisać czasy IN/OUT ręcznie i pobrać fragment.',
          153: 'Odtwarzacz odrzucił osadzenie. Możesz wpisać czasy IN/OUT ręcznie.',
        }[e.data] || `Błąd odtwarzacza (${e.data}).`;
        toast('Problem z odtwarzaczem', msg, 'error');
      },
    },
  });
}

function playerTime() {
  return S.playerReady && S.player.getCurrentTime ? S.player.getCurrentTime() || 0 : 0;
}

function seek(t, final = true) {
  if (!S.playerReady) return;
  t = Math.max(0, S.duration ? Math.min(t, S.duration) : t);
  S.player.seekTo(t, final);
  if (!isFocused($('#currentTime'))) $('#currentTime').value = fmt(t);
}

function step(delta) {
  if (!S.playerReady) return;
  S.player.pauseVideo();
  seek(round1(playerTime() + delta));
}

function togglePlay() {
  if (!S.playerReady) return;
  const st = S.player.getPlayerState();
  st === YT.PlayerState.PLAYING ? S.player.pauseVideo() : S.player.playVideo();
}

function preview() {
  if (!S.playerReady || S.inT == null) return;
  seek(S.inT);
  S.player.playVideo();
  setTimeout(() => (S.previewing = S.outT != null), 150);
}

function tick() {
  if (S.playerReady) {
    const data = S.player.getVideoData ? S.player.getVideoData() : null;
    if (data && data.video_id === S.videoId) {
      if (!S.title && data.title) {
        S.title = data.title;
        $('#videoTitle').textContent = data.title;
      }
      const d = S.player.getDuration();
      if (d && Math.abs(d - S.duration) > 0.05) {
        S.duration = d;
        $('#totalTime').textContent = `/ ${fmt(d)}`;
        buildRuler();
        updateMarks();
      }
    }
    const t = playerTime();
    if (!isFocused($('#currentTime'))) $('#currentTime').value = fmt(t);
    if (S.duration) $('#playhead').style.left = `${(t / S.duration) * 100}%`;
    if (S.previewing && S.outT != null && t >= S.outT) {
      S.previewing = false;
      S.player.pauseVideo();
      seek(S.outT);
    }
  }
  requestAnimationFrame(tick);
}

/* ---------- IN / OUT ---------- */

function setMark(which, t) {
  if (t != null) t = Math.max(0, round1(S.duration ? Math.min(t, S.duration) : t));
  if (which === 'in') S.inT = t;
  else S.outT = t;
  updateMarks();
}

function updateMarks() {
  const inEl = $('#inTime');
  const outEl = $('#outTime');
  if (!isFocused(inEl)) inEl.value = fmt(S.inT);
  if (!isFocused(outEl)) outEl.value = fmt(S.outT);

  const hasRange = S.inT != null && S.outT != null;
  const valid = hasRange && S.outT > S.inT;
  $('#clipLength').textContent = hasRange ? (valid ? fmt(S.outT - S.inT) : 'błąd') : '–';
  $('#clipLength').style.color = hasRange && !valid ? 'var(--out)' : '';
  $('#previewBtn').disabled = S.inT == null;

  const pct = (t) => `${(t / S.duration) * 100}%`;
  const showHandles = S.duration > 0;
  $('#handleIn').style.display = showHandles && S.inT != null ? 'block' : 'none';
  $('#handleOut').style.display = showHandles && S.outT != null ? 'block' : 'none';
  if (showHandles && S.inT != null) $('#handleIn').style.left = pct(S.inT);
  if (showHandles && S.outT != null) $('#handleOut').style.left = pct(S.outT);
  const range = $('#range');
  if (showHandles && valid) {
    range.style.display = 'block';
    range.style.left = pct(S.inT);
    range.style.width = `${((S.outT - S.inT) / S.duration) * 100}%`;
  } else {
    range.style.display = 'none';
  }
  updateDownloadState();
}

$('#setIn').addEventListener('click', () => setMark('in', playerTime()));
$('#setOut').addEventListener('click', () => setMark('out', playerTime()));
$('#previewBtn').addEventListener('click', preview);
$('#playBtn').addEventListener('click', togglePlay);
$$('.step-btn').forEach((b) => b.addEventListener('click', () => step(parseFloat(b.dataset.step))));

$$('.nudge').forEach((b) =>
  b.addEventListener('click', () => {
    const which = b.dataset.target;
    const cur = which === 'in' ? S.inT : S.outT;
    const t = round1((cur ?? playerTime()) + parseFloat(b.dataset.step));
    setMark(which, t);
    if (S.playerReady) {
      S.player.pauseVideo();
      seek(t);
    }
  })
);

$$('.goto').forEach((b) =>
  b.addEventListener('click', () => {
    const t = b.dataset.target === 'in' ? S.inT : S.outT;
    if (t != null && S.playerReady) {
      S.player.pauseVideo();
      seek(t);
    }
  })
);

function bindTimeInput(el, which) {
  const commit = (jump) => {
    const t = parseTime(el.value);
    el.classList.toggle('invalid', Number.isNaN(t));
    if (Number.isNaN(t)) return;
    if (which === 'current') {
      if (t != null && S.playerReady) {
        S.player.pauseVideo();
        seek(t);
      }
      return;
    }
    setMark(which, t);
    if (jump && t != null && S.playerReady) {
      S.player.pauseVideo();
      seek(t);
    }
  };
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit(true);
      el.blur();
    } else if (e.key === 'Escape') {
      el.blur();
    }
  });
  el.addEventListener('blur', () => {
    commit(false);
    if (which !== 'current') updateMarks();
  });
}

bindTimeInput($('#inTime'), 'in');
bindTimeInput($('#outTime'), 'out');
bindTimeInput($('#currentTime'), 'current');

/* ---------- timeline ---------- */

const track = $('#track');

function timeAt(clientX) {
  const r = track.getBoundingClientRect();
  return round1(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * S.duration);
}

function buildRuler() {
  const ruler = $('#ruler');
  ruler.innerHTML = '';
  if (!S.duration) return;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const stepSec = steps.find((s) => S.duration / s <= 10) || 7200;
  for (let t = 0; t <= S.duration; t += stepSec) {
    const span = document.createElement('span');
    span.style.left = `${(t / S.duration) * 100}%`;
    span.textContent = fmt(t).replace(/\.0$/, '');
    ruler.appendChild(span);
  }
}

function startDrag(e, onMove) {
  e.preventDefault();
  const move = (ev) => onMove(timeAt(ev.clientX), false);
  const up = (ev) => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    onMove(timeAt(ev.clientX), true);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  onMove(timeAt(e.clientX), false);
}

track.addEventListener('mousedown', (e) => {
  if (!S.duration || e.button !== 0 || e.target.classList.contains('handle')) return;
  startDrag(e, (t, final) => seek(t, final));
});

['in', 'out'].forEach((which) => {
  const handle = which === 'in' ? $('#handleIn') : $('#handleOut');
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (S.playerReady) S.player.pauseVideo();
    handle.classList.add('dragging');
    startDrag(e, (t, final) => {
      setMark(which, t);
      seek(t, final);
      if (final) handle.classList.remove('dragging');
    });
  });
});

track.addEventListener('mousemove', (e) => {
  if (!S.duration) return;
  const r = track.getBoundingClientRect();
  const hover = $('#hoverTime');
  hover.style.left = `${e.clientX - r.left}px`;
  hover.textContent = fmt(timeAt(e.clientX));
});

/* ---------- keyboard ---------- */

function isTyping(el) {
  return el && (el.tagName === 'INPUT' && el.type === 'text' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}
function isFocused(el) {
  return document.activeElement === el;
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    download();
    return;
  }
  if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.repeat && e.key === ' ') {
    e.preventDefault();
    return;
  }
  const key = e.key.toLowerCase();
  if (key === 'i') setMark('in', playerTime());
  else if (key === 'o') setMark('out', playerTime());
  else if (key === 'p') preview();
  else if (key === ' ' || key === 'k') togglePlay();
  else if (key === 'arrowleft') step(e.shiftKey ? -1 : -0.1);
  else if (key === 'arrowright') step(e.shiftKey ? 1 : 0.1);
  else return;
  e.preventDefault();
});

document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && !isTyping(e.target)) e.preventDefault();
});

document.addEventListener('click', (e) => {
  const control = e.target.closest('button, input[type="radio"], input[type="checkbox"]');
  if (control) control.blur();
});

document.body.tabIndex = -1;
window.addEventListener('blur', () =>
  setTimeout(() => {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') document.body.focus();
  }, 0)
);

/* ---------- export options ---------- */

function applyMode() {
  const mode = S.mode;
  $$('input[name="mode"]').forEach((r) => (r.checked = r.value === mode));
  $('#qualityRow').classList.toggle('hidden', mode === 'a' || mode === 'gif');
  $('#accurateRow').classList.toggle('hidden', mode !== 'av' && mode !== 'v');
  updateDownloadState();
}

$$('input[name="mode"]').forEach((r) =>
  r.addEventListener('change', () => {
    S.mode = r.value;
    applyMode();
    S.api && S.api.set_option('mode', S.mode);
  })
);
$('#quality').addEventListener('change', (e) => {
  S.quality = e.target.value;
  S.api && S.api.set_option('quality', S.quality);
});
$('#accurate').addEventListener('change', (e) => {
  S.accurate = e.target.checked;
  S.api && S.api.set_option('accurate', S.accurate);
});

function downloadProblem() {
  if (!S.api) return 'Brak połączenia z backendem.';
  if (!S.videoId) return 'Załaduj film.';
  if (S.mode === 'png') return S.inT == null ? 'Ustaw IN – klatka zostanie zapisana w tym punkcie.' : '';
  if (S.inT == null || S.outT == null) return 'Ustaw IN oraz OUT.';
  if (S.outT <= S.inT) return 'OUT musi być później niż IN.';
  return '';
}

function updateDownloadState() {
  const problem = downloadProblem();
  $('#downloadBtn').disabled = !!problem;
  $('#downloadHint').textContent = problem || (S.mode === 'png'
    ? `Klatka w ${fmt(S.inT)}`
    : `Wycinek ${fmt(S.inT)} – ${fmt(S.outT)} (${fmt(S.outT - S.inT)})`);
}

async function download() {
  if (downloadProblem()) return;
  if (S.playerReady) S.player.pauseVideo();
  const params = {
    video_id: S.videoId,
    title: S.title,
    start: S.inT,
    end: S.mode === 'png' ? S.inT + 0.1 : S.outT,
    mode: S.mode,
    quality: S.quality,
    accurate: S.accurate,
  };
  const res = await S.api.start_job(params);
  if (!res.ok) {
    toast('Nie można rozpocząć', res.error, 'error');
    return;
  }
  addJob(res.id, params);
}

$('#downloadBtn').addEventListener('click', download);

/* ---------- jobs ---------- */

function addJob(id, params) {
  $('.jobs-empty')?.remove();
  const el = document.createElement('div');
  el.className = 'job running';
  el.innerHTML = `
    <div class="job-head"><span class="job-badge"></span><span class="job-name"></span></div>
    <div class="job-range"></div>
    <div class="job-bar"><div></div></div>
    <div class="job-foot"><span class="job-msg">Przygotowanie...</span><button class="job-action">Anuluj</button></div>`;
  el.querySelector('.job-badge').textContent = MODE_LABELS[params.mode];
  el.querySelector('.job-name').textContent = params.title || params.video_id;
  el.querySelector('.job-name').title = params.title || '';
  el.querySelector('.job-range').textContent = params.mode === 'png'
    ? fmt(params.start)
    : `${fmt(params.start)} – ${fmt(params.end)}`;
  el.querySelector('.job-action').addEventListener('click', () => onJobAction(id));
  $('#jobs').prepend(el);
  S.jobs[id] = { el, params, state: { status: 'running' } };
  updateJobCount();
}

function onJobAction(id) {
  const job = S.jobs[id];
  if (!job) return;
  if (job.state.status === 'running') S.api.cancel_job(id);
  else if (job.state.status === 'done') S.api.reveal(job.state.file);
  else {
    job.el.remove();
    delete S.jobs[id];
    updateJobCount();
  }
}

function updateJobCount() {
  const n = Object.keys(S.jobs).length;
  $('#jobCount').textContent = n ? n : '';
  if (!n && !$('.jobs-empty')) $('#jobs').innerHTML = '<div class="jobs-empty">Tu pojawią się Twoje wycinki.</div>';
}

window.clipson = {
  onJob(state) {
    const job = S.jobs[state.id];
    if (!job) return;
    const prev = job.state.status;
    job.state = state;
    const el = job.el;
    el.className = `job ${state.status}`;
    el.querySelector('.job-bar > div').style.width = `${state.status === 'error' ? 100 : state.progress}%`;
    const pct = state.status === 'running' && state.progress > 0 ? ` ${Math.round(state.progress)}%` : '';
    const msg = el.querySelector('.job-msg');
    msg.textContent = state.message + pct;
    msg.title = state.message;
    const action = el.querySelector('.job-action');
    action.textContent = { running: 'Anuluj', done: 'Pokaż plik' }[state.status] || 'Usuń';
    if (state.status === 'done' && state.file) {
      const name = state.file.split(/[\\/]/).pop();
      el.querySelector('.job-name').textContent = name;
      el.querySelector('.job-name').title = state.file;
      if (prev !== 'done') toast('Wycinek gotowy', name, 'success');
    } else if (state.status === 'error' && prev !== 'error') {
      toast('Błąd pobierania', state.message, 'error');
    }
  },
};

/* ---------- backend / config ---------- */

function showTools(tools) {
  const banner = $('#toolWarning');
  banner.className = 'banner hidden';
  if (!tools.ffmpeg) {
    banner.className = 'banner';
    banner.innerHTML = 'Nie znaleziono <b>ffmpeg</b> – pobieranie nie zadziała. <button class="ghost-btn" id="pickFfmpeg">Wskaż ffmpeg.exe</button>';
    $('#pickFfmpeg').addEventListener('click', async () => showTools(await S.api.choose_ffmpeg()));
  } else if (!tools.deno) {
    banner.className = 'banner warn';
    banner.textContent = 'Nie znaleziono Deno – yt-dlp może nie widzieć wszystkich jakości (np. tylko 360p). Zainstaluj: winget install DenoLand.Deno';
  }
  document.body.classList.toggle('has-banner', !banner.classList.contains('hidden'));
}

function setFolder(path) {
  $('#folderPath').textContent = path;
  $('#folderBtn').title = `Folder docelowy: ${path}\nKliknij, aby zmienić`;
}

async function initBackend() {
  S.api = window.pywebview.api;
  const { config, tools } = await S.api.get_state();
  S.mode = config.mode || 'av';
  S.quality = config.quality || '1080';
  S.accurate = config.accurate !== false;
  $('#quality').value = S.quality;
  $('#accurate').checked = S.accurate;
  setFolder(config.output_dir);
  showTools(tools);
  applyMode();
}

$('#folderBtn').addEventListener('click', async () => S.api && setFolder(await S.api.choose_folder()));
$('#openFolderBtn').addEventListener('click', () => S.api && S.api.open_folder());

if (window.pywebview && window.pywebview.api) initBackend();
else window.addEventListener('pywebviewready', initBackend);

applyMode();
$('#url').focus();

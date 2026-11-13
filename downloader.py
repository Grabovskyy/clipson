import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0

ACCURATE_VIDEO_ARGS = '-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p'
ACCURATE_AUDIO_ARGS = '-c:a aac -b:a 192k'

RE_PERCENT = re.compile(r'\[download\]\s+(\d+(?:\.\d+)?)%')
RE_FFTIME = re.compile(r'time=(\d+):(\d+):(\d+(?:\.\d+)?)')
RE_INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def find_tool(name, override=None):
    if override:
        if os.path.isfile(override):
            return override
        candidate = os.path.join(override, name + '.exe')
        if os.path.isfile(candidate):
            return candidate
    found = shutil.which(name)
    if found:
        return found
    winget = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet')
    for pattern in (os.path.join(winget, 'Links', name + '.exe'),
                    os.path.join(winget, 'Packages', '*', '**', name + '.exe')):
        hits = glob.glob(pattern, recursive=True)
        if hits:
            return hits[0]
    return None


def fmt_range_time(seconds):
    seconds = round(seconds, 1)
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    if h:
        return f'{int(h)}h{int(m):02d}m{s:04.1f}s'
    return f'{int(m):02d}m{s:04.1f}s'


def safe_filename(name, limit=80):
    name = RE_INVALID_CHARS.sub('_', name or '').strip().rstrip('.')
    return name[:limit].strip() or 'clip'


def unique_path(path):
    if not os.path.exists(path):
        return path
    root, ext = os.path.splitext(path)
    i = 2
    while os.path.exists(f'{root} ({i}){ext}'):
        i += 1
    return f'{root} ({i}){ext}'


class JobCancelled(Exception):
    pass


class JobError(Exception):
    pass


class Job:
    def __init__(self, manager, params):
        self.id = uuid.uuid4().hex[:10]
        self.manager = manager
        self.p = params
        self.proc = None
        self.cancelled = False
        self.tmp = tempfile.mkdtemp(prefix='clipson-')
        self.clip_len = max(0.1, params['end'] - params['start'])
        self.last_push = 0.0
        self.state = {
            'id': self.id,
            'status': 'running',
            'progress': 0.0,
            'message': 'Przygotowanie...',
            'file': None,
        }

    # -- reporting ---------------------------------------------------------

    def push(self, force=False, **changes):
        self.state.update(changes)
        now = time.monotonic()
        if force or now - self.last_push > 0.15:
            self.last_push = now
            self.manager.notify(dict(self.state))

    # -- process handling --------------------------------------------------

    def run_process(self, cmd, span=(0.0, 100.0), duration=None):
        """Run a command, mapping its progress output onto the given percentage span."""
        if self.cancelled:
            raise JobCancelled()
        lo, hi = span
        duration = duration or self.clip_len
        env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
        self.proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW, env=env,
        )
        errors, output, buf = [], [], b''
        while True:
            chunk = self.proc.stdout.read1(4096)
            if not chunk:
                break
            buf += chunk
            parts = re.split(rb'[\r\n]', buf)
            buf = parts.pop()
            for raw in parts:
                line = raw.decode('utf-8', 'replace').strip()
                if line:
                    output.append(line)
                    self.parse_line(line, lo, hi, duration, errors)
        self.proc.wait()
        code = self.proc.returncode
        self.proc = None
        if self.cancelled:
            raise JobCancelled()
        if code != 0:
            raise JobError(errors[-1] if errors else (output[-1] if output else f'Kod wyjścia {code}'))
        return output

    def parse_line(self, line, lo, hi, duration, errors):
        if line.startswith('ERROR:'):
            errors.append(line[6:].strip())
            return
        m = RE_FFTIME.search(line)
        if m:
            t = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
            frac = min(1.0, t / duration)
            self.push(progress=lo + (hi - lo) * frac, message='Wycinanie i kodowanie...')
            return
        m = RE_PERCENT.search(line)
        if m:
            frac = float(m[1]) / 100
            self.push(progress=max(self.state['progress'], lo + (hi - lo) * frac))
            return
        if line.startswith('[youtube]') or line.startswith('[info]'):
            self.push(message='Pobieranie informacji o filmie...')
        elif line.startswith('[ExtractAudio]'):
            self.push(force=True, message='Konwersja do WAV...')
        elif line.startswith('[Merger]') or line.startswith('[VideoRemuxer]') or line.startswith('[Fixup'):
            self.push(force=True, message='Składanie pliku...')

    def cancel(self):
        self.cancelled = True
        proc = self.proc
        if proc and proc.poll() is None:
            subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'],
                           creationflags=CREATE_NO_WINDOW, capture_output=True)

    # -- command building --------------------------------------------------

    def ytdlp_base(self):
        runner = [sys.executable, '--yt-dlp'] if getattr(sys, 'frozen', False) else [sys.executable, '-m', 'yt_dlp']
        cmd = runner + ['--newline', '--no-playlist', '--no-mtime', '--ffmpeg-location', self.manager.ffmpeg]
        if self.manager.deno:
            cmd += ['--js-runtimes', f'deno:{self.manager.deno}']
        return cmd

    def sort_args(self, prefer_h264=False):
        keys = []
        if self.p['quality'] != 'best':
            keys.append(f'res:{self.p["quality"]}')
        if prefer_h264:
            keys += ['vcodec:h264', 'acodec:aac']
        return ['-S', ','.join(keys)] if keys else []

    def section(self):
        return f'*{self.p["start"]:.1f}-{self.p["end"]:.1f}'

    def output_template(self, suffix=''):
        rng = f'{fmt_range_time(self.p["start"])}-{fmt_range_time(self.p["end"])}'
        return f'%(title).80B [%(id)s] {rng}{suffix}.%(ext)s'

    def run_ytdlp_clip(self, fmt_args, out_dir, template, span=(0.0, 100.0)):
        printfile = os.path.join(self.tmp, 'filepath.txt')
        cmd = self.ytdlp_base() + fmt_args + [
            '--download-sections', self.section(),
            '-P', out_dir, '-P', f'temp:{self.tmp}', '-o', template,
            '--force-overwrites',
            '--print-to-file', 'after_move:filepath', printfile,
            self.p['url'],
        ]
        self.run_process(cmd, span)
        try:
            with open(printfile, encoding='utf-8') as f:
                lines = [l.strip() for l in f if l.strip()]
            return lines[-1] if lines else None
        except OSError:
            return None

    # -- modes -------------------------------------------------------------

    def do_video(self, with_audio):
        accurate = self.p['accurate']
        if with_audio:
            args = ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4']
            suffix = ''
        else:
            args = ['-f', 'bv*', '--remux-video', 'mp4']
            suffix = ' [video]'
        args += self.sort_args(prefer_h264=not accurate)
        if accurate:
            enc = ACCURATE_VIDEO_ARGS + (' ' + ACCURATE_AUDIO_ARGS if with_audio else ' -an')
            args += ['--force-keyframes-at-cuts', '--downloader-args', f'ffmpeg_o:{enc}']
        return self.run_ytdlp_clip(args, self.p['out_dir'], self.output_template(suffix))

    def do_audio(self):
        args = ['-f', 'ba/b', '-x', '--audio-format', 'wav']
        return self.run_ytdlp_clip(args, self.p['out_dir'], self.output_template())

    def do_gif(self):
        args = ['-f', 'bv*', '-S', 'res:480', '--force-keyframes-at-cuts',
                '--downloader-args', f'ffmpeg_o:{ACCURATE_VIDEO_ARGS} -an']
        clip = self.run_ytdlp_clip(args, self.tmp, 'source.%(ext)s', span=(0, 60))
        if not clip or not os.path.isfile(clip):
            raise JobError('Nie udało się pobrać fragmentu do GIF-a.')
        self.push(force=True, progress=60, message='Tworzenie GIF-a...')
        out = unique_path(os.path.join(self.p['out_dir'], self.named_output('gif')))
        vf = ('fps=15,scale=480:-2:flags=lanczos,split[a][b];'
              '[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4')
        self.run_process([self.manager.ffmpeg, '-hide_banner', '-y', '-i', clip,
                          '-vf', vf, '-loop', '0', out], span=(60, 100))
        return out

    def do_frame(self):
        self.push(force=True, progress=10, message='Pobieranie adresu strumienia...')
        cmd = self.ytdlp_base() + ['-g', '-f', 'bv*/b'] + self.sort_args() + [self.p['url']]
        lines = self.run_process(cmd, span=(10, 40))
        stream = next((l for l in reversed(lines) if l.startswith('http')), None)
        if not stream:
            raise JobError('Nie udało się pobrać adresu strumienia wideo.')
        self.push(force=True, progress=50, message='Wyciąganie klatki...')
        out = unique_path(os.path.join(self.p['out_dir'], self.named_output('png', frame=True)))
        self.run_process([self.manager.ffmpeg, '-hide_banner', '-y', '-ss', f'{self.p["start"]:.3f}',
                          '-i', stream, '-frames:v', '1', out], span=(50, 100), duration=1)
        return out

    def named_output(self, ext, frame=False):
        base = f'{safe_filename(self.p.get("title"))} [{self.p["video_id"]}]'
        if frame:
            return f'{base} {fmt_range_time(self.p["start"])}.{ext}'
        return f'{base} {fmt_range_time(self.p["start"])}-{fmt_range_time(self.p["end"])}.{ext}'

    # -- main --------------------------------------------------------------

    def run(self):
        mode = self.p['mode']
        try:
            if mode == 'av':
                path = self.do_video(with_audio=True)
            elif mode == 'v':
                path = self.do_video(with_audio=False)
            elif mode == 'a':
                path = self.do_audio()
            elif mode == 'gif':
                path = self.do_gif()
            elif mode == 'png':
                path = self.do_frame()
            else:
                raise JobError(f'Nieznany tryb: {mode}')
            if not path or not os.path.isfile(path):
                raise JobError('Pobieranie zakończone, ale nie znaleziono pliku wynikowego.')
            self.push(force=True, status='done', progress=100, message='Gotowe', file=path)
        except JobCancelled:
            self.push(force=True, status='cancelled', message='Anulowano')
        except JobError as e:
            self.push(force=True, status='error', message=str(e))
        except Exception as e:
            self.push(force=True, status='error', message=f'{type(e).__name__}: {e}')
        finally:
            shutil.rmtree(self.tmp, ignore_errors=True)
            self.manager.finished(self)


class JobManager:
    def __init__(self, notify):
        self.notify = notify
        self.jobs = {}
        self.ffmpeg = None
        self.deno = None
        self.lock = threading.Lock()

    def configure(self, ffmpeg_override=None):
        self.ffmpeg = find_tool('ffmpeg', ffmpeg_override)
        self.deno = find_tool('deno')
        return {'ffmpeg': self.ffmpeg, 'deno': self.deno}

    def start(self, params):
        if not self.ffmpeg:
            raise JobError('Nie znaleziono ffmpeg. Wskaż plik ffmpeg.exe w ustawieniach.')
        job = Job(self, params)
        with self.lock:
            self.jobs[job.id] = job
        threading.Thread(target=job.run, daemon=True).start()
        return job.id

    def cancel(self, job_id):
        job = self.jobs.get(job_id)
        if job:
            threading.Thread(target=job.cancel, daemon=True).start()

    def cancel_all(self):
        for job in list(self.jobs.values()):
            job.cancel()

    def finished(self, job):
        with self.lock:
            self.jobs.pop(job.id, None)

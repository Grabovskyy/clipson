import json
import os
import subprocess
import sys

import webview

from downloader import JobError, JobManager

if getattr(sys, 'frozen', False):
    BASE = os.path.dirname(sys.executable)
else:
    BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, 'config.json')
DEFAULTS = {
    'output_dir': os.path.join(BASE, 'clips'),
    'ffmpeg_location': '',
    'mode': 'av',
    'quality': '1080',
    'accurate': True,
}
OPTION_KEYS = {'mode', 'quality', 'accurate'}

FOLDER_DIALOG = getattr(getattr(webview, 'FileDialog', None), 'FOLDER', None) or webview.FOLDER_DIALOG
OPEN_DIALOG = getattr(getattr(webview, 'FileDialog', None), 'OPEN', None) or webview.OPEN_DIALOG


def load_config():
    config = dict(DEFAULTS)
    try:
        with open(CONFIG_PATH, encoding='utf-8') as f:
            config.update(json.load(f))
    except (OSError, ValueError):
        pass
    return config


class Api:
    def __init__(self):
        self._window = None
        self._config = load_config()
        self._jobs = JobManager(self._push)
        self._tools = self._jobs.configure(self._config['ffmpeg_location'])

    def _save(self):
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(self._config, f, indent=2, ensure_ascii=False)

    def _push(self, data):
        if self._window:
            self._window.evaluate_js(f'window.clipson && window.clipson.onJob({json.dumps(data)})')

    def get_state(self):
        return {'config': self._config, 'tools': self._tools}

    def set_option(self, key, value):
        if key in OPTION_KEYS:
            self._config[key] = value
            self._save()

    def choose_folder(self):
        current = self._config['output_dir']
        result = self._window.create_file_dialog(
            FOLDER_DIALOG, directory=current if os.path.isdir(current) else BASE)
        if result:
            self._config['output_dir'] = result[0] if isinstance(result, (list, tuple)) else result
            self._save()
        return self._config['output_dir']

    def choose_ffmpeg(self):
        result = self._window.create_file_dialog(
            OPEN_DIALOG, file_types=('ffmpeg (ffmpeg.exe)', 'Wszystkie pliki (*.*)'))
        if result:
            self._config['ffmpeg_location'] = result[0] if isinstance(result, (list, tuple)) else result
            self._save()
            self._tools = self._jobs.configure(self._config['ffmpeg_location'])
        return self._tools

    def open_folder(self):
        path = self._config['output_dir']
        os.makedirs(path, exist_ok=True)
        os.startfile(path)

    def reveal(self, path):
        if path and os.path.isfile(path):
            subprocess.Popen(['explorer', '/select,', os.path.normpath(path)])
        else:
            self.open_folder()

    def start_job(self, params):
        try:
            start = round(float(params['start']), 1)
            end = round(float(params.get('end') or start + 0.1), 1)
            mode = params['mode']
            if mode != 'png' and end <= start:
                return {'ok': False, 'error': 'Koniec (OUT) musi być później niż początek (IN).'}
            out_dir = self._config['output_dir']
            os.makedirs(out_dir, exist_ok=True)
            job_id = self._jobs.start({
                'url': f'https://www.youtube.com/watch?v={params["video_id"]}',
                'video_id': params['video_id'],
                'title': params.get('title') or '',
                'start': start,
                'end': max(end, start + 0.1),
                'mode': mode,
                'quality': str(params.get('quality') or 'best'),
                'accurate': bool(params.get('accurate', True)),
                'out_dir': out_dir,
            })
            return {'ok': True, 'id': job_id}
        except JobError as e:
            return {'ok': False, 'error': str(e)}
        except (KeyError, ValueError, OSError) as e:
            return {'ok': False, 'error': f'Nieprawidłowe dane: {e}'}

    def cancel_job(self, job_id):
        self._jobs.cancel(job_id)


def main():
    os.chdir(BASE)
    api = Api()
    window = webview.create_window(
        'Clipson', 'web/index.html', js_api=api,
        width=1360, height=880, min_size=(1000, 680), background_color='#0b0d12',
    )
    api._window = window
    window.events.closing += lambda: api._jobs.cancel_all()
    webview.start(
        http_server=True, private_mode=False,
        storage_path=os.path.join(BASE, '.webview'),
        debug='--debug' in sys.argv,
    )


def run_ytdlp(args):
    import yt_dlp
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w')
    if sys.stderr is None:
        sys.stderr = sys.stdout
    sys.exit(yt_dlp.main(args))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--yt-dlp':
        run_ytdlp(sys.argv[2:])
    main()

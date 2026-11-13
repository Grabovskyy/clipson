# ✂️ Clipson

**Fast YouTube clip cutter for video editors.**
Paste a link, mark IN and OUT with 0.1 s precision, click "Download clip" – the finished file lands in the folder you choose.

A local Windows app: no ads, no sign-up, no limits. Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/).

[Wersja polska](README.md)

> The user interface is currently in Polish only.

## Features

- **Auto-load** – the video loads as soon as you paste a link (also `Ctrl+V` anywhere in the window). Supports `watch`, `youtu.be`, `shorts`, `live` and `&t=` timestamps.
- **Timeline** with draggable IN/OUT handles, scrubbing and hover time.
- **0.1 s precision** – set IN/OUT buttons, editable time fields, ±0.1 s nudges.
- **Preview** of the selected range.
- **Export formats:** MP4 (H.264 + AAC), video-only MP4, WAV, GIF (480p, 15 fps), PNG frame at IN.
- **Accurate cut** (on by default) – re-encodes to H.264, compatible with Premiere Pro, DaVinci Resolve, etc. Turn it off for a fast lossless cut that snaps to the nearest keyframe.
- **Quality** from 480p up to 4K.
- **Custom output folder**, remembered between sessions.
- **Download queue** with progress, cancel and "Show file".
- **Dark mode.**

## Installation

### Option A – prebuilt `.exe`

1. Download `Clipson-windows.zip` from [**Releases**](../../releases).
2. Unzip and run `Clipson.exe`.
3. Install FFmpeg and Deno once (PowerShell):
   ```powershell
   winget install -e --id Gyan.FFmpeg
   winget install -e --id DenoLand.Deno
   ```

### Option B – from source (recommended)

1. **Code → Download ZIP** (or `git clone`).
2. Run **`install.bat`** – installs Python (if missing), libraries, FFmpeg and Deno.
3. Start the app with **`Clipson.bat`**.

If YouTube downloads break, run **`update.bat`** to update yt-dlp.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` / `K` | Play / pause |
| `I` / `O` | Set IN / OUT at current time |
| `←` / `→` | −0.1 s / +0.1 s (`Shift`: ±1 s) |
| `P` | Preview IN → OUT |
| `Ctrl` + `Enter` | Download clip |

## Troubleshooting

- **Only 360p available** – install Deno (`winget install -e --id DenoLand.Deno`).
- **"ffmpeg not found"** – install FFmpeg or point to `ffmpeg.exe` from the app banner.
- **Player error 150/101** – embedding is disabled by the uploader; type IN/OUT manually, downloading still works.
- **Window doesn't open** – run `.venv\Scripts\python app.py --debug` to see the error. Requires Microsoft Edge WebView2 (built into Windows 10/11).

## Disclaimer

Clipson is intended for personal use. Only download content you have the rights to or that falls under fair use, and follow the [YouTube Terms of Service](https://www.youtube.com/t/terms).

## License

[MIT](LICENSE)

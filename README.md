# ✂️ Clipson

**Szybkie wycinanie fragmentów z YouTube dla montażystów wideo.**
Wklejasz link, zaznaczasz IN i OUT z dokładnością do 0,1 s, klikasz „Pobierz wycinek” – gotowy plik ląduje w wybranym folderze.

Lokalna aplikacja na Windows: bez reklam, bez rejestracji, bez limitów. Pod spodem działają [yt-dlp](https://github.com/yt-dlp/yt-dlp) i [FFmpeg](https://ffmpeg.org/).

[English version](README.en.md)

<!-- Dodaj zrzut ekranu do docs/screenshot.png i odkomentuj:
![Clipson](docs/screenshot.png)
-->

## Funkcje

- **Automatyczne ładowanie** – link ładuje się sam po wklejeniu (także `Ctrl+V` w dowolnym miejscu okna). Obsługuje `watch`, `youtu.be`, `shorts`, `live` oraz parametr czasu `&t=`.
- **Oś czasu** z uchwytami IN/OUT, przewijaniem i podglądem czasu pod kursorem.
- **Precyzja 0,1 s** – przyciski „Ustaw IN / OUT”, ręczna edycja czasu, korekta ±0,1 s.
- **Podgląd** zaznaczonego fragmentu (od IN do OUT).
- **Formaty eksportu:**

  | Format | Wynik |
  |---|---|
  | Wideo + Dźwięk | MP4 (H.264 + AAC) |
  | Samo wideo | MP4 bez dźwięku |
  | Sam dźwięk | WAV |
  | GIF | 480p, 15 fps |
  | Klatka | PNG w punkcie IN |

- **Dokładne cięcie** (domyślnie włączone) – przekodowanie do H.264, które działa w Premiere Pro, DaVinci Resolve i innych programach. Po wyłączeniu pobieranie jest szybkie i bez strat, ale cięcie wypada na najbliższej klatce kluczowej.
- **Wybór jakości** – od 480p do 4K.
- **Własny folder docelowy** – wybierany w oknie Windows i zapamiętywany.
- **Kolejka pobrań** z paskiem postępu, anulowaniem i przyciskiem „Pokaż plik”.
- **Ciemny motyw.**

## Instalacja

### Opcja A – gotowy plik `.exe` (najprościej)

1. Pobierz `Clipson-windows.zip` z zakładki [**Releases**](../../releases).
2. Rozpakuj i uruchom `Clipson.exe`.
3. Zainstaluj FFmpeg i Deno (jednorazowo) – w PowerShell:
   ```powershell
   winget install -e --id Gyan.FFmpeg
   winget install -e --id DenoLand.Deno
   ```

> W wersji `.exe` yt-dlp jest wbudowany. Gdy YouTube coś zmieni i pobieranie przestanie działać, pobierz nowszą wersję z Releases albo użyj opcji B.

### Opcja B – z kodu źródłowego (zalecane, łatwe aktualizacje)

1. Pobierz repozytorium: zielony przycisk **Code → Download ZIP** (albo `git clone`).
2. Uruchom **`install.bat`** – sam zainstaluje Pythona (jeśli go nie masz), biblioteki, FFmpeg i Deno.
3. Uruchom aplikację plikiem **`Clipson.bat`**.

Gdy YouTube przestanie działać, uruchom **`update.bat`** (aktualizuje yt-dlp).

### Opcja C – ręcznie

Wymagania: Windows 10/11, Python 3.10+, FFmpeg i Deno w PATH.

```powershell
git clone https://github.com/Grabovskyy/clipson.git
cd clipson
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```

## Jak używać

1. Wklej link do YouTube w górne pole – film załaduje się automatycznie.
2. Ustaw początek (**I**) i koniec (**O**) – przyciskami, na osi czasu albo wpisując czas.
3. Wybierz format i jakość po prawej stronie.
4. Kliknij **Pobierz wycinek** (lub `Ctrl+Enter`).
5. Plik pojawi się w wybranym folderze (domyślnie `clips/` obok aplikacji).

### Skróty klawiszowe

| Klawisz | Akcja |
|---|---|
| `Spacja` / `K` | Play / pauza |
| `I` | Ustaw IN na aktualnym czasie |
| `O` | Ustaw OUT na aktualnym czasie |
| `←` / `→` | −0,1 s / +0,1 s |
| `Shift` + `←` / `→` | −1 s / +1 s |
| `P` | Podgląd od IN do OUT |
| `Ctrl` + `Enter` | Pobierz wycinek |
| `Ctrl` + `V` | Wklej link i załaduj film |

## Rozwiązywanie problemów

**Pobiera się tylko 360p / brakuje jakości** – zainstaluj Deno: `winget install -e --id DenoLand.Deno`. yt-dlp potrzebuje go do pełnej obsługi YouTube.

**„Nie znaleziono ffmpeg”** – zainstaluj `winget install -e --id Gyan.FFmpeg` albo kliknij „Wskaż ffmpeg.exe” w aplikacji.

**Odtwarzacz pokazuje błąd 150/101** – właściciel filmu zablokował odtwarzanie poza YouTube. Wpisz czasy IN/OUT ręcznie – pobieranie nadal działa.

**Pobieranie nagle przestało działać** – YouTube często zmienia swoje zabezpieczenia. Uruchom `update.bat` (lub pobierz nowszy release).

**Okno się nie otwiera** – uruchom z konsoli, żeby zobaczyć błąd:
```powershell
.venv\Scripts\python app.py --debug
```
Aplikacja wymaga Microsoft Edge WebView2 (wbudowany w Windows 10/11).

## Struktura projektu

```
app.py            okno aplikacji (pywebview) i API dla interfejsu
downloader.py     uruchamianie yt-dlp / ffmpeg, postęp, anulowanie
web/              interfejs: index.html, style.css, app.js
install.bat       instalacja zależności
Clipson.bat       uruchamianie
update.bat        aktualizacja yt-dlp
```

Ustawienia (folder docelowy, format, jakość) zapisują się w `config.json` obok aplikacji.

### Budowanie `.exe`

Wersja `.exe` buduje się automatycznie na GitHub Actions po wypchnięciu tagu:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Lokalnie:

```powershell
.venv\Scripts\pip install pyinstaller
.venv\Scripts\pyinstaller --noconfirm --windowed --name Clipson --add-data "web;web" --collect-all yt_dlp --collect-all yt_dlp_ejs --hidden-import clr app.py
```

## Zastrzeżenia

Clipson jest narzędziem do użytku osobistego. Pobieraj wyłącznie materiały, do których masz prawa, lub w ramach dozwolonego użytku, i przestrzegaj [Warunków korzystania z YouTube](https://www.youtube.com/t/terms). Autorzy nie odpowiadają za sposób użycia aplikacji.

## Licencja

[MIT](LICENSE)

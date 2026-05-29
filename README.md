# 🎬 VidDrop — Video Downloader

A modern, self-hosted video downloader web application powered by **yt-dlp** and **Node.js/Express**.  
Clean dark-mode UI with skeleton loaders, format badges, and one-click downloads — no files stored on server.

---

## ✨ Features

- **10,000+ supported sites** — YouTube, Twitter/X, TikTok, Reddit, Vimeo, Twitch, and more via yt-dlp
- **Format picker** — video (1080p, 720p, 480p…) and audio-only (MP3, M4A, Opus)
- **Stream-to-client** — downloads go directly to your device via HTTP streaming; nothing stored
- **Premium UI** — dark minimalist design, skeleton loaders, animated results, fully responsive
- **Auto-paste detection** — paste a URL and analysis begins automatically

---

## 🚀 Quick Start

### Prerequisites

1. **Node.js 18+** — [nodejs.org](https://nodejs.org)
2. **yt-dlp** — install globally:

```bash
# macOS / Linux
pip install yt-dlp
# or via Homebrew
brew install yt-dlp

# Windows
winget install yt-dlp
# or download yt-dlp.exe from https://github.com/yt-dlp/yt-dlp/releases
```

3. **ffmpeg** (recommended for best quality merging):

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
```

### Installation

```bash
# Clone or unzip the project
cd viddrop

# Install Node.js dependencies
npm install

# Start the server
npm start
```

Open **http://localhost:3000** in your browser.

For development with auto-restart on file changes (Node 18+):

```bash
npm run dev
```

---

## 📁 Project Structure

```
viddrop/
├── server.js            ← Express app entry point
├── package.json
├── routes/
│   ├── analyze.js       ← POST /api/analyze  (metadata fetch)
│   └── download.js      ← GET  /api/download (stream to client)
└── public/
    └── index.html       ← Complete frontend (HTML + CSS + JS)
```

---

## 🔌 API Reference

### `POST /api/analyze`

Fetch metadata and available formats for a video URL.

**Request body:**
```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

**Response:**
```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "uploader": "Rick Astley",
  "duration": "3:33",
  "durationSec": 213,
  "thumbnail": "https://...",
  "viewCount": "1,500,000,000",
  "uploadDate": "20091025",
  "extractor": "youtube",
  "formats": [
    {
      "id": "137+140",
      "type": "video",
      "label": "1080p",
      "ext": "MP4",
      "size": "45.2 MB",
      "fps": 30
    },
    {
      "id": "140",
      "type": "audio",
      "label": "128kbps",
      "ext": "M4A",
      "size": "3.4 MB"
    }
  ]
}
```

### `GET /api/download`

Stream a format directly to the client as a file attachment.

**Query parameters:**
| Param | Description |
|-------|-------------|
| `url` | The original video URL |
| `formatId` | yt-dlp format ID from `/api/analyze` |
| `title` | Used as the download filename |
| `ext` | File extension (mp4, m4a, webm…) |

**Response:** Binary stream with `Content-Disposition: attachment` header.

---

## ⚙️ Configuration

Set environment variables before starting:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server listen port |

---

## 🌍 Deployment

### On a VPS (nginx reverse proxy)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_buffering off;        # Important for streaming downloads!
        proxy_read_timeout 300s;
    }
}
```

### On Railway / Render / Fly.io

Just push the repo — they detect Node.js automatically. Make sure yt-dlp is installed as a build step or included in a Dockerfile.

**Sample Dockerfile:**
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg \
    && pip3 install yt-dlp --break-system-packages
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## ⚠️ Legal Notice

- Only download content you have the right to download.
- Respect the Terms of Service of the platforms you use.
- No content is stored or cached on the server.
- This tool is intended for personal, legitimate use only.
const { Router } = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = Router();

const YTDLP_PATH =
  process.env.YTDLP_PATH ||
  (process.platform === 'win32'
    ? 'yt-dlp'
    : path.join(__dirname, '..', 'bin', 'yt-dlp'));

function formatBytes(bytes) {
  if (!bytes || Number(bytes) <= 0) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!seconds || Number(seconds) <= 0) return 'N/A';

  const total = Number(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickThumbnail(info) {
  if (info.thumbnail) return info.thumbnail;

  if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
    const sorted = info.thumbnails
      .filter(t => t && t.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0));

    if (sorted.length > 0) return sorted[0].url;
  }

  return '';
}

function getFormatSize(formatA, formatB) {
  const a = Number(formatA?.filesize || formatA?.filesize_approx || 0);
  const b = Number(formatB?.filesize || formatB?.filesize_approx || 0);
  const total = a + b;

  return total > 0 ? formatBytes(total) : 'Unknown';
}

function buildFormats(formats) {
  if (!Array.isArray(formats)) return [];

  const options = [];
  const seen = new Set();

  const audioFormats = formats
    .filter(f =>
      f &&
      f.format_id &&
      (!f.vcodec || f.vcodec === 'none') &&
      f.acodec &&
      f.acodec !== 'none' &&
      f.ext !== 'mhtml'
    )
    .sort((a, b) => {
      const abrA = Number(a.abr || a.tbr || 0);
      const abrB = Number(b.abr || b.tbr || 0);
      return abrB - abrA;
    });

  const bestAudio =
    audioFormats.find(f => f.ext === 'm4a') ||
    audioFormats[0] ||
    null;

  const videoOnlyFormats = formats
    .filter(f =>
      f &&
      f.format_id &&
      f.vcodec &&
      f.vcodec !== 'none' &&
      (!f.acodec || f.acodec === 'none') &&
      f.height &&
      f.ext !== 'mhtml'
    )
    .sort((a, b) => {
      const heightDiff = Number(b.height || 0) - Number(a.height || 0);
      if (heightDiff !== 0) return heightDiff;

      const tbrA = Number(a.tbr || 0);
      const tbrB = Number(b.tbr || 0);
      return tbrB - tbrA;
    });

  for (const video of videoOnlyFormats) {
    if (!bestAudio) continue;

    const height = Number(video.height || 0);
    if (!height) continue;

    const label = `${height}p`;
    const key = `merged-${height}`;

    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      id: `${video.format_id}+${bestAudio.format_id}`,
      type: 'video',
      label,
      ext: 'MP4',
      size: getFormatSize(video, bestAudio),
      fps: video.fps || null,
      vcodec: video.vcodec || null,
      acodec: bestAudio.acodec || null,
      abr: bestAudio.abr || null,
      note: 'video + audio'
    });
  }

  const progressiveFormats = formats
    .filter(f =>
      f &&
      f.format_id &&
      f.vcodec &&
      f.vcodec !== 'none' &&
      f.acodec &&
      f.acodec !== 'none' &&
      f.height &&
      f.ext !== 'mhtml'
    )
    .sort((a, b) => {
      const heightDiff = Number(b.height || 0) - Number(a.height || 0);
      if (heightDiff !== 0) return heightDiff;

      const tbrA = Number(a.tbr || 0);
      const tbrB = Number(b.tbr || 0);
      return tbrB - tbrA;
    });

  for (const f of progressiveFormats) {
    const height = Number(f.height || 0);
    if (!height) continue;

    const label = `${height}p`;
    const key = `progressive-${height}`;

    if (seen.has(`merged-${height}`)) continue;
    if (seen.has(key)) continue;

    seen.add(key);

    options.push({
      id: f.format_id,
      type: 'video',
      label,
      ext: String(f.ext || 'mp4').toUpperCase(),
      size: formatBytes(f.filesize || f.filesize_approx),
      fps: f.fps || null,
      vcodec: f.vcodec || null,
      acodec: f.acodec || null,
      abr: f.abr || null,
      note: 'ready'
    });
  }

  let audioCount = 0;

  for (const f of audioFormats) {
    if (audioCount >= 4) break;

    const abr = f.abr ? `${Math.round(f.abr)}kbps` : 'Audio';
    const key = `audio-${f.ext}-${abr}`;

    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      id: f.format_id,
      type: 'audio',
      label: abr,
      ext: String(f.ext || 'm4a').toUpperCase(),
      size: formatBytes(f.filesize || f.filesize_approx),
      fps: null,
      vcodec: null,
      acodec: f.acodec || null,
      abr: f.abr || null,
      note: 'audio only'
    });

    audioCount++;
  }

  return options.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'video' ? -1 : 1;

    const heightA = parseInt(String(a.label).replace('p', ''), 10) || 0;
    const heightB = parseInt(String(b.label).replace('p', ''), 10) || 0;

    return heightB - heightA;
  });
}

router.post('/', (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A video URL is required.' });
  }

  const trimmed = url.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    return res.status(400).json({
      error: 'Please provide a valid URL starting with http:// or https://'
    });
  }

  let rawOutput = '';
  let rawError = '';

  console.log(`[analyze] using yt-dlp: ${YTDLP_PATH}`);

  const ytdlp = spawn(YTDLP_PATH, [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '25',
    trimmed
  ]);

  ytdlp.stdout.on('data', chunk => {
    rawOutput += chunk.toString();
  });

  ytdlp.stderr.on('data', chunk => {
    rawError += chunk.toString();
  });

  ytdlp.on('close', code => {
    if (code !== 0 || !rawOutput.trim()) {
      console.error('[yt-dlp analyze error]', rawError);

      return res.status(400).json({
        error: 'Could not fetch video info. The URL may be invalid, private, restricted, or unsupported.',
        detail: rawError.split('\n').slice(0, 3).join(' ')
      });
    }

    try {
      const firstLine = rawOutput.trim().split('\n')[0];
      const info = JSON.parse(firstLine);

      const payload = {
        id: info.id || '',
        title: info.title || 'Untitled Video',
        uploader: info.uploader || info.channel || 'Unknown',
        duration: formatDuration(info.duration),
        durationSec: info.duration || 0,
        thumbnail: pickThumbnail(info),
        viewCount: info.view_count ? Number(info.view_count).toLocaleString() : null,
        uploadDate: info.upload_date || null,
        extractor: info.extractor || 'unknown',
        formats: buildFormats(info.formats || []),
        originalUrl: trimmed
      };

      return res.json(payload);
    } catch (err) {
      console.error('[analyze parse error]', err);

      return res.status(500).json({
        error: 'Failed to parse video metadata.'
      });
    }
  });

  ytdlp.on('error', err => {
    console.error('[spawn error]', err);

    return res.status(500).json({
      error: `yt-dlp binary not found or cannot run. Path used: ${YTDLP_PATH}`
    });
  });
});

module.exports = router;
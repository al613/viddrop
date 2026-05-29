const { Router } = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = Router();

const YTDLP_PATH =
  process.env.YTDLP_PATH ||
  (process.platform === 'win32'
    ? 'yt-dlp'
    : path.join(__dirname, '..', 'bin', 'yt-dlp'));

function sanitiseFormatId(str) {
  return String(str || '').replace(/[^a-zA-Z0-9.\-_+:/\[\]=]/g, '');
}

function sanitiseExt(str) {
  return String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function safeFilename(name) {
  return String(name || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'video';
}

function getDirectUrl({ url, formatId }) {
  return new Promise((resolve, reject) => {
    let output = '';
    let error = '';

    console.log(`[download/direct] using yt-dlp: ${YTDLP_PATH}`);

    const ytdlp = spawn(YTDLP_PATH, [
      '--no-playlist',
      '--no-warnings',
      '-f',
      formatId,
      '-g',
      url
    ]);

    ytdlp.stdout.on('data', chunk => {
      output += chunk.toString();
    });

    ytdlp.stderr.on('data', chunk => {
      error += chunk.toString();
    });

    ytdlp.on('close', code => {
      if (code !== 0 || !output.trim()) {
        return reject(new Error(error || 'Could not get direct URL'));
      }

      const urls = output
        .trim()
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean);

      resolve(urls[0]);
    });

    ytdlp.on('error', reject);
  });
}

router.get('/', async (req, res) => {
  const { url, formatId, title, ext } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter.' });
  }

  const trimmedUrl = decodeURIComponent(String(url)).trim();

  if (!/^https?:\/\//i.test(trimmedUrl)) {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  const safeTitle = safeFilename(decodeURIComponent(String(title || 'video')));
  const safeFormatId = sanitiseFormatId(formatId || 'best');
  const fileExt = sanitiseExt(ext || 'mp4') || 'mp4';
  const filename = `${safeTitle}.${fileExt}`;

  console.log(`[download] format="${safeFormatId}" file="${filename}"`);
  console.log(`[download] using yt-dlp: ${YTDLP_PATH}`);

  /*
   * FAST MODE:
   * إذا formatId لا يحتوي + يعني غالبًا ملف واحد جاهز.
   * نخلي المتصفح يحمل مباشرة من المصدر.
   */
  if (!safeFormatId.includes('+')) {
    try {
      console.log('[download] Fast direct mode');

      const directUrl = await getDirectUrl({
        url: trimmedUrl,
        formatId: safeFormatId
      });

      return res.redirect(302, directUrl);
    } catch (err) {
      console.log('[download] Direct mode failed, falling back to stream mode');
      console.error(err.message);
    }
  }

  /*
   * STREAM / MERGE MODE:
   * للجودات المركبة مثل 1080p video + audio.
   */
  const mergeFormat = fileExt === 'webm' ? 'webm' : 'mp4';

  const args = [
    '--no-playlist',
    '--no-warnings',

    '-N', '12',
    '--http-chunk-size', '5M',
    '--socket-timeout', '30',

    '--merge-output-format', mergeFormat,

    '-f', safeFormatId || 'best',
    '-o', '-',
    trimmedUrl
  ];

  console.log('[download] Stream/Merge mode');
  console.log(`[yt-dlp] ${args.join(' ')}`);

  const ytdlp = spawn(YTDLP_PATH, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderrBuf = '';
  let finished = false;

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  ytdlp.stderr.on('data', chunk => {
    const text = chunk.toString();
    stderrBuf += text;

    if (text.trim()) {
      console.log('[yt-dlp]', text.trim());
    }
  });

  ytdlp.stdout.pipe(res);

  ytdlp.on('close', code => {
    finished = true;

    if (code !== 0) {
      console.error('[download error]', stderrBuf);
    }

    console.log(`[download] finished "${filename}" exit=${code}`);
  });

  ytdlp.on('error', err => {
    finished = true;
    console.error('[spawn error]', err.message);

    if (!res.headersSent) {
      res.status(500).json({
        error: `yt-dlp binary not found or cannot run. Path used: ${YTDLP_PATH}`
      });
    }
  });

  req.on('close', () => {
    if (!finished && !ytdlp.killed) {
      ytdlp.kill('SIGTERM');
      console.log('[download] client disconnected, yt-dlp killed.');
    }
  });
});

module.exports = router;
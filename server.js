const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 80;
const dataFile = path.join(__dirname, 'links.json');
const ADULT_PASSWORD = process.env.ADULT_PASSWORD || 'dadodo';
const adultTokens = new Set();
const dbFile = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbFile);
const iconCacheDir = path.join(__dirname, 'public', 'cache');
const MAX_ICON_BYTES = 5 * 1024 * 1024;

app.use(express.static('public'));
app.use(bodyParser.json());

if (!fs.existsSync(iconCacheDir)) {
  fs.mkdirSync(iconCacheDir, { recursive: true });
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
});

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header
    .split(';')
    .map(c => c.trim())
    .filter(Boolean)
    .map(c => c.split('='))
    .reduce((acc, [k, v]) => {
      acc[k] = decodeURIComponent(v || '');
      return acc;
    }, {});
}

function isAdultUnlocked(req) {
  const cookies = parseCookies(req);
  const token = cookies.adult_token;
  return token && adultTokens.has(token);
}

function readLinks() {
  if(!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]');
  const data = fs.readFileSync(dataFile);
  return JSON.parse(data);
}

function getExtensionFromContentType(contentType) {
  if (!contentType) return '';
  const type = contentType.split(';')[0].trim().toLowerCase();
  switch (type) {
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    case 'image/webp': return '.webp';
    default: return '';
  }
}

function getExtensionFromUrl(urlStr) {
  try {
    const { pathname } = new URL(urlStr);
    const ext = path.extname(pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  } catch (_) {
    return '';
  }
  return '';
}

function downloadImage(urlStr) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (err) {
      reject(new Error('invalid_url'));
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(parsed, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('bad_status'));
        return;
      }

      const contentType = res.headers['content-type'] || '';
      const ext = getExtensionFromContentType(contentType) || getExtensionFromUrl(urlStr);
      if (!ext) {
        res.resume();
        reject(new Error('unsupported_type'));
        return;
      }

      let size = 0;
      const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_ICON_BYTES) {
          res.destroy();
          reject(new Error('too_large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), ext }));
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

// Ler links
app.get('/api/links', (req, res) => {
  const all = readLinks();
  if (isAdultUnlocked(req)) {
    res.json(all);
    return;
  }
  const filtered = all.filter(item => (item.categoria || 'site') !== 'adult');
  res.json(filtered);
});

app.post('/api/icons/cache', async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url_required' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    res.status(400).json({ error: 'invalid_url' });
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.status(400).json({ error: 'invalid_protocol' });
    return;
  }

  const hash = crypto.createHash('sha256').update(url).digest('hex');
  const existing = fs.readdirSync(iconCacheDir).find(name => name.startsWith(hash + '.'));
  if (existing) {
    res.json({ path: `/cache/${existing}` });
    return;
  }

  try {
    const { buffer, ext } = await downloadImage(url);
    const filename = `${hash}${ext}`;
    const target = path.join(iconCacheDir, filename);
    fs.writeFileSync(target, buffer);
    res.json({ path: `/cache/${filename}` });
  } catch (err) {
    res.status(422).json({ error: err.message || 'download_failed' });
  }
});

app.get('/api/events', (req, res) => {
  const { date } = req.query;
  if (!date) {
    res.status(400).json({ error: 'date_required' });
    return;
  }
  db.all(
    'SELECT id, date, text, created_at FROM events WHERE date = ? ORDER BY id ASC',
    [date],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: 'db_error' });
        return;
      }
      res.json(rows);
    }
  );
});

app.get('/api/events/dates', (req, res) => {
  const { month } = req.query; // YYYY-MM
  if (!month) {
    res.status(400).json({ error: 'month_required' });
    return;
  }
  const like = `${month}-%`;
  db.all(
    'SELECT DISTINCT date FROM events WHERE date LIKE ?',
    [like],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: 'db_error' });
        return;
      }
      res.json(rows.map(r => r.date));
    }
  );
});

app.post('/api/events', (req, res) => {
  const { date, text } = req.body || {};
  if (!date || !text) {
    res.status(400).json({ error: 'date_text_required' });
    return;
  }
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO events (date, text, created_at) VALUES (?, ?, ?)',
    [date, text, now],
    function (err) {
      if (err) {
        res.status(500).json({ error: 'db_error' });
        return;
      }
      res.json({ id: this.lastID, date, text, created_at: now });
    }
  );
});

app.delete('/api/events/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM events WHERE id = ?', [id], function (err) {
    if (err) {
      res.status(500).json({ error: 'db_error' });
      return;
    }
    res.json({ success: true });
  });
});

app.get('/api/notes', (req, res) => {
  db.get('SELECT content, updated_at FROM notes WHERE id = 1', (err, row) => {
    if (err) {
      res.status(500).json({ error: 'db_error' });
      return;
    }
    if (!row) {
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO notes (id, content, updated_at) VALUES (1, ?, ?)',
        ['', now],
        insertErr => {
          if (insertErr) {
            res.status(500).json({ error: 'db_error' });
            return;
          }
          res.json({ content: '', updated_at: now });
        }
      );
      return;
    }
    res.json(row);
  });
});

app.post('/api/notes', (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content_required' });
    return;
  }
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO notes (id, content, updated_at) VALUES (1, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at',
    [content, now],
    err => {
      if (err) {
        res.status(500).json({ error: 'db_error' });
        return;
      }
      res.json({ success: true, updated_at: now });
    }
  );
});

// Salvar/atualizar links
app.post('/api/links', (req, res) => {
  const links = req.body;
  if (!isAdultUnlocked(req)) {
    const current = readLinks();
    const adult = current.filter(item => (item.categoria || 'site') === 'adult');
    const nonAdult = Array.isArray(links)
      ? links.filter(item => (item.categoria || 'site') !== 'adult')
      : [];
    const merged = [...nonAdult, ...adult];
    fs.writeFileSync(dataFile, JSON.stringify(merged, null, 2));
    res.json({ success: true });
    return;
  }
  fs.writeFileSync(dataFile, JSON.stringify(links, null, 2));
  res.json({ success: true });
});

app.post('/api/adult/unlock', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADULT_PASSWORD) {
    res.status(401).json({ success: false });
    return;
  }
  const token = crypto.randomBytes(16).toString('hex');
  adultTokens.add(token);
  res.setHeader('Set-Cookie', `adult_token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
  res.json({ success: true });
});

app.post('/api/adult/lock', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.adult_token;
  if (token) adultTokens.delete(token);
  res.setHeader('Set-Cookie', 'adult_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ success: true });
});

app.get('/api/adult/status', (req, res) => {
  res.json({ unlocked: !!isAdultUnlocked(req) });
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));

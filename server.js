const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 6767;
const PASSWORD = 'Pass@word1!';
const SESSION_SECRET = 'author-md-' + Date.now();

// Read OpenAI key
const keyPath = path.join(process.env.HOME, '.config/openai/key');
let OPENAI_KEY;
try {
  OPENAI_KEY = fs.readFileSync(keyPath, 'utf8').trim();
} catch (e) {
  console.error('Could not read OpenAI key from', keyPath);
  process.exit(1);
}

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Auth middleware
function requireAuth(req, res, next) {
  if (req.cookies?.auth === SESSION_SECRET) return next();
  if (req.path.endsWith('.html')) return res.redirect('/');
  res.status(401).json({ error: 'Unauthorized' });
}

// Login
app.post('/api/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    res.cookie('auth', SESSION_SECRET, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

// Mint ephemeral token for OpenAI Realtime API
app.post('/api/token', requireAuth, async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'sage',
        modalities: ['audio', 'text'],
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error('Token error:', err);
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Token fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Generate author.md from transcript
app.post('/api/generate', requireAuth, async (req, res) => {
  const { transcript, skillFile, userName, userCompany, userNotes } = req.body;

  const systemPrompt = `You are generating an author profile from a voice interview transcript. The skill file below defines the exact profile template, section structure, and quality standards to follow.

INSTRUCTIONS:
- Follow the skill file's profile template exactly - use its section headings, structure, and role descriptions.
- Map the transcript to profile sections as the skill file directs.
- Be specific: use actual quotes, real names, concrete details from the interview. Never be generic.
- If the skill file defines a quality checklist, note any sections that are thin or missing at the end.
- Write in markdown.

SKILL FILE (follow its generate/profile template instructions):

${skillFile || 'No skill file provided. Generate a comprehensive author profile covering: identity, career arc, communication style, expertise, writing patterns, and characteristic phrases.'}

ABOUT THE PERSON:
${userName ? `Name: ${userName}` : ''}
${userCompany ? `Company: ${userCompany}` : ''}
${userNotes ? `Context: ${userNotes}` : ''}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the interview transcript:\n\n${transcript}` },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error('Generate error:', err);
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const content = data.choices[0].message.content;
    res.json({ content });
  } catch (e) {
    console.error('Generate error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Static files - login page is public
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Protected app page
app.get('/app.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/app.html'));
});

app.listen(PORT, () => {
  console.log(`author.md demo running at http://localhost:${PORT}`);
});

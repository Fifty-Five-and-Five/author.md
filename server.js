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

  const systemPrompt = `You are an expert at creating author.md files - portable personal profiles that tell AI tools about a person.

You've just conducted a voice interview. Using the transcript below, generate a comprehensive author.md file.

The author.md should capture:
- Who this person is (name, role, background)
- Their career arc and key stories
- How they write and communicate (voice, tone, patterns, characteristic phrases)
- Their expertise and topics they own
- Writing dos and don'ts based on how they actually speak
- Reference content if mentioned

${skillFile ? `Use this skill file as a structural guide for what sections to include:\n\n${skillFile}\n\n` : ''}
${userName ? `Name: ${userName}` : ''}
${userCompany ? `Company: ${userCompany}` : ''}
${userNotes ? `Additional context: ${userNotes}` : ''}

Write the author.md in markdown. Be specific - use actual quotes, real examples, and concrete details from the interview. Don't be generic. The profile should feel like THIS person, not anyone.`;

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

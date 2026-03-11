const orb = new Orb(document.getElementById('orb'));

// DOM refs
const btnStart = document.getElementById('btn-start');
const btnEnd = document.getElementById('btn-end');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const skillFileInput = document.getElementById('skill-file');
const fileUploadEl = document.getElementById('file-upload');
const userNameInput = document.getElementById('user-name');
const userCompanyInput = document.getElementById('user-company');
const userNotesInput = document.getElementById('user-notes');
const resultOverlay = document.getElementById('result-overlay');
const resultContent = document.getElementById('result-content');
const btnDownload = document.getElementById('btn-download');
const btnCloseResult = document.getElementById('btn-close-result');

let session = null;
let skillFileContent = '';
let transcript = [];
let generatedContent = '';

// Skill file upload
skillFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  skillFileContent = await file.text();
  fileUploadEl.classList.add('has-file');
  fileUploadEl.querySelector('.label').innerHTML = `<strong>${file.name}</strong> loaded`;
  checkReady();
});

// Name input
userNameInput.addEventListener('input', checkReady);

function checkReady() {
  const ready = skillFileContent && userNameInput.value.trim();
  btnStart.disabled = !ready;
  if (ready) {
    statusEl.textContent = 'Ready to start the interview';
  }
}

// Build system prompt
function buildSystemPrompt() {
  const name = userNameInput.value.trim();
  const company = userCompanyInput.value.trim();
  const notes = userNotesInput.value.trim();

  return `You are a warm, curious interviewer conducting a voice conversation to build an author.md profile for someone. Think of it like a great pub conversation, not a job interview.

Your goal is to understand who this person really is: their story, voice, communication patterns, expertise, and personality. You'll interview them naturally and the transcript will later be used to generate their author.md file.

INTERVIEW GUIDELINES:
- Ask one question at a time. Follow interesting threads.
- Be genuinely curious. React to what they say. Ask follow-ups.
- Push for specifics: real names, actual numbers, concrete stories, exact phrases they use.
- Cover these areas naturally (don't rush through them like a checklist):
  * Who they are and what they do
  * Their career arc and key turning points
  * Stories that define them professionally
  * How they write and communicate (formal/casual, long/short, patterns)
  * Topics they're expert in
  * Distinctive traits, phrases, habits
  * Content they've created or reference often
- Do NOT read out or dictate the profile. Just interview.
- Wrap up naturally when you have enough material (roughly 15-20 minutes of good conversation).
- When wrapping up, let them know you've got great material and the profile is ready to generate.

ABOUT THE PERSON:
Name: ${name}
${company ? `Company: ${company}` : ''}
${notes ? `Context: ${notes}` : ''}

${skillFileContent ? `SKILL FILE (use this to understand what sections the final profile should cover):\n${skillFileContent}` : ''}

Start by warmly greeting ${name.split(' ')[0]} and asking them to tell you a bit about themselves and what they do.`;
}

// Start interview
btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  statusEl.textContent = 'Connecting...';

  try {
    // Get ephemeral token
    const tokenRes = await fetch('/api/token', { method: 'POST' });
    if (!tokenRes.ok) throw new Error('Failed to get token');
    const tokenData = await tokenRes.json();

    // Clear transcript
    transcript = [];
    transcriptEl.innerHTML = '<div class="empty">Listening...</div>';

    // Create session
    session = new RealtimeSession({
      onTranscript: (speaker, text) => {
        transcript.push({ speaker, text });
        addTranscriptEntry(speaker, text);
      },
      onStateChange: (state) => {
        orb.setState(state);
        if (state === 'listening') {
          statusEl.textContent = 'Listening...';
        } else if (state === 'speaking') {
          statusEl.textContent = 'Speaking...';
        }
      },
      onAudioLevel: (level) => {
        orb.setAudioLevel(level);
      },
      onError: (err) => {
        console.error('Session error:', err);
        statusEl.textContent = `Error: ${err.message}`;
        orb.setState('idle');
      },
    });

    await session.connect(tokenData.client_secret.value, buildSystemPrompt());

    btnStart.style.display = 'none';
    btnEnd.style.display = 'inline-flex';
    statusEl.textContent = 'Connecting to interviewer...';

  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
    btnStart.disabled = false;
  }
});

// End interview and generate
btnEnd.addEventListener('click', async () => {
  if (!session) return;

  // Disconnect voice
  session.disconnect();
  session = null;
  orb.setState('idle');
  orb.setAudioLevel(0);

  btnEnd.disabled = true;
  statusEl.innerHTML = '<span class="spinner"></span> Generating your author.md...';

  try {
    const transcriptText = transcript
      .map(e => `${e.speaker === 'ai' ? 'Interviewer' : 'Interviewee'}: ${e.text}`)
      .join('\n\n');

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: transcriptText,
        skillFile: skillFileContent,
        userName: userNameInput.value.trim(),
        userCompany: userCompanyInput.value.trim(),
        userNotes: userNotesInput.value.trim(),
      }),
    });

    if (!res.ok) throw new Error('Generation failed');
    const data = await res.json();
    generatedContent = data.content;

    resultContent.textContent = generatedContent;
    resultOverlay.classList.add('visible');
    statusEl.textContent = 'Profile generated!';

  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
  }

  btnEnd.style.display = 'none';
  btnStart.style.display = 'inline-flex';
  btnStart.disabled = false;
  btnEnd.disabled = false;
});

// Download
btnDownload.addEventListener('click', () => {
  const blob = new Blob([generatedContent], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'author.md';
  a.click();
  URL.revokeObjectURL(url);
});

// Close result
btnCloseResult.addEventListener('click', () => {
  resultOverlay.classList.remove('visible');
});

// Add transcript entry
function addTranscriptEntry(speaker, text) {
  const empty = transcriptEl.querySelector('.empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = 'entry';
  entry.innerHTML = `
    <div class="speaker ${speaker}">${speaker === 'ai' ? 'Interviewer' : 'You'}</div>
    <div>${text}</div>
  `;
  transcriptEl.appendChild(entry);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

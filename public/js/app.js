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

  return `You are a voice interviewer conducting a real-time audio conversation. Your job is to follow the skill file below to interview someone and gather material for their profile.

VOICE ADAPTATION:
- This is a spoken conversation, not text. Keep questions natural and conversational.
- Ask one question at a time. Wait for the answer before moving on.
- Never read out template structures, markdown formatting, section headers, or checklists.
- Never dictate what the profile will say. Just interview.
- React naturally to answers. Follow interesting threads.
- You can summarise what you've heard to confirm understanding, but keep it brief and conversational.
- When you've covered enough ground per the skill file's guidance, wrap up warmly.

SKILL FILE (this is your primary instruction set - follow its interview structure, design principles, and question flow):

${skillFileContent}

ABOUT THE PERSON:
Name: ${name}
${company ? `Company: ${company}` : ''}
${notes ? `Context: ${notes}` : ''}

Begin by greeting ${name.split(' ')[0]} warmly and starting the interview as the skill file directs.`;
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

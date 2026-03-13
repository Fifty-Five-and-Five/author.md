const orb = new Orb(document.getElementById('orb'));

// DOM refs
const btnStart = document.getElementById('btn-start');
const btnEnd = document.getElementById('btn-end');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const skillFileInput = document.getElementById('skill-file');
const skillUploadEl = document.getElementById('skill-upload');
const researchFileInput = document.getElementById('research-file');
const researchUploadEl = document.getElementById('research-upload');
const resultOverlay = document.getElementById('result-overlay');
const resultContent = document.getElementById('result-content');
const btnDownload = document.getElementById('btn-download');
const btnCloseResult = document.getElementById('btn-close-result');

let session = null;
let skillFileContent = '';
let researchFileContent = '';
let transcript = [];
let transcriptText = '';

// Skill file upload
skillFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  skillFileContent = await file.text();
  skillUploadEl.classList.add('has-file');
  skillUploadEl.querySelector('.label').innerHTML = `<strong>${file.name}</strong> loaded`;
  checkReady();
});

// Research file upload (required)
researchFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  researchFileContent = await file.text();
  researchUploadEl.classList.add('has-file');
  researchUploadEl.querySelector('.label').innerHTML = `<strong>${file.name}</strong> loaded`;
  checkReady();
});

function checkReady() {
  const ready = skillFileContent && researchFileContent;
  btnStart.disabled = !ready;
  if (ready) {
    statusEl.textContent = 'Ready — skill and research loaded';
  } else if (skillFileContent) {
    statusEl.textContent = 'Now upload the research file';
  } else if (researchFileContent) {
    statusEl.textContent = 'Now upload the skill file';
  }
}

// Build system prompt
function buildSystemPrompt() {
  return `You are a voice interviewer conducting a real-time audio conversation. Your job is to follow the skill file below to interview someone and gather material for their author profile.

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

RESEARCH FILE (pre-gathered background on this person):

${researchFileContent}

HOW TO USE THE RESEARCH:
- The research gives you context — use it to greet the person by name, reference their role and company, and skip the basics.
- Do NOT treat the research as a checklist of gaps to fill. The interview is the primary source of material, not a supplement to the research.
- The research and interview combine to build a complete picture. The interview captures what research never can: stories, opinions, personality, how they think and speak.

HOW TO BEGIN:
- Greet the person by name.
- Give a brief, friendly summary of what you already know about them from the research — their role, company, and one or two highlights. Keep it to 2-3 sentences.
- Then ask: are they ready to get started?
- Once they confirm, begin the interview as the skill file directs.`;
}

// Start interview
btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  statusEl.textContent = 'Connecting...';

  try {
    const tokenRes = await fetch('/api/token', { method: 'POST' });
    if (!tokenRes.ok) throw new Error('Failed to get token');
    const tokenData = await tokenRes.json();

    transcript = [];
    transcriptEl.innerHTML = '<div class="empty">Listening...</div>';

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

// End interview and show transcript
btnEnd.addEventListener('click', () => {
  if (!session) return;

  session.disconnect();
  session = null;
  orb.setState('idle');
  orb.setAudioLevel(0);

  transcriptText = transcript
    .map(e => `${e.speaker === 'ai' ? 'Interviewer' : 'Interviewee'}: ${e.text}`)
    .join('\n\n');

  resultContent.textContent = transcriptText;
  resultOverlay.classList.add('visible');
  statusEl.textContent = 'Interview complete — download your transcript';

  btnEnd.style.display = 'none';
  btnStart.style.display = 'inline-flex';
  btnStart.disabled = false;
});

// Download transcript
btnDownload.addEventListener('click', () => {
  const blob = new Blob([transcriptText], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'interview-transcript.md';
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

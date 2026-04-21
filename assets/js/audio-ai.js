// --- Voice AI implementation starts ---
let voiceRecognition = null;
let isRecordingAudio = false;
let currentFinalText = "";

function initVoiceRecognition() {
    const pttBtn = document.getElementById('pttBtn');
    if(pttBtn) {
        pttBtn.addEventListener('click', (e) => { 
            e.preventDefault(); 
            toggleVoiceRecording(); 
        });
    }
}

function toggleVoiceRecording() {
    if (!gameActive) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { 
        addAiLog('error', "Speech recognition not supported in this browser."); 
        return; 
    }

    if (!isRecordingAudio) {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.lang = 'en-US';
        voiceRecognition.interimResults = true;
        voiceRecognition.continuous = true;

        voiceRecognition.onstart = () => {
            isRecordingAudio = true;
            currentFinalText = "";
            document.getElementById('pttBtn').classList.add('recording');
            addAiLog('info', 'Mic active. Speak now, then tap mic again to send.');
        };

        voiceRecognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            }
            if (finalTranscript) {
                currentFinalText += finalTranscript + " ";
            }
        };

        voiceRecognition.onerror = (event) => {
            document.getElementById('pttBtn').classList.remove('recording');
            isRecordingAudio = false;
            if (event.error !== 'no-speech') {
                addAiLog('error', 'Mic error: ' + event.error);
            }
        };

        voiceRecognition.onend = () => {
            document.getElementById('pttBtn').classList.remove('recording');
            isRecordingAudio = false;
        };

        try { voiceRecognition.start(); } catch(e) { }
    } else {
        if (voiceRecognition) voiceRecognition.stop();
        document.getElementById('pttBtn').classList.remove('recording');
        
        setTimeout(() => {
            isRecordingAudio = false;
            let text = currentFinalText.trim();
            if (text.length > 0) {
                addAiLog('success', 'User: "' + text + '"');
                sendVoiceToAI(text);
            } else {
                addAiLog('error', 'No speech detected.');
            }
            currentFinalText = "";
        }, 500); 
    }
}

async function sendVoiceToAI(text) {
    if (!_apiKey) {
        const mockReply = "I am processing your query in simulation mode. Keep your instruments steady.";
        addAiLog('success', '[OFFLINE AI]: ' + mockReply);
        speakEnglish(mockReply, true);
        return;
    }
    
    const loadId = 'load-vo-' + Date.now();
    addAiLog('loading', 'AI Mentor is analyzing...', loadId);

    const prompt = 'You are a professional cybermedicine mentor for an AR Neurosurgery HUD. The surgeon asks you: "' + text + '". You MUST ONLY answer questions related to surgery and medicine. If the user asks about unrelated topics, politely decline. Note: The current operation being performed is a Trepanation of the skull (head surgery). Provide an extremely concise, professional 1 sentence reply.';

    try {
        const req = await fetch(OPENROUTER_CHAT_COMPLETIONS, {
            method: 'POST',
            headers: openRouterHeaders(),
            body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [{ role: 'user', content: prompt }] })
        });
        
        let data = null;
        let rawText = await req.text();
        try { data = JSON.parse(rawText); } catch (e) {}

        const loadEl = document.getElementById(loadId);
        if (loadEl) loadEl.remove();

        if (!req.ok) {
            let detail = 'HTTP ' + req.status;
            if (data && data.error && data.error.message) detail += ' - ' + data.error.message;
            addAiLog('error', 'Voice AI API request failed: ' + detail);
            return;
        }

        if (data && data.choices && data.choices[0] && data.choices[0].message) {
            const aiText = data.choices[0].message.content;
            addAiLog('success', 'AI: ' + aiText);
            speakEnglish(aiText, true);
        } else {
            addAiLog('error', 'Unexpected Voice API structure.');
        }
    } catch (err) {
        const loadEl = document.getElementById(loadId);
        if (loadEl) loadEl.remove();
        addAiLog('error', 'Network failure querying AI mentor.');
    }
}
// --- Voice AI implementation ends ---

function pickEnglishVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || null;
}

function applyVoiceToUtterance(u) {
    u.lang = 'en-US';
    const voice = pickEnglishVoice();
    if (voice) u.voice = voice;
    u.rate = 0.95; u.pitch = 1.1;
}

function speakEnglish(text, cancelQueue) {
    if (!gameActive || !voiceEnabled || !('speechSynthesis' in window) || !text) return;
    if (cancelQueue) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    applyVoiceToUtterance(u);
    speechSynthesis.speak(u);
}

function speakExpectedToolEnglish(force) {
    if (!gameActive || !voiceEnabled || !('speechSynthesis' in window)) return;
    let key, text;
    if (grabSequenceIndex >= TOOL_GRAB_ORDER.length) {
        key = 'done';
        text = 'Operation successful. Skull opened.';
    } else {
        const id = TOOL_GRAB_ORDER[grabSequenceIndex];
        const isHolding = (rightHeldTool === id);
        key = grabSequenceIndex + '-' + id + '-' + isHolding;
        if (isHolding) {
            text = 'Target acquired. Use the ' + toolIdToEnglish(id) + ' on the skull.';
        } else {
            text = 'Step ' + (grabSequenceIndex + 1) + '. Pick up the ' + toolIdToEnglish(id) + '.';
        }
    }
    if (!force && key === lastExpectedToolTtsKey) return;
    lastExpectedToolTtsKey = key;
    speakEnglish(text, true);
}

function runOpeningVoiceBriefing() {
    if (!voiceEnabled || !gameActive || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u1 = new SpeechSynthesisUtterance('HUD System activated. Commencing AR Neurosurgery.');
    applyVoiceToUtterance(u1);
    u1.onend = function() {
        if (!voiceEnabled || !gameActive) return;
        lastExpectedToolTtsKey = '';
        speakExpectedToolEnglish(true);
    };
    speechSynthesis.speak(u1);
}

function updateVoiceFabUI() {
    const btn = document.getElementById('voiceToggleBtn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (voiceEnabled) {
        if (icon) icon.className = 'fas fa-volume-high';
        btn.classList.remove('voice-fab-off');
    } else {
        if (icon) icon.className = 'fas fa-volume-xmark';
        btn.classList.add('voice-fab-off');
    }
}

function openRouterHeaders() {
    const ref = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'http://localhost';
    return {
        'Authorization': 'Bearer ' + _apiKey, 'Content-Type': 'application/json',
        'HTTP-Referer': ref, 'X-OpenRouter-Title': 'AR Neurosurgery HUD'
    };
}

function addAiLog(type, msg, isLoadingId = null) {
    const box = document.getElementById('aiLogs');
    let iconCode = 'fa-info-circle', textClass = 'text-info';
    if (type === 'loading') { iconCode = 'fa-spinner fa-spin'; }
    else if (type === 'success') { iconCode = 'fa-check-circle'; textClass = 'text-success'; }
    else if (type === 'danger' || type === 'error') { iconCode = 'fa-exclamation-triangle'; textClass = 'text-danger'; }

    const idAttr = isLoadingId ? 'id="' + isLoadingId + '"' : '';
    const label = type === 'success' ? 'Analysis:' : 'Alert:';
    box.insertAdjacentHTML('beforeend',
        '<div class="ai-log-entry" ' + idAttr + '><div class="d-flex">' +
        '<div class="ai-log-icon me-2"><i class="fas ' + iconCode + ' ' + textClass + '"></i></div>' +
        '<div><strong class="' + textClass + '">' + label + '</strong> <span class="text-light">' + msg + '</span></div></div></div>');
    box.scrollTop = box.scrollHeight;
}

async function triggerAiEvent(contextDescription, force = false) {
    if (!force && Date.now() - lastAiActionTime < 5000) return;
    lastAiActionTime = Date.now();

    if (!_apiKey) {
        setTimeout(() => {
            if (contextDescription.toLowerCase().indexOf('blood') !== -1 || contextDescription.indexOf('Hemorrhage') !== -1)
                addAiLog('danger', '[OFFLINE]: Reduce pressure and pace; hazard detected.');
            else addAiLog('success', '[OFFLINE]: ' + contextDescription);
        }, 600);
        return;
    }

    const loadId = 'load-' + Date.now();
    addAiLog('loading', 'Sending request to OpenRouter…', loadId);

    const prompt = 'You are a cybermedicine assistant for AR surgery. Accuracy: ' + metrics.accuracy +
        '%, errors: ' + metrics.errors + ', penalty: ' + Math.floor(metrics.penalty) + '/' + MAX_PENALTY +
        '. Event: ' + contextDescription +
        '. Reply with 1–2 short, calm, professional sentences. No Markdown.';

    let data = null;
    let rawText = '';
    try {
        const req = await fetch(OPENROUTER_CHAT_COMPLETIONS, {
            method: 'POST',
            headers: openRouterHeaders(),
            body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [{ role: 'user', content: prompt }] })
        });

        rawText = await req.text();
        try { data = JSON.parse(rawText); } catch (e) { data = null; }

        const loadEl = document.getElementById(loadId);
        if (loadEl) loadEl.remove();

        if (!req.ok) {
            let detail = 'HTTP ' + req.status;
            if (data && data.error && data.error.message) detail = data.error.message;
            addAiLog('error', 'OpenRouter error: ' + detail);
            return;
        }

        if (data && data.choices && data.choices[0] && data.choices[0].message) {
            addAiLog('success', data.choices[0].message.content);
        } else {
            addAiLog('error', 'Unexpected response format from API.');
        }
    } catch (err) {
        const loadEl = document.getElementById(loadId);
        if (loadEl) loadEl.remove();
        addAiLog('error', 'Network or CORS error. Check connection and API key.');
    }
}

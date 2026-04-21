// ==========================================
        // 1. INTRO MANTIQI (Kirish qismi)
        // ==========================================
        window.addEventListener('load', () => {
            // Boot oynani yo'qotish
            setTimeout(() => {
                const bootScreen = document.getElementById('boot-screen');
                if(bootScreen) {
                    bootScreen.style.opacity = '0';
                    setTimeout(() => bootScreen.style.display = 'none', 500);
                }
            }, 800);
            
            // Zarralarni shakllantirish
            const particleContainer = document.getElementById('particles-container');
            const particleCount = 40;
            for (let i = 0; i < particleCount; i++) {
                let particle = document.createElement('div');
                let size = Math.random() * 4 + 1;
                let posX = Math.random() * 100;
                let posY = Math.random() * 100;
                let duration = Math.random() * 10 + 5;
                let delay = Math.random() * 5;

                particle.style.position = 'absolute';
                particle.style.width = size + 'px';
                particle.style.height = size + 'px';
                particle.style.backgroundColor = i % 3 === 0 ? '#0ea5e9' : '#22d3ee';
                particle.style.borderRadius = '50%';
                particle.style.left = posX + 'vw';
                particle.style.top = posY + 'vh';
                particle.style.opacity = Math.random() * 0.5 + 0.1;
                particle.style.boxShadow = '0 0 10px #0ea5e9';
                particle.style.animation = `floatParticle ${duration}s ease-in-out ${delay}s infinite alternate`;

                particleContainer.appendChild(particle);
            }
        });


        // ==========================================
        // 2. ASOSIY DASTUR MANTIQI VA O'TISH
        // ==========================================
        const OPENROUTER_CHAT_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';
        const OPENROUTER_MODEL = 'openai/gpt-4o-mini';

        let gameActive = false;
        let handTrackingActive = false;
        let multiHandLandmarks = [];
        let multiHandedness = []; 
        let handDetected = false;

        let canvas, ctx;
        let video, hands;

        let rightHeldTool = null;
        let rightPinchCooldown = 0;
        let toolsOnTable = [];
        let bloodParticles = [];
        let smoothedLandmarks = [];

        let isLeftPinching = false;
        let lastLeftPinchX = 0;
        let lastLeftPinchY = 0;
        let modelTheta = 0; 
        let modelPhi = 75;  

        const TOOL_GRAB_ORDER = ['skalpel', 'qaychi', 'pinset'];
        let grabSequenceIndex = 0;

        const MAX_PENALTY = 100;
        let metrics = { accuracy: 100, errors: 0, penalty: 0, startTime: null, timerInterval: null };

        let _apiKey = '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';
        let lastAiActionTime = 0;
        let gameOverModalInstance;
        let missionSuccessModalInstance;
        let missionSuccessShown = false;
        let lastCoordLines = ['Preparing camera…'];
        let lastExpectedToolTtsKey = '';
        
        let voiceEnabled = true;

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

        function toolIdToEnglish(id) {
            const m = { skalpel: 'scalpel', qaychi: 'scissors', pinset: 'forceps' };
            return m[id] || id;
        }

        function toolIdToDisplay(id) { return toolIdToEnglish(id).toUpperCase(); }

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

        function tableBottomY() {
            const pad = Math.max(52, Math.min(108, Math.round(window.innerHeight * 0.12)));
            return window.innerHeight - pad;
        }

        function initTools(resetSequence) {
            const y = tableBottomY();
            const w = window.innerWidth;
            toolsOnTable = [
                { id: 'skalpel', x: w * 0.28, y },
                { id: 'qaychi', x: w * 0.5, y },
                { id: 'pinset', x: w * 0.72, y }
            ];
            if (resetSequence) {
                grabSequenceIndex = 0;
                rightHeldTool = null;
                updateExpectedToolUI();
            }
        }

        function openRouterHeaders() {
            const ref = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'http://localhost';
            return {
                'Authorization': 'Bearer ' + _apiKey, 'Content-Type': 'application/json',
                'HTTP-Referer': ref, 'X-OpenRouter-Title': 'AR Neurosurgery HUD'
            };
        }

        function buildMissionConfetti() {
            const host = document.getElementById('missionConfetti');
            if (!host) return;
            host.innerHTML = '';
            const colors = ['#34d399', '#6ee7b7', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa'];
            for (let i = 0; i < 36; i++) {
                const s = document.createElement('span');
                s.style.left = (Math.random() * 100) + '%';
                s.style.background = colors[i % colors.length];
                s.style.animationDelay = (Math.random() * 2) + 's';
                s.style.animationDuration = (2 + Math.random() * 2) + 's';
                host.appendChild(s);
            }
        }

        function showMissionSuccessModal() {
            if (missionSuccessShown) return;
            missionSuccessShown = true;
            speakEnglish('Mission success. Brain model revealed.', true);
            gameActive = false;
            handTrackingActive = false;
            if (metrics.timerInterval) { clearInterval(metrics.timerInterval); metrics.timerInterval = null; }
            buildMissionConfetti();
            missionSuccessModalInstance.show();
        }

        document.addEventListener('DOMContentLoaded', function() {
            // Fix Bootstrap Modals overlapping with uiLayer due to z-index stacking context
            document.querySelectorAll('.modal').forEach(m => document.body.appendChild(m));
            
            // Initialization for Voice AI
            initVoiceRecognition();

            canvas = document.getElementById('gameCanvas');
            ctx = canvas.getContext('2d');
            updateCanvasSize();
            initTools(true);
            
            window.addEventListener('resize', () => {
                updateCanvasSize();
                if (!gameActive && toolsOnTable.length === 3) initTools(true);
            });

            gameOverModalInstance = new bootstrap.Modal(document.getElementById('gameOverModal'));
            missionSuccessModalInstance = new bootstrap.Modal(document.getElementById('missionSuccessModal'));
            
            if ('speechSynthesis' in window) {
                speechSynthesis.getVoices();
                speechSynthesis.addEventListener('voiceschanged', function() { speechSynthesis.getVoices(); });
            }
            updateVoiceFabUI();

            document.getElementById('coordsModal').addEventListener('shown.bs.modal', flushCoordModal);
            document.getElementById('btnRepeatVoiceHint').addEventListener('click', function() { speakExpectedToolEnglish(true); });
            
            document.getElementById('voiceToggleBtn').addEventListener('click', function() {
                voiceEnabled = !voiceEnabled;
                updateVoiceFabUI();
                if (!voiceEnabled) { if ('speechSynthesis' in window) speechSynthesis.cancel(); } 
                else if (gameActive) { lastExpectedToolTtsKey = ''; speakExpectedToolEnglish(true); }
            });
            
            document.getElementById('reloadBtn').addEventListener('click', () => location.reload());
            document.getElementById('missionSuccessDismissBtn').addEventListener('click', () => {
                missionSuccessModalInstance.hide();
                document.getElementById('uiLayer').style.display = 'none';
                ctx.clearRect(0, 0, canvas.width, canvas.height); 
            });

            // ==========================================
            // "START" TUGMASI BOSILGANDA ISHGA TUSHIRISH
            // ==========================================
            document.getElementById('btn-start-simulation').addEventListener('click', (e) => {
                e.preventDefault();
                
                // Ovozni faollashtirish (Browser qoidasi uchun)
                if ('speechSynthesis' in window) { 
                    let unlockAudio = new SpeechSynthesisUtterance(''); 
                    speechSynthesis.speak(unlockAudio); 
                }
                
                // Intro ekranni yashirish va App ekranni chiqarish
                const introScreen = document.getElementById('intro-screen-wrapper');
                introScreen.style.opacity = '0';
                
                setTimeout(() => {
                    introScreen.style.display = 'none';
                    document.getElementById('app-screen-wrapper').style.display = 'block';
                    
                    // O'yinni boshlash
                    voiceEnabled = true;
                    updateVoiceFabUI();
                    startGame();
                }, 600); // Intro yo'qolish animatsiyasi tugashini kutish
            });
        });

        function updateCanvasSize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function targetCenter() {
            return { x: canvas.width / 2, y: canvas.height / 2 };
        }

        function updateExpectedToolUI(silentVoice) {
            const el = document.getElementById('valExpectedTool');
            if (grabSequenceIndex >= TOOL_GRAB_ORDER.length) {
                el.textContent = 'PROCEDURE COMPLETE';
                el.className = 'fw-bold text-success mb-3 fs-5';
            } else {
                const expected = TOOL_GRAB_ORDER[grabSequenceIndex];
                const isHolding = (rightHeldTool === expected);
                if (isHolding) {
                    el.textContent = 'USE ' + toolIdToDisplay(expected) + ' ON TARGET';
                    el.className = 'fw-bold text-warning mb-3 fs-5';
                } else {
                    el.textContent = 'PICK UP ' + toolIdToDisplay(expected);
                    el.className = 'fw-bold text-danger mb-3 fs-5';
                }
            }
            if (gameActive && !silentVoice) speakExpectedToolEnglish(false);
        }

        function addPenalty(amount, reason) {
            if (!gameActive) return;
            metrics.penalty = Math.min(MAX_PENALTY, metrics.penalty + amount);
            updateMetricsUI();
            if (metrics.penalty >= MAX_PENALTY) {
                endGameFailure('SYSTEM HALT: Penalty score exceeded the safe threshold. (' + reason + ')');
            }
        }

        function endGameFailure(msg) {
            gameActive = false;
            handTrackingActive = false;
            if ('speechSynthesis' in window) speechSynthesis.cancel();
            if (metrics.timerInterval) clearInterval(metrics.timerInterval);
            document.getElementById('gameOverTitle').textContent = 'Critical fault';
            document.getElementById('gameOverBody').textContent = msg;
            gameOverModalInstance.show();
        }

        function startTimer() {
            metrics.startTime = Date.now();
            metrics.timerInterval = setInterval(() => {
                const ms = Date.now() - metrics.startTime;
                const totalSec = Math.floor(ms / 1000);
                const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
                const ss = String(totalSec % 60).padStart(2, '0');
                document.getElementById('valTime').textContent = mm + ':' + ss;
            }, 1000);
        }

        function updateMetricsUI() {
            const accEl = document.getElementById('valAccuracy');
            accEl.textContent = Math.floor(metrics.accuracy) + '%';
            if (metrics.accuracy < 60) accEl.className = 'metric-value text-danger';
            else if (metrics.accuracy < 85) accEl.className = 'metric-value text-warning';
            else accEl.className = 'metric-value text-success';

            document.getElementById('valErrors').textContent = metrics.errors;
            document.getElementById('valPenalty').textContent = Math.floor(metrics.penalty);
            
            const pct = Math.min(100, (metrics.penalty / MAX_PENALTY) * 100);
            document.getElementById('penaltyBarFill').style.width = pct + '%';

            const held = rightHeldTool ? [toolIdToDisplay(rightHeldTool)] : [];
            const txt = held.length ? held.join(' & ') : 'Nothing held';
            document.getElementById('valToolStatus').textContent = txt.toUpperCase();
        }

        function flushCoordModal() {
            const hc = targetCenter();
            const label = document.getElementById('targetCenterLabel');
            const details = document.getElementById('coordDetails');
            if (label) label.textContent = '(' + Math.round(hc.x) + ', ' + Math.round(hc.y) + ')';
            if (details) details.innerHTML = lastCoordLines.join('<br>');
        }

        function updateCoordUI(lines) {
            lastCoordLines = (lines && lines.length) ? lines.slice() : ['Sensors inactive…'];
            const modal = document.getElementById('coordsModal');
            if (modal && modal.classList.contains('show')) flushCoordModal();
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

        async function startGame() {
            const loadingScreen = document.getElementById('loadingScreen');
            loadingScreen.style.display = 'flex';
            lastExpectedToolTtsKey = '';
            missionSuccessShown = false;
            metrics.penalty = 0;
            metrics.errors = 0;
            metrics.accuracy = 100;
            grabSequenceIndex = 0;
            updateExpectedToolUI();
            updateMetricsUI();
            
            document.getElementById('skullModel').style.display = 'block';
            document.getElementById('brainModel').style.display = 'none';
            document.getElementById('skullModel').cameraOrbit = `${modelTheta}deg ${modelPhi}deg auto`;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
                });
                video = document.createElement('video');
                video.srcObject = stream;
                video.playsInline = true;
                video.style.display = 'none';
                document.body.appendChild(video);
                await video.play();
                await loadHandTracking();

                loadingScreen.style.display = 'none';
                document.getElementById('uiLayer').style.display = 'block';

                gameActive = true;
                updateExpectedToolUI(true);
                startTimer();
                requestAnimationFrame(gameLoop);
                runOpeningVoiceBriefing();
                triggerAiEvent('System online. Use LEFT hand to rotate. Take the first instrument with RIGHT hand.', true);
            } catch (error) {
                loadingScreen.style.display = 'none';
                alert('Camera not available: ' + error.message);
            }
        }

        function loadHandTracking() {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
                script.onload = () => {
                    try {
                        hands = new window.Hands({
                            locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file
                        });
                        hands.setOptions({
                            maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6
                        });
                        hands.onResults(onHandResults);
                        startHandTracking();
                        resolve();
                    } catch (e) { reject(e); }
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        function startHandTracking() {
            let lastVideoTime = -1;
            async function processFrame() {
                if (video.readyState >= 2 && handTrackingActive) {
                    if (video.currentTime !== lastVideoTime) {
                        lastVideoTime = video.currentTime;
                        try { await hands.send({ image: video }); } catch (e) {}
                    }
                }
                if (handTrackingActive) {
                    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(processFrame);
                    else requestAnimationFrame(processFrame);
                }
            }
            handTrackingActive = true;
            if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(processFrame);
            else requestAnimationFrame(processFrame);
        }

        function onHandResults(results) {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                if (smoothedLandmarks.length !== results.multiHandLandmarks.length) {
                    smoothedLandmarks = JSON.parse(JSON.stringify(results.multiHandLandmarks));
                } else {
                    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                        for (let j = 0; j < 21; j++) {
                            smoothedLandmarks[i][j].x += (results.multiHandLandmarks[i][j].x - smoothedLandmarks[i][j].x) * 0.45;
                            smoothedLandmarks[i][j].y += (results.multiHandLandmarks[i][j].y - smoothedLandmarks[i][j].y) * 0.45;
                        }
                    }
                }
                multiHandLandmarks = smoothedLandmarks;
                multiHandedness = results.multiHandedness;
                handDetected = true;
                
                const el = document.getElementById('valHandStatus');
                el.textContent = 'Active: ' + multiHandLandmarks.length + ' hand(s)';
                el.className = 'badge bg-success mb-2 px-3 py-2 text-uppercase';
            } else {
                handDetected = false;
                multiHandLandmarks = [];
                multiHandedness = [];
                smoothedLandmarks = [];
                const el = document.getElementById('valHandStatus');
                el.textContent = 'Tracking lost';
                el.className = 'badge bg-danger mb-2 px-3 py-2 text-uppercase';
            }
        }

        function drawHUDGrid() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
            ctx.lineWidth = 1;
            const step = 40;
            for(let i = 0; i < canvas.width; i += step) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
            for(let j = 0; j < canvas.height; j += step) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke(); }
            
            const hc = targetCenter();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
            ctx.beginPath(); ctx.arc(hc.x, hc.y, 150, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(hc.x, hc.y, 250, 0, Math.PI * 2); ctx.stroke();
        }

        function drawScalpel() {
            ctx.fillStyle = '#cbd5e1'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.rect(-70, -6, 80, 12); ctx.fill(); ctx.stroke();
            ctx.beginPath();
            for (let i = 0; i < 8; i++) { const x = -60 + i * 7; ctx.moveTo(x, -6); ctx.lineTo(x, 6); }
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(50, -6); ctx.quadraticCurveTo(65, 0, 50, 6); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10, 4); ctx.lineTo(50, 4); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
        }

        function drawScissorHalf(isTop) {
            ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
            ctx.beginPath();
            if (isTop) { ctx.moveTo(0, 0); ctx.lineTo(60, -8); ctx.lineTo(60, -2); ctx.lineTo(0, 0); }
            else { ctx.moveTo(0, 0); ctx.lineTo(60, 8); ctx.lineTo(60, 2); ctx.lineTo(0, 0); }
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#e2e8f0'; ctx.beginPath();
            if (isTop) { ctx.arc(-30, -5, 12, 0, Math.PI * 2); } else { ctx.arc(-30, 5, 12, 0, Math.PI * 2); }
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#0f172a'; ctx.beginPath();
            if (isTop) { ctx.arc(-30, -5, 6, 0, Math.PI * 2); } else { ctx.arc(-30, 5, 6, 0, Math.PI * 2); }
            ctx.fill(); ctx.stroke();
        }

        function drawTweezerArm(isTop) {
            ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
            ctx.beginPath();
            if (isTop) { ctx.moveTo(-50, -12); ctx.lineTo(50, -2); ctx.lineTo(-50, -5); }
            else { ctx.moveTo(-50, 12); ctx.lineTo(50, 2); ctx.lineTo(-50, 5); }
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }

        function drawToolsOnTable() {
            for (let t = 0; t < toolsOnTable.length; t++) {
                let tool = toolsOnTable[t];
                ctx.save();
                ctx.translate(tool.x, tool.y);
                ctx.scale(1.2, 1.2);
                ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 10;
                
                if (tool.id === 'skalpel') { ctx.rotate(-Math.PI / 6); drawScalpel(); }
                else if (tool.id === 'qaychi') {
                    ctx.rotate(-Math.PI / 6); drawScissorHalf(true); drawScissorHalf(false);
                    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fillStyle = '#475569'; ctx.fill();
                } else if (tool.id === 'pinset') {
                    ctx.rotate(-Math.PI / 6); drawTweezerArm(true); drawTweezerArm(false);
                }
                ctx.restore();
                
                ctx.beginPath();
                ctx.ellipse(tool.x, tool.y + 10, 60, 20, 0, 0, Math.PI * 2);
                let grad = ctx.createRadialGradient(tool.x, tool.y+10, 0, tool.x, tool.y+10, 60);
                grad.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
                grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
                ctx.fillStyle = grad; ctx.fill();
                
                ctx.fillStyle = '#bae6fd'; ctx.font = 'bold 12px Inter'; ctx.textAlign = 'center'; ctx.letterSpacing = '2px';
                ctx.fillText(toolIdToDisplay(tool.id), tool.x, tool.y + 55);
            }
        }

        function processHandsAndDraw() {
            const hc = targetCenter();
            const coordLines = [];

            for (let i = 0; i < multiHandLandmarks.length; i++) {
                if (i >= 2) break;
                let marks = multiHandLandmarks[i];
                
                let label = multiHandedness[i] ? multiHandedness[i].label : 'Left';
                let isLeftHand = (label === 'Right'); 
                let isRightHand = (label === 'Left');

                const thumbX = (1 - marks[4].x) * canvas.width;
                const thumbY = marks[4].y * canvas.height;
                const indexX = (1 - marks[8].x) * canvas.width;
                const indexY = marks[8].y * canvas.height;
                const middleX = (1 - marks[12].x) * canvas.width;
                const middleY = marks[12].y * canvas.height;
                const wristX = (1 - marks[0].x) * canvas.width;
                const palmX = (1 - marks[9].x) * canvas.width;
                const wristY = marks[0].y * canvas.height;
                const palmY = marks[9].y * canvas.height;
                
                const baseDist = Math.hypot(wristX - palmX, wristY - palmY);
                let scale = Math.max(0.6, Math.min(baseDist / 120, 2.5));
                const dx = palmX - wristX;
                const dy = palmY - wristY;
                const angle = Math.atan2(dy, dx);
                
                const pinchGrabScale = Math.hypot(thumbX - indexX, thumbY - indexY);
                const isPinching = pinchGrabScale < 40 * scale;
                const midPointX = (thumbX + indexX) / 2;
                const midPointY = (thumbY + indexY) / 2;

                const toolActionDist = Math.hypot(thumbX - middleX, thumbY - middleY);
                const openAmount = Math.max(0, Math.min(1, (toolActionDist - 25 * scale) / (70 * scale)));

                const tipX = thumbX + Math.cos(angle) * (50 * scale);
                const tipY = thumbY + Math.sin(angle) * (50 * scale);
                const distTipTarget = Math.hypot(tipX - hc.x, tipY - hc.y);
                const distIndexTarget = Math.hypot(indexX - hc.x, indexY - hc.y);

                coordLines.push(
                    '<div class="mb-2 border-bottom border-secondary pb-1"><b>' + (isLeftHand ? 'LEFT HAND (Rotation)' : 'RIGHT HAND (Tools)') + '</b><br>' +
                    '<span class="text-secondary">INDEX:</span> (' + Math.round(indexX) + ', ' + Math.round(indexY) + ') | ' +
                    '<span class="text-secondary">THUMB:</span> (' + Math.round(thumbX) + ', ' + Math.round(thumbY) + ')</div>'
                );

                ctx.save();

                if (isLeftHand) {
                    if (isPinching) {
                        if (!isLeftPinching) {
                            isLeftPinching = true;
                            lastLeftPinchX = midPointX;
                            lastLeftPinchY = midPointY;
                        } else {
                            let deltaX = midPointX - lastLeftPinchX;
                            let deltaY = midPointY - lastLeftPinchY;
                            
                            modelTheta -= deltaX * 0.6;
                            modelPhi += deltaY * 0.6;
                            modelPhi = Math.max(10, Math.min(170, modelPhi));
                            
                            document.getElementById('skullModel').cameraOrbit = `${modelTheta}deg ${modelPhi}deg auto`;
                            document.getElementById('brainModel').cameraOrbit = `${modelTheta}deg ${modelPhi}deg auto`;
                            
                            lastLeftPinchX = midPointX;
                            lastLeftPinchY = midPointY;
                        }
                        ctx.translate(midPointX, midPointY);
                        ctx.beginPath(); ctx.arc(0, 0, 15 * scale, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(16, 185, 129, 0.4)'; ctx.fill();
                        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2; ctx.stroke();
                    } else {
                        isLeftPinching = false;
                        ctx.translate(midPointX, midPointY);
                        ctx.beginPath(); ctx.arc(0, 0, 8 * scale, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
                        ctx.beginPath(); ctx.arc(0, 0, 20 * scale, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)'; ctx.setLineDash([5, 5]); ctx.stroke();
                        ctx.setLineDash([]);
                    }
                } 
                
                else if (isRightHand) {
                    if (rightPinchCooldown > 0) rightPinchCooldown--;

                    if (isPinching && rightPinchCooldown === 0) {
                        if (rightHeldTool === null) {
                            for (let t = 0; t < toolsOnTable.length; t++) {
                                const dist = Math.hypot(midPointX - toolsOnTable[t].x, midPointY - toolsOnTable[t].y);
                                if (dist < 80) {
                                    const pickedId = toolsOnTable[t].id;
                                    const expected = TOOL_GRAB_ORDER[grabSequenceIndex];
                                    if (grabSequenceIndex < TOOL_GRAB_ORDER.length && pickedId !== expected) {
                                        addPenalty(10, 'Workflow breach: wrong instrument picked up');
                                        metrics.errors++; metrics.accuracy = Math.max(0, metrics.accuracy - 8); updateMetricsUI();
                                        triggerAiEvent('ERROR: Expected ' + expected + ' but ' + pickedId + ' was taken.');
                                        speakEnglish('Warning. Wrong order. Put it back and pick up the ' + toolIdToEnglish(expected) + '.', true);
                                    }
                                    rightHeldTool = pickedId;
                                    toolsOnTable.splice(t, 1);
                                    rightPinchCooldown = 40;
                                    updateExpectedToolUI(); updateMetricsUI();
                                    triggerAiEvent('Sensor: ' + toolIdToEnglish(pickedId) + ' picked up.');
                                    break;
                                }
                            }
                        } else {
                            toolsOnTable.push({ id: rightHeldTool, x: midPointX, y: midPointY });
                            rightHeldTool = null;
                            rightPinchCooldown = 40;
                            updateExpectedToolUI(); updateMetricsUI();
                        }
                    }

                    if (rightHeldTool) {
                        ctx.translate(thumbX, thumbY);
                        ctx.rotate(angle); ctx.scale(scale, scale);
                        ctx.shadowColor = 'rgba(56, 189, 248, 0.4)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 5;

                        if (rightHeldTool === 'qaychi') {
                            const openAngle = openAmount * (Math.PI / 6.5);
                            ctx.save(); ctx.rotate(-openAngle); drawScissorHalf(true); ctx.restore();
                            ctx.save(); ctx.rotate(openAngle); drawScissorHalf(false); ctx.restore();
                            ctx.shadowColor = 'transparent'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fillStyle = '#2d3748'; ctx.fill();
                        } else if (rightHeldTool === 'pinset') {
                            const openAngle = openAmount * (Math.PI / 15);
                            ctx.translate(-50, 0);
                            ctx.save(); ctx.rotate(-openAngle); drawTweezerArm(true); ctx.restore();
                            ctx.save(); ctx.rotate(openAngle); drawTweezerArm(false); ctx.restore();
                        } else if (rightHeldTool === 'skalpel') {
                            ctx.translate(20, 0); drawScalpel();
                        }

                        let isTouching = distTipTarget < 160; 
                        let isAction = false;
                        if (rightHeldTool === 'skalpel') isAction = openAmount < 0.35;
                        else if (rightHeldTool === 'qaychi' || rightHeldTool === 'pinset') isAction = openAmount < 0.22;

                        if (isTouching && isAction) {
                            const expected = TOOL_GRAB_ORDER[grabSequenceIndex];
                            if (rightHeldTool === expected) {
                                makeBloodSplatter(tipX, tipY);
                                triggerAiEvent('Success: ' + toolIdToDisplay(rightHeldTool) + ' applied on skull.');
                                speakEnglish('Perfect execution. Proceeding to next step.', true);
                                grabSequenceIndex++;
                                rightHeldTool = null;
                                rightPinchCooldown = 50; 
                                updateExpectedToolUI(); updateMetricsUI();
                                
                                if (grabSequenceIndex >= TOOL_GRAB_ORDER.length) {
                                    triggerAiEvent('Procedure complete. Skull successfully opened. Revealing brain.', true);
                                    document.getElementById('skullModel').style.display = 'none';
                                    document.getElementById('brainModel').style.display = 'block';
                                    setTimeout(function() { showMissionSuccessModal(); }, 1200);
                                }
                            } else {
                                if (Math.random() < 0.08) { 
                                    makeBloodSplatter(tipX, tipY); metrics.errors++; metrics.accuracy = Math.max(0, metrics.accuracy - 0.5);
                                    addPenalty(10, 'Wrong instrument contacted the target'); updateMetricsUI();
                                    triggerAiEvent('CRITICAL: Wrong instrument touched the skull.');
                                }
                            }
                        }
                    } else {
                        ctx.translate(midPointX, midPointY);
                        ctx.beginPath(); ctx.arc(0, 0, 8 * scale, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
                        ctx.beginPath(); ctx.arc(0, 0, 20 * scale, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)'; ctx.setLineDash([5, 5]); ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }
                ctx.restore();
            }

            updateCoordUI(coordLines.length ? coordLines : ['No object in the tracking volume…']);
        }

        function makeBloodSplatter(x, y) {
            for (let i = 0; i < 4; i++) {
                bloodParticles.push({
                    x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40,
                    vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16,
                    size: Math.random() * 8 + 4, life: 1.0
                });
            }
        }

        function updateAndDrawParticles() {
            for (let i = bloodParticles.length - 1; i >= 0; i--) {
                let p = bloodParticles[i];
                p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.size *= 0.96; p.life -= 0.015;
                if (p.life <= 0) bloodParticles.splice(i, 1);
                else {
                    ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = '#f43f5e';
                    ctx.shadowColor = '#be123c'; ctx.shadowBlur = 10;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                }
            }
        }

        function gameLoop() {
            if (!gameActive) return;
            drawHUDGrid();
            drawToolsOnTable();
            updateAndDrawParticles();
            if (handDetected) {
                processHandsAndDraw();
            } else {
                updateCoordUI(['No tracked object in frame…']);
            }
            requestAnimationFrame(gameLoop);
        }

        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                gameActive = false;
                if ('speechSynthesis' in window) speechSynthesis.cancel();
            } else if (handTrackingActive && !missionSuccessShown) {
                gameActive = true;
                requestAnimationFrame(gameLoop);
            }
        });
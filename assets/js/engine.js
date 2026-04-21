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

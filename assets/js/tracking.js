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

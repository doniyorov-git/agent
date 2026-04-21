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

function toolIdToEnglish(id) {
    const m = { skalpel: 'scalpel', qaychi: 'scissors', pinset: 'forceps' };
    return m[id] || id;
}

function toolIdToDisplay(id) { return toolIdToEnglish(id).toUpperCase(); }

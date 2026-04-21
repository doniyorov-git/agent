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

document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        gameActive = false;
        if ('speechSynthesis' in window) speechSynthesis.cancel();
    } else if (handTrackingActive && !missionSuccessShown) {
        gameActive = true;
        requestAnimationFrame(gameLoop);
    }
});

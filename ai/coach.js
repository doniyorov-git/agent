export class SurgicalCoach {
  constructor({ bus, enableVoice = true }) {
    this.bus = bus;
    this.enableVoice = enableVoice;
    this.voiceEnabled = "speechSynthesis" in window && enableVoice;
    this.currentStepIndex = 0;
    this.lastHintAt = 0;
    this.lastAIHintAt = 0;
    this.stepSequence = [
      "select-scalpel",
      "approach-safe-entry",
      "perform-controlled-cut",
      "switch-forceps",
      "complete-task",
    ];
    this.stepHints = {
      "select-scalpel": "Select scalpel to start the craniotomy step.",
      "approach-safe-entry": "Move to the safe entry zone and keep steady motion.",
      "perform-controlled-cut": "Cut along the guideline with shallow angle.",
      "switch-forceps": "Switch to forceps for tissue handling.",
      "complete-task": "Stabilize instrument and complete final inspection.",
    };
  }

  start() {
    this.bus.on("session:started", () => {
      this.currentStepIndex = 0;
      this.pushHint(this.stepHints[this.stepSequence[0]]);
    });

    this.bus.on("instrument:changed", ({ instrument }) => {
      if (this.currentStep() === "select-scalpel" && instrument === "scalpel") {
        this.advanceStep();
      } else if (this.currentStep() === "switch-forceps" && instrument === "forceps") {
        this.advanceStep();
      } else {
        this.pushHint(`Instrument set to ${instrument}.`);
      }
    });

    this.bus.on("interaction:tick", (state) => this.evaluateStep(state));
    this.bus.on("safety:warning", ({ message }) => this.pushHint(`Safety alert: ${message}`, true));
    this.bus.on("session:ended", () => this.pushHint("Session ended. Review your report."));
  }

  currentStep() {
    return this.stepSequence[this.currentStepIndex];
  }

  evaluateStep(state) {
    if (!state?.sessionActive) {
      return;
    }
    const now = performance.now();
    if (now - this.lastHintAt < 700) {
      return;
    }

    const step = this.currentStep();
    if (step === "approach-safe-entry" && state.zone === "safe") {
      this.advanceStep();
      return;
    }

    if (step === "perform-controlled-cut") {
      if (state.instrument !== "scalpel") {
        this.pushHint("Use scalpel for cutting.", false);
        return;
      }
      if (Math.abs(state.angleDeg) > 35) {
        this.pushHint("Your cutting angle is incorrect. Keep angle under 35 degrees.", false);
        return;
      }
      if (state.zone === "safe" && state.speed < 0.03) {
        this.advanceStep();
        return;
      }
    }

    if (step === "complete-task" && state.zone === "safe" && state.speed < 0.015) {
      this.pushHint("Procedure complete. End session to view score.");
    }
  }

  advanceStep() {
    if (this.currentStepIndex < this.stepSequence.length - 1) {
      this.currentStepIndex += 1;
      const next = this.stepSequence[this.currentStepIndex];
      this.pushHint(`Step detected: ${next.replaceAll("-", " ")}.`);
      this.bus.emit("coach:step", { step: next, index: this.currentStepIndex });
      return;
    }
    this.pushHint("All surgical steps detected. Great control.");
  }

  pushHint(message, urgent = false) {
    this.lastHintAt = performance.now();
    this.bus.emit("coach:hint", { message, urgent, step: this.currentStep() });
    if (this.voiceEnabled && (urgent || message.includes("incorrect") || message.includes("Select"))) {
      this.speak(message);
    }
    this.tryAIEnrichment(message);
  }

  speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async tryAIEnrichment(baseMessage) {
    const apiKey = localStorage.getItem("OPENROUTER_API_KEY");
    const now = performance.now();
    if (!apiKey || now - this.lastAIHintAt < 10000) {
      return;
    }
    this.lastAIHintAt = now;
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "Surgical Coach Simulator",
        },
        body: JSON.stringify({
          model: "openai/gpt-5.4",
          max_tokens: 60,
          messages: [
            {
              role: "system",
              content: "You are a strict surgical simulator coach. Return one short coaching tip.",
            },
            {
              role: "user",
              content: `Current coaching message: ${baseMessage}`,
            },
          ],
        }),
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      const tip = data?.choices?.[0]?.message?.content?.trim();
      if (tip) {
        this.bus.emit("coach:hint", { message: `AI: ${tip}`, urgent: false, step: this.currentStep() });
      }
    } catch (_) {
      // Silent fallback keeps real-time loop smooth.
    }
  }
}

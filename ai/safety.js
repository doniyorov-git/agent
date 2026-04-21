export class SafetyAgent {
  constructor({ bus }) {
    this.bus = bus;
    this.maxSafeSpeed = 0.06;
    this.allowedInstrumentsByStep = {
      "select-scalpel": ["scalpel", "forceps", "scissors"],
      "approach-safe-entry": ["scalpel"],
      "perform-controlled-cut": ["scalpel"],
      "switch-forceps": ["forceps"],
      "complete-task": ["forceps", "scissors"],
    };
    this.currentStep = "select-scalpel";
  }

  start() {
    this.bus.on("coach:step", ({ step }) => {
      this.currentStep = step;
    });
    this.bus.on("interaction:tick", (state) => this.evaluate(state));
  }

  evaluate(state) {
    if (!state?.sessionActive) {
      return;
    }
    const violations = [];
    const allowed = this.allowedInstrumentsByStep[this.currentStep] || [];

    if (allowed.length && !allowed.includes(state.instrument)) {
      violations.push("Wrong instrument for current step.");
    }

    if (state.zone === "danger") {
      violations.push("Avoid this region. You are in a danger zone.");
    }

    if (state.speed > this.maxSafeSpeed) {
      violations.push("Excessive force/motion detected. Slow down.");
    }

    if (state.instrument === "scalpel" && Math.abs(state.angleDeg) > 45) {
      violations.push("Unsafe cutting direction detected.");
    }

    if (!violations.length) {
      this.bus.emit("safety:clear", { blocked: false });
      return;
    }

    const message = violations[0];
    const blockAction = state.zone === "danger";
    this.bus.emit("safety:warning", { message, blocked: blockAction, violations });
  }
}

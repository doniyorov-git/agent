export class SkillEvaluator {
  constructor({ bus }) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.startedAt = 0;
    this.endedAt = 0;
    this.errors = 0;
    this.samples = 0;
    this.safeSamples = 0;
    this.stabilityAccumulator = 0;
    this.prevSpeed = 0;
    this.lastState = null;
  }

  start() {
    this.bus.on("session:started", () => {
      this.reset();
      this.startedAt = performance.now();
    });

    this.bus.on("interaction:tick", (state) => {
      if (!state?.sessionActive) {
        return;
      }
      this.track(state);
    });

    this.bus.on("safety:warning", () => {
      this.errors += 1;
    });

    this.bus.on("session:ended", () => {
      this.endedAt = performance.now();
      this.bus.emit("evaluation:complete", this.finalize());
    });
  }

  track(state) {
    this.samples += 1;
    if (state.zone === "safe") {
      this.safeSamples += 1;
    }
    const speedDelta = Math.abs(state.speed - this.prevSpeed);
    this.prevSpeed = state.speed;
    this.stabilityAccumulator += Math.max(0, 1 - speedDelta * 22);
    this.lastState = state;
    this.bus.emit("evaluation:live", this.liveMetrics());
  }

  liveMetrics() {
    const precision = this.samples ? (this.stabilityAccumulator / this.samples) * 100 : 0;
    const accuracy = this.samples ? (this.safeSamples / this.samples) * 100 : 0;
    const elapsed = this.startedAt ? Math.floor((performance.now() - this.startedAt) / 1000) : 0;
    return {
      precision: Math.max(0, Math.min(100, precision)),
      accuracy: Math.max(0, Math.min(100, accuracy)),
      timeSec: elapsed,
      errors: this.errors,
    };
  }

  finalize() {
    const live = this.liveMetrics();
    const timePenalty = Math.max(0, live.timeSec - 180) * 0.15;
    const errorPenalty = live.errors * 6;
    const score = Math.round(
      Math.max(
        0,
        Math.min(100, live.precision * 0.35 + live.accuracy * 0.45 + (100 - timePenalty) * 0.2 - errorPenalty),
      ),
    );

    const suggestions = [];
    if (live.precision < 70) suggestions.push("Improve hand stability and reduce sudden motion.");
    if (live.accuracy < 75) suggestions.push("Stay within designated safe zones longer.");
    if (live.errors > 3) suggestions.push("Review instrument-choice and danger-zone warnings.");
    if (!suggestions.length) suggestions.push("Excellent performance. Keep the same control profile.");

    return {
      score,
      ...live,
      suggestions,
    };
  }
}

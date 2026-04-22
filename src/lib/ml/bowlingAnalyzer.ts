import type { PoseFrame, BowlingMetrics, DetectedEvent, WeaknessDiagnosis, Archetype, ProMatch } from '../types';

const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

function angle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
  if (magBA === 0 || magBC === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC)))) * (180 / Math.PI);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function detectBowlingEvents(frames: PoseFrame[]): DetectedEvent[] {
  if (frames.length < 5) return [];
  const events: DetectedEvent[] = [];

  // Find highest arm position (release point)
  let releaseIdx = 0;
  let highestArm = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const lm = frames[i].landmarks;
    if (lm.length < 33) continue;
    const armY = Math.min(lm[LM.LEFT_WRIST].y, lm[LM.RIGHT_WRIST].y);
    if (armY < highestArm) {
      highestArm = armY;
      releaseIdx = i;
    }
  }

  // Stance/run-up start
  events.push({
    type: 'stance',
    frameIndex: 0,
    timestamp: frames[0].timestamp,
    confidence: 0.7,
  });

  // Contact = release point for bowlers
  events.push({
    type: 'contact',
    frameIndex: releaseIdx,
    timestamp: frames[releaseIdx].timestamp,
    confidence: 0.75,
  });

  // Follow-through after release
  const followIdx = Math.min(releaseIdx + Math.floor(frames.length * 0.15), frames.length - 1);
  events.push({
    type: 'follow_through',
    frameIndex: followIdx,
    timestamp: frames[followIdx].timestamp,
    confidence: 0.7,
  });

  return events.sort((a, b) => a.frameIndex - b.frameIndex);
}

export function computeBowlingMetrics(frames: PoseFrame[], events: DetectedEvent[]): BowlingMetrics {
  const releaseEvent = events.find(e => e.type === 'contact');
  const releaseFrame = releaseEvent ? frames[releaseEvent.frameIndex] : frames[Math.floor(frames.length * 0.6)];
  const rl = releaseFrame.landmarks;

  // Release height: wrist Y relative to full body height
  const bodyHeight = dist(rl[LM.NOSE], { x: (rl[LM.LEFT_ANKLE].x + rl[LM.RIGHT_ANKLE].x) / 2, y: (rl[LM.LEFT_ANKLE].y + rl[LM.RIGHT_ANKLE].y) / 2 });
  const wristHeight = Math.max(
    dist(rl[LM.LEFT_WRIST], { x: (rl[LM.LEFT_ANKLE].x + rl[LM.RIGHT_ANKLE].x) / 2, y: (rl[LM.LEFT_ANKLE].y + rl[LM.RIGHT_ANKLE].y) / 2 }),
    dist(rl[LM.RIGHT_WRIST], { x: (rl[LM.LEFT_ANKLE].x + rl[LM.RIGHT_ANKLE].x) / 2, y: (rl[LM.LEFT_ANKLE].y + rl[LM.RIGHT_ANKLE].y) / 2 })
  );
  const releaseHeight = bodyHeight > 0 ? Math.round((wristHeight / bodyHeight) * 100) : 80;

  // Action type: side-on vs front-on based on shoulder alignment
  const shoulderAngleToCamera = Math.abs(rl[LM.LEFT_SHOULDER].x - rl[LM.RIGHT_SHOULDER].x);
  const hipAngleToCamera = Math.abs(rl[LM.LEFT_HIP].x - rl[LM.RIGHT_HIP].x);
  let actionType: 'side-on' | 'front-on' | 'mixed' = 'front-on';
  if (shoulderAngleToCamera < 0.08) actionType = 'side-on';
  else if (shoulderAngleToCamera > 0.15) actionType = 'front-on';
  else actionType = 'mixed';

  // Speed estimation from arm angular velocity
  const armVelocities: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].landmarks;
    const curr = frames[i].landmarks;
    if (prev.length < 33 || curr.length < 33) continue;
    const dt = (frames[i].timestamp - frames[i - 1].timestamp) / 1000;
    if (dt === 0) continue;
    const armDist = dist(
      { x: curr[LM.RIGHT_WRIST].x, y: curr[LM.RIGHT_WRIST].y },
      { x: prev[LM.RIGHT_WRIST].x, y: prev[LM.RIGHT_WRIST].y }
    );
    armVelocities.push(armDist / dt);
  }
  const maxArmVelocity = armVelocities.length > 0 ? Math.max(...armVelocities) : 0;
  // Map arm velocity to ball speed (rough empirical mapping)
  const estimatedSpeed = Math.round(Math.min(160, Math.max(80, maxArmVelocity * 50 + 90)));

  // Seam angle from wrist orientation at release
  const wristAngle = Math.atan2(
    rl[LM.RIGHT_WRIST].y - rl[LM.RIGHT_ELBOW].y,
    rl[LM.RIGHT_WRIST].x - rl[LM.RIGHT_ELBOW].x
  ) * (180 / Math.PI);
  const seamAngle = Math.round(Math.abs(wristAngle));

  // Injury risk flags
  const backAngle = angle(rl[LM.LEFT_SHOULDER], rl[LM.LEFT_HIP], rl[LM.LEFT_KNEE]);
  const frontKnee = angle(rl[LM.LEFT_HIP], rl[LM.LEFT_KNEE], rl[LM.LEFT_ANKLE]);
  const shoulderLoad = angle(rl[LM.RIGHT_ELBOW], rl[LM.RIGHT_SHOULDER], rl[LM.RIGHT_HIP]);

  const injuryRisk = {
    backHyperextension: backAngle > 170,
    kneeStress: frontKnee < 130,
    shoulderLoad: shoulderLoad > 160,
  };

  // Run-up rhythm: consistency of stride length in approach
  const strideLengths: number[] = [];
  for (let i = 2; i < frames.length; i++) {
    const curr = frames[i].landmarks;
    const prev = frames[i - 2].landmarks;
    if (curr.length < 33 || prev.length < 33) continue;
    strideLengths.push(dist(curr[LM.LEFT_ANKLE], prev[LM.LEFT_ANKLE]));
  }
  const avgStride = strideLengths.length > 0 ? strideLengths.reduce((a, b) => a + b, 0) / strideLengths.length : 0;
  const strideVariance = strideLengths.length > 0
    ? strideLengths.reduce((sum, s) => sum + (s - avgStride) ** 2, 0) / strideLengths.length
    : 0;
  const runUpRhythm = Math.round(Math.max(0, 100 - strideVariance * 10000));

  return { releaseHeight, actionType, estimatedSpeed, seamAngle, injuryRisk, runUpRhythm };
}

const BOWLING_PRO_PROFILES: Record<string, number[]> = {
  'Jasprit Bumrah': [95, 2, 145, 75, 88],
  'Pat Cummins': [90, 1, 140, 80, 85],
  'Shaheen Afridi': [92, 0, 148, 70, 82],
  'Kagiso Rabada': [88, 1, 142, 78, 80],
  'Mitchell Starc': [93, 2, 150, 65, 78],
  'Trent Boult': [85, 0, 138, 85, 90],
  'Rashid Khan': [80, 1, 95, 90, 92],
  'Ravindra Jadeja': [78, 0, 88, 85, 95],
};

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

export function matchBowlingProPlayers(metrics: BowlingMetrics): ProMatch[] {
  const actionVal = metrics.actionType === 'side-on' ? 0 : metrics.actionType === 'front-on' ? 2 : 1;
  const userVector = [metrics.releaseHeight, actionVal, metrics.estimatedSpeed, metrics.seamAngle, metrics.runUpRhythm];

  return Object.entries(BOWLING_PRO_PROFILES)
    .map(([name, profile]) => ({
      name,
      similarity: Math.round(cosineSimilarity(userVector, profile) * 100),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

export function diagnoseBowlingWeakness(metrics: BowlingMetrics): WeaknessDiagnosis {
  if (metrics.injuryRisk.backHyperextension) {
    return {
      symptom: 'Back hyperextension at delivery',
      mechanism: 'Your lower back arches excessively during the delivery stride',
      consequence: 'High risk of lumbar stress fractures — the most common fast bowling injury',
      cricketXDrill: 'bowling-action-safety',
    };
  }
  if (metrics.actionType === 'mixed') {
    return {
      symptom: 'Mixed bowling action',
      mechanism: 'Shoulders and hips are misaligned — front-on hips with side-on shoulders',
      consequence: 'Increases trunk rotation stress and injury risk. Also makes it harder to maintain consistent seam position',
      cricketXDrill: 'action-alignment',
    };
  }
  if (metrics.releaseHeight < 80) {
    return {
      symptom: 'Low release point',
      mechanism: `Releasing at ${metrics.releaseHeight}% of body height — below optimal`,
      consequence: 'Less bounce and carry, easier for batters to play off the front foot',
      cricketXDrill: 'release-height',
    };
  }
  if (metrics.runUpRhythm < 60) {
    return {
      symptom: 'Inconsistent run-up rhythm',
      mechanism: 'Stride lengths varying significantly through the approach',
      consequence: 'Leads to no-balls, loss of pace, and poor crease position at delivery',
      cricketXDrill: 'run-up-rhythm',
    };
  }
  return {
    symptom: 'Solid bowling action',
    mechanism: 'Key biomechanical parameters within optimal ranges',
    consequence: 'Focus on maintaining consistency and varying your lengths',
    cricketXDrill: 'match-bowling',
  };
}

export function classifyBowlingArchetype(metrics: BowlingMetrics): Archetype {
  if (metrics.estimatedSpeed > 140) return 'The Express';
  if (metrics.seamAngle > 80 && metrics.estimatedSpeed < 100) return 'The Wizard';
  if (metrics.runUpRhythm > 85 && metrics.actionType === 'side-on') return 'The Metronome';
  if (metrics.estimatedSpeed > 130 && metrics.injuryRisk.shoulderLoad) return 'The Enforcer';
  return 'The Maverick';
}

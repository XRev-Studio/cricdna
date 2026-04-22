import type { PoseFrame, BattingMetrics, DetectedEvent, CricketEvent, WeaknessDiagnosis, Archetype, ProMatch } from '../types';

// MediaPipe Pose landmark indices
const LM = {
  NOSE: 0, LEFT_EYE: 1, RIGHT_EYE: 2, LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_TOE: 31, RIGHT_TOE: 32,
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

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function detectHandedness(frames: PoseFrame[]): boolean {
  // Left-handed if left wrist is generally further from body center on the bat-side
  let leftCount = 0;
  let total = 0;
  for (const frame of frames) {
    const lm = frame.landmarks;
    if (lm.length < 33) continue;
    const mid = midpoint(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]);
    const leftWristDist = lm[LM.LEFT_WRIST].x - mid.x;
    const rightWristDist = lm[LM.RIGHT_WRIST].x - mid.x;
    // Left-handed batters have their right hand higher on the bat (closer to blade)
    if (Math.abs(leftWristDist) < Math.abs(rightWristDist)) leftCount++;
    total++;
  }
  return total > 0 && leftCount / total > 0.6;
}

export function detectBattingEvents(frames: PoseFrame[]): DetectedEvent[] {
  if (frames.length < 5) return [];
  const events: DetectedEvent[] = [];

  // Calculate wrist velocity for each frame to detect swing phases
  const wristVelocities: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].landmarks;
    const curr = frames[i].landmarks;
    if (prev.length < 33 || curr.length < 33) { wristVelocities.push(0); continue; }
    const dt = (frames[i].timestamp - frames[i - 1].timestamp) / 1000;
    if (dt === 0) { wristVelocities.push(0); continue; }
    const wristDist = dist(
      { x: curr[LM.LEFT_WRIST].x, y: curr[LM.LEFT_WRIST].y },
      { x: prev[LM.LEFT_WRIST].x, y: prev[LM.LEFT_WRIST].y }
    );
    wristVelocities.push(wristDist / dt);
  }
  wristVelocities.unshift(0);

  // Smooth velocities
  const smoothed = wristVelocities.map((_, i) => {
    const window = 3;
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(wristVelocities.length - 1, i + window); j++) {
      sum += wristVelocities[j]; count++;
    }
    return sum / count;
  });

  // Find stance (first low-velocity period)
  const avgVel = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
  let stanceIdx = 0;
  for (let i = 0; i < Math.min(smoothed.length, Math.floor(frames.length * 0.3)); i++) {
    if (smoothed[i] < avgVel * 0.5) { stanceIdx = i; break; }
  }
  events.push({ type: 'stance', frameIndex: stanceIdx, timestamp: frames[stanceIdx].timestamp, confidence: 0.8 });

  // Find backlift peak (highest wrist Y before max velocity)
  const maxVelIdx = smoothed.indexOf(Math.max(...smoothed));
  let backliftIdx = stanceIdx;
  let highestWrist = Infinity;
  for (let i = stanceIdx; i < maxVelIdx && i < frames.length; i++) {
    const lm = frames[i].landmarks;
    if (lm.length < 33) continue;
    const wristY = Math.min(lm[LM.LEFT_WRIST].y, lm[LM.RIGHT_WRIST].y);
    if (wristY < highestWrist) {
      highestWrist = wristY;
      backliftIdx = i;
    }
  }
  if (backliftIdx > stanceIdx) {
    events.push({ type: 'backlift_peak', frameIndex: backliftIdx, timestamp: frames[backliftIdx].timestamp, confidence: 0.75 });
  }

  // Trigger is between stance and backlift
  const triggerIdx = Math.floor((stanceIdx + backliftIdx) / 2);
  if (triggerIdx !== stanceIdx) {
    events.push({ type: 'trigger', frameIndex: triggerIdx, timestamp: frames[triggerIdx].timestamp, confidence: 0.65 });
  }

  // Downswing start
  if (backliftIdx < maxVelIdx) {
    const downswingIdx = backliftIdx + 1;
    events.push({ type: 'downswing', frameIndex: downswingIdx, timestamp: frames[downswingIdx].timestamp, confidence: 0.7 });
  }

  // Contact is at or near peak velocity
  const contactIdx = Math.min(maxVelIdx, frames.length - 1);
  events.push({ type: 'contact', frameIndex: contactIdx, timestamp: frames[contactIdx].timestamp, confidence: 0.8 });

  // Follow-through is after contact
  const followIdx = Math.min(contactIdx + Math.floor(frames.length * 0.15), frames.length - 1);
  events.push({ type: 'follow_through', frameIndex: followIdx, timestamp: frames[followIdx].timestamp, confidence: 0.7 });

  return events.sort((a, b) => a.frameIndex - b.frameIndex);
}

export function computeBattingMetrics(frames: PoseFrame[], events: DetectedEvent[]): BattingMetrics {
  const stanceEvent = events.find(e => e.type === 'stance');
  const backliftEvent = events.find(e => e.type === 'backlift_peak');
  const contactEvent = events.find(e => e.type === 'contact');
  const followEvent = events.find(e => e.type === 'follow_through');

  const stanceFrame = stanceEvent ? frames[stanceEvent.frameIndex] : frames[0];
  const backliftFrame = backliftEvent ? frames[backliftEvent.frameIndex] : frames[Math.floor(frames.length * 0.3)];
  const contactFrame = contactEvent ? frames[contactEvent.frameIndex] : frames[Math.floor(frames.length * 0.7)];
  const followFrame = followEvent ? frames[followEvent.frameIndex] : frames[frames.length - 1];

  const sl = stanceFrame.landmarks;
  const bl = backliftFrame.landmarks;
  const cl = contactFrame.landmarks;
  const fl = followFrame.landmarks;

  // Stance width: normalized ankle-to-ankle distance relative to hip width
  const hipWidth = dist(sl[LM.LEFT_HIP], sl[LM.RIGHT_HIP]);
  const ankleWidth = dist(sl[LM.LEFT_ANKLE], sl[LM.RIGHT_ANKLE]);
  const stanceWidth = hipWidth > 0 ? Math.round((ankleWidth / hipWidth) * 100) / 100 : 1.0;

  // Backlift angle: angle of wrist relative to shoulder-hip line
  const backliftAngle = Math.round(angle(bl[LM.LEFT_WRIST], bl[LM.LEFT_SHOULDER], bl[LM.LEFT_HIP]));

  // Head position at contact: lateral offset of nose from mid-hip
  const midHip = midpoint(cl[LM.LEFT_HIP], cl[LM.RIGHT_HIP]);
  const headOffset = cl[LM.NOSE].x - midHip.x;
  const headPosition = Math.round(headOffset * 1000) / 10;

  // Front knee angle at contact
  const frontKneeAngle = Math.round(angle(cl[LM.LEFT_HIP], cl[LM.LEFT_KNEE], cl[LM.LEFT_ANKLE]));

  // Bat swing plane: angle of wrist trajectory through the swing
  const swingAngle = Math.atan2(
    cl[LM.LEFT_WRIST].y - bl[LM.LEFT_WRIST].y,
    cl[LM.LEFT_WRIST].x - bl[LM.LEFT_WRIST].x
  ) * (180 / Math.PI);
  const batSwingPlane = Math.round(Math.abs(swingAngle));

  // Follow-through extension: wrist height relative to shoulder
  const shoulderY = fl[LM.LEFT_SHOULDER].y;
  const wristY = Math.min(fl[LM.LEFT_WRIST].y, fl[LM.RIGHT_WRIST].y);
  const followThroughExtension = Math.round((shoulderY - wristY) * 100);

  return { stanceWidth, backliftAngle, headPosition, frontKneeAngle, batSwingPlane, followThroughExtension };
}

// Reference profiles for pro-player matching
const PRO_PROFILES: Record<string, number[]> = {
  'Virat Kohli': [1.3, 135, 2, 155, 45, 30],
  'Joe Root': [1.1, 120, 1, 160, 40, 25],
  'Steve Smith': [1.4, 150, -5, 145, 55, 35],
  'Kane Williamson': [1.2, 125, 0, 158, 38, 28],
  'Babar Azam': [1.15, 128, 1.5, 162, 42, 27],
  'Rohit Sharma': [1.35, 140, 3, 150, 50, 32],
  'Ben Stokes': [1.3, 145, -2, 148, 48, 33],
  'David Warner': [1.25, 130, 2.5, 152, 46, 30],
};

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

export function matchProPlayers(metrics: BattingMetrics): ProMatch[] {
  const userVector = [
    metrics.stanceWidth, metrics.backliftAngle, metrics.headPosition,
    metrics.frontKneeAngle, metrics.batSwingPlane, metrics.followThroughExtension,
  ];

  const matches: ProMatch[] = Object.entries(PRO_PROFILES).map(([name, profile]) => ({
    name,
    similarity: Math.round(cosineSimilarity(userVector, profile) * 100),
  }));

  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
}

export function diagnoseBattingWeakness(metrics: BattingMetrics): WeaknessDiagnosis {
  // Rule-based weakness detection
  if (Math.abs(metrics.headPosition) > 5) {
    return {
      symptom: `Head falling ${metrics.headPosition > 0 ? 'off-side' : 'leg-side'}`,
      mechanism: `Your front shoulder drops ${Math.abs(Math.round(metrics.headPosition))}° toward the ${metrics.headPosition > 0 ? 'off' : 'leg'} side at contact`,
      consequence: `Makes you vulnerable to ${metrics.headPosition > 0 ? 'outswingers' : 'inswingers'} and limits your scoring zone`,
      cricketXDrill: 'head-position-drill',
    };
  }

  if (metrics.frontKneeAngle < 140) {
    return {
      symptom: 'Collapsing front leg',
      mechanism: `Front knee bending to ${metrics.frontKneeAngle}° at impact instead of bracing around 160°`,
      consequence: 'Power leaks through the bent knee — drives lack penetration and lofted shots balloon',
      cricketXDrill: 'front-foot-drive',
    };
  }

  if (metrics.backliftAngle > 145) {
    return {
      symptom: 'Over-extended backlift',
      mechanism: `Bat reaching ${metrics.backliftAngle}° behind the body — beyond the efficient power zone`,
      consequence: 'Late on fast bowling and vulnerable to the yorker. Timing window shrinks significantly',
      cricketXDrill: 'backlift-timing',
    };
  }

  if (metrics.stanceWidth > 1.5) {
    return {
      symptom: 'Too wide a stance',
      mechanism: `Feet spread ${Math.round(metrics.stanceWidth * 100)}% of hip width — limiting lateral movement`,
      consequence: 'Hard to get to wide deliveries and vulnerable to good-length bowling outside off',
      cricketXDrill: 'footwork-basics',
    };
  }

  if (metrics.followThroughExtension < 10) {
    return {
      symptom: 'Checked follow-through',
      mechanism: 'Bat decelerating through contact — not committing fully to the shot',
      consequence: 'Edges carry to slips and drives lack power. Half-committed shots are the number one source of dismissals',
      cricketXDrill: 'shot-commitment',
    };
  }

  return {
    symptom: 'Solid technique detected',
    mechanism: 'All key metrics within optimal ranges',
    consequence: 'Focus on consistency and shot selection under pressure',
    cricketXDrill: 'match-scenarios',
  };
}

export function classifyBattingArchetype(metrics: BattingMetrics): Archetype {
  if (metrics.backliftAngle > 140 && metrics.batSwingPlane > 50) return 'The Destroyer';
  if (metrics.stanceWidth < 1.1 && Math.abs(metrics.headPosition) < 2) return 'The Wall';
  if (metrics.followThroughExtension > 30 && metrics.batSwingPlane > 45) return 'The Dasher';
  if (metrics.frontKneeAngle > 160 && Math.abs(metrics.headPosition) < 3) return 'The Surgeon';
  if (metrics.stanceWidth > 1.3 && metrics.backliftAngle < 130) return 'The Accumulator';
  if (metrics.batSwingPlane < 35 && metrics.followThroughExtension > 20) return 'The Anchor';
  return 'The Improviser';
}

export function computeConfidence(frames: PoseFrame[]): number {
  if (frames.length === 0) return 0;
  let totalVis = 0;
  let count = 0;
  const keyLandmarks = [LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.LEFT_WRIST, LM.RIGHT_WRIST];

  for (const frame of frames) {
    for (const idx of keyLandmarks) {
      if (frame.landmarks[idx]) {
        totalVis += frame.landmarks[idx].visibility;
        count++;
      }
    }
  }

  return count > 0 ? Math.round((totalVis / count) * 100) / 100 : 0;
}

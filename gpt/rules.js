// Independently expressed numerical rules observed in recovered DOKDO 1.4.2.
// No Unity runtime or original C# implementation is required.
export const RESOURCES = [
  "coin",
  "fish",
  "wood",
  "iron",
  "silver",
  "gold",
  "diamond",
];
export const RESOURCE_KO = [
  "동전",
  "물고기",
  "목재",
  "철",
  "은",
  "금",
  "다이아몬드",
];
export const UPGRADE_KO = {
  body: "선체",
  sail: "돛",
  steering: "키",
  cannon: "대포",
  fishing: "낚시",
};
export const emptyResources = () => Array(7).fill(0);
export const maxUpgradeLevel = (type, bodyLevel) =>
  type === "body" ? 10 : bodyLevel * 5;
export function upgradeCost(type, level) {
  const p = emptyResources(),
    next = level + 1;
  if (type === "body") {
    if (level < 5) p[0] = (level < 3 ? 100 : 300) * next * (next + 1);
    else p[5] = 10 * (level - 4) ** 2;
    p[2] = 20 * level ** 2 + 10 * (level - 1);
  } else if (type === "sail") {
    if (level < 20) p[0] = 10 * next;
    else if (level < 40) p[4] = 3 * (level - 19);
    else p[5] = level < 49 ? 5 * (level - 38) : 100;
    p[level < 10 ? 1 : 3] = level < 10 ? 5 * level : 3 * (level - 9);
  } else if (type === "steering") {
    if (level < 20) p[1] = p[2] = next;
    else {
      p[3] = level < 49 ? level - 19 : 100;
      if (level < 40) p[4] = level - 19;
      else if (level < 49) p[5] = level - 29;
      else p[6] = 5;
    }
  } else if (type === "cannon") {
    if (level < 10) {
      p[0] = 10 * next;
      p[2] = next;
    } else {
      p[level < 30 ? 3 : 5] = level - (level < 30 ? 9 : 29);
      p[level < 45 ? 4 : 6] = level - (level < 45 ? 9 : 44);
    }
  } else if (type === "fishing") {
    p[1] = Math.trunc(
      Math.fround(
        Math.fround(4 * next) + Math.fround(next * next * Math.fround(0.3)),
      ),
    );
    if (level < 20) p[2] = next;
    else if (level < 30) p[0] = 2000 * (level - 19) ** 2;
    else if (level < 40) p[0] = 5000 * (level - 22);
    else p[0] = 5000 + 10000 * (level - 31);
  } else
    throw new Error(
      `Unknown upgrade ${type}; storage has no implemented cost in original.`,
    );
  return p;
}
export function shipStats({
  body = 1,
  sail = 1,
  steering = 1,
  cannon = 1,
  nessy = 0,
  seagulls = [0, 0],
} = {}) {
  const hp = Math.trunc(
    (30 + 50 * (body - 1) + 10 * body ** 2) * (1 + nessy * 0.02),
  );
  return {
    hp,
    attack: 5 + 2 * cannon,
    motorForce: 500 + 25 * (body + sail),
    steerForce: 300 + 70 * (body + steering),
    mass: 500 + 100 * body,
    angularDrag: 4,
    portHeal: Math.trunc(hp / (30 * body)),
    portHealSeconds: 2,
    seagullHeal: Math.trunc(hp * seagulls.reduce((a, b) => a + b, 0) * 0.003),
    seagullHealSeconds: 30,
    cannonReloadSeconds: 2.8,
    cannonInitialDelaySeconds: 0.5,
    cannonFireDelaySeconds: 0.1,
    cannonSightHalfAngle: 50,
    cannonAimHalfAngle: 40,
  };
}
// Catch depletion grows by .01 BEFORE each catch; resetting at any port clears it.
export function fishCatch(level, previousDepletion = 0, random = Math.random) {
  const depletion = previousDepletion + 0.01;
  return {
    count: Math.max(
      1,
      Math.ceil((3 + 1.2 * level) * (1 - depletion) * (0.8 + 0.4 * random())),
    ),
    depletion,
  };
}
export const MARKET_BUY = [
  [6, 36, 110, 480, 2100, 20000],
  [5, 44, 128, 480, 2400, 22000],
  [5, 40, 120, 410, 2400, 24000],
  [5, 40, 105, 440, 2400, 24000],
  [4, 40, 120, 480, 2200, 26000],
  [4, 46, 120, 410, 2100, 24000],
];
export const MARKET_STOCK = [
  [200, 100, 35, 20, 5, 1],
  [100, 140, 40, 20, 10, 2],
  [100, 150, 35, 15, 10, 2],
  [100, 150, 25, 15, 11, 3],
  [90, 150, 35, 13, 10, 3],
  [90, 120, 35, 10, 5, 3],
];
export const MARKET_RESET_SECONDS = 600;
export const MARKET_AD_RESET_COOLDOWN = 300;
export function islandTier(index) {
  const bounds = [3, 8, 13, 16, 20, 27, 30, 35, 38, 42, 45, 47];
  const range = bounds.findIndex((x) => index <= x);
  return range < 0 ? 6 : range % 6;
}
export function marketQuote(islandIndex, resourceIndex) {
  const tier = islandTier(islandIndex),
    buy = MARKET_BUY[tier]?.[resourceIndex - 1];
  if (buy === undefined) return null;
  return {
    buy,
    sell: Math.trunc(buy * 0.9),
    originalDisplayedSell: Math.trunc(buy * 0.8),
  };
}
export const companionPurchase = {
  assistant: [100000, 500000, 1000000],
  seagull: [500000, 1000000],
  nessy: [5000000],
  pickup: [5000000],
};
export const companionUpgradeCost = (level) => 10000 * (level + 1);
export const COMPANION_MAX_LEVEL = 50;
export function companionStats(level) {
  const body = Math.min(10, Math.max(1, Math.trunc(level * 0.2) + 1));
  return {
    body,
    sail: level,
    steering: level,
    cannon: level,
    attack: Math.trunc((5 + 2 * level) * 0.5),
    motorForce: 500 + 25 * level,
    steerForce: (300 + 70 * level) * 0.5,
    mass: (500 + 100 * body) * 0.5,
    angularDrag: 4,
  };
}
export const arenaReward = (kills, world = "dokdo") =>
  kills <= 0
    ? 0
    : (20 * kills * (kills - 2) + 50) * (world === "dokdo" ? 1 : 2);
export const arenaWave = (wave, world = "dokdo") => ({
  count: 7,
  tier: world === "dokdo" ? Math.min(6, wave) : 6,
  delay: 2,
});
export const guardCount = (tier, world = "dokdo") =>
  world === "dokdo" ? [3, 3, 4, 4, 5, 5, 6][tier] : 10;
export function islandReward(index) {
  const t = islandTier(index),
    reward = emptyResources();
  reward[0] = 2500 * t + 300 * t * t;
  if (t < 6) reward[3 + Math.trunc(t / 2)] = t % 2 ? 20 : 10;
  return reward;
}
export function enemyStats(
  tier,
  { world = "dokdo", pirate = false, random = Math.random } = {},
) {
  const ranges = [
      [1, 2],
      [2, 4],
      [2, 5],
      [3, 6],
      [5, 8],
      [6, 10],
      [10, 11],
    ],
    [low, high] = ranges[tier];
  const body =
    world === "dokdo"
      ? low + Math.floor(random() * (high - low))
      : Math.min(10, 5 + tier);
  return {
    body,
    sail: body * 5,
    steering: body * 5,
    cannon: body * 2,
    hp: Math.trunc(
      (30 + 50 * (body - 1) + 10 * body * body) * (world === "dokdo" ? 1 : 1.5),
    ),
    attack: 5 + 4 * body,
    motorForce: 500 + 125 * body * (pirate ? 3 : 1),
    steerForce: 300 + 350 * body,
    mass: 500 + 100 * body,
    angularDrag: 4,
  };
}
export function enemyLootCrate(body, random = Math.random) {
  const p = emptyResources(),
    q = 100 * body + 50 * body * body;
  const values = [
    Math.ceil(0.3 * q),
    0,
    Math.ceil(0.006 * q),
    Math.ceil(0.003 * q),
    2 * body,
    body,
    1,
  ];
  const chances = [1, 0, 0.9, 0.5, 0.02 * body, 0.01 * body, 0.001 * body];
  for (let i = 0; i < 7; i++)
    if (chances[i] && random() < chances[i])
      p[i] = values[i] + Math.trunc(values[i] * 0.2 * random());
  return p;
}
// Original re-rolls the bound on EACH loop test. Result P(2)=1/3,P(3)=4/9,P(4)=2/9.
export function enemyLootCrateCount(random = Math.random) {
  if (random() < 1 / 3) return 2;
  return random() < 2 / 3 ? 3 : 4;
}
export const revivalCost = (body) => 5000 * body;
export const reviveHp = (maxHp, full = false) =>
  full ? maxHp : Math.trunc(maxHp * 0.3);
export const freeCoinReward = (body) => 250 * body;
export const adCrateReward = (body) => 500 * body;
export const offlineHeal = (portHeal, elapsedSeconds) =>
  Math.trunc(
    portHeal * Math.min(600, Math.max(0, Math.trunc(elapsedSeconds))) * 0.5,
  );
export const FISHING_ANIMATION_SECONDS = 9.683333;
export const ENEMY_BROADSIDE_SECONDS = 3;
export function pirateSpawnTier(distance, world = "dokdo") {
  const t =
    distance < 300
      ? 0
      : distance < 400
        ? 1
        : distance < 600
          ? 2
          : distance < 800
            ? 3
            : distance < 900
              ? 4
              : 5;
  return world === "dokdo" ? t : Math.min(4, t);
}
export const pirateSpawnDelay = (count) => 5 + 5 * count;
export const WORLD_ISLAND_GUARD_RADII = {
  fog: 150,
  spawn: 80,
  despawn: 120,
  fishing: 40,
};
export const freshState = () => ({
  resources: [500, 0, 0, 0, 0, 0, 0],
  levels: { body: 1, sail: 1, steering: 1, cannon: 1, fishing: 1 },
  hp: 40,
  assistants: [0, 0, 0],
  seagulls: [0, 0],
  nessy: 0,
  pickup: false,
  revivals: 3,
  ownedIslands: [0, 28],
  lastIsland: 0,
  targetIsland: 1,
});

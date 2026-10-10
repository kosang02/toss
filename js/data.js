// 게임 규칙과 수치. 원작 분석 결과(replica/original-system.md)를 따른다.
import { WORLD } from './world.js';

export const SAVE_KEY = 'dokdo-replica-save-v2';
export const K = WORLD.K;                 // 원작 단위 -> 웹판 단위
export const G = 9.81 * K;                // 포탄 중력
export const MAP_R = 2000 * K;            // 넘어가면 반대편으로
export const DT = 0.02;                   // 고정 물리 간격 (원작 FixedUpdate)

// 자원: 0 코인, 1 물고기, 2 목재, 3 철, 4 은, 5 금, 6 다이아
export const RES = [
  { id: 'coins',   name: '코인' },
  { id: 'fish',    name: '물고기' },
  { id: 'wood',    name: '목재' },
  { id: 'iron',    name: '철' },
  { id: 'silver',  name: '은' },
  { id: 'gold',    name: '금' },
  { id: 'diamond', name: '다이아' },
];
export const GOODS = RES.slice(1);

export const ISLANDS = WORLD.islands;
export const DOKDO = { x: WORLD.dokdo[0], z: WORLD.dokdo[1] };
export const ARENAS = WORLD.arena.map(([x, z]) => ({ x, z }));
export const KRAKENS = WORLD.kraken.map(([x, z]) => ({ x, z }));
export const ISLAND_R = 13 * K;           // 섬 충돌 반경
export const ENGAGE_R = 80 * K;           // 방어 함대 출동
export const RESET_R = 120 * K;           // 함대 초기화
export const FISH_R = 40 * K;             // 낚시 가능
export const FOG_R = 150 * K;

export const FACTIONS = [
  { name: '초록', color: '#22bb44', ground: 0x5cb848 },
  { name: '파랑', color: '#00ccff', ground: 0x4fb06a },
  { name: '사막', color: '#aa7722', ground: 0xd9c27a },
  { name: '얼음', color: '#bbffff', ground: 0xe8f2f7 },
  { name: '핑크', color: '#ff88ff', ground: 0x7cc46a },
];
export const PLAYER_MAP_COLOR = '#961a1a';

export function islandTier(i) {
  return ISLANDS[i]?.tier ?? 0;
}

// ---------- 내 배 ----------
export const BODY_MAX = 10;
export const LV_MAX = 50;
export const TURRETS = [2, 2, 4, 4, 6, 6, 8, 8, 10, 12];
// 선체별 크기(원작 충돌체 기준, 원작 단위)
export const HULL = [
  [4.6, 1.5], [5.45, 1.62], [5.87, 1.65], [5.82, 2.0], [6.28, 2.41],
  [6.6, 2.5], [6.77, 2.58], [7.68, 2.98], [7.69, 3.46], [8.87, 3.23],
];
// 돛 레벨별 돛대 구성 [3번, 2번, 1번(주), 4번] 변형 번호 (0이면 없음)
export const SAIL_SET = [[0,0,1,0],[0,0,2,0],[0,0,3,0],[0,0,4,0],[0,0,5,0],[0,0,6,0],[0,0,7,0],[0,0,8,0],[0,0,9,0],[0,0,10,0],[0,0,11,0],[0,0,12,0],[0,0,13,0],[0,0,14,0],[0,0,15,0],[0,1,15,0],[0,2,15,0],[0,3,15,0],[0,4,15,0],[0,5,15,0],[0,5,16,0],[0,5,17,0],[0,5,18,0],[0,5,19,0],[0,5,20,0],[1,5,20,0],[2,5,20,0],[3,5,20,0],[4,5,20,0],[5,5,20,0],[5,6,20,0],[5,7,20,0],[5,8,20,0],[5,9,20,0],[5,10,20,0],[5,10,20,1],[5,10,20,2],[5,10,20,3],[5,10,20,4],[5,10,20,5],[5,10,21,5],[5,10,22,5],[5,10,23,5],[5,10,24,5],[5,10,25,5],[0,0,0,0],[0,0,26,0],[6,0,26,0],[6,11,26,0],[6,11,26,6]];

export function maxHp(body, nessy = 0) {
  return Math.floor((30 + (body - 1) * 50 + 10 * body * body) * (1 + nessy * 0.02));
}
export const atk = cannon => 5 + 2 * cannon;
export const motorForce = (body, sail) => 500 + (body + sail) * 25;
export const steerForce = (body, steer) => 300 + (body + steer) * 70;
export const shipMass = body => 500 + body * 100;
export const healPoint = (hp, body) => Math.floor(hp / (30 * body));

// 강화 비용 [코인, 물고기, 목재, 철, 은, 금, 다이아]
export function upgradeCost(type, L) {
  const a = [0, 0, 0, 0, 0, 0, 0];
  switch (type) {
    case 'body':
      if (L <= 4) a[0] = (L <= 2 ? 100 : 300) * (L + 1 + (L + 1) * (L + 1));
      else a[5] = (L - 4) * (L - 4) * 10;
      a[2] = 20 * L * L + 10 * (L - 1);
      break;
    case 'sail':
      if (L <= 19) a[0] = 10 * (L + 1);
      else if (L <= 39) a[4] = 3 * (L - 19);
      else if (L <= 48) a[5] = 5 * (L - 38);
      else a[5] = 100;
      if (L <= 9) a[1] = 5 * L; else a[3] = 3 * (L - 9);
      break;
    case 'steer':
      if (L <= 19) { a[1] = L + 1; a[2] = L + 1; break; }
      if (L <= 48) a[3] = L - 19; else a[3] = 100;
      if (L <= 39) a[4] = L - 19; else if (L <= 48) a[5] = L - 29; else a[6] = 5;
      break;
    case 'cannon':
      if (L <= 9) { a[0] = 10 * (L + 1); a[2] = L + 1; break; }
      if (L <= 29) a[3] = L - 9; else a[5] = L - 29;
      if (L <= 44) a[4] = L - 9; else a[6] = L - 44;
      break;
    case 'fish':
      a[1] = Math.floor(4 * (L + 1) + (L + 1) * (L + 1) * 0.3);
      if (L <= 19) a[2] = L + 1;
      else if (L <= 29) a[0] = 2000 * (L - 19) * (L - 19);
      else if (L <= 39) a[0] = 5000 * (L - 22);
      else a[0] = 5000 + 10000 * (L - 31);
      break;
  }
  return a;
}
export const UPGRADES = [
  { id: 'body',   name: '선체', stat: '체력' },
  { id: 'sail',   name: '돛',   stat: '속도' },
  { id: 'steer',  name: '선회', stat: '회전' },
  { id: 'cannon', name: '대포', stat: '공격력' },
  { id: 'fish',   name: '낚시', stat: '어획량' },
];
export function maxLevelOf(type, body) {
  return type === 'body' ? BODY_MAX : Math.min(LV_MAX, body * 5);
}

// ---------- 적 ----------
export function enemyLevelForTier(tier, world) {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a)); // Unity Random.Range(int,int)
  if (world === 0) {
    switch (tier) {
      case 0: return 1;
      case 1: return r(2, 4);
      case 2: return r(2, 5);
      case 3: return r(3, 6);
      case 4: return r(5, 8);
      case 5: return r(6, 10);
      default: return 10;
    }
  }
  return [5, 6, 7, 8, 9, 10, 10][Math.min(6, tier)];
}
export function enemyStats(lv, pirate, world) {
  const lvSail = lv * 5, lvHead = lv * 5, lvCannon = lv * 2;
  return {
    hp: Math.floor((world === 1 ? 1.5 : 1) * (30 + (lv - 1) * 50 + 10 * lv * lv)),
    atk: 5 + lvCannon * 2,
    mass: 500 + lv * 100,
    motor: pirate ? 500 + lvSail * 25 * 3 : 500 + lvSail * 25,
    steer: 300 + lvHead * 70,
    lvSail, lvHead,
  };
}
export const DEFENDERS = [3, 3, 4, 4, 5, 5, 6];
// 원점 거리로 해적 레벨 등급
export function pirateTier(dist, world) {
  const d = dist / K;
  let n = d < 300 ? 0 : d < 400 ? 1 : d < 600 ? 2 : d < 800 ? 3 : d < 900 ? 4 : 5;
  if (world === 1 && n >= 5) n = 4;
  return n;
}
export function seaTier(dist) {
  const d = dist / K;
  return d < 300 ? 1 : d < 600 ? 2 : d < 900 ? 3 : d < 1200 ? 4 : d < 1500 ? 5 : d < 1800 ? 6 : 7;
}

// 격침 보상 (상자 하나)
export function rollLoot(lv) {
  const base = lv * 100 + 50 * lv * lv;
  const bump = v => v + Math.floor(v * Math.random() * 0.2);
  const r = [0, 0, 0, 0, 0, 0, 0];
  r[0] = bump(Math.ceil(0.3 * base));
  if (Math.random() < 0.9) r[2] = bump(Math.ceil(0.006 * base));
  if (Math.random() < 0.5) r[3] = bump(Math.ceil(0.003 * base));
  if (Math.random() < 0.02 * lv) r[4] = bump(lv * 2);
  if (Math.random() < 0.01 * lv) r[5] = bump(lv);
  if (Math.random() < 0.001 * lv) r[6] = 1;
  return r;
}
export function captureReward(tier) {
  const r = [tier * 2500 + 300 * tier * tier, 0, 0, 0, 0, 0, 0];
  const extra = [[3, 10], [3, 20], [4, 10], [4, 20], [5, 10], [5, 20]][tier];
  if (extra) r[extra[0]] = extra[1];
  return r;
}

// ---------- 시장 ----------
export const MARKET_PRICE = [
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
export const SELL_RATE = 0.9;
export const MARKET_RESET = 600;

// ---------- 조수 ----------
export const ASSIST_SHIP_COST = [100000, 500000, 1000000];
export const SEAGULL_COST = [500000, 1000000];
export const NESSY_COST = 5000000;
export const PICKUP_COST = 5000000;
export const ASSIST_MAX = 50;
export const assistUpgradeCost = lv => 10000 * (lv + 1);

export const DAILY = [
  { res: 2, n: 30 }, { revival: 1 }, { res: 3, n: 100 }, { revival: 3 }, { res: 4, n: 50 },
  { revival: 5 }, { res: 5, n: 20 }, { revival: 8 }, { res: 6, n: 5 }, { revival: 15 },
];

export const arenaReward = kills => (kills <= 0 ? 0 : kills * (kills - 2) * 20 + 50);

export function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  return n.toLocaleString('en-US');
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

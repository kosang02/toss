// 게임 데이터와 밸런스 수치. 원작 수치는 공개된 것이 없어 직접 조정한 값이다.

export const SAVE_KEY = 'dokdo-replica-save-v1';
export const MAX_LEVEL = 40;
export const OCEAN_HALF = 1150;          // 바다 하나의 반지름(정사각형 반 변)
export const MARKET_PERIOD_MS = 10 * 60 * 1000;

// 교역품 6종. 기본 가격은 원작 시장 화면을 참고했다.
export const GOODS = [
  { id: 'fish',   name: '물고기', base: 5,     stock: 100 },
  { id: 'wood',   name: '목재',   base: 44,    stock: 140 },
  { id: 'ore',    name: '광석',   base: 128,   stock: 40 },
  { id: 'silver', name: '은괴',   base: 480,   stock: 20 },
  { id: 'gold',   name: '금괴',   base: 2400,  stock: 10 },
  { id: 'gem',    name: '보석',   base: 22000, stock: 2 },
];
export const GOOD_IDS = GOODS.map(g => g.id);

// 배 강화 5종. 선체 레벨이 나머지의 상한이다.
export const UPGRADES = [
  { id: 'body',   name: '선체', desc: '최대 체력 · 적재량 · 다른 강화의 상한', base: 60 },
  { id: 'sail',   name: '돛',   desc: '최고 속도',                            base: 40 },
  { id: 'steer',  name: '조타', desc: '회전 속도',                            base: 30 },
  { id: 'cannon', name: '대포', desc: '공격력 · 사거리 · 장전 · 포문 수',       base: 50 },
  { id: 'fish',   name: '낚시', desc: '어획량 · 희귀 어획',                    base: 25 },
];

export function upgradeCost(track, lvl) {
  // lvl: 현재 레벨 (lvl -> lvl+1 비용)
  const u = UPGRADES.find(x => x.id === track);
  const cost = { coins: Math.round(u.base * Math.pow(1.21, lvl)) };
  const light = track === 'cannon' || track === 'fish';
  if (lvl >= 1) cost.wood = Math.ceil(lvl * (light ? 0.4 : 0.6));
  if (lvl >= 6)  cost.ore = Math.ceil((lvl - 5) * (light ? 0.35 : 0.5));
  if (lvl >= 14) cost.silver = Math.ceil((lvl - 13) * 0.4);
  if (lvl >= 22) cost.gold = Math.ceil((lvl - 21) * 0.3);
  if (lvl >= 30) cost.gem = 1 + Math.floor((lvl - 30) / 4);
  return cost;
}

// 플레이어 능력치
export function playerStats(lv, assistants) {
  const nessy = assistants.nessy || 0;
  const dolphin = assistants.dolphin || 0;
  return {
    maxHp: Math.round(100 * Math.pow(1.13, lv.body) * (1 + 0.06 * nessy)),
    cargo: 30 + lv.body * 12,
    speed: (13 + lv.sail * 0.75) * (1 + 0.02 * dolphin),
    turn: 1.3 + lv.steer * 0.07,
    dmg: 8 * Math.pow(1.13, lv.cannon),
    range: 58 + lv.cannon * 1.1,
    reload: Math.max(0.7, 2.2 * Math.pow(0.97, lv.cannon)),
    guns: Math.min(6, 1 + Math.floor(lv.cannon / 5)),
    fishTime: Math.max(1.2, 3.2 - lv.fish * 0.05),
    fishAmount: 2 + lv.fish * 1.2,
    magnet: 14 + dolphin * 5,
  };
}

// 섬 티어가 기대하는 플레이어 레벨
export const expectedLevel = t => 1 + t * 2.2;

// 적 함선 종류. hpShots: 기대 레벨 플레이어의 포탄 몇 발에 침몰하는지, dmgPct: 기대 레벨 플레이어 체력 대비 한 발 피해
export const ENEMY_TYPES = {
  boat:    { name: '해적 보트',   hpShots: 3,   dmgPct: 0.035, speed: 15, range: 50, reload: 2.6, guns: 1, masts: 1, scale: 0.75, hull: 0x8a5a32, sail: 0x1d1d22, trim: 0x6b4423, loot: 1 },
  sloop:   { name: '슬루프',      hpShots: 5,   dmgPct: 0.05,  speed: 14, range: 58, reload: 2.4, guns: 1, masts: 1, scale: 1.0, hull: 0x7a4e2b, sail: 0x1d1d22, trim: 0xd9b23a, loot: 2 },
  brig:    { name: '브리건틴',    hpShots: 8,   dmgPct: 0.055,  speed: 13, range: 64, reload: 2.4, guns: 2, masts: 2, scale: 1.2, hull: 0x6e4526, sail: 0xd8d2c4, trim: 0xd9b23a, loot: 3.5 },
  frigate: { name: '프리깃',      hpShots: 12,  dmgPct: 0.06,   speed: 12, range: 70, reload: 2.3, guns: 3, masts: 3, scale: 1.45, hull: 0x5b3a22, sail: 0xbfb8a8, trim: 0xe0b53c, loot: 6 },
  dragon:  { name: '용머리 전함', hpShots: 22,  dmgPct: 0.065, speed: 10, range: 78, reload: 2.2, guns: 4, masts: 3, scale: 2.0, hull: 0x3a2f5c, sail: 0x1d1d22, trim: 0xf2c230, loot: 14, dragon: true },
  kraken:  { name: '크라켄',      hpShots: 120, dmgPct: 0.09,  speed: 0,  range: 110, reload: 3.2, guns: 1, scale: 1, loot: 80, boss: true },
};

// 섬 방어 함대는 여러 척이 동시에 쏘므로 한 척의 피해는 낮게 잡는다
export const ENEMY_DMG = 0.5;

export function enemyStats(typeId, tier) {
  const t = ENEMY_TYPES[typeId];
  const le = expectedLevel(tier);
  const pDmg = 8 * Math.pow(1.13, le);
  const pHp = 100 * Math.pow(1.13, le);
  return {
    hp: Math.round(pDmg * t.hpShots),
    dmg: pHp * t.dmgPct * ENEMY_DMG,
    loot: Math.round(9 * Math.pow(1.2, le) * t.loot),
  };
}

export function fleetForTier(t, count) {
  const pools = [
    ['boat', 'boat', 'sloop'], ['boat', 'sloop', 'sloop'], ['sloop', 'sloop', 'brig'], ['sloop', 'brig', 'brig'],
    ['brig', 'brig', 'frigate'], ['brig', 'brig', 'frigate'], ['brig', 'frigate', 'frigate'], ['frigate', 'frigate', 'dragon'],
  ];
  const pool = pools[Math.min(pools.length - 1, t % 8)];
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[i % pool.length]);
  return out;
}

// 섬 목록. 좌표: x 동쪽, z 남쪽(+). 북쪽이 위.
export const OCEANS = [
  {
    id: 0, name: '태평양', arena: { x: 680, z: 640 },
    islands: [
      { id: 'p0', name: '출항의 섬',   x: 0,    z: 820,  r: 70, tier: 0, deco: 'village', home: true },
      { id: 'p1', name: '갈매기 섬',   x: -330, z: 560,  r: 55, tier: 1, deco: 'palms' },
      { id: 'p2', name: '고양이 바위', x: 300,  z: 410,  r: 62, tier: 2, deco: 'cat' },
      { id: 'p3', name: '흑백 섬',     x: -440, z: 150,  r: 80, tier: 3, deco: 'chess' },
      { id: 'p4', name: '야자수 섬',   x: 380,  z: -60,  r: 60, tier: 4, deco: 'flower' },
      { id: 'p5', name: '등대 섬',     x: -230, z: -320, r: 58, tier: 5, deco: 'lighthouse' },
      { id: 'p6', name: '해골 섬',     x: 450,  z: -470, r: 66, tier: 6, deco: 'skull' },
      { id: 'p7', name: '화산 섬',     x: -20,  z: -780, r: 85, tier: 7, deco: 'volcano' },
    ],
  },
  {
    id: 1, name: '대서양', arena: { x: -700, z: 620 },
    islands: [
      { id: 'a0', name: '대서양 항구', x: 0,    z: 820,  r: 75, tier: 8,  deco: 'village', home: true },
      { id: 'a1', name: '풍차 섬',     x: 360,  z: 540,  r: 60, tier: 9,  deco: 'windmill' },
      { id: 'a2', name: '얼음 섬',     x: -380, z: 380,  r: 66, tier: 10, deco: 'ice' },
      { id: 'a3', name: '석상 섬',     x: 420,  z: 120,  r: 64, tier: 11, deco: 'moai' },
      { id: 'a4', name: '붉은 꽃 섬',  x: -420, z: -110, r: 60, tier: 12, deco: 'flower' },
      { id: 'a5', name: '고래 섬',     x: 380,  z: -320, r: 70, tier: 13, deco: 'whale' },
      { id: 'a6', name: '폭풍 섬',     x: -330, z: -560, r: 66, tier: 14, deco: 'skull' },
      { id: 'a7', name: '독도',        x: 60,   z: -830, r: 90, tier: 16, deco: 'dokdo', final: true },
    ],
  },
];

export const ASSISTANTS = [
  { id: 'escort',  name: '호위선', desc: '배를 따라다니며 가까운 적에게 포를 쏩니다.', base: 500 },
  { id: 'seagull', name: '갈매기', desc: '전투 중이 아닐 때 체력을 천천히 회복합니다.', base: 300 },
  { id: 'nessy',   name: '네시',   desc: '최대 체력을 레벨당 6% 올립니다.', base: 800 },
  { id: 'dolphin', name: '돌고래', desc: '전리품을 끌어당기고 속도를 조금 올립니다.', base: 400 },
];
export const ASSISTANT_MAX = 10;
export function assistantCost(id, lvl) {
  const a = ASSISTANTS.find(x => x.id === id);
  const cost = { coins: Math.round(a.base * Math.pow(2.0, lvl)) };
  if (lvl >= 3) cost.ore = lvl * 2;
  if (lvl >= 5) cost.silver = lvl - 3;
  if (lvl >= 7) cost.gold = lvl - 5;
  if (lvl >= 9) cost.gem = 1;
  return cost;
}

// 섬 시장에서 파는 품목: 티어가 높을수록 비싼 물건이 들어온다
export function goodsForTier(t) {
  if (t <= 1) return ['fish', 'wood', 'ore'];
  if (t <= 3) return ['fish', 'wood', 'ore', 'silver'];
  if (t <= 6) return ['fish', 'wood', 'ore', 'silver', 'gold'];
  return GOOD_IDS;
}

// 결정적 난수
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

export function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  return n.toLocaleString('en-US');
}

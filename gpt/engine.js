import * as R from "./rules.js";
import { WORLD } from "./world.js";
export { R, WORLD };
export const TAU = Math.PI * 2,
  clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const landRadius = (a) =>
  Math.max(
    3,
    Math.min((a.radius || 24) * 0.63, distance(a.port, a.landCenter || a) - 3),
  );
export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const KO = {
  body: "선체",
  sail: "돛",
  steering: "선회",
  cannon: "대포",
  fishing: "낚시",
};
export function initialState(now = Date.now()) {
  const s = R.freshState();
  const p = WORLD.islands[0].port;
  return {
    ...s,
    version: 2,
    world: 0,
    x: p.x,
    z: p.z,
    heading: 0,
    docked: 0,
    kills: {},
    flag: 0,
    sound: true,
    started: false,
    savedAt: now,
    marketTime: now,
    marketStock: {},
    fishDepletion: 0,
    arenaBest: 0,
    visitedDokdo: false,
    statistics: { kills: 0, catches: 0, distance: 0 },
    daily: null,
  };
}
export function validateState(input) {
  if (!input || input.version !== 2)
    throw Error("이 게임의 저장 파일이 아닙니다.");
  const s = JSON.parse(JSON.stringify(input));
  if (
    !Array.isArray(s.resources) ||
    s.resources.length !== 7 ||
    s.resources.some((n) => !Number.isFinite(n) || n < 0 || n > 1e12)
  )
    throw Error("자원 정보가 올바르지 않습니다.");
  for (const k of Object.keys(KO)) {
    const l = s.levels?.[k];
    if (
      !Number.isInteger(l) ||
      l < 1 ||
      l > (k === "body" ? 10 : s.levels.body * 5)
    )
      throw Error("강화 단계가 올바르지 않습니다.");
  }
  if (
    ![0, 1].includes(s.world) ||
    !Number.isFinite(s.x) ||
    !Number.isFinite(s.z) ||
    Math.abs(s.x) > 20000 ||
    Math.abs(s.z) > 20000 ||
    !Number.isFinite(s.hp) ||
    !Number.isFinite(s.heading)
  )
    throw Error("항해 위치가 올바르지 않습니다.");
  if (
    !Array.isArray(s.ownedIslands) ||
    s.ownedIslands.some((n) => !Number.isInteger(n) || n < 0 || n >= 47) ||
    !s.ownedIslands.includes(0) ||
    !s.ownedIslands.includes(28)
  )
    throw Error("섬 정보가 올바르지 않습니다.");
  s.ownedIslands = [...new Set(s.ownedIslands)];
  if (
    !s.ownedIslands.includes(s.lastIsland) ||
    WORLD.islands[s.lastIsland].world !== s.world
  )
    throw Error("마지막 항구가 올바르지 않습니다.");
  if (
    s.docked !== -1 &&
    (!s.ownedIslands.includes(s.docked) ||
      WORLD.islands[s.docked].world !== s.world)
  )
    throw Error("정박 위치가 올바르지 않습니다.");
  for (const k of ["assistants", "seagulls"])
    if (
      !Array.isArray(s[k]) ||
      s[k].length !== (k === "assistants" ? 3 : 2) ||
      s[k].some((n) => !Number.isInteger(n) || n < 0 || n > 50)
    )
      throw Error("조수 정보가 올바르지 않습니다.");
  if (
    !Number.isInteger(s.nessy) ||
    s.nessy < 0 ||
    s.nessy > 50 ||
    !Number.isInteger(s.revivals) ||
    s.revivals < 0 ||
    s.revivals > 1e6
  )
    throw Error("부활 정보가 올바르지 않습니다.");
  s.kills = Object.fromEntries(
    WORLD.islands.map((a) => [
      a.id,
      clamp(Math.floor(Number(s.kills?.[a.id]) || 0), 0, a.enemyCount),
    ]),
  );
  s.savedAt = Number.isFinite(s.savedAt) ? s.savedAt : Date.now();
  s.marketTime = Number.isFinite(s.marketTime) ? s.marketTime : Date.now();
  s.fishDepletion = clamp(Number(s.fishDepletion) || 0, 0, 1000);
  s.flag = clamp(Math.floor(s.flag || 0), 0, 7);
  s.marketStock =
    s.marketStock && typeof s.marketStock === "object" ? s.marketStock : {};
  for (const [id, row] of Object.entries(s.marketStock))
    if (
      !WORLD.islands[id] ||
      !Array.isArray(row) ||
      row.length !== 6 ||
      row.some((n) => !Number.isInteger(n) || n < 0 || n > 10000)
    )
      throw Error("시장 정보가 올바르지 않습니다.");
  s.arenaBest = clamp(Math.floor(Number(s.arenaBest) || 0), 0, 1e9);
  s.pickup = !!s.pickup;
  s.sound = !!s.sound;
  s.visitedDokdo = !!s.visitedDokdo;
  s.statistics = s.statistics || { kills: 0, catches: 0, distance: 0 };
  for (const k of ["kills", "catches", "distance"])
    s.statistics[k] = clamp(Number(s.statistics[k]) || 0, 0, 1e12);
  return s;
}
export class Game {
  constructor(
    saved = null,
    { random = Math.random, now = () => Date.now() } = {},
  ) {
    this.now = now;
    this.random = random;
    this.state = saved ? validateState(saved) : initialState(now());
    this.events = [];
    this.enemies = [];
    this.bullets = [];
    this.loot = [];
    this.effects = [];
    this.time = 0;
    this.velocity = 0;
    this.steering = 0;
    this.input = null;
    this.target = null;
    this.waypoint = null;
    this.dead = false;
    this.paused = false;
    this.fishTimer = 0;
    this.healTimer = 0;
    this.fireTimer = 0;
    this.cannonSide = 1;
    this.undockTimer = 0;
    this.spawnTimer = 0;
    this.pirateTimer = 10;
    this.itemTimer = 4;
    this.krakenTimer = 0;
    this.arena = null;
    this.nextId = 1;
    this.spawnedHomes = new Set();
    this.lastMessage = "";
    this.state.hp = clamp(this.state.hp, 0, this.stats.hp);
    if (this.state.hp <= 0) this.returnToPort();
    this.offline();
  }
  get stats() {
    return R.shipStats({
      ...this.state.levels,
      nessy: this.state.nessy,
      seagulls: this.state.seagulls,
    });
  }
  get islands() {
    return WORLD.islands.filter((a) => a.world === this.state.world);
  }
  get port() {
    return this.state.docked >= 0 ? WORLD.islands[this.state.docked] : null;
  }
  get owned() {
    return this.state.ownedIslands;
  }
  emit(type, text = "", extra = {}) {
    this.events.push({ type, text, ...extra });
    if (this.events.length > 80) this.events.shift();
  }
  message(text) {
    this.emit("message", text);
  }
  resources(delta) {
    delta.forEach((n, i) => {
      this.state.resources[i] = Math.max(0, this.state.resources[i] + n);
    });
    this.emit("change");
  }
  canAfford(cost) {
    return cost.every((n, i) => this.state.resources[i] >= n);
  }
  upgrade(type) {
    if (!this.port) return this.fail("선착장에서 업그레이드할 수 있습니다.");
    const l = this.state.levels[type];
    if (l >= R.maxUpgradeLevel(type, this.state.levels.body))
      return this.fail(
        type === "body" ? "최대 단계입니다." : "선체를 먼저 업그레이드하세요.",
      );
    const c = R.upgradeCost(type, l);
    if (!this.canAfford(c)) return this.fail("업그레이드 재료가 부족합니다.");
    this.resources(c.map((n) => -n));
    this.state.levels[type]++;
    this.emit("upgrade", `${KO[type]} ${l + 1}단계`, { part: type });
    this.emit("save");
    return true;
  }
  fail(text) {
    this.message(text);
    return false;
  }
  stock(island = this.state.docked) {
    if (island < 0) return null;
    const s = this.state;
    if (this.now() - s.marketTime >= R.MARKET_RESET_SECONDS * 1000) {
      s.marketStock = {};
      s.marketTime = this.now();
    }
    if (!s.marketStock[island])
      s.marketStock[island] = [...R.MARKET_STOCK[R.islandTier(island)]];
    return s.marketStock[island];
  }
  trade(resource, buy, count = 1) {
    if (
      !this.port ||
      !Number.isInteger(resource) ||
      resource < 1 ||
      resource > 6
    )
      return false;
    const q = R.marketQuote(this.state.docked, resource);
    if (!Number.isInteger(count) || count < 1) return false;
    const s = this.state,
      r = s.resources,
      stock = this.stock();
    const n = Math.min(
      count,
      buy ? Math.floor(r[0] / q.buy) : Math.floor(r[resource]),
      buy ? stock[resource - 1] : Infinity,
    );
    if (n < 1)
      return this.fail(
        buy ? "동전이나 시장 재고가 부족합니다." : "판매할 자원이 없습니다.",
      );
    r[0] += buy ? -n * q.buy : n * q.sell;
    r[resource] += buy ? n : -n;
    if (buy) stock[resource - 1] -= n;
    this.emit(
      "trade",
      `${R.RESOURCE_KO[resource]} ${n}개 ${buy ? "구매" : "판매"}`,
    );
    this.emit("save");
    return n;
  }
  companion(kind, index) {
    if (!this.port) return false;
    const s = this.state;
    let level =
      kind === "assistant"
        ? s.assistants[index]
        : kind === "seagull"
          ? s.seagulls[index]
          : kind === "nessy"
            ? s.nessy
            : s.pickup
              ? 1
              : 0;
    if (level >= 50 || (kind === "pickup" && level)) return false;
    const price = level
      ? R.companionUpgradeCost(level)
      : R.companionPurchase[kind]?.[index || 0];
    if (!Number.isFinite(price) || s.resources[0] < price)
      return this.fail("동전이 부족합니다.");
    s.resources[0] -= price;
    if (kind === "assistant") s.assistants[index]++;
    else if (kind === "seagull") s.seagulls[index]++;
    else if (kind === "nessy") s.nessy++;
    else s.pickup = true;
    this.emit("upgrade", "조수와 함께 항해합니다.");
    this.emit("save");
    return true;
  }
  depart() {
    if (!this.port) return;
    const a = this.port;
    this.state.x = a.port.x;
    this.state.z = a.port.z;
    this.state.heading = Number.isFinite(a.port.heading)
      ? a.port.heading
      : Math.atan2(
          a.port.x - (a.landCenter?.x ?? a.x),
          a.port.z - (a.landCenter?.z ?? a.z - 30),
        );
    this.state.x += Math.sin(this.state.heading) * 10;
    this.state.z += Math.cos(this.state.heading) * 10;
    this.state.docked = -1;
    this.undockTimer = 6;
    this.state.fishDepletion = 0;
    this.velocity = 0;
    this.target = null;
    this.emit("depart");
    this.emit("save");
  }
  dock(id) {
    const a = WORLD.islands[id];
    if (
      !a ||
      !this.owned.includes(id) ||
      a.world !== this.state.world ||
      distance(this.state, a.port) > 25 ||
      this.arena
    )
      return false;
    this.resetGuards();
    this.state.docked = id;
    this.state.lastIsland = id;
    this.state.x = a.port.x;
    this.state.z = a.port.z;
    this.state.fishDepletion = 0;
    this.state.heading = a.port.heading || 0;
    this.velocity = 0;
    this.target = null;
    this.input = null;
    this.fishTimer = 0;
    this.emit("dock", `${a.ko || a.name}에 정박했습니다.`);
    this.emit("save");
    return true;
  }
  setTarget(id) {
    const a = WORLD.islands[id];
    if (!a || a.world !== this.state.world) return false;
    if (this.port) this.depart();
    this.state.targetIsland = id;
    this.target = { ...a.port };
    this.waypoint = null;
    this.emit("target", `${a.ko || a.name} 방향으로 항해합니다.`);
    return true;
  }
  stop() {
    this.input = null;
    this.target = null;
    this.waypoint = null;
  }
  changeWorld() {
    if (!this.port) return this.fail("선착장에 정박한 뒤 바다를 이동하세요.");
    this.resetGuards();
    this.state.world = 1 - this.state.world;
    const id = this.state.world === 0 ? 0 : 28,
      p = WORLD.islands[id].port;
    this.state.lastIsland = id;
    this.state.docked = id;
    this.state.x = p.x;
    this.state.z = p.z;
    this.state.targetIsland = id + 1;
    this.enemies = [];
    this.bullets = [];
    this.loot = [];
    this.effects = [];
    this.stop();
    this.emit("world", this.state.world === 0 ? "독도 해역" : "피사 해역");
    this.emit("save");
    return true;
  }
  nearest() {
    let found = null,
      d = Infinity;
    for (const a of this.islands) {
      const n = distance(this.state, a.port);
      if (n < d) {
        found = a;
        d = n;
      }
    }
    return { island: found, distance: d };
  }
  offline() {
    const seconds = clamp((this.now() - this.state.savedAt) / 1000, 0, 14400);
    if (seconds < 60) return;
    const near = this.nearest();
    if (
      near.distance < 100 &&
      this.owned.includes(near.island.id) &&
      this.state.docked < 0
    ) {
      let fish = 0,
        depletion = this.state.fishDepletion;
      for (let t = 0; t < Math.floor(seconds / 9.683333); t++) {
        const n = R.fishCatch(this.state.levels.fishing, depletion, () => 0.5);
        fish += n.count;
        depletion = n.depletion;
      }
      this.state.fishDepletion = depletion;
      this.state.resources[1] += fish;
      this.message(
        `항해를 쉬는 동안 물고기 ${fish.toLocaleString()}마리를 모았습니다.`,
      );
    }
    if (this.port)
      this.state.hp = Math.min(
        this.stats.hp,
        this.state.hp + Math.floor(seconds / 2) * this.stats.portHeal,
      );
    this.state.savedAt = this.now();
  }
  snapshot() {
    this.state.savedAt = this.now();
    return JSON.parse(JSON.stringify(this.state));
  }
  startArena() {
    if (this.port) this.depart();
    this.resetGuards();
    this.arena = {
      wave: 0,
      kills: 0,
      next: 2,
      active: false,
      returnPos: { x: this.state.x, z: this.state.z },
      reward: 0,
    };
    this.enemies = [];
    this.bullets = [];
    this.stop();
    this.emit("arena", "아레나에 입장했습니다.");
  }
  finishArena() {
    if (!this.arena) return;
    const a = this.arena,
      reward = R.arenaReward(a.kills, this.state.world ? "italy" : "dokdo");
    this.state.resources[0] += reward;
    this.state.arenaBest = Math.max(this.state.arenaBest, a.kills);
    this.state.x = a.returnPos.x;
    this.state.z = a.returnPos.z;
    this.enemies = [];
    this.bullets = [];
    this.arena = null;
    this.emit(
      "arenaEnd",
      `${a.kills}척 격파 · 동전 ${reward.toLocaleString()} 획득`,
    );
    this.emit("save");
  }
  returnToPort() {
    if (this.arena) this.finishArena();
    this.resetGuards();
    const p = WORLD.islands[this.state.lastIsland].port;
    this.state.x = p.x;
    this.state.z = p.z;
    this.state.hp = this.stats.hp;
    this.state.docked = this.state.lastIsland;
    this.dead = false;
    this.stop();
    this.velocity = 0;
    this.bullets = [];
    this.emit("dock", "마지막 선착장으로 돌아왔습니다.");
    this.emit("save");
  }
  revive(ticket = false) {
    if (!this.dead) return false;
    const s = this.state,
      price = R.revivalCost(s.levels.body);
    if (ticket) {
      if (s.revivals < 1) return false;
      s.revivals--;
    } else {
      if (s.resources[0] < price)
        return this.fail("부활에 필요한 동전이 부족합니다.");
      s.resources[0] -= price;
    }
    s.hp = this.stats.hp;
    this.dead = false;
    this.bullets = [];
    this.undockTimer = 5;
    this.emit("revive", "현재 위치에서 부활했습니다.");
    this.emit("save");
    return true;
  }
  spawnEnemy(home, index, stats, arena = false, pirate = false) {
    const a = home >= 0 ? WORLD.islands[home] : this.state,
      ang = this.random() * TAU,
      rad = arena ? 45 : pirate ? 80 : 45 + this.random() * 18;
    this.enemies.push({
      id: this.nextId++,
      home,
      index,
      arena,
      pirate,
      x: a.x + Math.sin(ang) * rad,
      z: a.z + Math.cos(ang) * rad,
      heading: ang + Math.PI / 2,
      angle: ang,
      hp: stats.hp,
      maxHp: stats.hp,
      stats,
      cooldown: 0.5 + this.random() * 2,
      dead: false,
    });
  }
  resetGuards() {
    this.enemies = this.enemies.filter((e) => e.home < 0);
    this.spawnedHomes.clear();
    for (const a of this.islands)
      if (!this.owned.includes(a.id)) this.state.kills[a.id] = 0;
  }
  maintainEnemies() {
    const s = this.state;
    if (this.arena) return;
    for (const a of this.islands) {
      if (this.owned.includes(a.id)) continue;
      const d = distance(s, a.port);
      if (d > 120 && this.spawnedHomes.has(a.id)) {
        this.enemies = this.enemies.filter((e) => e.home !== a.id);
        this.spawnedHomes.delete(a.id);
        s.kills[a.id] = 0;
      }
      if (d > 80 || this.spawnedHomes.has(a.id)) continue;
      this.spawnedHomes.add(a.id);
      s.kills[a.id] = 0;
      for (let i = 0; i < a.enemyCount; i++) {
        const stat = R.enemyStats(a.tier, {
          world: s.world ? "italy" : "dokdo",
          random: this.random,
        });
        this.spawnEnemy(a.id, i, stat);
      }
    }
    this.enemies = this.enemies.filter(
      (e) => e.home >= 0 || e.arena || distance(s, e) < 330,
    );
  }

  fire(from, to, enemy, damage, side = 0) {
    const dx = to.x - from.x,
      dz = to.z - from.z,
      d = Math.hypot(dx, dz) || 1;
    this.bullets.push({
      id: this.nextId++,
      x: from.x,
      z: from.z,
      vx: (dx / d) * 58,
      vz: (dz / d) * 58,
      y: 2.8,
      life: 1.3,
      age: 0,
      enemy,
      damage,
    });
    this.effects.push({
      type: "muzzle",
      id: this.nextId++,
      x: from.x,
      z: from.z,
      life: 0.16,
    });
    this.emit("shot", "", { enemy });
  }
  defeat(enemy) {
    enemy.dead = true;
    this.state.statistics.kills++;
    if (enemy.arena) {
      if (this.arena) this.arena.kills++;
    } else if (enemy.home >= 0) {
      this.state.kills[enemy.home] = (this.state.kills[enemy.home] || 0) + 1;
    }
    const crates = R.enemyLootCrateCount(this.random);
    for (let i = 0; i < crates; i++) {
      const content = R.enemyLootCrate(enemy.stats.body, this.random);
      this.loot.push({
        id: this.nextId++,
        x: enemy.x + (this.random() - 0.5) * 7,
        z: enemy.z + (this.random() - 0.5) * 7,
        resources: content,
        life: 300,
      });
    }
    this.effects.push({
      id: this.nextId++,
      type: "explosion",
      x: enemy.x,
      z: enemy.z,
      life: 1.8,
    });
    this.emit("defeat");
  }
  capture(a) {
    if (this.owned.includes(a.id)) return;
    this.state.ownedIslands.push(a.id);
    const reward = R.islandReward(a.id);
    this.resources(reward);
    this.emit("capture", `${a.ko || a.name} 점령 성공`, {
      island: a.id,
      reward,
    });
    this.emit("save");
  }
  tick(dt) {
    if (this.paused || !this.state.started) return;
    dt = clamp(dt, 0, 0.1);
    this.time += dt;
    this.undockTimer = Math.max(0, this.undockTimer - dt);
    if (this.dead) return;
    const s = this.state,
      stats = this.stats;
    if (this.port) {
      this.fishing = false;
      this.healTimer += dt;
      if (this.healTimer >= 2) {
        this.healTimer -= 2;
        s.hp = Math.min(stats.hp, s.hp + Math.max(1, stats.portHeal));
      }
      this.velocity = 0;
      return;
    }
    let wanted = null,
      power = 0;
    if (this.input) {
      wanted = this.input.heading;
      power = clamp(this.input.power, 0, 1);
    } else if (this.target) {
      if (distance(s, this.target) < 6) {
        this.target = null;
        this.waypoint = null;
      } else {
        if (this.waypoint && distance(s, this.waypoint) < 8)
          this.waypoint = null;
        if (!this.waypoint) {
          const dx = this.target.x - s.x,
            dz = this.target.z - s.z,
            len = Math.hypot(dx, dz),
            ux = dx / len,
            uz = dz / len;
          for (const a of this.islands) {
            const center = a.landCenter || { x: a.x, z: a.z - 30 },
              rad = landRadius(a),
              ax = center.x - s.x,
              az = center.z - s.z,
              along = ax * ux + az * uz,
              cross = ax * uz - az * ux;
            if (
              distance(this.target, a.port) > 1 &&
              along > 0 &&
              along < Math.min(len, 100) &&
              Math.abs(cross) < rad + 8
            ) {
              const sign = cross >= 0 ? -1 : 1;
              this.waypoint = {
                x: center.x + uz * (rad + 20) * sign,
                z: center.z - ux * (rad + 20) * sign,
              };
              break;
            }
          }
        }
        const t = this.waypoint || this.target;
        wanted = Math.atan2(t.x - s.x, t.z - s.z);
        power = 1;
      }
    }
    if (wanted !== null) {
      const turn = clamp((stats.steerForce / stats.mass) * 0.9, 0.5, 4.5) * dt;
      s.heading += clamp(angleDiff(wanted, s.heading), -turn, turn);
    }
    const maxSpeed = (stats.motorForce / stats.mass) * 14;
    this.velocity += (maxSpeed * power - this.velocity) * Math.min(1, dt * 1.4);
    const old = { x: s.x, z: s.z };
    s.x += Math.sin(s.heading) * this.velocity * dt;
    s.z += Math.cos(s.heading) * this.velocity * dt;
    s.statistics.distance += distance(old, s);
    for (const a of this.islands) {
      const c = a.landCenter || { x: a.x, z: a.z - 30 },
        rad = landRadius(a),
        d = distance(s, c);
      if (d < rad && distance(s, a.port) > 10) {
        const angle = Math.atan2(s.x - c.x, s.z - c.z);
        s.x = c.x + Math.sin(angle) * rad;
        s.z = c.z + Math.cos(angle) * rad;
        this.velocity *= 0.85;
      }
    }
    const bounds = s.world ? 4000 : 2500;
    if (Math.hypot(s.x, s.z) > bounds) {
      s.x *= -0.9;
      s.z *= -0.9;
      this.stop();
      this.message("바다의 반대편으로 넘어왔습니다.");
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.maintainEnemies();
      this.spawnTimer = 1;
    }
    const near = this.nearest();
    for (const a of this.islands) {
      if (
        !this.owned.includes(a.id) &&
        (s.kills[a.id] || 0) >= a.enemyCount &&
        distance(s, a.port) < 36
      ) {
        this.capture(a);
      }
    }
    if (
      this.undockTimer <= 0 &&
      near.distance < 9 &&
      this.owned.includes(near.island.id) &&
      !this.arena &&
      (!this.input || this.velocity < 3)
    ) {
      this.dock(near.island.id);
      return;
    }
    this.fireTimer -= dt;
    const targets = this.enemies
      .filter((e) => !e.dead && distance(s, e) < 58)
      .sort((a, b) => distance(s, a) - distance(s, b));
    if (targets.length && this.fireTimer <= 0) {
      const enemy = targets[0],
        angle = Math.atan2(enemy.x - s.x, enemy.z - s.z),
        side = angleDiff(angle, s.heading) > 0 ? 1 : -1;
      if (
        Math.abs(Math.abs(angleDiff(angle, s.heading)) - Math.PI / 2) < 0.91
      ) {
        const cannons = Math.max(
          1,
          Math.min(6, [1, 1, 2, 2, 3, 3, 4, 4, 5, 6][s.levels.body - 1]),
        );
        for (let i = 0; i < cannons; i++)
          this.fire(
            {
              x:
                s.x +
                Math.sin(s.heading + (side * Math.PI) / 2) * 2 +
                Math.sin(s.heading) * (i - cannons / 2) * 1.1,
              z:
                s.z +
                Math.cos(s.heading + (side * Math.PI) / 2) * 2 +
                Math.cos(s.heading) * (i - cannons / 2) * 1.1,
            },
            enemy,
            false,
            stats.attack,
          );
        this.fireTimer = stats.cannonReloadSeconds;
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const home = e.home >= 0 ? WORLD.islands[e.home] : s,
        d = distance(s, e),
        chase = d < 110 && distance(s, home) < 160;
      let goal;
      if (chase) {
        const angle = Math.atan2(e.x - s.x, e.z - s.z) + 0.5;
        goal = { x: s.x + Math.sin(angle) * 29, z: s.z + Math.cos(angle) * 29 };
      } else {
        e.angle += dt * 0.12;
        goal = {
          x: home.x + Math.sin(e.angle) * 50,
          z: home.z + Math.cos(e.angle) * 50,
        };
      }
      const want = Math.atan2(goal.x - e.x, goal.z - e.z);
      e.heading += clamp(angleDiff(want, e.heading), -dt * 1.2, dt * 1.2);
      const speed = (e.stats.motorForce / e.stats.mass) * 10;
      e.x += Math.sin(e.heading) * speed * dt;
      e.z += Math.cos(e.heading) * speed * dt;
      e.cooldown -= dt;
      if (d < 43 && e.cooldown <= 0) {
        const angle = Math.atan2(s.x - e.x, s.z - e.z);
        if (
          Math.abs(Math.abs(angleDiff(angle, e.heading)) - Math.PI / 2) < 1.05
        ) {
          this.fire(e, s, true, e.stats.attack);
          e.cooldown = 3;
        }
      }
    }
    for (const b of this.bullets) {
      b.age += dt;
      b.life -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y = 2.8 + Math.sin((b.age / 1.3) * Math.PI) * 2.5;
      if (b.enemy) {
        if (distance(b, s) < 3.3) {
          if (this.undockTimer <= 0) s.hp -= b.damage;
          b.life = 0;
          this.emit("hit");
        }
      } else {
        for (const e of this.enemies)
          if (!e.dead && distance(b, e) < 3.8 + e.stats.body * 0.1) {
            e.hp -= b.damage;
            b.life = 0;
            this.effects.push({
              id: this.nextId++,
              type: "splash",
              x: b.x,
              z: b.z,
              life: 0.6,
            });
            if (e.hp <= 0) this.defeat(e);
            break;
          }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => !e.dead);
    for (const l of this.loot) {
      l.life -= dt;
      const d = distance(s, l);
      if (d < (s.pickup ? 100 : 12)) {
        l.x += (s.x - l.x) * Math.min(1, dt * 3);
        l.z += (s.z - l.z) * Math.min(1, dt * 3);
      }
      if (d < 4) {
        this.resources(l.resources);
        l.life = -1;
        this.emit("loot", "보급 상자 획득", { resources: l.resources });
      }
    }
    this.loot = this.loot.filter((l) => l.life > 0);
    this.fishing =
      near.distance < 40 &&
      this.owned.includes(near.island.id) &&
      targets.length === 0 &&
      !this.arena;
    if (this.fishing) {
      this.fishTimer += dt;
      if (this.fishTimer >= 9.683333) {
        this.fishTimer = 0;
        const catchResult = R.fishCatch(
          s.levels.fishing,
          s.fishDepletion,
          this.random,
        );
        s.fishDepletion = catchResult.depletion;
        s.resources[1] += catchResult.count;
        s.statistics.catches += catchResult.count;
        this.emit("fish", `물고기 +${catchResult.count}`, {
          count: catchResult.count,
        });
      }
    } else this.fishTimer = 0;
    this.healTimer += dt;
    if (this.healTimer >= 30) {
      this.healTimer = 0;
      s.hp = Math.min(stats.hp, s.hp + stats.seagullHeal);
    }
    this.companionTimer = (this.companionTimer || 0) - dt;
    if (this.companionTimer <= 0 && targets[0]) {
      this.companionTimer = 3;
      for (let i = 0; i < s.assistants.length; i++)
        if (s.assistants[i]) {
          const st = R.companionStats(s.assistants[i]);
          this.fire(
            { x: s.x - 6 - i * 4, z: s.z + 6 },
            targets[0],
            false,
            st.attack,
          );
        }
    }
    if (!this.arena) {
      this.pirateTimer -= dt;
      const pirateCount = this.enemies.filter((e) => e.pirate).length;
      if (this.pirateTimer <= 0) {
        this.pirateTimer = 30 + pirateCount * 15;
        if (near.distance > 95 && pirateCount < 2) {
          const tier = clamp(Math.floor(Math.hypot(s.x, s.z) / 300), 0, 6);
          this.spawnEnemy(
            -1,
            0,
            R.enemyStats(tier, {
              world: s.world ? "italy" : "dokdo",
              pirate: true,
              random: this.random,
            }),
            false,
            true,
          );
        }
      }
      this.itemTimer -= dt;
      if (this.itemTimer <= 0) {
        this.itemTimer = 25;
        if (this.loot.length < 10) {
          const angle = this.random() * TAU;
          this.loot.push({
            id: this.nextId++,
            x: s.x + Math.sin(angle) * 45,
            z: s.z + Math.cos(angle) * 45,
            resources: [20 + 20 * s.levels.body, 0, 1, 0, 0, 0, 0],
            life: 180,
          });
        }
      }
      this.krakenTimer -= dt;
      const krakens = WORLD.special?.kraken || WORLD.special?.krakens || [];
      if (this.krakenTimer <= 0)
        for (const k of krakens)
          if (k.world === s.world && distance(s, k) < 20) {
            s.hp -= 5000;
            this.krakenTimer = 3;
            this.emit("kraken", "거대 문어에게 공격받았습니다.");
            break;
          }
      const dokdo = WORLD.special?.dokdo?.[0];
      if (
        dokdo &&
        s.world === 0 &&
        distance(s, dokdo) < 90 &&
        !s.visitedDokdo
      ) {
        s.visitedDokdo = true;
        this.emit("dokdo", "독도에 도착했습니다!");
        this.emit("save");
      }
    }
    if (this.arena && this.enemies.length === 0) {
      this.arena.next -= dt;
      if (this.arena.next <= 0) {
        const w = R.arenaWave(this.arena.wave, s.world ? "italy" : "dokdo");
        for (let i = 0; i < w.count; i++)
          this.spawnEnemy(
            -1,
            i,
            R.enemyStats(w.tier, {
              world: s.world ? "italy" : "dokdo",
              random: this.random,
            }),
            true,
          );
        this.arena.wave++;
        this.arena.next = 2;
        this.emit("wave", `아레나 ${this.arena.wave}번째 전투`);
      }
    }
    if (s.hp <= 0) {
      s.hp = 0;
      this.dead = true;
      this.stop();
      this.velocity = 0;
      if (this.arena) this.finishArena();
      this.emit("dead", "배가 파괴되었습니다.");
      this.emit("save");
    }
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter((e) => e.life > 0);
  }
}

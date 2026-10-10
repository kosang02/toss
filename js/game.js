// 게임 본체. 규칙과 수치는 원작 분석(replica/original-system.md)을 따른다.
import * as THREE from './three.module.min.js';
import * as D from './data.js';
import * as M from './models.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';

const K = D.K;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);
const rand = (a, b) => a + Math.random() * (b - a);
const INERTIA = 0.8;                 // 회전 관성 계수 (질량 × 이 값)
export const ISLAND_R = 22 * K;      // 섬 크기
const FIRE_RANGE = 38 * K;           // 내 대포 사거리
const BALL_SPEED = 26 * K;           // 내 포탄 속도
// 선체별 사격 범위 상자 [중심 옆거리, 옆 폭, 앞뒤 길이] (원작 단위)
const ATK_BOX = [[9, 15, 4], [9, 15, 4], [9, 15, 4.92], [10, 15, 5.57], [10, 15, 5.6], [10, 16, 6.6], [10, 16, 6.8], [10.5, 17, 7.41], [10.5, 17, 8.88], [11, 19, 10]];

M.setSailSets(D.SAIL_SET);

// ---------- 파티클 (정사영용) ----------
class Particles {
  constructor(scene, max = 3000) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { scale: { value: 5 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC=color; vA=alpha; gl_PointSize=size*scale; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.25,r)); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(o) {
    if (this.list.length >= this.max) return;
    const c = new THREE.Color(o.color ?? 0xffffff);
    this.list.push({ x: o.x, y: o.y ?? 0.5, z: o.z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, life: o.life ?? 1, max: o.life ?? 1, size: o.size ?? 2, grow: o.grow ?? 0, r: c.r, g: c.g, b: c.b, a: o.alpha ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0 });
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy -= p.grav * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
    }
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size;
      this.alpha[i] = p.a * Math.min(1, p.life / p.max * 1.6);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, L.length);
    for (const k of ['position', 'color', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
  }
}

// ---------- 배 물리 ----------
class Ship {
  constructor(game, o) {
    this.game = game;
    this.x = o.x; this.z = o.z;
    this.vx = 0; this.vz = 0;
    this.heading = o.heading ?? 0;
    this.omega = 0;
    this.v = 0; this.v2 = 0; this.s = 0; this.s0 = 0;
    this.d = 0; this.e = 0;
    this.obj = new THREE.Group();
    game.world.add(this.obj);
  }
  setSpec({ mass, motor, steer, drag, angDrag, len, beam }) {
    Object.assign(this, { mass, motor, steer, drag, angDrag, len, beam });
  }
  setModel(model) {
    while (this.obj.children.length) this.obj.remove(this.obj.children[0]);
    this.model = model;
    M.enableShadows(model, true, false);
    this.obj.add(model);
    this.refl = M.makeReflection(model);
    this.obj.add(this.refl);
  }
  // 원작 FixedUpdate의 힘/토크 적용 방식을 따른다
  physics(dt, vRate) {
    this.v2 = lerp(this.v2, this.v, vRate * dt);
    const torque = this.s * 5;
    this.omega += torque / (this.mass * INERTIA) * dt;
    this.omega *= Math.max(0, 1 - this.angDrag * dt);
    this.omega = clamp(this.omega, -7, 7);
    this.heading = wrap(this.heading - this.omega * dt);
    const a = this.v2 * 10 / this.mass * K;
    this.vx += Math.sin(this.heading) * a * dt;
    this.vz += Math.cos(this.heading) * a * dt;
    const k = Math.max(0, 1 - this.drag * dt);
    this.vx *= k; this.vz *= k;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.d = lerp(this.d, this.s0 * 0.2 * (this.v2 / this.motor), 0.5 * dt);
    this.e = lerp(this.e, -this.v * 0.01, 0.5 * dt);
  }
  // 목표 방향으로 조타량 계산 (원작: s = steerForce × 계수 × 각도차(도))
  steerTo(desired, coef) {
    this.s0 = -wrap(desired - this.heading) / DEG;
    this.s = this.steer * coef * this.s0;
  }
  speed() { return Math.hypot(this.vx, this.vz); }
  render(t) {
    this.obj.position.x = this.x; this.obj.position.z = this.z;
    if (!this.dead) this.obj.position.y = Math.sin(t * 1.6 + this.x * 0.01) * 0.25;
    this.obj.rotation.y = this.heading;
    if (this.model) {
      this.model.rotation.z = clamp(this.d, -10, 10) * DEG * 0.8;
      this.model.rotation.x = clamp(this.e * 0.5, -5, 5) * DEG;
      if (this.refl) { this.refl.rotation.copy(this.model.rotation); this.refl.visible = !this.dead; }
      const sails = this.model.userData.sails;
      if (sails) {
        const wind = 0.75 + Math.min(1, this.speed() / 15) * 0.35;
        for (let i = 0; i < sails.length; i++) sails[i].scale.z = wind + Math.sin(t * 2.4 + i * 0.9 + this.x * 0.01) * 0.12;
      }
      const flag = this.model.userData.flag;
      if (flag) flag.rotation.y = Math.PI / 2 + Math.sin(t * 7 + this.z * 0.02) * 0.35;
      const oars = this.model.userData.oars;
      if (oars) for (const o of oars) o.piv.rotation.y = Math.sin(t * (2 + this.speed() * 0.05) + o.ph) * 0.5 * Math.min(1, this.speed() / 10) * o.side;
    }
  }
  // 로컬 좌표 (lx: 오른쪽 +, lz: 앞 +)
  toLocal(px, pz) {
    const dx = px - this.x, dz = pz - this.z, c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  }
  toWorld(lx, lz) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }
  contains(px, pz, margin = 0) {
    const { lx, lz } = this.toLocal(px, pz);
    return Math.abs(lx) < this.beam / 2 + margin && Math.abs(lz) < this.len / 2 + margin;
  }
  // 사격 범위 상자 안이면 -1(왼쪽) / 1(오른쪽), 아니면 0
  inAtkBox(px, pz, body) {
    const [c, w, l] = ATK_BOX[clamp(body, 1, 10) - 1];
    const { lx, lz } = this.toLocal(px, pz);
    if (Math.abs(lz) > (l / 2 + 3) * K) return 0;
    if (Math.abs(lx - c * K) < (w / 2 + 1.5) * K) return 1;
    if (Math.abs(lx + c * K) < (w / 2 + 1.5) * K) return -1;
    return 0;
  }
  dispose() { this.game.world.remove(this.obj); }
}

// ---------- 게임 ----------
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    let q = 'high';
    try { q = localStorage.getItem('dokdo-quality') || 'high'; } catch (e) { /* */ }
    this.low = q === 'low';
    M.setLowQuality(this.low);
    if (this.low) this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1d6a93);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    this.camSize = 15;
    this.camSizeTarget = 15;

    this.scene.add(new THREE.HemisphereLight(0xe6f4ff, 0x2a5a78, 1.25));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-20, 39.2, 35.4); // 원작: 남쪽 위에서 45도
    sun.castShadow = !this.low;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.6;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 1200;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.makeWater();
    this.particles = new Particles(this.scene);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.sound = new Sound();
    this.ui = new UI(this);

    this.t = 0;
    this.acc = 0;
    this.enemies = [];
    this.bullets = [];
    this.loot = [];
    this.islands = [];
    this.krakens = [];
    this.helpers = [];
    this.near = [];
    this.pending = [];
    this.paused = true;
    this.input = { touch: false, heading: 0, sx: 0, sy: 0, cx: 0, cy: 0, keys: new Set(), lastTap: 0, pinch: null, moved: false };
    this.auto = false;
    this.parked = null;
    this.arena = null;
    this.fishT = 0;
    this.tempFish = 0;
    this.pirateT = 10;
    this.dokdoT = 10;
    this.giftT = 300;
    this.saveT = 0;
    this.hudT = 0;
    this.healT = 0;
    this.seaHealT = 0;
    this.lootQueue = [];
    this.lootQueueT = 0;

    this.bulletGeo = new THREE.SphereGeometry(0.35 * K, 6, 5);
    this.bulletMat = M.mat(0x1b1b1f);
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.load();
    this.buildWorld();
    this.ui.showTitle();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- 저장 ----------
  fresh() {
    return {
      v: 2, res: [500, 0, 0, 0, 0, 0, 0], revival: 3,
      lv: { body: 1, sail: 1, steer: 1, cannon: 1, fish: 1 },
      assist: [0, 0, 0], gulls: [0, 0], nessy: 0, pickup: false,
      done: { 0: true, 28: true }, world: 0, last: 0, lastByWorld: [0, 28], target: 1,
      emblem: -1, hp: 40, tuto: false,
      market: {}, marketReset: Date.now() + D.MARKET_RESET * 1000,
      best: [0, 0], deaths: 0, kills: 0, fished: 0, time: 0,
      day: 0, lastDay: '', lastTime: Date.now(), dokdoVisited: false, italyNotice: false,
    };
  }
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(D.SAVE_KEY) || 'null'); } catch (e) { s = null; }
    const f = this.fresh();
    this.hasSave = !!(s && s.v === 2);
    this.state = this.hasSave ? { ...f, ...s, lv: { ...f.lv, ...s.lv } } : f;
  }
  save() {
    const s = this.state;
    if (this.player) s.hp = Math.max(1, Math.round(this.player.hp));
    s.lastTime = Date.now();
    try { localStorage.setItem(D.SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 저장 불가 */ }
  }
  resetSave() { try { localStorage.removeItem(D.SAVE_KEY); } catch (e) { /* */ } location.reload(); }
  exportSave() { this.save(); return btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); }
  importSave(str) {
    const s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    if (!s || s.v !== 2) throw new Error('bad');
    localStorage.setItem(D.SAVE_KEY, JSON.stringify(s));
    location.reload();
  }

  maxHp() { return D.maxHp(this.state.lv.body, this.state.nessy); }
  seagullHeal() { return Math.floor(this.maxHp() * (this.state.gulls[0] + this.state.gulls[1]) * 0.003); }

  start() {
    this.paused = false;
    this.last = performance.now();
    document.body.classList.remove('intitle');
    this.sound.unlock();
    this.offlineCatchUp();
    this.ui.updateHud(true);
    this.dailyCheck();
  }

  // 꺼둔 동안: 정박 중이면 회복(최대 10분), 5분 넘으면 재접속 보상
  offlineCatchUp() {
    const s = this.state;
    const sec = Math.floor((Date.now() - (s.lastTime || Date.now())) / 1000);
    if (sec > 0 && this.parked != null) {
      const n = Math.min(600, sec);
      this.player.hp = Math.min(this.maxHp(), this.player.hp + D.healPoint(this.maxHp(), s.lv.body) * n * 0.5);
    }
    if (sec > 300 && s.tuto) {
      const min = Math.floor(Math.min(43200, sec) / 60);
      const coins = min * s.lv.fish * 3;
      if (coins > 0) this.pendingReReward = { min, coins };
    }
  }
  dailyCheck() {
    const s = this.state;
    if (!s.tuto) return;
    const today = new Date().toDateString();
    if (s.lastDay !== today) {
      s.day = s.day >= 10 ? 1 : s.day + 1;
      s.lastDay = today;
      this.ui.showDaily(s.day, () => {
        const r = D.DAILY[s.day - 1];
        if (r.revival) s.revival += r.revival; else s.res[r.res] += r.n;
        this.sound.play('fanfare', 0.5);
        this.save();
        this.ui.updateHud(true);
        if (this.pendingReReward) this.showReReward();
      });
    } else if (this.pendingReReward) this.showReReward();
  }
  showReReward() {
    const r = this.pendingReReward;
    this.pendingReReward = null;
    this.ui.showReReward(r, () => { this.addRes(0, r.coins); this.save(); });
  }

  // ---------- 바다 ----------
  makeWater() {
    const size = 3200;
    const noise = M.waterTexture(), caus = M.causticTexture();
    for (const t of [noise, caus]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    this.waterU = { time: { value: 0 }, tNoise: { value: noise }, tCaus: { value: caus }, deep: { value: new THREE.Color(0x14639a) }, shallow: { value: new THREE.Color(0x45b2d8) }, alpha: { value: 0.87 } };
    this.water = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.waterU, transparent: true,
      vertexShader: `varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform sampler2D tNoise; uniform sampler2D tCaus; uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform float alpha; varying vec2 vW;
        void main(){
          vec2 uv = vW / 180.0;
          vec2 d = vec2(sin(uv.y*3.1 + time*0.6), cos(uv.x*2.7 + time*0.5)) * 0.025;
          float n1 = texture2D(tNoise, uv*0.55 + vec2(time*0.010, time*0.006) + d).g;
          float n2 = texture2D(tNoise, uv*1.25 - vec2(time*0.008, -time*0.012) - d).g;
          float c1 = texture2D(tCaus, uv*2.1 + vec2(time*0.030, time*0.020) + d*2.0).a;
          float c2 = texture2D(tCaus, uv*1.6 - vec2(time*0.024, -time*0.016) - d*2.0).a;
          float caus = min(c1, c2) * 1.6 + (c1 + c2) * 0.18;
          vec3 col = mix(deep, shallow, smoothstep(0.42, 0.62, (n1 + n2) * 0.5));
          col += caus * 0.45;
          float glint = pow(max(0.0, sin(vW.x*0.35 + time*2.3) * sin(vW.y*0.31 - time*1.9)), 60.0) * smoothstep(0.5, 0.7, n2);
          col += glint * 0.9;
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.water.renderOrder = 1;
    this.scene.add(this.water);
    // 바다 위 그림자
    this.shadowCatcher = new THREE.Mesh(geo, new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }));
    this.shadowCatcher.position.y = 0.2;
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = 2;
    this.shadowCatcher.visible = !this.low;
    this.scene.add(this.shadowCatcher);
    // 대포 사거리 표시
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(FIRE_RANGE - 1.5, FIRE_RANGE + 1.5, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.5;
    this.rangeRing.renderOrder = 4;
    this.scene.add(this.rangeRing);
    // 구름 그림자
    this.clouds = [];
    const ctex = M.cloudShadowTexture();
    for (let i = 0; i < 6; i++) {
      const sz = rand(260, 520);
      const c = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz * rand(0.6, 0.9)), new THREE.MeshBasicMaterial({ map: ctex, transparent: true, opacity: 0.32, depthWrite: false, color: 0x062a44 }));
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = rand(0, TAU);
      c.position.set(rand(-900, 900), 0.4, rand(-900, 900));
      c.renderOrder = 3;
      this.scene.add(c);
      this.clouds.push(c);
    }
  }
  updateWater(cx, cz, dt) {
    const snap = 40;
    const x = Math.round(cx / snap) * snap, z = Math.round(cz / snap) * snap;
    this.water.position.set(x, 0, z);
    this.shadowCatcher.position.set(x, 0.2, z);
    this.waterU.time.value = this.t;
    M.foamTime(this.t);
    for (const c of this.clouds) {
      c.position.x += 9 * dt; c.position.z -= 4 * dt;
      if (c.position.x - cx > 1000) c.position.x -= 2000;
      if (c.position.x - cx < -1000) c.position.x += 2000;
      if (c.position.z - cz > 1000) c.position.z -= 2000;
      if (c.position.z - cz < -1000) c.position.z += 2000;
    }
  }

  // ---------- 월드 ----------
  decoFor(isl) {
    const special = { 'Black & White': 'chess', CATS: 'cat', WHALEs: 'whale', 'The Tower': 'lighthouse', Crater: 'volcano', 'Ice Americano': 'ice', ChristMas: 'ice', PISA: 'lighthouse', 'Big Fountain': 'flower', 'Little Fountain': 'flower', Liberty: 'moai', 'Red Castle': 'skull', OCTO: 'skull' };
    if (special[isl.name]) return special[isl.name];
    if (isl.world === 1) return ['village', 'windmill', 'village', 'moai'][isl.i % 4];
    return ['village', 'palms', 'palms', 'ice', 'flower'][isl.fac];
  }

  buildWorld() {
    for (const e of this.enemies) e.dispose();
    for (const b of this.bullets) this.scene.remove(b.mesh);
    for (const l of this.loot) this.world.remove(l.obj);
    this.enemies = []; this.bullets = []; this.loot = [];
    while (this.world.children.length) this.world.remove(this.world.children[0]);
    this.islands = [];
    const s = this.state;
    const em = Math.max(0, s.emblem);
    const dockDir = Math.atan2(-0.75, 0.66); // 원작처럼 섬 남서쪽
    for (const isl of D.ISLANDS) {
      if (isl.world !== s.world) continue;
      const obj = M.makeIsland({ id: 'isl' + isl.i, r: ISLAND_R / 1.15, deco: this.decoFor(isl), ground: D.FACTIONS[isl.fac].ground });
      obj.position.set(isl.x, 0, isl.z);
      if (obj.userData.dockGroup) obj.userData.dockGroup.rotation.y = dockDir;
      M.enableShadows(obj, true, true);
      this.world.add(obj);
      const foam = M.makeShoreFoam(ISLAND_R * 1.02); foam.position.set(isl.x, 0.35, isl.z); this.world.add(foam);
      const refl = M.makeReflection(obj); refl.position.copy(obj.position); this.world.add(refl);
      const dock = { x: isl.x + Math.sin(dockDir) * (ISLAND_R + 20), z: isl.z + Math.cos(dockDir) * (ISLAND_R + 20) };
      const rec = { def: isl, obj, refl, x: isl.x, z: isl.z, dock, defenders: [], gen: false };
      M.setIslandOwned(obj, !!s.done[isl.i], em, isl.fac);
      M.setIslandOwned(refl, !!s.done[isl.i], em, isl.fac);
      const fog = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R * 2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      fog.rotation.x = -Math.PI / 2; fog.position.set(isl.x, 30, isl.z); fog.renderOrder = 6;
      this.world.add(fog);
      rec.fog = fog;
      this.islands.push(rec);
    }
    if (s.world === 0) {
      const dk = M.makeIsland({ id: 'dokdo', r: ISLAND_R * 0.9, deco: 'dokdo', ground: 0x5f9a45 });
      dk.position.set(D.DOKDO.x, 0, D.DOKDO.z);
      M.enableShadows(dk, true, true);
      const dfoam = M.makeShoreFoam(ISLAND_R * 0.95); dfoam.position.set(D.DOKDO.x, 0.35, D.DOKDO.z); this.world.add(dfoam);
      if (dk.userData.dockGroup) dk.userData.dockGroup.visible = false;
      this.world.add(dk);
      const dr = M.makeReflection(dk); dr.position.copy(dk.position); this.world.add(dr);
    }
    // 아레나
    const A = D.ARENAS[s.world];
    this.arenaPos = A;
    const gate = M.makeArenaGate();
    gate.scale.setScalar(1.4);
    gate.position.set(A.x, 0, A.z + 250);
    this.world.add(gate);
    this.gateObj = gate;
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU;
      const b = M.makeBuoy(i % 2 ? 0xd8342c : 0xf4f4f4);
      b.scale.setScalar(1.5);
      b.position.set(A.x + Math.cos(a) * 215, 0, A.z + Math.sin(a) * 215);
      this.world.add(b);
    }
    // 크라켄
    this.krakens = [];
    if (s.world === 0) for (const k of D.KRAKENS) {
      const obj = M.makeKraken();
      obj.scale.setScalar(0.7);
      obj.position.set(k.x, -40, k.z);
      obj.visible = false;
      this.world.add(obj);
      this.krakens.push({ x: k.x, z: k.z, obj, state: 'hidden', t: 0, cool: 0 });
    }
    this.whales = [];
    for (let i = 0; i < 3; i++) {
      const w = M.makeWhaleShadow();
      w.userData.h = rand(0, TAU);
      this.world.add(w);
      this.whales.push(w);
    }
    this.gulls = [];
    for (let i = 0; i < 4; i++) {
      const g = M.makeSeagull();
      g.scale.setScalar(1.6);
      g.userData.phase = rand(0, TAU); g.userData.r = rand(40, 80); g.userData.h = rand(30, 45);
      this.world.add(g);
      this.gulls.push(g);
    }
    if (!this.player) {
      this.player = new Ship(this, { x: 0, z: 0 });
      this.player.hp = s.hp;
    } else this.world.add(this.player.obj);
    this.applyLevels(true);
    for (const w of this.whales) w.position.set(this.player.x + rand(-600, 600), -0.6, this.player.z + rand(-600, 600));
    this.park(s.last, true);
  }

  applyLevels(force) {
    const s = this.state, p = this.player, L = s.lv;
    const [len, beam] = D.HULL[L.body - 1];
    p.setSpec({ mass: D.shipMass(L.body), motor: D.motorForce(L.body, L.sail), steer: D.steerForce(L.body, L.steer), drag: 2, angDrag: 4, len: len * K, beam: beam * K });
    const key = [L.body, L.sail, L.steer, s.emblem].join(',');
    if (force || key !== p.lookKey) {
      p.lookKey = key;
      const look = M.boatLook({ body: L.body, sail: L.sail, steer: L.steer, emblem: Math.max(0, s.emblem), hulls: D.HULL, K });
      const model = M.makeShip({ ...look, guns: D.TURRETS[L.body - 1] / 2 });
      p.setModel(model);
      p.turrets = model.userData.slots.map(sl => ({ side: sl.side, lx: sl.x, lz: sl.z, t: 0.5 }));
    }
    const mh = this.maxHp();
    if (p.hp == null) p.hp = mh;
    p.hp = Math.min(p.hp, mh);
  }

  setupHelpers() {
    for (const h of this.helpers) h.ship ? h.ship.dispose() : this.world.remove(h.obj);
    this.helpers = [];
    const s = this.state, p = this.player;
    s.assist.forEach((lv, i) => {
      if (lv <= 0) return;
      const L = Math.min(50, lv);
      const b = clamp(Math.floor(L * 0.2) + 1, 1, 10);
      const a = p.heading + Math.PI + (i - 1) * 0.6;
      const ship = new Ship(this, { x: p.x + Math.sin(a) * 50, z: p.z + Math.cos(a) * 50, heading: p.heading });
      const [len, beam] = D.HULL[b - 1];
      ship.setSpec({ mass: (500 + b * 100) * 0.5, motor: 500 + L * 25, steer: (300 + L * 70) * 0.5, drag: 3, angDrag: 4, len: len * K, beam: beam * K });
      const look = M.boatLook({ body: b, sail: L, steer: L, emblem: Math.max(0, s.emblem), hulls: D.HULL, K });
      ship.setModel(M.makeShip({ ...look, guns: D.TURRETS[b - 1] / 2 }));
      ship.atk = Math.floor(0.5 * (5 + L * 2));
      ship.cd = { '-1': 0, 1: 0 };
      ship.body = b;
      this.helpers.push({ kind: 'ship', ship, idx: i });
    });
    s.gulls.forEach((lv, i) => {
      if (lv <= 0) return;
      const g = M.makeSeagull();
      g.scale.setScalar((0.2 + 0.036 * lv) * K * 1.6);
      this.world.add(g);
      this.helpers.push({ kind: 'gull', obj: g, phase: i * Math.PI });
    });
    if (s.nessy > 0) {
      const n = M.makeNessy();
      n.scale.setScalar((0.2 + 0.036 * s.nessy) * K * 0.7);
      this.world.add(n);
      this.helpers.push({ kind: 'nessy', obj: n, x: p.x, z: p.z, h: p.heading });
    }
    if (s.pickup) {
      const ship = new Ship(this, { x: p.x, z: p.z + 40, heading: p.heading });
      ship.setSpec({ mass: 300, motor: 900, steer: 400, drag: 3, angDrag: 4, len: 3.5 * K, beam: 1.2 * K });
      ship.setModel(M.makeShip({ len: 3.5 * K, beam: 1.5 * K, depth: 0.8 * K, masts: 1, sail: 0xf2c230, emblem: 'none', hull: 0xf2c230, trim: 0xffffff, guns: 0, oars: 1 }));
      this.helpers.push({ kind: 'pickup', ship, target: null });
    }
  }

  // ---------- 입력 ----------
  bindInput() {
    const c = this.canvas;
    const pts = new Map();
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        this.input.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.camSizeTarget };
        this.input.touch = false;
        this.ui.steer(null);
        return;
      }
      if (this.paused || this.parked != null || this.player.dead) return;
      const I = this.input;
      const now = performance.now();
      if (now - I.lastTap < 500) {
        // 두 번 탭: 화면 중심에서 탭한 방향으로 자동 항해
        I.heading = Math.atan2(e.clientX - this.vw / 2, e.clientY - this.vh / 2);
        this.auto = true;
        I.lastTap = 0;
        this.ui.toast('자동 항해', 'info', 1200);
      } else {
        this.auto = false;
        I.lastTap = now;
      }
      I.touch = true; I.moved = false;
      I.sx = e.clientX; I.sy = e.clientY; I.cx = e.clientX; I.cy = e.clientY;
    });
    c.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const I = this.input;
      if (I.pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        this.camSizeTarget = clamp(I.pinch.z * I.pinch.d / Math.hypot(a.x - b.x, a.y - b.y), 6, this.maxCam());
        return;
      }
      if (!I.touch) return;
      I.cx = e.clientX; I.cy = e.clientY;
      const dx = I.cx - I.sx, dy = I.cy - I.sy;
      if (Math.hypot(dx, dy) > 8) { I.heading = Math.atan2(dx, dy); I.moved = true; this.auto = false; }
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) this.input.pinch = null;
      if (pts.size === 0) { this.input.touch = false; this.ui.steer(null); }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.camSizeTarget = clamp(this.camSizeTarget * (e.deltaY > 0 ? 1.1 : 0.9), 6, this.maxCam());
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this.input.keys.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.input.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.input.keys.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
  }
  maxCam() { return this.vw > this.vh ? 22 : 40; }

  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * this.vw, y: (1 - v.y) / 2 * this.vh };
  }

  resize() {
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.renderer.setSize(this.vw, this.vh, false);
    this.camSizeTarget = Math.min(this.camSizeTarget, this.maxCam());
  }

  // ---------- 루프 ----------
  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= D.DT && steps < 6) { this.step(D.DT); this.acc -= D.DT; steps++; }
      if (steps === 6) this.acc = 0;
    }
    this.renderAll(dt);
  }

  step(dt) {
    this.t += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.t) { const f = this.pending[i].fn; this.pending.splice(i, 1); f(); }
    this.state.time += dt;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateHelpers(dt);
    this.updateBullets(dt);
    this.updateIslands(dt);
    this.updateLoot(dt);
    this.updateSpawners(dt);
    this.updateKrakens(dt);
    this.updateArena(dt);
    this.saveT += dt;
    if (this.saveT > 5) { this.saveT = 0; this.save(); }
    this.hudT += dt;
    if (this.hudT > 0.25) { this.hudT = 0; this.ui.updateHud(); }
  }

  renderAll(dt) {
    const p = this.player;
    if (p) {
      p.render(this.t);
      for (const e of this.enemies) e.render(this.t);
      for (const h of this.helpers) if (h.ship) h.ship.render(this.t);
    }
    this.updateCamera(dt);
    this.updateAmbience(dt);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (!this.paused) this.ui.frame(dt);
  }

  // ---------- 내 배 ----------
  updatePlayer(dt) {
    const p = this.player, I = this.input, s = this.state;
    if (p.dead) {
      p.obj.position.y = Math.max(-20 * K, p.obj.position.y - dt * 8);
      return;
    }
    if (this.parked != null) {
      // 부두로 천천히 이동 (원작: 5초)
      const isl = this.islands.find(i => i.def.i === this.parked);
      if (isl) {
        p.x = lerp(p.x, isl.dock.x, dt * 0.8);
        p.z = lerp(p.z, isl.dock.z, dt * 0.8);
        p.heading = wrap(p.heading + wrap(Math.PI * 0.75 - p.heading) * Math.min(1, dt));
      }
      p.vx = p.vz = 0; p.omega = 0; p.v = p.v2 = 0; p.s = 0; p.s0 = 0;
      // 정박 중 회복: 2초마다
      this.healT += dt;
      if (this.healT > 2) {
        this.healT = 0;
        if (p.hp < this.maxHp()) { p.hp = Math.min(this.maxHp(), p.hp + Math.max(1, D.healPoint(this.maxHp(), s.lv.body))); this.ui.updateHud(true); }
      }
      return;
    }
    const KS = I.keys;
    let kx = 0, kz = 0;
    if (KS.has('arrowup') || KS.has('w')) kz -= 1;
    if (KS.has('arrowdown') || KS.has('s')) kz += 1;
    if (KS.has('arrowleft') || KS.has('a')) kx -= 1;
    if (KS.has('arrowright') || KS.has('d')) kx += 1;
    let go = (I.touch && I.moved) || this.auto;
    let desired = I.heading;
    if (kx || kz) { go = true; desired = Math.atan2(kx, kz); this.auto = false; }
    if (go) { p.v = p.motor; p.steerTo(desired, 0.01); } else { p.v = 0; p.s = 0; p.s0 = 0; }
    p.physics(dt, 1);
    this.ui.steer(I.touch && I.moved ? I : null);
    this.collideIslands(p);
    if (this.parked != null) return;
    // 맵 끝을 넘으면 반대편으로
    if (Math.hypot(p.x, p.z) > D.MAP_R && !this.arena) {
      p.x = -p.x * 0.9; p.z = -p.z * 0.9;
      this.camTarget.set(p.x, 0, p.z);
      this.ui.toast('세계의 끝을 넘어 반대편으로 나왔습니다', 'info', 2500);
    }
    // 바다에서 갈매기 회복: 30초마다
    if (p.hp < this.maxHp()) {
      this.seaHealT += dt;
      if (this.seaHealT > 30) { this.seaHealT = 0; const h = this.seagullHeal(); if (h > 0) { p.hp = Math.min(this.maxHp(), p.hp + h); this.ui.floatText(p.x, 30, p.z, '+' + h, '#7cf29a'); } }
    } else this.seaHealT = 0;
    p.wakeT = (p.wakeT || 0) - dt;
    if (p.speed() > 2 && p.wakeT <= 0) { p.wakeT = 0.06; this.wake(p); }
    // 포탑
    // 사격 판정: 원작의 좁은 측면 상자 대신 넉넉한 사거리 안의 적
    this.near = this.enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < FIRE_RANGE + e.len * 0.5);
    for (const tu of p.turrets) this.updateTurret(p, tu, dt);
    // 들이받기: 서로 상대 선체 레벨만큼 피해
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - p.x, e.z - p.z) < (p.len + e.len) * 0.5 && (p.contains(e.x, e.z, e.beam / 2) || e.contains(p.x, p.z, p.beam / 2))) {
        const nx = e.x - p.x, nz = e.z - p.z, nd = Math.hypot(nx, nz) || 1;
        e.vx += nx / nd * 15; e.vz += nz / nd * 15; p.vx -= nx / nd * 8; p.vz -= nz / nd * 8;
        if ((e.ramT || 0) < this.t) {
          e.ramT = this.t + 1;
          this.boom((e.x + p.x) / 2, 3 * K, (e.z + p.z) / 2, 0xffa030);
          this.hitEnemy(e, s.lv.body);
          this.hitPlayer(e.lv);
        }
      }
    }
    // 자동 낚시: 점령한 섬 근처, 주변에 적이 없을 때
    const nearOwn = this.islands.some(i => s.done[i.def.i] && Math.hypot(i.x - p.x, i.z - p.z) < D.FISH_R + ISLAND_R * 0.5);
    this.fishing = nearOwn && !this.arena && !this.enemies.some(e => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 30 * K);
    if (this.fishing) {
      this.fishT += dt;
      if (this.fishT > 2.2) {
        this.fishT = 0;
        this.tempFish += 0.01;
        const n = Math.max(1, Math.ceil((3 + 1.2 * s.lv.fish) * (1 - this.tempFish) * rand(0.8, 1.2)));
        this.giveRes([0, n, 0, 0, 0, 0, 0]);
        s.fished += n;
        this.sound.play('fish', 0.35);
        for (let k = 0; k < 6; k++) this.particles.emit({ x: p.x + rand(-8, 8), y: 1, z: p.z + rand(-8, 8), vy: rand(10, 20), grav: 40, life: 0.7, size: 1.4, color: 0xffffff });
      }
    } else this.fishT = 0;
  }

  wake(sh) {
    const L = sh.len;
    const bx = sh.x - Math.sin(sh.heading) * L * 0.45, bz = sh.z - Math.cos(sh.heading) * L * 0.45;
    for (const sd of [-1, 1]) {
      const sx = Math.cos(sh.heading) * sd * sh.beam * 0.4, sz = -Math.sin(sh.heading) * sd * sh.beam * 0.4;
      this.particles.emit({ x: bx + sx, y: 0.3, z: bz + sz, vx: sx * 0.3, vz: sz * 0.3, life: 1.0, size: L * 0.12, grow: L * 0.16, color: 0xe6f6ff, alpha: 0.28 });
    }
  }

  collideIslands(sh) {
    for (const isl of this.islands) {
      const r = ISLAND_R + sh.beam * 0.5;
      const dx = sh.x - isl.x, dz = sh.z - isl.z, d = Math.hypot(dx, dz);
      if (d < r) {
        // 점령한 섬에 닿으면 자동 정박
        if (sh === this.player && this.state.done[isl.def.i] && !this.arena && this.canPark !== isl.def.i) { this.park(isl.def.i); return; }
        const nx = dx / (d || 1), nz = dz / (d || 1);
        sh.x = isl.x + nx * r; sh.z = isl.z + nz * r;
        const vn = sh.vx * nx + sh.vz * nz;
        if (vn < 0) { sh.vx -= vn * nx * 1.3; sh.vz -= vn * nz * 1.3; }
      }
    }
    if (sh === this.player && this.canPark != null) {
      const isl = this.islands.find(i => i.def.i === this.canPark);
      if (!isl || Math.hypot(sh.x - isl.x, sh.z - isl.z) > ISLAND_R + 40) this.canPark = null;
    }
  }

  // 포탑 하나: 측면 70도 안의 적을 좌우 55도까지 조준, 2.8초마다 한 발.
  // 적이 움직일 곳을 예측하고, 거리에 맞춰 포각을 정한다.
  updateTurret(p, tu, dt) {
    const pos = p.toWorld(tu.lx, tu.lz);
    const face = p.heading + tu.side * Math.PI / 2;
    let target = null, best = Infinity;
    for (const e of this.near) {
      const a = Math.atan2(e.x - pos.x, e.z - pos.z);
      const d = Math.hypot(e.x - pos.x, e.z - pos.z);
      if (Math.abs(wrap(a - face)) < 70 * DEG && d < FIRE_RANGE + e.len * 0.5 && d < best) { best = d; target = e; }
    }
    if (!target) { tu.t = Math.min(tu.t, 0.4); return; }
    tu.t -= dt;
    if (tu.t > 0) return;
    tu.t = 2.8;
    // 원작처럼 0.1초 뒤 발사 (게임 시간 기준)
    this.pending.push({ at: this.t + 0.1, fn: () => {
      if (p.dead || this.parked != null || target.dead) return;
      const pp = p.toWorld(tu.lx, tu.lz);
      const v = BALL_SPEED;
      let tx = target.x, tz = target.z, pitch = 10 * DEG;
      for (let i = 0; i < 3; i++) {
        const d = Math.hypot(tx - pp.x, tz - pp.z);
        pitch = 0.5 * Math.asin(clamp(D.G * d / (v * v), 0, 1));
        const tf = d / (v * Math.cos(pitch));
        tx = target.x + target.vx * tf; tz = target.z + target.vz * tf;
      }
      const yaw = face + clamp(wrap(Math.atan2(tx - pp.x, tz - pp.z) - face), -55 * DEG, 55 * DEG);
      this.fire(pp.x, 1.6 * K, pp.z, yaw, pitch, v, D.atk(this.state.lv.cannon), 'player');
    } });
  }

  fire(x, y, z, yaw, pitch, speed, atk, team) {
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const h = Math.cos(pitch) * speed;
    this.bullets.push({ mesh, x, y, z, vx: Math.sin(yaw) * h, vy: Math.sin(pitch) * speed, vz: Math.cos(yaw) * h, atk, team, t: 0 });
    for (let k = 0; k < 5; k++) this.particles.emit({ x, y, z, vx: Math.sin(yaw) * rand(8, 22) + rand(-3, 3), vy: rand(2, 8), vz: Math.cos(yaw) * rand(8, 22) + rand(-3, 3), life: 1.2, size: 3.5, grow: 9, color: 0xe8e8e8, alpha: 0.75, drag: 2.5 });
    this.particles.emit({ x: x + Math.sin(yaw) * 3, y, z: z + Math.cos(yaw) * 3, life: 0.1, size: 9, color: 0xfff1b0 });
    this.particles.emit({ x: x + Math.sin(yaw) * 5, y, z: z + Math.cos(yaw) * 5, life: 0.16, size: 6, color: 0xff9a30 });
    const far = Math.hypot(x - this.player.x, z - this.player.z);
    if (far < 400) this.sound.play('cannon', (team === 'enemy' ? 0.25 : 0.4) * (1 - far / 450), clamp((x - this.player.x) / 200, -1, 1));
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.t += dt;
      b.vy -= D.G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      let hit = false;
      if (b.y < 5 * K) {
        if (b.team === 'enemy') {
          const p = this.player;
          if (!p.dead && this.parked == null && p.contains(b.x, b.z, 0.4 * K)) { this.hitPlayer(b.atk); hit = true; }
        } else {
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (Math.abs(e.x - b.x) < e.len && Math.abs(e.z - b.z) < e.len && e.contains(b.x, b.z, 0.4 * K)) { this.hitEnemy(e, b.atk); hit = true; break; }
          }
        }
      }
      if (hit) {
        this.boom(b.x, b.y, b.z, 0xffa030);
        this.scene.remove(b.mesh); this.bullets.splice(i, 1);
        continue;
      }
      if (b.y <= 0 && b.t > 0.3) {
        for (let k = 0; k < 6; k++) this.particles.emit({ x: b.x, y: 0.5, z: b.z, vx: rand(-6, 6), vy: rand(12, 28), vz: rand(-6, 6), grav: 60, life: 0.8, size: 1.8, color: 0xffffff, alpha: 0.9 });
        this.particles.emit({ x: b.x, y: 0.3, z: b.z, life: 0.8, size: 3, grow: 12, color: 0xe6f6ff, alpha: 0.7 });
        this.scene.remove(b.mesh); this.bullets.splice(i, 1);
      }
    }
  }

  boom(x, y, z, color) {
    this.particles.emit({ x, y, z, life: 0.14, size: 14, color: 0xfff1b0 });
    for (let k = 0; k < 6; k++) this.particles.emit({ x, y, z, vx: rand(-25, 25), vy: rand(10, 30), vz: rand(-25, 25), grav: 50, life: 0.5, size: 1.2, color: 0xffe080 });
    for (let k = 0; k < 10; k++) this.particles.emit({ x, y, z, vx: rand(-15, 15), vy: rand(6, 24), vz: rand(-15, 15), grav: 40, life: 0.6, size: 1.8, color: k % 2 ? color : 0x5a3a20 });
    for (let k = 0; k < 3; k++) this.particles.emit({ x, y: y + 4, z, vy: 4, life: 1.2, size: 5, grow: 8, color: 0x555555, alpha: 0.6 });
    const far = Math.hypot(x - this.player.x, z - this.player.z);
    if (far < 300) this.sound.play('hit', 0.3 * (1 - far / 320));
  }

  hitPlayer(dmg) {
    const p = this.player;
    if (p.dead || this.parked != null) return;
    p.hp -= dmg;
    this.ui.floatText(p.x, 30, p.z, '-' + dmg, '#ff6b6b');
    this.ui.hurt();
    if (p.hp <= 0) { p.hp = 0; this.playerDead(); }
  }

  playerDead() {
    const p = this.player, s = this.state;
    p.dead = true;
    p.v = p.v2 = 0; p.s = 0; p.vx = p.vz = 0;
    s.deaths++;
    this.auto = false;
    this.sound.play('sink', 0.6);
    for (let k = 0; k < 30; k++) this.particles.emit({ x: p.x + rand(-10, 10), y: 6, z: p.z + rand(-10, 10), vx: rand(-15, 15), vy: rand(10, 30), vz: rand(-15, 15), grav: 30, life: 1.2, size: 3, color: k % 2 ? 0xff8030 : 0x333333 });
    this.save();
    if (this.arena) { setTimeout(() => this.endArena(), 1200); return; }
    setTimeout(() => this.ui.showDeath(), 1200);
  }

  // 부활: 'island'(마지막 섬, 체력 100%) · 'ticket'(그 자리) · 'coin'(그 자리, 5000×선체)
  revive(how) {
    const p = this.player, s = this.state;
    if (how === 'ticket') { if (s.revival <= 0) return false; s.revival--; }
    if (how === 'coin') { const c = 5000 * s.lv.body; if (s.res[0] < c) return false; s.res[0] -= c; }
    p.dead = false;
    p.obj.position.y = 0;
    p.hp = this.maxHp();
    p.vx = p.vz = 0; p.omega = 0;
    if (how === 'island') this.park(s.last);
    this.save();
    this.ui.updateHud(true);
    return true;
  }

  // ---------- 적 ----------
  spawnEnemy(lv, { x, z, pirate = false, home = null, arena = false }) {
    const s = this.state;
    const st = D.enemyStats(lv, pirate, s.world);
    const e = new Ship(this, { x, z, heading: rand(0, TAU) });
    const [len, beam] = D.HULL[lv - 1];
    e.setSpec({ mass: st.mass, motor: st.motor, steer: st.steer, drag: 3, angDrag: 4, len: len * K, beam: beam * K });
    let emblem;
    if (pirate) emblem = lv >= 10 ? 5 : [0, 1, 2, 3, 4].filter(n => n !== s.emblem)[Math.floor(Math.random() * 4)];
    else emblem = home.def.fac;
    const look = M.boatLook({ body: lv, sail: st.lvSail, steer: st.lvHead, emblem, hulls: D.HULL, K });
    e.setModel(M.makeShip({ ...look, guns: D.TURRETS[lv - 1] / 2 }));
    e.obj.scale.setScalar(0.01);
    Object.assign(e, { lv, hp: st.hp, maxHp: st.hp, atk: st.atk, pirate, home, arena, lock: false, back: false, pirateT: 10, addAngle: 1, angleT: 0, cd: { '-1': rand(0, 3), 1: rand(0, 3) }, id: Math.random().toString(36).slice(2), born: this.t });
    this.enemies.push(e);
    return e;
  }

  removeEnemy(e) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    e.dispose();
    if (e.home) e.home.defenders = e.home.defenders.filter(x => x !== e);
  }

  updateEnemies(dt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.obj.scale.setScalar(Math.min(1, (this.t - e.born) * 2.2 + 0.01));
      if (e.dead) {
        e.sinkT += dt;
        e.obj.position.y = -e.sinkT * 6;
        if (e.sinkT > 3) this.removeEnemy(e);
        continue;
      }
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      e.lock = p.dead ? false : e.pirate ? (this.arena ? true : d < 110 * K) : d < 60 * K;
      if (e.lock) {
        if (!e.pirate) {
          if (Math.hypot(e.x - e.home.x, e.z - e.home.spawnZ) > 60 * K) this.backHome(e);
          else if (!e.back) this.moveToAtk(e, d, dt);
          else this.backHome(e);
        } else {
          this.moveToAtk(e, d, dt);
          if (d > 60 * K && !this.arena) {
            e.pirateT -= dt;
            if (e.pirateT < 0) { this.removeEnemy(e); continue; }
            e.v = 0; e.s = 0;
          }
        }
      } else if (!e.pirate) {
        if (Math.hypot(e.x - e.home.x, e.z - e.home.spawnZ) > 30 * K) this.backHome(e);
        else { e.v = 0; e.s = 0; }
      } else {
        e.pirateT -= dt;
        if (e.pirateT < 0) { this.removeEnemy(e); continue; }
        e.v = 0; e.s = 0;
      }
      e.physics(dt, 0.5);
      this.collideIslands(e);
      if (this.arena) {
        const A = this.arenaPos, dx = e.x - A.x, dz = e.z - A.z, r = Math.hypot(dx, dz);
        if (r > 205) { e.x = A.x + dx / r * 205; e.z = A.z + dz / r * 205; }
      }
      // 측면 사격: 그쪽 상자에 내가 있으면 3초마다 일제 사격
      if (!p.dead && this.parked == null) {
        const side = e.inAtkBox(p.x, p.z, e.lv);
        for (const sd of [-1, 1]) {
          e.cd[sd] -= dt;
          if (side === sd && e.cd[sd] <= 0) { e.cd[sd] = 3; this.broadside(e, sd, e.atk, 'enemy', 20 * K, 20 * DEG); }
        }
      }
      if (e.hp < e.maxHp * 0.4 && Math.random() < dt * 8) {
        this.particles.emit({ x: e.x + rand(-4, 4), y: 6, z: e.z + rand(-4, 4), vy: rand(6, 14), life: 0.7, size: 2.5, grow: 2, color: Math.random() < 0.5 ? 0xff7a20 : 0xffc040 });
        this.particles.emit({ x: e.x, y: 10, z: e.z, vy: 8, life: 1.6, size: 4, grow: 6, color: 0x3a3a3a, alpha: 0.5 });
      }
      e.wakeT = (e.wakeT || 0) - dt;
      if (e.speed() > 3 && e.wakeT <= 0) { e.wakeT = 0.1; this.wake(e); }
    }
  }

  broadside(sh, side, atk, team, speed, pitch) {
    const yaw = sh.heading + side * Math.PI / 2;
    for (const sl of sh.model.userData.slots) {
      if (sl.side !== side) continue;
      const w = sh.toWorld(sl.x, sl.z);
      this.fire(w.x, 1.6 * K, w.z, yaw, pitch, speed, atk, team);
    }
  }

  // 원작: 공격 거리 15 밖이면 접근, 안이면 내 배 방향에서 ±135도로 틀어 선회 (5초마다 무작위)
  moveToAtk(e, d, dt) {
    e.pirateT = 5;
    const p = this.player;
    const bearing = Math.atan2(p.x - e.x, p.z - e.z);
    e.angleT -= dt;
    if (e.angleT <= 0) { e.angleT = 5; e.addAngle = Math.random() > 0.5 ? 1 : -1; }
    e.v = e.motor;
    e.steerTo(d > 15 * K ? bearing : bearing + e.addAngle * 135 * DEG, 0.01);
  }
  backHome(e) {
    const hx = e.home.x, hz = e.home.spawnZ;
    e.back = Math.hypot(e.x - hx, e.z - hz) >= 10 * K;
    e.steerTo(Math.atan2(hx - e.x, hz - e.z), 0.03);
    e.v = e.motor * 2;
  }

  hitEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    this.ui.floatText(e.x, 26, e.z, String(dmg), '#ffe066');
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true; e.sinkT = 0;
    this.state.kills++;
    this.sound.play('explode', 0.5);
    for (let k = 0; k < 26; k++) this.particles.emit({ x: e.x + rand(-8, 8), y: 8, z: e.z + rand(-8, 8), vx: rand(-20, 20), vy: rand(8, 30), vz: rand(-20, 20), grav: 30, life: 1.1, size: 3, color: k % 3 ? 0xff8a30 : 0x2a2a2a });
    for (let k = 0; k < 4; k++) this.particles.emit({ x: e.x + rand(-6, 6), y: 6, z: e.z + rand(-6, 6), life: 0.35, size: 18 + k * 4, grow: 20, color: k % 2 ? 0xffb040 : 0xffe9a0, alpha: 0.9 });
    for (let k = 0; k < 10; k++) this.particles.emit({ x: e.x, y: 6, z: e.z, vx: rand(-30, 30), vy: rand(15, 35), vz: rand(-30, 30), grav: 45, life: 1.4, size: 2.2, color: 0x7a5230 });
    for (let k = 0; k < 6; k++) this.particles.emit({ x: e.x + rand(-6, 6), y: 10, z: e.z + rand(-6, 6), vy: 6, life: 3, size: 10, grow: 10, color: 0x3a3a3a, alpha: 0.55 });
    this.shake = Math.max(this.shake || 0, 0.15);
    if (e.home) e.home.defenders = e.home.defenders.filter(x => x !== e);
    if (this.arena) { this.arena.kills++; return; }
    // 떠다니는 상자 2~4개, 상자마다 따로 굴림
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.dropCrate(e.x + rand(-12, 12), e.z + rand(-12, 12), D.rollLoot(e.lv));
  }

  dropCrate(x, z, res, gift = false) {
    const obj = M.makeLoot(gift ? 'gift' : 'crate');
    obj.position.set(x, 0, z);
    obj.scale.setScalar(K * 0.35);
    this.world.add(obj);
    this.loot.push({ obj, x, z, res, t: 0, gift });
  }

  updateLoot(dt) {
    const p = this.player;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.t += dt;
      l.obj.position.y = Math.sin(this.t * 2 + l.x) * 0.5;
      l.obj.rotation.y += dt;
      if (l.t > (l.gift ? 120 : 60) || Math.hypot(p.x - l.x, p.z - l.z) > 100 * K) { this.world.remove(l.obj); this.loot.splice(i, 1); continue; }
      if (!p.dead && this.parked == null && p.contains(l.x, l.z, 2 * K)) {
        this.collectLoot(l);
        this.world.remove(l.obj); this.loot.splice(i, 1);
      }
    }
    // 획득 표시는 하나씩
    this.lootQueueT -= dt;
    if (this.lootQueue.length && this.lootQueueT <= 0) {
      this.lootQueueT = 0.35;
      const [k, v] = this.lootQueue.shift();
      this.ui.floatText(p.x, 34, p.z, `${D.RES[k].name} +${D.fmt(v)}`, k === 0 ? '#ffd84a' : '#bfe9ff');
    }
  }
  collectLoot(l) {
    if (l.gift) {
      const c = 500 * this.state.lv.body;
      this.addRes(0, c);
      this.ui.toast(`🎁 선물 상자! +${D.fmt(c)} 코인`, 'good', 2000);
      return;
    }
    this.giveRes(l.res);
    this.sound.play('coin', 0.4);
  }
  giveRes(r) {
    for (let k = 0; k < 7; k++) if (r[k] > 0) { this.state.res[k] += r[k]; this.lootQueue.push([k, r[k]]); }
    this.ui.updateHud(true);
  }
  addRes(k, v) { this.state.res[k] += v; this.sound.play('coin', 0.4); this.ui.updateHud(true); }

  // ---------- 섬 ----------
  updateIslands(dt) {
    const p = this.player, s = this.state;
    let near = false, banner = null;
    for (const isl of this.islands) {
      const id = isl.def.i;
      const d = Math.hypot(isl.x - p.x, isl.z - p.z);
      if (isl.obj.userData.spin) isl.obj.userData.spin.rotation.z += dt * 0.8;
      const sm = isl.obj.userData.smoke;
      if (sm && d < 900 && Math.random() < dt * 5) this.particles.emit({ x: isl.x + sm.x + rand(-4, 4), y: sm.y, z: isl.z + sm.z + rand(-4, 4), vy: rand(6, 10), life: 3.5, size: 8, grow: 12, color: 0x6a6a6a, alpha: 0.45 });
      if (s.done[id]) { isl.fog.material.opacity = 0; if (d < D.FISH_R + ISLAND_R) near = true; continue; }
      isl.fog.material.opacity = lerp(isl.fog.material.opacity, d < D.FOG_R && !this.arena && this.parked == null && isl.gen ? 0.16 : 0, dt * 2);
      if (this.parked != null || this.arena || p.dead) continue;
      if (d < D.ENGAGE_R) {
        near = true;
        if (!isl.gen) this.genDefenders(isl);
      } else if (d > D.RESET_R && isl.gen) this.regenIsland(isl);
      if (isl.gen) {
        const alive = isl.defenders.filter(e => !e.dead).length;
        if (alive === 0) { this.capture(isl); continue; }
        if (d < D.RESET_R) banner = `⚔ ${isl.def.name} 방어 함대 ${alive} / ${isl.total}`;
      }
    }
    this.nearIsland = near;
    this.ui.banner(banner);
  }

  genDefenders(isl) {
    const s = this.state;
    isl.gen = true;
    isl.defenders = [];
    isl.spawnZ = isl.z + 20 * K; // 원작: 섬 남쪽 20 지점 둘레에서 나타남
    const n = s.world === 0 ? D.DEFENDERS[isl.def.tier] : 10;
    isl.total = n;
    for (let i = 0; i < n; i++) {
      let x, z;
      do { x = rand(-15, 15) * K; z = rand(-15, 15) * K; } while (Math.hypot(x, z) < 15 * K);
      const e = this.spawnEnemy(D.enemyLevelForTier(isl.def.tier, s.world), { x: isl.x + x, z: isl.spawnZ + z, home: isl });
      isl.defenders.push(e);
    }
    this.ui.toast(`${isl.def.name}의 방어 함대가 나타났습니다!`, 'danger', 2200);
    this.sound.play('horn', 0.4);
  }
  regenIsland(isl) {
    for (const e of [...isl.defenders]) this.removeEnemy(e);
    isl.defenders = [];
    isl.gen = false;
  }

  capture(isl) {
    const s = this.state;
    isl.gen = false;
    s.done[isl.def.i] = true;
    M.setIslandOwned(isl.obj, true, s.emblem, isl.def.fac);
    M.setIslandOwned(isl.refl, true, s.emblem, isl.def.fac);
    if (s.target === isl.def.i || s.done[s.target]) s.target = this.nextTarget();
    this.sound.play('fanfare', 0.6);
    this.save();
    const reward = D.captureReward(isl.def.tier);
    this.ui.showCapture(isl, reward, () => {
      this.giveRes(reward);
      this.save();
      const all = w => D.ISLANDS.filter(i => i.world === w).every(i => s.done[i.i]);
      if (s.world === 0 && all(0) && !s.italyNotice) { s.italyNotice = true; this.ui.showAllCaptured(false); }
      else if (s.world === 1 && all(1)) this.ui.showAllCaptured(true);
    });
  }
  nextTarget() {
    const s = this.state;
    const list = D.ISLANDS.filter(i => i.world === s.world && !s.done[i.i]);
    return list.length ? list[0].i : -1;
  }
  italyOpen() { return D.ISLANDS.filter(i => i.world === 0).every(i => this.state.done[i.i]); }

  park(id, silent = false) {
    const s = this.state;
    const isl = this.islands.find(i => i.def.i === id) || this.islands.find(i => s.done[i.def.i]);
    if (!isl) return;
    this.parked = isl.def.i;
    s.last = isl.def.i;
    this.tempFish = 0;
    this.auto = false;
    this.input.touch = false;
    const p = this.player;
    if (silent || Math.hypot(p.x - isl.dock.x, p.z - isl.dock.z) > 400) { p.x = isl.dock.x; p.z = isl.dock.z; p.heading = Math.PI * 0.75; if (this.camTarget) this.camTarget.set(p.x, 0, p.z); }
    p.vx = p.vz = 0;
    // 정박하면 모든 적이 사라지고 섬 함대도 초기화
    for (const e of [...this.enemies]) this.removeEnemy(e);
    for (const i of this.islands) { i.gen = false; i.defenders = []; }
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.bullets = [];
    this.setupHelpers();
    this.save();
    if (!silent) this.sound.play('bell', 0.4);
    this.ui.openIsland(isl);
  }
  unpark() {
    const isl = this.islands.find(i => i.def.i === this.parked);
    this.canPark = this.parked;
    this.parked = null;
    this.ui.closeIsland();
    const p = this.player;
    if (isl) {
      const a = Math.atan2(isl.dock.x - isl.x, isl.dock.z - isl.z);
      p.heading = a; p.vx = Math.sin(a) * 20; p.vz = Math.cos(a) * 20;
    }
    this.pirateT = 10;
    this.save();
  }

  // ---------- 해적, 독도, 선물 상자 ----------
  updateSpawners(dt) {
    const p = this.player, s = this.state;
    if (this.parked != null || p.dead || this.arena) return;
    const dist0 = Math.hypot(p.x, p.z);
    this.pirateT -= dt;
    if (this.pirateT <= 0) {
      const pirates = this.enemies.filter(e => e.pirate && !e.dead).length;
      this.pirateT = 5 + pirates * 5;
      if (!this.nearIsland) {
        const max = dist0 < 500 * K ? 2 : dist0 < 900 * K ? 3 : 4;
        const n = 1 + Math.floor(Math.random() * (max - 1));
        for (let i = 0; i < n; i++) this.genPirate();
      }
    }
    // 독도: 150 안이면 10초마다 Lv10 해적이 몰려온다
    if (s.world === 0 && Math.hypot(p.x - D.DOKDO.x, p.z - D.DOKDO.z) < 150 * K) {
      if (!s.dokdoVisited) { s.dokdoVisited = true; this.save(); this.ui.showDokdo(); }
      this.dokdoT -= dt;
      if (this.dokdoT <= 0) {
        this.dokdoT = 10;
        const n = 1 + Math.floor(Math.random() * 7);
        for (let i = 0; i < n; i++) {
          if (this.enemies.filter(e => e.pirate && !e.dead).length >= 8) break;
          let x, z;
          do { x = rand(-50, 50) * K; z = rand(-50, 50) * K; } while (Math.hypot(x, z) < 50 * K);
          this.spawnEnemy(10, { x: D.DOKDO.x + x, z: D.DOKDO.z + z, pirate: true });
        }
      }
    }
    // 5분마다 선물 상자
    this.giftT -= dt;
    if (this.giftT <= 0) {
      this.giftT = 300;
      const a = rand(0, TAU);
      this.dropCrate(p.x + Math.cos(a) * 15 * K, p.z + Math.sin(a) * 15 * K, null, true);
      this.ui.toast('🎁 근처에 선물 상자가 떠 있어요!', 'good', 2500);
    }
  }
  genPirate() {
    const p = this.player, s = this.state;
    let n = D.pirateTier(Math.hypot(p.x, p.z), s.world);
    if (this.enemies.filter(e => e.pirate && !e.dead).length >= n + 2) return;
    const gx = p.x + Math.sin(p.heading) * 15 * K, gz = p.z + Math.cos(p.heading) * 15 * K;
    let x, z;
    do { x = rand(-20, 20) * K; z = rand(-20, 20) * K; } while (Math.hypot(x, z) < 20 * K);
    if (Math.random() < 1 / 200) n = 6;
    this.spawnEnemy(D.enemyLevelForTier(n, s.world), { x: gx + x, z: gz + z, pirate: true });
  }

  // ---------- 크라켄: 지나가면 촉수를 휘두르고 사라진다 ----------
  updateKrakens(dt) {
    const p = this.player;
    for (const k of this.krakens) {
      k.cool -= dt;
      if (k.state === 'hidden') {
        if (k.cool <= 0 && !p.dead && this.parked == null && Math.hypot(p.x - k.x, p.z - k.z) < 14 * K) {
          k.state = 'attack'; k.t = 0;
          k.obj.visible = true;
          k.obj.rotation.y = Math.atan2(p.x - k.x, p.z - k.z);
          this.sound.play('splash', 0.7);
          this.shake = 0.4;
          for (let i = 0; i < 30; i++) this.particles.emit({ x: k.x + rand(-20, 20), y: 1, z: k.z + rand(-20, 20), vy: rand(15, 35), grav: 50, life: 1, size: 3, color: 0xffffff });
        }
      } else {
        k.t += dt;
        k.obj.position.y = k.t < 0.6 ? -40 + k.t / 0.6 * 40 : k.t > 2.4 ? -(k.t - 2.4) / 0.6 * 40 : 0;
        M.animateKraken(k.obj, this.t * 2, k.t > 0.6 && k.t < 1.6 ? 1 : 0);
        if (k.t > 3) { k.state = 'hidden'; k.obj.visible = false; k.cool = 300; }
      }
    }
  }

  // ---------- 조수 ----------
  updateHelpers(dt) {
    const p = this.player;
    for (const h of this.helpers) {
      if (h.kind === 'ship') {
        const sh = h.ship;
        if (this.parked != null) {
          const isl = this.islands.find(i => i.def.i === this.parked);
          if (isl) {
            const a = Math.atan2(isl.dock.x - isl.x, isl.dock.z - isl.z) + (h.idx - 1) * 0.35;
            sh.x = lerp(sh.x, isl.x + Math.sin(a) * (ISLAND_R + 55), dt); sh.z = lerp(sh.z, isl.z + Math.cos(a) * (ISLAND_R + 55), dt);
            sh.heading = p.heading; sh.vx = sh.vz = 0;
          }
          continue;
        }
        if (p.dead) { sh.v = 0; sh.s = 0; sh.physics(dt, 0.5); continue; }
        const d = Math.hypot(sh.x - p.x, sh.z - p.z);
        // 원작: 15 밖이면 따라오고, 40 넘으면 두 배 속도, 100 넘으면 근처로 이동
        if (d > 100 * K) { const a = rand(0, TAU); sh.x = p.x + Math.cos(a) * 30 * K; sh.z = p.z + Math.sin(a) * 30 * K; }
        if (d > 15 * K) { sh.v = d > 40 * K ? sh.motor * 2 : sh.motor; sh.steerTo(Math.atan2(p.x - sh.x, p.z - sh.z), 0.01); }
        else if (d > 5 * K) { sh.v = sh.motor * 0.3; sh.steerTo(p.heading, 0.003); }
        else { sh.v = 0; sh.s = 0; }
        sh.physics(dt, 0.5);
        this.collideIslands(sh);
        for (const sd of [-1, 1]) {
          sh.cd[sd] -= dt;
          if (sh.cd[sd] > 0) continue;
          if (this.enemies.some(e => !e.dead && sh.inAtkBox(e.x, e.z, sh.body) === sd)) { sh.cd[sd] = 3; this.broadside(sh, sd, sh.atk, 'player', 20 * K, 20 * DEG); }
        }
      } else if (h.kind === 'gull') {
        const ph = this.t * 1.2 + h.phase;
        h.obj.position.set(p.x + Math.cos(ph) * 12 * K, 10 * K + Math.sin(ph * 2) * 4, p.z + Math.sin(ph) * 12 * K);
        h.obj.rotation.y = -ph;
        M.flap(h.obj, this.t + h.phase);
      } else if (h.kind === 'nessy') {
        const back = -p.len * 1.4, side = p.beam * 2;
        const tx = p.x + Math.sin(p.heading) * back + Math.cos(p.heading) * side;
        const tz = p.z + Math.cos(p.heading) * back - Math.sin(p.heading) * side;
        h.x = lerp(h.x, tx, dt * 1.5); h.z = lerp(h.z, tz, dt * 1.5);
        h.h = wrap(h.h + wrap(p.heading - h.h) * Math.min(1, dt * 2));
        h.obj.position.set(h.x, Math.sin(this.t * 2) * 0.6 - 0.8, h.z);
        h.obj.rotation.y = h.h;
      } else if (h.kind === 'pickup') {
        const sh = h.ship;
        if (this.parked != null || p.dead) { sh.v = 0; sh.s = 0; sh.physics(dt, 1); continue; }
        if (!h.target || !this.loot.includes(h.target)) h.target = this.loot.filter(l => !l.gift && Math.hypot(l.x - p.x, l.z - p.z) < 60 * K).sort((a, b) => Math.hypot(a.x - sh.x, a.z - sh.z) - Math.hypot(b.x - sh.x, b.z - sh.z))[0] || null;
        const tx = h.target ? h.target.x : p.x - Math.sin(p.heading) * 10 * K, tz = h.target ? h.target.z : p.z - Math.cos(p.heading) * 10 * K;
        const d = Math.hypot(tx - sh.x, tz - sh.z);
        if (Math.hypot(sh.x - p.x, sh.z - p.z) > 100 * K) { sh.x = p.x; sh.z = p.z + 20; }
        if (d > 3 * K) { sh.v = sh.motor; sh.steerTo(Math.atan2(tx - sh.x, tz - sh.z), 0.02); } else { sh.v = 0; sh.s = 0; }
        sh.physics(dt, 1);
        this.collideIslands(sh);
        if (h.target && d < 4 * K) {
          const l = h.target;
          this.collectLoot(l);
          this.world.remove(l.obj); this.loot.splice(this.loot.indexOf(l), 1);
          h.target = null;
        }
      }
    }
  }

  // ---------- 아레나 ----------
  nearGate() {
    if (this.arena || this.parked != null || !this.gateObj || this.player.dead) return false;
    const g = this.gateObj.position;
    return Math.hypot(this.player.x - g.x, this.player.z - g.z) < 45;
  }
  enterArena() {
    const p = this.player, A = this.arenaPos;
    for (const e of [...this.enemies]) this.removeEnemy(e);
    for (const i of this.islands) { i.gen = false; i.defenders = []; }
    this.arena = { kills: 0, lv: 0, t: 2 };
    this.auto = false;
    p.x = A.x; p.z = A.z + 120; p.vx = p.vz = 0; p.heading = Math.PI;
    this.camTarget.set(p.x, 0, p.z);
    this.ui.toast('아레나 입장! 문이 닫혔습니다', 'danger', 2000);
    this.sound.play('horn', 0.5);
  }
  updateArena(dt) {
    const A = this.arena;
    if (!A) return;
    const p = this.player;
    const dx = p.x - this.arenaPos.x, dz = p.z - this.arenaPos.z, r = Math.hypot(dx, dz);
    if (r > 205) { p.x = this.arenaPos.x + dx / r * 205; p.z = this.arenaPos.z + dz / r * 205; p.vx *= 0.3; p.vz *= 0.3; }
    if (p.dead) return;
    if (!this.enemies.some(e => !e.dead)) {
      A.t -= dt;
      if (A.t <= 0) {
        // 7척씩, 웨이브마다 레벨 상승 (이탈리아는 처음부터 최고)
        const idx = this.state.world === 1 ? 6 : Math.min(6, A.lv);
        for (let i = 0; i < 7; i++) {
          let x, z;
          do { x = rand(-30, 30) * K; z = rand(-30, 30) * K; } while (Math.hypot(x, z) < 30 * K);
          this.spawnEnemy(D.enemyLevelForTier(idx, this.state.world), { x: this.arenaPos.x + x * 0.8, z: this.arenaPos.z + z * 0.8, pirate: true, arena: true });
        }
        A.lv++;
        A.t = 2;
        this.sound.play('fanfare', 0.3);
      }
    }
    this.ui.arenaHud(A.kills);
  }
  endArena() {
    const A = this.arena;
    if (!A) return;
    const s = this.state, p = this.player;
    const reward = D.arenaReward(A.kills);
    const prev = s.best[s.world];
    if (A.kills > prev) s.best[s.world] = A.kills;
    for (const e of [...this.enemies]) this.removeEnemy(e);
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.bullets = [];
    this.arena = null;
    this.ui.arenaHud(null);
    this.ui.showArenaResult(A.kills, Math.max(prev, A.kills), reward, () => {
      if (reward > 0) this.addRes(0, reward);
      if (p.dead) { p.dead = false; p.hp = this.maxHp(); }
      p.obj.position.y = 0;
      const g = this.gateObj.position;
      p.x = g.x; p.z = g.z + 70; p.vx = p.vz = 0; p.heading = 0;
      this.camTarget.set(p.x, 0, p.z);
      this.save();
    });
  }

  // ---------- 바다 이동 ----------
  changeWorld() {
    const s = this.state;
    s.lastByWorld[s.world] = s.last;
    s.world = s.world === 0 ? 1 : 0;
    s.last = s.lastByWorld[s.world];
    s.done[s.world === 0 ? 0 : 28] = true;
    if (s.target < 0 || D.ISLANDS[s.target]?.world !== s.world || s.done[s.target]) s.target = this.nextTarget();
    this.parked = null;
    this.buildWorld();
    this.save();
  }

  // ---------- 카메라, 주변 ----------
  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    this.camSize = lerp(this.camSize, this.camSizeTarget, dt * 4);
    const half = this.camSize * K;
    const target = new THREE.Vector3(p.x, 0, p.z);
    if (this.parked != null) {
      // 정박 중에는 배가 메뉴에 가리지 않게
      if (this.vw > this.vh && this.vh <= 640) target.x += half * (this.vw / this.vh) * 0.45;
      else target.z += half * 0.9;
    }
    if (!this.camTarget) this.camTarget = target.clone();
    this.camTarget.lerp(target, Math.min(1, dt * 3));
    const asp = this.vw / this.vh;
    const c = this.camera;
    c.left = -half * asp; c.right = half * asp; c.top = half; c.bottom = -half;
    c.updateProjectionMatrix();
    // 원작: 남쪽에서 30도로 내려다봄
    const el = 30 * DEG, R = 1500;
    c.position.set(this.camTarget.x, Math.sin(el) * R, this.camTarget.z + Math.cos(el) * R);
    if (this.shake > 0) { this.shake -= dt; c.position.x += rand(-1, 1) * this.shake * 6; c.position.y += rand(-1, 1) * this.shake * 6; }
    c.lookAt(this.camTarget.x, 0, this.camTarget.z);
    this.particles.uniforms.scale.value = this.vh * this.renderer.getPixelRatio() / (2 * half);
    this.updateWater(this.camTarget.x, this.camTarget.z, dt);
    // 그림자: 화면 범위만 담도록 해를 따라 옮긴다
    const sh = this.sun.shadow.camera, ext = half * asp * 1.25 + 40;
    sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext; sh.updateProjectionMatrix();
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
    this.sun.position.set(this.camTarget.x - 160, 420, this.camTarget.z + 380);
    // 사거리 표시: 적이 가까이 있을 때만
    const pp = this.player;
    const close = this.parked == null && !pp.dead && this.enemies.some(e => !e.dead && Math.hypot(e.x - pp.x, e.z - pp.z) < FIRE_RANGE * 1.6);
    this.rangeRing.position.set(pp.x, 0.5, pp.z);
    this.rangeRing.material.opacity = lerp(this.rangeRing.material.opacity, close ? 0.22 + Math.sin(this.t * 3) * 0.05 : 0, dt * 4);
  }

  updateAmbience(dt) {
    const p = this.player;
    if (!p || !this.whales) return;
    for (const w of this.whales) {
      w.userData.h += Math.sin(this.t * 0.1 + w.position.x) * dt * 0.1;
      w.position.x += Math.sin(w.userData.h) * 6 * dt;
      w.position.z += Math.cos(w.userData.h) * 6 * dt;
      w.rotation.y = w.userData.h;
      if (Math.hypot(w.position.x - p.x, w.position.z - p.z) > 900) w.position.set(p.x + rand(-500, 500), -0.6, p.z + rand(-500, 500));
    }
    this.gulls.forEach((g, i) => {
      const u = g.userData;
      const ph = this.t * 0.35 + u.phase;
      g.position.set(p.x + Math.sin(i * 2.1) * 90 + Math.cos(ph) * u.r, u.h * 2, p.z - 40 + Math.cos(i * 1.7) * 70 + Math.sin(ph) * u.r);
      g.rotation.y = -ph;
      M.flap(g, this.t * 0.6 + i);
    });
  }
}

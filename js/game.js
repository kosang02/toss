import * as THREE from './three.module.min.js';
import * as D from './data.js';
import * as M from './models.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';

const TAU = Math.PI * 2;
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
const rand = (a, b) => a + Math.random() * (b - a);
const ARENA_CENTER = { x: 0, z: 2700 };
const ARENA_R = 230;

// ---------- 파티클 ----------
class Particles {
  constructor(scene, max = 2500) {
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
    this.uniforms = { scale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
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
    this.list.push({
      x: o.x, y: o.y ?? 0.5, z: o.z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
      life: o.life ?? 1, max: o.life ?? 1, size: o.size ?? 2, grow: o.grow ?? 0,
      r: c.r, g: c.g, b: c.b, a: o.alpha ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0,
    });
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

// ---------- 게임 ----------
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.bg = new THREE.Color(0x1d6a93);
    this.scene.background = this.bg;
    this.scene.fog = new THREE.Fog(0x2a7ea8, 260, 700);
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    this.zoom = 1;
    this.zoomTarget = 1;

    const hemi = new THREE.HemisphereLight(0xdff2ff, 0x2a5a78, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-60, 120, 40);
    this.scene.add(sun);

    this.makeWater();
    this.particles = new Particles(this.scene);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.sound = new Sound();
    this.ui = new UI(this);
    this.t = 0;
    this.enemies = [];
    this.balls = [];
    this.loot = [];
    this.islands = [];
    this.warnings = [];
    this.paused = true;
    this.input = { active: false, heading: 0, sx: 0, sy: 0, cx: 0, cy: 0, keys: new Set(), lastTap: 0, lastTapX: 0, lastTapY: 0, pinch: null };
    this.cruise = false;
    this.arena = null;
    this.fishing = null;
    this.docked = null;
    this.saveTimer = 0;
    this.hudTimer = 0;
    this.spawnTimer = 0;

    this.ballGeo = new THREE.SphereGeometry(0.75, 6, 5);
    this.ballMat = M.mat(0x1b1b1f);
    this.inkMat = M.mat(0x6a2a7a);

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.load();
    this.buildOcean(this.state.ocean);
    this.ui.showTitle(this.hasSave);
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- 저장 ----------
  freshState() {
    return {
      v: 1, coins: 300,
      cargo: { fish: 4, wood: 8, ore: 0, silver: 0, gold: 0, gem: 0 },
      lv: { body: 1, sail: 1, steer: 1, cannon: 1, fish: 1 },
      assistants: { escort: 0, seagull: 0, nessy: 0, dolphin: 0 },
      captured: { p0: true }, ocean: 0, lastIsland: 'p0', unlocked: [true, false],
      arenaBest: [0, 0], markets: {}, dokdo: false,
      stats: { kills: 0, deaths: 0, fished: 0, time: 0 },
      hp: null, pos: null,
    };
  }
  load() {
    this.hasSave = false;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(D.SAVE_KEY) || 'null'); } catch (e) { s = null; }
    const f = this.freshState();
    if (s && s.v === 1) {
      this.hasSave = true;
      this.state = { ...f, ...s, cargo: { ...f.cargo, ...s.cargo }, lv: { ...f.lv, ...s.lv }, assistants: { ...f.assistants, ...s.assistants }, stats: { ...f.stats, ...s.stats } };
    } else this.state = f;
    this.stats = D.playerStats(this.state.lv, this.state.assistants);
  }
  save() {
    if (!this.player) return;
    const s = this.state;
    s.hp = this.player.hp;
    if (!this.arena && !this.player.sinking) s.pos = { x: this.player.x, z: this.player.z, h: this.player.heading };
    try { localStorage.setItem(D.SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 저장 불가 환경 */ }
  }
  resetSave() {
    try { localStorage.removeItem(D.SAVE_KEY); } catch (e) { /* */ }
    location.reload();
  }
  exportSave() { this.save(); return btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); }
  importSave(str) {
    const s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    if (!s || s.v !== 1) throw new Error('bad');
    localStorage.setItem(D.SAVE_KEY, JSON.stringify(s));
    location.reload();
  }

  start(fresh) {
    if (fresh) {
      this.state = this.freshState();
      this.stats = D.playerStats(this.state.lv, this.state.assistants);
      this.buildOcean(0);
    }
    this.paused = false;
    document.body.classList.remove('intitle');
    this.sound.unlock();
    this.ui.updateHud(true);
    if (fresh) {
      this.ui.toast('바다를 누른 채 끌면 그 방향으로 항해합니다', 'info', 4500);
      setTimeout(() => this.ui.toast('적 배 옆구리를 향하면 대포가 자동으로 발사돼요', 'info', 4500), 4800);
    }
  }

  // ---------- 바다 ----------
  makeWater() {
    const size = 2600;
    this.waterTex = M.waterTexture();
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterRepeat = 20;
    this.waterTex.repeat.set(this.waterRepeat, this.waterRepeat);
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.waterTex, transparent: true, opacity: 0.8, fog: true }));
    this.water.renderOrder = 1;
    this.scene.add(this.water);
    this.causTex = M.causticTexture();
    this.causTex.wrapS = this.causTex.wrapT = THREE.RepeatWrapping;
    this.causRepeat = 34;
    this.causTex.repeat.set(this.causRepeat, this.causRepeat);
    this.caustic = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.causTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.caustic.position.y = 0.05;
    this.caustic.renderOrder = 2;
    this.scene.add(this.caustic);
    this.waterSize = size;
  }
  updateWater(cx, cz) {
    const snap = 50;
    const x = Math.round(cx / snap) * snap, z = Math.round(cz / snap) * snap;
    this.water.position.set(x, 0, z);
    this.caustic.position.set(x, 0.05, z);
    const tile = this.waterSize / this.waterRepeat;
    this.waterTex.offset.set(x / tile + this.t * 0.004, -z / tile + this.t * 0.002);
    const ct = this.waterSize / this.causRepeat;
    this.causTex.offset.set(x / ct - this.t * 0.012, -z / ct + this.t * 0.007);
    this.caustic.material.opacity = 0.42 + Math.sin(this.t * 0.9) * 0.12;
  }

  // ---------- 월드 구성 ----------
  clearWorld() {
    for (const e of this.enemies) this.world.remove(e.obj);
    for (const b of this.balls) this.scene.remove(b.mesh);
    for (const l of this.loot) this.world.remove(l.obj);
    for (const w of this.warnings) this.scene.remove(w.mesh);
    this.enemies = []; this.balls = []; this.loot = []; this.warnings = [];
    while (this.world.children.length) this.world.remove(this.world.children[0]);
    this.islands = [];
    this.ambient = null;
  }

  buildOcean(oceanId) {
    this.clearWorld();
    const s = this.state;
    s.ocean = oceanId;
    const ocean = D.OCEANS[oceanId];
    const home = ocean.islands.find(i => i.home);
    s.captured[home.id] = true;
    for (const def of ocean.islands) {
      const obj = M.makeIsland(def);
      obj.position.set(def.x, 0, def.z);
      const container = new THREE.Group();
      container.add(obj);
      const refl = M.makeReflection(obj);
      refl.position.copy(obj.position);
      container.add(refl);
      this.world.add(container);
      const isl = {
        def, obj, refl, x: def.x, z: def.z, radius: obj.userData.radius,
        dock: { x: def.x + obj.userData.dockOffset.x, z: def.z + obj.userData.dockOffset.z },
        defenders: [], engaged: false,
      };
      M.setIslandOwned(obj, !!s.captured[def.id]);
      M.setIslandOwned(refl, !!s.captured[def.id]);
      this.islands.push(isl);
    }
    // 아레나 입구
    const gate = M.makeArenaGate();
    gate.position.set(ocean.arena.x, 0, ocean.arena.z);
    this.world.add(gate);
    const gr = M.makeReflection(gate); gr.position.copy(gate.position); this.world.add(gr);
    this.gate = { x: ocean.arena.x, z: ocean.arena.z, obj: gate };
    // 아레나 부표
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      const b = M.makeBuoy(i % 2 ? 0xd8342c : 0xf4f4f4);
      b.position.set(ARENA_CENTER.x + Math.cos(a) * ARENA_R, 0, ARENA_CENTER.z + Math.sin(a) * ARENA_R);
      this.world.add(b);
    }
    // 고래 그림자, 갈매기
    this.whales = [];
    for (let i = 0; i < 3; i++) {
      const w = M.makeWhaleShadow();
      w.position.set(rand(-800, 800), -0.6, rand(-800, 800));
      w.userData.h = rand(0, TAU);
      this.world.add(w);
      this.whales.push(w);
    }
    this.gulls = [];
    for (let i = 0; i < 5; i++) {
      const g = M.makeSeagull();
      g.userData.phase = rand(0, TAU); g.userData.r = rand(30, 70); g.userData.h = rand(26, 40);
      this.world.add(g);
      this.gulls.push(g);
    }

    if (!this.player) this.createPlayer();
    else this.world.add(this.player.obj);
    this.createAssistants();

    // 시작 위치
    const last = this.islands.find(i => i.def.id === s.lastIsland) || this.islands.find(i => i.def.home);
    if (s.pos && !this.started) {
      this.player.x = s.pos.x; this.player.z = s.pos.z; this.player.heading = s.pos.h ?? Math.PI;
    } else this.placeAtDock(last);
    this.player.hp = s.hp != null && !this.started ? Math.min(s.hp, this.stats.maxHp) : this.stats.maxHp;
    if (this.player.hp <= 0) this.player.hp = this.stats.maxHp;
    this.started = true;
    this.camTarget = new THREE.Vector3(this.player.x, 0, this.player.z);
    this.ui && this.ui.updateHud(true);
  }

  placeAtDock(isl) {
    const p = this.player;
    p.x = isl.dock.x + 12; p.z = isl.dock.z - 2; p.heading = 0; p.speed = 0;
    this.state.lastIsland = isl.def.id;
  }

  createPlayer() {
    const p = { x: 0, z: 0, heading: Math.PI, speed: 0, hp: 100, cd: { '-1': 0, '1': 0 }, lastCombat: -99, lookTier: -1, wakeT: 0 };
    p.obj = new THREE.Group();
    this.player = p;
    this.rebuildPlayerShip();
    this.world.add(p.obj);
  }

  rebuildPlayerShip() {
    const p = this.player;
    const look = M.playerShipLook(this.state.lv.body);
    const guns = this.stats.guns;
    if (look.tier === p.lookTier && guns === p.guns) return;
    p.lookTier = look.tier; p.guns = guns;
    while (p.obj.children.length) p.obj.remove(p.obj.children[0]);
    const model = M.makeShip({ ...look, guns });
    p.model = model;
    p.radius = model.userData.radius;
    p.obj.add(model);
    p.refl = M.makeReflection(model);
    p.obj.add(p.refl);
  }

  createAssistants() {
    if (this.assist) for (const k in this.assist) if (this.assist[k]) this.world.remove(this.assist[k].obj);
    this.assist = {};
    const a = this.state.assistants;
    const p = this.player;
    if (a.escort > 0) {
      const obj = new THREE.Group();
      const m = M.makeShip({ len: 9, masts: 1, sail: 0xe4ecf6, emblem: 'crest', hull: 0x8b5a2b, band: 0x1e2340, trim: 0xe8c02e, guns: 1 });
      obj.add(m); obj.add(M.makeReflection(m));
      obj.position.set(p.x - 15, 0, p.z - 10);
      this.world.add(obj);
      this.assist.escort = { obj, model: m, x: p.x - 15, z: p.z - 10, h: p.heading, cd: 0 };
    }
    if (a.seagull > 0) {
      const obj = new THREE.Group();
      const gs = [];
      for (let i = 0; i < 2; i++) { const g = M.makeSeagull(); g.userData.phase = i * Math.PI; obj.add(g); gs.push(g); }
      this.world.add(obj);
      this.assist.seagull = { obj, gs };
    }
    if (a.nessy > 0) {
      const obj = M.makeNessy();
      this.world.add(obj);
      this.assist.nessy = { obj, x: p.x, z: p.z, h: p.heading };
    }
    if (a.dolphin > 0) {
      const obj = M.makeDolphin();
      this.world.add(obj);
      this.assist.dolphin = { obj, t: 0 };
    }
  }

  refreshStats() {
    const oldMax = this.stats.maxHp;
    this.stats = D.playerStats(this.state.lv, this.state.assistants);
    if (this.player) {
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + Math.max(0, this.stats.maxHp - oldMax));
      this.rebuildPlayerShip();
    }
    this.ui.updateHud(true);
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
        this.input.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoomTarget };
        this.input.active = false;
        this.ui.steer(null);
        return;
      }
      if (this.paused || this.docked) return;
      const now = performance.now();
      const I = this.input;
      if (now - I.lastTap < 450 && Math.hypot(e.clientX - I.lastTapX, e.clientY - I.lastTapY) < 60) {
        // 두 번 탭: 그 방향으로 계속 항해
        const sp = this.shipScreen();
        const dx = e.clientX - sp.x, dy = e.clientY - sp.y;
        this.cruiseHeading = Math.hypot(dx, dy) > 30 ? Math.atan2(dx, dy) : this.player.heading;
        this.cruise = true;
        I.lastTap = 0;
        I.active = false;
        this.ui.toast('계속 항해 중 · 다시 끌면 직접 조종', 'info', 1600);
        return;
      }
      I.lastTap = now; I.lastTapX = e.clientX; I.lastTapY = e.clientY;
      I.active = true; I.sx = e.clientX; I.sy = e.clientY; I.cx = e.clientX; I.cy = e.clientY;
      I.moved = false;
    });
    c.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const I = this.input;
      if (I.pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomTarget = clamp(I.pinch.z * I.pinch.d / d, 0.6, 2.4);
        return;
      }
      if (!I.active) return;
      I.cx = e.clientX; I.cy = e.clientY;
      const dx = I.cx - I.sx, dy = I.cy - I.sy;
      if (Math.hypot(dx, dy) > 10) {
        I.heading = Math.atan2(dx, dy);
        I.moved = true;
        this.cruise = false;
      }
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) this.input.pinch = null;
      if (pts.size === 0) { this.input.active = false; this.ui.steer(null); }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomTarget = clamp(this.zoomTarget * (e.deltaY > 0 ? 1.1 : 0.9), 0.6, 2.4);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this.input.keys.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.input.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.input.keys.clear());
  }

  shipScreen() {
    const v = new THREE.Vector3(this.player.x, 2, this.player.z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top };
  }

  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * this.vw, y: (1 - v.y) / 2 * this.vh };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.vw = w; this.vh = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 세로 화면에서는 시야를 넓힌다
    this.camera.fov = w < h ? 52 : 40;
    this.camera.updateProjectionMatrix();
    this.particles.uniforms.scale.value = h * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360));
  }

  // ---------- 메인 루프 ----------
  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (!this.paused) this.update(dt);
    this.updateCamera(dt);
    this.updateAmbience(dt);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (!this.paused) this.ui.frame(dt);
  }

  update(dt) {
    this.state.stats.time += dt;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBalls(dt);
    this.updateWarnings(dt);
    this.updateLoot(dt);
    this.updateIslands(dt);
    this.updateSpawns(dt);
    this.updateAssistants(dt);
    this.updateFishing(dt);
    this.updateArena(dt);
    this.saveTimer += dt;
    if (this.saveTimer > 5) { this.saveTimer = 0; this.save(); }
    this.hudTimer += dt;
    if (this.hudTimer > 0.25) { this.hudTimer = 0; this.ui.updateHud(); }
  }

  // ---------- 플레이어 ----------
  updatePlayer(dt) {
    const p = this.player, st = this.stats, I = this.input;
    if (p.sinking) {
      p.sinkT += dt;
      p.obj.position.y = -p.sinkT * 3;
      p.model.rotation.z = Math.min(1.2, p.sinkT * 0.6);
      p.refl.visible = false;
      return;
    }
    let desired = p.heading, throttle = 0;
    // 키보드
    const K = I.keys;
    let kx = 0, kz = 0;
    if (K.has('arrowup') || K.has('w')) kz -= 1;
    if (K.has('arrowdown') || K.has('s')) kz += 1;
    if (K.has('arrowleft') || K.has('a')) kx -= 1;
    if (K.has('arrowright') || K.has('d')) kx += 1;
    if (this.docked) {
      const isl = this.islands.find(i => i.def.id === this.docked);
      const tx = isl.dock.x + 12, tz = isl.dock.z - 2;
      p.x += (tx - p.x) * Math.min(1, dt * 2);
      p.z += (tz - p.z) * Math.min(1, dt * 2);
      p.heading += wrap(0 - p.heading) * Math.min(1, dt * 2);
      p.speed = 0;
    } else {
      if (kx || kz) { desired = Math.atan2(kx, kz); throttle = 1; this.cruise = false; }
      else if (I.active && I.moved) { desired = I.heading; throttle = 1; }
      else if (this.cruise) { desired = this.cruiseHeading; throttle = 1; }
      if (this.fishing) throttle = 0;
      const diff = wrap(desired - p.heading);
      const turn = st.turn * dt * (0.6 + 0.4 * Math.min(1, p.speed / st.speed + 0.3));
      p.heading = wrap(p.heading + clamp(diff, -turn, turn));
      const target = st.speed * throttle * (Math.abs(diff) > 1.6 ? 0.55 : 1);
      p.speed += (target - p.speed) * Math.min(1, dt * (throttle ? 0.9 : 0.7));
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.turnDiff = diff;
      this.collideIslands(p);
      // 경계
      if (this.arena) {
        const dx = p.x - ARENA_CENTER.x, dz = p.z - ARENA_CENTER.z, d = Math.hypot(dx, dz);
        const lim = ARENA_R - p.radius - 4;
        if (d > lim) { p.x = ARENA_CENTER.x + dx / d * lim; p.z = ARENA_CENTER.z + dz / d * lim; }
      } else {
        const lim = D.OCEAN_HALF;
        if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) {
          if (!this.edgeWarned) { this.ui.toast('더 이상 나아갈 수 없습니다', 'warn', 1500); this.edgeWarned = true; }
        } else this.edgeWarned = false;
        p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
      }
      if (I.active && I.moved) this.ui.steer(I);
      else this.ui.steer(null);
    }
    // 표현
    p.obj.position.set(p.x, Math.sin(this.t * 1.6) * 0.15, p.z);
    p.obj.rotation.y = p.heading;
    p.model.rotation.z = clamp(-(p.turnDiff || 0) * 0.12, -0.12, 0.12) * Math.min(1, p.speed / 8) + Math.sin(this.t * 1.3) * 0.02;
    p.model.rotation.x = Math.sin(this.t * 1.1) * 0.015;
    p.refl.rotation.copy(p.model.rotation);
    // 항적
    p.wakeT -= dt;
    if (p.speed > 3 && p.wakeT <= 0) {
      p.wakeT = 0.05;
      const L = p.model.userData.len;
      const bx = p.x - Math.sin(p.heading) * L * 0.45, bz = p.z - Math.cos(p.heading) * L * 0.45;
      for (const s of [-1, 1]) {
        const sx = Math.cos(p.heading) * s * L * 0.18, sz = -Math.sin(p.heading) * s * L * 0.18;
        this.particles.emit({ x: bx + sx, y: 0.3, z: bz + sz, vx: sx * 0.3, vz: sz * 0.3, life: 1.6, size: L * 0.2, grow: L * 0.25, color: 0xe6f6ff, alpha: 0.55 });
      }
      this.particles.emit({ x: p.x + Math.sin(p.heading) * L * 0.5, y: 0.4, z: p.z + Math.cos(p.heading) * L * 0.5, life: 0.6, size: L * 0.12, grow: L * 0.2, color: 0xffffff, alpha: 0.6 });
    }
    // 방어 함대가 없는 자기 섬 근처에서는 천천히 회복
    if (!this.arena && this.t - p.lastCombat > 5) {
      const near = this.islands.some(i => this.state.captured[i.def.id] && dist2(i.x, i.z, p.x, p.z) < (i.radius + 160) ** 2);
      if (near || this.docked) p.hp = Math.min(st.maxHp, p.hp + st.maxHp * 0.006 * dt);
    }
    // 자동 포격
    for (const side of [-1, 1]) {
      p.cd[side] -= dt;
      if (p.cd[side] > 0 || this.docked) continue;
      const tgt = this.findTarget(p.x, p.z, p.heading, side, st.range);
      if (tgt) {
        p.cd[side] = st.reload;
        this.fireBroadside(p, side, tgt, st.dmg * (1 + 0.25 * (st.guns - 1)), 'player');
        p.lastCombat = this.t;
      }
    }
  }

  collideIslands(e) {
    for (const isl of this.islands) {
      const r = isl.radius + (e.radius || 6) * 0.7;
      const d2 = dist2(isl.x, isl.z, e.x, e.z);
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 1;
        e.x = isl.x + (e.x - isl.x) / d * r;
        e.z = isl.z + (e.z - isl.z) / d * r;
        e.speed *= 0.9;
      }
    }
  }

  findTarget(x, z, heading, side, range) {
    let best = null, bd = range * range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const er = e.radius;
      const d2 = dist2(x, z, e.x, e.z);
      if (d2 > (range + er) ** 2) continue;
      const rel = wrap(Math.atan2(e.x - x, e.z - z) - heading);
      if (Math.abs(wrap(rel - side * Math.PI / 2)) > 0.8) continue;
      if (d2 < bd + er * er * 4) { bd = d2; best = e; }
    }
    return best;
  }

  fireBroadside(ship, side, target, volley, owner) {
    const slots = (ship.model.userData.slots || []).filter(s => s.side === side);
    const guns = Math.max(1, slots.length);
    const per = volley / guns;
    const h = ship.heading;
    const cos = Math.cos(h), sin = Math.sin(h);
    (slots.length ? slots : [{ x: side * 4, z: 0 }]).forEach((s, i) => {
      setTimeout(() => {
        if (ship.dead || (ship === this.player && ship.sinking)) return;
        const hh = ship.heading, c2 = Math.cos(hh), s2 = Math.sin(hh);
        const sx = ship.x + s.x * c2 + s.z * s2;
        const sz = ship.z - s.x * s2 + s.z * c2;
        this.spawnBall(sx, sz, target, per, owner, ship.scaleBall || 1);
        for (let k = 0; k < 4; k++) this.particles.emit({ x: sx, y: 2.5, z: sz, vx: side * c2 * rand(2, 6), vy: rand(1, 3), vz: -side * s2 * rand(2, 6), life: 0.9, size: 3, grow: 6, color: 0xd8d8d8, alpha: 0.7, drag: 2 });
        this.particles.emit({ x: sx, y: 2.5, z: sz, life: 0.15, size: 5, color: 0xffc040, alpha: 1 });
      }, i * 90);
    });
    this.sound.play('cannon', owner === 'player' ? 0.5 : 0.25, this.soundPan(ship.x));
  }

  soundPan(x) { return clamp((x - this.player.x) / 150, -1, 1); }

  spawnBall(x, z, target, dmg, owner, scale = 1, ink = false) {
    const tx0 = target.x, tz0 = target.z;
    const d = Math.hypot(tx0 - x, tz0 - z);
    const dur = Math.max(0.3, d / 105);
    const vx = Math.sin(target.heading || 0) * (target.speed || 0);
    const vz = Math.cos(target.heading || 0) * (target.speed || 0);
    const spread = owner === 'player' ? 1.5 : 3.5;
    const tx = tx0 + vx * dur * 0.9 + rand(-spread, spread), tz = tz0 + vz * dur * 0.9 + rand(-spread, spread);
    const mesh = new THREE.Mesh(this.ballGeo, ink ? this.inkMat : this.ballMat);
    mesh.scale.setScalar(scale * (ink ? 2.2 : 1));
    this.scene.add(mesh);
    this.balls.push({ mesh, x0: x, z0: z, tx, tz, t: 0, dur, h: d * 0.12 + 3, dmg, owner, ink });
  }

  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const x = b.x0 + (b.tx - b.x0) * k, z = b.z0 + (b.tz - b.z0) * k;
      b.mesh.position.set(x, 2.5 + Math.sin(k * Math.PI) * b.h - k * 2.5, z);
      if (k < 1) continue;
      this.scene.remove(b.mesh);
      this.balls.splice(i, 1);
      this.impact(b, x, z);
    }
  }

  impact(b, x, z) {
    let hit = null;
    if (b.owner === 'player' || b.owner === 'escort') {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist2(e.x, e.z, x, z) < (e.radius + 3) ** 2) { hit = e; break; }
      }
      if (hit) this.damageEnemy(hit, b.dmg);
    } else {
      const p = this.player;
      if (!p.sinking && dist2(p.x, p.z, x, z) < (p.radius + 3) ** 2) { hit = p; this.damagePlayer(b.dmg); }
    }
    if (hit) {
      for (let k = 0; k < 10; k++) this.particles.emit({ x, y: 3, z, vx: rand(-8, 8), vy: rand(3, 12), vz: rand(-8, 8), grav: 18, life: 0.6, size: 1.6, color: b.ink ? 0x8a3aa0 : (k % 2 ? 0xffa030 : 0x5a3a20) });
      for (let k = 0; k < 3; k++) this.particles.emit({ x, y: 4, z, vy: 2, life: 1.2, size: 4, grow: 6, color: 0x555555, alpha: 0.6 });
      this.sound.play('hit', 0.35, this.soundPan(x));
    } else {
      for (let k = 0; k < 8; k++) this.particles.emit({ x, y: 0.5, z, vx: rand(-3, 3), vy: rand(6, 14), vz: rand(-3, 3), grav: 25, life: 0.8, size: 1.8, color: 0xffffff, alpha: 0.9 });
      this.particles.emit({ x, y: 0.3, z, life: 0.8, size: 3, grow: 10, color: 0xe6f6ff, alpha: 0.7 });
      this.sound.play('splash', 0.2, this.soundPan(x));
    }
  }

  damagePlayer(dmg) {
    const p = this.player;
    if (p.sinking || this.docked) return;
    p.hp -= dmg;
    p.lastCombat = this.t;
    this.ui.floatText(p.x, 8, p.z, '-' + D.fmt(dmg), '#ff6b6b');
    this.ui.hurt();
    if (p.hp <= 0) this.playerSunk();
  }

  playerSunk() {
    const p = this.player;
    p.hp = 0;
    p.sinking = true; p.sinkT = 0;
    this.cruise = false;
    this.fishing = null;
    this.sound.play('sink', 0.6);
    for (let k = 0; k < 30; k++) this.particles.emit({ x: p.x + rand(-5, 5), y: 3, z: p.z + rand(-5, 5), vx: rand(-6, 6), vy: rand(4, 14), vz: rand(-6, 6), grav: 14, life: 1.2, size: 3, color: k % 2 ? 0xff8030 : 0x333333 });
    if (this.arena) {
      setTimeout(() => this.endArena(true), 1500);
      return;
    }
    this.state.stats.deaths++;
    const lost = { ...this.state.cargo };
    for (const k of D.GOOD_IDS) this.state.cargo[k] = 0;
    this.save();
    setTimeout(() => this.ui.showDeath(lost, () => this.respawn()), 1400);
  }

  respawn() {
    const p = this.player;
    p.sinking = false;
    p.obj.position.y = 0;
    p.model.rotation.set(0, 0, 0);
    p.refl.visible = true;
    p.hp = this.stats.maxHp;
    // 교전 중이던 섬 방어 함대와 주변 해적 정리
    for (const isl of this.islands) this.disengage(isl);
    for (const e of this.enemies) this.world.remove(e.obj);
    this.enemies = [];
    for (const b of this.balls) this.scene.remove(b.mesh);
    this.balls = [];
    const isl = this.islands.find(i => i.def.id === this.state.lastIsland) || this.islands.find(i => i.def.home);
    this.placeAtDock(isl);
    this.camTarget.set(p.x, 0, p.z);
    this.save();
    this.ui.updateHud(true);
  }

  // ---------- 적 ----------
  spawnEnemy(typeId, tier, x, z, opts = {}) {
    const T = D.ENEMY_TYPES[typeId];
    const st = D.enemyStats(typeId, tier);
    const obj = new THREE.Group();
    let model;
    if (T.boss) {
      model = M.makeKraken();
    } else {
      model = M.makeShip({ len: 14 * T.scale, masts: T.masts, sail: T.sail, emblem: T.sail === 0x1d1d22 ? 'skull' : 'none', hull: T.hull, trim: T.trim, band: T.dragon ? 0x2a2140 : null, guns: T.guns, dragon: T.dragon, flag: 0x1d1d22 });
    }
    obj.add(model);
    const refl = M.makeReflection(model);
    obj.add(refl);
    obj.position.set(x, 0, z);
    this.world.add(obj);
    const e = {
      typeId, T, tier, obj, model, refl, x, z, heading: opts.heading ?? rand(0, TAU), speed: 0,
      hp: st.hp, maxHp: st.hp, dmg: st.dmg, loot: st.loot,
      cd: { '-1': rand(0.5, 2), '1': rand(0.5, 2) }, radius: model.userData.radius,
      anchor: opts.anchor || { x, z }, leash: opts.leash || 300, island: opts.island || null, roam: !!opts.roam, arena: !!opts.arena,
      aggro: !!opts.aggro, wander: { x, z, t: 0 }, orbit: Math.random() < 0.5 ? 1 : -1, id: Math.random().toString(36).slice(2),
      scaleBall: T.scale > 1.4 ? 1.4 : 1,
    };
    this.enemies.push(e);
    return e;
  }

  updateEnemies(dt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        e.sinkT += dt;
        e.obj.position.y = -e.sinkT * 3.5;
        e.model.rotation.z = Math.min(1.1, e.sinkT * 0.7) * e.orbit;
        e.refl.visible = false;
        if (e.sinkT > 2.4) { this.world.remove(e.obj); this.enemies.splice(i, 1); }
        continue;
      }
      if (e.T.boss) { this.updateKraken(e, dt); continue; }
      const dx = p.x - e.x, dz = p.z - e.z;
      const d = Math.hypot(dx, dz);
      if (!p.sinking && !this.docked) {
        if (d < 140 || (e.island && e.island.engaged) || e.arena) e.aggro = true;
      }
      if (p.sinking || this.docked) e.aggro = false;
      if (e.roam && d > 460) e.aggro = false;
      const ax = e.x - e.anchor.x, az = e.z - e.anchor.z;
      const leashed = Math.hypot(ax, az) > e.leash;
      let desired = e.heading, spd = 0;
      if (e.aggro && !leashed) {
        const toP = Math.atan2(dx, dz);
        const R = e.T.range;
        if (d > R * 0.85) { desired = toP; spd = e.T.speed; }
        else {
          // 옆구리를 보이며 선회
          desired = toP + e.orbit * Math.PI / 2 * (d < R * 0.45 ? 1.4 : 1);
          spd = e.T.speed * 0.75;
        }
      } else if (leashed) {
        desired = Math.atan2(e.anchor.x - e.x, e.anchor.z - e.z); spd = e.T.speed * 0.8;
      } else {
        e.wander.t -= dt;
        if (e.wander.t <= 0) {
          e.wander.t = rand(4, 9);
          const a = rand(0, TAU), r = rand(20, Math.min(120, e.leash * 0.5));
          e.wander.x = e.anchor.x + Math.cos(a) * r; e.wander.z = e.anchor.z + Math.sin(a) * r;
        }
        desired = Math.atan2(e.wander.x - e.x, e.wander.z - e.z);
        spd = dist2(e.x, e.z, e.wander.x, e.wander.z) > 100 ? e.T.speed * 0.4 : 0;
      }
      const diff = wrap(desired - e.heading);
      e.heading = wrap(e.heading + clamp(diff, -0.9 * dt, 0.9 * dt));
      e.speed += (spd - e.speed) * Math.min(1, dt * 0.8);
      e.x += Math.sin(e.heading) * e.speed * dt;
      e.z += Math.cos(e.heading) * e.speed * dt;
      this.collideIslands(e);
      // 적끼리 겹치지 않게
      for (const o of this.enemies) {
        if (o === e || o.dead) continue;
        const rr = (o.radius + e.radius) * 0.8;
        const q = dist2(o.x, o.z, e.x, e.z);
        if (q < rr * rr && q > 0.01) {
          const dd = Math.sqrt(q);
          e.x += (e.x - o.x) / dd * (rr - dd) * 0.5; e.z += (e.z - o.z) / dd * (rr - dd) * 0.5;
        }
      }
      if (this.arena) {
        const qx = e.x - ARENA_CENTER.x, qz = e.z - ARENA_CENTER.z, qd = Math.hypot(qx, qz);
        if (qd > ARENA_R - 6) { e.x = ARENA_CENTER.x + qx / qd * (ARENA_R - 6); e.z = ARENA_CENTER.z + qz / qd * (ARENA_R - 6); }
      }
      e.obj.position.set(e.x, Math.sin(this.t * 1.5 + e.x) * 0.15, e.z);
      e.obj.rotation.y = e.heading;
      e.model.rotation.z = clamp(-diff * 0.1, -0.1, 0.1);
      e.refl.rotation.copy(e.model.rotation);
      // 포격
      if (e.aggro && !p.sinking && !this.docked) {
        for (const side of [-1, 1]) {
          e.cd[side] -= dt;
          if (e.cd[side] > 0) continue;
          if (d > e.T.range + p.radius) continue;
          const rel = wrap(Math.atan2(dx, dz) - e.heading);
          if (Math.abs(wrap(rel - side * Math.PI / 2)) > 0.75) continue;
          e.cd[side] = e.T.reload * rand(0.9, 1.25);
          this.fireBroadside(e, side, p, e.dmg, 'enemy');
        }
      }
      // 큰 피해를 입으면 불이 난다
      if (e.hp < e.maxHp * 0.4 && Math.random() < dt * 8) {
        this.particles.emit({ x: e.x + rand(-2, 2), y: 4, z: e.z + rand(-2, 2), vy: rand(4, 8), life: 0.7, size: 2.5, grow: 2, color: Math.random() < 0.5 ? 0xff7a20 : 0xffc040 });
        this.particles.emit({ x: e.x, y: 6, z: e.z, vy: 5, life: 1.6, size: 3, grow: 5, color: 0x3a3a3a, alpha: 0.5 });
      }
      // 배회하던 해적이 멀어지면 정리
      if (e.roam && d > 760) { this.world.remove(e.obj); this.enemies.splice(i, 1); }
    }
  }

  updateKraken(e, dt) {
    const p = this.player;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    e.attackAnim = Math.max(0, (e.attackAnim || 0) - dt);
    M.animateKraken(e.model, this.t, e.attackAnim);
    e.obj.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
    e.refl.visible = false;
    if (p.sinking || this.docked || !e.island?.engaged) return;
    e.slamCd = (e.slamCd ?? 2) - dt;
    e.inkCd = (e.inkCd ?? 3) - dt;
    if (d < 110 && e.slamCd <= 0) {
      e.slamCd = 3.4;
      e.attackAnim = 1;
      this.addWarning(p.x, p.z, 16, 1.15, () => {
        if (dist2(p.x, p.z, this._wx, this._wz) < (16 + p.radius * 0.5) ** 2) this.damagePlayer(e.dmg * 1.6);
        for (let k = 0; k < 20; k++) this.particles.emit({ x: this._wx + rand(-8, 8), y: 1, z: this._wz + rand(-8, 8), vy: rand(8, 16), grav: 22, life: 1, size: 2.4, color: 0xffffff });
        this.sound.play('splash', 0.6);
      });
    }
    if (d < 170 && e.inkCd <= 0) {
      e.inkCd = 2.2;
      this.spawnBall(e.x, e.z, p, e.dmg * 0.7, 'enemy', 1, true);
    }
  }

  addWarning(x, z, r, delay, fn) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 32), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.4, z);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.2, depthWrite: false }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(x, 0.35, z);
    this.scene.add(inner);
    this.warnings.push({ mesh, inner, x, z, t: 0, delay, fn });
  }
  updateWarnings(dt) {
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.t += dt;
      w.inner.scale.setScalar(Math.min(1, w.t / w.delay));
      if (w.t >= w.delay) {
        this.scene.remove(w.mesh); this.scene.remove(w.inner);
        this.warnings.splice(i, 1);
        this._wx = w.x; this._wz = w.z;
        w.fn();
      }
    }
  }

  damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    e.aggro = true;
    this.ui.floatText(e.x, 10, e.z, D.fmt(dmg), '#ffe066');
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true; e.sinkT = 0;
    if (e.island && e.island.remaining) e.island.remaining = e.island.remaining.filter(r => r !== e.slot);
    this.state.stats.kills++;
    this.sound.play('explode', 0.5, this.soundPan(e.x));
    for (let k = 0; k < 26; k++) this.particles.emit({ x: e.x + rand(-4, 4), y: 4, z: e.z + rand(-4, 4), vx: rand(-10, 10), vy: rand(4, 16), vz: rand(-10, 10), grav: 16, life: 1.1, size: 3, color: k % 3 ? 0xff8a30 : 0x2a2a2a });
    for (let k = 0; k < 6; k++) this.particles.emit({ x: e.x + rand(-4, 4), y: 6, z: e.z + rand(-4, 4), vy: 4, life: 2.2, size: 6, grow: 8, color: 0x444444, alpha: 0.5 });
    if (this.arena) {
      this.arena.kills++;
      this.arena.reward += Math.round(e.loot * 0.7);
      return;
    }
    this.dropLoot(e);
  }

  dropLoot(e) {
    const t = e.tier;
    const goods = {};
    const roll = (id, chance, n) => { if (Math.random() < chance) goods[id] = (goods[id] || 0) + n; };
    roll('wood', 0.85, 1 + Math.floor(t / 2) + Math.floor(Math.random() * 3));
    if (t >= 2) roll('ore', 0.55, 1 + Math.floor(t / 4));
    if (t >= 4) roll('silver', 0.35, 1 + Math.floor((t - 4) / 4));
    if (t >= 7) roll('gold', 0.25, 1 + Math.floor((t - 7) / 4));
    if (t >= 10) roll('gem', 0.04, 1);
    if (e.T.boss) { goods.gem = 3; goods.gold = 10; }
    const coins = Math.round(e.loot * rand(0.8, 1.2));
    const n = e.T.boss ? 6 : 1;
    for (let i = 0; i < n; i++) {
      const obj = M.makeLoot(i === 0 && Object.keys(goods).length ? 'crate' : 'coin');
      const x = e.x + rand(-5, 5) + (n > 1 ? rand(-20, 20) : 0), z = e.z + rand(-5, 5) + (n > 1 ? rand(-20, 20) : 0);
      obj.position.set(x, 0, z);
      this.world.add(obj);
      this.loot.push({ obj, x, z, coins: Math.round(coins / n), goods: i === 0 ? goods : {}, t: 0 });
    }
  }

  updateLoot(dt) {
    const p = this.player;
    const mag = this.stats.magnet + p.radius;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.t += dt;
      l.obj.position.y = Math.sin(this.t * 2 + l.x) * 0.3;
      l.obj.rotation.y += dt;
      const d = Math.hypot(p.x - l.x, p.z - l.z);
      if (!p.sinking && d < mag) {
        const k = Math.min(1, dt * 6);
        l.x += (p.x - l.x) * k; l.z += (p.z - l.z) * k;
        l.obj.position.x = l.x; l.obj.position.z = l.z;
        if (d < p.radius + 2) {
          this.collect(l);
          this.world.remove(l.obj);
          this.loot.splice(i, 1);
          continue;
        }
      }
      if (l.t > 90) { this.world.remove(l.obj); this.loot.splice(i, 1); }
    }
  }

  cargoUsed() { return D.GOOD_IDS.reduce((s, k) => s + this.state.cargo[k], 0); }

  addCargo(goods) {
    const got = {};
    let full = false;
    for (const k of D.GOOD_IDS) {
      if (!goods[k]) continue;
      const free = this.stats.cargo - this.cargoUsed();
      const n = Math.min(goods[k], free);
      if (n < goods[k]) full = true;
      if (n > 0) { this.state.cargo[k] += n; got[k] = n; }
    }
    if (full) this.ui.toast('선창이 가득 찼습니다', 'warn', 1500);
    return got;
  }

  collect(l) {
    this.state.coins += l.coins;
    const got = this.addCargo(l.goods);
    this.sound.play('coin', 0.4);
    const parts = [`+${D.fmt(l.coins)}`];
    this.ui.floatText(this.player.x, 12, this.player.z, parts.join(' '), '#ffd84a');
    let off = 0;
    for (const k in got) { off += 3; this.ui.floatText(this.player.x, 12 + off, this.player.z, `${D.GOODS.find(g => g.id === k).name} +${got[k]}`, '#bfe9ff'); }
    this.ui.updateHud(true);
  }

  // ---------- 섬 ----------
  updateIslands(dt) {
    if (this.arena) return;
    const p = this.player;
    let banner = null;
    let nearDock = null;
    for (const isl of this.islands) {
      const id = isl.def.id;
      const d = Math.hypot(p.x - isl.x, p.z - isl.z);
      if (isl.obj.userData.spin) isl.obj.userData.spin.rotation.z += dt * 0.8;
      const sm = isl.obj.userData.smoke;
      if (sm && d < 600 && Math.random() < dt * 6) this.particles.emit({ x: isl.x + sm.x + rand(-3, 3), y: sm.y, z: isl.z + sm.z + rand(-3, 3), vx: rand(-1, 1), vy: rand(5, 8), vz: rand(-1, 1), life: 3.5, size: 6, grow: 10, color: 0x6a6a6a, alpha: 0.45 });
      if (this.state.captured[id]) {
        if (Math.hypot(p.x - isl.dock.x, p.z - isl.dock.z) < 32) nearDock = isl;
        continue;
      }
      if (!isl.engaged && !p.sinking && d < isl.radius + 170) this.engage(isl);
      if (isl.engaged) {
        const alive = isl.defenders.filter(e => !e.dead).length;
        if (d > isl.radius + 650) { this.disengage(isl); continue; }
        if (alive === 0) { this.capture(isl); continue; }
        if (d < isl.radius + 500) banner = `⚔ ${isl.def.name} 방어 함대 ${alive} / ${isl.total}`;
      }
    }
    this.ui.banner(banner);
    this.nearDock = nearDock && !this.docked && !p.sinking ? nearDock : null;
  }

  engage(isl) {
    isl.engaged = true;
    const t = isl.def.tier;
    if (!isl.remaining) {
      // 처음 교전할 때 함대 구성을 정한다. 격침한 배는 후퇴했다 돌아와도 되살아나지 않는다
      const local = t % 8;
      const count = Math.min(6, 2 + Math.floor(local / 2) + (t >= 8 ? 1 : 0));
      const types = isl.def.final ? ['dragon', 'frigate', 'frigate'] : D.fleetForTier(t, count);
      isl.remaining = types.map(type => ({ type, hp: null }));
      if (isl.def.final) isl.remaining.push({ type: 'kraken', hp: null });
      isl.total = isl.remaining.length;
    }
    isl.defenders = [];
    const ships = isl.remaining.filter(r => r.type !== 'kraken');
    ships.forEach((r, i) => {
      const a = (i / ships.length) * TAU + 0.3;
      const rad = isl.radius + 45;
      const e = this.spawnEnemy(r.type, t, isl.x + Math.cos(a) * rad, isl.z + Math.sin(a) * rad, { anchor: { x: isl.x, z: isl.z }, leash: isl.radius + 300, island: isl, aggro: true });
      if (r.hp) e.hp = r.hp;
      e.slot = r;
      isl.defenders.push(e);
    });
    const kr = isl.remaining.find(r => r.type === 'kraken');
    if (kr) {
      const k = this.spawnEnemy('kraken', t, isl.x, isl.z + isl.radius + 55, { anchor: { x: isl.x, z: isl.z }, island: isl, aggro: true });
      if (kr.hp) k.hp = kr.hp;
      k.slot = kr;
      isl.defenders.push(k);
      this.ui.toast('독도를 지키는 크라켄이 나타났습니다!', 'danger', 3500);
      this.sound.play('horn', 0.6);
    } else {
      this.ui.toast(`${isl.def.name}의 방어 함대가 출동했습니다!`, 'danger', 2500);
      this.sound.play('horn', 0.4);
    }
  }

  disengage(isl) {
    if (!isl.engaged) return;
    isl.engaged = false;
    for (const e of isl.defenders) {
      if (e.slot && !e.dead) e.slot.hp = e.hp;
      const i = this.enemies.indexOf(e);
      if (i >= 0) { this.world.remove(e.obj); this.enemies.splice(i, 1); }
    }
    isl.defenders = [];
  }

  capture(isl) {
    isl.engaged = false;
    isl.defenders = [];
    isl.remaining = null;
    const s = this.state;
    s.captured[isl.def.id] = true;
    M.setIslandOwned(isl.obj, true);
    M.setIslandOwned(isl.refl, true);
    const t = isl.def.tier;
    const coins = Math.round(60 * Math.pow(1.2, D.expectedLevel(t)));
    s.coins += coins;
    const goods = { wood: 5 + t * 2 };
    if (t >= 2) goods.ore = t;
    if (t >= 4) goods.silver = t - 3;
    if (t >= 7) goods.gold = t - 6;
    if (t >= 10) goods.gem = t >= 14 ? 2 : 1;
    this.addCargo(goods);
    this.sound.play('fanfare', 0.6);
    this.ui.toast(`🏝 ${isl.def.name} 점령! +${D.fmt(coins)} 코인`, 'good', 3500);
    for (let k = 0; k < 40; k++) this.particles.emit({ x: isl.x + rand(-20, 20), y: 12, z: isl.z + rand(-20, 20), vx: rand(-10, 10), vy: rand(10, 25), vz: rand(-10, 10), grav: 14, life: 1.8, size: 2.2, color: [0xffd84a, 0xff6b6b, 0x6bd5ff, 0x8aff8a][k % 4] });
    const ocean = D.OCEANS[s.ocean];
    if (s.ocean === 0 && ocean.islands.every(i => s.captured[i.id]) && !s.unlocked[1]) {
      s.unlocked[1] = true;
      setTimeout(() => this.ui.toast('🌍 대서양 항로가 열렸습니다! 지도에서 이동하세요', 'good', 5000), 3000);
    }
    if (isl.def.final) {
      s.dokdo = true;
      setTimeout(() => this.ui.showEnding(), 2000);
    }
    this.save();
    this.ui.updateHud(true);
  }

  dock() {
    const isl = this.nearDock;
    if (!isl) return;
    this.docked = isl.def.id;
    this.state.lastIsland = isl.def.id;
    this.cruise = false;
    this.fishing = null;
    this.ui.openIsland(isl);
    this.sound.play('bell', 0.4);
    this.save();
  }
  undock() {
    this.docked = null;
    this.ui.closeIsland();
    const p = this.player;
    p.heading = 0;
    p.speed = 4;
    this.save();
  }

  // ---------- 배회 해적 ----------
  zoneTier(x, z) {
    const base = this.state.ocean === 0 ? 0 : 8;
    const f = clamp((820 - z) / 1600, 0, 1);
    return Math.max(base, Math.floor(base + f * 7.5 - 0.3));
  }

  updateSpawns(dt) {
    if (this.arena || this.docked) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 4;
    const p = this.player;
    const roaming = this.enemies.filter(e => e.roam && !e.dead).length;
    if (roaming >= 3) return;
    for (let tries = 0; tries < 6; tries++) {
      const a = rand(0, TAU), r = rand(260, 420);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (Math.abs(x) > D.OCEAN_HALF - 40 || Math.abs(z) > D.OCEAN_HALF - 40) continue;
      let ok = true;
      for (const isl of this.islands) {
        const safe = this.state.captured[isl.def.id] ? isl.radius + 230 : isl.radius + 90;
        if (dist2(isl.x, isl.z, x, z) < safe * safe) { ok = false; break; }
      }
      if (dist2(this.gate.x, this.gate.z, x, z) < 120 * 120) ok = false;
      if (!ok) continue;
      const t = this.zoneTier(x, z);
      const pool = D.fleetForTier(t, 2);
      const n = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < n; i++) this.spawnEnemy(pool[i % 2], t, x + i * 25, z + i * 10, { roam: true, leash: 260 });
      return;
    }
  }

  // ---------- 조수 ----------
  updateAssistants(dt) {
    const p = this.player, a = this.state.assistants;
    const A = this.assist;
    if (A.escort) {
      const E = A.escort;
      const back = -18 - p.radius, side = -14;
      const tx = p.x + Math.sin(p.heading) * back + Math.cos(p.heading) * side;
      const tz = p.z + Math.cos(p.heading) * back - Math.sin(p.heading) * side;
      const dx = tx - E.x, dz = tz - E.z, d = Math.hypot(dx, dz);
      if (d > 300) { E.x = tx; E.z = tz; }
      const spd = clamp(d * 0.8, 0, this.stats.speed * 1.3);
      if (d > 2) { E.h += wrap(Math.atan2(dx, dz) - E.h) * Math.min(1, dt * 3); E.x += Math.sin(E.h) * spd * dt; E.z += Math.cos(E.h) * spd * dt; }
      else E.h += wrap(p.heading - E.h) * Math.min(1, dt * 2);
      E.obj.position.set(E.x, Math.sin(this.t * 1.7) * 0.15, E.z);
      E.obj.rotation.y = E.h;
      E.cd -= dt;
      if (E.cd <= 0 && !this.docked && !p.sinking) {
        let best = null, bd = 75 * 75;
        for (const e of this.enemies) { if (e.dead) continue; const q = dist2(E.x, E.z, e.x, e.z); if (q < bd) { bd = q; best = e; } }
        if (best) {
          E.cd = 2.4;
          this.spawnBall(E.x, E.z, best, this.stats.dmg * (0.25 + 0.1 * a.escort), 'escort');
          this.particles.emit({ x: E.x, y: 2, z: E.z, life: 0.6, size: 3, grow: 5, color: 0xdddddd, alpha: 0.6 });
        }
      }
    }
    if (A.seagull) {
      A.seagull.gs.forEach((g, i) => {
        const ph = this.t * 1.2 + g.userData.phase;
        g.position.set(p.x + Math.cos(ph) * 16, 24 + Math.sin(ph * 2) * 2, p.z + Math.sin(ph) * 16);
        g.rotation.y = -ph;
        M.flap(g, this.t + i);
      });
      if (this.t - p.lastCombat > 4 && !p.sinking) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.maxHp * 0.004 * a.seagull * dt);
    }
    if (A.nessy) {
      const N = A.nessy;
      const back = -22 - p.radius, side = 14;
      const tx = p.x + Math.sin(p.heading) * back + Math.cos(p.heading) * side;
      const tz = p.z + Math.cos(p.heading) * back - Math.sin(p.heading) * side;
      N.x += (tx - N.x) * Math.min(1, dt * 1.5); N.z += (tz - N.z) * Math.min(1, dt * 1.5);
      N.h += wrap(p.heading - N.h) * Math.min(1, dt * 2);
      N.obj.position.set(N.x, Math.sin(this.t * 2) * 0.4 - 0.5, N.z);
      N.obj.rotation.y = N.h;
    }
    if (A.dolphin) {
      const Dd = A.dolphin;
      Dd.t += dt;
      const cyc = (Dd.t % 2.2) / 2.2;
      const side = 12 + p.radius * 0.5;
      const fwd = (cyc - 0.5) * 16;
      const x = p.x + Math.sin(p.heading) * fwd + Math.cos(p.heading) * side;
      const z = p.z + Math.cos(p.heading) * fwd - Math.sin(p.heading) * side;
      const y = Math.sin(cyc * Math.PI) * 6 - 1.5;
      Dd.obj.position.set(x, y, z);
      Dd.obj.rotation.set(-Math.cos(cyc * Math.PI) * 0.8, p.heading, 0);
      if (cyc < 0.04 || cyc > 0.96) this.particles.emit({ x, y: 0.5, z, vy: 6, grav: 20, life: 0.5, size: 2, color: 0xffffff });
    }
  }

  // ---------- 낚시 ----------
  canFish() {
    const p = this.player;
    if (this.docked || p.sinking || this.arena) return false;
    const near = this.islands.some(i => this.state.captured[i.def.id] && dist2(i.x, i.z, p.x, p.z) < (i.radius + 140) ** 2);
    if (!near) return false;
    return !this.enemies.some(e => !e.dead && dist2(e.x, e.z, p.x, p.z) < 150 * 150);
  }
  toggleFishing() {
    if (this.fishing) { this.fishing = null; return; }
    if (!this.canFish()) return;
    this.cruise = false;
    this.fishing = { t: 0 };
    this.sound.play('splash', 0.3);
  }
  updateFishing(dt) {
    const f = this.fishing;
    const p = this.player;
    if (!f) return;
    if (!this.canFish() || (this.input.active && this.input.moved) || this.input.keys.size) { this.fishing = null; return; }
    f.t += dt;
    if (Math.random() < dt * 3) {
      const a = rand(0, TAU);
      this.particles.emit({ x: p.x + Math.cos(a) * (p.radius + 6), y: 0.4, z: p.z + Math.sin(a) * (p.radius + 6), life: 1, size: 2, grow: 4, color: 0xffffff, alpha: 0.6 });
    }
    if (f.t >= this.stats.fishTime) {
      f.t = 0;
      const lv = this.state.lv.fish;
      const catchN = Math.max(1, Math.round(this.stats.fishAmount * rand(0.7, 1.3)));
      const goods = { fish: catchN };
      if (Math.random() < 0.04 + lv * 0.004) goods.ore = 1;
      if (lv >= 8 && Math.random() < 0.02 + lv * 0.002) goods.silver = 1;
      if (lv >= 16 && Math.random() < 0.01 + lv * 0.001) goods.gold = 1;
      if (lv >= 26 && Math.random() < 0.004) goods.gem = 1;
      const got = this.addCargo(goods);
      if (!Object.keys(got).length) { this.fishing = null; return; }
      this.state.stats.fished += got.fish || 0;
      this.sound.play('fish', 0.4);
      let off = 0;
      for (const k in got) { this.ui.floatText(p.x, 10 + off, p.z, `${D.GOODS.find(g => g.id === k).name} +${got[k]}`, k === 'fish' ? '#bfe9ff' : '#ffd84a'); off += 3; }
      for (let k = 0; k < 8; k++) this.particles.emit({ x: p.x + rand(-6, 6), y: 0.5, z: p.z + rand(-6, 6), vy: rand(5, 10), grav: 20, life: 0.7, size: 1.6, color: 0xffffff });
      this.ui.updateHud(true);
    }
  }

  // ---------- 아레나 ----------
  nearGate() {
    if (this.arena || !this.gate) return false;
    return dist2(this.player.x, this.player.z, this.gate.x, this.gate.z) < 30 * 30;
  }
  enterArena() {
    const p = this.player;
    for (const isl of this.islands) this.disengage(isl);
    for (const e of this.enemies) this.world.remove(e.obj);
    this.enemies = [];
    this.arena = { wave: 0, kills: 0, reward: 0, next: 2, from: { x: p.x, z: p.z } };
    this.fishing = null; this.cruise = false;
    p.x = ARENA_CENTER.x; p.z = ARENA_CENTER.z + ARENA_R * 0.6; p.heading = Math.PI; p.speed = 0;
    p.hp = this.stats.maxHp;
    this.camTarget.set(p.x, 0, p.z);
    this.ui.toast('아레나 입장! 몰려오는 해적을 물리치세요', 'danger', 2500);
    this.sound.play('horn', 0.5);
  }
  updateArena(dt) {
    const A = this.arena;
    if (!A) return;
    const alive = this.enemies.filter(e => !e.dead).length;
    if (alive === 0) {
      A.next -= dt;
      if (A.next <= 0) {
        A.wave++;
        A.next = 3;
        const base = this.state.ocean === 0 ? 0 : 8;
        const t = Math.floor(base + (A.wave - 1) * 0.6);
        const n = Math.min(9, 2 + A.wave);
        const types = D.fleetForTier(t, n);
        types.forEach((ty, i) => {
          const a = (i / n) * TAU + rand(0, 0.5);
          this.spawnEnemy(ty, t, ARENA_CENTER.x + Math.cos(a) * (ARENA_R - 30), ARENA_CENTER.z + Math.sin(a) * (ARENA_R - 30), { arena: true, aggro: true, leash: 9999, anchor: { ...ARENA_CENTER } });
        });
        this.ui.toast(`웨이브 ${A.wave}`, 'danger', 1500);
        this.sound.play('horn', 0.35);
      }
    }
    this.ui.arenaHud({ wave: A.wave, kills: A.kills, reward: A.reward, alive, best: this.state.arenaBest[this.state.ocean] });
  }
  endArena(died) {
    const A = this.arena;
    if (!A) return;
    const p = this.player;
    const oc = this.state.ocean;
    const cleared = Math.max(0, died ? A.wave - 1 : (this.enemies.some(e => !e.dead) ? A.wave - 1 : A.wave));
    const newBest = cleared > this.state.arenaBest[oc];
    if (newBest) this.state.arenaBest[oc] = cleared;
    this.state.coins += A.reward;
    for (const e of this.enemies) this.world.remove(e.obj);
    this.enemies = [];
    for (const b of this.balls) this.scene.remove(b.mesh);
    this.balls = [];
    this.arena = null;
    p.sinking = false; p.obj.position.y = 0; p.model.rotation.set(0, 0, 0); p.refl.visible = true;
    p.hp = this.stats.maxHp;
    p.x = this.gate.x; p.z = this.gate.z + 45; p.heading = 0; p.speed = 0;
    this.camTarget.set(p.x, 0, p.z);
    this.ui.arenaHud(null);
    this.ui.alert('아레나 결과', `클리어한 웨이브: ${cleared}${newBest ? ' (최고 기록!)' : ''}<br>격침: ${A.kills}척<br>보상: ${D.fmt(A.reward)} 코인`);
    this.save();
    this.ui.updateHud(true);
  }

  travel(oceanId) {
    if (!this.state.unlocked[oceanId] || oceanId === this.state.ocean) return;
    this.state.ocean = oceanId;
    const home = D.OCEANS[oceanId].islands.find(i => i.home);
    this.state.lastIsland = home.id;
    this.state.pos = null;
    this.docked = null;
    this.fishing = null;
    this.buildOcean(oceanId);
    this.player.hp = this.stats.maxHp;
    this.save();
    this.ui.toast(`${D.OCEANS[oceanId].name}에 도착했습니다`, 'good', 2500);
  }

  // ---------- 카메라, 주변 ----------
  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 4);
    const target = new THREE.Vector3(p.x, 0, p.z);
    // 정박 중에는 배가 메뉴 위로 보이도록 시점을 내린다
    if (this.docked) {
      if (this.vw > this.vh && this.vh <= 640) target.x += 70 * this.zoom;
      else target.z += 95 * this.zoom;
    }
    if (!this.camTarget) this.camTarget = target.clone();
    this.camTarget.lerp(target, Math.min(1, dt * 4));
    const s = (0.8 + p.model.userData.len / 30) * this.zoom;
    const portrait = this.vw < this.vh;
    const off = portrait ? new THREE.Vector3(0, 128, 80) : new THREE.Vector3(0, 100, 68);
    off.multiplyScalar(s);
    this.camera.position.copy(this.camTarget).add(off);
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += rand(-1, 1) * this.shake * 3;
      this.camera.position.z += rand(-1, 1) * this.shake * 3;
    }
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z - 4);
    const fogScale = s;
    this.scene.fog.near = 300 * fogScale; this.scene.fog.far = 820 * fogScale;
    this.updateWater(this.camTarget.x, this.camTarget.z);
  }

  updateAmbience(dt) {
    if (!this.whales) return;
    for (const w of this.whales) {
      w.userData.h += Math.sin(this.t * 0.1 + w.position.x) * dt * 0.1;
      w.position.x += Math.sin(w.userData.h) * 4 * dt;
      w.position.z += Math.cos(w.userData.h) * 4 * dt;
      w.rotation.y = w.userData.h;
      if (Math.abs(w.position.x) > 1000 || Math.abs(w.position.z) > 1000) w.userData.h += Math.PI;
    }
    const p = this.player;
    if (!p) return;
    this.gulls.forEach((g, i) => {
      const u = g.userData;
      const ph = this.t * 0.35 + u.phase;
      const cx = p.x + Math.sin(i * 2.1) * 60, cz = p.z - 30 + Math.cos(i * 1.7) * 50;
      g.position.set(cx + Math.cos(ph) * u.r, u.h, cz + Math.sin(ph) * u.r);
      g.rotation.y = -ph;
      M.flap(g, this.t * 0.6 + i);
    });
  }
}

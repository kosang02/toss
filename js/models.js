// 로우폴리 모델을 코드로 만든다. 원작의 모델이나 텍스처는 쓰지 않는다.
import * as THREE from './three.module.min.js';
import { rng, hashStr } from './data.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  }
  return matCache.get(key);
}
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

// ---------- 텍스처 ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const texCache = new Map();
function sailTex(color, emblem) {
  const key = color + emblem;
  if (texCache.has(key)) return texCache.get(key);
  const col = '#' + new THREE.Color(color).getHexString();
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); }
    if (emblem === 'skull') {
      g.fillStyle = '#e9e6dc';
      g.beginPath(); g.arc(64, 56, 22, 0, Math.PI * 2); g.fill();
      g.fillRect(50, 66, 28, 18);
      g.fillStyle = col;
      g.beginPath(); g.arc(55, 56, 7, 0, Math.PI * 2); g.arc(73, 56, 7, 0, Math.PI * 2); g.fill();
      g.fillRect(56, 76, 3, 8); g.fillRect(63, 76, 3, 8); g.fillRect(70, 76, 3, 8);
      g.strokeStyle = '#e9e6dc'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(34, 96); g.lineTo(94, 112); g.moveTo(94, 96); g.lineTo(34, 112); g.stroke();
    } else if (emblem === 'crest') {
      g.fillStyle = '#e8c02e';
      g.beginPath(); g.moveTo(44, 38); g.lineTo(84, 38); g.lineTo(84, 70); g.quadraticCurveTo(84, 92, 64, 100); g.quadraticCurveTo(44, 92, 44, 70); g.closePath(); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.arc(64, 64, 9, 0, Math.PI * 2); g.fill();
    } else if (emblem === 'gold') {
      g.strokeStyle = '#e8c02e'; g.lineWidth = 5;
      g.beginPath(); g.arc(64, 64, 26, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(64, 34); g.lineTo(64, 94); g.moveTo(34, 64); g.lineTo(94, 64); g.stroke();
    }
  });
  texCache.set(key, t);
  return t;
}

export function waterTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = '#2f86b4'; g.fillRect(0, 0, w, h);
    // 부드러운 명암 얼룩
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h, rad = 40 + r() * 90;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const a = 0.05 + r() * 0.06;
      grd.addColorStop(0, r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,30,70,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        g.save(); g.translate(dx, dy); g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
      }
    }
    // 물결 무늬
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const x = r() * w, y = r() * h, len = 10 + r() * 30;
      g.lineWidth = 1 + r() * 2.5;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + len / 2, y + dy - 4, x + dx + len, y + dy); g.stroke();
      }
    }
  });
}

export function causticTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(11);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, len = 8 + r() * 22;
      g.lineWidth = 1 + r() * 1.5;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + len / 2, y + dy + 3, x + dx + len, y + dy - 1); g.stroke();
      }
    }
  });
}

// ---------- 선체 ----------
function hullOutline(L, B) {
  const pts = [
    [-B * 0.40, -L / 2], [B * 0.40, -L / 2], [B * 0.50, -L * 0.25], [B * 0.50, L * 0.08],
    [B * 0.36, L * 0.32], [0, L / 2], [-B * 0.36, L * 0.32], [-B * 0.50, L * 0.08], [-B * 0.50, -L * 0.25],
  ];
  return pts;
}
function shapeFrom(pts, s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0] * s, pts[0][1] * s);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0] * s, pts[i][1] * s);
  sh.closePath();
  return sh;
}
function extrudeDown(shape, depth, taper) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  g.rotateX(Math.PI / 2);
  if (taper) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < -depth * 0.5) { p.setX(i, p.getX(i) * taper[0]); p.setZ(i, p.getZ(i) * taper[1]); }
    }
    g.computeVertexNormals();
  }
  return g;
}

export function makeShip(o) {
  const L = o.len, B = o.beam ?? L * 0.38, D = o.depth ?? L * 0.24;
  const root = new THREE.Group();
  const ship = new THREE.Group();
  root.add(ship);
  const deckY = D * 0.55;
  const outline = hullOutline(L, B);

  const hull = new THREE.Mesh(extrudeDown(shapeFrom(outline), D, [0.55, 0.85]), [mat(o.deck ?? 0x7a5230), mat(o.hull)]);
  hull.position.y = deckY;
  ship.add(hull);

  if (o.band) {
    const band = new THREE.Mesh(extrudeDown(shapeFrom(outline, 1.012), D * 0.38, [0.93, 0.98]), [HIDDEN, mat(o.band)]);
    band.position.y = deckY + 0.01;
    ship.add(band);
  }
  // 금색 뱃전
  const rail = shapeFrom(outline, 1.05);
  rail.holes.push(shapeFrom(outline.slice().reverse(), 0.9));
  const railMesh = new THREE.Mesh(extrudeDown(rail, L * 0.035), mat(o.trim));
  railMesh.position.y = deckY + L * 0.035;
  ship.add(railMesh);

  // 선미 누각
  const castle = mesh(new THREE.BoxGeometry(B * 0.78, L * 0.07, L * 0.2), mat(o.hull), 0, deckY + L * 0.035, -L * 0.38);
  ship.add(castle);
  const castleRail = mesh(new THREE.BoxGeometry(B * 0.84, L * 0.02, L * 0.22), mat(o.trim), 0, deckY + L * 0.075, -L * 0.38);
  ship.add(castleRail);
  // 선수 기움돛대
  const bow = mesh(new THREE.CylinderGeometry(L * 0.012, L * 0.02, L * 0.3, 5), mat(0x6b4423), 0, deckY + L * 0.06, L * 0.56);
  bow.rotation.x = Math.PI / 2 - 0.35;
  ship.add(bow);

  // 대포
  const gunGeo = new THREE.CylinderGeometry(L * 0.018, L * 0.022, L * 0.09, 6);
  gunGeo.rotateZ(Math.PI / 2);
  const guns = o.guns ?? 1;
  const slots = [];
  for (let i = 0; i < guns; i++) {
    const z = guns === 1 ? 0 : (-0.22 + 0.44 * i / (guns - 1)) * L;
    for (const side of [-1, 1]) {
      const gx = side * (B * 0.5 + L * 0.02);
      ship.add(mesh(gunGeo, mat(0x26262b), gx, deckY - D * 0.12, z));
      slots.push({ side, x: gx, z });
    }
  }

  // 돛대와 돛
  const masts = o.masts ?? 1;
  const mastZ = masts === 1 ? [0.06] : masts === 2 ? [0.2, -0.16] : [0.28, 0.02, -0.24];
  const sailMat = new THREE.MeshLambertMaterial({ map: sailTex(o.sail, o.emblem ?? 'none'), side: THREE.DoubleSide, flatShading: true });
  const sails = [];
  mastZ.forEach((mz, idx) => {
    const H = L * (idx === Math.floor(masts / 2) ? 0.95 : 0.8) * (o.mastScale ?? 1);
    const z = mz * L;
    ship.add(mesh(new THREE.CylinderGeometry(L * 0.012, L * 0.018, H, 5), mat(0x6b4423), 0, deckY + H / 2, z));
    ship.add(mesh(new THREE.ConeGeometry(L * 0.02, L * 0.06, 5), mat(o.trim), 0, deckY + H + L * 0.03, z));
    const rows = H > L * 0.7 ? 3 : 2;
    for (let r = 0; r < rows; r++) {
      const w = B * (1.25 - r * 0.22) * (o.sailWide ?? 1);
      const sh = H * 0.27;
      const y = deckY + H * 0.22 + r * H * 0.27 + sh / 2;
      const geo = new THREE.BoxGeometry(w, sh, L * 0.01, 3, 2, 1);
      // 바람을 받은 듯 앞쪽으로 볼록
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const fx = p.getX(i) / (w / 2);
        const fy = p.getY(i) / (sh / 2);
        p.setZ(i, p.getZ(i) + L * 0.04 * (1 - fx * fx) * (0.7 + 0.3 * (1 - Math.abs(fy))));
      }
      geo.computeVertexNormals();
      const s = mesh(geo, sailMat, 0, y, z + L * 0.02);
      ship.add(s);
      sails.push(s);
      const yard = mesh(new THREE.CylinderGeometry(L * 0.007, L * 0.007, w * 1.08, 4), mat(0x6b4423), 0, y + sh / 2, z + L * 0.02);
      yard.rotation.z = Math.PI / 2;
      ship.add(yard);
    }
    if (idx === 0 || masts === 1) {
      const flag = mesh(new THREE.PlaneGeometry(L * 0.09, L * 0.05), new THREE.MeshLambertMaterial({ color: o.flag ?? 0x1d1d22, side: THREE.DoubleSide }), 0, deckY + H + L * 0.02, z - L * 0.05);
      flag.rotation.y = Math.PI / 2;
      ship.add(flag);
      root.userData.flag = flag;
    }
  });

  if (o.dragon) {
    // 뱃전 가시와 금색 용머리
    for (let i = 0; i < 7; i++) {
      const z = (-0.35 + i * 0.1) * L;
      for (const side of [-1, 1]) {
        const c = mesh(new THREE.ConeGeometry(L * 0.02, L * 0.09, 4), mat(0xf2c230), side * B * 0.5, deckY + L * 0.07, z);
        ship.add(c);
      }
    }
    const neck = mesh(new THREE.BoxGeometry(B * 0.35, L * 0.12, L * 0.12), mat(0xf2c230), 0, deckY + L * 0.06, L * 0.5);
    neck.rotation.x = -0.4;
    ship.add(neck);
    const head = mesh(new THREE.ConeGeometry(B * 0.22, L * 0.18, 5), mat(0xf2c230), 0, deckY + L * 0.12, L * 0.6);
    head.rotation.x = Math.PI / 2;
    ship.add(head);
    for (const side of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(L * 0.015, L * 0.1, 4), mat(0xf2c230), side * B * 0.12, deckY + L * 0.2, L * 0.52);
      horn.rotation.x = -0.7; horn.rotation.z = side * 0.4;
      ship.add(horn);
    }
  }

  root.userData.radius = Math.max(L * 0.42, B * 0.6);
  root.userData.slots = slots;
  root.userData.sails = sails;
  root.userData.ship = ship;
  root.userData.len = L;
  return root;
}

export function playerShipLook(bodyLvl) {
  if (bodyLvl < 6) return { tier: 0, len: 13, masts: 1, sail: 0xe4ecf6, emblem: 'crest', hull: 0x8b5a2b, band: 0x1e2340, trim: 0xe8c02e, flag: 0xffffff };
  if (bodyLvl < 14) return { tier: 1, len: 16, masts: 2, sail: 0xe4ecf6, emblem: 'crest', hull: 0x8b5a2b, band: 0x1e2340, trim: 0xe8c02e, flag: 0xffffff };
  if (bodyLvl < 24) return { tier: 2, len: 20, masts: 3, sail: 0xe4ecf6, emblem: 'crest', hull: 0x8b5a2b, band: 0x1e2340, trim: 0xe8c02e, flag: 0xffffff };
  return { tier: 3, len: 25, masts: 3, sail: 0x1d1d22, emblem: 'gold', hull: 0x9a6a36, band: 0x2a1f14, trim: 0xf2c230, flag: 0x1d1d22, sailWide: 1.1 };
}

// ---------- 크라켄 ----------
export function makeKraken() {
  const root = new THREE.Group();
  const purple = mat(0x7b3f8f), dark = mat(0x5a2a6b), pale = mat(0xd9a3d6);
  const head = mesh(new THREE.IcosahedronGeometry(12, 1), purple, 0, 6, 0);
  head.scale.set(1, 1.35, 1);
  root.add(head);
  for (const s of [-1, 1]) {
    root.add(mesh(new THREE.SphereGeometry(3, 8, 6), mat(0xfff6c8), s * 5.5, 8, 10));
    root.add(mesh(new THREE.SphereGeometry(1.6, 6, 5), mat(0x111111), s * 5.5, 8, 12.4));
  }
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const base = new THREE.Group();
    base.position.set(Math.sin(a) * 10, 0, Math.cos(a) * 10);
    base.rotation.y = a;
    root.add(base);
    let parent = base;
    const segs = [];
    for (let k = 0; k < 7; k++) {
      const r0 = 3.2 * (1 - k / 8), r1 = 3.2 * (1 - (k + 1) / 8);
      const seg = new THREE.Group();
      seg.position.z = k === 0 ? 0 : 5;
      const m = mesh(new THREE.CylinderGeometry(r1, r0, 5.2, 6), k % 2 ? purple : dark, 0, 0, 2.5);
      m.rotation.x = Math.PI / 2;
      seg.add(m);
      if (k < 5) seg.add(mesh(new THREE.SphereGeometry(r1 * 0.45, 5, 4), pale, 0, -r1 * 0.8, 2.5));
      parent.add(seg);
      segs.push(seg);
      parent = seg;
    }
    tentacles.push({ base, segs, phase: i * 0.8 });
  }
  root.userData.tentacles = tentacles;
  root.userData.head = head;
  root.userData.radius = 26;
  return root;
}

export function animateKraken(k, t, attack = 0) {
  const { tentacles, head } = k.userData;
  head.position.y = 6 + Math.sin(t * 1.3) * 1.2;
  tentacles.forEach((tc, i) => {
    tc.segs.forEach((s, j) => {
      s.rotation.x = -0.35 + Math.sin(t * 1.8 + tc.phase + j * 0.6) * 0.22 - (j === 0 ? 0.5 + attack * 0.8 : 0);
      s.rotation.y = Math.sin(t * 1.1 + tc.phase + j * 0.4) * 0.18;
    });
  });
}

// ---------- 섬 ----------
function jitterRadial(geo, seed, amt) {
  const r = rng(seed);
  const table = Array.from({ length: 64 }, () => 1 + (r() * 2 - 1) * amt);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2);
    const f = table[Math.floor(a * 63.999)];
    p.setX(i, x * f); p.setZ(i, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

function palm(r, x, z, y, s = 1) {
  const g = new THREE.Group();
  let px = 0, py = 0;
  const lean = (r() - 0.5) * 0.5;
  for (let i = 0; i < 4; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.55 * s, 0.75 * s, 3 * s, 5), mat(0x9a6b3c), px, py + 1.5 * s, 0);
    seg.rotation.z = lean * i * 0.4;
    g.add(seg);
    px += Math.sin(-lean * i * 0.4) * 3 * s; py += 2.9 * s;
  }
  for (let i = 0; i < 6; i++) {
    const leaf = mesh(new THREE.ConeGeometry(1.4 * s, 6 * s, 4), mat(i % 2 ? 0x3f9b3a : 0x2f8a35), px, py, 0);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.rotation.x = 1.9;
    leaf.translateY(3 * s);
    leaf.scale.set(1, 1, 0.3);
    g.add(leaf);
  }
  g.position.set(x, y, z);
  g.rotation.y = r() * 6.28;
  return g;
}
function rock(r, x, z, y, s, color = 0x8a8f96) {
  const m = mesh(new THREE.DodecahedronGeometry(s, 0), mat(color), x, y + s * 0.4, z);
  m.rotation.set(r() * 3, r() * 3, r() * 3);
  m.scale.y = 0.7 + r() * 0.5;
  return m;
}
function tree(r, x, z, y, s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.5 * s, 0.7 * s, 3 * s, 5), mat(0x7a5230), 0, 1.5 * s, 0));
  g.add(mesh(new THREE.ConeGeometry(3 * s, 6 * s, 6), mat(0x2f7d3a), 0, 5.5 * s, 0));
  g.add(mesh(new THREE.ConeGeometry(2.3 * s, 4.5 * s, 6), mat(0x3a9145), 0, 8 * s, 0));
  g.position.set(x, y, z);
  return g;
}
function house(r, x, z, y, s = 1) {
  const g = new THREE.Group();
  const colors = [0xf1e3c6, 0xe8d0b0, 0xdfe7ef];
  g.add(mesh(new THREE.BoxGeometry(6 * s, 4 * s, 5 * s), mat(colors[Math.floor(r() * 3)]), 0, 2 * s, 0));
  const roof = mesh(new THREE.ConeGeometry(4.6 * s, 3.4 * s, 4), mat(r() > 0.5 ? 0xc0533a : 0x3d6fa8), 0, 5.6 * s, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.85;
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(1.4 * s, 2.2 * s, 0.2), mat(0x6b4423), 0, 1.1 * s, 2.55 * s));
  g.position.set(x, y, z);
  g.rotation.y = r() * 6.28;
  return g;
}
function chessPiece(color, kind, x, z, y, s = 1) {
  const pts = [];
  const prof = kind === 'king'
    ? [[0, 0], [2.4, 0], [2.4, 0.8], [1.6, 1.4], [1.1, 4], [1.8, 5], [1.2, 5.6], [1.4, 7], [0, 7.6]]
    : kind === 'queen'
      ? [[0, 0], [2.3, 0], [2.3, 0.8], [1.5, 1.4], [1.0, 3.6], [1.8, 4.6], [1.0, 5.2], [1.6, 6.4], [0, 6.8]]
      : [[0, 0], [2.0, 0], [2.0, 0.7], [1.2, 1.2], [0.8, 2.8], [1.4, 3.4], [0, 4.6]];
  for (const [a, b] of prof) pts.push(new THREE.Vector2(a * s, b * s));
  const g = new THREE.Group();
  g.add(mesh(new THREE.LatheGeometry(pts, 7), mat(color)));
  if (kind === 'king') {
    g.add(mesh(new THREE.BoxGeometry(0.5 * s, 1.8 * s, 0.5 * s), mat(color), 0, 8.2 * s, 0));
    g.add(mesh(new THREE.BoxGeometry(1.4 * s, 0.5 * s, 0.5 * s), mat(color), 0, 8.4 * s, 0));
  }
  g.position.set(x, y, z);
  return g;
}

function flagPole(x, z, y, tex, h = 12) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, h, 5), mat(0xdddddd), 0, h / 2, 0));
  const f = mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), 3, h - 2, 0);
  g.add(f);
  g.position.set(x, y, z);
  g.userData.flag = f;
  return g;
}

let taegukTex;
function taegukgi() {
  if (taegukTex) return taegukTex;
  taegukTex = canvasTex(150, 100, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const cx = 75, cy = 50, R = 24;
    g.save(); g.translate(cx, cy); g.rotate(Math.atan2(2, 3));
    g.fillStyle = '#cd2e3a';
    g.beginPath(); g.arc(0, 0, R, Math.PI, 0); g.fill();
    g.fillStyle = '#0047a0';
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI); g.fill();
    g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(-R / 2, 0, R / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0047a0'; g.beginPath(); g.arc(R / 2, 0, R / 2, 0, Math.PI * 2); g.fill();
    g.restore();
    // 4괘 (간략)
    g.fillStyle = '#000';
    const tri = (x, y, ang, pattern) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      pattern.forEach((p, i) => {
        const yy = -9 + i * 7;
        if (p) g.fillRect(-10, yy, 20, 4); else { g.fillRect(-10, yy, 8.5, 4); g.fillRect(1.5, yy, 8.5, 4); }
      });
      g.restore();
    };
    tri(30, 20, -Math.atan2(2, 3) + Math.PI / 2, [1, 1, 1]);
    tri(120, 80, -Math.atan2(2, 3) + Math.PI / 2, [0, 0, 0]);
    tri(120, 20, Math.atan2(2, 3) + Math.PI / 2, [0, 1, 0]);
    tri(30, 80, Math.atan2(2, 3) + Math.PI / 2, [1, 0, 1]);
  });
  return taegukTex;
}
let pirateFlagTex;
function pirateFlag() {
  if (!pirateFlagTex) pirateFlagTex = sailTex(0x1d1d22, 'skull');
  return pirateFlagTex;
}
let ownFlagTex;
function ownFlag() {
  if (!ownFlagTex) ownFlagTex = sailTex(0x2a5db0, 'crest');
  return ownFlagTex;
}

export function makeIsland(def) {
  const r = rng(hashStr(def.id));
  const R = def.r;
  const g = new THREE.Group();
  const top = 5;
  const segs = 11;
  const grassCol = def.deco === 'ice' ? 0xe8f2f7 : def.deco === 'volcano' ? 0x6b7a3a : def.deco === 'skull' ? 0x7f8f5a : def.deco === 'dokdo' ? 0x5f9a45 : 0x5cb848;
  const dirtCol = def.deco === 'ice' ? 0xa9cfe0 : 0x8a6a45;
  const base = new THREE.Mesh(jitterRadial(new THREE.CylinderGeometry(R, R * 1.06, 7, segs), hashStr(def.id), 0.12), [mat(dirtCol), mat(grassCol), mat(dirtCol)]);
  base.position.y = top - 3.5;
  g.add(base);
  const sand = mesh(jitterRadial(new THREE.CylinderGeometry(R * 1.1, R * 1.22, 2.2, segs), hashStr(def.id), 0.12), mat(def.deco === 'ice' ? 0xd2e8f2 : 0xe9d79c), 0, 0.3, 0);
  g.add(sand);

  // 부두: 섬 남쪽
  const dock = new THREE.Group();
  const plank = mesh(new THREE.BoxGeometry(7, 0.8, 24), mat(0x9a6b3c), 0, 1.6, R + 8);
  dock.add(plank);
  for (const dx of [-3, 3]) for (const dz of [0, 8, 16]) dock.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 4, 5), mat(0x6b4423), dx, 0.6, R + dz));
  g.add(dock);
  g.userData.dockOffset = { x: 0, z: R + 26 };

  const place = (minR = 0.1, maxR = 0.72) => {
    const a = r() * Math.PI * 2, d = R * (minR + r() * (maxR - minR));
    return [Math.cos(a) * d, Math.sin(a) * d];
  };
  const add = (o) => { g.add(o); return o; };

  switch (def.deco) {
    case 'village':
      for (let i = 0; i < 5; i++) { const [x, z] = place(0.15, 0.6); add(house(r, x, z, top, 1.1)); }
      for (let i = 0; i < 6; i++) { const [x, z] = place(0.5, 0.8); add(palm(r, x, z, top, 0.9)); }
      break;
    case 'palms':
      for (let i = 0; i < 8; i++) { const [x, z] = place(0.1, 0.75); add(palm(r, x, z, top, 1)); }
      for (let i = 0; i < 4; i++) { const [x, z] = place(0.5, 0.85); add(rock(r, x, z, top, 2 + r() * 2)); }
      break;
    case 'cat': {
      const c = 0x9a9ea6;
      add(mesh(new THREE.DodecahedronGeometry(R * 0.38, 0), mat(c), 0, top + R * 0.2, 0)).scale.set(1.3, 0.8, 1);
      const head = add(mesh(new THREE.DodecahedronGeometry(R * 0.24, 0), mat(c), R * 0.32, top + R * 0.42, R * 0.05));
      head.scale.set(1, 0.9, 1);
      for (const s of [-1, 1]) {
        const ear = add(mesh(new THREE.ConeGeometry(R * 0.08, R * 0.18, 4), mat(c), R * 0.36 + s * 0, top + R * 0.66, R * 0.05 + s * R * 0.12));
        ear.rotation.x = s * 0.3;
      }
      add(mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.08, R * 0.5, 5), mat(c), -R * 0.45, top + R * 0.15, R * 0.2)).rotation.x = 1.2;
      for (let i = 0; i < 3; i++) { const [x, z] = place(0.6, 0.85); add(palm(r, x, z, top, 0.8)); }
      break;
    }
    case 'chess':
      for (let i = 0; i < 9; i++) {
        const [x, z] = place(0.1, 0.78);
        const kinds = ['king', 'queen', 'pawn', 'pawn'];
        add(chessPiece(i % 2 ? 0xf4f4f4 : 0x222226, kinds[Math.floor(r() * 4)], x, z, top, 1.4 + r() * 0.6));
      }
      break;
    case 'flower':
      for (let i = 0; i < 3; i++) {
        const [x, z] = place(0.1, 0.6);
        const fl = new THREE.Group();
        fl.add(mesh(new THREE.CylinderGeometry(0.6, 0.8, 8, 5), mat(0x3f9b3a), 0, 4, 0));
        for (let k = 0; k < 5; k++) {
          const p = mesh(new THREE.ConeGeometry(3, 7, 3), mat(0xd8342c), 0, 9, 0);
          p.rotation.order = 'YXZ'; p.rotation.y = k / 5 * 6.28; p.rotation.x = 1.3; p.translateY(3);
          p.scale.z = 0.35;
          fl.add(p);
        }
        fl.add(mesh(new THREE.IcosahedronGeometry(1.6, 0), mat(0xf2c230), 0, 9.5, 0));
        fl.position.set(x, top, z);
        fl.scale.setScalar(0.9 + r() * 0.5);
        add(fl);
      }
      for (let i = 0; i < 5; i++) { const [x, z] = place(0.4, 0.8); add(palm(r, x, z, top, 0.9)); }
      break;
    case 'lighthouse': {
      const lh = new THREE.Group();
      for (let k = 0; k < 5; k++) lh.add(mesh(new THREE.CylinderGeometry(4 - k * 0.45, 4.3 - k * 0.45, 4, 8), mat(k % 2 ? 0xd8342c : 0xf4f4f4), 0, 2 + k * 4, 0));
      lh.add(mesh(new THREE.CylinderGeometry(2.4, 2.4, 3, 8), mat(0xfff2a8, { emissive: 0xffd84a, emissiveIntensity: 0.6 }), 0, 21.5, 0));
      lh.add(mesh(new THREE.ConeGeometry(3, 3, 8), mat(0x333338), 0, 24.5, 0));
      lh.position.set(-R * 0.2, top, -R * 0.2);
      add(lh);
      for (let i = 0; i < 5; i++) { const [x, z] = place(0.4, 0.85); add(rock(r, x, z, top, 2 + r() * 3)); }
      for (let i = 0; i < 3; i++) { const [x, z] = place(0.4, 0.8); add(tree(r, x, z, top)); }
      break;
    }
    case 'skull': {
      const sk = add(mesh(new THREE.IcosahedronGeometry(R * 0.32, 0), mat(0xe9e6dc), 0, top + R * 0.25, -R * 0.1));
      sk.scale.set(1, 0.9, 0.9);
      for (const s of [-1, 1]) add(mesh(new THREE.IcosahedronGeometry(R * 0.08, 0), mat(0x222226), s * R * 0.12, top + R * 0.3, R * 0.17));
      add(mesh(new THREE.BoxGeometry(R * 0.3, R * 0.14, R * 0.2), mat(0xe9e6dc), 0, top + R * 0.06, R * 0.04));
      for (let i = 0; i < 6; i++) { const [x, z] = place(0.5, 0.85); add(rock(r, x, z, top, 2 + r() * 3, 0x5d5f66)); }
      for (let i = 0; i < 3; i++) { const [x, z] = place(0.5, 0.8); add(palm(r, x, z, top, 0.8)); }
      break;
    }
    case 'volcano': {
      add(mesh(new THREE.CylinderGeometry(R * 0.18, R * 0.62, R * 0.55, 9), mat(0x6e5440), 0, top + R * 0.27, -R * 0.05));
      add(mesh(new THREE.CylinderGeometry(R * 0.16, R * 0.19, 1.5, 9), mat(0xff5a1f, { emissive: 0xff3300, emissiveIntensity: 0.8 }), 0, top + R * 0.55, -R * 0.05));
      for (let i = 0; i < 6; i++) { const [x, z] = place(0.65, 0.85); add(rock(r, x, z, top, 2 + r() * 3, 0x4a4a50)); }
      g.userData.smoke = { x: 0, y: top + R * 0.58, z: -R * 0.05 };
      break;
    }
    case 'windmill': {
      const wm = new THREE.Group();
      wm.add(mesh(new THREE.CylinderGeometry(3, 4.2, 14, 8), mat(0xf1e3c6), 0, 7, 0));
      wm.add(mesh(new THREE.ConeGeometry(4.2, 4, 8), mat(0xc0533a), 0, 16, 0));
      const blades = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = mesh(new THREE.BoxGeometry(1.6, 9, 0.3), mat(0xf4f4f4), 0, 4.5, 0);
        const holder = new THREE.Group(); holder.rotation.z = k * Math.PI / 2; holder.add(b); blades.add(holder);
      }
      blades.position.set(0, 13, 3.6);
      wm.add(blades);
      wm.position.set(0, top, -R * 0.15);
      add(wm);
      g.userData.spin = blades;
      for (let i = 0; i < 4; i++) { const [x, z] = place(0.4, 0.8); add(house(r, x, z, top, 0.9)); }
      for (let i = 0; i < 4; i++) { const [x, z] = place(0.5, 0.85); add(tree(r, x, z, top, 0.9)); }
      break;
    }
    case 'ice':
      for (let i = 0; i < 9; i++) {
        const [x, z] = place(0.1, 0.8);
        const c = add(mesh(new THREE.ConeGeometry(2.5 + r() * 3, 8 + r() * 12, 5), mat(r() > 0.5 ? 0xdff3fb : 0x9fd6ec), x, top + 5, z));
        c.rotation.z = (r() - 0.5) * 0.3;
      }
      break;
    case 'moai':
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.85 + i * 0.35;
        const m = new THREE.Group();
        m.add(mesh(new THREE.BoxGeometry(4, 8, 3.4), mat(0x7d7468), 0, 4, 0));
        m.add(mesh(new THREE.BoxGeometry(4.4, 4, 3.8), mat(0x7d7468), 0, 10, 0));
        m.add(mesh(new THREE.BoxGeometry(1.2, 3, 1.6), mat(0x6c6458), 0, 9.5, 2.2));
        m.add(mesh(new THREE.BoxGeometry(4.6, 1, 4), mat(0x6c6458), 0, 12.5, -0.2));
        m.position.set(Math.cos(a) * R * 0.45, top, Math.sin(a) * R * 0.45);
        m.rotation.y = -a + Math.PI / 2;
        m.lookAt(m.position.x * 2, top, m.position.z * 2 + 40);
        add(m);
      }
      for (let i = 0; i < 4; i++) { const [x, z] = place(0.6, 0.85); add(palm(r, x, z, top, 0.8)); }
      break;
    case 'whale': {
      const w = add(mesh(new THREE.IcosahedronGeometry(R * 0.32, 1), mat(0x4d6f8f), 0, top + R * 0.12, 0));
      w.scale.set(1.7, 0.6, 0.8);
      const tail = add(mesh(new THREE.ConeGeometry(R * 0.15, R * 0.3, 3), mat(0x4d6f8f), -R * 0.62, top + R * 0.2, 0));
      tail.rotation.z = Math.PI / 2; tail.scale.z = 0.3;
      for (let i = 0; i < 5; i++) { const [x, z] = place(0.55, 0.85); add(palm(r, x, z, top, 0.8)); }
      break;
    }
    case 'dokdo': {
      // 동도와 서도, 두 바위섬
      const peak = (x, z, h, rad, seed) => {
        const rr = rng(seed);
        const grp = new THREE.Group();
        const geo = jitterRadial(new THREE.ConeGeometry(rad, h, 7, 3), seed, 0.25);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + (rr() - 0.5) * 2);
        geo.computeVertexNormals();
        grp.add(mesh(geo, mat(0x8c8273), 0, h / 2, 0));
        grp.add(mesh(jitterRadial(new THREE.ConeGeometry(rad * 0.55, h * 0.45, 7, 1), seed + 1, 0.2), mat(0x5f9a45), 0, h * 0.78, 0));
        grp.position.set(x, top - 2, z);
        return grp;
      };
      add(peak(-R * 0.38, -R * 0.1, 46, R * 0.42, 5));
      add(peak(R * 0.36, R * 0.08, 34, R * 0.38, 9));
      for (let i = 0; i < 7; i++) { const [x, z] = place(0.55, 0.9); add(rock(r, x, z, top, 3 + r() * 3, 0x7a7266)); }
      const lh = new THREE.Group();
      lh.add(mesh(new THREE.CylinderGeometry(2, 2.4, 9, 8), mat(0xf4f4f4), 0, 4.5, 0));
      lh.add(mesh(new THREE.CylinderGeometry(1.6, 1.6, 2, 8), mat(0xfff2a8, { emissive: 0xffd84a, emissiveIntensity: 0.6 }), 0, 10, 0));
      lh.position.set(R * 0.42, top + 26, R * 0.05);
      add(lh);
      g.userData.koreaFlag = add(flagPole(R * 0.05, R * 0.45, top, taegukgi(), 16));
      break;
    }
  }

  // 점령 표시 깃발
  const fp = flagPole(R * 0.55, R * 0.55, top, pirateFlag(), 13);
  fp.visible = def.deco !== 'dokdo';
  fp.userData.flag.name = 'ownerFlagCloth';
  g.add(fp);
  g.userData.ownerFlag = fp;
  g.userData.radius = R * 1.15;
  return g;
}

export function setIslandOwned(island, owned) {
  const f = island.getObjectByName('ownerFlagCloth');
  if (!f) return;
  f.material = new THREE.MeshLambertMaterial({ map: owned ? ownFlag() : pirateFlag(), side: THREE.DoubleSide });
}

// ---------- 소품 ----------
export function makeArenaGate() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(3, 3.6, 26, 6), mat(0x9a8f80), s * 18, 11, 0));
    g.add(mesh(new THREE.ConeGeometry(4, 5, 6), mat(0xc0533a), s * 18, 26.5, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(44, 4, 5), mat(0x9a8f80), 0, 22, 0));
  g.add(mesh(new THREE.BoxGeometry(30, 6, 0.6), new THREE.MeshLambertMaterial({ map: canvasTex(256, 52, (c, w, h) => {
    c.fillStyle = '#c0533a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ARENA', w / 2, h / 2 + 2);
  }) }), 0, 17, 2.8));
  return g;
}

export function makeBuoy(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.6, 2, 2.4, 6), mat(color), 0, 0.6, 0));
  g.add(mesh(new THREE.ConeGeometry(1.2, 2.4, 6), mat(0xf4f4f4), 0, 3, 0));
  return g;
}

export function makeLoot(kind) {
  if (kind === 'coin') {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const c = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.4, 8), mat(0xf2c230, { emissive: 0x6b4f00 }), (i - 1) * 0.6, 0.5 + i * 0.45, 0);
      g.add(c);
    }
    return g;
  }
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(3, 2.4, 3), mat(0x9a6b3c), 0, 0.8, 0));
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.5, 3.2), mat(0x6b4423), 0, 2, 0));
  return g;
}

export function makeSeagull() {
  const g = new THREE.Group();
  const body = mesh(new THREE.ConeGeometry(0.5, 2.6, 4), mat(0xf4f4f4), 0, 0, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const w = mesh(new THREE.BoxGeometry(3, 0.12, 1.1), mat(0xf4f4f4), s * 1.5, 0, 0);
    pivot.add(w);
    g.add(pivot);
    wings.push({ pivot, s });
  }
  g.userData.wings = wings;
  return g;
}
export function flap(gull, t) {
  for (const w of gull.userData.wings) w.pivot.rotation.z = w.s * Math.sin(t * 8) * 0.5;
}

export function makeNessy() {
  const g = new THREE.Group();
  const green = mat(0x3f8f5a), light = mat(0x7cc48f);
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(2.2 - i * 0.4, 0), green, 0, 0.6, -i * 3.2));
  const neck = mesh(new THREE.CylinderGeometry(0.7, 1.1, 8, 6), green, 0, 4, 2.6);
  neck.rotation.x = 0.35;
  g.add(neck);
  g.add(mesh(new THREE.BoxGeometry(1.8, 1.4, 2.8), green, 0, 8, 4.4));
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.4, 2.2), light, 0, 7.3, 4.6));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.3, 5, 4), mat(0x111111), s * 0.8, 8.3, 5.2));
  return g;
}

export function makeDolphin() {
  const g = new THREE.Group();
  const body = mesh(new THREE.IcosahedronGeometry(1.6, 1), mat(0x7f9db8), 0, 0, 0);
  body.scale.set(0.8, 0.8, 2.6);
  g.add(body);
  const fin = mesh(new THREE.ConeGeometry(0.6, 1.6, 3), mat(0x6c8aa5), 0, 1.4, -0.3);
  fin.rotation.x = -0.4;
  g.add(fin);
  const tail = mesh(new THREE.BoxGeometry(2.6, 0.2, 0.8), mat(0x6c8aa5), 0, 0, -4);
  g.add(tail);
  const nose = mesh(new THREE.ConeGeometry(0.5, 1.4, 5), mat(0x7f9db8), 0, -0.1, 4.6);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  return g;
}

export function makeWhaleShadow() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0x0a2a44, transparent: true, opacity: 0.35, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CircleGeometry(10, 16), m);
  body.rotation.x = -Math.PI / 2;
  body.scale.set(0.9, 3.2, 1);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.CircleGeometry(5, 3), m);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -34;
  tail.scale.set(1.8, 0.6, 1);
  g.add(tail);
  g.position.y = -0.6;
  return g;
}

// 수면 아래 비친 모습: 위아래로 뒤집은 복제
export function makeReflection(obj) {
  // clone()은 userData를 JSON으로 복사하므로, 메시 참조가 든 userData는 잠시 비운다
  const saved = [];
  obj.traverse(o => { saved.push([o, o.userData]); o.userData = {}; });
  const r = obj.clone(true);
  for (const [o, u] of saved) o.userData = u;
  r.scale.y = -1;
  r.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
  return r;
}

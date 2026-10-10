import * as D from './data.js';

const ICONS = {
  coins: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="#f2c230" stroke="#b8860b" stroke-width="1.5"/><circle cx="10" cy="10" r="5" fill="none" stroke="#b8860b" stroke-width="1.3"/></svg>',
  fish: '<svg viewBox="0 0 20 20"><ellipse cx="9" cy="10" rx="6.5" ry="4" fill="#9fd3f0" stroke="#4a8fbf" stroke-width="1.2"/><path d="M15 10 L19 6 L19 14 Z" fill="#9fd3f0" stroke="#4a8fbf" stroke-width="1.2"/><circle cx="6" cy="9" r="1" fill="#1e3a5a"/></svg>',
  wood: '<svg viewBox="0 0 20 20"><rect x="2" y="9" width="14" height="5" rx="2.5" fill="#a0693a" stroke="#6b4423"/><rect x="4" y="4" width="14" height="5" rx="2.5" fill="#b87a44" stroke="#6b4423"/><circle cx="16" cy="11.5" r="2" fill="#e0b07a"/><circle cx="18" cy="6.5" r="1.8" fill="#e0b07a"/></svg>',
  ore: '<svg viewBox="0 0 20 20"><path d="M3 13 L6 5 L13 3 L18 9 L15 16 L7 17 Z" fill="#a9afb8" stroke="#6b717a" stroke-width="1.2"/><path d="M6 5 L10 10 L13 3 M10 10 L15 16" stroke="#6b717a" fill="none"/></svg>',
  silver: '<svg viewBox="0 0 20 20"><path d="M2 15 L5 6 L15 6 L18 15 Z" fill="#dfe3ea" stroke="#8a919c" stroke-width="1.2"/><path d="M5 6 L7 9 L13 9 L15 6" fill="#f4f6fa" stroke="#8a919c"/></svg>',
  gold: '<svg viewBox="0 0 20 20"><path d="M2 15 L5 6 L15 6 L18 15 Z" fill="#f2c230" stroke="#b8860b" stroke-width="1.2"/><path d="M5 6 L7 9 L13 9 L15 6" fill="#ffe27a" stroke="#b8860b"/></svg>',
  gem: '<svg viewBox="0 0 20 20"><path d="M5 3 L15 3 L19 8 L10 18 L1 8 Z" fill="#ff7ab8" stroke="#c23d80" stroke-width="1.2"/><path d="M1 8 L19 8 M5 3 L8 8 L10 18 L12 8 L15 3" stroke="#c23d80" fill="none" stroke-width="0.8"/></svg>',
};
const icon = k => `<span class="ic">${ICONS[k]}</span>`;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const $ = id => document.getElementById(id);

export class UI {
  constructor(game) {
    this.g = game;
    this.bars = new Map();
    this.floats = [];
    this.toasts = $('toasts');
    this.layer = $('worldLayer');
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.lastHud = '';
    this.menuTab = 'dock';
    this.marketTimer = 0;
    this.buildHud();
    this.bindButtons();
  }

  // ---------- HUD ----------
  buildHud() {
    const r = $('resources');
    r.innerHTML = '';
    this.resEls = {};
    for (const k of ['coins', ...D.GOOD_IDS]) {
      const row = el('div', 'res', `${icon(k)}<b></b>`);
      r.appendChild(row);
      this.resEls[k] = row.querySelector('b');
    }
    this.cargoEl = el('div', 'res cargo', '');
    r.appendChild(this.cargoEl);
  }

  bindButtons() {
    const g = this.g;
    $('btnDock').onclick = () => g.dock();
    $('btnFish').onclick = () => { g.toggleFishing(); this.updateContext(); };
    $('btnArena').onclick = () => this.confirm('아레나', `몰려오는 해적 웨이브를 막아내는 도전입니다.<br>침몰해도 짐은 잃지 않습니다.<br>최고 기록: 웨이브 ${g.state.arenaBest[g.state.ocean]}`, '입장', () => g.enterArena());
    $('btnArenaExit').onclick = () => g.endArena(false);
    $('btnZoom').onclick = () => { g.zoomTarget = g.zoomTarget > 1.2 ? 1 : 1.7; };
    $('btnMap').onclick = () => this.showMap();
    $('btnSound').onclick = () => { g.sound.unlock(); g.sound.setMuted(!g.sound.muted); this.updateSoundBtn(); };
    $('btnSettings').onclick = () => this.showSettings();
    this.updateSoundBtn();
  }
  updateSoundBtn() { $('btnSound').textContent = this.g.sound.muted ? '소리 끔' : '소리 켬'; }

  updateHud(force) {
    const g = this.g, s = g.state;
    const vals = [s.coins, ...D.GOOD_IDS.map(k => s.cargo[k])];
    const key = vals.join(',') + '|' + Math.round(g.player?.hp || 0) + '|' + g.stats.maxHp + '|' + s.lv.body;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.resEls.coins.textContent = D.fmt(s.coins);
    for (const k of D.GOOD_IDS) {
      this.resEls[k].textContent = D.fmt(s.cargo[k]);
      this.resEls[k].parentElement.classList.toggle('zero', s.cargo[k] === 0);
    }
    const used = g.cargoUsed();
    this.cargoEl.innerHTML = `선창 <b>${used}</b> / ${g.stats.cargo}`;
    this.cargoEl.classList.toggle('full', used >= g.stats.cargo);
    if (g.player) {
      const f = Math.max(0, g.player.hp / g.stats.maxHp);
      $('hpFill').style.width = (f * 100).toFixed(1) + '%';
      $('hpFill').classList.toggle('low', f < 0.3);
      $('hpText').textContent = `${D.fmt(Math.max(0, g.player.hp))} / ${D.fmt(g.stats.maxHp)}`;
      $('lvText').textContent = `Lv.${s.lv.body}`;
    }
    if ($('islandMenu').classList.contains('open')) this.refreshMenuHeader();
  }

  toast(text, kind = 'info', ms = 2500) {
    const t = el('div', 'toast ' + kind, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.removeChild(this.toasts.firstChild);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  banner(text) {
    const b = $('banner');
    if (text) { b.textContent = text; b.classList.add('show'); } else b.classList.remove('show');
  }

  hurt() {
    const v = $('vignette');
    v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit');
    this.g.shake = 0.25;
    this.updateHud();
  }

  steer(I) {
    const s = $('steer');
    if (!I) { s.style.display = 'none'; return; }
    const dx = I.cx - I.sx, dy = I.cy - I.sy;
    const len = Math.min(90, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    s.style.display = 'block';
    s.style.left = I.sx + 'px'; s.style.top = I.sy + 'px';
    $('steerDrop').style.width = len + 'px';
    $('steerDrop').style.transform = `rotate(${ang}deg)`;
  }

  floatText(x, y, z, text, color) {
    const e = el('div', 'float', text);
    e.style.color = color;
    this.layer.appendChild(e);
    this.floats.push({ e, x, y, z, t: 0 });
    if (this.floats.length > 40) { const f = this.floats.shift(); f.e.remove(); }
  }

  updateContext() {
    const g = this.g;
    const show = (id, on) => $(id).classList.toggle('show', !!on);
    show('btnDock', g.nearDock && !g.arena);
    const canFish = g.fishing || g.canFish();
    show('btnFish', canFish && !g.nearDock);
    $('btnFish').classList.toggle('active', !!g.fishing);
    $('btnFish').querySelector('span').textContent = g.fishing ? '낚시 그만' : '낚시';
    const prog = g.fishing ? g.fishing.t / g.stats.fishTime : 0;
    $('fishProg').style.width = (prog * 100) + '%';
    show('btnArena', g.nearGate() && !g.player.sinking);
  }

  // ---------- 매 프레임 ----------
  frame(dt) {
    const g = this.g;
    // 떠오르는 숫자
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const p = g.toScreen(f.x, f.y + f.t * 8, f.z);
      if (!p || f.t > 1.3) { f.e.remove(); this.floats.splice(i, 1); continue; }
      f.e.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      f.e.style.opacity = Math.min(1, (1.3 - f.t) * 2.5);
    }
    // 체력 바
    const seen = new Set();
    const list = g.enemies.filter(e => !e.dead && (e.aggro || e.hp < e.maxHp));
    for (const e of list) {
      seen.add(e.id);
      let b = this.bars.get(e.id);
      if (!b) {
        b = el('div', 'ebar' + (e.T.boss ? ' boss' : ''), `<i></i><span>${e.T.name}</span>`);
        this.layer.appendChild(b);
        this.bars.set(e.id, b);
      }
      const p = g.toScreen(e.x, (e.T.boss ? 40 : 14 * e.T.scale + 6), e.z);
      if (!p) { b.style.display = 'none'; continue; }
      b.style.display = 'block';
      b.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      b.firstChild.style.width = (Math.max(0, e.hp / e.maxHp) * 100) + '%';
    }
    for (const [id, b] of this.bars) if (!seen.has(id)) { b.remove(); this.bars.delete(id); }
    // 플레이어 머리 위 체력
    const pb = $('pbar');
    if (g.player && !g.player.sinking) {
      const p = g.toScreen(g.player.x, g.player.model.userData.len * 0.9 + 4, g.player.z);
      if (p) {
        pb.style.display = 'block';
        pb.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
        pb.firstChild.style.width = (Math.max(0, g.player.hp / g.stats.maxHp) * 100) + '%';
      }
    } else pb.style.display = 'none';
    this.updateContext();
    this.drawMinimap();
    if ($('islandMenu').classList.contains('open')) {
      this.marketTimer += dt;
      if (this.marketTimer > 0.5) { this.marketTimer = 0; this.tickMenu(); }
    }
  }

  drawMinimap() {
    const g = this.g, c = this.miniCtx, cv = this.mini;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = cv.clientWidth;
    if (size < 30) return;
    if (cv.width !== size * dpr) { cv.width = size * dpr; cv.height = size * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = size / 2;
    c.clearRect(0, 0, size, size);
    c.fillStyle = 'rgba(20,70,105,0.55)';
    c.beginPath(); c.arc(R, R, R - 9, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', R, 5); c.fillText('S', R, size - 5); c.fillText('W', 5, R); c.fillText('E', size - 5, R);
    const p = g.player;
    if (!p) return;
    const range = 480;
    const k = (R - 12) / range;
    c.save();
    c.beginPath(); c.arc(R, R, R - 10, 0, Math.PI * 2); c.clip();
    const pt = (x, z) => [R + (x - p.x) * k, R + (z - p.z) * k];
    for (const isl of g.islands) {
      const [x, y] = pt(isl.x, isl.z);
      c.fillStyle = g.state.captured[isl.def.id] ? '#6fdc6f' : (isl.def.final ? '#ffd84a' : '#ff6b6b');
      c.beginPath(); c.arc(x, y, Math.max(3, isl.radius * k), 0, Math.PI * 2); c.fill();
    }
    if (g.gate && !g.arena) {
      const [x, y] = pt(g.gate.x, g.gate.z);
      c.fillStyle = '#c38bff'; c.fillRect(x - 3, y - 3, 6, 6);
    }
    c.fillStyle = '#ffd84a';
    for (const l of g.loot) { const [x, y] = pt(l.x, l.z); c.fillRect(x - 1.5, y - 1.5, 3, 3); }
    c.fillStyle = '#ff3b3b';
    for (const e of g.enemies) { if (e.dead) continue; const [x, y] = pt(e.x, e.z); c.beginPath(); c.arc(x, y, e.T.boss ? 4 : 2.2, 0, Math.PI * 2); c.fill(); }
    c.restore();
    c.save();
    c.translate(R, R);
    c.rotate(-p.heading + Math.PI);
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(-4, 5); c.closePath(); c.fill();
    c.restore();
  }

  arenaHud(info) {
    const a = $('arenaHud');
    if (!info) { a.classList.remove('show'); return; }
    a.classList.add('show');
    $('arenaInfo').innerHTML = `웨이브 <b>${info.wave}</b> · 남은 적 <b>${info.alive}</b> · 보상 ${icon('coins')}<b>${D.fmt(info.reward)}</b>`;
  }

  // ---------- 모달 ----------
  modal(html, cls = '') {
    const m = $('modal');
    m.className = 'overlay show ' + cls;
    $('modalBox').innerHTML = html;
    this.g.paused = true;
    return $('modalBox');
  }
  closeModal() {
    $('modal').className = 'overlay';
    this.g.paused = false;
    this.g.last = performance.now();
  }
  alert(title, body) {
    const box = this.modal(`<h2>${title}</h2><p>${body}</p><div class="btns"><button class="btn primary" data-a="ok">확인</button></div>`);
    box.querySelector('[data-a=ok]').onclick = () => this.closeModal();
  }
  confirm(title, body, ok, fn) {
    const box = this.modal(`<h2>${title}</h2><p>${body}</p><div class="btns"><button class="btn" data-a="no">취소</button><button class="btn primary" data-a="ok">${ok}</button></div>`);
    box.querySelector('[data-a=no]').onclick = () => this.closeModal();
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); fn(); };
  }

  showTitle(hasSave) {
    const t = $('title');
    t.classList.add('show');
    $('btnContinue').style.display = hasSave ? '' : 'none';
    $('btnNew').textContent = hasSave ? '처음부터' : '출항하기';
    $('btnContinue').onclick = () => { t.classList.remove('show'); this.g.start(false); };
    $('btnNew').onclick = () => {
      const go = () => { t.classList.remove('show'); this.g.start(true); };
      if (hasSave) {
        t.classList.remove('show');
        const box = this.modal(`<h2>처음부터 시작할까요?</h2><p>지금까지의 진행 상황이 지워집니다.</p><div class="btns"><button class="btn" data-a="no">취소</button><button class="btn danger" data-a="ok">처음부터</button></div>`);
        box.querySelector('[data-a=no]').onclick = () => { $('modal').className = 'overlay'; t.classList.add('show'); };
        box.querySelector('[data-a=ok]').onclick = () => { $('modal').className = 'overlay'; go(); };
      } else go();
    };
  }

  showDeath(lost, cb) {
    const items = D.GOOD_IDS.filter(k => lost[k] > 0).map(k => `<span class="chip">${icon(k)}${lost[k]}</span>`).join('');
    const isl = this.g.islands.find(i => i.def.id === this.g.state.lastIsland);
    const box = this.modal(`<h2>배가 침몰했습니다</h2><p>${items ? '선창의 짐을 잃었습니다.<br><span class="chips">' + items + '</span>' : '잃은 짐은 없습니다.'}</p><p class="sub">코인과 강화는 그대로 남아 있습니다.</p><div class="btns"><button class="btn primary" data-a="ok">${isl ? isl.def.name : '항구'}에서 다시 출항</button></div>`, 'death');
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); cb(); };
  }

  showEnding() {
    const s = this.g.state;
    const m = Math.floor(s.stats.time / 60);
    const box = this.modal(`<div class="ending"><div class="flagbig"></div><h2>독도까지 도착했습니다!</h2>
      <p>크라켄을 물리치고 독도를 지켜냈습니다.</p>
      <div class="stats"><div><b>${s.stats.kills}</b>격침</div><div><b>${s.stats.fished}</b>물고기</div><div><b>${s.stats.deaths}</b>침몰</div><div><b>${Math.floor(m / 60)}시간 ${m % 60}분</b>항해</div></div>
      <p class="sub">계속 배를 키우고 아레나 기록에 도전할 수 있습니다.</p></div>
      <div class="btns"><button class="btn primary" data-a="ok">계속 항해</button></div>`, 'endingModal');
    box.querySelector('[data-a=ok]').onclick = () => this.closeModal();
  }

  showSettings() {
    const g = this.g;
    const box = this.modal(`<h2>설정</h2>
      <div class="help">
        <p><b>조종</b> 바다를 누른 채 끌면 그 방향으로 나아가고, 손을 떼면 멈춥니다. 두 번 탭하면 그 방향으로 계속 항해합니다. PC는 방향키나 WASD도 됩니다.</p>
        <p><b>전투</b> 대포는 배 옆구리에 있습니다. 적을 배 옆쪽에 두면 자동으로 발사합니다.</p>
        <p><b>섬</b> 섬에 다가가면 방어 함대가 나옵니다. 모두 격침하면 점령되고, 점령한 섬의 부두에서 수리·강화·교역을 할 수 있습니다.</p>
        <p><b>낚시</b> 점령한 섬 가까이, 적이 없을 때 할 수 있습니다.</p>
        <p><b>강화</b> 선체 레벨이 다른 강화의 최대 레벨입니다.</p>
      </div>
      <div class="btns col">
        <button class="btn" data-a="sound">${g.sound.muted ? '소리 켜기' : '소리 끄기'}</button>
        <button class="btn" data-a="export">저장 데이터 복사</button>
        <button class="btn" data-a="import">저장 데이터 붙여넣기</button>
        <button class="btn danger" data-a="reset">처음부터 다시</button>
        <button class="btn primary" data-a="ok">닫기</button>
      </div>`);
    box.querySelector('[data-a=ok]').onclick = () => this.closeModal();
    box.querySelector('[data-a=sound]').onclick = () => { g.sound.unlock(); g.sound.setMuted(!g.sound.muted); this.updateSoundBtn(); this.closeModal(); };
    box.querySelector('[data-a=export]').onclick = () => {
      const code = g.exportSave();
      const b = this.modal(`<h2>저장 데이터</h2><p class="sub">아래 글자를 복사해 두면 다른 기기에서 이어서 할 수 있습니다.</p><textarea readonly>${code}</textarea><div class="btns"><button class="btn" data-a="copy">복사</button><button class="btn primary" data-a="ok">닫기</button></div>`);
      const ta = b.querySelector('textarea');
      b.querySelector('[data-a=copy]').onclick = () => { ta.select(); try { navigator.clipboard.writeText(code); } catch (e) { document.execCommand('copy'); } this.toast('복사했습니다'); };
      b.querySelector('[data-a=ok]').onclick = () => this.closeModal();
    };
    box.querySelector('[data-a=import]').onclick = () => {
      const b = this.modal(`<h2>저장 데이터 붙여넣기</h2><textarea placeholder="저장 데이터를 붙여넣으세요"></textarea><div class="btns"><button class="btn" data-a="no">취소</button><button class="btn primary" data-a="ok">불러오기</button></div>`);
      b.querySelector('[data-a=no]').onclick = () => this.closeModal();
      b.querySelector('[data-a=ok]').onclick = () => {
        try { g.importSave(b.querySelector('textarea').value); } catch (e) { this.toast('저장 데이터가 올바르지 않습니다', 'warn'); }
      };
    };
    box.querySelector('[data-a=reset]').onclick = () => {
      const b = this.modal(`<h2>처음부터 다시</h2><p>모든 진행 상황이 지워집니다. 정말 할까요?</p><div class="btns"><button class="btn" data-a="no">취소</button><button class="btn danger" data-a="ok">지우기</button></div>`);
      b.querySelector('[data-a=no]').onclick = () => this.closeModal();
      b.querySelector('[data-a=ok]').onclick = () => g.resetSave();
    };
  }

  // ---------- 지도 ----------
  showMap() {
    const g = this.g;
    let view = g.state.ocean;
    const box = this.modal(`<h2>세계 지도</h2><div class="tabs" id="mapTabs"></div><canvas id="mapCanvas"></canvas><div id="mapInfo" class="sub"></div><div class="btns"><button class="btn" data-a="travel" style="display:none"></button><button class="btn primary" data-a="ok">닫기</button></div>`, 'mapModal');
    const draw = () => {
      const tabs = box.querySelector('#mapTabs');
      tabs.innerHTML = '';
      D.OCEANS.forEach(o => {
        const b = el('button', 'tab' + (o.id === view ? ' on' : ''), (g.state.unlocked[o.id] ? '' : '🔒 ') + o.name);
        b.onclick = () => { view = o.id; draw(); };
        tabs.appendChild(b);
      });
      const cv = box.querySelector('#mapCanvas');
      const size = Math.min(cv.clientWidth || 320, 520);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = size * dpr; cv.height = size * dpr; cv.style.height = size + 'px';
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const H = D.OCEAN_HALF;
      const k = size / (H * 2);
      const P = (x, z) => [(x + H) * k, (z + H) * k];
      const grd = c.createLinearGradient(0, 0, 0, size);
      grd.addColorStop(0, '#1d5f86'); grd.addColorStop(1, '#2f86b4');
      c.fillStyle = grd; c.fillRect(0, 0, size, size);
      c.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * size / 8, 0); c.lineTo(i * size / 8, size); c.moveTo(0, i * size / 8); c.lineTo(size, i * size / 8); c.stroke(); }
      const ocean = D.OCEANS[view];
      const locked = !g.state.unlocked[view];
      // 항로
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([4, 5]); c.lineWidth = 1.5;
      c.beginPath();
      ocean.islands.forEach((i, n) => { const [x, y] = P(i.x, i.z); n ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke(); c.setLineDash([]);
      for (const i of ocean.islands) {
        const [x, y] = P(i.x, i.z);
        const own = g.state.captured[i.id];
        c.fillStyle = own ? '#6fdc6f' : i.final ? '#ffd84a' : '#e9d79c';
        c.beginPath(); c.arc(x, y, Math.max(5, i.r * k * 1.1), 0, Math.PI * 2); c.fill();
        c.strokeStyle = own ? '#2f7d3a' : '#8a6a45'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 12px "Noto Sans KR", sans-serif'; c.textAlign = 'center';
        c.fillText(i.name, x, y - i.r * k - 9);
        c.font = '10px "Noto Sans KR", sans-serif';
        c.fillStyle = own ? '#bdf5bd' : '#ffd0d0';
        c.fillText(own ? '점령' : `권장 Lv.${Math.round(D.expectedLevel(i.tier))}`, x, y + i.r * k + 14);
      }
      const [ax, ay] = P(ocean.arena.x, ocean.arena.z);
      c.fillStyle = '#c38bff'; c.fillRect(ax - 5, ay - 5, 10, 10);
      c.fillStyle = '#fff'; c.font = '11px sans-serif'; c.fillText('아레나', ax, ay + 18);
      if (view === g.state.ocean && !g.arena) {
        const [px, py] = P(g.player.x, g.player.z);
        c.save(); c.translate(px, py); c.rotate(-g.player.heading + Math.PI);
        c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(-6, 7); c.closePath(); c.fill(); c.stroke();
        c.restore();
      }
      if (locked) {
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, size, size);
        c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif'; c.fillText('태평양의 모든 섬을 점령하면 열립니다', size / 2, size / 2);
      }
      const capturedN = ocean.islands.filter(i => g.state.captured[i.id]).length;
      box.querySelector('#mapInfo').textContent = `${ocean.name}: 섬 ${capturedN} / ${ocean.islands.length} 점령 · 아레나 최고 웨이브 ${g.state.arenaBest[view]}`;
      const tb = box.querySelector('[data-a=travel]');
      if (!locked && view !== g.state.ocean && !g.arena) {
        tb.style.display = ''; tb.textContent = `${ocean.name}(으)로 항해`;
        tb.onclick = () => { this.closeModal(); g.travel(view); };
      } else tb.style.display = 'none';
    };
    box.querySelector('[data-a=ok]').onclick = () => this.closeModal();
    requestAnimationFrame(draw);
  }

  // ---------- 섬 메뉴 ----------
  getMarket(isl) {
    const s = this.g.state;
    const period = Math.floor(Date.now() / D.MARKET_PERIOD_MS);
    let m = s.markets[isl.def.id];
    if (!m || m.period !== period) {
      const avail = D.goodsForTier(isl.def.tier);
      m = { period, stock: {}, mult: {} };
      for (const g of D.GOODS) {
        const r = D.rng(D.hashStr(isl.def.id + ':' + period + ':' + g.id));
        m.mult[g.id] = 0.75 + r() * 0.55;
        m.stock[g.id] = avail.includes(g.id) ? Math.round(g.stock * (0.7 + r() * 0.6)) : 0;
      }
      s.markets[isl.def.id] = m;
    }
    return m;
  }
  prices(isl, gid) {
    const m = this.getMarket(isl);
    const base = D.GOODS.find(g => g.id === gid).base;
    return { buy: Math.max(1, Math.round(base * m.mult[gid])), sell: Math.max(1, Math.round(base * 0.8 * m.mult[gid])), stock: m.stock[gid] };
  }

  openIsland(isl) {
    this.isl = isl;
    const m = $('islandMenu');
    m.classList.add('open');
    document.body.classList.add('menuopen');
    $('menuName').textContent = isl.def.name;
    $('btnUndock').onclick = () => this.g.undock();
    m.querySelectorAll('.mtab').forEach(b => { b.onclick = () => { this.menuTab = b.dataset.tab; this.renderMenu(); }; });
    this.renderMenu();
  }
  closeIsland() { $('islandMenu').classList.remove('open'); document.body.classList.remove('menuopen'); this.isl = null; }

  refreshMenuHeader() {
    const g = this.g;
    $('menuCoins').innerHTML = `${icon('coins')}<b>${D.fmt(g.state.coins)}</b>`;
    $('menuCargo').textContent = `선창 ${g.cargoUsed()} / ${g.stats.cargo}`;
  }

  costHtml(cost) {
    const s = this.g.state;
    return Object.entries(cost).map(([k, v]) => {
      const have = k === 'coins' ? s.coins : s.cargo[k];
      return `<span class="chip ${have < v ? 'lack' : ''}">${icon(k)}${D.fmt(v)}</span>`;
    }).join('');
  }
  afford(cost) {
    const s = this.g.state;
    return Object.entries(cost).every(([k, v]) => (k === 'coins' ? s.coins : s.cargo[k]) >= v);
  }
  pay(cost) {
    const s = this.g.state;
    for (const [k, v] of Object.entries(cost)) { if (k === 'coins') s.coins -= v; else s.cargo[k] -= v; }
  }

  renderMenu() {
    const g = this.g;
    document.querySelectorAll('.mtab').forEach(b => b.classList.toggle('on', b.dataset.tab === this.menuTab));
    this.refreshMenuHeader();
    const body = $('menuBody');
    body.innerHTML = '';
    if (this.menuTab === 'dock') this.renderDock(body);
    else if (this.menuTab === 'market') this.renderMarket(body);
    else this.renderAssist(body);
    g.ui.updateHud(true);
  }

  renderDock(body) {
    const g = this.g, s = g.state, st = g.stats, p = g.player;
    const missing = Math.max(0, st.maxHp - p.hp);
    const repairCost = { coins: Math.ceil(missing / st.maxHp * 15 * Math.pow(1.13, s.lv.body)) };
    const rep = el('div', 'row');
    rep.innerHTML = `<div class="rinfo"><div class="rname">수리</div><div class="rdesc">체력 ${D.fmt(p.hp)} / ${D.fmt(st.maxHp)}</div></div><div class="rcost">${missing > 0.5 ? this.costHtml(repairCost) : ''}</div>`;
    const rb = el('button', 'rbtn', missing > 0.5 ? '수리' : '정상');
    rb.disabled = missing <= 0.5 || !this.afford(repairCost);
    rb.onclick = () => { this.pay(repairCost); p.hp = st.maxHp; g.sound.play('buy', 0.5); this.renderMenu(); };
    rep.appendChild(rb);
    body.appendChild(rep);

    const next = { ...s.lv };
    for (const u of D.UPGRADES) {
      const lvl = s.lv[u.id];
      const cap = u.id === 'body' ? D.MAX_LEVEL : Math.min(D.MAX_LEVEL, s.lv.body);
      const maxed = lvl >= D.MAX_LEVEL;
      const capped = !maxed && lvl >= cap;
      const cost = D.upgradeCost(u.id, lvl);
      next[u.id] = lvl + 1;
      const a = D.playerStats(s.lv, s.assistants), b = D.playerStats(next, s.assistants);
      next[u.id] = lvl;
      const eff = {
        body: `체력 ${D.fmt(a.maxHp)}→${D.fmt(b.maxHp)} · 선창 ${a.cargo}→${b.cargo}`,
        sail: `속도 ${a.speed.toFixed(1)}→${b.speed.toFixed(1)}`,
        steer: `회전 ${a.turn.toFixed(2)}→${b.turn.toFixed(2)}`,
        cannon: `피해 ${D.fmt(a.dmg)}→${D.fmt(b.dmg)} · 사거리 ${Math.round(a.range)}→${Math.round(b.range)}${b.guns > a.guns ? ` · 포문 ${a.guns}→${b.guns}` : ''}`,
        fish: `어획량 ${a.fishAmount.toFixed(0)}→${b.fishAmount.toFixed(0)}`,
      }[u.id];
      const row = el('div', 'row');
      row.innerHTML = `<div class="rinfo"><div class="rname">${u.name} <span class="lv">Lv.${lvl}</span></div><div class="rdesc">${maxed ? '최대 레벨' : capped ? `선체 Lv.${lvl + 1} 필요` : eff}</div></div><div class="rcost">${maxed || capped ? '' : this.costHtml(cost)}</div>`;
      const btn = el('button', 'rbtn up', maxed ? '최대' : capped ? '잠김' : '강화');
      btn.disabled = maxed || capped || !this.afford(cost);
      btn.onclick = () => {
        if (!this.afford(cost)) return;
        this.pay(cost);
        s.lv[u.id]++;
        g.sound.play('upgrade', 0.5);
        g.refreshStats();
        g.save();
        this.toast(`${u.name} Lv.${s.lv[u.id]}!`, 'good', 1500);
        this.renderMenu();
      };
      row.appendChild(btn);
      body.appendChild(row);
    }
  }

  renderMarket(body) {
    const g = this.g;
    const isl = this.isl;
    const head = el('div', 'mhead', `<span>다음 입고 <b id="mReset"></b></span><span class="tip">버튼을 누르고 있으면 계속 사고팝니다</span>`);
    body.appendChild(head);
    this.marketRows = {};
    for (const good of D.GOODS) {
      const row = el('div', 'row mrow');
      row.innerHTML = `<div class="gicon">${ICONS[good.id]}<small class="stock"></small></div><div class="ginfo"><div class="rname">${good.name}</div><div class="rdesc have"></div></div>`;
      const buy = el('button', 'rbtn buy', '');
      const sell = el('button', 'rbtn sell', '');
      row.appendChild(buy); row.appendChild(sell);
      body.appendChild(row);
      this.marketRows[good.id] = { row, buy, sell };
      this.holdable(buy, () => this.trade(good.id, 'buy'));
      this.holdable(sell, () => this.trade(good.id, 'sell'));
    }
    this.updateMarket();
    this.tickMenu();
  }

  holdable(btn, fn) {
    let t1 = null, t2 = null;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (btn.disabled) return;
      fn();
      t1 = setTimeout(() => { t2 = setInterval(() => { if (btn.disabled || !fn()) stop(); }, 70); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  }

  trade(gid, kind) {
    const g = this.g, s = g.state;
    const m = this.getMarket(this.isl);
    const pr = this.prices(this.isl, gid);
    if (kind === 'buy') {
      if (pr.stock <= 0 || s.coins < pr.buy || g.cargoUsed() >= g.stats.cargo) { g.sound.play('error', 0.3); return false; }
      s.coins -= pr.buy; s.cargo[gid]++; m.stock[gid]--;
    } else {
      if (s.cargo[gid] <= 0) { g.sound.play('error', 0.3); return false; }
      s.coins += pr.sell; s.cargo[gid]--; m.stock[gid]++;
    }
    g.sound.play(kind === 'buy' ? 'buy' : 'coin', 0.25);
    this.updateMarket();
    this.updateHud(true);
    return true;
  }

  updateMarket() {
    const g = this.g, s = g.state;
    if (!this.marketRows || !this.isl) return;
    const full = g.cargoUsed() >= g.stats.cargo;
    for (const good of D.GOODS) {
      const r = this.marketRows[good.id];
      const pr = this.prices(this.isl, good.id);
      r.row.querySelector('.stock').textContent = pr.stock;
      r.row.querySelector('.have').textContent = `보유 ${s.cargo[good.id]}`;
      const canBuy = pr.stock > 0 && s.coins >= pr.buy && !full;
      r.buy.disabled = !canBuy;
      r.buy.innerHTML = pr.stock <= 0 ? '품절' : `<small>사기</small><span>${icon('coins')}${D.fmt(pr.buy)}</span>`;
      r.sell.disabled = s.cargo[good.id] <= 0;
      r.sell.innerHTML = s.cargo[good.id] > 0 ? `<small>팔기</small><span>${icon('coins')}${D.fmt(pr.sell)}</span>` : '없음';
    }
  }

  tickMenu() {
    if (this.menuTab === 'market' && this.isl) {
      const left = D.MARKET_PERIOD_MS - (Date.now() % D.MARKET_PERIOD_MS);
      const sec = Math.floor(left / 1000);
      const e = $('mReset');
      if (e) e.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      const m = this.g.state.markets[this.isl.def.id];
      if (!m || m.period !== Math.floor(Date.now() / D.MARKET_PERIOD_MS)) this.updateMarket();
    }
    if (this.menuTab === 'dock') {
      // 체력이 회복되며 수리 비용이 바뀐다
      const p = this.g.player;
      if (Math.round(p.hp) !== this._lastHp) { this._lastHp = Math.round(p.hp); this.renderMenu(); }
    }
  }

  renderAssist(body) {
    const g = this.g, s = g.state;
    for (const a of D.ASSISTANTS) {
      const lvl = s.assistants[a.id];
      const maxed = lvl >= D.ASSISTANT_MAX;
      const cost = D.assistantCost(a.id, lvl);
      const row = el('div', 'row');
      row.innerHTML = `<div class="aicon a-${a.id}"></div><div class="rinfo"><div class="rname">${a.name} ${lvl ? `<span class="lv">Lv.${lvl}</span>` : '<span class="lv off">없음</span>'}</div><div class="rdesc">${a.desc}</div></div><div class="rcost">${maxed ? '' : this.costHtml(cost)}</div>`;
      const btn = el('button', 'rbtn up', maxed ? '최대' : lvl ? '강화' : '고용');
      btn.disabled = maxed || !this.afford(cost);
      btn.onclick = () => {
        if (!this.afford(cost)) return;
        this.pay(cost);
        s.assistants[a.id]++;
        g.sound.play('upgrade', 0.5);
        g.refreshStats();
        g.createAssistants();
        g.save();
        this.toast(`${a.name} ${lvl ? 'Lv.' + s.assistants[a.id] : '고용!'}`, 'good', 1500);
        this.renderMenu();
      };
      row.appendChild(btn);
      body.appendChild(row);
    }
  }
}

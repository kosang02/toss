import * as D from './data.js';
import { emblemCanvas, EMBLEMS } from './models.js';

const ICONS = [
  '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="#f2c230" stroke="#b8860b" stroke-width="1.5"/><circle cx="10" cy="10" r="5" fill="none" stroke="#b8860b" stroke-width="1.3"/></svg>',
  '<svg viewBox="0 0 20 20"><ellipse cx="9" cy="10" rx="6.5" ry="4" fill="#9fd3f0" stroke="#4a8fbf" stroke-width="1.2"/><path d="M15 10 L19 6 L19 14 Z" fill="#9fd3f0" stroke="#4a8fbf" stroke-width="1.2"/><circle cx="6" cy="9" r="1" fill="#1e3a5a"/></svg>',
  '<svg viewBox="0 0 20 20"><rect x="2" y="9" width="14" height="5" rx="2.5" fill="#a0693a" stroke="#6b4423"/><rect x="4" y="4" width="14" height="5" rx="2.5" fill="#b87a44" stroke="#6b4423"/><circle cx="16" cy="11.5" r="2" fill="#e0b07a"/><circle cx="18" cy="6.5" r="1.8" fill="#e0b07a"/></svg>',
  '<svg viewBox="0 0 20 20"><path d="M3 13 L6 5 L13 3 L18 9 L15 16 L7 17 Z" fill="#a9afb8" stroke="#6b717a" stroke-width="1.2"/><path d="M6 5 L10 10 L13 3 M10 10 L15 16" stroke="#6b717a" fill="none"/></svg>',
  '<svg viewBox="0 0 20 20"><path d="M2 15 L5 6 L15 6 L18 15 Z" fill="#dfe3ea" stroke="#8a919c" stroke-width="1.2"/><path d="M5 6 L7 9 L13 9 L15 6" fill="#f4f6fa" stroke="#8a919c"/></svg>',
  '<svg viewBox="0 0 20 20"><path d="M2 15 L5 6 L15 6 L18 15 Z" fill="#f2c230" stroke="#b8860b" stroke-width="1.2"/><path d="M5 6 L7 9 L13 9 L15 6" fill="#ffe27a" stroke="#b8860b"/></svg>',
  '<svg viewBox="0 0 20 20"><path d="M5 3 L15 3 L19 8 L10 18 L1 8 Z" fill="#ff7ab8" stroke="#c23d80" stroke-width="1.2"/><path d="M1 8 L19 8 M5 3 L8 8 L10 18 L12 8 L15 3" stroke="#c23d80" fill="none" stroke-width="0.8"/></svg>',
];
const TICKET = '<svg viewBox="0 0 20 20"><path d="M2 5 H18 V8 A2 2 0 0 0 18 12 V15 H2 V12 A2 2 0 0 0 2 8 Z" fill="#ff8a5c" stroke="#b8481f" stroke-width="1.2"/><path d="M10 7 L11 9.3 L13.5 9.5 L11.6 11 L12.2 13.4 L10 12.1 L7.8 13.4 L8.4 11 L6.5 9.5 L9 9.3 Z" fill="#fff"/></svg>';
const icon = k => `<span class="ic">${ICONS[k]}</span>`;
const chips = (arr, have) => arr.map((v, k) => v > 0 ? `<span class="chip ${have && have[k] < v ? 'lack' : ''}">${icon(k)}${D.fmt(v)}</span>` : '').join('');

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
    this.layer = $('worldLayer');
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.lastHud = '';
    this.menuTab = 'dock';
    this.menuT = 0;
    this.buildHud();
    $('btnArena').onclick = () => this.confirm('아레나', `문이 닫히면 해적이 7척씩 몰려옵니다.<br>격침 수만큼 보상을 받습니다.<br>최고 기록: ${game.state.best[game.state.world]} KILL`, '입장', () => game.enterArena());
    $('btnArenaExit').onclick = () => game.endArena();
    $('btnZoom').onclick = () => { game.camSizeTarget = game.camSizeTarget > 18 ? 15 : Math.min(30, game.maxCam()); };
    $('btnMap').onclick = () => this.showMap();
    $('btnSound').onclick = () => { game.sound.unlock(); game.sound.setMuted(!game.sound.muted); this.updateSoundBtn(); };
    $('btnSettings').onclick = () => this.showSettings();
    $('btnUndock').onclick = () => game.unpark();
    document.querySelectorAll('.mtab').forEach(b => { b.onclick = () => { this.menuTab = b.dataset.tab; this.renderMenu(); }; });
    this.updateSoundBtn();
  }

  // ---------- HUD ----------
  buildHud() {
    const r = $('resources');
    r.innerHTML = '';
    this.resEls = [];
    for (let k = 0; k < 7; k++) {
      const row = el('div', 'res', `${icon(k)}<b></b>`);
      r.appendChild(row);
      this.resEls.push(row.querySelector('b'));
    }
    this.ticketEl = el('div', 'res ticket', '');
    r.appendChild(this.ticketEl);
  }
  updateSoundBtn() { $('btnSound').textContent = this.g.sound.muted ? '소리 끔' : '소리 켬'; }

  updateHud(force) {
    const g = this.g, s = g.state, p = g.player;
    if (!p) return;
    const key = s.res.join(',') + '|' + Math.round(p.hp) + '|' + g.maxHp() + '|' + s.revival + '|' + s.lv.body;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    for (let k = 0; k < 7; k++) {
      this.resEls[k].textContent = D.fmt(s.res[k]);
      this.resEls[k].parentElement.classList.toggle('zero', s.res[k] === 0);
    }
    this.ticketEl.innerHTML = `<span class="ic">${TICKET}</span><b>${s.revival}</b>`;
    const f = Math.max(0, p.hp / g.maxHp());
    $('hpFill').style.width = (f * 100).toFixed(1) + '%';
    $('hpFill').classList.toggle('low', f < 0.3);
    $('hpText').textContent = `${D.fmt(Math.max(0, p.hp))} / ${D.fmt(g.maxHp())}`;
    $('lvText').textContent = `Lv.${s.lv.body}`;
    if ($('islandMenu').classList.contains('open')) this.refreshMenuHeader();
  }

  toast(text, kind = 'info', ms = 2500) {
    const box = $('toasts');
    const t = el('div', 'toast ' + kind, text);
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
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
    this.updateHud(true);
  }
  steer(I) {
    const s = $('steer');
    if (!I) { s.style.display = 'none'; return; }
    const dx = I.cx - I.sx, dy = I.cy - I.sy;
    s.style.display = 'block';
    s.style.left = I.sx + 'px'; s.style.top = I.sy + 'px';
    $('steerDrop').style.width = Math.min(90, Math.hypot(dx, dy)) + 'px';
    $('steerDrop').style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  }
  floatText(x, y, z, text, color) {
    const e = el('div', 'float', text);
    e.style.color = color;
    this.layer.appendChild(e);
    this.floats.push({ e, x, y, z, t: 0 });
    if (this.floats.length > 40) this.floats.shift().e.remove();
  }

  // ---------- 매 프레임 ----------
  frame(dt) {
    const g = this.g, p = g.player;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const sp = g.toScreen(f.x, f.y + f.t * 20, f.z);
      if (!sp || f.t > 1.3) { f.e.remove(); this.floats.splice(i, 1); continue; }
      f.e.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%)`;
      f.e.style.opacity = Math.min(1, (1.3 - f.t) * 2.5);
    }
    // 적 체력
    const seen = new Set();
    for (const e of g.enemies) {
      if (e.dead || !(e.lock || e.hp < e.maxHp)) continue;
      seen.add(e.id);
      let b = this.bars.get(e.id);
      if (!b) {
        b = el('div', 'ebar', `<i></i><span>${e.pirate ? '해적' : '수비대'} Lv.${e.lv}</span>`);
        this.layer.appendChild(b);
        this.bars.set(e.id, b);
      }
      const sp = g.toScreen(e.x, 7 * D.K + e.len * 0.5, e.z);
      if (!sp) { b.style.display = 'none'; continue; }
      b.style.display = 'block';
      b.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
      b.firstChild.style.width = (Math.max(0, e.hp / e.maxHp) * 100) + '%';
    }
    for (const [id, b] of this.bars) if (!seen.has(id)) { b.remove(); this.bars.delete(id); }
    const pb = $('pbar');
    if (!p.dead && g.parked == null) {
      const sp = g.toScreen(p.x, 7 * D.K + p.len * 0.5, p.z);
      if (sp) { pb.style.display = 'block'; pb.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`; pb.firstChild.style.width = (Math.max(0, p.hp / g.maxHp()) * 100) + '%'; }
    } else pb.style.display = 'none';
    $('btnArena').classList.toggle('show', g.nearGate());
    $('fishing').classList.toggle('show', !!g.fishing && g.parked == null);
    this.drawMinimap();
    this.updatePointer();
    if ($('islandMenu').classList.contains('open')) {
      this.menuT += dt;
      if (this.menuT > 0.5) { this.menuT = 0; this.tickMenu(); }
    }
  }

  drawMinimap() {
    const g = this.g, c = this.miniCtx, cv = this.mini, p = g.player;
    const size = cv.clientWidth;
    if (size < 30) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== size * dpr) { cv.width = size * dpr; cv.height = size * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = size / 2;
    c.clearRect(0, 0, size, size);
    c.fillStyle = 'rgba(20,70,105,0.55)';
    c.beginPath(); c.arc(R, R, R - 9, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', R, 5); c.fillText('S', R, size - 5); c.fillText('W', 5, R); c.fillText('E', size - 5, R);
    const k = (R - 12) / (80 * D.K);
    c.save();
    c.beginPath(); c.arc(R, R, R - 10, 0, Math.PI * 2); c.clip();
    const pt = (x, z) => [R + (x - p.x) * k, R + (z - p.z) * k];
    for (const isl of g.islands) {
      const [x, y] = pt(isl.x, isl.z);
      c.fillStyle = g.state.done[isl.def.i] ? D.PLAYER_MAP_COLOR : D.FACTIONS[isl.def.fac].color;
      c.beginPath(); c.arc(x, y, Math.max(3, 22 * D.K * k), 0, Math.PI * 2); c.fill();
    }
    if (g.state.world === 0) { const [x, y] = pt(D.DOKDO.x, D.DOKDO.z); c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ffd84a';
    for (const l of g.loot) { const [x, y] = pt(l.x, l.z); c.fillRect(x - 1.5, y - 1.5, 3, 3); }
    c.fillStyle = '#ff3b3b';
    for (const e of g.enemies) { if (e.dead) continue; const [x, y] = pt(e.x, e.z); c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill(); }
    c.restore();
    c.save(); c.translate(R, R); c.rotate(-p.heading + Math.PI);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(-4, 5); c.closePath(); c.fill();
    c.restore();
  }

  // 목표 섬이 80보다 멀면 화면 가장자리에 방향 표시
  updatePointer() {
    const g = this.g, s = g.state, p = g.player, ptr = $('pointer');
    const t = D.ISLANDS[s.target];
    if (!t || t.world !== s.world || s.done[t.i] || g.parked != null || g.arena || p.dead) { ptr.style.display = 'none'; return; }
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < 80 * D.K) { ptr.style.display = 'none'; return; }
    const a = Math.atan2(t.z - p.z, t.x - p.x);
    const w = g.vw, h = g.vh;
    const rx = w / 2 - 40, ry = h / 2 - 70;
    const sc = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) * 0.87 || 1e-6));
    ptr.style.display = 'flex';
    ptr.style.left = (w / 2 + Math.cos(a) * sc) + 'px';
    ptr.style.top = (h / 2 + Math.sin(a) * 0.87 * sc) + 'px';
    ptr.querySelector('i').style.transform = `rotate(${a * 180 / Math.PI}deg)`;
    ptr.querySelector('span').textContent = `${t.name} ${Math.round(d / D.K)}m`;
  }

  arenaHud(kills) {
    const a = $('arenaHud');
    if (kills == null) { a.classList.remove('show'); return; }
    a.classList.add('show');
    $('arenaInfo').textContent = `${kills} KILL`;
  }

  // ---------- 모달 ----------
  modal(html, cls = '', pause = true) {
    $('modal').className = 'overlay show ' + cls;
    $('modalBox').innerHTML = html;
    if (pause) this.g.paused = true;
    return $('modalBox');
  }
  closeModal() {
    $('modal').className = 'overlay';
    if (!document.body.classList.contains('intitle')) { this.g.paused = false; this.g.last = performance.now(); }
  }
  alert(title, body, cb) {
    const box = this.modal(`<h2>${title}</h2><p>${body}</p><div class="btns"><button class="btn primary" data-a="ok">확인</button></div>`);
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); cb && cb(); };
  }
  confirm(title, body, ok, fn) {
    const box = this.modal(`<h2>${title}</h2><p>${body}</p><div class="btns"><button class="btn" data-a="no">취소</button><button class="btn primary" data-a="ok">${ok}</button></div>`);
    box.querySelector('[data-a=no]').onclick = () => this.closeModal();
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); fn(); };
  }

  showTitle() {
    const g = this.g, t = $('title');
    t.classList.add('show');
    t.onclick = () => {
      t.onclick = null;
      t.classList.remove('show');
      g.sound.unlock();
      if (g.state.emblem < 0) this.pickFlag(() => this.tutorial(() => { g.state.tuto = true; g.save(); g.start(); }));
      else g.start();
    };
  }

  pickFlag(cb) {
    const box = this.modal(`<h2>깃발을 선택하세요</h2><div class="flags"></div><p class="sub">고른 문장이 돛과 점령한 섬에 그려집니다.</p>`, 'flagModal');
    const wrap = box.querySelector('.flags');
    for (let n = 0; n < 5; n++) {
      const b = el('button', 'flag');
      b.appendChild(emblemCanvas(n, 64));
      b.appendChild(el('span', '', EMBLEMS[n].name));
      b.onclick = () => {
        const g = this.g;
        g.state.emblem = n;
        g.buildWorld();
        $('modal').className = 'overlay';
        cb();
      };
      wrap.appendChild(b);
    }
  }

  tutorial(cb) {
    const box = this.modal(`<h2>플레이 방법</h2>
      <div class="tuto">
        <div><b>드래그</b><span>드래그한 방향으로 배가 이동합니다.</span></div>
        <div><b>더블 탭</b><span>더블 탭한 방향으로 자동 이동합니다.</span></div>
        <div><b>전투</b><span>적이 옆에 있으면 자동으로 공격합니다.</span></div>
        <div><b>낚시</b><span>점령한 섬 근처에서 자동으로 낚시합니다.</span></div>
        <div><b>점령</b><span>섬에 다가가 수비대를 모두 격침하면 섬을 차지합니다. 점령한 섬에 닿으면 정박합니다.</span></div>
      </div>
      <div class="btns"><button class="btn primary" data-a="ok">시작</button></div>`);
    box.querySelector('[data-a=ok]').onclick = () => { $('modal').className = 'overlay'; cb(); };
  }

  showDeath() {
    const g = this.g, s = g.state;
    const coin = 5000 * s.lv.body;
    const isl = D.ISLANDS[s.last];
    const box = this.modal(`<h2>당신의 배가 파괴되었습니다</h2><p class="sub">짐은 그대로 남아 있습니다.</p>
      <div class="btns col">
        <button class="btn primary" data-a="island">마지막 섬으로 돌아가기 <small>${isl ? isl.name : ''} · 체력 100%</small></button>
        <button class="btn" data-a="ticket" ${s.revival > 0 ? '' : 'disabled'}><span class="ic">${TICKET}</span> 부활권으로 그 자리에서 부활 <small>남은 부활권 ${s.revival}장</small></button>
        <button class="btn" data-a="coin" ${s.res[0] >= coin ? '' : 'disabled'}>${icon(0)} ${D.fmt(coin)} 코인으로 100% 부활</button>
      </div>`, 'death');
    for (const a of ['island', 'ticket', 'coin']) box.querySelector(`[data-a=${a}]`).onclick = () => { if (g.revive(a)) this.closeModal(); };
  }

  showCapture(isl, reward, cb) {
    const s = this.g.state;
    const box = this.modal(`<h2>점령 성공</h2><div class="capflag"><div class="from"></div><div class="to"></div></div><p class="islname">${isl.def.name}</p><div class="chips big">${chips(reward)}</div><div class="btns"><button class="btn primary" data-a="ok">획득</button></div>`, 'capture');
    box.querySelector('.from').appendChild(emblemCanvas(isl.def.fac, 72));
    box.querySelector('.to').appendChild(emblemCanvas(Math.max(0, s.emblem), 72));
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); cb(); };
  }
  showAllCaptured(italy) {
    this.alert('축하합니다!', italy ? '이탈리아의 모든 섬을 점령하였습니다.' : '모든 섬을 점령하였습니다.<br>다음 지역으로 이동해보세요!<br><small>세계 지도에서 이탈리아로 갈 수 있습니다.</small>');
  }
  showDokdo() {
    const box = this.modal(`<div class="ending"><div class="flagbig"></div><h2>독도에 도착했습니다!</h2><p>독도는 최강의 해적들이 끝없이 몰려오는 곳입니다.<br>조심하세요!</p></div><div class="btns"><button class="btn primary" data-a="ok">확인</button></div>`);
    box.querySelector('[data-a=ok]').onclick = () => this.closeModal();
  }
  showDaily(day, cb) {
    const box = this.modal(`<h2>일일 보상</h2><div class="daily"></div><div class="btns"><button class="btn primary" data-a="ok">받기</button></div>`);
    const wrap = box.querySelector('.daily');
    D.DAILY.forEach((r, i) => {
      const d = el('div', 'day' + (i + 1 === day ? ' on' : i + 1 < day ? ' got' : ''), `<small>${i + 1}일</small>${r.revival ? `<span class="ic">${TICKET}</span>${r.revival}` : `${icon(r.res)}${r.n}`}`);
      wrap.appendChild(d);
    });
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); cb(); };
  }
  showReReward(r, cb) {
    const h = Math.floor(r.min / 60), m = r.min % 60;
    const box = this.modal(`<h2>재접속 보상</h2><p>낚시 <b>Lv.${this.g.state.lv.fish}</b> × ${h ? h + '시간 ' : ''}${m}분</p><div class="chips big">${chips([r.coins])}</div><div class="btns"><button class="btn primary" data-a="ok">받기</button></div>`);
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); cb(); };
  }
  showArenaResult(kills, best, reward, cb) {
    const box = this.modal(`<h2>${this.g.state.world === 1 ? 'Colloseo' : 'Arena'}</h2><p class="kills">${kills} KILL</p><p class="sub">BEST ${best} KILL</p><div class="chips big">${chips([reward])}</div><div class="btns"><button class="btn primary" data-a="ok">확인</button></div>`);
    box.querySelector('[data-a=ok]').onclick = () => { this.closeModal(); cb(); };
  }

  showSettings() {
    const g = this.g;
    const box = this.modal(`<h2>설정</h2>
      <div class="help">
        <p><b>조종</b> 드래그한 방향으로 배가 움직이고, 손을 떼면 서서히 멈춥니다. 더블 탭하면 그 방향으로 자동 항해합니다. PC는 방향키나 WASD.</p>
        <p><b>전투</b> 배 옆쪽에 적이 오면 대포가 자동으로 쏩니다. 적과 부딪혀도 피해를 줍니다.</p>
        <p><b>정박</b> 점령한 섬에 닿으면 정박합니다. 정박 중에는 체력이 회복됩니다.</p>
        <p><b>강화</b> 선체는 10레벨까지, 나머지는 선체 레벨×5까지 올릴 수 있습니다.</p>
      </div>
      <div class="btns col">
        <button class="btn" data-a="quality">그래픽: ${g.low ? '저화질 (빠름)' : '고화질'} — 바꾸기</button>
        <button class="btn" data-a="export">저장 데이터 복사</button>
        <button class="btn" data-a="import">저장 데이터 붙여넣기</button>
        <button class="btn danger" data-a="reset">처음부터 다시</button>
        <button class="btn primary" data-a="ok">닫기</button>
      </div>`);
    box.querySelector('[data-a=ok]').onclick = () => this.closeModal();
    box.querySelector('[data-a=quality]').onclick = () => {
      try { localStorage.setItem('dokdo-quality', g.low ? 'high' : 'low'); } catch (e) { /* */ }
      g.save();
      location.reload();
    };
    box.querySelector('[data-a=export]').onclick = () => {
      const code = g.exportSave();
      const b = this.modal(`<h2>저장 데이터</h2><p class="sub">복사해 두면 다른 기기에서 이어서 할 수 있습니다.</p><textarea readonly>${code}</textarea><div class="btns"><button class="btn" data-a="copy">복사</button><button class="btn primary" data-a="ok">닫기</button></div>`);
      const ta = b.querySelector('textarea');
      b.querySelector('[data-a=copy]').onclick = () => { ta.select(); try { navigator.clipboard.writeText(code); } catch (e) { document.execCommand('copy'); } this.toast('복사했습니다'); };
      b.querySelector('[data-a=ok]').onclick = () => this.closeModal();
    };
    box.querySelector('[data-a=import]').onclick = () => {
      const b = this.modal(`<h2>저장 데이터 붙여넣기</h2><textarea placeholder="저장 데이터를 붙여넣으세요"></textarea><div class="btns"><button class="btn" data-a="no">취소</button><button class="btn primary" data-a="ok">불러오기</button></div>`);
      b.querySelector('[data-a=no]').onclick = () => this.closeModal();
      b.querySelector('[data-a=ok]').onclick = () => { try { g.importSave(b.querySelector('textarea').value); } catch (e) { this.toast('저장 데이터가 올바르지 않습니다', 'warn'); } };
    };
    box.querySelector('[data-a=reset]').onclick = () => {
      const b = this.modal(`<h2>처음부터 다시</h2><p>모든 진행 상황이 지워집니다. 정말 할까요?</p><div class="btns"><button class="btn" data-a="no">취소</button><button class="btn danger" data-a="ok">지우기</button></div>`);
      b.querySelector('[data-a=no]').onclick = () => this.closeModal();
      b.querySelector('[data-a=ok]').onclick = () => g.resetSave();
    };
  }

  // ---------- 세계 지도: 섬을 누르면 경로 지정 ----------
  showMap() {
    const g = this.g, s = g.state;
    const box = this.modal(`<h2>${s.world === 0 ? '독도 해역' : '이탈리아'}</h2><canvas id="mapCanvas"></canvas><div id="mapInfo" class="sub"></div><div class="btns"><button class="btn" data-a="world" style="display:none"></button><button class="btn primary" data-a="ok">닫기</button></div>`, 'mapModal');
    const cv = box.querySelector('#mapCanvas');
    const list = D.ISLANDS.filter(i => i.world === s.world);
    let P;
    const draw = () => {
      const size = Math.min(cv.clientWidth || 320, 560);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = size * dpr; cv.height = size * dpr; cv.style.height = size + 'px';
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const H = D.MAP_R;
      const k = size / (H * 2);
      P = (x, z) => [(x + H) * k, (z + H) * k];
      c.fillStyle = '#1d5f86'; c.fillRect(0, 0, size, size);
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      for (const r of [300, 600, 900, 1200, 1500, 1800]) { c.beginPath(); c.arc(size / 2, size / 2, r * D.K * k, 0, Math.PI * 2); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(size / 2, size / 2, H * k, 0, Math.PI * 2); c.stroke();
      for (const i of list) {
        const [x, y] = P(i.x, i.z);
        const own = s.done[i.i];
        c.fillStyle = own ? D.PLAYER_MAP_COLOR : D.FACTIONS[i.fac].color;
        c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
        if (i.i === s.target) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.stroke(); }
        c.fillStyle = '#fff'; c.font = '10px "Noto Sans KR", sans-serif'; c.textAlign = 'center';
        c.fillText(i.name, x, y - 9);
      }
      if (s.world === 0) {
        const [x, y] = P(D.DOKDO.x, D.DOKDO.z);
        c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.fillText('독도', x, y - 10);
      }
      const A = D.ARENAS[s.world]; const [ax, ay] = P(A.x, A.z);
      c.fillStyle = '#c38bff'; c.fillRect(ax - 5, ay - 5, 10, 10);
      c.fillStyle = '#fff'; c.font = '10px sans-serif'; c.fillText(s.world === 0 ? '아레나' : 'Colloseo', ax, ay + 16);
      const [px, py] = P(g.player.x, g.player.z);
      c.save(); c.translate(px, py); c.rotate(-g.player.heading + Math.PI);
      c.fillStyle = '#fff'; c.strokeStyle = '#000';
      c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill(); c.stroke();
      c.restore();
      const n = list.filter(i => s.done[i.i]).length;
      const t = D.ISLANDS[s.target];
      box.querySelector('#mapInfo').innerHTML = `점령 ${n} / ${list.length} · 섬을 누르면 경로 지정${t && t.world === s.world ? `<br>목표: <b>${t.name}</b>` : ''}`;
    };
    cv.onclick = e => {
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 22;
      for (const i of list) { const [x, y] = P(i.x, i.z); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } }
      if (best) { s.target = best.i; g.save(); draw(); this.toast(`경로 지정: ${best.name}`, 'info', 1200); }
    };
    const wb = box.querySelector('[data-a=world]');
    if (g.italyOpen() && g.parked != null) {
      wb.style.display = '';
      wb.textContent = s.world === 0 ? '이탈리아로 이동' : '독도 해역으로 이동';
      wb.onclick = () => { this.closeModal(); g.changeWorld(); };
    } else if (g.italyOpen()) {
      wb.style.display = ''; wb.disabled = true; wb.textContent = '정박 중에만 바다를 옮길 수 있어요';
    }
    box.querySelector('[data-a=ok]').onclick = () => this.closeModal();
    requestAnimationFrame(draw);
  }

  // ---------- 섬 메뉴 ----------
  openIsland(isl) {
    this.isl = isl;
    $('islandMenu').classList.add('open');
    document.body.classList.add('menuopen');
    $('menuName').textContent = isl.def.name;
    this.renderMenu();
  }
  closeIsland() { $('islandMenu').classList.remove('open'); document.body.classList.remove('menuopen'); this.isl = null; }

  refreshMenuHeader() {
    const g = this.g, p = g.player, mh = g.maxHp();
    $('menuCoins').innerHTML = `${icon(0)}<b>${D.fmt(g.state.res[0])}</b>`;
    if (p.hp < mh) {
      const sec = Math.ceil((mh - p.hp) * 2 / Math.max(1, D.healPoint(mh, g.state.lv.body)));
      $('menuRepair').innerHTML = `🔧 수리 중 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    } else $('menuRepair').textContent = '';
  }

  renderMenu() {
    document.querySelectorAll('.mtab').forEach(b => b.classList.toggle('on', b.dataset.tab === this.menuTab));
    this.refreshMenuHeader();
    const body = $('menuBody');
    body.innerHTML = '';
    if (this.menuTab === 'dock') this.renderDock(body);
    else if (this.menuTab === 'market') this.renderMarket(body);
    else this.renderAssist(body);
  }
  tickMenu() {
    this.refreshMenuHeader();
    if (this.menuTab === 'market') {
      const e = $('mReset');
      if (e) { const sec = Math.max(0, Math.floor((this.g.state.marketReset - Date.now()) / 1000)); e.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
      if (Date.now() > this.g.state.marketReset) this.updateMarket();
    }
  }

  pay(cost) {
    const s = this.g.state;
    if (!cost.every((v, k) => s.res[k] >= v)) { this.g.sound.play('error', 0.4); this.toast('자원이 부족합니다.', 'warn', 1400); return false; }
    cost.forEach((v, k) => { s.res[k] -= v; });
    return true;
  }

  renderDock(body) {
    const g = this.g, s = g.state, L = s.lv;
    for (const u of D.UPGRADES) {
      const lvl = L[u.id];
      const max = D.maxLevelOf(u.id, L.body);
      const cap = u.id === 'body' ? 10 : 50;
      const maxed = lvl >= max;
      const cost = D.upgradeCost(u.id, lvl);
      const effect = {
        body: () => `체력 ${D.fmt(D.maxHp(lvl, s.nessy))} → ${D.fmt(D.maxHp(lvl + 1, s.nessy))} · 대포 ${D.TURRETS[lvl - 1]} → ${D.TURRETS[Math.min(9, lvl)]}문`,
        sail: () => `속도 ${D.motorForce(L.body, lvl)} → ${D.motorForce(L.body, lvl + 1)}`,
        steer: () => `회전 ${D.steerForce(L.body, lvl)} → ${D.steerForce(L.body, lvl + 1)}`,
        cannon: () => `공격력 ${D.atk(lvl)} → ${D.atk(lvl + 1)}`,
        fish: () => `어획량 ${(3 + 1.2 * lvl).toFixed(1)} → ${(3 + 1.2 * (lvl + 1)).toFixed(1)}`,
      }[u.id]();
      const row = el('div', 'row up');
      row.innerHTML = `<div class="rinfo"><div class="rname">${u.name} <span class="lv">lv.${lvl}</span></div>
        <div class="gauge"><i class="maxg" style="width:${max / cap * 100}%"></i><i class="cur" style="width:${lvl / cap * 100}%"></i></div>
        <div class="rdesc">${maxed ? (u.id === 'body' || max >= 50 ? '최대치' : `선체 Lv.${L.body + 1}이 필요합니다`) : effect}</div></div>
        <div class="rcost">${maxed ? '' : chips(cost, s.res)}</div>`;
      const btn = el('button', 'rbtn up', maxed ? 'MAX' : '업그레이드');
      btn.disabled = maxed;
      btn.onclick = () => {
        if (!this.pay(cost)) { this.menuTab = 'market'; this.renderMenu(); return; }
        L[u.id]++;
        g.sound.play('upgrade', 0.5);
        g.applyLevels();
        if (u.id === 'body') g.player.hp = Math.round(g.player.hp / D.maxHp(L.body - 1, s.nessy) * g.maxHp());
        g.save();
        this.updateHud(true);
        this.renderMenu();
      };
      row.appendChild(btn);
      body.appendChild(row);
    }
  }

  // 시장: 섬 등급별 고정 가격, 섬마다 재고, 10분마다 초기화
  market() {
    const s = this.g.state;
    if (Date.now() > s.marketReset) { s.market = {}; s.marketReset = Date.now() + D.MARKET_RESET * 1000; }
    const id = this.isl.def.i;
    if (!s.market[id]) s.market[id] = [...D.MARKET_STOCK[this.isl.def.tier]];
    return s.market[id];
  }
  renderMarket(body) {
    const tier = this.isl.def.tier;
    body.appendChild(el('div', 'mhead', `<span>다음 초기화 <b id="mReset"></b></span><span class="tip">팁: 누르고 있으면 자동으로 판매 또는 구매할 수 있습니다.</span>`));
    this.rows = [];
    for (let k = 1; k <= 6; k++) {
      const row = el('div', 'row mrow');
      row.innerHTML = `<div class="gicon">${ICONS[k]}<small class="stock"></small></div><div class="ginfo"><div class="rname">${D.RES[k].name}</div><div class="rdesc have"></div></div>`;
      const buy = el('button', 'rbtn buy');
      const sell = el('button', 'rbtn sell');
      row.appendChild(buy); row.appendChild(sell);
      body.appendChild(row);
      this.rows[k] = { row, buy, sell, price: D.MARKET_PRICE[tier][k - 1] };
      this.holdable(buy, () => this.trade(k, 'buy', 1));
      this.holdable(sell, n => this.trade(k, 'sell', n), true);
    }
    this.updateMarket();
    this.tickMenu();
  }
  holdable(btn, fn, accel) {
    let t1 = null, t2 = null, n = 1;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (btn.disabled) return;
      n = 1;
      fn(1);
      t1 = setTimeout(() => { t2 = setInterval(() => { if (accel) n += 0.2; if (btn.disabled || !fn(Math.floor(n))) stop(); }, 100); }, 500);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  }
  trade(k, kind, n) {
    const g = this.g, s = g.state, stock = this.market();
    const price = D.MARKET_PRICE[this.isl.def.tier][k - 1];
    if (kind === 'buy') {
      if (stock[k - 1] <= 0 || s.res[0] < price) { g.sound.play('error', 0.3); return false; }
      s.res[0] -= price; s.res[k]++; stock[k - 1]--;
      g.sound.play('buy', 0.25);
    } else {
      n = Math.min(n, s.res[k]);
      if (n <= 0) { g.sound.play('error', 0.3); return false; }
      s.res[k] -= n; stock[k - 1] += n; s.res[0] += Math.floor(price * D.SELL_RATE) * n;
      g.sound.play('coin', 0.25);
    }
    this.updateMarket();
    this.updateHud(true);
    return true;
  }
  updateMarket() {
    if (!this.rows || !this.isl) return;
    const s = this.g.state, stock = this.market();
    for (let k = 1; k <= 6; k++) {
      const r = this.rows[k];
      if (!r) continue;
      r.row.querySelector('.stock').textContent = stock[k - 1];
      r.row.querySelector('.have').textContent = `보유 ${D.fmt(s.res[k])}`;
      r.buy.disabled = stock[k - 1] <= 0 || s.res[0] < r.price;
      r.buy.innerHTML = stock[k - 1] <= 0 ? '재고 부족' : `<small>구매</small><span>${icon(0)}${D.fmt(r.price)}</span>`;
      r.sell.disabled = s.res[k] <= 0;
      r.sell.innerHTML = s.res[k] > 0 ? `<small>판매</small><span>${icon(0)}${D.fmt(Math.floor(r.price * D.SELL_RATE))}</span>` : '없음';
    }
  }

  renderAssist(body) {
    const g = this.g, s = g.state;
    const nShips = s.assist.filter(v => v > 0).length, nGulls = s.gulls.filter(v => v > 0).length;
    const add = (cls, name, desc, lvl, btnText, cost, onClick, disabled) => {
      const row = el('div', 'row');
      row.innerHTML = `<div class="aicon ${cls}"></div><div class="rinfo"><div class="rname">${name} ${lvl != null ? `<span class="lv">lv.${lvl}</span>` : ''}</div><div class="rdesc">${desc}</div></div><div class="rcost">${cost ? chips([cost], s.res) : ''}</div>`;
      const b = el('button', 'rbtn up', btnText);
      b.disabled = !!disabled;
      b.onclick = onClick;
      row.appendChild(b);
      body.appendChild(row);
    };
    const done = () => { g.sound.play('upgrade', 0.5); g.applyLevels(); g.setupHelpers(); g.save(); this.updateHud(true); this.renderMenu(); };
    body.appendChild(el('div', 'mhead', `<span>호위선 ${nShips}/3 · 갈매기 ${nGulls}/2 · 네시 ${s.nessy ? 1 : 0}/1</span>`));
    s.assist.forEach((lv, i) => {
      if (lv > 0) add('a-escort', `호위선 ${i + 1}`, `따라다니며 옆의 적을 쏩니다. 공격력 ${Math.floor(0.5 * (5 + Math.min(50, lv) * 2))}`, lv, lv >= D.ASSIST_MAX ? 'MAX' : '업그레이드', lv >= D.ASSIST_MAX ? 0 : D.assistUpgradeCost(lv), () => { const c = D.assistUpgradeCost(lv); if (this.pay([c])) { s.assist[i]++; done(); } }, lv >= D.ASSIST_MAX);
    });
    if (nShips < 3) add('a-escort', '호위선 구매', '나와 같은 깃발을 단 배가 함께 싸웁니다.', null, '구매', D.ASSIST_SHIP_COST[nShips], () => { if (this.pay([D.ASSIST_SHIP_COST[nShips]])) { s.assist[s.assist.indexOf(0)] = 1; done(); } });
    s.gulls.forEach((lv, i) => {
      if (lv > 0) add('a-seagull', `갈매기 ${i + 1}`, `바다에서 30초마다 체력 ${(lv * 0.3).toFixed(1)}% 회복`, lv, lv >= D.ASSIST_MAX ? 'MAX' : '업그레이드', lv >= D.ASSIST_MAX ? 0 : D.assistUpgradeCost(lv), () => { const c = D.assistUpgradeCost(lv); if (this.pay([c])) { s.gulls[i]++; done(); } }, lv >= D.ASSIST_MAX);
    });
    if (nGulls < 2) add('a-seagull', '갈매기 구매', '바다에 있을 때 체력을 회복시켜 줍니다.', null, '구매', D.SEAGULL_COST[nGulls], () => { if (this.pay([D.SEAGULL_COST[nGulls]])) { s.gulls[s.gulls.indexOf(0)] = 1; done(); } });
    if (s.nessy > 0) add('a-nessy', '네시', `최대 체력 +${s.nessy * 2}%`, s.nessy, s.nessy >= D.ASSIST_MAX ? 'MAX' : '업그레이드', s.nessy >= D.ASSIST_MAX ? 0 : D.assistUpgradeCost(s.nessy), () => { const c = D.assistUpgradeCost(s.nessy); if (this.pay([c])) { s.nessy++; done(); } }, s.nessy >= D.ASSIST_MAX);
    else add('a-nessy', '네시 구매', '레벨마다 최대 체력 +2%', null, '구매', D.NESSY_COST, () => { if (this.pay([D.NESSY_COST])) { s.nessy = 1; done(); } });
    if (!s.pickup) add('a-pickup', '줍줍 보트', '떠다니는 전리품을 대신 주워 옵니다.', null, '구매', D.PICKUP_COST, () => { if (this.pay([D.PICKUP_COST])) { s.pickup = true; done(); } });
    else add('a-pickup', '줍줍 보트', '전리품을 자동으로 주워 옵니다.', null, '보유 중', 0, () => {}, true);
  }
}

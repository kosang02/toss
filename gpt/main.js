import { Game, R, WORLD, KO, clamp, distance } from "./engine.js";
import { View } from "./render.js";
const $ = (id) => document.getElementById(id),
  KEY = "dokdo-korean-v2",
  fmt = (n) => Math.floor(n).toLocaleString("ko-KR");
const paths = [
  `<circle cx="16" cy="16" r="12" fill="#d1ad50" stroke="#f5d67d" stroke-width="2"/><circle cx="16" cy="16" r="8" fill="none" stroke="#967538"/><path d="M16 10v12m-3-9h5m-5 6h5" stroke="#f9df91" stroke-width="2"/>`,
  `<path d="M4 17Q14 4 25 15L31 9v16l-6-6Q13 29 4 17" fill="#9fc6d5"/><circle cx="10" cy="15" r="1.5" fill="#304e62"/>`,
  `<path d="M5 10l17-5 5 17-17 5Z" fill="#ad8357"/><path d="M5 10l5 17m1-19 5 17m1-19 5 17" stroke="#d3ad79" stroke-width="2"/>`,
  `<path d="M7 10l15-3 6 16-22 2Z" fill="#858f94"/><path d="M7 10l8 4 7-7 6 16-13-9-9 11" fill="#a6b1b4"/>`,
  `<path d="M7 10h17l5 15H3Z" fill="#b8c5c9"/><path d="M7 10h17l-3 8H10Z" fill="#e2ebdf"/>`,
  `<path d="M7 10h17l5 15H3Z" fill="#c79840"/><path d="M7 10h17l-3 8H10Z" fill="#f3cd6a"/>`,
  `<path d="M8 7h16l6 9-14 15L2 16Z" fill="#95c9dd"/><path d="M8 7l3 9 5 15 5-15 3-9M2 16h28" fill="none" stroke="#d6f0eb" stroke-width="1.5"/>`,
];
const icon = (i) =>
  `<svg viewBox="0 0 32 32" aria-hidden="true">${paths[i]}</svg>`;
const part = {
  body: "M4 20h28l-6 9H10ZM18 5v15M18 6l-9 11h9",
  sail: "M18 3v29M17 5L5 23h12M21 7l10 17H21",
  steering:
    "M18 9a10 10 0 1 0 0 20a10 10 0 1 0 0-20M18 3v32M2 19h32M7 8l22 22M7 30L29 8",
  cannon: "M5 20l22-10 5 8-22 10ZM6 25a4 4 0 1 0 8 0M22 23a4 4 0 1 0 8 0",
  fishing: "M7 31L19 5q9 2 10 10v10q0 8-8 5v-6",
};
const partIcon = (k) =>
  `<div class="partIcon"><svg viewBox="0 0 36 36"><path d="${part[k]}"/></svg></div>`;
const costHTML = (cost) =>
  cost
    .map((n, i) =>
      n
        ? `<span class="cost" title="${R.RESOURCE_KO[i]}">${icon(i)}${fmt(n)}</span>`
        : "",
    )
    .join("");
let game,
  view,
  tab = "upgrade",
  quantity = 1,
  toastTimer,
  modalName = "",
  audioCtx,
  autosave = 0,
  lastPaint = 0,
  lastPortKey = "",
  keys = {},
  pointer = null,
  lastTap = 0,
  firstPlay = false,
  storageOK = true;
function toast(text) {
  if (!text) return;
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3500);
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(game.snapshot()));
    storageOK = true;
  } catch {
    if (storageOK)
      toast(
        "브라우저 저장 공간을 사용할 수 없습니다. 설정에서 기록을 내려받으세요.",
      );
    storageOK = false;
  }
}
function sound(type) {
  if (!game.state.sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(),
      g = audioCtx.createGain(),
      t = audioCtx.currentTime;
    o.type = type === "shot" ? "triangle" : "sine";
    o.frequency.setValueAtTime(
      type === "shot"
        ? 95
        : type === "hit"
          ? 70
          : type === "upgrade"
            ? 660
            : 390,
      t,
    );
    o.frequency.exponentialRampToValueAtTime(
      type === "shot" ? 35 : 260,
      t + 0.12,
    );
    g.gain.setValueAtTime(type === "shot" ? 0.025 : 0.045, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.2);
  } catch {}
}
function modal(name, title, html) {
  game.paused = true;
  game.input = null;
  keys = {};
  pointer = null;
  $("joystick").hidden = true;
  modalName = name;
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modalShade").hidden = false;
  $("closeModal").hidden = false;
  $("closeModal").focus();
}
function closeModal() {
  if (modalName === "dead" && game.dead) return;
  $("modalShade").hidden = true;
  modalName = "";
  game.paused = false;
  $("ocean").focus();
}
function help() {
  modal(
    "help",
    "항해를 시작하는 선장님께",
    `<div class="helpGrid"><div class="helpCard"><svg viewBox="0 0 100 65"><circle cx="40" cy="38" r="22"/><path d="M35 43l21-25m-13 1 13-1-1 13"/></svg><b>드래그로 조종</b><p>바다 위를 누르고 원하는 방향으로 끌어주세요. 손을 떼면 천천히 멈춥니다. 키보드 방향키와 WASD도 사용할 수 있습니다.</p></div><div class="helpCard"><svg viewBox="0 0 100 65"><path d="M42 15h16v34H42ZM12 30h19m38 0h19m-72-5-5 5 5 5m68-10 5 5-5 5"/></svg><b>옆으로 돌아 자동 공격</b><p>적이 배의 좌우에 들어오면 대포가 자동으로 발사됩니다. 적의 정면으로 돌진하기보다 옆면을 보이며 싸워보세요.</p></div><div class="helpCard"><svg viewBox="0 0 100 65"><path d="M15 49h70M30 45l12-25 13 25M52 21V6l20 8-20 7"/></svg><b>수비선을 물리치고 점령</b><p>섬의 수비선을 모두 격파한 뒤 선착장에 가까이 가세요. 내 섬 근처에 머무르면 자동으로 물고기를 잡습니다.</p></div><div class="helpCard"><svg viewBox="0 0 100 65"><path d="M19 47h63M29 45V25h42v20M24 25L50 9l27 16M45 46V33h11v13"/></svg><b>항구에서 배 키우기</b><p>정박하면 체력이 회복됩니다. 시장에서 자원을 사고팔고, 선체와 돛·대포를 강화해 더 먼 바다로 나아가세요.</p></div></div><div class="buttonrow"><button class="primary" data-act="close">바다로!</button></div><p class="fineprint">바다를 두 번 누르면 해당 위치로 자동 항해합니다. 해도에서 섬을 선택해 항로를 설정할 수도 있습니다.</p>`,
  );
}
function renderPort(force = false) {
  if (!game.port) return;
  const s = game.state,
    key = JSON.stringify([
      s.docked,
      tab,
      s.resources,
      s.levels,
      s.assistants,
      s.seagulls,
      s.nessy,
      s.pickup,
      quantity,
    ]);
  if (!force && key === lastPortKey) return;
  lastPortKey = key;
  const container = $("portBody"),
    scroll = container.scrollTop;
  if (tab === "upgrade") {
    const stat = game.stats;
    const detail = {
      body: `체력 ${fmt(stat.hp)}`,
      sail: `추진력 ${fmt(stat.motorForce)}`,
      steering: `선회력 ${fmt(stat.steerForce)}`,
      cannon: `공격력 ${fmt(stat.attack)}`,
      fishing: `기본 어획 ${Math.ceil(3 + 1.2 * s.levels.fishing)}`,
    };
    container.innerHTML = `<div class="upgradeGrid">${Object.keys(KO)
      .map((k) => {
        const l = s.levels[k],
          cap = R.maxUpgradeLevel(k, s.levels.body),
          max = l >= cap,
          cost = R.upgradeCost(k, l);
        return `<div class="upgradeCard">${partIcon(k)}<b>${KO[k]}</b><span class="lv">${l} / ${cap}</span><span class="stat">${detail[k]}</span><span class="levelTrack"><i style="width:${(l / cap) * 100}%"></i></span><button data-upgrade="${k}" aria-label="${KO[k]} 강화" ${max || !game.canAfford(cost) ? "disabled" : ""}>${max ? (k === "body" ? "최대 단계" : "선체 강화 필요") : "<span class=upgradeLabel>강화 <em>↑</em></span>" + costHTML(cost)}</button></div>`;
      })
      .join(
        "",
      )}</div><p class="upgradeNotice">선체를 키우면 다른 장비의 강화 한도가 5단계씩 늘어납니다.</p>`;
  } else if (tab === "market") {
    const stock = game.stock();
    container.innerHTML = `<div class="marketHead"><span>매입가의 90%에 판매 · 재고는 10분마다 갱신</span><select id="tradeQuantity" aria-label="거래 수량"><option value="1">1개씩</option><option value="10">10개씩</option><option value="999999999">가능한 만큼</option></select></div>${R.RESOURCE_KO.slice(
      1,
    )
      .map((name, i) => {
        const n = i + 1,
          q = R.marketQuote(s.docked, n);
        return `<div class="marketRow"><div class="marketRes">${icon(n)}<span>${name}<small>재고 ${stock[i]}</small></span></div><button class="buy" data-trade="${n}" data-buy="1" ${s.resources[0] < q.buy || !stock[i] ? "disabled" : ""}>구매 ${fmt(q.buy)}</button><button data-trade="${n}" data-buy="0" ${s.resources[n] < 1 ? "disabled" : ""}>판매 ${fmt(q.sell)}</button></div>`;
      })
      .join("")}`;
    $("tradeQuantity").value = quantity;
  } else {
    const rows = [
      ...s.assistants.map((l, i) => ({
        kind: "assistant",
        i,
        l,
        name: `조수 ${i + 1}`,
        desc: "작은 배로 따라다니며 함께 공격합니다.",
      })),
      ...s.seagulls.map((l, i) => ({
        kind: "seagull",
        i,
        l,
        name: `갈매기 ${i + 1}`,
        desc: "30초마다 최대 체력의 단계당 0.3% 회복.",
      })),
      {
        kind: "nessy",
        i: 0,
        l: s.nessy,
        name: "네시",
        desc: "단계마다 최대 체력이 2% 증가합니다.",
      },
      {
        kind: "pickup",
        i: 0,
        l: s.pickup ? 1 : 0,
        name: "보급품 수거",
        desc: "멀리 떠 있는 보급 상자까지 가져옵니다.",
      },
    ];
    container.innerHTML = `<div class="crewGrid">${rows
      .map((a) => {
        const done = a.l >= (a.kind === "pickup" ? 1 : 50),
          cost = a.l
            ? R.companionUpgradeCost(a.l)
            : R.companionPurchase[a.kind][a.i];
        return `<div class="crewCard"><b>${a.name}</b><span class="crewLevel">${a.l ? `${a.l}단계` : "고용 전"}</span><small>${a.desc}</small><button data-crew="${a.kind}" data-index="${a.i}" ${done || s.resources[0] < cost ? "disabled" : ""}>${done ? "함께 항해 중" : `${a.l ? "강화" : "고용"} · ${fmt(cost)} 동전`}</button></div>`;
      })
      .join("")}</div>`;
  }
  container.scrollTop = scroll;
}
function paint() {
  const s = game.state;
  R.RESOURCES.forEach((_, i) => ($("r" + i).textContent = fmt(s.resources[i])));
  const near = game.nearest(),
    a = game.port || near.island;
  $("islandName").textContent = game.arena
    ? `아레나 ${game.arena.wave}차전`
    : near.distance < 160
      ? a.ko
      : s.world
        ? "피사 해역"
        : "독도 해역";
  $("islandInfo").textContent = game.arena
    ? `${game.arena.kills}척 격파`
    : near.distance < 160
      ? game.owned.includes(a.id)
        ? "나의 섬"
        : `수비선 ${Math.max(0, a.enemyCount - (s.kills[a.id] || 0))}척`
      : "끝없이 펼쳐진 바다";
  $("hpLabel").textContent = `체력 ${fmt(s.hp)} / ${fmt(game.stats.hp)}`;
  $("shipHealth").querySelector("i").style.width =
    `${clamp((s.hp / game.stats.hp) * 100, 0, 100)}%`;
  $("shipHealth").hidden = !!game.port;
  $("portPanel").hidden = !game.port;
  $("sailingTools").hidden = !!game.port;
  $("dockBoat").disabled =
    !game.owned.includes(a.id) || near.distance > 25 || !!game.arena;
  $("arenaButton").textContent = game.arena ? "아레나 나가기" : "아레나";
  $("arenaButton").hidden =
    !game.arena &&
    !WORLD.special.arena.some(
      (a) => a.world === s.world && distance(s, a) < 80,
    );
  $("sailingStatus").textContent = game.fishing
    ? `낚시 중 · 다음 어획 ${Math.max(0, Math.ceil(9.683333 - game.fishTimer))}초`
    : game.arena
      ? "적의 옆면을 노리세요 · 나가면 보상을 받습니다."
      : "드래그로 이동 · 두 번 눌러 자동 항해";
  $("targetHint").textContent = game.target
    ? `자동 항해 · 남은 거리 ${fmt(distance(s, game.target))}`
    : "";
  if (game.port) {
    $("portName").textContent = game.port.ko;
    $("repairLabel").textContent =
      s.hp < game.stats.hp
        ? `수리 중 ${fmt(s.hp)} / ${fmt(game.stats.hp)}`
        : "수리 완료";
    renderPort();
  }
  view.drawMini($("mini"));
}
function showMap() {
  const s = game.state;
  modal(
    "map",
    s.world ? "피사 해도" : "독도 해도",
    `<div class="mapTools"><span>점령 ${game.islands.filter((a) => game.owned.includes(a.id)).length} / ${game.islands.length} · 섬을 누르면 자동 항해</span><button class="secondary" data-act="world">다른 바다</button></div><div class="chart"><canvas id="chart" aria-label="섬과 항로 지도"></canvas></div><div class="islandList">${game.islands.map((a) => `<button data-target="${a.id}" class="${game.owned.includes(a.id) ? "owned" : ""}">${a.ko}<small>${game.owned.includes(a.id) ? "점령 완료" : `수비선 ${a.enemyCount}척 · ${a.tier + 1}구역`}</small></button>`).join("")}${s.world === 0 ? '<button data-point="dokdo">독도<small>바다 끝의 두 섬</small></button>' : ""}<button data-point="arena">아레나<small>연속 해전</small></button></div><p class="fineprint">초록: 나의 섬 · 황토: 미점령 섬 · 분홍: 거대 문어. 자동 항해 중에도 적에게 공격받을 수 있습니다.</p>`,
  );
  requestAnimationFrame(drawChart);
}
function drawChart() {
  const canvas = $("chart");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect(),
    ratio = Math.min(devicePixelRatio, 2);
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const c = canvas.getContext("2d");
  c.scale(ratio, ratio);
  const w = rect.width,
    h = rect.height,
    s = game.state,
    points = [
      ...game.islands,
      ...WORLD.special.arena.filter((a) => a.world === s.world),
      ...(s.world === 0 ? WORLD.special.dokdo : []),
    ],
    xs = points.map((a) => a.x),
    zs = points.map((a) => a.z),
    minX = Math.min(...xs) - 90,
    maxX = Math.max(...xs) + 90,
    minZ = Math.min(...zs) - 90,
    maxZ = Math.max(...zs) + 90,
    scale = Math.min(w / (maxX - minX), h / (maxZ - minZ)),
    px = (x) => w / 2 + (x - (minX + maxX) / 2) * scale,
    py = (z) => h / 2 - (z - (minZ + maxZ) / 2) * scale;
  c.strokeStyle = "#66879922";
  for (let x = 0; x < w; x += 30) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  for (let y = 0; y < h; y += 30) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  c.font = "450 9px DokdoKorean";
  c.textAlign = "center";
  const clickable = [];
  for (const a of game.islands) {
    const x = px(a.x),
      y = py(a.z);
    c.fillStyle = game.owned.includes(a.id) ? "#b5d97a" : "#c4a97f";
    c.beginPath();
    c.arc(x, y, 4, 0, 7);
    c.fill();
    c.fillStyle = "#c5d3d8";
    c.fillText(a.ko, x, y + 13);
    clickable.push({ x, y, a });
  }
  for (const a of WORLD.special.kraken.filter((a) => a.world === s.world)) {
    c.fillStyle = "#b06b83";
    c.beginPath();
    c.arc(px(a.x), py(a.z), 2, 0, 7);
    c.fill();
  }
  for (const a of WORLD.special.arena.filter((a) => a.world === s.world)) {
    c.fillStyle = "#f3bd5f";
    c.fillRect(px(a.x) - 4, py(a.z) - 4, 8, 8);
    c.fillText("아레나", px(a.x), py(a.z) - 10);
  }
  if (!s.world) {
    const d = WORLD.special.dokdo[0];
    c.fillStyle = "#d4e2d0";
    c.fillText("독도", px(d.x), py(d.z));
  }
  c.fillStyle = "#fff2a5";
  c.beginPath();
  c.arc(px(s.x), py(s.z), 5, 0, 7);
  c.fill();
  c.strokeStyle = "#fff2a566";
  c.beginPath();
  c.arc(px(s.x), py(s.z), 9, 0, 7);
  c.stroke();
  canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top,
      point = clickable.sort(
        (a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y),
      )[0];
    if (Math.hypot(x - point.x, y - point.y) < 28) {
      game.setTarget(point.a.id);
      closeModal();
      paint();
    }
  };
}
function worldDialog() {
  modal(
    "world",
    "다른 바다로",
    `<p>${game.port ? "새로운 바다의 시작 항구로 이동합니다. 배와 자원, 점령 기록은 그대로 유지됩니다. 피사 해역에는 강한 수비선이 기다립니다." : "바다를 이동하려면 먼저 나의 항구에 정박하세요."}</p><div class="buttonrow"><button class="primary" data-act="changeWorld" ${game.port ? "" : "disabled"}>${game.state.world ? "독도 해역으로" : "피사 해역으로"}</button><button class="secondary" data-act="close">닫기</button></div>`,
  );
}
function settings() {
  modal(
    "settings",
    "설정",
    `<div class="settingsRow"><span>효과음</span><button data-act="sound">${game.state.sound ? "켜짐" : "꺼짐"}</button></div><div class="settingsRow"><span>나의 깃발</span><button data-act="flags">선택</button></div><div class="settingsRow"><span>항해 안내</span><button data-act="help">보기</button></div><div class="settingsRow"><span>항해 기록</span><button data-act="records">보기</button></div><div class="settingsRow"><span>저장 파일</span><div><button data-act="export">내려받기</button> <button data-act="import">불러오기</button></div></div><div class="settingsRow"><span>새로 시작</span><button data-act="reset">기록 초기화</button></div><p class="fineprint">한국어 웹 재구성 v2 · Unity 없이 동작합니다.<br>원본 APK 1.4.2에서 확인한 섬 좌표·성장 비용·자원 규칙을 바탕으로 새로 작성했습니다. 그래픽, 물리, 인공지능, 효과음은 별도 구현이므로 원본과 차이가 있습니다. 광고·결제·온라인 순위 기능은 없습니다.<br>글꼴: Noto Sans KR (SIL OFL) · 렌더러: Three.js (MIT)<br>자동 저장: ${storageOK ? "사용 중" : "사용 불가 — 저장 파일을 내려받으세요."}</p>`,
  );
}
function flags() {
  const colors = [
    "#eeeada",
    "#262b30",
    "#c3544b",
    "#486d9a",
    "#739657",
    "#dec168",
    "#805d8a",
    "#c6dbe0",
  ];
  modal(
    "flags",
    "나의 깃발",
    `<div class="flags">${colors.map((c, i) => `<button class="flagChoice ${game.state.flag === i ? "selected" : ""}" data-flag="${i}" aria-label="${i === 0 ? "태극기" : i === 1 ? "해적 깃발" : i + 1 + "번 깃발"}"><svg viewBox="0 0 80 50"><rect width="80" height="50" fill="${c}"/>${i === 0 ? '<path d="M27 25a13 13 0 0 1 26 0Z" fill="#cd4f59"/><path d="M27 25a13 13 0 0 0 26 0Z" fill="#3b5e8f"/><path d="M9 9h13m-13 4h13m-13 4h13m36 18h13m-13 4h13m-13 4h13" stroke="#26323e" stroke-width="2"/>' : i === 1 ? '<circle cx="40" cy="20" r="12" fill="#ece4d0"/><path d="M35 23h10v12H35M22 38l36-21m-36 0 36 21" stroke="#ece4d0" stroke-width="4"/><path d="M34 18h4m4 0h4" stroke="#262b30" stroke-width="4"/>' : '<path d="M40 9v32M23 25h34" stroke="#fff0ce" stroke-width="3"/>'}</svg></button>`).join("")}</div><div class="buttonrow"><button class="primary" data-act="close">선택 완료</button></div>`,
  );
}
function records() {
  const s = game.state;
  modal(
    "records",
    "항해 기록",
    `<div class="recordGrid"><div>점령한 섬<strong>${s.ownedIslands.length} / 47</strong></div><div>격파한 배<strong>${fmt(s.statistics.kills)}척</strong></div><div>잡은 물고기<strong>${fmt(s.statistics.catches)}마리</strong></div><div>아레나 최고 기록<strong>${fmt(s.arenaBest)}척</strong></div><div>독도 도착<strong>${s.visitedDokdo ? "도착 완료" : "항해 중"}</strong></div><div>남은 부활권<strong>${fmt(s.revivals)}장</strong></div></div><p>선체 ${s.levels.body}단계 · 돛 ${s.levels.sail}단계 · 선회 ${s.levels.steering}단계 · 대포 ${s.levels.cannon}단계 · 낚시 ${s.levels.fishing}단계</p>`,
  );
}
function death() {
  modal(
    "dead",
    "배가 파괴되었습니다",
    `<p>마지막 항구로 돌아가 배를 수리하거나, 현재 위치에서 부활할 수 있습니다.</p><div class="buttonrow"><button class="primary" data-act="return">항구로 돌아가기</button><button class="secondary" data-act="ticket" ${game.state.revivals ? "" : "disabled"}>부활권 사용 (${game.state.revivals})</button><button class="secondary" data-act="revive" ${game.state.resources[0] >= R.revivalCost(game.state.levels.body) ? "" : "disabled"}>${fmt(R.revivalCost(game.state.levels.body))} 동전으로 부활</button></div>`,
  );
  $("closeModal").hidden = true;
}
function downloadSave() {
  const blob = new Blob([JSON.stringify(game.snapshot(), null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "독도까지-항해기록.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function replaceGame(state) {
  game = new Game(state);
  game.state.started = true;
  view.game = game;
  view.initialized = false;
  view.crewSignature = "";
  lastPortKey = "";
  modalName = "";
  closeModal();
  save();
  paint();
}
function importSave() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    try {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) throw Error("저장 파일이 너무 큽니다.");
      const data = JSON.parse(await file.text());
      const candidate = new Game(data);
      modal(
        "import",
        "저장 기록을 불러올까요?",
        `<p>선체 ${candidate.state.levels.body}단계 · 점령한 섬 ${candidate.owned.length}개인 기록입니다. 현재 기록은 교체됩니다.</p><div class="buttonrow"><button class="primary" id="confirmImport">이 기록 불러오기</button><button class="secondary" data-act="close">취소</button></div>`,
      );
      $("confirmImport").onclick = () => {
        replaceGame(candidate.snapshot());
        toast("항해 기록을 불러왔습니다.");
      };
    } catch (e) {
      toast(e.message || "기록을 읽을 수 없습니다.");
    }
  };
  input.click();
}
function action(act) {
  switch (act) {
    case "close":
      closeModal();
      break;
    case "help":
      help();
      break;
    case "world":
      worldDialog();
      break;
    case "changeWorld":
      if (game.changeWorld()) {
        view.initialized = false;
        closeModal();
        paint();
      }
      break;
    case "sound":
      game.state.sound = !game.state.sound;
      save();
      settings();
      break;
    case "flags":
      flags();
      break;
    case "records":
      records();
      break;
    case "export":
      downloadSave();
      break;
    case "import":
      importSave();
      break;
    case "reset":
      modal(
        "reset",
        "처음부터 시작할까요?",
        `<p>현재 브라우저의 항해 기록이 지워집니다. 보관하려면 먼저 저장 파일을 내려받으세요.</p><div class="buttonrow"><button class="secondary" data-act="export">기록 내려받기</button><button class="primary" data-act="confirmReset">처음부터 시작</button><button class="secondary" data-act="close">취소</button></div>`,
      );
      break;
    case "confirmReset":
      replaceGame(null);
      help();
      break;
    case "return":
      game.returnToPort();
      closeModal();
      view.initialized = false;
      paint();
      break;
    case "ticket":
      if (game.revive(true)) closeModal();
      break;
    case "revive":
      if (game.revive(false)) closeModal();
      break;
    case "arenaStart":
      game.startArena();
      closeModal();
      paint();
      break;
  }
}
function bind() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.act) action(b.dataset.act);
    if (b.dataset.upgrade) {
      game.upgrade(b.dataset.upgrade);
      renderPort(true);
    }
    if (b.dataset.trade) {
      game.trade(+b.dataset.trade, b.dataset.buy === "1", quantity);
      renderPort(true);
    }
    if (b.dataset.crew) {
      game.companion(b.dataset.crew, +b.dataset.index);
      renderPort(true);
    }
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      document
        .querySelectorAll("#portTabs button")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderPort(true);
    }
    if (b.dataset.target) {
      game.setTarget(+b.dataset.target);
      closeModal();
      paint();
    }
    if (b.dataset.point) {
      const a =
        b.dataset.point === "dokdo"
          ? WORLD.special.dokdo[0]
          : WORLD.special.arena.find((a) => a.world === game.state.world);
      if (a) {
        if (game.port) game.depart();
        game.target = { x: a.x, z: a.z };
        closeModal();
        paint();
      }
    }
    if (b.dataset.flag) {
      game.state.flag = +b.dataset.flag;
      save();
      flags();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "tradeQuantity") {
      quantity = +e.target.value;
      renderPort(true);
    }
  });
  $("startGame").onclick = () => {
    game.state.started = true;
    view.initialized = false;
    $("title").hidden = true;
    $("hud").hidden = false;
    save();
    paint();
    sound("start");
    if (firstPlay) help();
  };
  $("depart").onclick = () => {
    game.depart();
    paint();
  };
  $("openMap").onclick = $("miniButton").onclick = showMap;
  $("openSettings").onclick = settings;
  $("changeWorld").onclick = worldDialog;
  $("closeModal").onclick = closeModal;
  $("stopBoat").onclick = () => game.stop();
  $("dockBoat").onclick = () => {
    game.dock(game.nearest().island.id);
    paint();
  };
  $("arenaButton").onclick = () => {
    if (game.arena) {
      game.finishArena();
      paint();
    } else
      modal(
        "arena",
        "아레나",
        `<p>일곱 척씩 몰려오는 적과 연속으로 싸웁니다. 버틸 수 있는 만큼 싸운 뒤 나가서 보상을 받으세요.</p><div class="buttonrow"><button class="primary" data-act="arenaStart">입장하기</button><button class="secondary" data-act="close">취소</button></div>`,
      );
  };
  const canvas = $("ocean");
  canvas.addEventListener("pointerdown", (e) => {
    if (
      !game.state.started ||
      game.port ||
      game.paused ||
      game.dead ||
      e.button > 0
    )
      return;
    canvas.setPointerCapture(e.pointerId);
    const now = performance.now();
    if (now - lastTap < 300) {
      const p = view.screenToWorld(e.clientX, e.clientY);
      if (p) {
        game.target = p;
        game.input = null;
      }
      lastTap = 0;
      return;
    }
    lastTap = now;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    game.stop();
    $("joystick").hidden = false;
    $("joystick").style.left = e.clientX - 54 + "px";
    $("joystick").style.top = e.clientY - 54 + "px";
    $("joystick").firstElementChild.style.transform = "";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const dx = e.clientX - pointer.x,
      dy = e.clientY - pointer.y,
      d = Math.hypot(dx, dy),
      a = view.screenToWorld(pointer.x, pointer.y),
      b = view.screenToWorld(e.clientX, e.clientY);
    if (a && b && d > 5)
      game.input = {
        heading: Math.atan2(b.x - a.x, b.z - a.z),
        power: Math.min(1, d / 40),
      };
    $("joystick").firstElementChild.style.transform =
      `translate(${dx / Math.max(1, d / 38)}px,${dy / Math.max(1, d / 38)}px)`;
  });
  const up = () => {
    pointer = null;
    game.input = null;
    $("joystick").hidden = true;
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!game.dead) closeModal();
      return;
    }
    if (game.paused || !game.state.started) return;
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "w",
        "a",
        "s",
        "d",
        "W",
        "A",
        "S",
        "D",
        " ",
      ].includes(e.key)
    ) {
      e.preventDefault();
      keys[e.key.toLowerCase()] = true;
      if (e.key === " ") game.stop();
    }
    if (e.key === "m") showMap();
  });
  window.addEventListener("keyup", (e) => {
    delete keys[e.key.toLowerCase()];
    if (!Object.keys(keys).length) game.input = null;
  });
  window.addEventListener("blur", () => {
    keys = {};
    up();
    save();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) save();
  });
  window.addEventListener("beforeunload", save);
  window.addEventListener("resize", () => {
    view.resize();
    if (modalName === "map") drawChart();
  });
}
function processEvents() {
  for (const e of game.events.splice(0)) {
    if (e.type === "save") save();
    else if (e.type === "shot") sound("shot");
    else if (e.type === "hit") sound("hit");
    else if (e.type === "dead") death();
    else if (e.type === "capture") {
      sound("upgrade");
      modal(
        "capture",
        e.text,
        `<p>이제 이 섬에서 정박하고, 시장을 이용하고, 근처에서 낚시할 수 있습니다.</p><div style="text-align:center">${costHTML(e.reward)}</div><div class="buttonrow"><button class="primary" data-act="close">계속 항해하기</button></div>`,
      );
    } else if (e.type === "fish" || e.type === "loot") {
      const el = document.createElement("span");
      el.className = "float";
      el.textContent = e.type === "fish" ? e.text : "보급 상자 +";
      $("floatLayer").append(el);
      setTimeout(() => el.remove(), 1800);
    } else if (e.text) toast(e.text);
    if (e.type === "upgrade" || e.type === "trade") sound(e.type);
  }
}
async function boot() {
  try {
    await document.fonts.load("450 16px DokdoKorean");
    await document.fonts.ready;
    let saved = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      storageOK = false;
    }
    try {
      game = new Game(saved);
    } catch {
      game = new Game();
      saved = null;
      toast("이전 기록을 읽지 못해 새 항해를 준비했습니다.");
    }
    firstPlay = !saved;
    game.state.started = false;
    view = new View($("ocean"), game);
    $("resources").innerHTML = R.RESOURCE_KO.map(
      (name, i) =>
        `<div class="res" title="${name}" aria-label="${name}">${icon(i)}<b id="r${i}">0</b><span class="label">${name}</span></div>`,
    ).join("");
    bind();
    $("boot").hidden = true;
    $("title").hidden = false;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!game.paused && !game.port && !game.dead) {
        const x =
            (keys.arrowright || keys.d ? 1 : 0) -
            (keys.arrowleft || keys.a ? 1 : 0),
          y =
            (keys.arrowdown || keys.s ? 1 : 0) -
            (keys.arrowup || keys.w ? 1 : 0);
        if (x || y) {
          const a = view.screenToWorld(innerWidth / 2, innerHeight / 2),
            b = view.screenToWorld(
              innerWidth / 2 + x * 30,
              innerHeight / 2 + y * 30,
            );
          if (a && b) {
            game.target = null;
            game.input = {
              heading: Math.atan2(b.x - a.x, b.z - a.z),
              power: 1,
            };
          }
        }
      }
      if (!document.hidden) game.tick(dt);
      processEvents();
      view.render(dt, now / 1000);
      if (now - lastPaint > 150) {
        paint();
        lastPaint = now;
      }
      autosave += dt;
      if (autosave > 10 && game.state.started) {
        save();
        autosave = 0;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.__DOKDO__ = {
      get game() {
        return game;
      },
      view,
      showMap,
      settings,
      paint,
      save,
    };
  } catch (e) {
    console.error(e);
    $("boot").hidden = true;
    $("fatal").hidden = false;
    $("fatal").textContent =
      `바다를 열지 못했습니다. WebGL을 지원하는 최신 Chrome, Edge 또는 Safari에서 다시 열어주세요. (${e.message})`;
  }
}
boot();

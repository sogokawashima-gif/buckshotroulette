/* ============================================================
   Buckshot Roulette - Game logic (3D)
   ============================================================ */
import { Stage, ITEM_META } from "./scene.js";

const ROUNDS = [
  { maxHealth: 2, items: 2 },
  { maxHealth: 4, items: 3 },
  { maxHealth: 5, items: 4 },
];

const G = {
  round: 0, turn: "player", busy: false, gameOver: false,
  shells: [], idx: 0, liveTotal: 0, blankTotal: 0,
  known: [], sawActive: false,
  player: { hp: 0, max: 0, items: [], cuffed: false },
  dealer: { hp: 0, max: 0, items: [], cuffed: false, known: [] },
};

const $ = (id) => document.getElementById(id);
const el = {
  roundBadge: $("roundBadge"), turnIndicator: $("turnIndicator"),
  shootSelf: $("shootSelf"), shootDealer: $("shootDealer"),
  toast: $("toast"), overlay: $("overlay"), overlayCard: $("overlayCard"),
  adrOverlay: $("adrOverlay"), adrPicker: $("adrPicker"), adrCancel: $("adrCancel"),
  loading: $("loading"),
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ラウンド報告・アイテムの確認結果のみをトースト表示する
let toastTimer;
function report(msg, cls = "") {
  el.toast.textContent = msg;
  el.toast.className = "show " + cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.className = ""; }, 2600);
}
// 発砲やアイテム使用などの実況・台詞は表示しない（無効化）
function log() {}
const dealerSay = () => {};

/* ---------------- Stage 初期化 ---------------- */
let stage;
function boot() {
  stage = new Stage($("scene"));
  stage.onItemClick(onPlayerUseItem);
  el.loading.style.display = "none";
  el.shootSelf.onclick = () => { if (!el.shootSelf.disabled) playerFire("self"); };
  el.shootDealer.onclick = () => { if (!el.shootDealer.disabled) playerFire("dealer"); };
  $("startBtn").onclick = startGame;
  el.adrCancel.onclick = () => (el.adrOverlay.style.display = "none");

  // Tab でルール一覧を開閉（もう一度 Tab / 閉じるボタンでゲームに戻る。Esc でも閉じる）
  const rulesOverlay = $("rulesOverlay");
  const toggleRules = (show) => {
    const s = show === undefined ? rulesOverlay.style.display === "none" : show;
    rulesOverlay.style.display = s ? "flex" : "none";
  };
  $("rulesClose").onclick = () => toggleRules(false);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      toggleRules();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (el.adrOverlay.style.display === "flex") { el.adrOverlay.style.display = "none"; return; }
      toggleRules(false);
    }
  });
}

/* ============================================================
   ラウンド管理
   ============================================================ */
function startGame() {
  G.round = 0; G.gameOver = false;
  el.overlay.style.display = "none";
  startRound();
}

async function startRound() {
  const cfg = ROUNDS[G.round];
  G.player.max = G.player.hp = cfg.maxHealth;
  G.dealer.max = G.dealer.hp = cfg.maxHealth;
  G.player.items = []; G.dealer.items = [];
  G.player.cuffed = G.dealer.cuffed = false;
  el.roundBadge.textContent = `ROUND ${G.round + 1} / 3`;
  loadShells();
  giveItems(cfg.items, false);
  G.turn = "player";
  G.busy = true;                 // 装填演出中は操作不可
  stage.setSawed(false);
  syncAll();
  updateTurnUI();
  report(`ROUND ${G.round + 1}`, "info");
  // ディーラーが薬莢を机に並べ、装填し、机に置く
  await stage.prepareRound(G.shells.slice());
  G.busy = false;
  updateTurnUI();
}

function loadShells() {
  const total = 2 + rand(7);
  const live = 1 + rand(total - 1);
  const blank = total - live;
  const arr = [];
  for (let i = 0; i < live; i++) arr.push("live");
  for (let i = 0; i < blank; i++) arr.push("blank");
  shuffle(arr);
  G.shells = arr; G.idx = 0; G.liveTotal = live; G.blankTotal = blank;
  G.known = new Array(total).fill(null);
  G.dealer.known = new Array(total).fill(null);
  G.sawActive = false;
  stage.setSawed(false);
}

function giveItems(count, announce) {
  const pool = itemPool();
  for (let i = 0; i < count; i++) {
    if (G.player.items.length < 8) G.player.items.push(pool[rand(pool.length)]);
    if (G.dealer.items.length < 8) G.dealer.items.push(pool[rand(pool.length)]);
  }
  if (announce) log("アイテムが配布された。");
}

function itemPool() {
  const base = ["beer", "cigarette", "glass", "handcuffs", "phone", "adrenaline", "inverter", "medicine"];
  if (ROUNDS[G.round].maxHealth > 2) base.push("saw");
  return base;
}

function remainingCounts() {
  let live = 0, blank = 0;
  for (let i = G.idx; i < G.shells.length; i++) (G.shells[i] === "live" ? live++ : blank++);
  return { live, blank, total: live + blank };
}

/* ---------------- 同期・UI ---------------- */
function syncAll() {
  stage.setItems(G.player.items, G.dealer.items);
  stage.setMonitor(G.player, G.dealer, G.round + 1);
}
function updateTurnUI() {
  const isP = G.turn === "player";
  el.turnIndicator.textContent = isP ? "YOUR TURN" : "DEALER'S TURN";
  el.turnIndicator.className = "turn-indicator " + (isP ? "player" : "dealer");
  const enable = isP && !G.busy && !G.gameOver;
  el.shootSelf.disabled = !enable;
  el.shootDealer.disabled = !enable;
  stage.setInteractable(enable);
  stage.idle = enable;            // プレイヤー手番の待機中はディーラーが喫煙する
}
const canUsePlayerItem = () => G.turn === "player" && !G.busy && !G.gameOver;

/* ============================================================
   プレイヤー: アイテム
   ============================================================ */
async function onPlayerUseItem(index) {
  if (!canUsePlayerItem()) return;
  const id = G.player.items[index];
  if (!id) return;
  if (id === "adrenaline") return openAdrenaline(index);
  if (!validItemUse(id, G.player)) return;

  G.busy = true; updateTurnUI();
  G.player.items.splice(index, 1);
  await stage.playUseItem(id, true);
  await applyItem(id, G.player, G.dealer, true);
  G.busy = false;
  syncAll(); updateTurnUI();
  if (G.player.hp <= 0 || G.dealer.hp <= 0) return checkDeaths();
}

function validItemUse(id, self) {
  const rc = remainingCounts();
  switch (id) {
    case "cigarette":
    case "medicine": if (self.hp >= self.max) { log("体力は既に満タンだ。"); return false; } break;
    case "handcuffs": {
      const opp = self === G.player ? G.dealer : G.player;
      if (opp.cuffed) { log("相手は既に拘束されている。"); return false; }
      break;
    }
    case "beer": case "glass": case "inverter": if (rc.total === 0) return false; break;
  }
  return true;
}

async function applyItem(id, self, opp, isPlayer) {
  const who = isPlayer ? "あなた" : "ディーラー";
  switch (id) {
    case "beer": {
      const type = G.shells[G.idx];
      if (isPlayer) G.known[G.idx] = type;
      await stage.ejectShell(type);
      log(`${who}はビールを飲み、1発を排莢 → ${type === "live" ? "実弾" : "空砲"}`);
      G.idx++; G.sawActive = false; stage.setSawed(false);
      break;
    }
    case "cigarette":
      self.hp = Math.min(self.max, self.hp + 1);
      log(`${who}はタバコを吸い、体力+1。`);
      break;
    case "medicine":
      if (Math.random() < 0.5) { self.hp = Math.min(self.max, self.hp + 2); log(`${who}は期限切れ薬を飲んだ… 効いた！ 体力+2。`); }
      else { self.hp = Math.max(0, self.hp - 1); log(`${who}は期限切れ薬を飲んだ… 副作用だ。体力-1。`, "info"); }
      break;
    case "glass": {
      const type = G.shells[G.idx];
      if (isPlayer) { G.known[G.idx] = type; report(`🔍 次の弾は「${type === "live" ? "実弾" : "空砲"}」`, "info"); }
      else { G.dealer.known[G.idx] = type; dealerSay("…VERY INTERESTING…"); }
      break;
    }
    case "saw":
      G.sawActive = true; stage.setSawed(true);
      log(`${who}は銃身を切断した。次弾ダメージ2倍。`);
      break;
    case "handcuffs":
      opp.cuffed = true;
      log(`${who}は${isPlayer ? "ディーラー" : "あなた"}を手錠で拘束した。`);
      break;
    case "phone": {
      const future = [];
      for (let i = G.idx + 1; i < G.shells.length; i++) future.push(i);
      if (!future.length) { if (isPlayer) report("📞 …これ以上先の弾は無い。", "info"); }
      else {
        const pk = future[rand(future.length)], type = G.shells[pk];
        if (isPlayer) { G.known[pk] = type; report(`📞 「${pk + 1}発目… ${type === "live" ? "実弾" : "空砲"}」`, "info"); }
        else { G.dealer.known[pk] = type; dealerSay("…なるほど。"); }
      }
      break;
    }
    case "inverter": {
      const cur = G.shells[G.idx], inv = cur === "live" ? "blank" : "live";
      G.shells[G.idx] = inv;
      if (G.known[G.idx]) G.known[G.idx] = inv;
      if (G.dealer.known[G.idx]) G.dealer.known[G.idx] = inv;
      log(`${who}はインバータで弾の性質を反転させた。`);
      break;
    }
  }
  stage.setMonitor(G.player, G.dealer, G.round + 1);
}

/* ---------------- アドレナリン ---------------- */
let adrIndex = -1;
function openAdrenaline(index) {
  const stealable = G.dealer.items.map((id, i) => ({ id, i })).filter((x) => x.id !== "adrenaline");
  if (!stealable.length) { log("ディーラーは奪えるアイテムを持っていない。"); return; }
  adrIndex = index;
  el.adrPicker.innerHTML = "";
  stealable.forEach(({ id, i }) => {
    const m = ITEM_META[id];
    const d = document.createElement("div");
    d.className = "pick";
    d.innerHTML = `<div>${m.icon}</div><div class="pl">${m.name}</div>`;
    d.onclick = () => resolveAdrenaline(i);
    el.adrPicker.appendChild(d);
  });
  el.adrOverlay.style.display = "flex";
}
async function resolveAdrenaline(di) {
  el.adrOverlay.style.display = "none";
  const stolen = G.dealer.items[di];
  if (!stolen || stolen === "adrenaline") return;
  if (!validItemUse(stolen, G.player)) { log("その状況では使用できない。"); return; }
  G.busy = true; updateTurnUI();
  G.player.items.splice(adrIndex, 1);
  G.dealer.items.splice(di, 1);
  log(`あなたはアドレナリンでディーラーの「${ITEM_META[stolen].name}」を奪った！`);
  syncAll();
  await stage.playUseItem("adrenaline", true);
  await applyItem(stolen, G.player, G.dealer, true);
  G.busy = false; syncAll(); updateTurnUI();
  if (G.player.hp <= 0 || G.dealer.hp <= 0) return checkDeaths();
}

/* ============================================================
   発砲（プレイヤー入力）
   ============================================================ */
async function playerFire(target) {
  if (G.busy || G.gameOver || G.turn !== "player") return;
  G.busy = true; updateTurnUI();
  await shoot("player", target);
}

/* 核となる発砲処理（内部呼び出し。busyガードしない） */
async function shoot(shooter, target) {
  const type = G.shells[G.idx];
  const isLive = type === "live";
  const dmg = G.sawActive ? 2 : 1;
  const aimSelf = target === "self";

  updateTurnUI(); // 入力ロック
  await stage.aimFire(shooter, target, isLive, G.sawActive);

  const label = shooter === "player"
    ? (aimSelf ? "あなたは自分に" : "あなたはディーラーに")
    : (aimSelf ? "ディーラーは自分に" : "ディーラーはあなたに");

  if (isLive) {
    log(`${label}発砲 → 実弾！ ${dmg}ダメージ`);
    let victim = aimSelf ? (shooter === "player" ? G.player : G.dealer)
                         : (shooter === "player" ? G.dealer : G.player);
    victim.hp = Math.max(0, victim.hp - dmg);
  } else {
    log(`${label}発砲 → 空砲。`);
  }

  G.idx++; G.sawActive = false; stage.setSawed(false);
  stage.setMonitor(G.player, G.dealer, G.round + 1);

  if (G.player.hp <= 0 || G.dealer.hp <= 0) { return checkDeaths(); }

  // 再装填（マガジンが空）: ①から仕切り直し → 必ずプレイヤーの手番から
  if (G.idx >= G.shells.length) {
    await wait(300);
    report("RELOAD", "info");
    loadShells();
    giveItems(ROUNDS[G.round].items, false);
    G.player.cuffed = G.dealer.cuffed = false;
    syncAll();
    await stage.prepareRound(G.shells.slice());
    G.turn = "player";
    G.busy = false;
    syncAll();
    updateTurnUI();
    return;
  }

  // ターン遷移
  let next;
  if (!isLive && aimSelf) {
    next = shooter;
    if (shooter === "player") log("空砲だ。もう一度あなたのターン。");
    else dealerSay("空砲か。続けよう。");
  } else {
    const oppKey = shooter === "player" ? "dealer" : "player";
    const oppObj = oppKey === "player" ? G.player : G.dealer;
    if (oppObj.cuffed) {
      oppObj.cuffed = false;
      next = shooter;
      log(`${oppKey === "player" ? "あなた" : "ディーラー"}は手錠で動けない。手番スキップ。`, "info");
    } else next = oppKey;
  }

  G.turn = next;

  if (G.turn === "dealer" && !G.gameOver) {
    updateTurnUI();
    await wait(650);
    return dealerTurn();
  } else {
    // プレイヤーへ操作を戻す
    G.busy = false;
    syncAll();
    updateTurnUI();
  }
}

/* ============================================================
   勝敗
   ============================================================ */
function checkDeaths() {
  stage.setMonitor(G.player, G.dealer, G.round + 1);
  if (G.player.hp <= 0) return endGame(false);
  if (G.dealer.hp <= 0) {
    if (G.round >= ROUNDS.length - 1) return endGame(true);
    G.busy = true; updateTurnUI();
    report("NEXT ROUND", "info");
    setTimeout(() => { G.round++; startRound(); }, 1500);
  }
}

function endGame(win) {
  G.gameOver = true; G.busy = false; updateTurnUI();
  el.overlayCard.innerHTML = win
    ? `<div class="big win">🏆</div><h2 class="win">YOU SURVIVED</h2>
       <p>全3ラウンドを制した。あなたはこの取引を生き延びた。</p>
       <button class="btn" id="againBtn">もう一度</button>`
    : `<div class="big lose">☠️</div><h2 class="lose">GAME OVER</h2>
       <p>ROUND ${G.round + 1} で力尽きた。仮面の奥で嗤い声が響く…</p>
       <button class="btn" id="againBtn">再挑戦</button>`;
  el.overlay.style.display = "flex";
  $("againBtn").onclick = startGame;
}

/* ============================================================
   ディーラーAI（戦略的）
   ============================================================ */
async function dealerTurn() {
  if (G.gameOver) return;
  G.busy = true; updateTurnUI();
  let guard = 0;
  while (guard++ < 24) {
    const decision = await dealerStep();
    if (decision === "fire-self") { await wait(350); return shoot("dealer", "self"); }
    if (decision === "fire-player") { await wait(350); return shoot("dealer", "dealer"); }
    await wait(450);
    if (G.gameOver) return;
    if (G.turn !== "dealer") return; // 念のため
  }
  const rc = remainingCounts();
  return shoot("dealer", rc.live >= rc.blank ? "dealer" : "self");
}

async function dealerStep() {
  const d = G.dealer, p = G.player;
  const rc = remainingCounts();
  const cur = G.idx;
  const has = (id) => d.items.includes(id);
  const use = async (id) => {
    const i = d.items.indexOf(id); if (i < 0) return;
    d.items.splice(i, 1);
    await stage.playUseItem(id, false);
    await applyItem(id, d, p, false);
    syncAll();
  };

  let curKnown = d.known[cur];
  if (rc.live === 0) curKnown = "blank";
  if (rc.blank === 0) curKnown = "live";

  // 1) 回復
  if (has("cigarette") && d.hp < d.max) { await use("cigarette"); return "acted"; }
  if (has("medicine") && d.hp <= d.max - 2 && d.hp >= 2) { await use("medicine"); return "acted"; }

  // 2) アドレナリン
  if (has("adrenaline")) {
    const steal = dealerAdrenalineTarget(curKnown, rc);
    if (steal) { await dealerUseAdrenaline(steal); return "acted"; }
  }

  // 3) 未知なら虫メガネ
  if (curKnown == null && has("glass") && rc.total >= 2) { await use("glass"); return "acted"; }
  curKnown = d.known[cur];
  if (rc.live === 0) curKnown = "blank";
  if (rc.blank === 0) curKnown = "live";

  // 4) 空砲確定
  if (curKnown === "blank") {
    if (has("inverter") && p.hp >= 1) { await use("inverter"); return "acted"; } // 実弾化して次ステップで撃つ
    return "fire-self";
  }

  // 5) 実弾確定
  if (curKnown === "live") {
    if (has("handcuffs") && !p.cuffed) { await use("handcuffs"); return "acted"; }
    if (has("saw") && !G.sawActive && p.hp >= 2) { await use("saw"); return "acted"; }
    return "fire-player";
  }

  // 6) 未知 → 確率
  const pLive = rc.live / rc.total;
  if (pLive > 0.5) {
    if (has("handcuffs") && !p.cuffed && pLive >= 0.67) { await use("handcuffs"); return "acted"; }
    return "fire-player";
  } else if (pLive < 0.5) {
    return "fire-self";
  } else {
    if (has("beer") && rc.total > 1) { await use("beer"); return "acted"; }
    return "fire-player";
  }
}

function dealerAdrenalineTarget(curKnown, rc) {
  const p = G.player, d = G.dealer;
  const pHas = (id) => p.items.includes(id);
  if (p.items.filter((x) => x !== "adrenaline").length === 0) return null;
  if (d.hp < d.max) { if (pHas("cigarette")) return "cigarette"; if (pHas("medicine") && d.hp >= 2) return "medicine"; }
  if (curKnown === "live" && !d.items.includes("saw") && pHas("saw") && p.hp >= 2) return "saw";
  if ((curKnown === "live" || (rc.total && rc.live / rc.total > 0.5)) && !p.cuffed && pHas("handcuffs")) return "handcuffs";
  if (curKnown == null && pHas("glass")) return "glass";
  return null;
}

async function dealerUseAdrenaline(stealId) {
  const d = G.dealer, p = G.player;
  const ai = d.items.indexOf("adrenaline"), pi = p.items.indexOf(stealId);
  if (ai < 0 || pi < 0) return;
  d.items.splice(ai, 1); p.items.splice(pi, 1);
  dealerSay("それをもらおう。");
  log(`ディーラーはアドレナリンであなたの「${ITEM_META[stealId].name}」を奪った！`, "info");
  syncAll();
  await stage.playUseItem("adrenaline", false);
  await applyItem(stealId, d, p, false);
  syncAll();
}

/* ---------------- 起動 ---------------- */
boot();

/* ============================================================
   Buckshot Roulette - 3D Stage (Three.js)
   暗い地下取引の雰囲気 / デスク・仮面のディーラー・ショットガン
   ============================================================ */
import * as THREE from "./vendor/three.module.js";

/* ---------- 汎用トゥイーン ---------- */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function tween(duration, onUpdate, easing = easeInOut) {
  return new Promise((res) => {
    const start = performance.now();
    (function step(now) {
      let t = Math.min(1, (now - start) / duration);
      onUpdate(easing(t), t);
      if (t < 1) requestAnimationFrame(step);
      else res();
    })(performance.now());
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- アイテム見た目定義 ---------- */
export const ITEM_META = {
  beer:       { name: "ビール",       icon: "🍺", tip: "現在の1発目を排莢する" },
  cigarette:  { name: "タバコ",       icon: "🚬", tip: "体力を1回復" },
  glass:      { name: "虫メガネ",     icon: "🔍", tip: "次の弾が実弾/空砲か確認" },
  saw:        { name: "ノコギリ",     icon: "🪚", tip: "次の弾のダメージを2倍" },
  handcuffs:  { name: "手錠",         icon: "⛓️", tip: "相手の次のターンをスキップ" },
  phone:      { name: "携帯",         icon: "📞", tip: "未来のランダムな弾を知る" },
  adrenaline: { name: "アドレナリン", icon: "💉", tip: "相手のアイテムを奪って即使用" },
  inverter:   { name: "インバータ",   icon: "🔄", tip: "次の弾の実弾/空砲を反転" },
  medicine:   { name: "期限切れ薬",   icon: "💊", tip: "50%で+2回復 / 50%で-1" },
};

/* ---------- canvasテクスチャ ---------- */
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t._ctx = g; t._canvas = c;
  return t;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.itemClickCb = null;
    this.interactable = false;
    this.shake = { amt: 0, until: 0 };
    this.tmpV = new THREE.Vector3();

    this._initRenderer();
    this._initScene();
    this._buildRoom();
    this._buildDesk();
    this._buildMonitor();
    this._buildGun();
    this._buildDealer();
    this._buildDust();

    this.playerItemGroup = new THREE.Group();
    this.dealerItemGroup = new THREE.Group();
    this.scene.add(this.playerItemGroup, this.dealerItemGroup);
    this.itemMeshes = []; // {mesh,id,index,side}

    this._initPicking();
    this._loop();
    window.addEventListener("resize", () => this._resize());
  }

  /* ---------------- renderer / scene ---------------- */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050303);
    this.scene.fog = new THREE.FogExp2(0x050303, 0.085);

    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
    this.camBase = new THREE.Vector3(0, 2.35, 3.5);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 1.15, -0.6);

    // 弱い環境光（ほぼ闇）
    this.scene.add(new THREE.AmbientLight(0x241813, 0.35));
    const hemi = new THREE.HemisphereLight(0x2a1a10, 0x000000, 0.25);
    this.scene.add(hemi);

    // 頭上の吊り下げ電球（尋問/取引の雰囲気）
    this.lamp = new THREE.SpotLight(0xffb066, 42, 12, Math.PI / 5, 0.5, 1.6);
    this.lamp.position.set(0, 4.4, 0.2);
    this.lamp.target.position.set(0, 0, -0.3);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.bias = -0.0006;
    this.scene.add(this.lamp, this.lamp.target);

    // 電球の玉
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      new THREE.MeshStandardMaterial({ emissive: 0xffb066, emissiveIntensity: 3, color: 0x000000 })
    );
    bulb.position.copy(this.lamp.position);
    this.scene.add(bulb);
    // 傘
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.24, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide })
    );
    shade.position.set(0, 4.6, 0.2);
    this.scene.add(shade);
    // コード
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a })
    );
    cord.position.set(0, 5.3, 0.2);
    this.scene.add(cord);

    // 冷たいリムライト（奥）
    const rim = new THREE.PointLight(0x2b4a66, 6, 10, 2);
    rim.position.set(-2.5, 1.6, -3);
    this.scene.add(rim);

    // マズルフラッシュ用ライト
    this.flash = new THREE.PointLight(0xffd08a, 0, 8, 2);
    this.scene.add(this.flash);
  }

  /* ---------------- 部屋 ---------------- */
  _buildRoom() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x140d0a, roughness: 0.95, metalness: 0.05 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 1 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat);
    back.position.set(0, 4, -6);
    this.scene.add(back);

    const left = new THREE.Mesh(new THREE.PlaneGeometry(20, 12), wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-6, 4, 0);
    this.scene.add(left);

    const right = left.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.set(6, 4, 0);
    this.scene.add(right);
  }

  /* ---------------- デスク ---------------- */
  _buildDesk() {
    this.deskTopY = 1.0;
    // 天板（緑のフェルト）
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x24401f, roughness: 0.9, metalness: 0.02 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 2.6), feltMat);
    top.position.set(0, this.deskTopY, -0.3);
    top.castShadow = true; top.receiveShadow = true;
    this.scene.add(top);

    // 枠（木）
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.7, metalness: 0.1 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.18, 2.8), woodMat);
    frame.position.set(0, this.deskTopY - 0.06, -0.3);
    frame.castShadow = true; frame.receiveShadow = true;
    this.scene.add(frame);

    // 脚
    const legMat = woodMat;
    [[-2.1, -1.3], [2.1, -1.3], [-2.1, 0.6], [2.1, 0.6]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, this.deskTopY, 0.18), legMat);
      leg.position.set(x, this.deskTopY / 2 - 0.06, z);
      leg.castShadow = true;
      this.scene.add(leg);
    });
    this.surfaceY = this.deskTopY + 0.07;
  }

  /* ---------------- HPモニター ---------------- */
  _buildMonitor() {
    this.monTex = canvasTexture(512, 256, (g, w, h) => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.72, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.5 })
    );
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.58),
      new THREE.MeshStandardMaterial({ map: this.monTex, emissive: 0xffffff, emissiveMap: this.monTex, emissiveIntensity: 1.1 })
    );
    screen.position.z = 0.062;
    const mon = new THREE.Group();
    mon.add(body, screen);
    mon.position.set(1.75, this.surfaceY + 0.36, -0.9);
    mon.rotation.y = -0.5;
    mon.castShadow = true;
    this.scene.add(mon);
    // 台座
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0x111, metalness: 0.6, roughness: 0.5 }));
    stand.position.set(1.75, this.surfaceY, -0.9);
    this.scene.add(stand);
  }

  setMonitor(player, dealer, round) {
    const g = this.monTex._ctx, W = 512, H = 256;
    g.fillStyle = "#05080a"; g.fillRect(0, 0, W, H);
    // グリッド
    g.strokeStyle = "rgba(60,200,120,.08)"; g.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.textBaseline = "middle";

    const drawBar = (label, cur, max, y, col) => {
      g.fillStyle = col; g.font = "bold 26px 'Courier New',monospace";
      g.textAlign = "left"; g.fillText(label, 20, y);
      const bx = 150, bw = 330, bh = 30, cell = bw / max;
      g.strokeStyle = "rgba(120,120,120,.5)"; g.strokeRect(bx, y - bh / 2, bw, bh);
      for (let i = 0; i < max; i++) {
        g.fillStyle = i < cur ? col : "rgba(255,255,255,.06)";
        g.fillRect(bx + i * cell + 3, y - bh / 2 + 3, cell - 6, bh - 6);
      }
      g.fillStyle = col; g.textAlign = "right";
      g.font = "bold 24px 'Courier New',monospace";
      g.fillText(`${cur}/${max}`, W - 16, y);
    };
    g.fillStyle = "#c9a24b"; g.font = "16px 'Courier New',monospace"; g.textAlign = "center";
    g.fillText(`— VITALS  ROUND ${round}/3 —`, W / 2, 30);
    drawBar("DEALER", dealer.hp, dealer.max, 100, "#ff4d4d");
    drawBar("YOU", player.hp, player.max, 175, "#4dffc3");
    // scanline
    g.fillStyle = "rgba(0,0,0,.25)";
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    this.monTex.needsUpdate = true;
  }

  /* ---------------- ショットガン ---------------- */
  _buildGun() {
    const gun = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.9, roughness: 0.38 });
    const blued = new THREE.MeshStandardMaterial({ color: 0x0d0e12, metalness: 0.95, roughness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a1f10, metalness: 0.15, roughness: 0.6 });

    // 銃身は +X 方向。receiver を原点付近に。
    const barrelLen = 1.15;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, barrelLen, 20), blued);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.62, 0.03, 0);
    gun.add(barrel);
    this.barrel = barrel; this.barrelFullLen = barrelLen;

    // マガジンチューブ
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, barrelLen * 0.92, 16), metal);
    mag.rotation.z = Math.PI / 2;
    mag.position.set(0.6, -0.03, 0);
    gun.add(mag); this.mag = mag; this.magFullLen = barrelLen * 0.92;

    // レシーバー
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.11), metal);
    receiver.position.set(0.02, 0.0, 0);
    gun.add(receiver);

    // フォアエンド（ポンプ・木）
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16), wood);
    pump.rotation.z = Math.PI / 2;
    pump.position.set(0.42, -0.005, 0);
    gun.add(pump); this.pump = pump;

    // ストック（木）
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.08), wood);
    stock.position.set(-0.32, -0.05, 0);
    stock.rotation.z = 0.18;
    gun.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.07), wood);
    grip.position.set(-0.12, -0.11, 0);
    grip.rotation.z = 0.35;
    gun.add(grip);

    // トリガーガード
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16, Math.PI), metal);
    guard.position.set(-0.02, -0.11, 0);
    guard.rotation.x = Math.PI / 2;
    gun.add(guard);

    // 銃口の位置マーカー
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0.62 + barrelLen / 2, 0.03, 0);
    gun.add(this.muzzle);

    gun.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // デスク中央に横たえる
    this.gunRest = { pos: new THREE.Vector3(-0.1, this.surfaceY + 0.05, 0.05), rotY: -0.15, rotZ: 0 };
    gun.position.copy(this.gunRest.pos);
    gun.rotation.set(0, this.gunRest.rotY, 0);
    this.scene.add(gun);
    this.gun = gun;
  }

  setSawed(on) {
    // ソードオフ化: 銃身とマガジンを短く
    const f = on ? 0.42 : 1;
    this.barrel.scale.x = f; // cylinder length is along local Y (rotated), scale.x maps to length? -> use scale.y
    this.barrel.scale.set(1, f, 1);
    this.mag.scale.set(1, f, 1);
    // 位置補正（切り口を receiver 側に寄せる）
    const off = (1 - f) * this.barrelFullLen / 2;
    this.barrel.position.x = 0.62 - off;
    this.mag.position.x = 0.6 - off;
    this.muzzle.position.x = 0.62 + (this.barrelFullLen * f) / 2 - off;
  }

  /* ---------------- フードをかぶった人物のディーラー ---------------- */
  _buildDealer() {
    const dealer = new THREE.Group();
    const hoodie = new THREE.MeshStandardMaterial({ color: 0x26262c, roughness: 0.98, metalness: 0 });
    const hoodDark = new THREE.MeshStandardMaterial({ color: 0x101013, roughness: 1, metalness: 0 });
    const faceShadow = new THREE.MeshStandardMaterial({ color: 0x070709, roughness: 1, metalness: 0 });
    const hands = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.88, metalness: 0 });
    const dt = this.deskTopY;

    const limb = (a, b, r, mat) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, len, 12), mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      m.castShadow = true;
      return m;
    };
    const makeHand = (mat) => {
      const hand = new THREE.Group();
      hand.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.16), mat));
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.1), mat);
        f.position.set(-0.045 + i * 0.03, 0, 0.12); hand.add(f);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.07), mat);
      thumb.position.set(0.07, 0, 0.04); hand.add(thumb);
      hand.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return hand;
    };

    // ---- 胴（パーカー。デスクの後方に着席し、上体だけが縁から覗く） ----
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 1.4, 24, 1, true), hoodie);
    torso.position.set(0, dt + 0.5, -2.12);
    torso.rotation.x = -0.04;
    torso.castShadow = true;
    dealer.add(torso);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 16), hoodie);
    chest.position.set(0, dt + 1.0, -2.02);
    chest.scale.set(1, 0.76, 0.82);
    chest.castShadow = true;
    dealer.add(chest);

    // 肩
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.56, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), hoodie);
    shoulders.position.set(0, dt + 1.06, -2.04);
    shoulders.scale.set(1, 0.5, 0.86);
    shoulders.castShadow = true;
    dealer.add(shoulders);

    // 襟
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.2, 16, 1, true), hoodie);
    collar.position.set(0, dt + 1.2, -2.0);
    dealer.add(collar);

    // ---- 頭部（フードの奥に沈む影の顔＝ほぼ黒） ----
    const hy = dt + 1.46;
    const headGroup = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 28, 26), faceShadow);
    head.position.set(0, hy, -1.94); head.scale.set(0.95, 1.08, 1);
    headGroup.add(head);
    this.dealerMouth = new THREE.Vector3(0, hy - 0.05, -1.84);

    // フード（後頭部・頭頂・側頭を覆う）
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 22), hoodie);
    hood.position.set(0, hy + 0.03, -2.06); hood.scale.set(1.36, 1.42, 1.36);
    hood.castShadow = true;
    headGroup.add(hood);
    // 顔まわりの開口リング
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 16, 30), hoodie);
    rim.position.set(0, hy + 0.02, -1.86); rim.rotation.x = 1.35; rim.scale.set(1, 1.18, 1);
    rim.castShadow = true;
    headGroup.add(rim);
    // 頭頂のとんがり
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 18, 1, true), hoodie);
    peak.position.set(0, hy + 0.27, -2.13); peak.rotation.x = -0.32;
    headGroup.add(peak);

    headGroup.rotation.x = 0.05;
    dealer.add(headGroup);
    this.dealerHead = headGroup;

    // ---- パーカーの紐（胸元に垂れる） ----
    [-1, 1].forEach((s) => {
      const top = new THREE.Vector3(s * 0.06, hy - 0.14, -1.82);
      const bot = new THREE.Vector3(s * 0.07, dt + 0.72, -1.72);
      dealer.add(limb(top, bot, 0.007, hoodDark));
      const aglet = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 8), hoodDark);
      aglet.position.copy(bot);
      dealer.add(aglet);
    });

    // ---- 腕（後方の肩からデスク上の手へ伸びる。手の位置は従来どおり維持） ----
    const shoulderR = new THREE.Vector3(0.44, dt + 1.0, -1.98);
    const elbowR = new THREE.Vector3(0.78, this.surfaceY + 0.22, -1.5);
    const handRPos = new THREE.Vector3(0.5, this.surfaceY + 0.03, -1.05);
    dealer.add(limb(shoulderR, elbowR, 0.08, hoodie));
    dealer.add(limb(elbowR, handRPos, 0.062, hoodie));
    this.handR = makeHand(hands);
    this.handR.position.copy(handRPos); this.handR.rotation.x = -0.2;
    dealer.add(this.handR);
    this.handRRest = this.handR.position.clone();

    // 左腕（喫煙用。肩を支点に回転できる可動グループ）
    const shoulderL = new THREE.Vector3(-0.44, dt + 1.0, -1.98);
    const leftArm = new THREE.Group();
    leftArm.position.copy(shoulderL);
    const elbowLrel = new THREE.Vector3(-0.78, this.surfaceY + 0.22, -1.5).sub(shoulderL);
    const handLrel = new THREE.Vector3(-0.5, this.surfaceY + 0.03, -1.05).sub(shoulderL);
    leftArm.add(limb(new THREE.Vector3(0, 0, 0), elbowLrel, 0.08, hoodie));
    leftArm.add(limb(elbowLrel, handLrel, 0.062, hoodie));
    const handL = makeHand(hands);
    handL.position.copy(handLrel); handL.rotation.x = -0.2;
    leftArm.add(handL);
    // タバコ
    const cig = new THREE.Group();
    const cigBody = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.7 }));
    cigBody.rotation.z = Math.PI / 2; cig.add(cigBody);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0xff4d15, emissiveIntensity: 1.4 }));
    ember.position.x = 0.062; cig.add(ember);
    this.cigEmber = ember;
    cig.position.copy(handLrel).add(new THREE.Vector3(-0.04, 0.02, 0.14));
    leftArm.add(cig);
    this.cigarette = cig;
    this.leftArm = leftArm;
    dealer.add(leftArm);

    this.scene.add(dealer);
    this.dealer3d = dealer;

    // 喫煙システム
    this.idle = false;
    this.smoking = false;
    this._scheduleSmoke();
  }

  /* ---- 定期的な喫煙 ---- */
  _scheduleSmoke() {
    const delay = 11000 + Math.random() * 9000;
    this._smokeTimer = setTimeout(async () => {
      if (this.idle && !this.smoking) { try { await this._smoke(); } catch (e) {} }
      this._scheduleSmoke();
    }, delay);
  }

  async _smoke() {
    this.smoking = true;
    const arm = this.leftArm;
    const raise = { x: -1.4, y: 0.18, z: 0.6 };
    // 口元へ運ぶ
    await tween(650, (t) => {
      const e = easeInOut(t);
      arm.rotation.set(raise.x * e, raise.y * e, raise.z * e);
    });
    // 吸う（エンバーが赤熱）
    await tween(750, (t) => { this.cigEmber.material.emissiveIntensity = 1.4 + Math.sin(t * Math.PI) * 4; });
    await wait(250);
    // 下ろす
    await tween(650, (t) => {
      const e = 1 - easeInOut(t);
      arm.rotation.set(raise.x * e, raise.y * e, raise.z * e);
    });
    arm.rotation.set(0, 0, 0);
    // 吐く（煙）
    this._smokePuff(this.dealerMouth);
    await wait(200);
    this.smoking = false;
  }

  _smokePuff(origin) {
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.03 + Math.random() * 0.02, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xbfc4c9, transparent: true, opacity: 0.26, depthWrite: false }));
      p.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.1) * 0.05));
      this.scene.add(p);
      const vx = (Math.random() - 0.5) * 0.02;
      tween(1600 + i * 110, (t) => {
        p.position.y += 0.006; p.position.x += vx; p.position.z += 0.006;
        p.scale.setScalar(1 + t * 2.6);
        p.material.opacity = 0.26 * (1 - t);
      }).then(() => this.scene.remove(p));
    }
  }

  /* ---------------- 埃パーティクル ---------------- */
  _buildDust() {
    const N = 140, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = Math.random() * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffcf9a, size: 0.02, transparent: true, opacity: 0.35, depthWrite: false });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  /* ============================================================
     アイテム 3D モデル
     ============================================================ */
  buildItemMesh(id) {
    const g = new THREE.Group();
    const M = (c, m = 0.3, r = 0.6, e = 0) =>
      new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, emissive: e, emissiveIntensity: e ? 1 : 0 });
    switch (id) {
      case "beer": {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.17, 20), M(0x6b7d2a, 0.7, 0.35));
        g.add(can);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20), M(0xb0b0b0, 0.9, 0.3));
        top.position.y = 0.09; g.add(top);
        break;
      }
      case "cigarette": {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.05), M(0xcfc7b5, 0.1, 0.7));
        g.add(box);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.05, 0.052), M(0x8a1717, 0.1, 0.6));
        band.position.y = 0.03; g.add(band);
        break;
      }
      case "glass": {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 12, 28), M(0x222, 0.8, 0.4));
        ring.rotation.x = Math.PI / 2; g.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24),
          new THREE.MeshPhysicalMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, transmission: 0.6 }));
        lens.rotation.x = -Math.PI / 2; g.add(lens);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14), M(0x3a1f10, 0.1, 0.6));
        handle.position.set(0, 0, 0.13); handle.rotation.x = Math.PI / 2; g.add(handle);
        break;
      }
      case "saw": {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.04), M(0x2a1810, 0.1, 0.6));
        handle.position.x = -0.11; g.add(handle);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.006), M(0x9a9aa0, 0.95, 0.25));
        blade.position.x = 0.08; g.add(blade);
        break;
      }
      case "handcuffs": {
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 10, 24), M(0xb8bcc4, 0.95, 0.25));
        const r2 = r1.clone(); r1.position.x = -0.06; r2.position.x = 0.06;
        g.add(r1, r2);
        break;
      }
      case "phone": {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.025), M(0x14141a, 0.4, 0.5));
        g.add(body);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.09), M(0x0, 0.1, 0.4, 0x224422));
        scr.position.set(0, 0.01, 0.014); g.add(scr);
        break;
      }
      case "adrenaline": {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 16),
          new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.1, transmission: 0.5 }));
        g.add(barrel);
        const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 16), M(0xffbf3f, 0.1, 0.3, 0x553300));
        liquid.position.y = -0.02; g.add(liquid);
        const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.06, 8), M(0xcccccc, 0.9, 0.2));
        needle.position.y = 0.1; g.add(needle);
        const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 16), M(0x333, 0.2, 0.6));
        plunger.position.y = -0.09; g.add(plunger);
        break;
      }
      case "inverter": {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.09), M(0x1a1a1e, 0.5, 0.5));
        g.add(box);
        const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05), M(0xcc3333, 0.3, 0.4, 0x551111));
        sw.position.y = 0.05; sw.rotation.z = 0.4; g.add(sw);
        break;
      }
      case "medicine": {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 16),
          new THREE.MeshPhysicalMaterial({ color: 0xa06a2a, transparent: true, opacity: 0.7, roughness: 0.2 }));
        g.add(bottle);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M(0xdddddd, 0.2, 0.6));
        cap.position.y = 0.08; g.add(cap);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), M(0xeae2d0, 0.05, 0.8));
        label.position.z = 0.046; g.add(label);
        break;
      }
      default: {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M(0x555)));
      }
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  }

  setItems(playerItems, dealerItems) {
    // 既存クリア
    [this.playerItemGroup, this.dealerItemGroup].forEach((grp) => {
      while (grp.children.length) grp.remove(grp.children[0]);
    });
    this.itemMeshes = [];

    const layout = (items, group, side) => {
      const n = items.length;
      const spread = Math.min(0.42, 3.2 / Math.max(n, 1));
      const startX = -((n - 1) * spread) / 2;
      const z = side === "player" ? 0.95 : -1.05;
      items.forEach((id, i) => {
        const mesh = this.buildItemMesh(id);
        mesh.position.set(startX + i * spread, this.surfaceY + 0.02, z);
        mesh.rotation.y = side === "player" ? 0 : Math.PI;
        mesh.userData = { id, index: i, side, baseY: this.surfaceY + 0.02 };
        group.add(mesh);
        this.itemMeshes.push({ mesh, id, index: i, side });
      });
    };
    layout(playerItems, this.playerItemGroup, "player");
    layout(dealerItems, this.dealerItemGroup, "dealer");
  }

  /* ============================================================
     ピッキング（アイテムクリック / ホバー）
     ============================================================ */
  _initPicking() {
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hovered = null;
    const tip = document.getElementById("itemTip");

    const pick = (ev, objs) => {
      this.mouse.x = (ev.clientX / innerWidth) * 2 - 1;
      this.mouse.y = -(ev.clientY / innerHeight) * 2 + 1;
      this.ray.setFromCamera(this.mouse, this.camera);
      const hits = this.ray.intersectObjects(objs, true);
      let top = null;
      if (hits.length) { let o = hits[0].object; while (o && !o.userData.id) o = o.parent; top = o; }
      return top;
    };

    this.canvas.addEventListener("pointermove", (ev) => {
      // プレイヤー・ディーラー両方のアイテムでツールチップ表示（クリックはプレイヤーのみ）
      const top = pick(ev, [...this.playerItemGroup.children, ...this.dealerItemGroup.children]);
      if (this.hovered && this.hovered !== top) { this.hovered.scale.setScalar(1); }
      this.hovered = top;
      if (top) {
        top.scale.setScalar(1.18);
        const m = ITEM_META[top.userData.id];
        const canClick = top.userData.side === "player" && this.interactable;
        tip.style.display = "block";
        tip.style.left = ev.clientX + 14 + "px";
        tip.style.top = ev.clientY + 14 + "px";
        tip.textContent = `${m.name}: ${m.tip}`;
        this.canvas.style.cursor = canClick ? "pointer" : "help";
      } else { tip.style.display = "none"; this.canvas.style.cursor = "default"; }
    });

    this.canvas.addEventListener("pointerdown", (ev) => {
      if (!this.interactable) return;
      const top = pick(ev, this.playerItemGroup.children);
      if (top && top.userData.side === "player" && this.itemClickCb) this.itemClickCb(top.userData.index);
    });
  }

  onItemClick(cb) { this.itemClickCb = cb; }
  setInteractable(b) {
    this.interactable = b;
    if (!b && this.hovered) { this.hovered.scale.setScalar(1); this.hovered = null;
      document.getElementById("itemTip").style.display = "none"; }
  }

  /* ============================================================
     薬莢モデル & ラウンド開始の装填シーケンス
     ============================================================ */
  _shellMesh(type) {
    const shell = new THREE.Group();
    const brass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.028, 16),
      new THREE.MeshStandardMaterial({ color: 0xcaa04a, metalness: 0.85, roughness: 0.3 }));
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.07, 16),
      new THREE.MeshStandardMaterial({ color: type === "live" ? 0xb3231f : 0x6d7075, roughness: 0.5, metalness: 0.05 }));
    brass.position.y = -0.035; hull.position.y = 0.014;
    shell.add(brass, hull);
    shell.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return shell;
  }

  /* shellTypes: 真の装填順（隠す）。机に並べ→ディーラーが装填→机に置く */
  async prepareRound(shellTypes) {
    this.setInteractable(false);
    const n = shellTypes.length;
    // 見た目の並びはシャッフルして真の順序を隠す（色＝内訳だけ開示）
    const vis = shellTypes.slice();
    for (let i = vis.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vis[i], vis[j]] = [vis[j], vis[i]]; }

    const rest = this.gunRest;
    const hold = new THREE.Vector3(-0.05, this.surfaceY + 0.34, -0.55);

    // 銃を持ち上げてディーラー側へ構える
    await tween(500, (t) => {
      this.gun.position.lerpVectors(rest.pos, hold, easeInOut(t));
      this.gun.rotation.set(0, rest.rotY + (0.5 - rest.rotY) * t, 0.12 * t);
      this.handR.position.lerpVectors(this.handRRest, new THREE.Vector3(0.12, this.surfaceY + 0.3, -0.6), t);
    });

    // 薬莢を机に立てて並べる
    const shells = [];
    const spread = Math.min(0.32, 3.0 / Math.max(n, 1));
    const startX = -((n - 1) * spread) / 2;
    for (let i = 0; i < n; i++) {
      const s = this._shellMesh(vis[i]);
      s.position.set(startX + i * spread, this.surfaceY + 0.05, 0.62);
      s.scale.setScalar(0.001);
      this.scene.add(s); shells.push(s);
      tween(160, (t) => s.scale.setScalar(t), easeOut);
      await wait(45);
    }
    await wait(3000); // プレイヤーが内訳を確認・記憶する時間

    // 1発ずつ薬莢を銃へ装填
    const port = hold.clone().add(new THREE.Vector3(0.18, 0.0, 0.14));
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      const from = s.position.clone();
      await tween(200, (t) => {
        const e = easeInOut(t);
        s.position.lerpVectors(from, port, e);
        s.position.y += Math.sin(t * Math.PI) * 0.14;
        s.rotation.x = e * Math.PI * 0.5;
        this.handR.position.lerpVectors(
          new THREE.Vector3(from.x, this.surfaceY + 0.28, from.z),
          new THREE.Vector3(port.x, port.y + 0.06, port.z), e);
      });
      await tween(55, (t) => { this.gun.position.y = hold.y + 0.025 * Math.sin(t * Math.PI); });
      s.scale.setScalar(0.001);
      this.scene.remove(s);
      await wait(25);
    }

    // ポンプをラック（前後スライド＝ガシャッ）
    const px = this.pump.position.x;
    await tween(150, (t) => { this.pump.position.x = px - 0.13 * Math.sin(t * Math.PI); });
    this._doShake(0.03, 130);
    await tween(150, (t) => { this.pump.position.x = px - 0.13 * Math.sin((1 - t) * Math.PI); });
    this.pump.position.x = px;

    // 手を戻し、銃を机に置く
    const hp = this.handR.position.clone();
    tween(350, (t) => this.handR.position.lerpVectors(hp, this.handRRest, t)).then(() => this.handR.position.copy(this.handRRest));
    await tween(500, (t) => {
      this.gun.position.lerpVectors(hold, rest.pos, easeInOut(t));
      this.gun.rotation.set(0, 0.5 + (rest.rotY - 0.5) * t, 0.12 * (1 - t));
    });
    this.gun.position.copy(rest.pos);
    this.gun.rotation.set(0, rest.rotY, 0);
  }

  /* ============================================================
     演出: 発砲
     ============================================================ */
  async aimFire(shooter, target, isLive, sawed) {
    this.setInteractable(false);
    const gun = this.gun;
    const rest = this.gunRest;
    // 目標の向き
    const aimSelf = target === "self";
    // shooter=player: 自分=カメラ(+Z), 相手=ディーラー(-Z)
    // shooter=dealer: 自分=ディーラー(-Z), 相手=カメラ(+Z)
    let toward; // "cam" | "dealer"
    if (shooter === "player") toward = aimSelf ? "cam" : "dealer";
    else toward = aimSelf ? "dealer" : "cam";
    const targetRotY = toward === "cam" ? -Math.PI / 2 : Math.PI / 2;
    const liftY = rest.pos.y + (shooter === "dealer" ? 0.55 : 0.5);
    const liftZ = shooter === "dealer" ? -0.85 : 0.15;
    const tiltZ = toward === "cam" ? -0.12 : 0.12;

    // ディーラーの手を銃へ
    if (shooter === "dealer") {
      const hp = this.handR.position.clone();
      await tween(320, (t) => {
        this.handR.position.lerpVectors(this.handRRest, new THREE.Vector3(-0.05, liftY - 0.05, liftZ), t);
      });
    }

    // 構え
    await tween(shooter === "dealer" ? 420 : 380, (t) => {
      gun.position.y = rest.pos.y + (liftY - rest.pos.y) * t;
      gun.position.z = rest.pos.z + (liftZ - rest.pos.z) * t;
      gun.rotation.y = rest.rotY + (targetRotY - rest.rotY) * t;
      gun.rotation.z = tiltZ * t;
    });
    await wait(180);

    // 発砲
    if (isLive) {
      this._muzzleFlash();
      this._doShake(0.16, 360);
      // リコイル
      const recoilDir = toward === "cam" ? 1 : -1; // z方向
      await tween(90, (t) => {
        gun.position.z += 0; // set below
        gun.rotation.z = tiltZ - recoilDir * 0.25 * t;
        gun.position.y = liftY + 0.12 * t;
      }, easeOut);
      await tween(220, (t) => {
        gun.rotation.z = (tiltZ - recoilDir * 0.25) + (recoilDir * 0.25) * t;
        gun.position.y = (liftY + 0.12) - 0.12 * t;
      });
    } else {
      // カチッ（不発）
      this._doShake(0.04, 130);
      this._muzzleFlash(0.25);
      await tween(120, (t) => { gun.rotation.z = tiltZ - 0.05 * Math.sin(t * Math.PI); });
    }
    await wait(180);

    // 戻す
    await tween(360, (t) => {
      gun.position.y = liftY - (liftY - rest.pos.y) * t;
      gun.position.z = liftZ - (liftZ - rest.pos.z) * t;
      gun.rotation.y = targetRotY + (rest.rotY - targetRotY) * t;
      gun.rotation.z = tiltZ * (1 - t);
    });
    if (shooter === "dealer") {
      await tween(300, (t) => {
        this.handR.position.lerpVectors(this.handR.position.clone(), this.handRRest, t);
      });
      this.handR.position.copy(this.handRRest);
    }
  }

  _muzzleFlash(scale = 1) {
    this.muzzle.getWorldPosition(this.tmpV);
    this.flash.position.copy(this.tmpV);
    this.flash.intensity = 60 * scale;
    // decay handled in loop
    this._flashDecay = performance.now();
  }

  _doShake(amt, ms) { this.shake.amt = amt; this.shake.until = performance.now() + ms; this.shake.ms = ms; this.shake.start = performance.now(); }

  /* ---- 排莢 ---- */
  async ejectShell(type) {
    const shell = new THREE.Group();
    const brass = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0xcaa04a, metalness: 0.8, roughness: 0.3 }));
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: type === "live" ? 0xb3231f : 0x555, roughness: 0.6 }));
    hull.position.y = 0.035; brass.position.y = 0;
    shell.add(brass, hull);
    this.muzzle.getWorldPosition(this.tmpV);
    shell.position.copy(this.gun.position).add(new THREE.Vector3(0.1, 0.05, 0));
    this.scene.add(shell);
    const vy = 0.06, vx = 0.02 + Math.random() * 0.02;
    let t = 0;
    await tween(700, (p) => {
      t += 0.016;
      shell.position.x += vx;
      shell.position.y += vy - 1.6 * t;
      shell.rotation.x += 0.4; shell.rotation.z += 0.3;
    });
    this.scene.remove(shell);
  }

  /* ============================================================
     演出: アイテム使用モーション
     ============================================================ */
  async playUseItem(id, byPlayer) {
    const group = byPlayer ? this.playerItemGroup : this.dealerItemGroup;
    // 対象meshを探す（最初の一致）
    let target = null;
    for (const c of group.children) if (c.userData.id === id) { target = c; break; }
    if (!target) { await wait(200); return; }

    const baseY = target.userData.baseY;
    const up = baseY + 0.35;

    // 持ち上げ
    await tween(260, (t) => { target.position.y = baseY + (up - baseY) * t; target.rotation.y += 0.06; }, easeOut);

    // 種類別の見せ場
    switch (id) {
      case "cigarette": case "medicine":
        await tween(300, (t) => { target.rotation.z = Math.sin(t * Math.PI) * 0.5; });
        this._healPulse(byPlayer);
        break;
      case "glass": case "phone":
        await tween(500, (t) => { target.rotation.x = Math.sin(t * Math.PI * 2) * 0.4; });
        break;
      case "saw":
        // ノコギリで銃身を切る動き
        await tween(500, (t) => {
          target.position.x = Math.sin(t * Math.PI * 3) * 0.12;
          target.position.z = (byPlayer ? 0.6 : -0.7) + (0 - (byPlayer ? 0.6 : -0.7)) * t;
        });
        break;
      case "handcuffs":
        await tween(400, (t) => { target.rotation.z += 0.2; target.position.y = up + Math.sin(t * Math.PI) * 0.1; });
        break;
      case "inverter":
        await tween(300, (t) => { target.rotation.z = Math.sin(t * Math.PI * 4) * 0.3; });
        this._doShake(0.03, 120);
        break;
      case "adrenaline":
        await tween(360, (t) => { target.rotation.z = -0.6 * t; });
        this._healPulse(byPlayer, 0xff4444);
        break;
      default:
        await tween(250, () => {});
    }
    // 消える（フェード縮小）
    await tween(220, (t) => { target.scale.setScalar(1 - t); }, easeOut);
    group.remove(target);
  }

  _healPulse(byPlayer, color = 0x4dffc3) {
    const light = new THREE.PointLight(color, 0, 3, 2);
    light.position.set(0, this.surfaceY + 0.6, byPlayer ? 1.2 : -1.4);
    this.scene.add(light);
    tween(600, (t) => { light.intensity = Math.sin(t * Math.PI) * 12; })
      .then(() => this.scene.remove(light));
  }

  /* ============================================================
     ループ
     ============================================================ */
  _loop() {
    const clock = new THREE.Clock();
    window.__stage = this;
    const render = () => {
      requestAnimationFrame(render);
      if (window.__renderPaused) return;
      const dt = clock.getDelta();
      const now = performance.now();

      // 電球のわずかな揺らぎ
      this.lamp.intensity = 40 + Math.sin(now * 0.004) * 3 + (Math.random() - 0.5) * 2;

      // マズルフラッシュ減衰
      if (this.flash.intensity > 0) {
        this.flash.intensity *= 0.82;
        if (this.flash.intensity < 0.5) this.flash.intensity = 0;
      }

      // シェイク
      if (now < this.shake.until) {
        const k = (this.shake.until - now) / this.shake.ms;
        this.camera.position.set(
          this.camBase.x + (Math.random() - 0.5) * this.shake.amt * k,
          this.camBase.y + (Math.random() - 0.5) * this.shake.amt * k,
          this.camBase.z + (Math.random() - 0.5) * this.shake.amt * k
        );
      } else {
        // ゆるいカメラ揺れ
        this.camera.position.set(
          this.camBase.x + Math.sin(now * 0.0004) * 0.03,
          this.camBase.y + Math.cos(now * 0.0005) * 0.02,
          this.camBase.z
        );
      }
      this.camera.lookAt(0, 1.15, -0.7);

      // 埃
      if (this.dust) {
        const p = this.dust.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i) + dt * 0.05;
          if (y > 4) y = 0;
          p.setY(i, y);
        }
        p.needsUpdate = true;
      }

      this.renderer.render(this.scene, this.camera);
    };
    render();
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}

import * as THREE from './vendor/three.module.js';

/* =========================================================
   おじさんピニャータ
   ハートの杖＆武器でおじさんをたたきまくる3Dゲーム
   マネーシステム / 武器ショップ / 毒ガス / 無限強化
   ========================================================= */

// ---------- 基本セットアップ ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1650);
scene.fog = new THREE.Fog(0x2a1650, 14, 30);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
const CAM_BASE = new THREE.Vector3(0, 2.9, 5.4);
camera.position.copy(CAM_BASE);
camera.lookAt(0, 3.0, 0);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- ライト ----------
scene.add(new THREE.AmbientLight(0xffe8f5, 0.55));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
sun.position.set(4, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 10;  sun.shadow.camera.bottom = -2;
scene.add(sun);
const fill = new THREE.PointLight(0xff9ecb, 0.7, 20);
fill.position.set(-4, 4, 4);
scene.add(fill);

// ---------- パーティー会場 ----------
function buildRoom() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const cols = ['#c98be0', '#b97ad2'];
  const n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = cols[(x + y) % 2];
    g.fillRect(x * s, y * s, s, s);
  }
  const floorTex = new THREE.CanvasTexture(c);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wc = document.createElement('canvas');
  wc.width = 256; wc.height = 256;
  const wg = wc.getContext('2d');
  const grad = wg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#513085');
  grad.addColorStop(1, '#7a4bb8');
  wg.fillStyle = grad;
  wg.fillRect(0, 0, 256, 256);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 18),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wc), fog: false })
  );
  wall.position.set(0, 8, -9);
  scene.add(wall);

  const flagCols = [0xff6b8a, 0xffd94d, 0x5ad1ff, 0x7dff9e, 0xffa64d];
  for (const [x0, y0, x1, y1] of [[-9, 7.4, 9, 7.0], [-9, 5.8, 9, 6.4]]) {
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const sag = Math.sin(t * Math.PI) * 1.0;
      const shape = new THREE.Shape();
      shape.moveTo(-0.22, 0); shape.lineTo(0.22, 0); shape.lineTo(0, -0.45); shape.closePath();
      const flag = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: flagCols[i % flagCols.length], side: THREE.DoubleSide })
      );
      flag.position.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - sag, -8.5);
      scene.add(flag);
    }
  }

  const balloons = [];
  const balloonCols = [0xff5f8f, 0xffd94d, 0x59c9ff, 0x8dff8d, 0xd08bff];
  for (let i = 0; i < 6; i++) {
    const grp = new THREE.Group();
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 20, 20),
      new THREE.MeshPhongMaterial({ color: balloonCols[i % balloonCols.length], shininess: 90, specular: 0xffffff })
    );
    b.scale.y = 1.18;
    grp.add(b);
    const str = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    str.position.y = -1.2;
    grp.add(str);
    const x = -6 + (i / 5) * 12 + (i % 2 ? 0.6 : -0.6);
    grp.position.set(x, 4.6 + (i % 3) * 0.7, -6.5);
    grp.userData.phase = i * 1.3;
    scene.add(grp);
    balloons.push(grp);
  }
  return balloons;
}
const balloons = buildRoom();

// ---------- おじさんの顔（表情はCanvasテクスチャで切り替え） ----------
const FACE_W = 1024, FACE_H = 512;
const faceCanvas = document.createElement('canvas');
faceCanvas.width = FACE_W; faceCanvas.height = FACE_H;
const fctx = faceCanvas.getContext('2d');
const faceTexture = new THREE.CanvasTexture(faceCanvas);
faceTexture.colorSpace = THREE.SRGBColorSpace;

// 球のUVで u=0.25 が正面(+Z)にくるので、顔はキャンバスの x = W*0.25 を中心に描く
const FX = FACE_W * 0.25;

let goreMode = false; // 18禁モードON時にtrue（顔がボロボロになる）

function drawFace(expr) {
  const g = fctx;
  g.fillStyle = expr === 'sick' ? '#cfd89a' : '#f2c18f'; // 毒のときは顔色が悪い
  g.fillRect(0, 0, FACE_W, FACE_H);

  const eyeY = FACE_H * 0.46, mouthY = FACE_H * 0.66;
  const eyeDX = 62;

  g.fillStyle = 'rgba(235,120,90,0.35)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(FX + s * 105, FACE_H * 0.58, 30, 18, 0, 0, Math.PI * 2);
    g.fill();
  }

  g.strokeStyle = '#3a2a1a';
  g.fillStyle = '#3a2a1a';
  g.lineWidth = 9;
  g.lineCap = 'round';

  const brow = (dx, tilt) => {
    g.beginPath();
    g.moveTo(FX + dx - 34, eyeY - 52 + tilt);
    g.quadraticCurveTo(FX + dx, eyeY - 66 + tilt * 0.4, FX + dx + 34, eyeY - 52 - tilt);
    g.stroke();
  };

  if (expr === 'normal') {
    brow(-eyeDX, 6); brow(eyeDX, -6);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(FX + s * eyeDX - 26, eyeY);
      g.quadraticCurveTo(FX + s * eyeDX, eyeY + 14, FX + s * eyeDX + 26, eyeY);
      g.stroke();
      g.beginPath();
      g.arc(FX + s * eyeDX, eyeY + 6, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(FX - 34, mouthY + 12);
    g.quadraticCurveTo(FX, mouthY - 8, FX + 34, mouthY + 12);
    g.stroke();
  } else if (expr === 'ouch') {
    brow(-eyeDX, -14); brow(eyeDX, 14);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(FX + s * eyeDX - 24, eyeY - 18); g.lineTo(FX + s * eyeDX + 24 * 0.2 * s * s, eyeY);
      g.moveTo(FX + s * eyeDX - 24, eyeY + 18); g.lineTo(FX + s * eyeDX, eyeY);
      g.moveTo(FX + s * eyeDX + 24, eyeY - 18); g.lineTo(FX + s * eyeDX, eyeY);
      g.moveTo(FX + s * eyeDX + 24, eyeY + 18); g.lineTo(FX + s * eyeDX, eyeY);
      g.stroke();
    }
    g.fillStyle = '#8a2a1a';
    g.beginPath();
    g.ellipse(FX, mouthY + 10, 34, 42, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff9d8a';
    g.beginPath();
    g.ellipse(FX, mouthY + 26, 20, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5ad1ff';
    g.beginPath(); g.ellipse(FX - 150, eyeY - 40, 10, 16, -0.3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(FX + 150, eyeY - 10, 8, 13, 0.3, 0, Math.PI * 2); g.fill();
  } else if (expr === 'dizzy' || expr === 'sick') {
    brow(-eyeDX, 10); brow(eyeDX, -10);
    g.lineWidth = 7;
    for (const s of [-1, 1]) {
      g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.15) {
        const r = 3 + a * 2.6;
        const px = FX + s * eyeDX + Math.cos(a * s) * r;
        const py = eyeY + Math.sin(a * s) * r;
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.stroke();
    }
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(FX - 38, mouthY + 6);
    g.quadraticCurveTo(FX - 19, mouthY - 10, FX, mouthY + 6);
    g.quadraticCurveTo(FX + 19, mouthY + 22, FX + 38, mouthY + 6);
    g.stroke();
  } else if (expr === 'shock') {
    brow(-eyeDX, -18); brow(eyeDX, 18);
    for (const s of [-1, 1]) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(FX + s * eyeDX, eyeY, 30, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a2a1a';
      g.beginPath(); g.arc(FX + s * eyeDX, eyeY, 30, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#3a2a1a';
      g.beginPath(); g.arc(FX + s * eyeDX, eyeY + 4, 6, 0, Math.PI * 2); g.fill();
    }
    g.beginPath();
    g.ellipse(FX, mouthY + 8, 16, 24, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (expr === 'happy') {
    brow(-eyeDX, -4); brow(eyeDX, 4);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(FX + s * eyeDX - 24, eyeY + 6);
      g.quadraticCurveTo(FX + s * eyeDX, eyeY - 20, FX + s * eyeDX + 24, eyeY + 6);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(FX - 36, mouthY - 4);
    g.quadraticCurveTo(FX, mouthY + 26, FX + 36, mouthY - 4);
    g.stroke();
  }

  // 口ひげ（全表情共通）
  g.fillStyle = '#5a4632';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(FX + s * 26, mouthY - 26, 26, 10, s * 0.18, 0, Math.PI * 2);
    g.fill();
  }

  // ---- 18禁モード：ボコボコにされた顔 ----
  if (goreMode && expr !== 'happy') {
    // 打撲のアザ
    g.fillStyle = 'rgba(120,60,160,0.5)';
    g.beginPath(); g.ellipse(FX - 92, eyeY - 26, 36, 26, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(60,80,150,0.45)';
    g.beginPath(); g.ellipse(FX + 82, mouthY - 62, 28, 20, -0.3, 0, Math.PI * 2); g.fill();
    // おでこの切り傷
    g.strokeStyle = '#8a1420';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(FX + 58, eyeY - 92); g.lineTo(FX + 112, eyeY - 60);
    g.moveTo(FX + 70, eyeY - 96); g.lineTo(FX + 88, eyeY - 66);
    g.stroke();
    // 鼻血（2すじ）
    g.fillStyle = '#b01525';
    g.fillRect(FX - 13, FACE_H * 0.55, 9, 64);
    g.fillRect(FX + 7, FACE_H * 0.55, 7, 44);
    // 口元から垂れる血
    g.beginPath(); g.ellipse(FX - 32, mouthY + 42, 13, 28, 0.5, 0, Math.PI * 2); g.fill();
    // 痛がっているときは血が飛び散る
    if (expr === 'ouch' || expr === 'shock') {
      g.fillStyle = 'rgba(160,20,35,0.85)';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.ellipse(FX + Math.cos(a) * 152, eyeY + Math.sin(a) * 118, 8 + (i % 3) * 4, 5 + (i % 2) * 4, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  faceTexture.needsUpdate = true;
}
drawFace('normal');

// ---------- おじさん（ピニャータ本体） ----------
const anchor = new THREE.Group();
anchor.position.set(0, 5.6, 0);
scene.add(anchor);

const ROPE_LEN = 1.35;
const ojisan = new THREE.Group();
ojisan.position.y = -ROPE_LEN;
anchor.add(ojisan);

function buildOjisan() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c18f, roughness: 0.75 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x2c3e66, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 });

  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.7, roughness: 0.4 }));
  mount.position.y = 0.05;
  anchor.add(mount);
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, ROPE_LEN, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 })
  );
  rope.position.y = -ROPE_LEN / 2;
  anchor.add(rope);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 40, 32),
    new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.7 })
  );
  head.castShadow = true;
  ojisan.add(head);

  // 顔（u=0.25 → phi=π/2 が正面）を避けて、後頭部とサイドだけに毛を生やす
  const sideHair = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.52, Math.PI * 0.3), hairMat);
  sideHair.scale.set(1.02, 1, 1.02);
  head.add(sideHair);
  for (const s of [-1, 1]) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hairMat);
    tuft.position.set(s * 0.52, 0.12, -0.1);
    head.add(tuft);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin);
    ear.position.set(s * 0.57, -0.02, 0.02);
    head.add(ear);
  }
  for (let i = -1; i <= 1; i++) {
    const hairStrand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.28, 6), hairMat);
    hairStrand.position.set(i * 0.1, 0.62, 0);
    hairStrand.rotation.z = -i * 0.5;
    head.add(hairStrand);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8a878, roughness: 0.7 }));
  nose.position.set(0, -0.08, 0.56);
  head.add(nose);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 1.15, 24), suit);
  torso.position.y = -1.15;
  torso.castShadow = true;
  ojisan.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), suit);
  belly.scale.set(1, 0.85, 0.9);
  belly.position.set(0, -1.45, 0.1);
  belly.castShadow = true;
  ojisan.add(belly);

  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.0, 16, 1, false, -0.45, 0.9), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9 }));
  shirt.position.set(0, -1.12, 0.11);
  ojisan.add(shirt);
  const tie = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.62, 4), new THREE.MeshStandardMaterial({ color: 0xd42a4a, roughness: 0.7 }));
  tie.rotation.x = Math.PI;
  tie.rotation.y = Math.PI / 4;
  tie.scale.z = 0.4;
  tie.position.set(0, -1.05, 0.45);
  ojisan.add(tie);

  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.95, 12), suit);
    arm.position.set(s * 0.52, -1.15, 0);
    arm.rotation.z = s * 0.28;
    arm.castShadow = true;
    ojisan.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin);
    hand.position.set(s * 0.66, -1.65, 0);
    ojisan.add(hand);
  }
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.85, 12), new THREE.MeshStandardMaterial({ color: 0x3a4a72, roughness: 0.9 }));
    leg.position.set(s * 0.2, -2.2, 0);
    leg.castShadow = true;
    ojisan.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.38), new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.5 }));
    shoe.position.set(s * 0.2, -2.66, 0.07);
    ojisan.add(shoe);
  }

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 24), new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 }));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = -0.9;
  ojisan.add(belt);
}
buildOjisan();

// ヒット時に赤くフラッシュさせるためのマテリアル一覧
const ojisanMats = [];
{
  const seen = new Set();
  ojisan.traverse(o => {
    if (o.material && o.material.emissive && !seen.has(o.material)) {
      seen.add(o.material);
      ojisanMats.push(o.material);
    }
  });
}

const pend = { vx: 0, vz: 0, spinV: 0 };
const ropeSpring = { stretch: 0, v: 0 }; // ロープのビヨンと伸びる動き
let squash = 0;
let faceTimer = 0;
let currentFace = 'normal';
function setFace(expr, duration) {
  if (currentFace !== expr) { currentFace = expr; drawFace(expr); }
  faceTimer = duration;
}

// ---------- 共有テクスチャ ----------
function makeGlowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeStarTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.translate(32, 32);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 28 : 12;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    i === 0 ? g.moveTo(Math.cos(a) * r, Math.sin(a) * r) : g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeHeartSpriteTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.translate(32, 36);
  g.scale(1.15, 1.15);
  g.beginPath();
  g.moveTo(0, 8);
  g.bezierCurveTo(-22, -10, -14, -26, 0, -14);
  g.bezierCurveTo(14, -26, 22, -10, 0, 8);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// マンガ的なインパクト閃光（ギザギザの星型フラッシュ）
function makeImpactTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const spikes = 12;
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 60 : 22 + Math.random() * 8;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    i === 0 ? g.moveTo(Math.cos(a) * r, Math.sin(a) * r) : g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffdf6a';
  g.fill();
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = (i % 2 === 0 ? 60 : 24) * 0.55;
    const a = (i / (spikes * 2)) * Math.PI * 2 + 0.13;
    i === 0 ? g.moveTo(Math.cos(a) * r, Math.sin(a) * r) : g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const impactTex = makeImpactTexture();

// 血しぶき・血だまり用の不定形ブロブ
function makeBlobTexture(color, blobs) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * 34;
    g.beginPath();
    g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 12 + Math.random() * 22, 10 + Math.random() * 18, a, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const bloodTex = makeBlobTexture('#a0101f', 6);
const stainTex = makeBlobTexture('rgba(110,10,22,0.9)', 9);

const glowTexGold = makeGlowTexture('rgba(255,240,170,0.95)', 'rgba(255,180,40,0)');
const glowTexPink = makeGlowTexture('rgba(255,170,220,0.95)', 'rgba(255,60,140,0)');
const glowTexBlue = makeGlowTexture('rgba(170,220,255,0.95)', 'rgba(60,140,255,0)');
const glowTexGreen = makeGlowTexture('rgba(190,255,150,0.9)', 'rgba(60,180,40,0)');
const glowTexOrange = makeGlowTexture('rgba(255,220,150,1)', 'rgba(255,90,20,0)');
const glowTexWhite = makeGlowTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
const starTexGold = makeStarTexture('#ffd94d');
const heartTexPink = makeHeartSpriteTexture('#ff5f8f');
const heartTexRed = makeHeartSpriteTexture('#ff3057');

// ---------- 武器データ ----------
// 記載順に攻撃力・攻撃スピードが上がっていく
const WEAPONS = [
  { id: 'wand',     name: 'ハートの杖', icon: '💖', dmg: 1,     rate: 2,   hold: false, anim: 'swing', sound: 'hit',   unlockCost: 0,       price: 0,       lvReq: 0,    desc: '無限に強化できる愛の杖' },
  { id: 'watergun', name: '水鉄砲',     icon: '💦', dmg: 5,     rate: 2.2, hold: false, anim: 'shoot', sound: 'water', unlockCost: 50,      price: 150,     lvReq: 0,    desc: 'ぴゅっと水攻撃', burst: 'water' },
  { id: 'harisen',  name: 'ハリセン',   icon: '👏', dmg: 12,    rate: 2.6, hold: false, anim: 'swing', sound: 'slap',  unlockCost: 200,     price: 600,     lvReq: 0,    desc: 'スパーン！といい音がする' },
  { id: 'bat',      name: 'バット',     icon: '⚾', dmg: 30,    rate: 3.0, hold: false, anim: 'swing', sound: 'hit',   unlockCost: 800,     price: 2400,    lvReq: 0,    desc: 'フルスイングで飛ばせ' },
  { id: 'nailbat',  name: '釘バット',   icon: '🏏', dmg: 75,    rate: 3.5, hold: false, anim: 'swing', sound: 'hit',   unlockCost: 3000,    price: 9000,    lvReq: 0,    desc: 'トゲトゲの凶悪バット' },
  { id: 'katana',   name: '刀',         icon: '⚔️', dmg: 180,   rate: 4.0, hold: false, anim: 'swing', sound: 'slash', unlockCost: 12000,   price: 36000,   lvReq: 0,    desc: '一閃！サムライソード', burst: 'slash' },
  { id: 'chainsaw', name: 'チェンソー', icon: '🪚', dmg: 420,   rate: 5,   hold: true,  anim: 'saw',   sound: 'saw',   unlockCost: 50000,   price: 150000,  lvReq: 500,  desc: '長押しで秒間5回攻撃' },
  { id: 'poison',   name: '毒ガス',     icon: '☣️', dmg: 950,   rate: 7,   hold: false, anim: 'spray', sound: 'spray', unlockCost: 200000,  price: 600000,  lvReq: 1000, desc: '15秒間のスリップダメージ（秒間7回）', burst: 'poison' },
  { id: 'gun',      name: '銃',         icon: '🔫', dmg: 2200,  rate: 10,  hold: true,  anim: 'shoot', sound: 'gun',   unlockCost: 800000,  price: 2400000, lvReq: 1500, desc: '長押しで秒間10連射', burst: 'gun' },
  { id: 'grenade',  name: '無限グレネードランチャー', icon: '💣', dmg: 15000, rate: 3, hold: false, anim: 'shoot', sound: 'boom', unlockCost: 3000000, price: 9000000, lvReq: 2000, desc: '秒間3発の超火力！', burst: 'explosion' },
];
const weaponById = id => WEAPONS.find(w => w.id === id);

// ---------- ペット（武器と重複OK・自動攻撃・無限強化） ----------
const PETS = {
  dog: { name: 'いぬ', icon: '🐕', base: 25, rate: 1.0, price: 8000, upBase: 1200, desc: '自動でかみつく忠犬' },
  cat: { name: 'ねこ', icon: '🐈', base: 18, rate: 1.4, price: 5000, upBase: 750, desc: '自動でひっかく気まぐれ猫' },
};
const PET_IDS = ['dog', 'cat'];

// ---------- 18禁モード ----------
const R18_PRICE = 1e12; // 1兆

// ---------- ゲーム状態 ----------
const state = {
  started: false,
  score: 0,
  money: 0,
  level: 1,
  xp: 0,
  combo: 0,
  comboTimer: 0,
  equipped: 'wand',
  wandUp: 0, // ハートの杖の強化回数（無限）
  weapons: {}, // id -> 'secret' | 'unlocked' | 'owned'
  pets: { dog: { owned: false, up: 0 }, cat: { owned: false, up: 0 } },
  r18Owned: false,
  r18On: false,
  cooldown: 0,
  swinging: false,
  swingT: 0,
  swingDur: 0.2,
  hitDone: false,
  holding: false,
  poison: null, // { t, tickTimer, dmg }
  shake: 0,
  hitStop: 0,   // ヒットストップ（一瞬スローになる）
  punch: 0,     // カメラの前方パンチ
  flash: 0,     // おじさんの赤フラッシュ
  time: 0,
  lastLevelFx: -10,
  pendingLevels: 0,
  levelFrom: 1,
};
for (const w of WEAPONS) state.weapons[w.id] = w.id === 'wand' ? 'owned' : 'secret';

// 成長曲線
const xpNeed = lv => Math.floor(20 + 8 * lv + 0.4 * Math.pow(lv, 1.8));
const dmgMult = () => 1 + (state.level - 1) * 0.05;
// ハートの杖（無限強化）
const wandDmg = () => Math.ceil((1 + 2 * state.wandUp) * Math.pow(1.07, state.wandUp));
const wandRate = () => Math.min(2 + 0.1 * state.wandUp, 15);
const wandCost = () => Math.ceil(40 * Math.pow(1.26, state.wandUp));
const wandTier = () => Math.min(5, 1 + Math.floor(state.wandUp / 6));

function weaponDmg(id) {
  const base = id === 'wand' ? wandDmg() : weaponById(id).dmg;
  return Math.max(1, Math.round(base * dmgMult()));
}
// ペット（無限強化・杖と同じ成長式）
const petDmg = id => {
  const n = state.pets[id].up;
  return Math.max(1, Math.round(PETS[id].base * (1 + 2 * n) * Math.pow(1.07, n) * dmgMult()));
};
const petUpCost = id => Math.ceil(PETS[id].upBase * Math.pow(1.26, state.pets[id].up));
// 18禁モードの見た目（顔のグロ化）を反映
function applyR18Visual() {
  goreMode = state.r18On;
  drawFace(currentFace);
}
function weaponRate(id) {
  return id === 'wand' ? wandRate() : weaponById(id).rate;
}

// 数値の表示（万/億/兆で省略）
function fmt(n) {
  if (n < 100000) return Math.floor(n).toLocaleString();
  if (n < 1e8) return (n / 1e4).toFixed(n < 1e6 ? 1 : 0) + '万';
  if (n < 1e12) return (n / 1e8).toFixed(n < 1e10 ? 1 : 0) + '億';
  return (n / 1e12).toFixed(2) + '兆';
}

// ---------- セーブ / ロード ----------
const SAVE_KEY = 'ojisan-pinata-save-v1';
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      score: state.score, money: state.money, level: state.level, xp: state.xp,
      wandUp: state.wandUp, weapons: state.weapons, equipped: state.equipped,
      pets: state.pets, r18Owned: state.r18Owned, r18On: state.r18On,
    }));
  } catch (e) { /* ストレージ不可でもゲームは続行 */ }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d) return;
    state.score = d.score || 0;
    state.money = d.money || 0;
    state.level = d.level || 1;
    state.xp = d.xp || 0;
    state.wandUp = d.wandUp || 0;
    if (d.weapons) for (const w of WEAPONS) { if (d.weapons[w.id]) state.weapons[w.id] = d.weapons[w.id]; }
    state.weapons.wand = 'owned';
    if (d.equipped && state.weapons[d.equipped] === 'owned') state.equipped = d.equipped;
    if (d.pets) for (const id of PET_IDS) {
      if (d.pets[id]) state.pets[id] = { owned: !!d.pets[id].owned, up: d.pets[id].up || 0 };
    }
    state.r18Owned = !!d.r18Owned;
    state.r18On = !!d.r18On && state.r18Owned;
  } catch (e) { /* 壊れたセーブは無視 */ }
}
load();
setInterval(save, 5000);
window.addEventListener('beforeunload', save);

// ---------- サウンド用の状態（buildEquippedより先に宣言が必要） ----------
let audioCtx = null;
let sawNodes = null;

// ---------- 武器の3Dモデル ----------
const weaponRoot = new THREE.Group();
camera.add(weaponRoot);

const equipCtx = {
  id: null,
  anim: 'swing',
  basePos: new THREE.Vector3(0.62, -0.62, -1.35),
  baseRot: new THREE.Euler(0.35, -0.25, -0.35),
  flash: null,       // マズルフラッシュ
  flashTimer: 0,
  sparkles: null,    // 杖のキラキラ
  orbiters: [],      // 杖の星
  auraLight: null,   // 杖のオーラ
  tipLocal: new THREE.Vector3(0, 0.9, 0), // ビームの発射位置（杖の先端）
};

// ---- ハートの杖のビーム（18禁モードで解禁・長押し可能） ----
const beamGroup = new THREE.Group();
beamGroup.visible = false;
scene.add(beamGroup);
{
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 1, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff4f9e, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beamGroup.add(core, outer);
}
let beamTimer = 0;
const _beamStart = new THREE.Vector3();
const _beamEnd = new THREE.Vector3();
const _beamDir = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const beamActive = () => state.r18On && state.equipped === 'wand';

function clearWeaponModel() {
  while (weaponRoot.children.length) {
    const ch = weaponRoot.children.pop();
    ch.traverse?.(o => { o.geometry?.dispose(); });
  }
  equipCtx.flash = null;
  equipCtx.sparkles = null;
  equipCtx.orbiters = [];
  equipCtx.auraLight = null;
}

function makeHeartGeometry(size, depth) {
  const s = new THREE.Shape();
  const x = -0.25, y = -0.45;
  s.moveTo(x + 0.25, y + 0.25);
  s.bezierCurveTo(x + 0.25, y + 0.25, x + 0.2, y, x, y);
  s.bezierCurveTo(x - 0.3, y, x - 0.3, y + 0.35, x - 0.3, y + 0.35);
  s.bezierCurveTo(x - 0.3, y + 0.55, x - 0.1, y + 0.77, x + 0.25, y + 0.95);
  s.bezierCurveTo(x + 0.6, y + 0.77, x + 0.8, y + 0.55, x + 0.8, y + 0.35);
  s.bezierCurveTo(x + 0.8, y + 0.35, x + 0.8, y, x + 0.5, y);
  s.bezierCurveTo(x + 0.35, y, x + 0.25, y + 0.25, x + 0.25, y + 0.25);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelSegments: 4, bevelSize: 0.05, bevelThickness: 0.05, curveSegments: 24,
  });
  geo.center();
  geo.rotateZ(Math.PI);
  geo.scale(size, size, size);
  return geo;
}

// --- ハートの杖（添付イラスト準拠・強化で豪華に） ---
function buildWand(tier) {
  const wand = new THREE.Group();
  weaponRoot.add(wand);

  const heartScale = [0.2, 0.22, 0.25, 0.27, 0.32][tier - 1];
  const stickGold = tier >= 2;
  const stickLen = 0.8 + tier * 0.02;

  const stickMat = stickGold
    ? new THREE.MeshPhongMaterial({ color: 0xffc93a, specular: 0xffffff, shininess: 120 })
    : new THREE.MeshPhongMaterial({ color: 0xe0356b, specular: 0xffaacc, shininess: 60 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, stickLen, 12), stickMat);
  stick.position.y = stickLen / 2;
  wand.add(stick);

  const topY = stickLen + heartScale * 0.62;

  const heartMat = new THREE.MeshPhongMaterial({
    color: tier >= 5 ? 0xff2a6a : 0xe8285e,
    specular: 0xffffff,
    shininess: 160,
    emissive: 0x550a22,
  });
  const heart = new THREE.Mesh(makeHeartGeometry(heartScale, 0.38), heartMat);
  heart.position.y = topY;
  wand.add(heart);

  const shine = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexWhite, transparent: true, depthWrite: false }));
  shine.scale.setScalar(heartScale * 0.7);
  shine.position.set(-heartScale * 0.35, topY + heartScale * 0.3, heartScale * 0.24);
  wand.add(shine);

  if (tier >= 3) {
    const rim = new THREE.Mesh(
      makeHeartGeometry(heartScale * 1.12, 0.3),
      new THREE.MeshPhongMaterial({ color: 0xffc93a, specular: 0xffffff, shininess: 140 })
    );
    rim.position.set(0, topY, -heartScale * 0.06);
    wand.add(rim);
  }

  const bowY = stickLen - 0.02;
  const bowMat = new THREE.MeshPhongMaterial({ color: 0x2e86e0, specular: 0xaaddff, shininess: 70 });
  const bowMat2 = new THREE.MeshPhongMaterial({ color: 0x55b5ff, specular: 0xaaddff, shininess: 70 });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), bowMat);
  knot.position.y = bowY;
  wand.add(knot);
  for (const s of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), bowMat);
    lobe.scale.set(1.25, 0.62, 0.45);
    lobe.position.set(s * 0.085, bowY + 0.015, 0);
    lobe.rotation.z = s * 0.5;
    wand.add(lobe);
  }
  const ribbonMat = tier >= 4 ? new THREE.MeshPhongMaterial({ color: 0xffc93a, specular: 0xffffff, shininess: 100 }) : bowMat2;
  for (const s of [-1, 1]) {
    const pts = [
      new THREE.Vector3(s * 0.02, bowY - 0.02, 0.01),
      new THREE.Vector3(s * 0.07, bowY - 0.14, 0.03),
      new THREE.Vector3(s * 0.05, bowY - 0.28, 0.02),
      new THREE.Vector3(s * 0.13, bowY - 0.42, 0.01),
      new THREE.Vector3(s * 0.24, bowY - 0.5, -0.02),
    ];
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.014, 6), ribbonMat);
    wand.add(tube);
  }

  const beadMat = new THREE.MeshPhongMaterial({ color: 0xffb830, specular: 0xffffff, shininess: 150 });
  const beadCount = Math.min(2 + (tier - 1), 5);
  for (let i = 0; i < beadCount; i++) {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.028 - i * 0.002, 10, 8), beadMat);
    bead.position.y = bowY - 0.09 - i * 0.09;
    wand.add(bead);
  }

  if (tier >= 3) {
    const n = tier >= 5 ? 26 : 14;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: starTexGold, size: 0.05, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffe89a,
    }));
    pts.userData = { n, topY, radius: heartScale * 1.6 };
    wand.add(pts);
    equipCtx.sparkles = pts;
  }

  if (tier >= 4) {
    const starCount = tier >= 5 ? 6 : 4;
    for (let i = 0; i < starCount; i++) {
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexGold, transparent: true, depthWrite: false }));
      star.scale.setScalar(0.07);
      star.userData = { angle: (i / starCount) * Math.PI * 2, topY, radius: heartScale * 1.5 };
      wand.add(star);
      equipCtx.orbiters.push(star);
    }
  }

  if (tier >= 5) {
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexGold, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    aura.scale.setScalar(heartScale * 4);
    aura.position.y = topY;
    wand.add(aura);
    const light = new THREE.PointLight(0xff70b0, 1.2, 3);
    light.position.y = topY;
    wand.add(light);
    equipCtx.auraLight = light;
  }

  equipCtx.basePos.set(0.62, -0.62, -1.35);
  equipCtx.baseRot.set(0.35, -0.25, -0.35);
  equipCtx.tipLocal.set(0, topY, 0); // ビームはハートから出る
}

// --- 水鉄砲 ---
function buildWaterGun() {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.34), new THREE.MeshPhongMaterial({ color: 0x3ecf5a, shininess: 80 }));
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.2, 10), new THREE.MeshPhongMaterial({ color: 0xff9a2e, shininess: 80 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.26);
  g.add(barrel);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshPhongMaterial({ color: 0x59c9ff, shininess: 100, transparent: true, opacity: 0.8 }));
  tank.position.set(0, 0.13, 0.06);
  g.add(tank);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.09), new THREE.MeshPhongMaterial({ color: 0x2aa845, shininess: 60 }));
  grip.position.set(0, -0.13, 0.1);
  grip.rotation.x = 0.25;
  g.add(grip);
  addMuzzleFlash(g, new THREE.Vector3(0, 0.02, -0.38), glowTexBlue, 0.22);
  equipCtx.basePos.set(0.5, -0.48, -1.1);
  equipCtx.baseRot.set(0.05, -0.15, 0);
}

// --- ハリセン ---
function buildHarisen() {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.85, side: THREE.DoubleSide });
  // 蛇腹の扇部分：薄い板を扇状に
  for (let i = 0; i < 7; i++) {
    const a = -0.45 + (i / 6) * 0.9;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.008), paperMat);
    blade.position.set(Math.sin(a) * 0.28, 0.42 + Math.cos(a) * 0.14, (i % 2) * 0.012);
    blade.rotation.z = -a;
    g.add(blade);
  }
  // 持ち手（赤テープ巻き）
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xd42a4a, roughness: 0.6 }));
  handle.position.y = 0.02;
  g.add(handle);
  equipCtx.basePos.set(0.62, -0.62, -1.3);
  equipCtx.baseRot.set(0.35, -0.25, -0.35);
}

// --- バット（釘オプション付き） ---
function buildBat(nails) {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const wood = new THREE.MeshStandardMaterial({ color: 0xc98d4e, roughness: 0.55 });
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.028, 0.8, 14), wood);
  bat.position.y = 0.42;
  g.add(bat);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), wood);
  knob.position.y = 0.01;
  g.add(knob);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), wood);
  tip.position.y = 0.82;
  g.add(tip);
  if (nails) {
    const nailMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 10; i++) {
      const nail = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.13, 6), nailMat);
      const a = (i / 10) * Math.PI * 2 + i * 0.7;
      const y = 0.5 + (i % 5) * 0.075;
      nail.position.set(Math.cos(a) * 0.06, y, Math.sin(a) * 0.06);
      nail.rotation.z = -Math.cos(a) * 1.4;
      nail.rotation.x = Math.sin(a) * 1.4;
      g.add(nail);
    }
  }
  equipCtx.basePos.set(0.62, -0.66, -1.35);
  equipCtx.baseRot.set(0.35, -0.25, -0.35);
}

// --- 刀 ---
function buildKatana() {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.24, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a55, roughness: 0.6 }));
  handle.position.y = 0.12;
  g.add(handle);
  const tsuba = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 20), new THREE.MeshPhongMaterial({ color: 0xd4af37, specular: 0xffffff, shininess: 120 }));
  tsuba.rotation.x = Math.PI / 2;
  tsuba.position.y = 0.25;
  g.add(tsuba);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.78, 0.012), new THREE.MeshPhongMaterial({ color: 0xdfe8f2, specular: 0xffffff, shininess: 200 }));
  blade.position.y = 0.65;
  blade.rotation.z = 0.05;
  g.add(blade);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.78, 0.014), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  edge.position.set(-0.014, 0.65, 0);
  edge.rotation.z = 0.05;
  g.add(edge);
  equipCtx.basePos.set(0.62, -0.66, -1.35);
  equipCtx.baseRot.set(0.35, -0.25, -0.35);
}

// --- チェンソー ---
function buildChainsaw() {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.17, 0.16), new THREE.MeshPhongMaterial({ color: 0xff7a1a, shininess: 70 }));
  g.add(body);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.17), new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.5 }));
  engine.position.set(0, -0.1, 0);
  g.add(engine);
  // バー（上に伸びる刃）
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.62, 0.1), new THREE.MeshStandardMaterial({ color: 0x8a909a, metalness: 0.8, roughness: 0.35 }));
  bar.position.set(0, 0.38, 0);
  g.add(bar);
  // チェーンの刃
  const toothMat = new THREE.MeshStandardMaterial({ color: 0x30323a, metalness: 0.7, roughness: 0.4 });
  for (let i = 0; i < 8; i++) {
    for (const s of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.025), toothMat);
      tooth.position.set(0, 0.14 + i * 0.068, s * 0.06);
      g.add(tooth);
    }
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 18, Math.PI), new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6 }));
  handle.position.set(0, 0.02, 0.14);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  equipCtx.basePos.set(0.6, -0.6, -1.25);
  equipCtx.baseRot.set(0.3, -0.3, -0.2);
}

// --- 毒ガス噴霧器 ---
function buildPoisonSprayer() {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 16), new THREE.MeshPhongMaterial({ color: 0x4a9a2a, shininess: 60 }));
  g.add(tank);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }));
  cap.position.y = 0.18;
  g.add(cap);
  // ドクロマーク
  const sc = document.createElement('canvas');
  sc.width = sc.height = 64;
  const sg = sc.getContext('2d');
  sg.font = '44px sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText('☠', 32, 34);
  const skullTex = new THREE.CanvasTexture(sc);
  skullTex.colorSpace = THREE.SRGBColorSpace;
  const skull = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: skullTex, transparent: true }));
  skull.position.set(0, 0.01, 0.092);
  g.add(skull);
  // ノズル
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }));
  hose.rotation.x = Math.PI / 2 - 0.35;
  hose.position.set(0, 0.14, -0.15);
  g.add(hose);
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5 }));
  nozzle.rotation.x = -(Math.PI / 2 - 0.35);
  nozzle.position.set(0, 0.19, -0.3);
  g.add(nozzle);
  addMuzzleFlash(g, new THREE.Vector3(0, 0.21, -0.36), glowTexGreen, 0.3);
  equipCtx.basePos.set(0.55, -0.55, -1.2);
  equipCtx.baseRot.set(0.1, -0.2, -0.1);
}

// --- 銃 ---
function buildGun() {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2e3138, metalness: 0.85, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.4), metal);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 10), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.3);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.08), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.6 }));
  grip.position.set(0, -0.12, 0.13);
  grip.rotation.x = 0.3;
  g.add(grip);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), metal);
  mag.position.set(0, -0.11, -0.02);
  g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), metal);
  sight.position.set(0, 0.065, -0.1);
  g.add(sight);
  addMuzzleFlash(g, new THREE.Vector3(0, 0.02, -0.44), glowTexOrange, 0.3);
  equipCtx.basePos.set(0.5, -0.45, -1.05);
  equipCtx.baseRot.set(0.02, -0.12, 0);
}

// --- 無限グレネードランチャー ---
function buildGrenadeLauncher() {
  const g = new THREE.Group();
  weaponRoot.add(g);
  const olive = new THREE.MeshStandardMaterial({ color: 0x5a6b3a, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d24, roughness: 0.5 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 16), olive);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.03, -0.15);
  g.add(tube);
  const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 18), dark);
  muzzleRing.position.set(0, 0.03, -0.4);
  g.add(muzzleRing);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 16), dark);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0, -0.06, 0.12);
  g.add(drum);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark);
  grip.position.set(0, -0.16, 0.26);
  grip.rotation.x = 0.3;
  g.add(grip);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.16), olive);
  stock.position.set(0, 0.02, 0.24);
  g.add(stock);
  // ∞マーク
  const ic = document.createElement('canvas');
  ic.width = 64; ic.height = 32;
  const ig = ic.getContext('2d');
  ig.font = 'bold 26px sans-serif'; ig.fillStyle = '#ffe14d'; ig.textAlign = 'center'; ig.textBaseline = 'middle';
  ig.fillText('∞', 32, 16);
  const infTex = new THREE.CanvasTexture(ic);
  infTex.colorSpace = THREE.SRGBColorSpace;
  const inf = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: infTex, transparent: true }));
  inf.position.set(0.078, -0.06, 0.12);
  inf.rotation.y = Math.PI / 2;
  g.add(inf);
  addMuzzleFlash(g, new THREE.Vector3(0, 0.03, -0.48), glowTexOrange, 0.5);
  equipCtx.basePos.set(0.55, -0.5, -1.15);
  equipCtx.baseRot.set(0.05, -0.15, 0);
}

function addMuzzleFlash(group, pos, tex, size) {
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
  }));
  flash.scale.setScalar(size);
  flash.position.copy(pos);
  group.add(flash);
  equipCtx.flash = flash;
}

// ---------- ペットの3Dモデルと自動攻撃 ----------
const petCtx = { dog: null, cat: null };

function buildPetModel(id) {
  const g = new THREE.Group();
  if (id === 'dog') {
    const fur = new THREE.MeshStandardMaterial({ color: 0xd99a5b, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), fur);
    body.scale.set(1.1, 0.85, 1.6);
    body.position.y = 0.28;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), fur);
    head.position.set(0, 0.48, 0.3);
    g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: 0xf5e8d5, roughness: 0.8 }));
    snout.position.set(0, 0.44, 0.43);
    g.add(snout);
    const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    noseTip.position.set(0, 0.46, 0.5);
    g.add(noseTip);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 8), fur);
      ear.position.set(s * 0.09, 0.63, 0.26);
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      eye.position.set(s * 0.06, 0.52, 0.43);
      g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 8), fur);
    tail.position.set(0, 0.44, -0.32);
    tail.rotation.x = -0.9;
    tail.name = 'tail';
    g.add(tail);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8), fur);
      leg.position.set(sx * 0.1, 0.09, sz * 0.2);
      g.add(leg);
    }
    g.position.set(-1.7, 0, 0.9);
  } else {
    const fur = new THREE.MeshStandardMaterial({ color: 0x9aa0ac, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), fur);
    body.scale.set(1, 0.85, 1.55);
    body.position.y = 0.24;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), fur);
    head.position.set(0, 0.42, 0.26);
    g.add(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), fur);
      ear.position.set(s * 0.08, 0.56, 0.24);
      ear.rotation.y = Math.PI / 4;
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2fa050 }));
      eye.position.set(s * 0.05, 0.45, 0.37);
      g.add(eye);
    }
    const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd06a7a }));
    noseTip.position.set(0, 0.41, 0.39);
    g.add(noseTip);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.36, 8), fur);
    tail.position.set(0.06, 0.42, -0.3);
    tail.rotation.x = -0.7;
    tail.rotation.z = -0.3;
    tail.name = 'tail';
    g.add(tail);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 8), fur);
      leg.position.set(sx * 0.08, 0.08, sz * 0.17);
      g.add(leg);
    }
    g.position.set(1.7, 0, 0.7);
  }
  g.lookAt(0, 0.3, 0);
  scene.add(g);
  return g;
}

function refreshPets() {
  for (const id of PET_IDS) {
    if (state.pets[id].owned && !petCtx[id]) {
      petCtx[id] = {
        group: buildPetModel(id),
        rest: null,
        timer: 0.5 + Math.random(),
        anim: -1,
        hitDone: false,
        target: new THREE.Vector3(),
        phase: Math.random() * 6,
      };
      petCtx[id].rest = petCtx[id].group.position.clone();
    }
  }
}

const _petPos = new THREE.Vector3();
function petHit(id) {
  const dmgV = petDmg(id);
  gainFromDamage(dmgV, { useCombo: false });
  ojisan.getWorldPosition(_petPos);
  _petPos.y -= 1.6;
  _petPos.x += (Math.random() - 0.5) * 0.4;
  spawnDamageNumber(_petPos, dmgV, {});
  spawnBurst(_petPos, 3, false);
  if (state.r18On) spawnBlood(_petPos, 4);
  squash = Math.max(squash, 0.5);
  pend.vz += (Math.random() - 0.5) * 0.8;
  pend.vx -= 0.3;
  if (Math.random() < 0.35) playWeaponSound(id === 'dog' ? 'bark' : 'meow', 0);
  if (Math.random() < 0.3) setFace('ouch', 0.3);
  updateHUD();
}

function updatePets(dt) {
  for (const id of PET_IDS) {
    const p = petCtx[id];
    if (!p || !state.pets[id].owned) continue;
    const tail = p.group.getObjectByName('tail');
    if (tail) tail.rotation.z = Math.sin(state.time * 6 + p.phase) * 0.3 - (id === 'cat' ? 0.3 : 0);
    if (!state.started) continue;
    if (p.anim < 0) {
      // 待機：ぴょこぴょこ
      p.group.position.y = p.rest.y + Math.abs(Math.sin(state.time * 3 + p.phase)) * 0.04;
      p.timer -= dt;
      if (p.timer <= 0) {
        p.anim = 0;
        p.hitDone = false;
        ojisan.getWorldPosition(p.target);
        p.target.y -= 2.0;
        p.target.z += 0.3;
      }
    } else {
      // 飛びかかり攻撃
      p.anim += dt / 0.5;
      if (p.anim >= 1) {
        p.anim = -1;
        p.timer = 1 / PETS[id].rate;
        p.group.position.copy(p.rest);
        p.group.lookAt(0, 0.3, 0);
      } else {
        const k = p.anim < 0.5 ? p.anim * 2 : (1 - p.anim) * 2;
        p.group.position.lerpVectors(p.rest, p.target, k);
        p.group.position.y += Math.sin(k * Math.PI) * 0.35 + k * 0;
        p.group.rotation.z = Math.sin(p.anim * Math.PI * 2) * 0.3;
        if (!p.hitDone && p.anim >= 0.5) {
          p.hitDone = true;
          petHit(id);
        }
      }
    }
  }
}

function buildEquipped() {
  clearWeaponModel();
  const id = state.equipped;
  equipCtx.id = id;
  equipCtx.anim = weaponById(id).anim;
  stopSawSound();
  if (id === 'wand') buildWand(wandTier());
  else if (id === 'watergun') buildWaterGun();
  else if (id === 'harisen') buildHarisen();
  else if (id === 'bat') buildBat(false);
  else if (id === 'nailbat') buildBat(true);
  else if (id === 'katana') buildKatana();
  else if (id === 'chainsaw') buildChainsaw();
  else if (id === 'poison') buildPoisonSprayer();
  else if (id === 'gun') buildGun();
  else if (id === 'grenade') buildGrenadeLauncher();
  weaponRoot.position.copy(equipCtx.basePos);
  weaponRoot.rotation.copy(equipCtx.baseRot);
}
buildEquipped();
refreshPets();
applyR18Visual();

// ---------- HUD ----------
const el = {
  score: document.getElementById('score-value'),
  money: document.getElementById('money-value'),
  level: document.getElementById('level-badge'),
  xpFill: document.getElementById('xp-fill'),
  weapon: document.getElementById('stat-weapon'),
  atk: document.getElementById('stat-atk'),
  spd: document.getElementById('stat-spd'),
  comboBox: document.getElementById('combo-box'),
  comboNum: document.getElementById('combo-num'),
  banner: document.getElementById('levelup-banner'),
  bannerSub: document.getElementById('levelup-sub'),
  poisonInd: document.getElementById('poison-ind'),
  poisonTime: document.getElementById('poison-time'),
  shopPanel: document.getElementById('shop-panel'),
  shopList: document.getElementById('shop-list'),
  shopMoney: document.getElementById('shop-money'),
};

// 18禁モード用の赤いビネット（たたくたび画面端が赤く光る）
const goreVignette = document.createElement('div');
goreVignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(160,10,25,0.6) 100%);';
document.body.appendChild(goreVignette);

function updateHUD() {
  el.score.textContent = fmt(state.score);
  el.money.textContent = fmt(state.money);
  el.level.textContent = `Lv.${state.level.toLocaleString()}`;
  el.xpFill.style.width = `${Math.min(100, (state.xp / xpNeed(state.level)) * 100)}%`;
  el.weapon.textContent = weaponById(state.equipped).name + (state.equipped === 'wand' && state.wandUp > 0 ? ` +${state.wandUp}` : '') + (beamActive() ? '🔞ビーム' : '');
  el.atk.textContent = fmt(weaponDmg(state.equipped));
  el.spd.textContent = (beamActive() ? Math.max(10, wandRate()) : weaponRate(state.equipped)).toFixed(1);
  el.shopMoney.textContent = '💰' + fmt(state.money);
}
updateHUD();

// ---------- サウンド ----------
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function noiseBurst(dur, filterType, freq, gain, freqEnd) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const f = audioCtx.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = 1.5;
  const g = audioCtx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start(t);
}

function toneDrop(freqStart, freqEnd, dur, gain, type = 'sine') {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freqStart, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function playWeaponSound(sound, combo) {
  if (!audioCtx) return;
  switch (sound) {
    case 'hit':
      toneDrop(300 + Math.min(combo, 20) * 14, 110, 0.13, 0.32);
      noiseBurst(0.06, 'highpass', 1200, 0.16);
      break;
    case 'water':
      noiseBurst(0.12, 'bandpass', 900, 0.22, 300);
      toneDrop(700, 250, 0.1, 0.08);
      break;
    case 'slap':
      noiseBurst(0.05, 'highpass', 2200, 0.35);
      toneDrop(500, 200, 0.07, 0.2, 'triangle');
      break;
    case 'slash':
      noiseBurst(0.14, 'bandpass', 3500, 0.2, 900);
      break;
    case 'saw':
      toneDrop(180 + Math.random() * 60, 90, 0.1, 0.12, 'sawtooth');
      noiseBurst(0.06, 'lowpass', 800, 0.1);
      break;
    case 'spray':
      noiseBurst(0.3, 'lowpass', 1500, 0.18, 500);
      break;
    case 'gun':
      noiseBurst(0.05, 'highpass', 900, 0.4);
      toneDrop(240, 60, 0.09, 0.3, 'square');
      break;
    case 'boom':
      toneDrop(140, 28, 0.5, 0.5);
      noiseBurst(0.4, 'lowpass', 500, 0.4, 80);
      break;
    case 'tick':
      toneDrop(600, 350, 0.05, 0.05, 'triangle');
      break;
    case 'squish':
      noiseBurst(0.12, 'lowpass', 380, 0.28, 110);
      toneDrop(150, 45, 0.12, 0.22);
      break;
    case 'beam':
      toneDrop(950 + Math.random() * 250, 480, 0.07, 0.08, 'sawtooth');
      break;
    case 'bark':
      toneDrop(480, 170, 0.09, 0.22, 'square');
      noiseBurst(0.04, 'bandpass', 800, 0.12);
      break;
    case 'meow':
      toneDrop(850, 520, 0.2, 0.1, 'triangle');
      break;
  }
}

function playSwing() {
  noiseBurst(0.1, 'bandpass', 900, 0.08, 2400);
}

function playCoin() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [987.77, 1318.5].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.001, t + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.07 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.2);
    o.connect(g).connect(audioCtx.destination);
    o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.25);
  });
}

function playLevelUp() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
    o.connect(g).connect(audioCtx.destination);
    o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
  });
}

// チェンソーの持続音
function startSawSound() {
  if (!audioCtx || sawNodes) return;
  const o = audioCtx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 110;
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 22;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 30;
  lfo.connect(lfoGain).connect(o.frequency);
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g = audioCtx.createGain();
  g.gain.value = 0.07;
  o.connect(f).connect(g).connect(audioCtx.destination);
  o.start(); lfo.start();
  sawNodes = { o, lfo, g };
}
function stopSawSound() {
  if (!sawNodes) return;
  try { sawNodes.o.stop(); sawNodes.lfo.stop(); } catch (e) {}
  sawNodes = null;
}

// ---------- パーティクル＆ダメージ数字 ----------
const particles = [];
const MAX_PARTICLES = 260;

function spawnBurst(worldPos, count, big, style) {
  if (particles.length > MAX_PARTICLES) return;
  for (let i = 0; i < count; i++) {
    let tex, blend = THREE.NormalBlending;
    if (style === 'water') { tex = glowTexBlue; blend = THREE.AdditiveBlending; }
    else if (style === 'poison') { tex = glowTexGreen; blend = THREE.AdditiveBlending; }
    else if (style === 'explosion') { tex = Math.random() < 0.6 ? glowTexOrange : glowTexWhite; blend = THREE.AdditiveBlending; }
    else if (style === 'slash') { tex = Math.random() < 0.5 ? glowTexWhite : heartTexRed; blend = THREE.AdditiveBlending; }
    else if (style === 'gun') { tex = Math.random() < 0.4 ? glowTexOrange : starTexGold; blend = THREE.AdditiveBlending; }
    else tex = Math.random() < 0.3 ? starTexGold : (Math.random() < 0.5 ? heartTexPink : heartTexRed);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: blend }));
    const size = (big ? 0.32 : 0.2) * (0.7 + Math.random() * 0.7) * (style === 'explosion' ? 1.8 : 1);
    spr.scale.setScalar(size);
    spr.position.copy(worldPos);
    spr.position.x += (Math.random() - 0.5) * 0.6;
    spr.position.y += (Math.random() - 0.5) * 0.6;
    const v = new THREE.Vector3(
      (Math.random() - 0.5) * 4.5,
      Math.random() * 4 + 1.5,
      (Math.random() - 0.5) * 3 + 1
    );
    scene.add(spr);
    particles.push({ obj: spr, vel: v, life: 1, decay: 1.1 + Math.random() * 0.6, grav: style === 'poison' ? -1 : 9 });
  }
}

// ---- 血しぶきと床の血だまり（18禁モード） ----
const stains = [];
const stainGeo = new THREE.PlaneGeometry(1, 1);
function addStain(x, z) {
  if (stains.length >= 50) {
    const old = stains.shift();
    scene.remove(old.m);
    old.m.material.dispose();
  }
  const m = new THREE.Mesh(stainGeo, new THREE.MeshBasicMaterial({
    map: stainTex, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI * 2;
  const s = 0.3 + Math.random() * 0.55;
  m.scale.set(s, s, 1);
  m.position.set(x + (Math.random() - 0.5) * 0.3, 0.012 + Math.random() * 0.004, z + (Math.random() - 0.5) * 0.3);
  scene.add(m);
  stains.push({ m, life: 30 });
}
function updateStains(dt) {
  for (let i = stains.length - 1; i >= 0; i--) {
    const s = stains[i];
    s.life -= dt;
    s.m.material.opacity = Math.min(0.8, s.life / 8);
    if (s.life <= 0) {
      scene.remove(s.m);
      s.m.material.dispose();
      stains.splice(i, 1);
    }
  }
}

function spawnBlood(worldPos, count) {
  if (particles.length > MAX_PARTICLES) return;
  for (let i = 0; i < count; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: bloodTex, transparent: true, depthWrite: false }));
    spr.scale.setScalar(0.1 + Math.random() * 0.18);
    spr.position.copy(worldPos);
    spr.position.x += (Math.random() - 0.5) * 0.5;
    spr.position.y += (Math.random() - 0.5) * 0.5;
    scene.add(spr);
    particles.push({
      obj: spr,
      vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3.5 + 0.5, (Math.random() - 0.5) * 3 + 1.2),
      life: 1, decay: 0.45, grav: 13, isBlood: true,
    });
  }
}

// たたいた瞬間のインパクト閃光（一瞬で拡大して消える）
function spawnImpact(worldPos, big) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: impactTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, rotation: Math.random() * Math.PI,
  }));
  spr.scale.setScalar(big ? 0.6 : 0.4);
  spr.position.copy(worldPos);
  scene.add(spr);
  particles.push({
    obj: spr, vel: new THREE.Vector3(0, 0, 0),
    life: 1, decay: 5.5, grav: 0, grow: big ? 7 : 4.5,
  });
}

function spawnConfetti() {
  if (particles.length > MAX_PARTICLES) return;
  const cols = [0xff5f8f, 0xffd94d, 0x59c9ff, 0x8dff8d, 0xd08bff, 0xffa64d];
  for (let i = 0; i < 50; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 0.14),
      new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide })
    );
    m.position.set((Math.random() - 0.5) * 8, 6.5 + Math.random() * 2, (Math.random() - 0.5) * 3);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(m);
    particles.push({
      obj: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, -0.8 - Math.random(), (Math.random() - 0.5) * 1.5),
      life: 1, decay: 0.22, grav: 0.6,
      spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
    });
  }
}

function spawnDamageNumber(worldPos, value, opts = {}) {
  if (particles.length > MAX_PARTICLES) return;
  const c = document.createElement('canvas');
  c.width = 320; c.height = 128;
  const g = c.getContext('2d');
  g.font = `900 ${opts.big ? 78 : 62}px 'Arial Black', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = opts.color === 'green' ? '#1a4a10' : opts.color === 'orange' ? '#6a2400' : '#7a1f42';
  g.strokeText(`+${fmt(value)}`, 160, 64);
  g.fillStyle = opts.color === 'green' ? '#8aff5a' : opts.color === 'orange' ? '#ffb347' : (opts.big ? '#ffe14d' : '#ffffff');
  g.fillText(`+${fmt(value)}`, 160, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(1.4, 0.56, 1);
  spr.position.copy(worldPos);
  spr.position.x += (Math.random() - 0.5) * 0.8;
  spr.position.y += 0.3;
  scene.add(spr);
  particles.push({ obj: spr, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.8, 0), life: 1, decay: 1.2, grav: -1.5 });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay * dt;
    // 血しぶきは床に落ちたら血だまりになる
    if (p.isBlood && p.obj.position.y <= 0.04) {
      if (Math.random() < 0.6) addStain(p.obj.position.x, p.obj.position.z);
      p.life = 0;
    }
    if (p.life <= 0 || p.obj.position.y < -0.5) {
      scene.remove(p.obj);
      p.obj.material.map?.dispose?.();
      p.obj.material.dispose();
      p.obj.geometry?.dispose?.();
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= p.grav * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    if (p.grow) p.obj.scale.addScalar(p.grow * dt);
    if (p.spin) {
      p.obj.rotation.x += p.spin.x * dt;
      p.obj.rotation.y += p.spin.y * dt;
      p.obj.rotation.z += p.spin.z * dt;
    }
    p.obj.material.opacity = Math.min(1, p.life * 2);
  }
}

// ---------- 攻撃処理 ----------
const targetPos = new THREE.Vector3();

// スコア・マネー・XPの共通加算（毒のスリップダメージもここを通る）
function gainFromDamage(dmg, opts = {}) {
  const comboMult = opts.useCombo ? 1 + Math.min(state.combo - 1, 50) * 0.1 : 1;
  const gained = Math.max(1, Math.round(dmg * comboMult));
  state.score += gained;
  state.money += gained;
  state.xp += gained;
  while (state.xp >= xpNeed(state.level)) {
    state.xp -= xpNeed(state.level);
    if (state.pendingLevels === 0) state.levelFrom = state.level;
    state.level += 1;
    state.pendingLevels += 1;
  }
  return gained;
}

function applyHit(opts = {}) {
  const w = weaponById(state.equipped);
  state.combo += 1;
  state.comboTimer = 2.0;
  const gained = gainFromDamage(weaponDmg(state.equipped), { useCombo: true });
  ropeSpring.v += 0.5 + Math.random() * 0.5; // ロープがビヨンと伸びる

  // おじさんのリアクション
  if (state.equipped === 'grenade') {
    setFace('shock', 0.6);
  } else {
    const faces = ['ouch', 'ouch', 'dizzy', 'shock'];
    setFace(faces[Math.floor(Math.random() * faces.length)], 0.45);
  }
  const power = Math.min(3, 1.2 + Math.log10(weaponDmg(state.equipped) + 1) * 0.35);
  pend.vx -= (0.8 + Math.random() * 0.8) * power;
  pend.vz += (Math.random() - 0.5) * 1.6 * power;
  pend.spinV += (Math.random() - 0.5) * 1.4; // 回りすぎて顔が見えなくならない程度に
  squash = 1;

  // たたいてる感：ヒットストップ＋赤フラッシュ＋カメラパンチ
  state.flash = 1;
  state.punch = 1;
  state.hitStop = state.equipped === 'grenade' ? 0.1 : (w.anim === 'swing' ? 0.05 : 0.025);

  // 演出（エフェクトはおじさんの前面＝たたいた場所に出す）
  ojisan.getWorldPosition(targetPos);
  targetPos.y += 0.2;
  targetPos.z += 0.45;
  const style = opts.beam ? 'beam' : w.burst;
  const big = state.combo >= 10 || state.equipped === 'grenade';
  spawnImpact(targetPos, big);
  spawnBurst(targetPos, Math.min(6 + state.combo, 14), big, style);
  spawnDamageNumber(targetPos, gained, {
    big,
    color: style === 'explosion' ? 'orange' : undefined,
  });
  state.shake = state.equipped === 'grenade'
    ? 0.55
    : Math.min(0.5, 0.18 + state.combo * 0.008);
  playWeaponSound(opts.beam ? 'beam' : w.sound, state.combo);

  // 18禁モード：血しぶき＆生々しい打撃音
  if (state.r18On) {
    spawnBlood(targetPos, Math.min(5 + Math.floor(state.combo / 2), 12));
    playWeaponSound('squish', 0);
  }

  // マズルフラッシュ
  if (equipCtx.flash) equipCtx.flashTimer = 0.08;

  // 毒ガス：スリップダメージを付与（15秒 / 秒間7回）
  if (state.equipped === 'poison') {
    state.poison = { t: 15, tickTimer: 0, dmg: weaponDmg('poison') };
    setFace('sick', 1.0);
  }

  if (state.combo >= 2) {
    el.comboNum.textContent = state.combo.toLocaleString();
    el.comboBox.classList.add('show');
  }
  updateHUD();
}

// 毒のスリップダメージ（1ティック）
function poisonTick() {
  const gained = gainFromDamage(state.poison.dmg, { useCombo: false });
  ojisan.getWorldPosition(targetPos);
  targetPos.y += 0.2;
  spawnDamageNumber(targetPos, gained, { color: 'green' });
  if (Math.random() < 0.3) spawnBurst(targetPos, 2, false, 'poison');
  if (Math.random() < 0.15) playWeaponSound('tick', 0);
  pend.vz += (Math.random() - 0.5) * 0.3;
  if (currentFace === 'normal') setFace('sick', 0.6);
}

// レベルアップ演出（連続レベルアップはまとめて表示）
function flushLevelUps() {
  if (state.pendingLevels === 0) return;
  if (state.time - state.lastLevelFx < 1.2) return;
  state.lastLevelFx = state.time;

  const from = state.levelFrom, to = state.level;
  state.pendingLevels = 0;

  setFace('happy', 1.0);
  spawnConfetti();
  playLevelUp();

  // 新武器のレベル解放チェック
  const unlocked = WEAPONS.filter(w => w.lvReq > 0 && w.lvReq > from && w.lvReq <= to);

  el.banner.classList.remove('pop');
  el.bannerSub.classList.remove('pop');
  void el.banner.offsetWidth;
  el.banner.textContent = to - from > 1 ? `LEVEL UP! Lv.${from.toLocaleString()} → Lv.${to.toLocaleString()}` : `LEVEL UP! Lv.${to.toLocaleString()}`;
  el.bannerSub.innerHTML =
    `攻撃力ボーナス <b style="color:#ffe14d">+${((to - 1) * 5).toLocaleString()}%</b>` +
    (unlocked.length ? `<br>🔓 <b style="color:#ff8fc0">ショップに新武器が登場！</b>` : '');
  el.banner.classList.add('pop');
  el.bannerSub.classList.add('pop');

  if (unlocked.length && el.shopPanel.classList.contains('open')) renderShop();
  updateHUD();
}

// ---------- 攻撃入力 ----------
function weaponReady() {
  return state.started && !state.swinging && state.cooldown <= 0;
}

function performAttack() {
  const w = weaponById(state.equipped);
  // 18禁モードのハートの杖はビーム化：秒間10発以上・長押し可能
  if (beamActive()) {
    const rate = Math.max(10, wandRate());
    state.cooldown = 1 / rate;
    beamTimer = 0.14;
    applyHit({ beam: true });
    return;
  }
  const rate = weaponRate(state.equipped);
  state.cooldown = 1 / rate;
  state.swinging = true;
  state.swingT = 0;
  state.hitDone = false;
  state.swingDur = Math.min(0.24, Math.max(0.08, (1 / rate) * 0.85));
  if (w.anim === 'swing') {
    playSwing(); // 振りかぶるタイプはヒットを少し遅らせる
  } else {
    state.hitDone = true;
    applyHit();
  }
}

function tryAttack() {
  if (weaponReady()) performAttack();
}

canvas.addEventListener('pointerdown', () => { state.holding = true; tryAttack(); });
window.addEventListener('pointerup', () => { state.holding = false; });
window.addEventListener('blur', () => { state.holding = false; });
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) { state.holding = true; tryAttack(); }
  } else if (e.code === 'KeyS') {
    toggleShop();
  } else if (e.code === 'Escape') {
    el.shopPanel.classList.remove('open');
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space') state.holding = false;
});

// ---------- ショップ ----------
function toggleShop() {
  el.shopPanel.classList.toggle('open');
  if (el.shopPanel.classList.contains('open')) renderShop();
}
document.getElementById('shop-btn').addEventListener('click', toggleShop);
document.getElementById('shop-close').addEventListener('click', toggleShop);
// ショップ内クリックで攻撃が出ないように
el.shopPanel.addEventListener('pointerdown', e => e.stopPropagation());

function shopRow(w) {
  const st = state.weapons[w.id];
  const row = document.createElement('div');
  row.className = 'shop-item';
  const lvLocked = w.lvReq > 0 && state.level < w.lvReq;

  let icon, name, stats, desc, btnHTML, btnClass = '', disabled = false, action = null;
  let extraBtn = null; // 2つ目のボタン（杖の装備用）

  if (w.id === 'wand') {
    // ハートの杖：無限強化＋装備
    icon = w.icon;
    name = `${w.name} ${state.wandUp > 0 ? `+${state.wandUp}` : ''}`;
    stats = `攻撃力 ${fmt(weaponDmg('wand'))} ・ 秒間${wandRate().toFixed(1)}発`;
    desc = w.desc;
    const cost = wandCost();
    btnHTML = `∞ 強化<span class="cost">💰${fmt(cost)}</span>`;
    disabled = state.money < cost;
    action = () => {
      if (state.money < wandCost()) return;
      state.money -= wandCost();
      state.wandUp += 1;
      if (state.equipped === 'wand') buildEquipped();
      playCoin();
      save(); renderShop(); updateHUD();
    };
    if (state.equipped === 'wand') {
      row.classList.add('equipped');
    } else {
      // 他の武器を装備中でも杖に持ち替えられるように
      extraBtn = document.createElement('button');
      extraBtn.className = 'shop-action equip';
      extraBtn.textContent = '装備する';
      extraBtn.addEventListener('click', () => {
        state.equipped = 'wand';
        buildEquipped();
        save(); renderShop(); updateHUD();
      });
    }
  } else if (lvLocked) {
    // レベル未達：完全シークレット
    row.classList.add('secret');
    icon = '🔒';
    name = '？？？';
    stats = '？？？';
    desc = 'レベルを上げると解放される…';
    btnHTML = `Lv.${w.lvReq.toLocaleString()}で解放`;
    disabled = true;
  } else if (st === 'secret') {
    // シークレット：マネーで開放
    row.classList.add('secret');
    icon = '❓';
    name = '？？？';
    stats = '？？？';
    desc = '開放すると正体がわかる';
    btnHTML = `開放する<span class="cost">💰${fmt(w.unlockCost)}</span>`;
    disabled = state.money < w.unlockCost;
    action = () => {
      if (state.money < w.unlockCost) return;
      state.money -= w.unlockCost;
      state.weapons[w.id] = 'unlocked';
      playCoin();
      save(); renderShop(); updateHUD();
    };
  } else if (st === 'unlocked') {
    icon = w.icon;
    name = w.name;
    stats = `攻撃力 ${fmt(weaponDmg(w.id))} ・ 秒間${w.rate}発`;
    desc = w.desc + (w.hold ? '（長押しOK）' : '');
    btnHTML = `購入<span class="cost">💰${fmt(w.price)}</span>`;
    btnClass = 'buy';
    disabled = state.money < w.price;
    action = () => {
      if (state.money < w.price) return;
      state.money -= w.price;
      state.weapons[w.id] = 'owned';
      playCoin();
      save(); renderShop(); updateHUD();
    };
  } else {
    // 所持済み
    icon = w.icon;
    name = w.name;
    stats = `攻撃力 ${fmt(weaponDmg(w.id))} ・ 秒間${w.rate}発`;
    desc = w.desc + (w.hold ? '（長押しOK）' : '');
    if (state.equipped === w.id) {
      row.classList.add('equipped');
      btnHTML = '装備中';
      disabled = true;
    } else {
      btnHTML = '装備する';
      btnClass = 'equip';
      action = () => {
        state.equipped = w.id;
        buildEquipped();
        save(); renderShop(); updateHUD();
      };
    }
  }

  row.innerHTML = `
    <div class="shop-icon">${icon}</div>
    <div class="shop-info">
      <div class="shop-name">${name}</div>
      <div class="shop-stats">${stats}</div>
      <div class="shop-desc">${desc}</div>
    </div>`;
  const btn = document.createElement('button');
  btn.className = `shop-action ${btnClass}`;
  btn.innerHTML = btnHTML;
  btn.disabled = disabled;
  if (action) btn.addEventListener('click', action);
  if (extraBtn) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;flex-shrink:0;';
    wrap.appendChild(btn);
    wrap.appendChild(extraBtn);
    row.appendChild(wrap);
  } else {
    row.appendChild(btn);
  }
  return row;
}

// ペットの行（購入→無限強化）
function petRow(id) {
  const p = PETS[id];
  const owned = state.pets[id].owned;
  const row = document.createElement('div');
  row.className = 'shop-item';
  const up = state.pets[id].up;
  const name = owned && up > 0 ? `${p.name} +${up}` : p.name;
  row.innerHTML = `
    <div class="shop-icon">${p.icon}</div>
    <div class="shop-info">
      <div class="shop-name">${name}</div>
      <div class="shop-stats">攻撃力 ${fmt(petDmg(id))} ・ 秒間${p.rate}回 自動攻撃</div>
      <div class="shop-desc">${p.desc}${owned ? '（はたらき中🐾）' : ''}</div>
    </div>`;
  const btn = document.createElement('button');
  if (!owned) {
    btn.className = 'shop-action buy';
    btn.innerHTML = `購入<span class="cost">💰${fmt(p.price)}</span>`;
    btn.disabled = state.money < p.price;
    btn.addEventListener('click', () => {
      if (state.money < p.price) return;
      state.money -= p.price;
      state.pets[id].owned = true;
      refreshPets();
      playCoin();
      save(); renderShop(); updateHUD();
    });
  } else {
    row.classList.add('equipped');
    const cost = petUpCost(id);
    btn.className = 'shop-action';
    btn.innerHTML = `∞ 強化<span class="cost">💰${fmt(cost)}</span>`;
    btn.disabled = state.money < cost;
    btn.addEventListener('click', () => {
      if (state.money < petUpCost(id)) return;
      state.money -= petUpCost(id);
      state.pets[id].up += 1;
      playCoin();
      save(); renderShop(); updateHUD();
    });
  }
  row.appendChild(btn);
  return row;
}

// 18禁モードの行（1兆で購入・購入後はON/OFF切り替え）
function r18Row() {
  const row = document.createElement('div');
  row.className = 'shop-item';
  row.innerHTML = `
    <div class="shop-icon">🔞</div>
    <div class="shop-info">
      <div class="shop-name">18禁モード</div>
      <div class="shop-stats">血しぶき解禁 ＆ ハートの杖がビーム化（長押しで秒間10発〜）</div>
      <div class="shop-desc">${state.r18Owned ? 'ボタンでON/OFFを切り替えられる' : 'かなりグロテスクな表現が解禁される。心して買え'}</div>
    </div>`;
  const btn = document.createElement('button');
  if (!state.r18Owned) {
    btn.className = 'shop-action buy';
    btn.innerHTML = `購入<span class="cost">💰${fmt(R18_PRICE)}</span>`;
    btn.disabled = state.money < R18_PRICE;
    btn.addEventListener('click', () => {
      if (state.money < R18_PRICE) return;
      if (!confirm('あなたは18歳以上ですか？\n（血しぶきなどグロテスクな表現が解禁されます）')) return;
      state.money -= R18_PRICE;
      state.r18Owned = true;
      state.r18On = true;
      applyR18Visual();
      playCoin();
      save(); renderShop(); updateHUD();
    });
  } else {
    if (state.r18On) row.classList.add('equipped');
    btn.className = 'shop-action equip';
    btn.textContent = state.r18On ? 'ON → OFFにする' : 'OFF → ONにする';
    btn.addEventListener('click', () => {
      state.r18On = !state.r18On;
      applyR18Visual();
      save(); renderShop(); updateHUD();
    });
  }
  row.appendChild(btn);
  return row;
}

function renderShop() {
  el.shopList.innerHTML = '';
  const header = txt => {
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:900;color:#ffb3d0;font-size:13px;letter-spacing:2px;margin:10px 4px 6px;';
    h.textContent = txt;
    el.shopList.appendChild(h);
  };
  header('🗡 武器');
  for (const w of WEAPONS) el.shopList.appendChild(shopRow(w));
  header('🐾 ペット（武器と併用OK・自動攻撃）');
  for (const id of PET_IDS) el.shopList.appendChild(petRow(id));
  header('🔞 スペシャル');
  el.shopList.appendChild(r18Row());
  el.shopMoney.textContent = '💰' + fmt(state.money);
}

// ---------- スタート ----------
const overlay = document.getElementById('start-overlay');
document.getElementById('start-btn').addEventListener('click', start);
overlay.addEventListener('click', start);
function start() {
  if (state.started) return;
  initAudio();
  state.started = true;
  overlay.classList.add('hidden');
}

// ---------- メインループ ----------
const clock = new THREE.Clock();

// デバッグ用（コンソールから確認できる）
window.__game = { state, buildWand, buildEquipped, updateHUD, renderShop, WEAPONS };

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  // --- ヒットストップ（たたいた瞬間だけおじさんの動きがスローになる） ---
  state.hitStop = Math.max(0, state.hitStop - dt);
  const eff = state.hitStop > 0 ? dt * 0.1 : dt;

  // --- 振り子の物理（本物のピニャータ風：振れ幅制限＆ロープの張り） ---
  const g = 9.8, L = 2.4, damp = 1.4;
  pend.vx += (-(g / L) * Math.sin(anchor.rotation.x) - damp * pend.vx) * eff;
  pend.vz += (-(g / L) * Math.sin(anchor.rotation.z) - damp * pend.vz) * eff;
  // どんなに連打しても速度と振れ幅に上限（画面外に行かない）
  pend.vx = THREE.MathUtils.clamp(pend.vx, -5, 5);
  pend.vz = THREE.MathUtils.clamp(pend.vz, -5, 5);
  anchor.rotation.x += pend.vx * eff;
  anchor.rotation.z += pend.vz * eff;
  const MAX_SWING = 0.9;
  if (Math.abs(anchor.rotation.x) > MAX_SWING) { anchor.rotation.x = Math.sign(anchor.rotation.x) * MAX_SWING; pend.vx *= -0.35; }
  if (Math.abs(anchor.rotation.z) > MAX_SWING) { anchor.rotation.z = Math.sign(anchor.rotation.z) * MAX_SWING; pend.vz *= -0.35; }
  // スピンは常に正面へ戻す力を強めにかけ、顔が見えなくならないようクランプ
  pend.spinV += (-ojisan.rotation.y * 12 - pend.spinV * 3) * eff;
  ojisan.rotation.y = THREE.MathUtils.clamp(ojisan.rotation.y + pend.spinV * eff, -0.5, 0.5);
  // たたかれるとロープがビヨンと伸びて跳ねる
  ropeSpring.v += (-ropeSpring.stretch * 70 - ropeSpring.v * 6) * eff;
  ropeSpring.stretch = THREE.MathUtils.clamp(ropeSpring.stretch + ropeSpring.v * eff, -0.15, 0.3);
  ojisan.position.y = -ROPE_LEN - ropeSpring.stretch;

  squash = Math.max(0, squash - eff * 5);
  const sq = Math.sin(squash * Math.PI) * 0.24;
  ojisan.scale.set(1 + sq, 1 - sq, 1 + sq);

  // --- 赤フラッシュ（たたかれた瞬間おじさんが赤く光る） ---
  if (state.flash > 0 || ojisanMats[0].emissive.r > 0) {
    state.flash = Math.max(0, state.flash - dt * 7);
    for (const m of ojisanMats) m.emissive.setRGB(state.flash * 0.55, state.flash * 0.06, state.flash * 0.12);
  }

  if (faceTimer > 0) {
    faceTimer -= dt;
    if (faceTimer <= 0) setFace(state.poison ? 'sick' : 'normal', 0);
  }

  // --- コンボタイマー ---
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = 0;
      el.comboBox.classList.remove('show');
    }
  }

  // --- 毒ガスのスリップダメージ ---
  if (state.poison) {
    state.poison.t -= dt;
    state.poison.tickTimer -= dt;
    while (state.poison && state.poison.tickTimer <= 0) {
      state.poison.tickTimer += 1 / 7; // 秒間7回
      poisonTick();
    }
    el.poisonInd.classList.add('show');
    el.poisonTime.textContent = Math.max(0, state.poison.t).toFixed(1);
    if (state.poison.t <= 0) {
      state.poison = null;
      el.poisonInd.classList.remove('show');
      if (currentFace === 'sick') setFace('normal', 0);
    }
  }

  // --- 長押し連射（チェンソー・銃・18禁ビーム） ---
  state.cooldown = Math.max(0, state.cooldown - dt);
  const w = weaponById(state.equipped);
  if (state.holding && (w.hold || beamActive()) && weaponReady()) performAttack();

  // --- ビームの見た目（杖の先端→おじさん） ---
  beamTimer = Math.max(0, beamTimer - dt);
  if (beamTimer > 0 && state.equipped === 'wand') {
    weaponRoot.updateWorldMatrix(true, false);
    _beamStart.copy(equipCtx.tipLocal).applyMatrix4(weaponRoot.matrixWorld);
    ojisan.getWorldPosition(_beamEnd);
    _beamEnd.y += 0.1;
    _beamEnd.z += 0.3;
    _beamDir.copy(_beamEnd).sub(_beamStart);
    const len = _beamDir.length();
    beamGroup.position.copy(_beamStart).add(_beamEnd).multiplyScalar(0.5);
    beamGroup.quaternion.setFromUnitVectors(_yAxis, _beamDir.normalize());
    const pulse = 1 + Math.sin(state.time * 42) * 0.2;
    beamGroup.scale.set(pulse, len, pulse);
    beamGroup.visible = true;
  } else {
    beamGroup.visible = false;
  }

  // チェンソーの持続音
  if (state.equipped === 'chainsaw' && state.holding && state.started) startSawSound();
  else stopSawSound();

  // --- 武器のアニメーション ---
  const bp = equipCtx.basePos, br = equipCtx.baseRot;
  if (state.swinging) {
    state.swingT += dt / state.swingDur;
    const t = Math.min(state.swingT, 1);
    if (equipCtx.anim === 'swing') {
      const swing = t < 0.4 ? (t / 0.4) : 1 - (t - 0.4) / 0.6;
      const ease = swing * swing * (3 - 2 * swing);
      weaponRoot.rotation.x = br.x - ease * 1.85;
      weaponRoot.rotation.z = br.z + ease * 0.5;
      weaponRoot.position.z = bp.z - ease * 0.7;
      weaponRoot.position.y = bp.y - ease * 0.12;
      if (!state.hitDone && t >= 0.4) {
        state.hitDone = true;
        applyHit();
      }
    } else if (equipCtx.anim === 'shoot') {
      const kick = Math.sin(t * Math.PI);
      weaponRoot.rotation.x = br.x + kick * 0.22;
      weaponRoot.position.z = bp.z + kick * 0.14;
    } else if (equipCtx.anim === 'saw') {
      weaponRoot.rotation.x = br.x - 0.5 + (Math.random() - 0.5) * 0.08;
      weaponRoot.rotation.z = br.z + (Math.random() - 0.5) * 0.08;
      weaponRoot.position.z = bp.z - 0.3 + (Math.random() - 0.5) * 0.04;
      weaponRoot.position.y = bp.y + (Math.random() - 0.5) * 0.04;
    } else if (equipCtx.anim === 'spray') {
      const s = Math.sin(t * Math.PI);
      weaponRoot.rotation.x = br.x - s * 0.35;
      weaponRoot.position.z = bp.z - s * 0.1;
    }
    if (t >= 1) {
      state.swinging = false;
      weaponRoot.position.copy(bp);
      weaponRoot.rotation.copy(br);
    }
  } else if (beamTimer > 0 && state.equipped === 'wand') {
    // ビーム発射中はおじさんに杖を向けて構える
    weaponRoot.rotation.set(br.x - 1.15 + (Math.random() - 0.5) * 0.04, br.y, br.z + 0.2);
    weaponRoot.position.set(bp.x, bp.y + 0.05, bp.z - 0.25);
  } else {
    weaponRoot.position.set(bp.x, bp.y + Math.sin(state.time * 2.2) * 0.012, bp.z);
    weaponRoot.rotation.set(br.x, br.y, br.z + Math.sin(state.time * 1.7) * 0.02);
  }

  // マズルフラッシュ
  if (equipCtx.flash) {
    equipCtx.flashTimer = Math.max(0, equipCtx.flashTimer - dt);
    equipCtx.flash.material.opacity = equipCtx.flashTimer > 0 ? 1 : 0;
  }

  // --- 杖の飾りアニメーション ---
  if (equipCtx.sparkles) {
    const { n, topY, radius } = equipCtx.sparkles.userData;
    const pos = equipCtx.sparkles.geometry.attributes.position;
    for (let i = 0; i < n; i++) {
      const a = state.time * 1.6 + (i / n) * Math.PI * 2;
      const r = radius * (0.75 + 0.35 * Math.sin(state.time * 2.3 + i * 2.1));
      pos.setXYZ(i,
        Math.cos(a) * r,
        topY + Math.sin(state.time * 3.1 + i * 1.7) * radius * 0.8,
        Math.sin(a) * r * 0.6
      );
    }
    pos.needsUpdate = true;
  }
  for (const star of equipCtx.orbiters) {
    const { angle, topY, radius } = star.userData;
    const a = angle + state.time * 2.4;
    star.position.set(Math.cos(a) * radius, topY + Math.sin(a * 1.3) * radius * 0.4, Math.sin(a) * radius);
  }
  if (equipCtx.auraLight) {
    equipCtx.auraLight.intensity = 1.0 + Math.sin(state.time * 6) * 0.5;
    equipCtx.auraLight.color.setHSL((state.time * 0.15) % 1, 0.7, 0.65);
  }

  // --- レベルアップ演出（まとめて） ---
  flushLevelUps();

  // --- 画面シェイク＋カメラパンチ（一瞬ズッと前に出る） ---
  state.punch = Math.max(0, state.punch - dt * 6);
  const punchZ = state.punch * 0.16;
  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 2.2);
    camera.position.set(
      CAM_BASE.x + (Math.random() - 0.5) * state.shake * 0.25,
      CAM_BASE.y + (Math.random() - 0.5) * state.shake * 0.25,
      CAM_BASE.z - punchZ
    );
  } else {
    camera.position.set(CAM_BASE.x, CAM_BASE.y, CAM_BASE.z - punchZ);
  }

  // --- 風船ゆらゆら ---
  for (const b of balloons) {
    b.position.y += Math.sin(state.time * 1.2 + b.userData.phase) * 0.0016;
    b.rotation.z = Math.sin(state.time * 0.8 + b.userData.phase) * 0.06;
  }

  // --- ペットの自動攻撃 ---
  updatePets(dt);

  // --- 血だまりのフェード＆赤いビネット ---
  updateStains(dt);
  goreVignette.style.opacity = state.r18On ? (state.flash * 0.85).toFixed(2) : '0';

  updateParticles(dt);
  renderer.render(scene, camera);
}
animate();

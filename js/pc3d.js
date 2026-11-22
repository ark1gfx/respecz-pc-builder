// Interactive 3D PC. Loads assets/pc.glb (built in Blender by tools/blender/build_pc.py).
// Glass side faces -x (real ATX layout). Nodes named part_<category> are clickable; rotor_* nodes spin; materials get finishing touches here.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const BLUE = 0x4da3ff;
// How the board texture sits on the mb_pcb_face plane's UVs (checked visually).
const BOARD_ROT = Math.PI / 2;
const BOARD_FLIP = [1, 1];
const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/';

// ---------- generated textures ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
// white = metal, black = hole (used as alphaMap)
const holesTex = (repeat) => canvasTex(128, (x, s) => {
  x.fillStyle = '#fff';
  x.fillRect(0, 0, s, s);
  x.fillStyle = '#000';
  const step = s / 4;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = col * step + (row % 2 ? step / 2 : 0);
      const cy = row * step * 0.87;
      x.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        x.lineTo(cx + Math.cos(a) * step * 0.4, cy + Math.sin(a) * step * 0.4);
      }
      x.fill();
    }
  }
}, repeat);
const pcbTex = () => canvasTex(512, (x, s) => {
  x.fillStyle = '#20242e';
  x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(120, 140, 170, 0.18)';
  x.lineWidth = 2;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    let px = rnd() * s;
    let py = rnd() * s;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      if (rnd() > 0.5) px += (rnd() - 0.5) * 160; else py += (rnd() - 0.5) * 160;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  x.fillStyle = 'rgba(220, 225, 235, 0.5)';
  for (let i = 0; i < 40; i++) x.fillRect(rnd() * s, rnd() * s, 10 + rnd() * 22, 3);
}, 1);


// Motherboard face, drawn in board space: canvas left = rear (I/O) edge, top = top edge.
// Board spans z -20.5..3.9 (24.4 cm wide) and y -11..19.5 (30.5 cm tall) in site coords.
function boardTex() {
  const W = 1024;
  const H = 1280;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const X = (z) => ((z + 20.5) / 24.4) * W;
  const Y = (y) => ((19.5 - y) / 30.5) * H;
  const S = W / 24.4; // px per cm
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  x.fillStyle = '#1c2029';
  x.fillRect(0, 0, W, H);
  // matte texture
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(255,255,255,${rnd() * 0.025})`;
    x.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // traces
  const trace = (pts, w = 2, a = 0.22) => {
    x.strokeStyle = `rgba(130, 150, 182, ${Math.min(1, a * 1.5)})`;
    x.lineWidth = w;
    x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.stroke();
  };
  // memory bus: socket (z -7.2, y 10.35) -> DIMMs (z -1.7..1.0)
  for (let i = 0; i < 30; i++) {
    const y0 = Y(15.2) + i * 9.5;
    trace([[X(-3.6), y0], [X(-2.6), y0], [X(-2.2), y0 + 7]], 1.6, 0.26);
  }
  // PCIe lanes: socket -> x16 slot (y 1.05)
  for (let i = 0; i < 18; i++) {
    const x0 = X(-12.5) + i * 10;
    trace([[x0, Y(6.4)], [x0, Y(4.2)], [x0 - 14, Y(3.0)], [x0 - 14, Y(1.6)]], 1.6, 0.24);
  }
  // random routing
  for (let i = 0; i < 140; i++) {
    let px = rnd() * W;
    let py = rnd() * H;
    const pts = [[px, py]];
    for (let k = 0; k < 3; k++) {
      if (rnd() > 0.5) px += (rnd() - 0.5) * 220; else py += (rnd() - 0.5) * 220;
      pts.push([px, py]);
    }
    trace(pts, 1.4, 0.12 + rnd() * 0.12);
  }
  // vias
  for (let i = 0; i < 600; i++) {
    x.fillStyle = 'rgba(160,170,185,0.35)';
    x.beginPath();
    x.arc(rnd() * W, rnd() * H, 1.6, 0, Math.PI * 2);
    x.fill();
  }
  // silkscreen
  x.strokeStyle = 'rgba(225, 230, 238, 0.6)';
  x.fillStyle = 'rgba(225, 230, 238, 0.7)';
  x.lineWidth = 2;
  const outline = (z0, y0, z1, y1) => x.strokeRect(X(z0), Y(y0), X(z1) - X(z0), Y(y1) - Y(y0));
  const label = (t, z, y, size = 15, rot = 0) => {
    x.save();
    x.translate(X(z), Y(y));
    x.rotate(rot);
    x.font = `600 ${size}px Inter, Arial, sans-serif`;
    x.fillText(t, 0, 0);
    x.restore();
  };
  outline(-11.3, 14.6, -3.1, 6.1); // socket keep-out
  label('CPU1', -11.0, 5.4, 14);
  label('DDR5_A1', -2.3, 2.2, 11, -Math.PI / 2);
  label('DDR5_A2', -1.4, 2.2, 11, -Math.PI / 2);
  label('DDR5_B1', -0.5, 2.2, 11, -Math.PI / 2);
  label('DDR5_B2', 0.4, 2.2, 11, -Math.PI / 2);
  label('CPU_FAN1', -4.0, 19.1, 13);
  label('PUMP_FAN1', 0.0, 18.3, 12);
  label('ATX_PWR1', 1.8, 12.6, 12, -Math.PI / 2);
  label('EZ DEBUG LED', 2.6, 16.6, 11, -Math.PI / 2);
  label('CPU_PWR1', -16.2, 19.2, 12);
  label('PCI_E1', -17.4, 0.6, 13);
  label('PCI_E2', -17.4, -5.2, 13);
  label('PCI_E3', -17.4, -9.7, 13);
  label('M2_1', -18.2, 3.3, 12);
  label('JAUD1', -20.0, -10.7, 12);
  label('JFP1', 0.6, -10.8, 12);
  label('SATA1-4', 2.0, -5.0, 11, -Math.PI / 2);
  label('JRGB1  JARGB_V2_1', -14.5, -10.8, 11);
  label('BAT1', -15.2, -8.0, 11);
  // gold audio isolation line
  x.strokeStyle = 'rgba(214, 168, 80, 0.85)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(X(-16.3), Y(2.4));
  x.lineTo(X(-16.3), Y(-7.2));
  x.quadraticCurveTo(X(-16.3), Y(-8.2), X(-17.3), Y(-8.2));
  x.lineTo(X(-20.4), Y(-8.2));
  x.stroke();
  x.fillStyle = 'rgba(225, 230, 238, 0.75)';
  x.font = '800 30px Inter, Arial, sans-serif';
  x.fillText('RESPECZ', X(-14.6), Y(-3.6));
  x.font = '600 14px Inter, Arial, sans-serif';
  x.fillText('RS-B850 GAMING WIFI', X(-14.6), Y(-4.3));
  // component outlines
  for (let i = 0; i < 40; i++) {
    const z = -20 + rnd() * 23;
    const y = -10.5 + rnd() * 29;
    x.strokeStyle = 'rgba(225,230,238,0.28)';
    x.strokeRect(X(z), Y(y), 8 + rnd() * 22, 6 + rnd() * 12);
  }
  // gold pads + mounting holes
  for (let i = 0; i < 160; i++) {
    x.fillStyle = 'rgba(214, 168, 80, 0.75)';
    x.fillRect(rnd() * W, rnd() * H, 4, 3);
  }
  for (const [z, y] of [[-19.9, 18.8], [-6.6, 18.8], [3.2, 18.8], [-19.9, 4], [3.2, 4], [-19.9, -10.4], [-6.6, -10.4], [3.2, -10.4]]) {
    x.fillStyle = '#b9bec7';
    x.beginPath();
    x.arc(X(z), Y(y), 0.55 * S, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#0b0c0f';
    x.beginPath();
    x.arc(X(z), Y(y), 0.3 * S, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ARGB rainbow (used as an emissive map on rings/strips)
function rainbowTex() {
  const t = canvasTex(256, (x, sz) => {
    const g = x.createLinearGradient(0, 0, sz, 0);
    ['#ff3b6b', '#ff9f1a', '#ffe14d', '#3dff8a', '#29d3ff', '#4d7bff', '#b05cff', '#ff3b6b'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    x.fillStyle = g;
    x.fillRect(0, 0, sz, sz);
  }, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Cooler top display, drawn as installed: canvas left = rear, top = top (same mapping as the board).
function coolerDisplayTex() {
  const W = 256;
  const H = 640;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#07080a';
  x.fillRect(0, 0, W, H);
  // pixel pattern blocks top and bottom
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [y0, y1] of [[18, 150], [500, 622]]) {
    for (let yy = y0; yy < y1; yy += 16) for (let xx = 16; xx < W - 16; xx += 16) {
      if (rnd() < 0.45) { x.fillStyle = `rgba(160,165,175,${0.25 + rnd() * 0.35})`; x.fillRect(xx, yy, 12, 12); }
    }
  }
  x.fillStyle = '#e9edf3';
  x.font = '600 26px Inter, Arial, sans-serif';
  x.textAlign = 'center';
  x.fillText('CPU', W / 2, 205);
  x.font = '800 118px Inter, Arial, sans-serif';
  x.fillText('45', W / 2 - 18, 318);
  x.fillStyle = '#3dff8a';
  x.font = '700 34px Inter, Arial, sans-serif';
  x.fillText('°C', W / 2 + 84, 268);
  x.fillStyle = '#e9edf3';
  x.font = '600 26px Inter, Arial, sans-serif';
  x.fillText('FAN', W / 2, 382);
  x.font = '800 72px Inter, Arial, sans-serif';
  x.fillText('1289', W / 2, 458);
  x.fillStyle = '#4da3ff';
  x.fillRect(W / 2 - 50, 474, 100, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.center.set(0.5, 0.5);
  t.rotation = BOARD_ROT;
  return t;
}

export async function mountPC(container, { onPick, onHover, labels, reducedMotion = false, onLoad }) {
  const small = Math.min(container.clientWidth, container.clientHeight) < 520;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // full-screen canvas: 2x pixels cost ~1.8x GPU time for little visible gain
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'pc-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 600);
  const HOME = { target: new THREE.Vector3(0, 1, 0), pos: new THREE.Vector3(-125, 9, 24) };
  camera.position.copy(HOME.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false, // wheel/pinch must scroll the page, not shrink the PC
    minDistance: 40, maxDistance: 160,
    minPolarAngle: 0.55, maxPolarAngle: 1.7, minAzimuthAngle: -1.7, maxAzimuthAngle: 0.15,
  });
  controls.update();

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x08080c, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-75, 28, 35);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 10, far: 160 });
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.08;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc3ff, 0.6);
  fill.position.set(20, 10, 70);
  scene.add(fill);
  const inner = new THREE.PointLight(BLUE, 160, 45, 2);
  inner.position.set(-6, 8, 8);
  const top = new THREE.PointLight(0xffffff, 120, 40, 2);
  top.position.set(-6, 19, -4);
  scene.add(top);
  // soft white fill inside the case, as if lit through the glass
  const cabin = new THREE.PointLight(0xffffff, 1100, 60, 2);
  cabin.position.set(-2, 10, -2);
  scene.add(cabin);
  const cabinLow = new THREE.PointLight(0xdfe8ff, 420, 40, 2);
  cabinLow.position.set(-4, -9, -6);
  scene.add(cabinLow);
  scene.add(inner);
  const low = new THREE.PointLight(0x8b5cf6, 110, 40, 2);
  low.position.set(-5, -10, 6);
  scene.add(low);

  // ---------- floor ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -24.2;
  floor.receiveShadow = true;
  floor.raycast = () => {};
  scene.add(floor);
  // no backdrop: the PC sits straight on the page, only a soft contact shadow under it

  // ---------- load model ----------
  const draco = new DRACOLoader().setDecoderPath(DRACO);
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(new URL('../assets/pc.glb', import.meta.url).href);
  const model = gltf.scene;
  scene.add(model);

  const groups = {};
  const rotors = [];
  const argbSegs = []; // (legacy) flowing rainbow segments
  // Smooth ARGB: one unlit material whose colour is a hue gradient over world position, shifted by time.
  const flowTime = { value: 0 };
  const flowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  flowMat.name = 'argb_flow';
  flowMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = flowTime;
    sh.vertexShader = 'varying vec3 vFlowW;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vFlowW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = [
      'uniform float uTime;',
      'varying vec3 vFlowW;',
      'vec3 hsv2rgb(vec3 c) {',
      '  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);',
      '  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);',
      '  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);',
      '}',
    ].join('\n') + '\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n  diffuseColor.rgb = hsv2rgb(vec3(fract(uTime * 0.12 - (vFlowW.y + vFlowW.z) * 0.025), 0.85, 0.95));');
  };
  const argbMaps = []; // rainbow textures on fan rings
  const pcb = pcbTex();
  const fixed = new Set();
  model.traverse((o) => {
    if (o.name.startsWith('part_')) {
      const cat = o.name.slice(5);
      o.userData.cat = cat;
      groups[cat] = o;
    }
    if (o.name.startsWith('rotor_')) rotors.push(o);
    if (!o.isMesh) return;
    if (o.material.name === 'argb_flow') {
      o.material = flowMat;
      o.castShadow = false;
      return;
    }
    // spinning blades must not cast/receive shadows: moving shadow maps on thin blades flicker in stripes
    const spinning = o.name.startsWith('rotor_');
    // dense fin stacks self-shadow at grazing angles and turn into striped acne/moire, so they skip shadows too
    const finStack = o.name.startsWith('cooler_fins') || o.name.startsWith('gpu_fins') || o.name.startsWith('mb_vrm_fin') || o.name.startsWith('mb_vrm_groove');
    o.castShadow = !spinning && !finStack;
    o.receiveShadow = !spinning && !finStack;
    const m = o.material;
    if (fixed.has(m)) return;
    fixed.add(m);
    if (m.name === 'perf_metal') {
      m.alphaMap = holesTex(o.name.includes('top') ? 9 : 12);
      m.alphaTest = 0.5;
      m.side = THREE.DoubleSide;
    } else if (m.name === 'pcb_face') {
      m.map = boardTex();
      m.map.center.set(0.5, 0.5);
      m.map.rotation = BOARD_ROT;
      m.map.repeat.set(BOARD_FLIP[0], BOARD_FLIP[1]);
      m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
      m.color.set(0xffffff);
      m.roughness = 0.55;
      m.metalness = 0.1;
      m.needsUpdate = true;
    } else if (m.name === 'tube_braided') {
      // braided sleeve: fine diagonal weave
      m.map = canvasTex(64, (x, sz) => {
        x.fillStyle = '#0b0c0f';
        x.fillRect(0, 0, sz, sz);
        x.strokeStyle = '#2a2d34';
        x.lineWidth = 3;
        for (let i = -sz; i < sz * 2; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + sz, sz); x.stroke(); }
        x.strokeStyle = '#1a1c21';
        for (let i = -sz; i < sz * 2; i += 8) { x.beginPath(); x.moveTo(i + sz, 0); x.lineTo(i, sz); x.stroke(); }
      }, 1);
      m.map.repeat.set(40, 2);
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.color.set(0xffffff);
      m.roughness = 0.55;
    } else if (m.name === 'argb_strip') {
      m.emissiveIntensity = 1.6; // magenta fan-edge LEDs (reference look)
    } else if (m.name.startsWith('argb_seg_')) {
      m.emissiveIntensity = 1.05; // lower so tone mapping keeps the colours saturated
      argbSegs.push({ m, i: Number(m.name.slice(9)) });
    } else if (m.name === 'argb') {
      m.emissiveMap = rainbowTex();
      argbMaps.push(m.emissiveMap);
      m.emissive.set(0xffffff);
      m.emissiveIntensity = 0.85; // low enough that tone mapping keeps the rainbow colours
    } else if (m.name === 'cooler_display') {
      const tex = coolerDisplayTex();
      m.map = tex;
      m.emissiveMap = tex;
      m.emissive.set(0xffffff);
      m.emissiveIntensity = 0.9;
      m.color.set(0xffffff);
      m.roughness = 0.2;
    } else if (m.name === 'fin_black') {
      m.roughness = 0.5;
      m.metalness = 0.6;
      m.envMapIntensity = 0.8;
    } else if (m.name === 'rad_fins') {
      // radiator core: fine fin lines (mipmapped texture, so no aliasing)
      m.map = canvasTex(64, (x, sz) => {
        x.fillStyle = '#5a5f68';
        x.fillRect(0, 0, sz, sz);
        x.fillStyle = '#16181c';
        for (let i = 0; i < sz; i += 4) x.fillRect(i, 0, 2, sz);
      }, 1);
      m.map.repeat.set(60, 4);
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.color.set(0xffffff);
      m.roughness = 0.55;
    } else if (m.name === 'alu_fin') {
      // matte-ish fins: sharp reflections on dozens of thin fin edges alias into blocky patterns
      m.roughness = 0.6;
      m.metalness = 0.8;
      m.envMapIntensity = 0.9;
    } else if (['silver_armor', 'nickel', 'gunmetal', 'gold_pins', 'armor_dark', 'armor_light'].includes(m.name)) {
      m.envMapIntensity = 2.4; // bright metal needs something to reflect
    } else if (m.name === 'slot_light') {
      m.envMapIntensity = 1.5;
    } else if (m.name === 'pcb') {
      m.map = pcb;
      m.color.set(0xffffff);
    } else if (m.name === 'glass') {
      o.material = new THREE.MeshPhysicalMaterial({
        color: 0xbcd4ff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.02,
        clearcoat: 0, envMapIntensity: 0.22, depthWrite: false,
      });
      o.castShadow = false;
      o.raycast = () => {};
    } else if (m.name === 'case_black' || m.name === 'case_inner') {
      m.metalness = 0.15; // powder-coated steel, not mirror metal
      m.roughness = 0.62;
    } else if (m.name.startsWith('glow_')) {
      m.emissiveIntensity = m.name === 'glow_diffuser' ? 1.4 : 2.0;
      m.toneMapped = true;
    } else if (m.name === 'fan_frame') {
      m.side = THREE.DoubleSide; // belt and braces: a frame must never look see-through
    } else if (m.name === 'fan_blade') {
      m.transparent = false; // see-through blades sorted badly against the glass panel
      m.roughness = 0.7; // satin blades: no bright edge glints through the frame opening
      m.envMapIntensity = 0.5;
    }
  });
  // glass meshes share one material object after replacement; mark the original as handled
  model.traverse((o) => { if (o.isMesh && o.name.startsWith('case_glass') && !o.name.includes('print')) o.raycast = () => {}; });

  // ---------- hotspot anchors from part bounds ----------
  const anchors = {};
  const bb = new THREE.Box3();
  for (const [cat, g] of Object.entries(groups)) {
    bb.setFromObject(g);
    const c = bb.getCenter(new THREE.Vector3());
    anchors[cat] = new THREE.Vector3(bb.min.x, c.y, c.z); // glass side is -x
  }
  if (groups.cpu) { bb.setFromObject(groups.cpu); anchors.cpu.set(bb.min.x, bb.min.y + 0.4, bb.getCenter(new THREE.Vector3()).z); }
  if (groups.case) anchors.case = new THREE.Vector3(-11, 6, 17);
  const pumpObj = model.getObjectByName('cooler_top');
  if (pumpObj) {
    bb.setFromObject(pumpObj);
    anchors.cooler = new THREE.Vector3(bb.min.x, bb.max.y - 2.0, bb.getCenter(new THREE.Vector3()).z);
  }
  if (groups.motherboard) anchors.motherboard = new THREE.Vector3(8.4, -7.5, -18.4);
  // PSU: use the PSU box itself (the psu group also holds every power cable, up to the top of the case)
  const psuBody = model.getObjectByName('psu_body');
  if (psuBody) {
    bb.setFromObject(psuBody);
    anchors.psu = new THREE.Vector3(bb.min.x, bb.getCenter(new THREE.Vector3()).y + 1, bb.getCenter(new THREE.Vector3()).z);
  }

  // ---------- frame the model: aim at its real centre, zoom so it fits the stage at any width ----------
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelRadius = modelBox.getSize(new THREE.Vector3()).length() / 2;
  const HOME_DIR = HOME.pos.clone().sub(HOME.target).normalize();
  HOME.target.copy(modelCenter);
  let scrollScale = 1; // page scroll pushes the camera in: 1 = whole PC, smaller = closer
  let scrollK = 0;
  let wholeView = false; // set by reset(): show the whole PC until the visitor scrolls again
  const zoomScale = () => (wholeView ? 1 : scrollScale);
  let full = false; // full-screen viewer: wheel/pinch zoom on, zoom-out capped at the home view
  function applyLimits() {
    const home = HOME.pos.distanceTo(HOME.target);
    controls.enableZoom = full;
    controls.minDistance = full ? 18 : 30;
    controls.maxDistance = full ? home * 1.001 : Math.max(160, home * 1.4);
  }
  function fitHome() {
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (modelRadius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.86;
    HOME.pos.copy(HOME.target).addScaledVector(HOME_DIR, dist);
    applyLimits();
  }
  fitHome();
  controls.target.copy(HOME.target);
  camera.position.copy(HOME.pos);
  controls.update();

  // No post-processing: bloom passes drop the canvas alpha, and the PC must sit on the page with no backdrop.

  // ---------- picking + hover ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables = Object.values(groups);
  let hovered = null;
  const originals = new Map();
  function setHighlight(cat, on) {
    if (cat === 'case') return; // the case fills the view, a blue tint on it washes out the whole PC
    groups[cat]?.traverse((o) => {
      if (!o.isMesh || !o.material.emissive || o.material.name.startsWith('argb')) return;
      if (!originals.has(o)) {
        o.material = o.material.clone();
        originals.set(o, { e: o.material.emissive.clone(), i: o.material.emissiveIntensity });
      }
      const base = originals.get(o);
      if (on && base.e.getHex() === 0) {
        o.material.emissive.setHex(BLUE);
        o.material.emissiveIntensity = 0.22;
      } else {
        o.material.emissive.copy(base.e);
        o.material.emissiveIntensity = base.i;
      }
    });
  }
  function catAt(event) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    let o = raycaster.intersectObjects(pickables, true)[0]?.object;
    while (o && !o.userData.cat) o = o.parent;
    return o?.userData.cat || null;
  }
  function hover(cat) {
    if (cat === hovered) return;
    if (hovered && hovered !== focused) setHighlight(hovered, false);
    hovered = cat;
    if (cat) setHighlight(cat, true);
    renderer.domElement.style.cursor = cat ? 'pointer' : 'grab';
    hotspots.forEach((h) => h.el.classList.toggle('is-hot', h.cat === cat));
    onHover?.(cat);
  }

  let downAt = null;
  let lastInput = performance.now();
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; lastInput = performance.now(); });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    const cat = catAt(e);
    if (cat) onPick(cat);
  });
  renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') hover(catAt(e)); });
  renderer.domElement.addEventListener('pointerleave', () => hover(null));
  controls.addEventListener('start', () => { lastInput = performance.now(); });

  // ---------- DOM hotspots ----------
  const layer = document.createElement('div');
  layer.className = 'hotspots';
  container.appendChild(layer);
  const hotspots = Object.entries(anchors).map(([cat, pos]) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hotspot';
    el.innerHTML = `<span class="hs-dot"></span><span class="hs-label">${labels[cat]}</span>`;
    el.setAttribute('aria-label', `${labels[cat]}: tingnan ang products`);
    el.addEventListener('click', () => onPick(cat));
    el.addEventListener('mouseenter', () => hover(cat));
    el.addEventListener('mouseleave', () => hover(null));
    layer.appendChild(el);
    return { cat, el, pos };
  });

  // ---------- focus animation ----------
  let focused = null;
  let tween = null;
  const moveTo = (target, pos) => {
    tween = { t0: performance.now(), d: 750, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target, toP: pos };
  };
  function focus(cat) {
    if (focused && focused !== cat) setHighlight(focused, false);
    focused = cat;
    setHighlight(cat, true);
    const target = anchors[cat].clone().multiplyScalar(0.55).add(new THREE.Vector3(0, -1, 0));
    const dir = camera.position.clone().sub(controls.target).normalize();
    moveTo(target, target.clone().add(dir.multiplyScalar(cat === 'case' ? 95 : 58)));
    lastInput = performance.now();
  }
  function reset() {
    if (focused) setHighlight(focused, false);
    focused = null;
    wholeView = true;
    moveTo(HOME.target.clone(), HOME.pos.clone());
  }

  // ---------- loop ----------
  let visible = true;
  let raf = 0;
  const clock = new THREE.Clock();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tmp = new THREE.Vector3();
  const spherical = new THREE.Spherical();

  // The canvas keeps one size (the pinned screen); scrolling only moves the visible "window" inside it.
  // The camera frames the window through a view offset, so nothing is reallocated or cleared mid-scroll.
  let win = null; // { x, y, w, h } in canvas CSS px; null = the whole canvas
  function applyView() {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const w = win ? Math.max(1, win.w) : cw;
    const h = win ? Math.max(1, win.h) : ch;
    camera.aspect = w / h;
    camera.fov = w < 520 ? 36 : 30;
    if (win) camera.setViewOffset(w, h, -win.x, -win.y, cw, ch);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    fitHome();
  }
  function setWindow(r) {
    win = r;
    if (container.clientWidth && container.clientHeight) applyView();
  }

  // container size, cached here so the frame loop never reads layout (that forced a reflow every frame)
  const size = { w: container.clientWidth, h: container.clientHeight };
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    size.w = w; size.h = h;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    applyView();
    if (!focused && !tween && !full) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(HOME.target);
      camera.position.copy(HOME.target).addScaledVector(dir, HOME.pos.distanceTo(HOME.target) * zoomScale());
    }
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();
    for (const r of rotors) r.rotateY(-dt * (reducedMotion ? 0.8 : 2.6)); // slow enough not to strobe
    if (!reducedMotion) {
      flowTime.value = now / 1000;
      const shift = now * 0.00012;
      for (const { m, i } of argbSegs) m.emissive.setHSL((shift + i / 7) % 1, 1, 0.5);
      for (const t of argbMaps) t.offset.x = (t.offset.x + dt * 0.08) % 1;
    }

    if (tween) {
      const t = Math.min(1, (now - tween.t0) / tween.d);
      const k = ease(t);
      controls.target.lerpVectors(tween.fromT, tween.toT, k);
      camera.position.lerpVectors(tween.fromP, tween.toP, k);
      if (t === 1) tween = null;
    } else if (!reducedMotion && !focused && !full && now - lastInput > 3500) {
      // drift back to the framed home view (centre + distance) after the visitor lets go
      controls.target.lerp(HOME.target, 0.04);
      tmp.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(tmp);
      spherical.radius += (HOME.pos.distanceTo(HOME.target) * zoomScale() - spherical.radius) * 0.04;
      spherical.phi += (Math.acos((HOME.pos.y - HOME.target.y) / HOME.pos.distanceTo(HOME.target)) - spherical.phi) * 0.03;
      const goal = -1.36 + Math.sin(now / 5200) * 0.16;
      spherical.theta += (goal - spherical.theta) * 0.02;
      tmp.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(tmp);
    }

    if (!tween && !focused && !full) {
      // follow the page scroll zoom right away (dragging still rotates freely)
      tmp.copy(camera.position).sub(controls.target);
      const goal = HOME.pos.distanceTo(HOME.target) * zoomScale();
      const len = tmp.length();
      if (Math.abs(goal - len) > 0.01) camera.position.copy(controls.target).addScaledVector(tmp.normalize(), len + (goal - len) * 0.22);
    }

    controls.update();
    if (win) {
      // only shade the visible window (the rest is clipped by CSS anyway)
      const ch = size.h;
      renderer.setScissorTest(true);
      renderer.setScissor(Math.floor(win.x), Math.floor(ch - win.y - win.h), Math.ceil(win.w) + 1, Math.ceil(win.h) + 1);
    } else {
      renderer.setScissorTest(false);
    }
    renderer.render(scene, camera);

    const { w, h } = size;
    for (const hs of hotspots) {
      tmp.copy(hs.pos).project(camera);
      hs.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    }
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(container);
  document.addEventListener('visibilitychange', start);
  start();
  if (new URLSearchParams(location.search).has('debug3d')) window.__pc3d = { scene, camera, controls, renderer, groups };
  onLoad?.();

  // full-screen viewer: wheel / pinch zoom is allowed only here (the page is scroll-locked)
  function setFull(on) {
    full = on;
    // zooming out stops at the framed home view; scrolling further out leaves full screen
    applyLimits();
    controls.zoomSpeed = 1.2;
    lastInput = performance.now();
    if (!on) reset();
  }
  const atHome = () => camera.position.distanceTo(controls.target) >= HOME.pos.distanceTo(HOME.target) * 0.985;

  // 0 = top of the page, 1 = fully scrolled into the PC
  function setScrollZoom(k) {
    k = Math.min(1, Math.max(0, k));
    if (Math.abs(k - scrollK) > 0.002) wholeView = false; // scrolling takes the zoom back
    scrollK = k;
    scrollScale = 1 - 0.42 * k;
    if (k > 0.02) lastInput = performance.now() - 2000; // keep the idle sway, skip the long wait
  }

  return { focus, reset, setFull, atHome, setScrollZoom, setWindow, isFocused: () => !!focused };
}

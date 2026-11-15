// Origen — vaso de cristal de doble pared 3D, líquido por capas con degradados reales,
// espuma, chorro, vapor y toppings. Todo en código (sin modelos descargados).
import * as THREE from 'three';

// ---------- forma del vaso (unidades locales; base en y = 0) ----------
const CUP_H = 1.15;
// pared interior (cuenco que flota dentro del vaso), de abajo arriba: [radio, y]
const INNER = [
  [0, 0.235], [0.12, 0.24], [0.22, 0.252], [0.29, 0.272], [0.34, 0.302], [0.372, 0.345],
  [0.39, 0.41], [0.402, 0.52], [0.418, 0.7], [0.434, 0.9], [0.447, 1.06], [0.452, 1.125],
];
// pared exterior, de abajo arriba
const OUTER = [
  [0, 0], [0.33, 0], [0.37, 0.004], [0.388, 0.018], [0.394, 0.045], [0.41, 0.3],
  [0.43, 0.6], [0.452, 0.9], [0.468, 1.1], [0.47, 1.132], [0.466, 1.146], [0.459, 1.149],
];
const Y0 = 0.243;      // fondo del líquido
const Y1 = 1.105;      // líquido lleno hasta arriba
export const CAPACITY = 1; // las alturas de capa son fracción de (Y1 - Y0)
const ORDER = ['syrup', 'milk', 'coffee', 'foam'];

function innerR(y) {
  if (y <= INNER[0][1]) return 0;
  for (let i = 1; i < INNER.length; i++) {
    const [r1, y1] = INNER[i];
    const [r0, y0] = INNER[i - 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return INNER[INNER.length - 1][0];
}

export function createCupScene(canvas, { reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  const mobile = matchMedia('(max-width: 760px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  // three.js limpia el buffer de transmisión en blanco al 50 % cuando el lienzo es transparente,
  // y el cristal sale como porcelana. Lo sustituimos por el negro cálido del fondo de la web.
  const setClear = renderer.setClearColor.bind(renderer);
  renderer.setClearColor = (c, a) => (a === 0.5 && new THREE.Color(c).getHex() === 0xffffff ? setClear(0x0e0a08, 1) : setClear(c, a));

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 7);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffc28a, 2.0);
  key.position.set(-3.5, 3, 2.5);
  const rim = new THREE.DirectionalLight(0xffe2c4, 1.4);
  rim.position.set(3, 1.5, -3);
  scene.add(key, rim);

  // place → tilt → spin → cup
  const place = new THREE.Group();
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  const cup = new THREE.Group();
  scene.add(place); place.add(tilt); tilt.add(spin); spin.add(cup);
  cup.position.y = -CUP_H / 2;

  // ---------- mesa: piedra oscura que se funde con el fondo ----------
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 96),
    new THREE.MeshStandardMaterial({
      color: '#1b140f', roughness: 0.42, metalness: 0, transparent: true, depthWrite: false,
      alphaMap: radialTexture([[0, '#fff'], [0.35, '#bbb'], [0.75, '#222'], [1, '#000']], false),
      roughnessMap: noiseTexture(512, 0.55, 0.85), envMapIntensity: 0.5,
    })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.002;
  table.renderOrder = -2;
  cup.add(table);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(0,0,0,0.9)'], [0.35, 'rgba(0,0,0,0.6)'], [0.7, 'rgba(0,0,0,0.15)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  shadow.renderOrder = -1;
  cup.add(shadow);

  // luz ámbar que el café proyecta sobre la mesa (cáustica)
  const caustic = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.9),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,170,90,0.55)'], [0.4, 'rgba(200,110,50,0.22)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  caustic.rotation.x = -Math.PI / 2;
  caustic.position.set(0.55, 0.002, 0.35);
  caustic.rotation.z = -0.5;
  caustic.renderOrder = -1;
  cup.add(caustic);

  // ---------- cristal de doble pared ----------
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.015, transmission: 1, thickness: 0.06, ior: 1.5,
    specularIntensity: 1, envMapIntensity: 1.6, clearcoat: 0.3, clearcoatRoughness: 0.02,
    side: THREE.DoubleSide, transparent: false,
  });
  const profile = [
    ...OUTER.map(([r, y]) => new THREE.Vector2(r, y)),
    ...INNER.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)),
  ];
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), glassMat);
  cup.add(glass);

  // asa de cristal macizo
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.425, 0.86, 0), new THREE.Vector3(0.56, 0.88, 0), new THREE.Vector3(0.68, 0.78, 0),
    new THREE.Vector3(0.7, 0.6, 0), new THREE.Vector3(0.64, 0.44, 0), new THREE.Vector3(0.5, 0.36, 0),
    new THREE.Vector3(0.405, 0.35, 0),
  ]);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 96, 0.038, 24, false), glassMat);
  cup.add(handle);

  // ---------- líquido: un solo volumen con color por altura (degradados entre capas) ----------
  const GRAD_N = 256;
  const gradData = new Float32Array(GRAD_N * 4);
  const gradTex = new THREE.DataTexture(gradData, 1, GRAD_N, THREE.RGBAFormat, THREE.FloatType);
  gradTex.magFilter = THREE.LinearFilter;
  gradTex.minFilter = THREE.LinearFilter;
  gradTex.needsUpdate = true;

  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.1, envMapIntensity: 0.45,
    clippingPlanes: [clip], side: THREE.DoubleSide,
  });
  liquidMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrad = { value: gradTex };
    sh.uniforms.uY0 = { value: Y0 };
    sh.uniforms.uY1 = { value: Y1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLY;\nuniform sampler2D uGrad;\nuniform float uY0;\nuniform float uY1;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = texture2D(uGrad, vec2(0.5, clamp((vLY - uY0) / (uY1 - uY0), 0.0, 1.0))).rgb;');
  };
  const liqProfile = [];
  for (let i = 0; i <= 80; i++) {
    const y = Y0 + ((Y1 + 0.02 - Y0) * i) / 80;
    liqProfile.push(new THREE.Vector2(Math.max(innerR(y) - 0.005, 0.0001), y));
  }
  liqProfile.unshift(new THREE.Vector2(0, Y0));
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(liqProfile, 128), liquidMat);
  cup.add(liquid);

  // superficie (disco) — crema si arriba hay café, si no el color de la capa de arriba
  const cremaTex = cremaTexture();
  const surfMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.6, envMapIntensity: 0.6 });
  const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 128), surfMat);
  surface.rotation.x = -Math.PI / 2;
  cup.add(surface);

  // espuma: cúpula con microburbuja
  const foamBump = noiseTexture(512, 0.0, 1.0, 3);
  const foamMat = new THREE.MeshPhysicalMaterial({
    color: '#f2eadc', roughness: 0.78, bumpMap: foamBump, bumpScale: 1.2, sheen: 0.6, sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#fff6ea'), envMapIntensity: 0.7,
  });
  const domeGeo = new THREE.SphereGeometry(1, 128, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, foamMat);
  cup.add(dome);

  // toppings
  const dustCacao = dustTexture('#3a2114', '#20110a');
  const dustCanela = dustTexture('#a1612e', '#6e3b18');
  const dustMat = new THREE.MeshStandardMaterial({ map: dustCacao, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const dustDome = new THREE.Mesh(domeGeo, dustMat);
  const dustDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), dustMat);
  dustDisc.rotation.x = -Math.PI / 2;
  cup.add(dustDome, dustDisc);
  const drizzleMat = new THREE.MeshPhysicalMaterial({ color: '#a8561a', roughness: 0.08, clearcoat: 1, envMapIntensity: 1.3 });
  const drizzle = new THREE.Mesh(drizzleGeometry(0), drizzleMat);
  cup.add(drizzle);

  // hielo
  // sin transmission: lo transmisivo detrás del cristal no se vería
  const iceMat = new THREE.MeshPhysicalMaterial({ color: '#e9f1f4', roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, envMapIntensity: 1.8 });
  const ice = [];
  const iceGeo = roundedBox(0.15, 0.03);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(iceGeo, iceMat);
    c.userData = { a: (i / 4) * Math.PI * 2 + 0.4, r: 0.17 + (i % 2) * 0.07, ph: i * 1.7, rot: new THREE.Euler(i * 0.7, i * 1.3, i * 0.4) };
    cup.add(c);
    ice.push(c);
  }

  // chorro
  const streamGeo = new THREE.CylinderGeometry(0.028, 0.022, 1, 24, 1, true);
  streamGeo.translate(0, 0.5, 0);
  const stream = new THREE.Mesh(streamGeo, new THREE.MeshPhysicalMaterial({ color: '#3a1d0c', roughness: 0.08, clearcoat: 1, envMapIntensity: 1.2 }));
  stream.position.x = 0.05;
  cup.add(stream);
  const splash = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.06, 48),
    new THREE.MeshBasicMaterial({ color: '#b07a48', transparent: true, opacity: 0.5, depthWrite: false })
  );
  splash.rotation.x = -Math.PI / 2;
  cup.add(splash);

  // vapor
  const steamTex = steamTexture();
  const steam = [];
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, color: '#efe4d6', transparent: true, opacity: 0, depthWrite: false }));
    sp.userData = { ph: i / 7, x: (Math.random() - 0.5) * 0.25, z: (Math.random() - 0.5) * 0.2, rot: Math.random() * 6 };
    cup.add(sp);
    steam.push(sp);
  }

  // ---------- estado ----------
  const layerState = {};
  const defaults = { syrup: '#a65a1e', milk: '#efe6d6', coffee: '#3a1d0c', foam: '#f2eadc' };
  for (const k of ORDER) layerState[k] = { h: 0, color: new THREE.Color(defaults[k]) };

  const state = {
    nx: 0, ny: 0, size: 0.5,
    introY: 0, introS: 1,
    tilt: 0.32,
    spin: 0, autoSpin: !reduced,
    stream: 0, cap: 0,
    topping: 'none', toppingK: 0,
    iceK: 0, steamK: reduced ? 0 : 1,
    visible: true, sizeK: 1,
  };

  const drag = { on: false, x: 0, v: 0, angle: 0 };
  let w = 1, h = 1;
  function resize() {
    w = canvas.clientWidth || innerWidth;
    h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  const viewH = () => 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  // degradado vertical a partir de las capas (con mezcla suave en las juntas)
  const tmp = new THREE.Color();
  const BLEND = { syrup: 0.012, milk: 0.05, coffee: 0.035, foam: 0.03 };
  function writeGradient() {
    const bands = [];
    let y = 0;
    for (const k of ORDER) {
      const hh = Math.max(layerState[k].h, 0);
      if (hh > 0.001) bands.push({ k, a: y, b: y + hh, c: layerState[k].color });
      y += hh;
    }
    for (let i = 0; i < GRAD_N; i++) {
      const u = i / (GRAD_N - 1);
      let r = 0, g = 0, b = 0, wsum = 0;
      for (const band of bands) {
        const bl = BLEND[band.k];
        const wgt = smooth(band.a - bl, band.a + bl, u) * (1 - smooth(band.b - bl, band.b + bl, u));
        if (wgt <= 0) continue;
        tmp.copy(band.c).convertSRGBToLinear();
        r += tmp.r * wgt; g += tmp.g * wgt; b += tmp.b * wgt; wsum += wgt;
      }
      if (wsum < 1e-4 && bands.length) {
        tmp.copy(bands[u < bands[0].a ? 0 : bands.length - 1].c).convertSRGBToLinear();
        r = tmp.r; g = tmp.g; b = tmp.b; wsum = 1;
      }
      gradData[i * 4] = r / (wsum || 1);
      gradData[i * 4 + 1] = g / (wsum || 1);
      gradData[i * 4 + 2] = b / (wsum || 1);
      gradData[i * 4 + 3] = 1;
    }
    gradTex.needsUpdate = true;
  }
  let gradKey = '';

  const up = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const qWorld = new THREE.Quaternion();
  const clock = new THREE.Clock();
  let t = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    if (!state.visible) return;

    const H = viewH();
    const W = H * camera.aspect;
    const s = ((state.size * H) / (CUP_H * 1.15)) * state.introS * state.sizeK;
    place.position.set((state.nx * W) / 2, (state.ny * H) / 2 + state.introY, 0);
    place.scale.setScalar(s);
    tilt.rotation.x = state.tilt;

    if (!drag.on) {
      drag.v *= 0.94;
      drag.angle += drag.v;
      if (state.autoSpin) drag.angle += dt * 0.2;
    }
    spin.rotation.y = state.spin + drag.angle;

    // alturas
    let total = 0;
    let topKey = null;
    for (const k of ORDER) {
      const hh = Math.max(layerState[k].h, 0);
      if (hh > 0.002) topKey = k;
      total += hh;
    }
    total = Math.min(total, 1);
    const key = ORDER.map((k) => layerState[k].h.toFixed(4) + layerState[k].color.getHexString()).join();
    if (key !== gradKey) { writeGradient(); gradKey = key; }

    const topY = Y0 + total * (Y1 - Y0);
    const rTop = Math.max(innerR(topY) - 0.005, 0.001);
    const hasLiquid = total > 0.004;

    // plano de corte del líquido en coordenadas de mundo
    cup.updateWorldMatrix(true, false);
    cup.getWorldQuaternion(qWorld);
    up.set(0, 1, 0).applyQuaternion(qWorld);
    pt.set(0, topY, 0);
    cup.localToWorld(pt);
    clip.setFromNormalAndCoplanarPoint(up.clone().negate(), pt);
    liquid.visible = hasLiquid;

    // superficie
    surface.visible = hasLiquid;
    surface.position.y = topY;
    surface.scale.setScalar(rTop);
    if (topKey === 'coffee') {
      if (surfMat.map !== cremaTex) { surfMat.map = cremaTex; surfMat.needsUpdate = true; }
      surfMat.color.set(0xffffff);
    } else {
      if (surfMat.map) { surfMat.map = null; surfMat.needsUpdate = true; }
      if (topKey) surfMat.color.copy(layerState[topKey].color);
    }

    // espuma
    const domeH = 0.1 * state.cap;
    dome.visible = hasLiquid && state.cap > 0.01 && layerState.foam.h > 0.01;
    dome.position.y = topY - 0.002;
    dome.scale.set(rTop, Math.max(domeH, 0.001), rTop);
    foamMat.color.copy(layerState.foam.color);

    // toppings
    const tk = state.toppingK;
    const dust = state.topping === 'cacao' || state.topping === 'canela';
    dustDome.visible = dust && dome.visible && tk > 0.01;
    dustDisc.visible = dust && !dome.visible && hasLiquid && tk > 0.01;
    dustMat.opacity = tk;
    dustDome.position.y = topY;
    dustDome.scale.set(rTop * 1.004, Math.max(domeH, 0.001) * 1.05, rTop * 1.004);
    dustDisc.position.y = topY + 0.003;
    dustDisc.scale.setScalar(rTop);
    drizzle.visible = state.topping === 'caramelo' && tk > 0.01 && hasLiquid;
    drizzle.position.y = topY;
    const dk = rTop * (0.6 + 0.4 * tk);
    drizzle.scale.setScalar(dk);

    // hielo
    for (const c of ice) {
      const u = c.userData;
      c.visible = state.iceK > 0.01 && hasLiquid;
      c.scale.setScalar(state.iceK);
      c.position.set(Math.cos(u.a + t * 0.08) * u.r, topY - 0.055 + Math.sin(t * 1.3 + u.ph) * 0.01, Math.sin(u.a + t * 0.08) * u.r);
      c.rotation.set(u.rot.x + t * 0.04, u.rot.y + t * 0.06, u.rot.z);
    }

    // cáustica proporcional al café
    caustic.material.opacity = Math.min(1, total * 1.6);

    // chorro
    stream.visible = state.stream > 0.01;
    stream.position.y = topY;
    stream.scale.set(state.stream * (1 + Math.sin(t * 38) * 0.05), 4 - topY, state.stream);
    splash.visible = stream.visible && hasLiquid;
    splash.position.set(0.05, topY + 0.003, 0);
    const sp = (t * 2.4) % 1;
    splash.scale.setScalar(1 + sp * 3);
    splash.material.opacity = 0.45 * (1 - sp) * state.stream;

    // vapor (sólo bebidas calientes con algo dentro)
    const hot = hasLiquid && state.iceK < 0.5 ? state.steamK : 0;
    for (const v of steam) {
      const u = v.userData;
      const k = (t * 0.12 + u.ph) % 1;
      v.visible = hot > 0.01;
      v.position.set(u.x + Math.sin(t * 0.7 + u.rot) * 0.06 * k, topY + 0.1 + k * 0.9, u.z);
      const sc = 0.25 + k * 0.55;
      v.scale.set(sc, sc * 1.3, 1);
      v.material.opacity = hot * 0.11 * Math.sin(k * Math.PI);
      v.material.rotation = u.rot + k * 0.6;
    }

    renderer.render(scene, camera);
  }

  function setTopping(name, domeFactor) {
    if (name === 'cacao' || name === 'canela') {
      dustMat.map = name === 'canela' ? dustCanela : dustCacao;
      dustMat.needsUpdate = true;
    }
    if (name === 'caramelo') {
      drizzle.geometry.dispose();
      // main.js pasa cap*0.13; aquí la cúpula mide 0.1*cap en unidades del vaso
      drizzle.geometry = drizzleGeometry((((domeFactor || 0) / 0.13) * 0.1) / 0.44);
    }
  }

  function dragStart(x) { drag.on = true; drag.x = x; drag.v = 0; }
  function dragMove(x) {
    if (!drag.on) return;
    const d = ((x - drag.x) / Math.max(w, 1)) * Math.PI * 2.2;
    drag.angle += d;
    drag.v = d;
    drag.x = x;
  }
  function dragEnd() { drag.on = false; }
  function compile() { renderer.compile(scene, camera); }

  return {
    state, layerState, ORDER, CAPACITY, setTopping, frame, resize, compile,
    dragStart, dragMove, dragEnd, renderer,
    colorOf: (hex) => new THREE.Color(hex),
  };
}

// ---------- helpers ----------
function smooth(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// estudio fotográfico: caja oscura con softbox cálido, tira de luz y panel cenital
function studioEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: '#0c0907', side: THREE.BackSide }));
  env.add(room);
  const panel = (pw, ph, color, intensity, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(5, 7, '#ffd2a6', 3.2, [-7, 1.5, 3]);     // softbox cálido a la izquierda
  panel(0.8, 8, '#ffffff', 4.5, [6.5, 0.5, 1]);  // tira vertical a la derecha
  panel(8, 3, '#fff1e2', 1.4, [0, 5.9, 0]);      // panel cenital
  panel(0.6, 6, '#ffb98a', 2.2, [2, 0.5, -8]);   // contra
  return env;
}

function radialTexture(stops, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function noiseTexture(size, lo, hi, blobs = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((lo + Math.random() * (hi - lo)) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // microburbujas
  for (let i = 0; i < blobs * 900; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 0.6 + Math.random() * 2.6;
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function cremaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 256, 10, 256, 256, 256);
  grd.addColorStop(0, '#a46a3a');
  grd.addColorStop(0.45, '#8a5428');
  grd.addColorStop(0.85, '#5e3416');
  grd.addColorStop(1, '#3a1d0c');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  // atigrado de la crema
  for (let i = 0; i < 1400; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 250;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(196,140,86,0.22)' : 'rgba(70,36,16,0.25)';
    g.beginPath();
    g.ellipse(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 1 + Math.random() * 5, 0.6 + Math.random() * 2, a, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dustTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 14000; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 236;
    g.fillStyle = Math.random() > 0.4 ? a : b;
    g.globalAlpha = 0.3 + Math.random() * 0.6;
    const s = 0.8 + Math.random() * 2.2;
    g.fillRect(256 + Math.cos(ang) * r, 256 + Math.sin(ang) * r, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function steamTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 64 + (Math.random() - 0.5) * 40, y = 64 + (Math.random() - 0.5) * 60, r = 18 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// hilo de caramelo en zigzag sobre una superficie de radio 1 (se escala al radio real)
function drizzleGeometry(domeH) {
  const pts = [];
  const R = 0.82;
  const rows = 7;
  for (let i = 0; i <= rows; i++) {
    const z = -R + (2 * R * i) / rows;
    const half = Math.sqrt(Math.max(R * R - z * z, 0));
    const xa = i % 2 ? half : -half;
    const xb = -xa;
    for (let j = 0; j <= 6; j++) {
      const x = xa + ((xb - xa) * j) / 6;
      const zz = z + Math.sin(j * 1.3 + i) * 0.03;
      const rr = Math.min(Math.sqrt(x * x + zz * zz), 1);
      pts.push(new THREE.Vector3(x, domeH * Math.sqrt(Math.max(1 - rr * rr, 0)) + 0.006, zz));
    }
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.03, 10, false);
}

function roundedBox(size, r) {
  const g = new THREE.BoxGeometry(size, size, size, 4, 4, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const inner = size / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(
      Math.max(-inner, Math.min(inner, v.x)),
      Math.max(-inner, Math.min(inner, v.y)),
      Math.max(-inner, Math.min(inner, v.z))
    );
    const d = v.clone().sub(c).normalize().multiplyScalar(r);
    p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
  }
  g.computeVertexNormals();
  return g;
}

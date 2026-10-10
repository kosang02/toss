import * as T from "./three.module.js";
import { WORLD, clamp, distance, landRadius } from "./engine.js";
const COLORS = [
  "#c7a851",
  "#87abc2",
  "#a17b53",
  "#8d9490",
  "#d6e0df",
  "#e3b356",
  "#d479a2",
];
export class View {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#227caa");
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.camera = new T.OrthographicCamera(-60, 60, 60, -60, 0.1, 1200);
    this.camera.position.set(20, 75, 50);
    this.mats = new Map();
    this.geos = new Map();
    this.root = new T.Group();
    this.scene.add(this.root);
    this.scene.add(new T.HemisphereLight("#ebf4fb", "#68614e", 1.5));
    this.sun = new T.DirectionalLight("#fff4d6", 2.2);
    this.sun.position.set(-40, 90, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -70,
      right: 70,
      top: 70,
      bottom: -70,
      near: 1,
      far: 240,
    });
    this.sun.shadow.bias = -0.002;
    this.scene.add(this.sun, this.sun.target);
    this.islands = new Map();
    this.actors = new Map();
    this.items = new Map();
    this.projectiles = new Map();
    this.fx = new Map();
    this.whales = [];
    this.labels = [];
    this.focus = new T.Vector3();
    this.player = null;
    this.playerLevel = 0;
    this.playerFlag = -1;
    this.world = -1;
    this.crew = [];
    this.crewSignature = "";
    this.ray = new T.Raycaster();
    this.plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this.pointer = new T.Vector2();
    this.water = this.makeWater();
    this.makeWorld();
    this.resize();
  }
  mat(color) {
    if (!this.mats.has(color))
      this.mats.set(
        color,
        new T.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
      );
    return this.mats.get(color);
  }
  geo(type, args) {
    const key = type + JSON.stringify(args);
    if (!this.geos.has(key)) this.geos.set(key, new T[type](...args));
    return this.geos.get(key);
  }
  mesh(group, type, args, color, x = 0, y = 0, z = 0) {
    const o = new T.Mesh(this.geo(type, args), this.mat(color));
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    group.add(o);
    return o;
  }
  box(g, c, w, h, d, x = 0, y = 0, z = 0) {
    return this.mesh(g, "BoxGeometry", [w, h, d], c, x, y, z);
  }
  cone(g, c, r, h, n = 6, x = 0, y = 0, z = 0) {
    return this.mesh(g, "ConeGeometry", [r, h, n], c, x, y, z);
  }
  makeWater() {
    const geo = new T.PlaneGeometry(1200, 1200, 64, 64);
    geo.rotateX(-Math.PI / 2);
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uTitle: { value: 1 } },
      vertexShader: `varying vec3 wp;varying vec2 screenUV;uniform float uTime;void main(){vec3 p=position;p.y=sin(p.x*.2+uTime)*.035+sin(p.z*.17-uTime)*.035;vec4 world=modelMatrix*vec4(p,1.);wp=world.xyz;vec4 clip=projectionMatrix*viewMatrix*world;screenUV=clip.xy/clip.w*.5+.5;gl_Position=clip;}`,
      fragmentShader: `precision highp float;varying vec3 wp;varying vec2 screenUV;uniform float uTime;uniform float uTitle;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}float fbm(vec2 p){float a=0.;a+=noise(p)*.52;p=mat2(.8,-.6,.6,.8)*p*2.03;a+=noise(p)*.26;p*=2.07;a+=noise(p)*.13;a+=noise(p*2.)*.07;return a;}
 void main(){vec2 p=wp.xz;float t=uTime*.18;float swell=fbm(p*.38+vec2(t,-t*.7));float grain=fbm(p*1.8+vec2(-t,t*.3)+swell*2.);float ripples=fbm(p*vec2(2.9,7.2)+vec2(t*1.7,-t));float highlight=smoothstep(.55,.82,grain)*.25+smoothstep(.57,.84,ripples)*.1;
 vec3 blue=vec3(.12,.405,.59),teal=vec3(.025,.46,.48);vec3 c=mix(blue,teal,(1.-screenUV.y)*uTitle*.85);c+=(swell-.5)*vec3(.028,.061,.071);c+=(grain-.5)*vec3(.055,.09,.1);c+=highlight*vec3(.07,.105,.115);gl_FragColor=vec4(c,.9);}`,
    });
    const water = new T.Mesh(geo, material);
    water.position.y = -0.4;
    this.scene.add(water);
    return water;
  }
  // A triangulated cliff with a separate grass crown and an irregular coastline.
  rock(
    group,
    {
      x = 0,
      z = 0,
      r = 8,
      h = 7,
      seed = 1,
      grass = true,
      colors = ["#756b54", "#8b7b5d", "#617f35"],
      stretch = 1,
    } = {},
  ) {
    const n = 9,
      verts = [],
      rgb = [],
      rand = (i) => {
        const a = Math.sin(seed * 19.13 + i * 73.17) * 17431.19;
        return a - Math.floor(a);
      };
    const ring = (j, i) => {
      const angle = ((i % n) / n) * Math.PI * 2,
        rough = 0.78 + rand(i % n) * 0.3,
        rad = [1.05, 1, 0.7, 0.28][j] * r * rough;
      return [
        x + Math.cos(angle) * rad + (j === 3 ? r * 0.09 : 0),
        [-1.5, 0.8, h * 0.6, h][j] +
          (j > 1 ? (rand((i % n) + 22) - 0.5) * h * 0.18 : 0),
        z + Math.sin(angle) * rad * stretch,
      ];
    };
    const tri = (a, b, c, color) => {
      verts.push(...a, ...b, ...c);
      const col = new T.Color(color);
      rgb.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
    };
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < n; i++) {
        const a = ring(j, i),
          b = ring(j, i + 1),
          c = ring(j + 1, i),
          d = ring(j + 1, i + 1),
          color = j === 2 && grass ? colors[2] : colors[(i + j) % 2];
        tri(a, c, b, color);
        tri(b, c, d, color);
      }
    for (let i = 0; i < n; i++)
      tri(
        ring(3, i),
        [x, h * 0.97, z],
        ring(3, i + 1),
        grass ? colors[2] : colors[i % 2],
      );
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(rgb, 3));
    geo.computeVertexNormals();
    this.terrainMaterial ??= new T.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      side: T.DoubleSide,
    });
    const mesh = new T.Mesh(geo, this.terrainMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  shoreline(group, r, seed = 0, stretch = 1) {
    const count = 48,
      pos = [],
      uv = [];
    for (let i = 0; i <= count; i++) {
      const a = (i / count) * Math.PI * 2,
        rough =
          1 + Math.sin(a * 3 + seed) * 0.08 + Math.cos(a * 5 + seed) * 0.045;
      for (const k of [1, 1.24]) {
        pos.push(
          Math.cos(a) * r * rough * k,
          -0.29,
          Math.sin(a) * r * rough * k * stretch,
        );
        uv.push(i / count, (k - 1) / 0.24);
      }
    }
    const ids = [];
    for (let i = 0; i < count; i++) {
      const n = i * 2;
      ids.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(ids);
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 v;uniform float time;void main(){float rip=sin(v.y*24.-time*1.4+sin(v.x*35.)*.5);float a=pow(max(0.,rip),5.)*(1.-v.y)*.22;gl_FragColor=vec4(.67,.88,.87,a);}`,
    });
    const mesh = new T.Mesh(geo, material);
    group.add(mesh);
    this.shorelines ??= [];
    this.shorelines.push(mesh);
    return mesh;
  }

  makeFlag(index = 0) {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 80;
    const c = cv.getContext("2d");
    const colors = [
      "#f3f1e8",
      "#242a30",
      "#c35348",
      "#375f93",
      "#759359",
      "#edc95d",
      "#794a77",
      "#dde3e4",
    ];
    c.fillStyle = colors[index];
    c.fillRect(0, 0, 128, 80);
    if (index === 0) {
      c.save();
      c.translate(64, 40);
      c.rotate(-0.5);
      c.fillStyle = "#cf4d57";
      c.beginPath();
      c.arc(0, 0, 18, Math.PI, 0);
      c.fill();
      c.fillStyle = "#375c8c";
      c.beginPath();
      c.arc(0, 0, 18, 0, Math.PI);
      c.fill();
      c.restore();
      c.fillStyle = "#2d3644";
      for (const [x, y] of [
        [25, 15],
        [94, 17],
        [25, 56],
        [94, 55],
      ])
        for (let k = 0; k < 3; k++) c.fillRect(x, y + k * 4, 13, 2);
    } else if (index === 1) {
      c.fillStyle = "#f7f4dc";
      c.beginPath();
      c.arc(64, 32, 15, 0, Math.PI * 2);
      c.fill();
      c.fillRect(54, 43, 20, 9);
      c.fillStyle = "#242a30";
      c.fillRect(55, 29, 6, 6);
      c.fillRect(67, 29, 6, 6);
      c.strokeStyle = "#f7f4dc";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(43, 58);
      c.lineTo(84, 17);
      c.moveTo(43, 17);
      c.lineTo(84, 58);
      c.stroke();
    } else {
      c.strokeStyle = "#fff0cc";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(30, 40);
      c.lineTo(98, 40);
      c.moveTo(64, 15);
      c.lineTo(64, 65);
      c.stroke();
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  makeBoat(level = 1, enemy = false, flag = 0) {
    const g = new T.Group(),
      width = 1.7 + level * 0.11,
      length = 3.25 + level * 0.3,
      height = 1.15 + level * 0.045;
    const outline = [
      [-0.55, -1],
      [-0.95, -0.65],
      [-1, 0.45],
      [-0.65, 0.85],
      [0, 1.08],
      [0.65, 0.85],
      [1, 0.45],
      [0.95, -0.65],
      [0.55, -1],
    ];
    const vertices = [],
      colors = [],
      tri = (a, b, c, col) => {
        vertices.push(...a, ...b, ...c);
        const cc = new T.Color(col);
        for (let j = 0; j < 3; j++) colors.push(cc.r, cc.g, cc.b);
      };
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length],
        topA = [a[0] * width, height, a[1] * length],
        topB = [b[0] * width, height, b[1] * length],
        lowA = [a[0] * width * 0.76, 0.08, a[1] * length * 0.83],
        lowB = [b[0] * width * 0.76, 0.08, b[1] * length * 0.83];
      tri(topA, lowA, topB, i % 2 ? "#765023" : "#95622e");
      tri(topB, lowA, lowB, i % 2 ? "#765023" : "#835525");
      tri(topA, topB, [0, height, 0], "#b47d39");
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const hull = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: T.DoubleSide,
      }),
    );
    hull.castShadow = true;
    hull.receiveShadow = true;
    g.add(hull);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length],
        dx = (b[0] - a[0]) * width,
        dz = (b[1] - a[1]) * length;
      const rail = this.box(
        g,
        "#a16b2f",
        0.16,
        0.45,
        Math.hypot(dx, dz),
        ((a[0] + b[0]) / 2) * width,
        height + 0.2,
        ((a[1] + b[1]) / 2) * length,
      );
      rail.rotation.y = Math.atan2(dx, dz);
    }
    for (let j = -2; j <= 3; j++)
      this.box(
        g,
        "#92632f",
        width * 1.65,
        0.02,
        0.035,
        0,
        height + 0.02,
        (j * length) / 4,
      );
    const masts = level <= 3 ? 1 : level <= 7 ? 2 : 3;
    for (let j = 0; j < masts; j++) {
      const z = (j - (masts - 1) / 2) * length * 0.8,
        mastH = 4.5 + level * 0.27 - (j % 2) * 0.3,
        sailW = 3 + level * 0.16,
        sailH = mastH * 0.66;
      this.box(g, "#895e31", 0.12, mastH, 0.12, 0, height + mastH / 2, z);
      this.box(
        g,
        "#82552d",
        sailW + 0.25,
        0.12,
        0.12,
        0,
        height + mastH - 0.45,
        z,
      );
      const sg = new T.PlaneGeometry(sailW, sailH, 6, 5),
        points = sg.attributes.position;
      for (let i = 0; i < points.count; i++) {
        const x = points.getX(i),
          y = points.getY(i);
        points.setZ(i, Math.sin((x / sailW + 0.5) * Math.PI) * 0.55);
        points.setX(i, x * (1 + 0.08 * (y / sailH)));
      }
      sg.computeVertexNormals();
      const sm = new T.MeshStandardMaterial({
        color: "#fffdf0",
        map: this.makeFlag(enemy ? 1 : flag),
        side: T.DoubleSide,
        roughness: 1,
      });
      const sail = new T.Mesh(sg, sm);
      sail.position.set(0, height + mastH * 0.57, z);
      sail.castShadow = true;
      g.add(sail);
      const pennant = new T.Mesh(
        new T.PlaneGeometry(0.72, 0.4),
        this.mat(enemy ? "#343136" : "#b39543"),
      );
      pennant.material.side = T.DoubleSide;
      pennant.position.set(0.35, height + mastH - 0.05, z);
      g.add(pennant);
    }
    if (level > 3)
      this.box(
        g,
        "#99703d",
        width * 1.65,
        0.8,
        length * 0.6,
        0,
        height + 0.4,
        -length * 0.58,
      );
    if (level > 7)
      this.box(
        g,
        "#75522f",
        width * 1.5,
        0.7,
        length * 0.55,
        0,
        height + 1.05,
        -length * 0.59,
      );
    const count = [1, 1, 2, 2, 3, 3, 4, 4, 5, 6][level - 1];
    for (const side of [-1, 1])
      for (let i = 0; i < count; i++) {
        const z = -length * 0.65 + ((i + 0.5) / count) * length * 1.4;
        this.box(
          g,
          "#544230",
          0.5,
          0.3,
          0.6,
          side * (width - 0.42),
          height + 0.2,
          z,
        );
        const cannon = this.mesh(
          g,
          "CylinderGeometry",
          [0.16, 0.23, 0.95, 7],
          "#30353c",
          side * (width - 0.05),
          height + 0.42,
          z,
        );
        cannon.rotation.z = Math.PI / 2;
      }
    this.root.add(g);
    return g;
  }

  disposeActor(g) {
    g.traverse((o) => {
      if (o.isMesh) {
        if (![...this.geos.values()].includes(o.geometry)) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats)
          if (![...this.mats.values()].includes(m)) {
            m.map?.dispose();
            m.dispose();
          }
      }
    });
    g.removeFromParent();
  }
  makeIsland(a) {
    const g = new T.Group();
    g.position.set(a.landCenter.x, 0, a.landCenter.z);
    const r = landRadius(a),
      palettes = {
        green: ["#817054", "#a58c66", "#668a35"],
        blue: ["#6a6d6c", "#8c9697", "#558d9e"],
        desert: ["#a77939", "#c09245", "#caaa67"],
        ice: ["#92c0d0", "#c0dfe2", "#e2f1ec"],
        pink: ["#996f70", "#c69494", "#dba6b4"],
      },
      colors = palettes[a.biome] || palettes.green;
    // The original islands have distinctive silhouettes rather than repeated discs.
    const h = r * (a.id === 0 ? 0.5 : 0.35 + (a.id % 5) * 0.11),
      stretch = a.id % 4 === 0 ? 1.2 : a.id % 4 === 1 ? 0.82 : 1;
    this.rock(g, { r, h, seed: a.id + 2, colors, stretch });
    if (a.id !== 0 && r > 7) {
      for (let i = 0; i < 2 + (a.id % 3); i++) {
        const angle = i * 2.5 + a.id;
        this.rock(g, {
          x: Math.cos(angle) * r * 0.55,
          z: Math.sin(angle) * r * 0.5,
          r: r * (0.25 + i * 0.04),
          h: h * (0.5 + i * 0.14),
          seed: a.id * 9 + i,
          colors,
          grass: i % 2 === 0,
        });
      }
    }
    if (a.id === 0) {
      this.rock(g, {
        x: r * 0.27,
        z: r * 0.28,
        r: r * 0.56,
        h: h * 1.3,
        seed: 19,
        colors,
      });
      this.rock(g, {
        x: -r * 0.36,
        z: r * 0.3,
        r: r * 0.45,
        h: h * 0.7,
        seed: 23,
        colors,
      });
    }
    if (a.biome === "green" && a.id % 3 === 1 && r > 8)
      for (let i = 0; i < 3; i++)
        this.tree(
          g,
          Math.sin(i * 2.1) * r * 0.33,
          Math.cos(i * 2.1) * r * 0.32,
          0.7,
        );
    if (a.biome === "ice")
      for (let i = 0; i < 3; i++)
        this.rock(g, {
          x: Math.sin(i * 2) * r * 0.5,
          z: Math.cos(i * 2) * r * 0.5,
          r: r * 0.23,
          h: r * 0.65,
          seed: i + 7,
          colors: ["#b7d8dd", "#d4e9e9", "#f7faf0"],
        });
    if (a.biome === "pink") {
      this.box(g, "#786444", 0.5, 6, 0.5, 0, h + 2, 0);
      for (let i = 0; i < 5; i++)
        this.mesh(
          g,
          "IcosahedronGeometry",
          [2.2, 0],
          i % 2 ? "#d692a9" : "#efbdd0",
          Math.sin(i * 1.25) * 2,
          h + 5,
          Math.cos(i * 1.25) * 2,
        );
    }
    const px = a.port.x - a.landCenter.x,
      pz = a.port.z - a.landCenter.z,
      angle = Math.atan2(px, pz),
      d = Math.hypot(px, pz),
      pier = new T.Group();
    pier.rotation.y = angle;
    g.add(pier);
    const start = Math.max(1, Math.min(r * 0.55, d - 6)),
      end = Math.max(start + 2, d - 4);
    for (let j = start; j < end; j += 0.7)
      this.box(
        pier,
        j % 2 > 0.8 ? "#956d3f" : "#a07847",
        3.9,
        0.32,
        0.65,
        0,
        0.68,
        j,
      );
    for (const x of [-1.7, 1.7])
      for (let j = start; j < end; j += 3.5)
        this.box(pier, "#795b36", 0.38, 2.7, 0.38, x, 0.25, j);
    for (let x = -7; x <= 7; x += 0.65)
      this.box(pier, "#9a7545", 0.6, 0.32, 2.5, x, 0.68, d - 4);
    for (const x of [-6.5, 0, 6.5])
      for (const z of [d - 5, d - 3])
        this.box(pier, "#715735", 0.36, 2.8, 0.36, x, 0.2, z);
    if (a.world === 1) {
      const building = new T.Group();
      building.position.set(0, h * 0.65, 0);
      g.add(building);
      this.box(building, "#c8b790", 4.4, 5, 4.4, 0, 2.5, 0);
      this.cone(building, "#a67d53", 3.4, 2, 4, 0, 6, 0).rotation.y =
        Math.PI / 4;
      if (a.id === 28) {
        const tower = new T.Group();
        tower.position.x = 3;
        tower.rotation.z = -0.08;
        building.add(tower);
        for (let j = 0; j < 6; j++) {
          this.mesh(
            tower,
            "CylinderGeometry",
            [2, 2, 1.4, 12],
            "#dbd6b9",
            0,
            1 + j * 1.4,
            0,
          );
          for (let k = 0; k < 10; k++) {
            const a = (k * Math.PI) / 5;
            this.box(
              tower,
              "#9b927b",
              0.15,
              1.05,
              0.15,
              Math.sin(a) * 1.95,
              1 + j * 1.4,
              Math.cos(a) * 1.95,
            );
          }
          this.mesh(
            tower,
            "CylinderGeometry",
            [2.2, 2.2, 0.14, 12],
            "#ece4c9",
            0,
            1.7 + j * 1.4,
            0,
          );
        }
      }
    }
    const flagPos = new T.Vector3(
      px - Math.cos(angle) * 3,
      1,
      pz + Math.sin(angle) * 3,
    );
    this.box(g, "#8a693f", 0.12, 4, 0.12, flagPos.x, 2.5, flagPos.z);
    const flag = new T.Mesh(
      new T.PlaneGeometry(1.65, 1.1),
      new T.MeshBasicMaterial({
        map: this.makeFlag(
          this.game.owned.includes(a.id) ? this.game.state.flag : 1,
        ),
        side: T.DoubleSide,
      }),
    );
    flag.position.set(flagPos.x + 0.8, 3.8, flagPos.z);
    g.add(flag);
    g.userData = {
      flag,
      a,
      owned: this.game.owned.includes(a.id),
      flagIndex: this.game.state.flag,
    };
    this.shoreline(g, r, a.id, stretch);
    this.root.add(g);
    this.islands.set(a.id, g);
    return g;
  }

  tree(g, x, z, s = 1) {
    const trunk = this.box(g, "#74604a", 0.45, 5, 0.45, x, 4, z);
    trunk.rotation.z = 0.08;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const leaf = this.cone(
        g,
        i % 2 ? "#527d50" : "#6c995b",
        1.1,
        4.8,
        3,
        x + Math.sin(a) * 1.65,
        6,
        z + Math.cos(a) * 1.65,
      );
      leaf.rotation.set(Math.cos(a) * 1.25, a, Math.sin(a) * 1.25);
      leaf.scale.x = 0.65;
    }
  }
  makeLabel(text, x, y, z) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const c = canvas.getContext("2d");
    c.font = "450 27px DokdoKorean";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = "#173d5a";
    c.shadowBlur = 3;
    c.fillStyle = "#edf1df";
    c.fillText(text, 256, 48);
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    const o = new T.Sprite(
      new T.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        opacity: 0.9,
      }),
    );
    o.position.set(x, y, z);
    o.scale.set(30, 5.62, 1);
    this.root.add(o);
    return o;
  }
  makeWorld() {
    WORLD.islands.forEach((a) => this.makeIsland(a));
    this.arenas = [];
    for (const a of WORLD.special.arena.filter((a) => a.kind === "ArenaDoor")) {
      const g = new T.Group();
      g.position.set(a.x, 0, a.z);
      for (let j = 0; j < 12; j++) {
        const t = (j * Math.PI) / 6;
        this.box(g, "#b5ad91", 2, 6, 2, Math.sin(t) * 18, 3, Math.cos(t) * 18);
      }
      const ring = this.mesh(
        g,
        "TorusGeometry",
        [18, 1.2, 4, 24],
        "#ccc2a0",
        0,
        6,
        0,
      );
      ring.rotation.x = Math.PI / 2;
      g.userData.world = a.world;
      this.root.add(g);
      this.arenas.push(g);
      const label = this.makeLabel("아레나", a.x, 9, a.z);
      label.userData.world = a.world;
      this.labels.push(label);
    }
    this.krakens = [];
    for (const k of WORLD.special.kraken) {
      const g = new T.Group();
      g.position.set(k.x, -1, k.z);
      const body = this.mesh(
        g,
        "SphereGeometry",
        [4, 8, 6],
        "#9a646f",
        0,
        1,
        0,
      );
      for (let j = 0; j < 4; j++) {
        const a = (j * Math.PI) / 2;
        const tent = this.mesh(
          g,
          "TorusGeometry",
          [5, 0.7, 5, 12, Math.PI],
          "#bd7778",
          Math.sin(a) * 5,
          0,
          Math.cos(a) * 5,
        );
        tent.rotation.y = a;
        tent.rotation.z = 0.15;
      }
      this.root.add(g);
      g.userData.world = k.world;
      this.krakens.push(g);
    }
    const d = WORLD.special.dokdo[0];
    this.dokdo = new T.Group();
    this.dokdo.position.set(d.x, 0, d.z);
    for (const [x, z, r, h, seed] of [
      [-13, 0, 9, 7, 1],
      [-18, 3, 5, 6, 2],
      [-10, -5, 6, 8, 3],
      [12, 1, 8, 11, 4],
      [18, -1, 5, 6, 5],
      [1, -6, 3, 5, 6],
      [-29, -4, 2.5, 3.4, 7],
      [-21, 13, 2, 2.5, 8],
      [24, -9, 2, 2, 9],
      [3, 15, 1.5, 2, 10],
    ])
      this.rock(this.dokdo, {
        x,
        z,
        r,
        h,
        seed,
        grass: r > 4,
        colors: ["#756e58", "#91836a", "#638d38"],
      });
    this.dokdo.rotation.y = Math.PI * 0.85;
    this.root.add(this.dokdo);
    const dl = this.makeLabel("독도", d.x, 15, d.z);
    dl.userData.world = 0;
    this.labels.push(dl);

    for (let i = 0; i < 5; i++) {
      const g = new T.Group();
      const whale = this.mesh(
        g,
        "SphereGeometry",
        [3, 8, 6],
        "#416f82",
        0,
        -1,
        0,
      );
      whale.scale.set(1, 0.6, 2.4);
      const tail = this.cone(g, "#44758a", 2.5, 4, 3, 0, -0.7, -8);
      tail.rotation.x = Math.PI / 2;
      g.position.set(
        70 + Math.sin(i * 2) * 400,
        -1,
        70 + Math.cos(i * 2) * 400,
      );
      this.root.add(g);
      this.whales.push(g);
    }
  }
  actorSync(map, list, create, update) {
    const ids = new Set(list.map((e) => e.id));
    for (const [id, g] of map)
      if (!ids.has(id)) {
        this.disposeActor(g);
        map.delete(id);
      }
    for (const a of list) {
      let g = map.get(a.id);
      if (!g) {
        g = create(a);
        map.set(a.id, g);
      }
      update(g, a);
    }
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth,
      h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.width = w;
    this.height = h;
    this.aspect = w / h;
    this.setZoom();
  }
  setZoom() {
    const s = this.game.state,
      zoom = !s.started
        ? Math.max(48, 39 / this.aspect)
        : (s.docked >= 0 ? (this.aspect < 0.7 ? 43 : 38) : 40) +
          s.levels.body * 0.85;
    this.camera.left = -zoom * this.aspect;
    this.camera.right = zoom * this.aspect;
    this.camera.top = zoom;
    this.camera.bottom = -zoom;
    this.camera.updateProjectionMatrix();
  }
  screenToWorld(x, y) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((x - r.left) / r.width) * 2 - 1,
      (-(y - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
    const v = new T.Vector3();
    return this.ray.ray.intersectPlane(this.plane, v)
      ? { x: v.x, z: v.z }
      : null;
  }
  render(dt, t) {
    const game = this.game,
      s = game.state;
    const title = !s.started,
      d = WORLD.special.dokdo[0];
    const focus = title
      ? { x: d.x, z: d.z }
      : game.port
        ? {
            x: (s.x + game.port.landCenter.x) / 2,
            z: (s.z + game.port.landCenter.z) / 2,
          }
        : s;
    const offset = title ? 6 : s.docked >= 0 ? -20 : 0;
    this.focus.lerp(
      new T.Vector3(focus.x, 0, focus.z + offset),
      clamp(dt * 5, 0, 1),
    );
    if (!this.initialized) {
      this.focus.set(focus.x, 0, focus.z + offset);
      this.initialized = true;
    }
    this.setZoom();
    this.camera.position.set(this.focus.x - 18, 65, this.focus.z - 48);
    this.camera.lookAt(this.focus);
    this.sun.position.set(focus.x - 50, 90, focus.z + 30);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.water.position.x = focus.x;
    this.water.position.z = focus.z;
    this.water.material.uniforms.uTime.value = t;
    this.water.material.uniforms.uTitle.value = title ? 1 : 0;
    for (const foam of this.shorelines || [])
      foam.material.uniforms.time.value = t;
    if (
      !this.player ||
      this.playerLevel !== s.levels.body ||
      this.playerFlag !== s.flag
    ) {
      if (this.player) this.disposeActor(this.player);
      this.player = this.makeBoat(s.levels.body, false, s.flag);
      this.playerLevel = s.levels.body;
      this.playerFlag = s.flag;
    }
    this.player.visible = !title;
    this.player.position.set(
      s.x,
      Math.sin(t * 1.7) * 0.08 - (game.dead ? 1.5 : 0),
      s.z,
    );
    this.player.rotation.set(
      Math.sin(t) * 0.012,
      s.heading,
      Math.sin(t * 1.7) * 0.022,
    );
    if (game.dead) this.player.rotation.z = 0.8;
    for (const [id, g] of this.islands) {
      g.visible =
        !title &&
        g.userData.a.world === s.world &&
        distance(focus, g.position) < 250;
      const owned = game.owned.includes(id);
      if (
        owned !== g.userData.owned ||
        (owned && g.userData.flagIndex !== s.flag)
      ) {
        g.userData.flag.material.map.dispose();
        g.userData.flag.material.map = this.makeFlag(owned ? s.flag : 1);
        g.userData.owned = owned;
        g.userData.flagIndex = s.flag;
      }
    }
    for (const label of this.labels)
      label.visible =
        !title &&
        label.userData.world === s.world &&
        distance(focus, label.position) < 110;
    this.dokdo.visible = title || (s.world === 0 && distance(focus, d) < 250);
    for (const g of this.arenas)
      g.visible =
        !title &&
        g.userData.world === s.world &&
        distance(focus, g.position) < 230;
    for (const g of this.krakens) {
      g.visible =
        !title &&
        g.userData.world === s.world &&
        distance(focus, g.position) < 180;
      g.position.y = -1 + Math.sin(t * 0.8) * 0.8;
    }
    for (let i = 0; i < this.whales.length; i++) {
      const g = this.whales[i];
      g.visible = !title && s.world === 0 && distance(focus, g.position) < 200;
      g.position.y = -2 + Math.sin(t * 0.25 + i) * 1.3;
      g.rotation.y = t * 0.025 + i;
    }
    this.actorSync(
      this.actors,
      game.enemies,
      (e) => {
        const g = this.makeBoat(e.stats.body, true);
        const bar = this.box(g, "#536e43", 3, 0.08, 0.3, 0, 10, 0);
        g.userData.health = bar;
        return g;
      },
      (g, e) => {
        g.visible = !title;
        g.position.set(e.x, Math.sin(t * 1.8 + e.id) * 0.08, e.z);
        g.rotation.y = e.heading;
        g.userData.health.scale.x = Math.max(0.01, e.hp / e.maxHp);
        g.userData.health.visible = e.hp < e.maxHp;
      },
    );
    this.actorSync(
      this.items,
      game.loot,
      (e) => {
        const g = new T.Group();
        this.box(g, "#a87c47", 1.6, 1.2, 1.4, 0, 0.8, 0);
        this.box(g, "#d3b36c", 1.7, 0.3, 0.2, 0, 1.3, 0);
        this.root.add(g);
        return g;
      },
      (g, e) => {
        g.visible = !title;
        g.position.set(e.x, Math.sin(t * 2 + e.id) * 0.2, e.z);
        g.rotation.y = t * 0.15 + e.id;
      },
    );
    this.actorSync(
      this.projectiles,
      game.bullets,
      (e) => {
        const g = new T.Group();
        this.mesh(
          g,
          "SphereGeometry",
          [0.22, 5, 4],
          e.enemy ? "#47463d" : "#433f34",
        );
        this.root.add(g);
        return g;
      },
      (g, e) => {
        g.position.set(e.x, e.y, e.z);
      },
    );
    this.actorSync(
      this.fx,
      game.effects,
      (e) => {
        const g = new T.Group();
        const mat = new T.MeshBasicMaterial({
          color:
            e.type === "muzzle"
              ? "#ffe4a3"
              : e.type === "explosion"
                ? "#dcba8c"
                : "#deede4",
          transparent: true,
          opacity: 1,
        });
        const o = new T.Mesh(this.geo("IcosahedronGeometry", [1, 0]), mat);
        g.add(o);
        this.root.add(g);
        return g;
      },
      (g, e) => {
        g.position.set(e.x, 2, e.z);
        g.scale.setScalar(
          e.type === "explosion"
            ? (2 - e.life) * 5
            : e.type === "muzzle"
              ? 1.3
              : (0.8 - e.life) * 4,
        );
        g.children[0].material.opacity = clamp(e.life, 0, 1);
      },
    );
    const crewKey = JSON.stringify([
      s.assistants,
      s.seagulls,
      s.nessy,
      s.pickup,
    ]);
    if (this.crewSignature !== crewKey) {
      for (const g of this.crew) this.disposeActor(g);
      this.crew = [];
      for (let i = 0; i < 3; i++)
        if (s.assistants[i]) {
          const g = this.makeBoat(
            Math.min(10, Math.floor(s.assistants[i] / 5) + 1),
            false,
            s.flag,
          );
          g.userData.slot = i;
          this.crew.push(g);
        }
      this.crewSignature = crewKey;
    }
    for (const g of this.crew) {
      g.visible = !title;
      const i = g.userData.slot;
      g.position.set(
        s.x - Math.sin(s.heading + 1) * 8 * (i + 1),
        0,
        s.z - Math.cos(s.heading + 1) * 8 * (i + 1),
      );
      g.rotation.y = s.heading;
    }
    if (!this.wakes) {
      this.wakes = [];
      for (let i = 0; i < 16; i++) {
        const mat = new T.MeshBasicMaterial({
          color: "#d0e5db",
          transparent: true,
          opacity: 0,
          side: T.DoubleSide,
          depthWrite: false,
        });
        const w = new T.Mesh(
          new T.RingGeometry(0.8, 1.1, 12, 1, 0, Math.PI),
          mat,
        );
        w.rotation.x = -Math.PI / 2;
        w.position.y = 0.02;
        w.userData.age = 99;
        this.scene.add(w);
        this.wakes.push(w);
      }
      this.wakeTimer = 0;
    }
    this.wakeTimer += dt;
    if (game.velocity > 2 && !title && this.wakeTimer > 0.13) {
      this.wakeTimer = 0;
      const w = this.wakes.reduce((a, b) =>
        a.userData.age > b.userData.age ? a : b,
      );
      w.userData.age = 0;
      w.position.set(
        s.x - Math.sin(s.heading) * 3,
        0.02,
        s.z - Math.cos(s.heading) * 3,
      );
      w.rotation.z = -s.heading;
    }
    for (const w of this.wakes) {
      w.userData.age += dt;
      const age = w.userData.age;
      w.visible = !title && age < 2;
      w.material.opacity = Math.max(0, (1 - age / 2) * 0.35);
      w.scale.setScalar(1 + age * 4);
    }
    if (!this.pets) {
      this.pets = new T.Group();
      this.root.add(this.pets);
      this.gulls = [];
      for (let i = 0; i < 2; i++) {
        const bird = new T.Group();
        this.mesh(bird, "SphereGeometry", [0.28, 5, 4], "#eee8d4");
        const wings = [];
        for (const side of [-1, 1]) {
          const wing = this.box(
            bird,
            "#e0dfcf",
            1.4,
            0.08,
            0.3,
            side * 0.6,
            0,
            0,
          );
          wings.push(wing);
        }
        this.pets.add(bird);
        bird.userData.wings = wings;
        this.gulls.push(bird);
      }
      this.nessy = new T.Group();
      this.mesh(
        this.nessy,
        "SphereGeometry",
        [1.5, 7, 5],
        "#748a6d",
        0,
        -0.3,
        0,
      ).scale.z = 2;
      this.mesh(
        this.nessy,
        "CylinderGeometry",
        [0.55, 0.8, 3, 7],
        "#819a76",
        0,
        1.8,
        2,
      );
      this.mesh(
        this.nessy,
        "SphereGeometry",
        [0.85, 7, 5],
        "#94ac80",
        0,
        3.5,
        2.2,
      );
      this.pets.add(this.nessy);
    }
    this.pets.visible = !title;
    for (let i = 0; i < 2; i++) {
      const bird = this.gulls[i];
      bird.visible = !!s.seagulls[i];
      bird.position.set(
        s.x + Math.sin(t * 0.6 + i * 3) * 9,
        8 + Math.sin(t + i),
        s.z + Math.cos(t * 0.6 + i * 3) * 9,
      );
      bird.rotation.y = -t * 0.6 - i * 3;
      bird.userData.wings.forEach(
        (wing, j) => (wing.rotation.z = Math.sin(t * 8) * (j ? 1 : -1) * 0.4),
      );
    }
    this.nessy.visible = !!s.nessy;
    this.nessy.position.set(
      s.x + Math.sin(s.heading + 1.8) * 12,
      Math.sin(t) * 0.15,
      s.z + Math.cos(s.heading + 1.8) * 12,
    );
    this.nessy.rotation.y = s.heading;
    if (!this.reflections) this.reflections = new Map();
    const reflectSources = [
      this.player,
      ...this.actors.values(),
      this.dokdo,
      ...this.islands.values(),
    ].filter((g) => g.visible);
    const live = new Set(reflectSources);
    for (const [source, ghost] of this.reflections)
      if (!live.has(source)) {
        ghost.removeFromParent();
        this.reflections.delete(source);
      }
    for (const source of reflectSources) {
      let ghost = this.reflections.get(source);
      if (!ghost) {
        ghost = source.clone(true);
        ghost.traverse((o) => {
          o.castShadow = false;
          o.receiveShadow = false;
          if (o.isSprite || o.material?.isShaderMaterial) o.visible = false;
        });
        this.scene.add(ghost);
        this.reflections.set(source, ghost);
      }
      ghost.position.copy(source.position);
      ghost.position.y = -source.position.y - 0.85;
      ghost.rotation.copy(source.rotation);
      ghost.rotation.x = -source.rotation.x;
      ghost.rotation.z = -source.rotation.z;
      ghost.scale.copy(source.scale);
      ghost.scale.y *= -1;
    }
    this.renderer.render(this.scene, this.camera);
  }
  drawMini(canvas) {
    const c = canvas.getContext("2d"),
      s = this.game.state;
    const size = canvas.width;
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = "#87b2bf22";
    for (let x = 0; x < size; x += 25) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, size);
      c.moveTo(0, x);
      c.lineTo(size, x);
      c.stroke();
    }
    const sc = 0.18;
    for (const a of this.game.islands) {
      c.fillStyle = this.game.owned.includes(a.id) ? "#b5d786" : "#d3a87c";
      const x = size / 2 + (a.x - s.x) * sc,
        y = size / 2 - (a.z - s.z) * sc;
      c.beginPath();
      c.arc(x, y, 4, 0, 7);
      c.fill();
    }
    for (const e of this.game.enemies) {
      c.fillStyle = "#cb7573";
      c.fillRect(
        size / 2 + (e.x - s.x) * sc - 1,
        size / 2 - (e.z - s.z) * sc - 1,
        2,
        2,
      );
    }
    c.translate(size / 2, size / 2);
    c.rotate(s.heading);
    c.fillStyle = "#f9e8b4";
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(-3.5, 4);
    c.lineTo(3.5, 4);
    c.closePath();
    c.fill();
    c.restore();
  }
}

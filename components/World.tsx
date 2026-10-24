"use client";

// The world behind every page: a soft pastel sky over a calm glossy floor, a bike path that curves
// into the distance with its lane lines flowing toward you, pearl spheres and arches that float,
// and a large wheel slowly turning far off. Original work, made with three.js. It follows the light
// and dark theme, drifts with the pointer, pauses when the tab is hidden, runs lighter on phones,
// and holds still for anyone who asks for reduced motion. Without WebGL the CSS sky shows instead.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

interface Palette {
  skyTop: string;
  skyMid: string;
  skyLow: string;
  floor: string;
  fog: string;
  path: string;
  line: string;
  pearl: string;
  arch: string;
  wheel: string;
}

const LIGHT: Palette = { skyTop: "#c9d6f6", skyMid: "#efd6d8", skyLow: "#f9ece6", floor: "#eedfdb", fog: "#f2e3df", path: "#fbf6f4", line: "#2433ff", pearl: "#f4ecf6", arch: "#efcdc6", wheel: "#2433ff" };
const DARK: Palette = { skyTop: "#070b26", skyMid: "#251636", skyLow: "#3a2342", floor: "#120d1c", fog: "#1b1229", path: "#251f3a", line: "#9aa6ff", pearl: "#aaa3dd", arch: "#3a2850", wheel: "#9aa6ff" };

const PATH_POINTS = [
  new THREE.Vector3(0, 0.02, 8),
  new THREE.Vector3(0.6, 0.02, 0),
  new THREE.Vector3(-2.2, 0.02, -12),
  new THREE.Vector3(1.8, 0.02, -26),
  new THREE.Vector3(-3, 0.02, -44),
  new THREE.Vector3(0, 0.02, -64),
];
const PATH_HALF_WIDTH = 1.15;
const DASHES = 70;
const DASH_SPEED = 0.012;

function skyTexture(p: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, p.skyTop);
    grad.addColorStop(0.55, p.skyMid);
    grad.addColorStop(1, p.skyLow);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A flat ribbon along the curve, for the path's surface. */
function ribbon(curve: THREE.CatmullRomCurve3, halfWidth: number, steps: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize().multiplyScalar(halfWidth);
    positions.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
    if (i < steps) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export default function World() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      return; // No WebGL: the CSS sky stays.
    }
    const small = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1 : 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 220);
    camera.position.set(0, 2.3, 10);

    const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.05 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const curve = new THREE.CatmullRomCurve3(PATH_POINTS, false, "catmullrom", 0.5);
    const pathMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 });
    scene.add(new THREE.Mesh(ribbon(curve, PATH_HALF_WIDTH, 220), pathMat));

    const lineMat = new THREE.MeshBasicMaterial();
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.025, 0.85), lineMat, DASHES);
    scene.add(dashes);
    const edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 });
    for (const sign of [1, -1]) {
      const pts = Array.from({ length: 160 }, (_, i) => {
        const t = i / 159;
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        return p.add(new THREE.Vector3(tan.z, 0, -tan.x).normalize().multiplyScalar(sign * (PATH_HALF_WIDTH - 0.08))).setY(0.03);
      });
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeMat));
    }

    const pearlMat = new THREE.MeshPhysicalMaterial({ roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 1, iridescenceIOR: 1.3, sheen: 0.6 });
    const pearlGeo = new THREE.SphereGeometry(1, small ? 32 : 64, small ? 24 : 48);
    const pearls = [
      [-4.2, 1.6, -3, 0.9],
      [5, 2.6, -9, 1.4],
      [-6.5, 3.4, -18, 1.8],
      [3.6, 1.2, -1.5, 0.55],
      [7.5, 4, -26, 2.2],
      [-2.4, 4.6, -30, 1.1],
      [1.5, 0.75, 3, 0.35],
    ].map(([x, y, z, s]) => {
      const m = new THREE.Mesh(pearlGeo, pearlMat);
      m.position.set(x, y, z);
      m.scale.setScalar(s);
      m.userData.baseY = y;
      scene.add(m);
      return m;
    });

    const archMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
    const archGeo = new THREE.TorusGeometry(2.4, 0.42, 24, 72, Math.PI);
    for (const [x, z, ry] of [
      [-5.2, -7, 0.5],
      [5.8, -16, -0.4],
      [-6.6, -34, 0.3],
    ]) {
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(x, 0, z);
      arch.rotation.y = ry;
      scene.add(arch);
    }

    const wheel = new THREE.Group();
    const wheelMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.2, emissiveIntensity: 0.55 });
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.16, 20, 120), wheelMat));
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.05, 12, 120), wheelMat));
    for (let i = 0; i < 16; i += 1) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 7.4, 6), wheelMat);
      spoke.rotation.z = (i / 16) * Math.PI;
      wheel.add(spoke);
    }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 24).rotateX(Math.PI / 2), wheelMat));
    wheel.position.set(4.5, 5.2, -48);
    wheel.rotation.y = -0.35;
    scene.add(wheel);

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1e6, 1.25);
    sun.position.set(8, 12, 6);
    scene.add(sun);

    let sky: THREE.CanvasTexture | null = null;
    const paint = () => {
      const p = darkQuery.matches ? DARK : LIGHT;
      sky?.dispose();
      sky = skyTexture(p);
      scene.background = sky;
      scene.fog = new THREE.Fog(p.fog, 16, 78);
      floorMat.color.set(p.floor);
      pathMat.color.set(p.path);
      lineMat.color.set(p.line);
      edgeMat.color.set(p.line);
      pearlMat.color.set(p.pearl);
      archMat.color.set(p.arch);
      wheelMat.color.set(p.wheel);
      wheelMat.emissive.set(p.wheel);
      hemi.color.set(p.skyTop);
      hemi.groundColor.set(p.floor);
      renderer.toneMappingExposure = darkQuery.matches ? 1.05 : 1.15;
    };
    paint();
    darkQuery.addEventListener("change", paint);

    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const dummy = new THREE.Object3D();
    const look = new THREE.Vector3(0, 1.3, -12);
    const placeDashes = (time: number) => {
      for (let i = 0; i < DASHES; i += 1) {
        const t = 1 - ((i / DASHES + time * DASH_SPEED) % 1);
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        dummy.position.set(p.x, 0.04, p.z);
        dummy.rotation.set(0, Math.atan2(tan.x, tan.z), 0);
        dummy.updateMatrix();
        dashes.setMatrixAt(i, dummy.matrix);
      }
      dashes.instanceMatrix.needsUpdate = true;
    };

    const clock = new THREE.Clock();
    let frame = 0;
    let raf = 0;
    const draw = () => {
      const t = clock.getElapsedTime();
      placeDashes(t);
      pearls.forEach((m, i) => {
        m.position.y = (m.userData.baseY as number) + Math.sin(t * 0.6 + i) * 0.25;
        m.rotation.y = t * 0.2 + i;
      });
      wheel.rotation.z = -t * 0.12;
      camera.position.x += (Math.sin(t * 0.05) * 0.7 + pointer.x * 0.9 - camera.position.x) * 0.03;
      camera.position.y += (2.3 - pointer.y * 0.35 - camera.position.y) * 0.03;
      camera.lookAt(look);
      renderer.render(scene, camera);
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      frame += 1;
      // Phones draw every other frame, so the frosted cards over the world stay smooth.
      if (document.hidden || (small && frame % 2 === 1)) return;
      draw();
    };
    if (still) {
      placeDashes(0);
      camera.lookAt(look);
      renderer.render(scene, camera);
    } else {
      loop();
    }
    requestAnimationFrame(() => el.setAttribute("data-ready", "true"));

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      if (still) renderer.render(scene, camera);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      darkQuery.removeEventListener("change", paint);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      sky?.dispose();
      room.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="world" aria-hidden="true" />;
}

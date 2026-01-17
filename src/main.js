import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

const app = document.getElementById("app");
const overlay = document.getElementById("overlay");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080b);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 1.6, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.0005; //NEVER CHANGE THIS
renderer.shadowMap.enabled = true;
// Sharper, higher-contrast shadows than PCFSoft.
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

// Required for RectAreaLight to render correctly.
RectAreaLightUniformsLib.init();

// Neutral environment + warmer key lighting to avoid a blue cast and make PBR materials look natural.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// Keep fill light low for more dramatic shadows.
const hemiLight = new THREE.HemisphereLight(0xe7eef8, 0x2a241c, 0.18);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff1df, 4.0);
keyLight.position.set(8, 12, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0002;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.radius = 1;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 80;
keyLight.shadow.camera.left = -25;
keyLight.shadow.camera.right = 25;
keyLight.shadow.camera.top = 25;
keyLight.shadow.camera.bottom = -25;
scene.add(keyLight);

// Eyeball-driven warm "sun" (wired up after GLTF loads).
let eyeballObject;
let eyeballSun;
let shipRoot;
const eyeballSunTarget = new THREE.Object3D();
scene.add(eyeballSunTarget);
const tmpWorldPos = new THREE.Vector3();
const tmpWorldTarget = new THREE.Vector3();

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const grid = new THREE.GridHelper(200, 50, 0x2b2f3a, 0x1a1f2a);
grid.position.y = -2;
scene.add(grid);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Pixelation post-process ("pixel shader").
const PixelateShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    pixelSize: { value: 6.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;

    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      gl_FragColor = texture2D(tDiffuse, coord);
    }
  `,
};

const pixelPass = new ShaderPass(PixelateShader);
let pixelSize = 2;
const setPixelSize = (value) => {
  const next = Math.max(1, Math.min(64, Number(value) || pixelSize));
  pixelSize = next;
  pixelPass.uniforms.pixelSize.value = next;
};

setPixelSize(pixelSize);

// Allow tweaking from DevTools console: `setPixelSize(4)`
// (ES modules don't expose top-level variables by default.)
window.pixelPass = pixelPass;
window.setPixelSize = setPixelSize;
pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
pixelPass.uniforms.resolution.value.multiplyScalar(renderer.getPixelRatio());
composer.addPass(pixelPass);

// Apply renderer tone mapping/exposure + color space conversion after post-processing.
composer.addPass(new OutputPass());


const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
loader.setDRACOLoader(dracoLoader);
let mixer;
loader.load(
  "./ship.gltf",
  (gltf) => {
    const model = gltf.scene;
    shipRoot = model;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (!material) return;
          // Reduce environment reflections to deepen shadows/contrast.
          if (typeof material.envMapIntensity === "number") {
            material.envMapIntensity = 0.25;
          }
          if (material.transparent || material.opacity < 1 || material.alphaTest > 0) {
            material.depthWrite = false;
            material.alphaTest = Math.max(material.alphaTest || 0, 0.02);
          }
        });
      }
    });
    model.position.set(0, -1, 0);
    model.scale.setScalar(1);
    scene.add(model);

    // Find the animated eyeball and make it act like a warm sun.
    eyeballObject = model.getObjectByName("Sphere.001");
    if (eyeballObject) {
      eyeballSun = new THREE.DirectionalLight(0xffd2a1, 9.0);
      eyeballSun.castShadow = true;
      eyeballSun.shadow.mapSize.set(2048, 2048);
      eyeballSun.shadow.bias = -0.0002;
      eyeballSun.shadow.normalBias = 0.02;
      eyeballSun.shadow.radius = 1;
      eyeballSun.shadow.camera.near = 0.5;
      eyeballSun.shadow.camera.far = 200;
      eyeballSun.shadow.camera.left = -40;
      eyeballSun.shadow.camera.right = 40;
      eyeballSun.shadow.camera.top = 40;
      eyeballSun.shadow.camera.bottom = -40;
      scene.add(eyeballSun);

      // Aim the sun toward the ship (model root) by default.
      model.getWorldPosition(tmpWorldTarget);
      eyeballSunTarget.position.copy(tmpWorldTarget);
      eyeballSun.target = eyeballSunTarget;
    } else {
      console.warn('Eyeball object "Sphere.001" not found; warm sun not created.');
    }

    // Attach an area light to the GLTF camera (e.g. Blender "Camera.001").
    // Note: area lights affect Standard/Physical materials, but are not "visible" geometry.
    const gltfCamera = model.getObjectByName("Camera.001");
    if (gltfCamera) {
      const gltfCameraLight = new THREE.RectAreaLight(0xffffff, 25000, 2.0, 1.2);
      // Put it 1 unit in front of the camera (camera looks down -Z).
      gltfCameraLight.position.set(0, 0, -1);
      // Aim forward in camera space.
      gltfCameraLight.lookAt(0, 0, -2);
      gltfCamera.add(gltfCameraLight);
    } else {
      console.warn('GLTF camera "Camera.001" not found; area light not attached.');
    }

    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }
  },
  undefined,
  (error) => {
    console.error("Failed to load ship.gltf", error);
  }
);

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

const onKey = (event, isDown) => {
  switch (event.code) {
    case "KeyW":
      input.forward = isDown;
      break;
    case "KeyS":
      input.backward = isDown;
      break;
    case "KeyA":
      input.left = isDown;
      break;
    case "KeyD":
      input.right = isDown;
      break;
    case "Space":
      input.up = isDown;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      input.down = isDown;
      break;
  }
};

window.addEventListener("keydown", (event) => {
  if (event.code === "BracketLeft") {
    setPixelSize(pixelSize - 1);
    return;
  }
  if (event.code === "BracketRight") {
    setPixelSize(pixelSize + 1);
    return;
  }
  onKey(event, true);
});
window.addEventListener("keyup", (event) => onKey(event, false));

overlay.addEventListener("click", () => {
  controls.lock();
});

controls.addEventListener("lock", () => {
  overlay.classList.add("hidden");
});

controls.addEventListener("unlock", () => {
  overlay.classList.remove("hidden");
});

const clock = new THREE.Clock();

const animate = () => {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  if (mixer) {
    mixer.update(delta);
  }

  // Keep the "sun" pinned to the animated eyeball and aiming toward the ship.
  if (eyeballObject && eyeballSun) {
    eyeballObject.getWorldPosition(tmpWorldPos);
    eyeballSun.position.copy(tmpWorldPos);

    if (shipRoot) {
      shipRoot.getWorldPosition(tmpWorldTarget);
      eyeballSunTarget.position.copy(tmpWorldTarget);
    } else {
      eyeballSunTarget.position.set(0, 0, 0);
    }
    eyeballSunTarget.updateMatrixWorld();
  }

  velocity.x -= velocity.x * 8.0 * delta;
  velocity.y -= velocity.y * 8.0 * delta;
  velocity.z -= velocity.z * 8.0 * delta;

  direction.set(
    (input.right ? 1 : 0) - (input.left ? 1 : 0),
    (input.up ? 1 : 0) - (input.down ? 1 : 0),
    (input.forward ? 1 : 0) - (input.backward ? 1 : 0)
  );
  if (direction.lengthSq() > 0) {
    direction.normalize();
  }

  const speed = 12;
  velocity.x += direction.x * speed * delta;
  velocity.y += direction.y * speed * delta;
  velocity.z += direction.z * speed * delta;

  controls.moveRight(velocity.x * delta * 10);
  controls.moveForward(velocity.z * delta * 10);
  controls.getObject().position.y += velocity.y * delta * 10;

  composer.render();
};

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);

  pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  pixelPass.uniforms.resolution.value.multiplyScalar(renderer.getPixelRatio());
});

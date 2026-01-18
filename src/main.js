import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import MovementPad from "./MovementPad.js";
import RotationPad from "./RotationPad.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { setupModelLoader } from "./sceneloader.js";

const app = document.getElementById("app");
const infoButton = document.getElementById("info-button");
const applyButton = document.getElementById("apply-button");
const band1Button = document.getElementById("band1-button");
const band2Button = document.getElementById("band2-button");
const exploreButton = document.getElementById("explore-button");
const watermark = document.getElementById("canvasWatermark");
const popupModal = document.getElementById("popup-modal");
const popupContent = document.getElementById("popup-content");
const popupClose = document.getElementById("popup-close");

// Popup content for each view
const popupContents = {
  info: "<h2>Information</h2><h3>What is Battle of the Bands</h3><p>BOTB is a concert hosted annually by HSC at UofL, we put it on to connect the students with local artists, and to fundraise. </p><h3>Where and When</h3><p>Where: 2011 S. Brook Street, Louisville, KY 40208 </br> When: Doors at 7, music at 8</p>",
  apply: "<h2>Apply</h2><h3>Rules to apply:</h3><ul>1: Must be 18+</ul><ul>2: Must have at least 1 UofL student affiliated with the band</ul><ul>3: Must have original music</ul><p><a style='color:red;' href='https://docs.google.com/forms/d/e/1FAIpQLSekWgFZnXyqzzD9LPQntP1RoQYZdAOee9kyvo1pSAvSEmX4rw/viewform?usp=header'>Click here to apply</a></p>",
  band1: "<h2>Band 1</h2><p>TBA... heh...</p>",
  band2: "<h2>Band 2</h2><p>TBA... hehe... lol..</p>",
};

// Show/hide popup based on current view
const updatePopupVisibility = () => {
  if (currentView !== "main" && !isExploreMode && popupContents[currentView]) {
    popupContent.innerHTML = popupContents[currentView];
    popupModal.classList.add("show");
  } else {
    popupModal.classList.remove("show");
  }
};

// Close popup on X click
popupClose.addEventListener("click", () => {
  popupModal.classList.remove("show");
});

// Update watermark visibility (only visible at main view).
const updateWatermarkVisibility = () => {
  if (watermark) {
    watermark.style.opacity = (currentView === "main" && !isExploreMode) ? "1" : "0";
  }
};

// Explore mode state.
let isExploreMode = false;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const GRAVITY = 20;
const JUMP_SPEED = 8;
let playerVelocityY = 0;
let isOnGround = false;

// Raycasters for collision.
const downRay = new THREE.Raycaster();
const forwardRay = new THREE.Raycaster();
downRay.far = PLAYER_HEIGHT + 1;
forwardRay.far = PLAYER_RADIUS + 0.2;

const scene = new THREE.Scene();
scene.background = null; // Transparent background

// Detect mobile first to set appropriate FOV.
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Mobile control pads (created on demand)
let movementPad = null;
let rotationPad = null;

// Single camera that we animate between positions.
// Higher FOV on mobile to fill screen better and avoid black bars.
const camera = new THREE.PerspectiveCamera(
  isMobile ? 90 : 75, 
  window.innerWidth / window.innerHeight, 
  0.1, 
  2000
);
camera.position.set(0, 1.6, 6);

// FPS controls (only active in explore mode).
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
};

const onKey = (event, isDown) => {
  if (!isExploreMode) return;
  switch (event.code) {
    case "KeyW": input.forward = isDown; break;
    case "KeyS": input.backward = isDown; break;
    case "KeyA": input.left = isDown; break;
    case "KeyD": input.right = isDown; break;
    case "Space": input.jump = isDown; break;
  }
};

window.addEventListener("keydown", (e) => onKey(e, true));
window.addEventListener("keyup", (e) => onKey(e, false));

// Exit explore mode on pointer unlock.
controls.addEventListener("unlock", () => {
  if (isExploreMode) {
    exitExploreMode();
  }
});

const renderer = new THREE.WebGLRenderer({ 
  antialias: !isMobile, 
  powerPreference: "high-performance",
  alpha: true // Enable transparent background
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 2 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.0005; //NEVER CHANGE THIS
renderer.shadowMap.enabled = false; // Only enabled in explore mode.
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

// Required for RectAreaLight to render correctly.
RectAreaLightUniformsLib.init();

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const hemiLight = new THREE.HemisphereLight(0xe7eef8, 0x2a241c, 0.18);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff1df, 4.0);
keyLight.position.set(8, 12, 6);
keyLight.castShadow = !isMobile;
keyLight.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
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

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);


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
let pixelSize = 3;
const setPixelSize = (value) => {
  const next = Math.max(1, Math.min(64, Number(value) || pixelSize));
  pixelSize = next;
  pixelPass.uniforms.pixelSize.value = next;
};

setPixelSize(pixelSize);

window.pixelPass = pixelPass;
window.setPixelSize = setPixelSize;
pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
pixelPass.uniforms.resolution.value.multiplyScalar(renderer.getPixelRatio());
composer.addPass(pixelPass);

composer.addPass(new OutputPass());

// Pixel size hotkeys.
window.addEventListener("keydown", (event) => {
  if (event.code === "BracketLeft") {
    setPixelSize(pixelSize - 1);
  }
  if (event.code === "BracketRight") {
    setPixelSize(pixelSize + 1);
  }
});

// Camera positions (populated after GLTF loads).
const cameraPositions = {
  main: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
  info: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
  apply: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
  band1: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
  band2: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
};

let currentView = "main";
let isAnimating = false;

const allMeshes = [];
const models = setupModelLoader(scene, allMeshes, { cameraName: "camera001" });

models.whenReady((m) => {
  // Hide loader
  const loader = document.querySelector('.loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 500); // Remove after fade out
  }

  // Hardcoded camera positions.
  cameraPositions.main.position.set(-7.30, 3.1, 0.01);
  cameraPositions.main.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)); // Facing -X

  // Info and apply both face +X (same direction, opposite to main).
  const otherViewQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));

  cameraPositions.info.position.set(-1.39, 3.25, -0.02);
  cameraPositions.info.quaternion.copy(otherViewQuat);

  cameraPositions.apply.position.set(4.49, 2.17, 0.35);
  cameraPositions.apply.quaternion.copy(otherViewQuat);

  // Band1 is to the left/behind main - faces +Z (90° left from main, 90° right from info/apply)
  cameraPositions.band1.position.set(0.07, 4.41, 7.90);
  cameraPositions.band1.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0));

  // Band2 is to the right/behind main - faces -Z (90° right from main, 90° left from info/apply, 180° from band1)
  cameraPositions.band2.position.set(-0.18, 4.87, -7.51);
  cameraPositions.band2.quaternion.setFromEuler(new THREE.Euler(0, 0, 0));

  // Set camera to main position immediately.
  camera.position.copy(cameraPositions.main.position);
  camera.quaternion.copy(cameraPositions.main.quaternion);
  
  // Show watermark at main view.
  updateWatermarkVisibility();
});

// GSAP camera animation.
const animateToView = (viewName) => {
  if (isAnimating || viewName === currentView) return;

  const target = cameraPositions[viewName];
  if (!target) return;

  // Hide popup immediately when navigation starts.
  popupModal.classList.remove("show");

  isAnimating = true;

  // Check if rotations are different (need to animate rotation).
  const startQuat = camera.quaternion.clone();
  const endQuat = target.quaternion.clone();
  const shouldRotate = startQuat.angleTo(endQuat) > 0.01;

  // Animate position.
  gsap.to(camera.position, {
    x: target.position.x,
    y: target.position.y,
    z: target.position.z,
    duration: 1.5,
    ease: "power2.inOut",
    onComplete: () => {
      if (!shouldRotate) {
        currentView = viewName;
        isAnimating = false;
        updateButtonText();
        updateWatermarkVisibility();
        updatePopupVisibility();
      }
    },
  });

  if (shouldRotate) {
    // Animate quaternion (using slerp via onUpdate).
    const startQuat = camera.quaternion.clone();
    const endQuat = target.quaternion.clone();
    const animState = { t: 0 };

    gsap.to(animState, {
      t: 1,
      duration: 1.5,
      ease: "power2.inOut",
      onUpdate: () => {
        camera.quaternion.slerpQuaternions(startQuat, endQuat, animState.t);
      },
      onComplete: () => {
        currentView = viewName;
        isAnimating = false;
        updateButtonText();
        updateWatermarkVisibility();
        updatePopupVisibility();
      },
    });
  }
};

const updateButtonText = () => {
  // Info button: shows "(back)" only when at info view.
  infoButton.textContent = currentView === "info" ? "(back)" : "(info)";
  // Apply button: shows "(back)" only when at apply view.
  applyButton.textContent = currentView === "apply" ? "(back)" : "(apply)";
  // Band buttons: show "(back)" only when at their respective views.
  band1Button.textContent = currentView === "band1" ? "(back)" : "(TBA1)";
  band2Button.textContent = currentView === "band2" ? "(back)" : "(TBA2)";
};

// Button click handlers.
infoButton.addEventListener("click", () => {
  if (currentView === "main") {
    animateToView("info");
  } else if (currentView === "info") {
    animateToView("main");
  } else {
    animateToView("info");
  }
});

applyButton.addEventListener("click", () => {
  if (currentView === "main") {
    animateToView("apply");
  } else if (currentView === "apply") {
    animateToView("main");
  } else {
    animateToView("apply");
  }
});

band1Button.addEventListener("click", () => {
  if (currentView === "main") {
    animateToView("band1");
  } else if (currentView === "band1") {
    animateToView("main");
  } else {
    animateToView("band1");
  }
});

band2Button.addEventListener("click", () => {
  if (currentView === "main") {
    animateToView("band2");
  } else if (currentView === "band2") {
    animateToView("main");
  } else {
    animateToView("band2");
  }
});

const clock = new THREE.Clock();

// FPS walking collision helpers.
const checkCollision = (origin, dir) => {
  forwardRay.set(origin, dir);
  const hits = forwardRay.intersectObjects(allMeshes, true);
  return hits.length > 0 && hits[0].distance < PLAYER_RADIUS + 0.1;
};

const MAX_STEP_HEIGHT = 0.5; // Max height player can step up (for ramps/stairs).

const getGroundHeight = (pos) => {
  // Cast ray from feet level downward.
  const feetY = pos.y - PLAYER_HEIGHT;
  downRay.set(new THREE.Vector3(pos.x, feetY + MAX_STEP_HEIGHT, pos.z), new THREE.Vector3(0, -1, 0));
  const hits = downRay.intersectObjects(allMeshes, true);
  if (hits.length > 0) {
    const groundY = hits[0].point.y;
    // Only count as ground if it's below current feet + step tolerance.
    if (groundY <= feetY + MAX_STEP_HEIGHT) {
      return groundY;
    }
  }
  return null;
};

// Update button visibility based on explore mode.
const updateButtonVisibility = () => {
  if (isExploreMode) {
    // Hide all navigation buttons.
    infoButton.style.display = 'none';
    applyButton.style.display = 'none';
    band1Button.style.display = 'none';
    band2Button.style.display = 'none';
    // Show explore button as return button.
    exploreButton.style.display = 'block';
    exploreButton.textContent = '(return to navigation)';
  } else {
    // Show all navigation buttons.
    infoButton.style.display = 'block';
    applyButton.style.display = 'block';
    band1Button.style.display = 'block';
    band2Button.style.display = 'block';
    // Show explore button normally.
    exploreButton.style.display = 'block';
    exploreButton.textContent = '(explore)';
  }
};

// Enter/exit explore mode.
const enterExploreMode = () => {
  isExploreMode = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.needsUpdate = true;
  // Mark all meshes to receive/cast shadows in explore mode.
  allMeshes.forEach((m) => {
    if (m.material) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  // Set player to current camera position, but elevated for a falling animation.
  const currentPos = camera.position.clone();
  camera.position.set(currentPos.x, currentPos.y + 1.5, currentPos.z);
  camera.rotation.set(0, 0, 0);
  playerVelocityY = 0;
  isOnGround = false;
  updateButtonVisibility();
  updateWatermarkVisibility();
  updatePopupVisibility();
  
  if (isMobile) {
    // Create mobile control pads
    movementPad = new MovementPad(document.body);
    rotationPad = new RotationPad(document.body);
    
    // Handle movement input from pad
    movementPad.padElement.addEventListener('move', (e) => {
      const { deltaX, deltaY } = e.detail;
      // Map pad deltas to input state (deltaY is forward/back, deltaX is strafe)
      input.forward = deltaY < -0.3;
      input.backward = deltaY > 0.3;
      input.left = deltaX < -0.3;
      input.right = deltaX > 0.3;
    });
    
    // Reset input state when user releases the movement pad
    movementPad.padElement.addEventListener('stopMove', () => {
      input.forward = false;
      input.backward = false;
      input.left = false;
      input.right = false;
    });
    
    // Handle rotation input from pad
    rotationPad.padElement.addEventListener('YawPitch', (e) => {
      const { deltaX, deltaY } = e.detail;
      // Apply rotation to camera
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= deltaX * 0.02;
      euler.x -= deltaY * 0.02;
      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
      camera.quaternion.setFromEuler(euler);
    });
  } else {
    controls.lock();
  }
};

const exitExploreMode = () => {
  isExploreMode = false;
  renderer.shadowMap.enabled = false;
  // Reset shadows.
  allMeshes.forEach((m) => {
    if (m.material) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  
  // Remove mobile control pads if they exist
  if (movementPad) {
    movementPad.dispose();
    movementPad = null;
  }
  if (rotationPad) {
    rotationPad.dispose();
    rotationPad = null;
  }
  
  // Reset input state
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
  input.jump = false;
  
  // Return to main camera view.
  camera.position.copy(cameraPositions.main.position);
  camera.quaternion.copy(cameraPositions.main.quaternion);
  currentView = "main";
  updateButtonVisibility();
  updateButtonText();
  updateWatermarkVisibility();
  updatePopupVisibility();
};

exploreButton.addEventListener("click", () => {
  if (!isExploreMode) {
    enterExploreMode();
  } else {
    exitExploreMode();
  }
});

const animate = () => {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);

  if (models.mixer) {
    models.mixer.update(delta);
  }

  // FPS walking movement with collision.
  // On mobile, we don't use pointer lock, so check isExploreMode and isMobile separately
  if (isExploreMode && (controls.isLocked || isMobile)) {
    // Friction.
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    // Movement direction.
    direction.set(0, 0, 0);
    if (input.forward) direction.z = 1;
    if (input.backward) direction.z = -1;
    if (input.left) direction.x = -1;
    if (input.right) direction.x = 1;

    if (direction.lengthSq() > 0) {
      direction.normalize();
      const speed = 6;
      velocity.z += direction.z * speed * delta;
      velocity.x += direction.x * speed * delta;
    }

    // Get current position.
    const camPos = controls.getObject().position;

    // Apply gravity.
    playerVelocityY -= GRAVITY * delta;
    
    // Jump.
    if (input.jump && isOnGround) {
      playerVelocityY = JUMP_SPEED;
      isOnGround = false;
    }

    // Calculate next position.
    const moveX = velocity.x * delta * 10;
    const moveZ = velocity.z * delta * 10;

    // Check horizontal collision before moving.
    const moveDir = new THREE.Vector3();
    camera.getWorldDirection(moveDir);
    moveDir.y = 0;
    moveDir.normalize();

    const rightDir = new THREE.Vector3();
    rightDir.crossVectors(moveDir, new THREE.Vector3(0, 1, 0)).normalize();

    const worldMoveDir = new THREE.Vector3()
      .addScaledVector(moveDir, velocity.z)
      .addScaledVector(rightDir, velocity.x);
    if (worldMoveDir.lengthSq() > 0) worldMoveDir.normalize();

    const rayOrigin = new THREE.Vector3(camPos.x, camPos.y - PLAYER_HEIGHT / 2, camPos.z);

    if (!checkCollision(rayOrigin, worldMoveDir)) {
      controls.moveRight(moveX);
      controls.moveForward(moveZ);
    }

    // Apply vertical movement.
    camPos.y += playerVelocityY * delta;

    // Ground check.
    const groundY = getGroundHeight(camPos);
    const feetY = camPos.y - PLAYER_HEIGHT;
    if (groundY !== null) {
      // Snap to ground if falling onto it or stepping up.
      if (feetY <= groundY + 0.05) {
        camPos.y = groundY + PLAYER_HEIGHT;
        if (playerVelocityY < 0) playerVelocityY = 0;
        isOnGround = true;
      } else {
        // Player is slightly above ground, not quite grounded yet.
        isOnGround = false;
      }
    } else if (camPos.y < 0.5) {
      // Fallback floor.
      camPos.y = PLAYER_HEIGHT;
      playerVelocityY = 0;
      isOnGround = true;
    } else {
      isOnGround = false;
    }
  }

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

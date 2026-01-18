import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const defaultNameMatches = (name, candidates) => {
    if (!name) return false;
    const lowered = String(name).toLowerCase();
    return candidates.some((c) => lowered === c);
};

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D[]} allMeshes
 * @param {{
 *   cameraName?: string,
 *   eyeName?: string,
 *   cameraPredicate?: (obj: THREE.Object3D) => boolean,
 *   eyePredicate?: (obj: THREE.Object3D) => boolean,
 * }} [options]
 */
export function setupModelLoader(scene, allMeshes, options = {}) {
    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(dracoLoader);

    const models = {
        environment: null,
        lightsources: null,
        cameras: null,
        gltf: null,
        mixer: null,
        cameraNode: null,
        eyeNode: null,
        ready: false,
        whenReady(callback) {
            if (models.ready) {
                callback(models);
                return;
            }
            models._readyCallbacks.push(callback);
        },
        _readyCallbacks: [],
    };

    const desiredCameraLower = options.cameraName ? String(options.cameraName).toLowerCase() : null;
    const desiredEyeLower = options.eyeName ? String(options.eyeName).toLowerCase() : null;
    const defaultCameraNames = ["camera.001", "camera001", "camera", "cam001", "cam.001"];
    const defaultEyeNames = ["sphere.001", "sphere001"];

    gltfLoader.load(new URL("./ship-compressed.gltf", import.meta.url).toString(), (gltf) => {
        models.gltf = gltf;
        models.environment = gltf.scene;
        models.environment.position.set(0, 0, 0);
        scene.add(models.environment);

        models.environment.traverse((child) => {
            if (child.isMesh) {
                allMeshes.push(child);
                child.castShadow = true;
                child.receiveShadow = true;

                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    if (!material) return;
                    if (typeof material.envMapIntensity === "number") {
                        material.envMapIntensity = 0.25;
                    }
                    if (material.transparent || material.opacity < 1 || material.alphaTest > 0) {
                        material.depthWrite = false;
                        material.alphaTest = Math.max(material.alphaTest || 0, 0.02);
                    }
                });
            }

            const childNameLower = (child.name || "").toLowerCase();

            if (!models.cameraNode) {
                if (typeof options.cameraPredicate === "function" && options.cameraPredicate(child)) {
                    models.cameraNode = child;
                } else if (desiredCameraLower && childNameLower === desiredCameraLower) {
                    models.cameraNode = child;
                } else if (defaultNameMatches(childNameLower, defaultCameraNames)) {
                    models.cameraNode = child;
                }
            }

            if (!models.eyeNode) {
                if (typeof options.eyePredicate === "function" && options.eyePredicate(child)) {
                    models.eyeNode = child;
                } else if (desiredEyeLower && childNameLower === desiredEyeLower) {
                    models.eyeNode = child;
                } else if (defaultNameMatches(childNameLower, defaultEyeNames)) {
                    models.eyeNode = child;
                }
            }
        });

        if (models.eyeNode) {
            console.log("found big eye:", { name: models.eyeNode.name, type: models.eyeNode.type });
        }
        if (models.cameraNode) {
            console.log("found camera node:", { name: models.cameraNode.name, type: models.cameraNode.type });
        }

        if (gltf.animations && gltf.animations.length > 0) {
            models.mixer = new THREE.AnimationMixer(models.environment);
            gltf.animations.forEach((clip) => {
                models.mixer.clipAction(clip).play();
            });
        }

        models.ready = true;
        const callbacks = models._readyCallbacks.splice(0, models._readyCallbacks.length);
        callbacks.forEach((cb) => cb(models));
    });

    return models;
}
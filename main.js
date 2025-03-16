import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FaceLandmarker, HandLandmarker, PoseLandmarker } from 'mediapipe';
import { Face, Hand, Pose } from 'kalidokit';

// DOM elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startButton = document.getElementById('start-tracking');
const statusMessage = document.getElementById('status-message');
const sceneContainer = document.getElementById('scene-container');

// Canvas for drawing landmarks
const ctx = canvas.getContext('2d');

// Three.js scene
let scene, camera, renderer, model, mixer, controls;
let faceLandmarker, handLandmarker, poseLandmarker;
let isTracking = false;

// Avatar bone mapping
const riggedBones = {
    hips: null,
    spine: null,
    neck: null,
    head: null,
    leftShoulder: null,
    leftUpperArm: null,
    leftLowerArm: null,
    leftHand: null,
    rightShoulder: null,
    rightUpperArm: null,
    rightLowerArm: null,
    rightHand: null,
    leftUpperLeg: null,
    leftLowerLeg: null,
    leftFoot: null,
    rightUpperLeg: null,
    rightLowerLeg: null,
    rightFoot: null,
    // Additional bones for fingers if available in the model
};

// Finger joints naming (for more detailed hand rigging)
const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const fingerJoints = ['metacarpal', 'proximal', 'intermediate', 'distal'];

// Init Three.js scene
function initScene() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16213e);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 3);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    sceneContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();

    // Load 3D model (use a placeholder URL - you'll need to provide your own model)
    loadModel();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Load 3D model 
function loadModel() {
    statusMessage.textContent = "Loading 3D model...";
    
    // Example using a more reliable 3D model source
    const modelUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Soldier.glb';
    
    const loader = new GLTFLoader();
    loader.load(
        modelUrl,
        (gltf) => {
            model = gltf.scene;
            model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            
            // Center and scale the model
            model.position.set(0, 0, 0);
            model.scale.set(1, 1, 1);
            scene.add(model);
            
            // Store animation mixer if animations exist
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(model);
                const idleAction = mixer.clipAction(gltf.animations[0]);
                idleAction.play();
            }
            
            // Map model bones to rig
            mapBones(model);
            
            statusMessage.textContent = "Model loaded!";
        },
        (progress) => {
            const percentComplete = Math.round((progress.loaded / progress.total) * 100);
            statusMessage.textContent = `Loading model: ${percentComplete}%`;
        },
        (error) => {
            console.error('Error loading model:', error);
            statusMessage.textContent = "Error loading model";
        }
    );
}

// Map bones from the 3D model to our rig
function mapBones(model) {
    // Recursive function to find bones
    function findBones(object) {
        if (object.isBone || object.type === 'Bone') {
            const name = object.name.toLowerCase();
            
            // Map standard bones
            if (name.includes('hip') || name.includes('pelvis')) riggedBones.hips = object;
            else if (name.includes('spine') && !name.includes('1') && !name.includes('2')) riggedBones.spine = object;
            else if (name.includes('neck')) riggedBones.neck = object;
            else if (name.includes('head')) riggedBones.head = object;
            
            // Shoulders
            else if (name.includes('left') && (name.includes('shoulder') || name.includes('clavicle'))) riggedBones.leftShoulder = object;
            else if (name.includes('right') && (name.includes('shoulder') || name.includes('clavicle'))) riggedBones.rightShoulder = object;
            
            // Arms
            else if (name.includes('left') && (name.includes('arm') || name.includes('upper')) && !name.includes('fore')) riggedBones.leftUpperArm = object;
            else if (name.includes('right') && (name.includes('arm') || name.includes('upper')) && !name.includes('fore')) riggedBones.rightUpperArm = object;
            else if (name.includes('left') && (name.includes('fore') || name.includes('lower') || name.includes('elbow'))) riggedBones.leftLowerArm = object;
            else if (name.includes('right') && (name.includes('fore') || name.includes('lower') || name.includes('elbow'))) riggedBones.rightLowerArm = object;
            
            // Hands
            else if (name.includes('left') && name.includes('hand') && !name.includes('thumb') && !name.includes('finger')) riggedBones.leftHand = object;
            else if (name.includes('right') && name.includes('hand') && !name.includes('thumb') && !name.includes('finger')) riggedBones.rightHand = object;
            
            // Legs
            else if (name.includes('left') && (name.includes('up') || name.includes('thigh')) && name.includes('leg')) riggedBones.leftUpperLeg = object;
            else if (name.includes('right') && (name.includes('up') || name.includes('thigh')) && name.includes('leg')) riggedBones.rightUpperLeg = object;
            else if (name.includes('left') && (name.includes('low') || name.includes('shin') || name.includes('calf')) && name.includes('leg')) riggedBones.leftLowerLeg = object;
            else if (name.includes('right') && (name.includes('low') || name.includes('shin') || name.includes('calf')) && name.includes('leg')) riggedBones.rightLowerLeg = object;
            
            // Feet
            else if (name.includes('left') && name.includes('foot')) riggedBones.leftFoot = object;
            else if (name.includes('right') && name.includes('foot')) riggedBones.rightFoot = object;
            
            // Map fingers if available (this is a simplified approach)
            for (const finger of fingerNames) {
                for (const joint of fingerJoints) {
                    const boneName = `${finger}${joint}`;
                    if (name.includes(finger) && name.includes(joint)) {
                        if (name.includes('left')) {
                            riggedBones[`left${finger.charAt(0).toUpperCase() + finger.slice(1)}${joint.charAt(0).toUpperCase() + joint.slice(1)}`] = object;
                        } else if (name.includes('right')) {
                            riggedBones[`right${finger.charAt(0).toUpperCase() + finger.slice(1)}${joint.charAt(0).toUpperCase() + joint.slice(1)}`] = object;
                        }
                    }
                }
            }
        }
        
        // Recursively traverse children
        if (object.children) {
            object.children.forEach(child => findBones(child));
        }
    }
    
    findBones(model);
    
    // Log the mapped bones
    console.log("Mapped bones:", riggedBones);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
}

// Initialize MediaPipe models
async function initMediaPipe() {
    try {
        statusMessage.textContent = "Loading tracking models...";
        
        // Set up Face Landmarker
        faceLandmarker = await FaceLandmarker.createFromOptions(
            document.body,
            {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numFaces: 1
            }
        );
        
        // Set up Hand Landmarker
        handLandmarker = await HandLandmarker.createFromOptions(
            document.body,
            {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 2
            }
        );
        
        // Set up Pose Landmarker
        poseLandmarker = await PoseLandmarker.createFromOptions(
            document.body,
            {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numPoses: 1
            }
        );
        
        statusMessage.textContent = "Tracking models loaded!";
    } catch (error) {
        console.error('Error initializing MediaPipe:', error);
        statusMessage.textContent = "Error: Couldn't load tracking models";
    }
}

// Set up webcam
async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: 640,
                height: 480,
                facingMode: 'user'
            }
        });
        
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                resolve();
            };
        });
    } catch (error) {
        console.error('Error accessing webcam:', error);
        statusMessage.textContent = "Error: Couldn't access webcam";
        throw error;
    }
}

// Draw landmarks on the canvas for debugging
function drawLandmarks(faceLandmarks, poseLandmarks, leftHandLandmarks, rightHandLandmarks) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw face landmarks
    if (faceLandmarks && faceLandmarks.length > 0) {
        ctx.fillStyle = 'aqua';
        faceLandmarks[0].forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 2, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
    
    // Draw pose landmarks
    if (poseLandmarks && poseLandmarks.length > 0) {
        ctx.fillStyle = 'lime';
        poseLandmarks[0].landmarks.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
    
    // Draw hand landmarks
    if (leftHandLandmarks && leftHandLandmarks.length > 0) {
        ctx.fillStyle = 'yellow';
        leftHandLandmarks[0].landmarks.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
    
    if (rightHandLandmarks && rightHandLandmarks.length > 0) {
        ctx.fillStyle = 'orange';
        rightHandLandmarks[0].landmarks.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
}

// Apply rotations to the model based on tracking data
function applyRotations(faceRig, poseRig, leftHandRig, rightHandRig) {
    // Apply face tracking data to head
    if (faceRig && riggedBones.head) {
        // Face rotation
        riggedBones.head.rotation.x = faceRig.head.x;
        riggedBones.head.rotation.y = faceRig.head.y;
        riggedBones.head.rotation.z = faceRig.head.z;
        
        // If we have a neck, apply some of the rotation there too for more natural movement
        if (riggedBones.neck) {
            riggedBones.neck.rotation.x = faceRig.head.x * 0.5;
            riggedBones.neck.rotation.y = faceRig.head.y * 0.5;
            riggedBones.neck.rotation.z = faceRig.head.z * 0.5;
        }
    }
    
    // Apply body pose tracking
    if (poseRig) {
        // Hips position and rotation
        if (riggedBones.hips) {
            riggedBones.hips.rotation.x = poseRig.Hips.rotation.x;
            riggedBones.hips.rotation.y = poseRig.Hips.rotation.y;
            riggedBones.hips.rotation.z = poseRig.Hips.rotation.z;
        }
        
        // Spine rotation
        if (riggedBones.spine) {
            riggedBones.spine.rotation.x = poseRig.Spine.x;
            riggedBones.spine.rotation.y = poseRig.Spine.y;
            riggedBones.spine.rotation.z = poseRig.Spine.z;
        }
        
        // Left arm
        if (riggedBones.leftShoulder && poseRig.LeftUpperArm) {
            riggedBones.leftShoulder.rotation.x = poseRig.LeftUpperArm.x * 0.5;
            riggedBones.leftShoulder.rotation.y = poseRig.LeftUpperArm.y * 0.5;
            riggedBones.leftShoulder.rotation.z = poseRig.LeftUpperArm.z * 0.5;
        }
        
        if (riggedBones.leftUpperArm && poseRig.LeftUpperArm) {
            riggedBones.leftUpperArm.rotation.x = poseRig.LeftUpperArm.x;
            riggedBones.leftUpperArm.rotation.y = poseRig.LeftUpperArm.y;
            riggedBones.leftUpperArm.rotation.z = poseRig.LeftUpperArm.z;
        }
        
        if (riggedBones.leftLowerArm && poseRig.LeftLowerArm) {
            riggedBones.leftLowerArm.rotation.x = poseRig.LeftLowerArm.x;
            riggedBones.leftLowerArm.rotation.y = poseRig.LeftLowerArm.y;
            riggedBones.leftLowerArm.rotation.z = poseRig.LeftLowerArm.z;
        }
        
        // Right arm
        if (riggedBones.rightShoulder && poseRig.RightUpperArm) {
            riggedBones.rightShoulder.rotation.x = poseRig.RightUpperArm.x * 0.5;
            riggedBones.rightShoulder.rotation.y = poseRig.RightUpperArm.y * 0.5;
            riggedBones.rightShoulder.rotation.z = poseRig.RightUpperArm.z * 0.5;
        }
        
        if (riggedBones.rightUpperArm && poseRig.RightUpperArm) {
            riggedBones.rightUpperArm.rotation.x = poseRig.RightUpperArm.x;
            riggedBones.rightUpperArm.rotation.y = poseRig.RightUpperArm.y;
            riggedBones.rightUpperArm.rotation.z = poseRig.RightUpperArm.z;
        }
        
        if (riggedBones.rightLowerArm && poseRig.RightLowerArm) {
            riggedBones.rightLowerArm.rotation.x = poseRig.RightLowerArm.x;
            riggedBones.rightLowerArm.rotation.y = poseRig.RightLowerArm.y;
            riggedBones.rightLowerArm.rotation.z = poseRig.RightLowerArm.z;
        }
        
        // Left leg
        if (riggedBones.leftUpperLeg && poseRig.LeftUpperLeg) {
            riggedBones.leftUpperLeg.rotation.x = poseRig.LeftUpperLeg.x;
            riggedBones.leftUpperLeg.rotation.y = poseRig.LeftUpperLeg.y;
            riggedBones.leftUpperLeg.rotation.z = poseRig.LeftUpperLeg.z;
        }
        
        if (riggedBones.leftLowerLeg && poseRig.LeftLowerLeg) {
            riggedBones.leftLowerLeg.rotation.x = poseRig.LeftLowerLeg.x;
            riggedBones.leftLowerLeg.rotation.y = poseRig.LeftLowerLeg.y;
            riggedBones.leftLowerLeg.rotation.z = poseRig.LeftLowerLeg.z;
        }
        
        // Right leg
        if (riggedBones.rightUpperLeg && poseRig.RightUpperLeg) {
            riggedBones.rightUpperLeg.rotation.x = poseRig.RightUpperLeg.x;
            riggedBones.rightUpperLeg.rotation.y = poseRig.RightUpperLeg.y;
            riggedBones.rightUpperLeg.rotation.z = poseRig.RightUpperLeg.z;
        }
        
        if (riggedBones.rightLowerLeg && poseRig.RightLowerLeg) {
            riggedBones.rightLowerLeg.rotation.x = poseRig.RightLowerLeg.x;
            riggedBones.rightLowerLeg.rotation.y = poseRig.RightLowerLeg.y;
            riggedBones.rightLowerLeg.rotation.z = poseRig.RightLowerLeg.z;
        }
    }
    
    // Apply hand tracking data
    // Left hand
    if (leftHandRig && riggedBones.leftHand) {
        // Basic wrist rotation
        riggedBones.leftHand.rotation.x = leftHandRig.wrist.x;
        riggedBones.leftHand.rotation.y = leftHandRig.wrist.y;
        riggedBones.leftHand.rotation.z = leftHandRig.wrist.z;
        
        // If we have finger bones mapped, apply rotations
        // This is a simplified version - full finger rigging would require more detailed mapping
        fingerNames.forEach(finger => {
            const fingerData = leftHandRig[finger];
            if (fingerData) {
                fingerJoints.forEach(joint => {
                    const boneName = `left${finger.charAt(0).toUpperCase() + finger.slice(1)}${joint.charAt(0).toUpperCase() + joint.slice(1)}`;
                    const bone = riggedBones[boneName];
                    if (bone && fingerData[joint]) {
                        bone.rotation.x = fingerData[joint].x;
                        bone.rotation.y = fingerData[joint].y;
                        bone.rotation.z = fingerData[joint].z;
                    }
                });
            }
        });
    }
    
    // Right hand
    if (rightHandRig && riggedBones.rightHand) {
        // Basic wrist rotation
        riggedBones.rightHand.rotation.x = rightHandRig.wrist.x;
        riggedBones.rightHand.rotation.y = rightHandRig.wrist.y;
        riggedBones.rightHand.rotation.z = rightHandRig.wrist.z;
        
        // If we have finger bones mapped, apply rotations
        fingerNames.forEach(finger => {
            const fingerData = rightHandRig[finger];
            if (fingerData) {
                fingerJoints.forEach(joint => {
                    const boneName = `right${finger.charAt(0).toUpperCase() + finger.slice(1)}${joint.charAt(0).toUpperCase() + joint.slice(1)}`;
                    const bone = riggedBones[boneName];
                    if (bone && fingerData[joint]) {
                        bone.rotation.x = fingerData[joint].x;
                        bone.rotation.y = fingerData[joint].y;
                        bone.rotation.z = fingerData[joint].z;
                    }
                });
            }
        });
    }
}

// Track and apply motion to the avatar
async function trackMotion() {
    if (!isTracking) return;
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Get timestamps for animation timing
        const timestamp = Date.now();
        
        // Process face landmarks
        let faceRig = null;
        const faceLandmarks = faceLandmarker.detectForVideo(video, timestamp);
        if (faceLandmarks.faceLandmarks && faceLandmarks.faceLandmarks.length > 0) {
            faceRig = Face.solve(faceLandmarks.faceLandmarks[0], {
                runtime: 'mediapipe',
                video: video
            });
        }
        
        // Process pose landmarks
        let poseRig = null;
        const poseLandmarks = poseLandmarker.detectForVideo(video, timestamp);
        if (poseLandmarks.landmarks && poseLandmarks.landmarks.length > 0) {
            poseRig = Pose.solve(poseLandmarks.landmarks[0], {
                runtime: 'mediapipe',
                video: video
            });
        }
        
        // Process hand landmarks
        let leftHandRig = null;
        let rightHandRig = null;
        const handLandmarks = handLandmarker.detectForVideo(video, timestamp);
        
        if (handLandmarks.landmarks && handLandmarks.landmarks.length > 0) {
            // Sort hands by handedness
            for (let i = 0; i < handLandmarks.landmarks.length; i++) {
                const hand = handLandmarks.landmarks[i];
                const handedness = handLandmarks.handedness[i][0].categoryName;
                
                if (handedness === 'Left') {
                    // MediaPipe returns "Left" for the right hand in mirrored view
                    rightHandRig = Hand.solve(hand, {
                        runtime: 'mediapipe',
                        handedness: 'Right',
                        video: video
                    });
                } else {
                    // MediaPipe returns "Right" for the left hand in mirrored view
                    leftHandRig = Hand.solve(hand, {
                        runtime: 'mediapipe',
                        handedness: 'Left',
                        video: video
                    });
                }
            }
        }
        
        // Draw landmarks on canvas for debugging
        drawLandmarks(
            faceLandmarks.faceLandmarks,
            poseLandmarks.landmarks,
            handLandmarks.landmarks && handLandmarks.handedness ? 
                handLandmarks.handedness.findIndex(h => h[0].categoryName === 'Right') !== -1 ? 
                    [handLandmarks.landmarks[handLandmarks.handedness.findIndex(h => h[0].categoryName === 'Right')]] : null : null,
            handLandmarks.landmarks && handLandmarks.handedness ?
                handLandmarks.handedness.findIndex(h => h[0].categoryName === 'Left') !== -1 ?
                    [handLandmarks.landmarks[handLandmarks.handedness.findIndex(h => h[0].categoryName === 'Left')]] : null : null
        );
        
        // Apply rigging data to 3D model
        if (model) {
            applyRotations(faceRig, poseRig, leftHandRig, rightHandRig);
        }
    }
    
    // Continue tracking
    requestAnimationFrame(trackMotion);
}

// Animation loop for Three.js
function animate() {
    requestAnimationFrame(animate);
    
    // Update mixer if it exists
    if (mixer) {
        mixer.update(0.016); // Update at ~60fps
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Start tracking
async function startTracking() {
    if (isTracking) return;
    
    try {
        // Make sure all components are initialized
        if (!faceLandmarker || !handLandmarker || !poseLandmarker) {
            await initMediaPipe();
        }
        
        isTracking = true;
        startButton.textContent = "Tracking Active";
        startButton.disabled = true;
        statusMessage.textContent = "Tracking active";
        
        // Start video if not already playing
        if (video.paused) {
            await video.play();
        }
        
        // Start motion tracking
        trackMotion();
    } catch (error) {
        console.error('Error starting tracking:', error);
        statusMessage.textContent = "Error starting tracking";
        isTracking = false;
        startButton.disabled = false;
    }
}

// Initialize everything
async function init() {
    try {
        await setupWebcam();
        await initMediaPipe();
        initScene();
        animate();
        
        // Add debug info
        console.log("Webcam initialized:", video.readyState);
        console.log("MediaPipe models:", {face: !!faceLandmarker, hand: !!handLandmarker, pose: !!poseLandmarker});
        console.log("Scene initialized:", !!scene);
        
        startButton.disabled = false;
        startButton.addEventListener('click', startTracking);
        statusMessage.textContent = "Ready to start tracking";
    } catch (error) {
        console.error('Initialization error:', error);
        statusMessage.textContent = "Error during initialization: " + error.message;
    }
}

// Start initialization when page loads
window.addEventListener('load', init);
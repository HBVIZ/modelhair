// ============================================================================
// IMPORTS - These bring in the libraries we need
// ============================================================================
import './style.css'
import * as THREE from 'three' // Three.js library for 3D graphics
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js' // Camera controls (drag to rotate)
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js' // Loads .glb model files
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js' // Loads HDR environment maps
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

console.log('Three.js viewer booting…')

// Allow parent documents (e.g. Webflow hosting this app in an iframe) to queue actions before the viewer is ready.
const pendingIframeActions = []

window.addEventListener('message', (event) => {
  const payload = event.data
  if (!payload || payload.type !== 'model-action') return

  console.log('[iframe] received action request:', payload.action)

  if (typeof window.handleModelAction === 'function') {
    window.handleModelAction(payload.action)
  } else {
    pendingIframeActions.push(payload.action)
  }
})

window.addEventListener('load', () => {
  console.log('Three.js viewer loaded, notifying parent window')
  window.parent?.postMessage({ type: 'iframe-ready' }, '*')
})

// ============================================================================
// SETUP - Basic scene, camera, and renderer
// ============================================================================
// Root container that will host the WebGL canvas
const container = document.querySelector('#app')

// Create the 3D scene (like a stage where everything happens)
const scene = new THREE.Scene()
scene.background = null // Transparent background

// Create the camera (your viewpoint)
// Parameters: field of view (60°), aspect ratio, near clipping, far clipping
const camera = new THREE.PerspectiveCamera(
  60, // Field of view - how wide the camera sees (higher = wider view)
  window.innerWidth / window.innerHeight, // Aspect ratio (width/height)
  0.01, // Near clipping - objects closer than this won't render
  2000 // Far clipping - objects farther than this won't render
)
camera.position.set(0, 0, 5) // Start position: x=0, y=0, z=5 (will be reframed when model loads)

// Create the renderer (draws everything to the screen)
const renderer = new THREE.WebGLRenderer({ 
  antialias: true, // Smooth edges
  alpha: true // Transparent background
})
renderer.setSize(window.innerWidth, window.innerHeight) // Match window size
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // High DPI support
renderer.shadowMap.enabled = true // Enable shadows
renderer.setClearColor(0x000000, 0) // Transparent clear color
renderer.toneMapping = THREE.ACESFilmicToneMapping // Better tonemapping for HDR
renderer.toneMappingExposure = 1.0 // Overall brightness multiplier
container.appendChild(renderer.domElement) // Add canvas to page
renderer.domElement.addEventListener('pointerdown', onPointerDown)
renderer.domElement.addEventListener('pointermove', onPointerMove)
renderer.domElement.addEventListener('pointerup', onPointerUp)
renderer.domElement.addEventListener('pointerleave', onPointerLeave)
renderer.domElement.addEventListener('pointercancel', onPointerUp)

// Camera controls - allows user to drag/zoom/pan around the model
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true // Smooth camera movement
controls.dampingFactor = 0.08 // How smooth (lower = smoother)
controls.minDistance = 0.1 // Can't zoom in closer than this
controls.maxDistance = 1000 // Can't zoom out farther than this
controls.target.set(0, 0, 0) // What the camera looks at (center of model)
controls.enableRotate = false // Disable camera rotation (we will rotate the model instead)
controls.enablePan = false // Disable camera panning
controls.enableZoom = false // Disable zooming
controls.enabled = false // Fully lock the camera in place

// ============================================================================
// LIGHTING - Lights up the scene
// ============================================================================
// Ambient light - soft light from all directions (like daylight)
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7)
// Parameters: sky color, ground color, intensity (0-1)
hemi.position.set(0, 1, 0) // Position doesn't matter for hemisphere light
scene.add(hemi)

// Sun light - directional light (like sunlight) with shadows
const sun = new THREE.DirectionalLight(0xffffff, 3.0)
// Parameters: color (white), intensity (3.0 = bright)
sun.position.set(5, 10, 7) // Position of the light source
sun.castShadow = true // Enable shadow casting
sun.shadow.mapSize.set(2048, 2048) // Shadow quality (higher = better but slower)
sun.shadow.normalBias = 0.02 // Fixes shadow artifacts
sun.shadow.bias = -0.0005 // Fixes shadow acne
// Shadow camera bounds - how large an area casts shadows
sun.shadow.camera.left = -50
sun.shadow.camera.right = 50
sun.shadow.camera.top = 50
sun.shadow.camera.bottom = -50
sun.shadow.camera.near = 0.1
sun.shadow.camera.far = 200
scene.add(sun)
scene.add(sun.target) // Where the light points

// Visual helper to see where the sun light is (yellow line)
const sunHelper = new THREE.DirectionalLightHelper(sun, 0.5, 0xffcc66)
sunHelper.visible = true // Toggle in GUI to show/hide
scene.add(sunHelper)

// Rect area lights for soft, diffused fill (arranged around model)
RectAreaLightUniformsLib.init()
const areaLights = []
const areaLightSettings = [
  { position: new THREE.Vector3(-4, 3, 2), rotation: new THREE.Euler(0, Math.PI / 4, 0) },
  { position: new THREE.Vector3(4, 3, 2), rotation: new THREE.Euler(0, -Math.PI / 4, 0) },
  { position: new THREE.Vector3(0, 5, -3), rotation: new THREE.Euler(-Math.PI / 6, 0, 0) },
]

areaLightSettings.forEach(({ position, rotation }) => {
  const rectLight = new THREE.RectAreaLight(0xffffff, 3.5, 6, 8) // color, intensity, width, height
  rectLight.position.copy(position)
  rectLight.rotation.copy(rotation)
  rectLight.lookAt(0, 0, 0)
  scene.add(rectLight)
  areaLights.push(rectLight)
})

// ============================================================================
// FILE LOADERS - Load models and textures from the public folder
// ============================================================================
// Get the base URL (works for both local dev and GitHub Pages)
const baseUrl = import.meta.env.BASE_URL
console.log('Base URL:', baseUrl) // Debug: check what base URL is being used
// Set up loaders to look in the public/models and public/textures folders
const gltfLoader = new GLTFLoader().setPath(`${baseUrl}models/`)
const textureLoader = new THREE.TextureLoader().setPath(`${baseUrl}textures/`)
const rgbeLoader = new RGBELoader().setPath(`${baseUrl}environments/`)

let currentModel = null // Reference to the currently loaded model (used for rotation)
let currentEnvironment = null // Cache current HDR texture so it can be disposed

// Pointer drag state for rotating the model
let isPointerDown = false
const pointerPosition = { x: 0, y: 0 }
const dragRotationSpeed = 0.005 // Change this number to rotate faster/slower

// Rotation snap configuration - adjust these numbers to change behaviour
const snapRotationSettings = {
  enabled: true, // Turn snapping on or off
  axis: 'x', // Axis to watch (x = pitch)
  clampDeg: { min: -45, max: 110 }, // Limit how far the model can tilt (degrees)
  thresholds: [
    {
      when: 'greater', // When rotation is greater than threshold
      thresholdDeg: 25, // If tilted forward more than 25°
      snapDeg: 90, // Snap to 90° (looking straight down)
    },
    {
      when: 'less', // When rotation is less than threshold
      thresholdDeg: 5, // If tilt returns under 5°
      snapDeg: 0, // Snap back upright
    },
  ],
}

const snapRotationState = {
  active: false,
  axis: 'x',
  target: 0,
  speed: 0.15, // 0.0-1.0 smoothing factor (higher = faster snap)
  epsilon: THREE.MathUtils.degToRad(0.5), // Close enough angle to stop snapping
}

const modelIntroState = {
  fade: {
    active: false,
    start: 0,
    duration: 1.5,
    materials: [],
  },
  spin: {
    active: false,
    start: 0,
    duration: 3.0,
    from: 0,
    to: Math.PI * 2,
  },
  tilt: {
    active: false,
    start: 0,
    duration: 1.5,
    from: 0,
    to: 0,
  },
}

function applyRotationSnap() {
  if (!snapRotationSettings.enabled || !currentModel) return

  const axis = snapRotationSettings.axis
  const value = currentModel.rotation[axis]

  for (const rule of snapRotationSettings.thresholds) {
    const thresholdRad = THREE.MathUtils.degToRad(rule.thresholdDeg)
    const snapRad = THREE.MathUtils.degToRad(rule.snapDeg)

    if (rule.when === 'greater' && value >= thresholdRad) {
      snapRotationState.active = true
      snapRotationState.axis = axis
      snapRotationState.target = snapRad
      return
    }

    if (rule.when === 'less' && value <= thresholdRad) {
      snapRotationState.active = true
      snapRotationState.axis = axis
      snapRotationState.target = snapRad
      return
    }

    if (!rule.when || rule.when === 'close') {
      if (Math.abs(value - snapRad) <= thresholdRad) {
        snapRotationState.active = true
        snapRotationState.axis = axis
        snapRotationState.target = snapRad
        return
      }
    }
  }

  // If no rule matched, ensure snapping is disabled
  snapRotationState.active = false
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Helper to animate yaw (Y axis) rotation. Increase `amount` for larger turns.
// Positive = turn right (clockwise), negative = turn left.
function startSpin(amount = Math.PI * 2, duration = 3, resetToZero = false) {
  if (!currentModel) return
  const now = performance.now() / 1000
  modelIntroState.spin.active = true
  modelIntroState.spin.start = now
  modelIntroState.spin.duration = duration
  if (resetToZero) {
    currentModel.rotation.y = 0
    modelIntroState.spin.from = 0
    modelIntroState.spin.to = amount
  } else {
    modelIntroState.spin.from = currentModel.rotation.y
    modelIntroState.spin.to = currentModel.rotation.y + amount
  }
}

// Helper to animate pitch (X axis) rotation. Pass degrees (positive = forward tilt).
// Values are clamped to `snapRotationSettings.clampDeg` so the model never exceeds your limits.
function startTilt(targetDegrees, duration = 1.2) {
  if (!currentModel) return
  const now = performance.now() / 1000
  const targetRadians = THREE.MathUtils.degToRad(targetDegrees)
  const { min, max } = snapRotationSettings.clampDeg || { min: -90, max: 90 }
  const clampedTarget = THREE.MathUtils.clamp(
    targetRadians,
    THREE.MathUtils.degToRad(min),
    THREE.MathUtils.degToRad(max)
  )

  modelIntroState.tilt.active = true
  modelIntroState.tilt.start = now
  modelIntroState.tilt.duration = duration
  modelIntroState.tilt.from = currentModel.rotation.x
  modelIntroState.tilt.to = clampedTarget
}

function startModelIntroAnimation(root) {
  const now = performance.now() / 1000

  const materials = new Set()
  root.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((mat) => materials.add(mat))
      } else {
        materials.add(obj.material)
      }
    }
  })

  materials.forEach((mat) => {
    mat.transparent = true
    mat.opacity = 0
    mat.needsUpdate = true
  })

  modelIntroState.fade.active = true
  modelIntroState.fade.start = now
  modelIntroState.fade.materials = Array.from(materials)

  startSpin(Math.PI * 2, 3, true)
}

function updateModelAnimations() {
  if (!currentModel) return

  const now = performance.now() / 1000

  if (modelIntroState.fade.active) {
    const elapsed = now - modelIntroState.fade.start
    const t = THREE.MathUtils.clamp(elapsed / modelIntroState.fade.duration, 0, 1)
    const eased = easeInOutCubic(t)
    modelIntroState.fade.materials.forEach((mat) => {
      mat.opacity = eased
      mat.needsUpdate = true
      if (eased >= 1 && mat.opacity > 1) mat.opacity = 1
    })
    if (t >= 1) {
      modelIntroState.fade.active = false
      modelIntroState.fade.materials.forEach((mat) => {
        mat.opacity = 1
        mat.needsUpdate = true
        if (mat.transparent === true) {
          mat.transparent = true // Keep transparency enabled for potential future fades
        }
      })
    }
  }

  if (modelIntroState.spin.active) {
    const elapsed = now - modelIntroState.spin.start
    const t = THREE.MathUtils.clamp(elapsed / modelIntroState.spin.duration, 0, 1)
    const eased = easeInOutCubic(t)
    currentModel.rotation.y = modelIntroState.spin.from + (modelIntroState.spin.to - modelIntroState.spin.from) * eased
    if (t >= 1) {
      modelIntroState.spin.active = false
      currentModel.rotation.y = modelIntroState.spin.to
    }
  }

  if (modelIntroState.tilt.active) {
    const elapsed = now - modelIntroState.tilt.start
    const t = THREE.MathUtils.clamp(elapsed / modelIntroState.tilt.duration, 0, 1)
    const eased = easeInOutCubic(t)
    currentModel.rotation.x = modelIntroState.tilt.from + (modelIntroState.tilt.to - modelIntroState.tilt.from) * eased
    if (t >= 1) {
      modelIntroState.tilt.active = false
      currentModel.rotation.x = modelIntroState.tilt.to
    }
  }
}

// ============================================================================
// MODEL ROTATION WITH POINTER - Drag to rotate the model while camera stays put
// ============================================================================
function onPointerDown(event) {
  if (!currentModel) return
  isPointerDown = true
  snapRotationState.active = false // Stop any ongoing snap when user drags
  pointerPosition.x = event.clientX
  pointerPosition.y = event.clientY
  renderer.domElement.setPointerCapture(event.pointerId)
}

function onPointerMove(event) {
  if (!isPointerDown || !currentModel) return
  const deltaX = event.clientX - pointerPosition.x
  const deltaY = event.clientY - pointerPosition.y
  currentModel.rotation.y += deltaX * dragRotationSpeed // Horizontal drag -> Y rotation
  currentModel.rotation.x += deltaY * dragRotationSpeed // Vertical drag -> X rotation

  // Clamp rotation limits so the model doesn't flip over
  if (snapRotationSettings.clampDeg) {
    const minRad = THREE.MathUtils.degToRad(snapRotationSettings.clampDeg.min)
    const maxRad = THREE.MathUtils.degToRad(snapRotationSettings.clampDeg.max)
    currentModel.rotation.x = THREE.MathUtils.clamp(currentModel.rotation.x, minRad, maxRad)
  }

  pointerPosition.x = event.clientX
  pointerPosition.y = event.clientY
}

function onPointerUp(event) {
  isPointerDown = false
  applyRotationSnap()
  try {
    renderer.domElement.releasePointerCapture(event.pointerId)
  } catch (e) {
    // Ignore errors if pointer capture was not set
  }
}

function onPointerLeave() {
  isPointerDown = false
  applyRotationSnap()
}

const actionButtons = document.querySelectorAll('[data-model-action]')
actionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    handleModelAction(button.dataset.modelAction)
  })
})

// Central place to map UI actions to model movements.
// Add new buttons by giving them a `data-model-action` and extending the switch below.
function handleModelAction(action) {
  if (!currentModel) {
    console.warn('Model action ignored because no model is loaded yet.')
    return
  }

  snapRotationState.active = false

  switch (action) {
    case 'reset-view': {
      currentModel.position.set(0, 0, 0)
      currentModel.rotation.set(0, 0, 0)
      controls.target.set(0, 0, 0)
      frameObject(currentModel)
      break
    }
    case 'spin': {
      startSpin(Math.PI * 2, 2)
      break
    }
    case 'turn-left': {
      // Rotate left by 90 degrees (quarter turn) with easing
      startSpin(-Math.PI / 2, 1.25)
      break
    }
    case 'turn-right': {
      // Rotate right by 90 degrees (quarter turn) with easing
      startSpin(Math.PI / 2, 1.25)
      break
    }
    case 'tilt-forward': {
      // Tilt forward by 25 degrees (clamped by configuration)
      const max = snapRotationSettings.clampDeg
        ? Math.min(25, snapRotationSettings.clampDeg.max)
        : 25
      startTilt(max, 1)
      break
    }
    case 'tilt-back': {
      // Tilt backward toward the minimum clamp (default -25 deg)
      const min = snapRotationSettings.clampDeg
        ? Math.max(-25, snapRotationSettings.clampDeg.min)
        : -25
      startTilt(min, 1)
      break
    }
    case 'tilt-neutral': {
      // Return to upright position (0 degrees)
      startTilt(0, 0.9)
      break
    }
    default:
      console.warn(`No handler configured for model action "${action}"`)
  }
}

// Expose the handler globally so host pages (iframes) can call it, and flush any queued actions.
window.handleModelAction = handleModelAction
pendingIframeActions.splice(0).forEach((action) => {
  console.log('[iframe] processing queued action:', action)
  handleModelAction(action)
})

function updateSnapRotation() {
  if (!snapRotationState.active || !currentModel) return

  const axis = snapRotationState.axis
  const current = currentModel.rotation[axis]
  const target = snapRotationState.target
  const delta = target - current

  if (Math.abs(delta) <= snapRotationState.epsilon) {
    currentModel.rotation[axis] = target
    snapRotationState.active = false
    return
  }

  currentModel.rotation[axis] = current + delta * snapRotationState.speed

  if (snapRotationSettings.clampDeg) {
    const minRad = THREE.MathUtils.degToRad(snapRotationSettings.clampDeg.min)
    const maxRad = THREE.MathUtils.degToRad(snapRotationSettings.clampDeg.max)
    currentModel.rotation[axis] = THREE.MathUtils.clamp(currentModel.rotation[axis], minRad, maxRad)
  }
}


// Listener for button clicks

// Add this to your main.js file in the Three.js app
// Listen for messages from the parent window (Webflow)
window.addEventListener('message', function(event) {
  // Optional: Add origin checking for security
  // if (event.origin !== 'https://your-webflow-domain.com') return;
  
  if (event.data && event.data.type === 'model-action') {
    const action = event.data.action;
    console.log('Received model action from parent:', action);
    handleModelAction(action);
  }
});

// Optional: Send a ready message to parent when app is loaded
window.parent.postMessage({
  type: 'iframe-ready'
}, '*');

// ============================================================================
// ENVIRONMENT MAP - Load HDR background lighting (keeps background transparent)
// ============================================================================
function loadEnvironmentMap(hdrFile = 'park_music_stage_4k.hdr') {
  rgbeLoader.load(
    hdrFile,
    (texture) => {
      if (currentEnvironment) {
        currentEnvironment.dispose()
      }
      texture.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = texture // Use HDR for reflections and lighting
      currentEnvironment = texture
      console.log('HDR environment loaded:', hdrFile)
    },
    undefined,
    (error) => {
      console.error('Failed to load HDR environment:', hdrFile, error)
    }
  )
}

// ============================================================================
// FRAME OBJECT - Centers the model and positions camera to see it properly
// ============================================================================
function frameObject(object3d) {
  // Calculate the bounding box (the size and position of the model)
  const box = new THREE.Box3().setFromObject(object3d)
  const size = box.getSize(new THREE.Vector3()) // Get width, height, depth
  const center = box.getCenter(new THREE.Vector3()) // Get center point

  // Re-target the camera at the object's center (pivot keeps model near 0,0,0)
  controls.target.set(0, 0, 0)

  // Calculate how far the camera should be to see the whole model
  const maxDim = Math.max(size.x, size.y, size.z) // Largest dimension
  const fov = camera.fov * (Math.PI / 180) // Convert degrees to radians
  let distance = maxDim / (2 * Math.tan(fov / 2)) // Math to fit model in view
  distance *= 1.5 // Add 50% padding so model isn't right at the edge
  
  // Position camera directly in front of model, face-on (looking down Z-axis)
  camera.position.set(0, 0, distance)
  
  // Adjust camera clipping planes based on model size
  camera.near = Math.max(distance / 1000, 0.01) // Don't clip too close
  camera.far = Math.max(distance * 100, 2000) // Don't clip too far
  camera.updateProjectionMatrix() // Apply the changes
  controls.update() // Update orbit controls
}

// ============================================================================
// LOAD MODEL - Loads a .glb file from the public/models folder
// ============================================================================
// You can specify a model in the URL: ?model=YourModel.glb
// Or it will load the default model: airwarp_body_01.glb
function loadModelFromPublic() {
  // Get the model filename from URL, or use default
  const params = new URLSearchParams(window.location.search)
  const modelFile = params.get('model') || 'airwarp_body_01.glb' // Change this to your default model

  console.log('Loading model:', modelFile)

  // Load the model file
  gltfLoader.load(
    modelFile, // File to load
    (gltf) => {
      // SUCCESS - Model loaded!
      console.log('Model loaded successfully:', gltf)
      
      // Remove any previous model/pivot from the scene
      const existingPivot = scene.getObjectByName('LoadedModelPivot')
      if (existingPivot) scene.remove(existingPivot)
      const existingRoot = scene.getObjectByName('LoadedModelRoot')
      if (existingRoot) scene.remove(existingRoot)

      currentModel = null
      modelIntroState.fade.active = false
      modelIntroState.fade.materials = []
      modelIntroState.spin.active = false
      modelIntroState.tilt.active = false

      // Get the model from the loaded file
      const root = gltf.scene
      root.name = 'LoadedModelRoot' // Give it a name so we can find it later
      root.scale.setScalar(1) // Start at normal size (scale = 1)
      root.rotation.set(0, 0, 0) // Reset rotation when loading a new model

      // Move the mesh so its bounding-box center sits at the origin; the pivot stays at 0,0,0
      const rootBounds = new THREE.Box3().setFromObject(root)
      const rootCenter = rootBounds.getCenter(new THREE.Vector3())
      root.position.sub(rootCenter)

      const pivot = new THREE.Object3D()
      pivot.name = 'LoadedModelPivot'
      pivot.add(root)
      pivot.position.set(0, 0, 0)
      pivot.rotation.set(0, 0, 0)
      currentModel = pivot // All interactive rotations operate on this pivot
      
      // Enable shadows on all meshes in the model
      let meshCount = 0
      root.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true // Model can cast shadows
          obj.receiveShadow = true // Model can receive shadows
          meshCount++
        }
      })
      console.log(`Found ${meshCount} meshes in model`)
      
      // Add pivot + model to the scene
      scene.add(pivot)

      // Center and frame the model in the camera view
      frameObject(pivot)
      console.log('Model added to scene and framed')
      
      startModelIntroAnimation(root)
      
      // Update shadow camera to cover the model size
      const modelBox = new THREE.Box3().setFromObject(pivot)
      const modelSize = modelBox.getSize(new THREE.Vector3())
      const maxSize = Math.max(modelSize.x, modelSize.y, modelSize.z)
      const shadowSize = maxSize * 2 // Make shadow area 2x the model size
      sun.shadow.camera.left = -shadowSize
      sun.shadow.camera.right = shadowSize
      sun.shadow.camera.top = shadowSize
      sun.shadow.camera.bottom = -shadowSize
      sun.shadow.camera.updateProjectionMatrix()

      // Optional: Load a texture if specified in URL: ?texture=texture.jpg
      const textureName = params.get('texture')
      if (textureName) {
        const tex = textureLoader.load(textureName)
        root.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            // Apply texture to materials that don't have one
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => { 
                if (m.map === null || m.map === undefined) m.map = tex 
              })
            } else {
              if (obj.material.map === null || obj.material.map === undefined) {
                obj.material.map = tex
                obj.material.needsUpdate = true
              }
            }
          }
        })
      }
    },
    (progress) => {
      // PROGRESS - Called while loading (shows loading percentage)
      console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%')
    },
    (err) => {
      // ERROR - Model failed to load
      console.error('Could not load GLB from /models/. Ensure the file exists and the name is correct.', err)
      console.error('Attempted to load:', modelFile)
    }
  )
}

// Load HDR environment lighting once
loadEnvironmentMap()

// ============================================================================
// START THE APP
// ============================================================================
// Load the model (after GUI is set up so controls can reference it)
loadModelFromPublic()

// Handle window resizing - keep everything looking good when window size changes
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight // Update aspect ratio
  camera.updateProjectionMatrix() // Apply the change
  renderer.setSize(window.innerWidth, window.innerHeight) // Resize the canvas
}
window.addEventListener('resize', onWindowResize)

// ============================================================================
// ANIMATION LOOP - Runs continuously to update the scene
// ============================================================================
function animate() {
  controls.update() // Update camera controls (for smooth damping)
  updateSnapRotation()
  updateModelAnimations()
  renderer.render(scene, camera) // Draw everything to the screen
  requestAnimationFrame(animate) // Run again on next frame (60fps)
}
animate() // Start the animation loop

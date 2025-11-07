// ============================================================================
// IMPORTS - These bring in the libraries we need
// ============================================================================
import './style.css'
import * as THREE from 'three' // Three.js library for 3D graphics
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js' // Camera controls (drag to rotate)
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js' // Loads .glb model files
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js' // Loads HDR environment maps
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { GUI } from 'lil-gui' // Creates the control panel on the right side

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

// Variables to store GUI controls (will be set up later)
let modelFolder = null // The "Model" folder in the control panel
let updateCameraGUI = () => {} // Function to update camera controls (defined later)
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

  modelIntroState.spin.active = true
  modelIntroState.spin.start = now
  modelIntroState.spin.from = 0
  modelIntroState.spin.to = Math.PI * 2
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

  // Move the model so its center is at the world origin (0, 0, 0)
  object3d.position.sub(center)
  controls.target.set(0, 0, 0) // Make camera look at the center

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
  updateCameraGUI() // Update the GUI sliders
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
      
      // Remove any previous model from the scene
      const existing = scene.getObjectByName('LoadedModelRoot')
      if (existing) scene.remove(existing)

      // Remove old GUI controls
      if (modelFolder) {
        modelFolder.destroy()
        modelFolder = null
      }
      currentModel = null
      modelIntroState.fade.active = false
      modelIntroState.fade.materials = []
      modelIntroState.spin.active = false

      // Get the model from the loaded file
      const root = gltf.scene
      root.name = 'LoadedModelRoot' // Give it a name so we can find it later
      root.scale.setScalar(1) // Start at normal size (scale = 1)
      root.rotation.set(0, 0, 0) // Reset rotation when loading a new model
      currentModel = root // Store reference so we can rotate it with the pointer
      
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
      
      // Add model to the scene
      scene.add(root)

      // Center and frame the model in the camera view
      frameObject(root)
      console.log('Model added to scene and framed')
      
      // Create the GUI controls for this model
      setupModelControls(root)
      startModelIntroAnimation(root)
      
      // Update shadow camera to cover the model size
      const modelBox = new THREE.Box3().setFromObject(root)
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

// ============================================================================
// MODEL CONTROLS - Add controls for the loaded model
// ============================================================================
// This function creates the "Model" section in the control panel
function setupModelControls(root) {
  if (!root) return // Exit if no model loaded

  // Remove old controls if they exist (when loading a new model)
  if (modelFolder) {
    modelFolder.destroy()
    modelFolder = null
  }

  // Store the default values for controls
  const defaults = {
    scale: root.scale.x || 1, // Current scale (1 = normal size)
    reset() {
      // Reset button - puts everything back to default
      defaults.scale = 1
      root.scale.setScalar(1) // Set scale back to 1
      scaleController.updateDisplay() // Update the slider
      frameObject(root) // Reframe the camera
    },
  }

  // Create the "Model" folder in the control panel
  modelFolder = gui.addFolder('Model')
  
  // ADD SCALE CONTROL
  // .add(object, property, min, max, step)
  // - object: where the value is stored (defaults.scale)
  // - property: which property to control ('scale')
  // - min: minimum value (0.01 = 1% of original size)
  // - max: maximum value (10 = 1000% of original size)
  // - step: how much it changes per click (0.01 = 1%)
  const scaleController = modelFolder
    .add(defaults, 'scale', 0.01, 10, 0.01)
    .name('scale') // Label in the GUI
    .onChange((value) => {
      // This runs every time the slider changes
      root.scale.setScalar(value) // Apply the scale to the model
    })
  
  // ADD RESET BUTTON
  modelFolder.add(defaults, 'reset').name('reset scale')
  
  // Open the folder by default (so you can see the controls)
  modelFolder.open()
  
  // ============================================================================
  // TO ADD MORE MODEL CONTROLS, COPY THE PATTERN ABOVE:
  // ============================================================================
  // Example: Add rotation control
  // defaults.rotationX = 0
  // modelFolder
  //   .add(defaults, 'rotationX', 0, Math.PI * 2, 0.01)
  //   .name('rotate X')
  //   .onChange((value) => {
  //     root.rotation.x = value
  //   })
  //
  // Example: Add position control
  // defaults.positionY = 0
  // modelFolder
  //   .add(defaults, 'positionY', -10, 10, 0.1)
  //   .name('position Y')
  //   .onChange((value) => {
  //     root.position.y = value
  //   })
  // ============================================================================
}

// ============================================================================
// GUI CONTROL PANEL - Creates the control panel on the right side
// ============================================================================
// Create the main control panel
const gui = new GUI({ title: 'Controls' })

// ============================================================================
// SUN LIGHT CONTROLS - Adjust the sun light position, color, and intensity
// ============================================================================
const sunFolder = gui.addFolder('Sun Light')
const sunParams = {
  color: '#ffffff', // Default color (white)
  helper: true, // Show/hide the light helper
}

// Position controls - where the sun light is located
// .add(object, property, min, max, step)
sunFolder.add(sun.position, 'x', -50, 50, 0.1).name('pos x').onChange(() => { 
  sunHelper.update() // Update the visual helper when position changes
})
sunFolder.add(sun.position, 'y', -50, 50, 0.1).name('pos y').onChange(() => { 
  sunHelper.update() 
})
sunFolder.add(sun.position, 'z', -50, 50, 0.1).name('pos z').onChange(() => { 
  sunHelper.update() 
})

// Intensity control - how bright the light is (0 = off, 10 = very bright)
sunFolder.add(sun, 'intensity', 0, 10, 0.1).name('intensity')

// Color picker - change the light color
sunFolder.addColor(sunParams, 'color').name('color').onChange((v) => { 
  sun.color.set(v) // Apply the color to the light
})

// Toggle to show/hide the yellow helper line
sunFolder.add(sunHelper, 'visible').name('show helper')
sunFolder.open() // Open the folder by default

// ============================================================================
// TO ADD MORE SUN CONTROLS:
// ============================================================================
// Example: Add shadow quality control
// sunParams.shadowQuality = 2048
// sunFolder
//   .add(sunParams, 'shadowQuality', [1024, 2048, 4096])
//   .name('shadow quality')
//   .onChange((value) => {
//     sun.shadow.mapSize.set(value, value)
//   })
// ============================================================================

// ============================================================================
// CAMERA CONTROLS - Adjust camera position and what it's looking at
// ============================================================================
const cameraFolder = gui.addFolder('Camera')
const cameraControllers = [] // Store all camera controls to update them later

// Store camera values (position and target)
const cameraParams = {
  position: {
    x: camera.position.x, // Camera X position
    y: camera.position.y, // Camera Y position
    z: camera.position.z, // Camera Z position
  },
  target: {
    x: controls.target.x, // What the camera looks at (X)
    y: controls.target.y, // What the camera looks at (Y)
    z: controls.target.z, // What the camera looks at (Z)
  },
  reset() {
    // Reset button - puts camera back to face-on position
    const defaultDistance = 5
    camera.position.set(0, 0, defaultDistance) // Face-on position
    controls.target.set(0, 0, 0) // Look at center
    controls.update()
    updateCameraGUI() // Update the sliders
  },
}

// Function to update camera position when slider changes
function updateCameraPosition() {
  camera.position.set(
    cameraParams.position.x,
    cameraParams.position.y,
    cameraParams.position.z
  )
  controls.update() // Update the orbit controls
}

// Function to update camera target (what it's looking at) when slider changes
function updateCameraTarget() {
  controls.target.set(
    cameraParams.target.x,
    cameraParams.target.y,
    cameraParams.target.z
  )
  controls.update()
}

// Add position controls (where the camera is)
cameraControllers.push(
  cameraFolder.add(cameraParams.position, 'x', -200, 200, 0.1).name('pos x').onChange(updateCameraPosition)
)
cameraControllers.push(
  cameraFolder.add(cameraParams.position, 'y', -200, 200, 0.1).name('pos y').onChange(updateCameraPosition)
)
cameraControllers.push(
  cameraFolder.add(cameraParams.position, 'z', -200, 200, 0.1).name('pos z').onChange(updateCameraPosition)
)

// Add target controls (what the camera looks at)
cameraControllers.push(
  cameraFolder.add(cameraParams.target, 'x', -50, 50, 0.1).name('target x').onChange(updateCameraTarget)
)
cameraControllers.push(
  cameraFolder.add(cameraParams.target, 'y', -50, 50, 0.1).name('target y').onChange(updateCameraTarget)
)
cameraControllers.push(
  cameraFolder.add(cameraParams.target, 'z', -50, 50, 0.1).name('target z').onChange(updateCameraTarget)
)

// Add reset button
cameraFolder.add(cameraParams, 'reset').name('reset camera')
cameraFolder.open() // Open the folder by default

// Function to update the GUI sliders when camera moves (from orbit controls)
updateCameraGUI = () => {
  // Sync the slider values with actual camera position
  cameraParams.position.x = camera.position.x
  cameraParams.position.y = camera.position.y
  cameraParams.position.z = camera.position.z
  cameraParams.target.x = controls.target.x
  cameraParams.target.y = controls.target.y
  cameraParams.target.z = controls.target.z
  // Update all the sliders to show current values
  cameraControllers.forEach((controller) => controller.updateDisplay())
}

// ============================================================================
// TO ADD MORE CAMERA CONTROLS:
// ============================================================================
// Example: Add field of view control
// cameraParams.fov = 60
// cameraFolder
//   .add(cameraParams, 'fov', 10, 120, 1)
//   .name('field of view')
//   .onChange((value) => {
//     camera.fov = value
//     camera.updateProjectionMatrix()
//   })
// ============================================================================

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

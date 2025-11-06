import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GUI } from 'lil-gui'

// Root container that will host the WebGL canvas
const container = document.querySelector('#app')

// Scene setup
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111111)

// Camera with a reasonable FOV; will be framed to the model after load
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.01,
  2000
)
camera.position.set(2, 2, 3)

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
container.appendChild(renderer.domElement)

// Camera controls (orbit, zoom, pan)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 0.1
controls.maxDistance = 1000
controls.target.set(0, 0, 0)

// Subtle ambient-like lighting
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7)
hemi.position.set(0, 1, 0)
scene.add(hemi)

// Sun light with shadows
const sun = new THREE.DirectionalLight(0xffffff, 3.0)
sun.position.set(5, 10, 7)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.normalBias = 0.02
sun.shadow.bias = -0.0005
scene.add(sun)
scene.add(sun.target)

const sunHelper = new THREE.DirectionalLightHelper(sun, 0.5, 0xffcc66)
sunHelper.visible = true
scene.add(sunHelper)

// Reference grid/ground and shadow receiver
const grid = new THREE.GridHelper(10, 10, 0x333333, 0x222222)
grid.position.y = 0
scene.add(grid)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 1, metalness: 0 })
)
ground.rotation.x = -Math.PI * 0.5
ground.position.y = 0
ground.receiveShadow = true
scene.add(ground)

// Loaders with predefined public paths
const gltfLoader = new GLTFLoader().setPath('/models/')
const textureLoader = new THREE.TextureLoader().setPath('/textures/')

// Utility: center and frame the loaded model in view
function frameObject(object3d) {
  const box = new THREE.Box3().setFromObject(object3d)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  // Re-center the model at world origin
  object3d.position.sub(center)
  controls.target.set(0, 0, 0)

  // Compute a camera distance based on model size and camera fov
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  let distance = maxDim / (2 * Math.tan(fov / 2))
  distance *= 1.5 // add padding
  camera.position.set(distance, distance * 0.6, distance)
  camera.near = Math.max(distance / 1000, 0.01)
  camera.far = Math.max(distance * 100, 2000)
  camera.updateProjectionMatrix()
  controls.update()
}

// Load a GLB from /public/models using a query param: ?model=YourFile.glb
function loadModelFromPublic() {
  const params = new URLSearchParams(window.location.search)
  const modelFile = params.get('model') || 'airwarp_body_01.glb' // default model filename

  gltfLoader.load(
    modelFile,
    (gltf) => {
      // Remove previous model if any
      const existing = scene.getObjectByName('LoadedModelRoot')
      if (existing) scene.remove(existing)

      const root = gltf.scene
      root.name = 'LoadedModelRoot'
      // Enable shadows on meshes
      root.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true
          obj.receiveShadow = true
        }
      })
      scene.add(root)

      frameObject(root)

      // Optional: apply a texture to the first Mesh if a ?texture= file is provided
      const textureName = params.get('texture')
      if (textureName) {
        const tex = textureLoader.load(textureName)
        root.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => { if (m.map === null || m.map === undefined) m.map = tex; })
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
    undefined,
    (err) => {
      // If the file isn't found, keep the scene running and log to console
      console.warn('Could not load GLB from /public/models. Ensure the file exists and the name is correct.', err)
    }
  )
}

// Initial load
loadModelFromPublic()

// UI controls for the sun light
const gui = new GUI({ title: 'Controls' })
const sunFolder = gui.addFolder('Sun Light')
const sunParams = {
  color: '#ffffff',
  helper: true,
}
sunFolder.add(sun.position, 'x', -50, 50, 0.1).name('pos x').onChange(() => { sunHelper.update() })
sunFolder.add(sun.position, 'y', -50, 50, 0.1).name('pos y').onChange(() => { sunHelper.update() })
sunFolder.add(sun.position, 'z', -50, 50, 0.1).name('pos z').onChange(() => { sunHelper.update() })
sunFolder.add(sun, 'intensity', 0, 10, 0.1).name('intensity')
sunFolder.addColor(sunParams, 'color').name('color').onChange((v) => { sun.color.set(v) })
sunFolder.add(sunHelper, 'visible').name('show helper')
sunFolder.open()

// Respond to resizes
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', onWindowResize)

// Main loop
function animate() {
  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()

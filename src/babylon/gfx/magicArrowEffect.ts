import {
    Color3, Color4, Constants, DynamicTexture, Matrix, Mesh, MeshBuilder, Observer, ParticleSystem,
    Quaternion, Scene, ShaderMaterial, StandardMaterial, Texture, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core'
import { getMagicArrowFlightDuration, MagicArrow } from '@game/game/spells/magicArrow'

const TAU = 2 * Math.PI
const SEGMENTS = 32
const IMPACT_MS = 480
const SKY = new Color3(0.24, 0.82, 1)
const FOAM = new Color3(0.69, 0.97, 1)
const WHITE = new Color3(0.88, 0.99, 1)
const RIBBON_TINTS = [SKY, FOAM, WHITE]
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

type ReadOrigin = (feet: Vector3, crystal: Vector3) => void

const resources = new WeakMap<Scene, {
    wind: ShaderMaterial, spark: DynamicTexture, point: SpellMeshBatch, flash: SpellMeshBatch,
}>()

function getResources(scene: Scene) {
    const existing = resources.get(scene)
    if (existing) return existing
    const wind = new ShaderMaterial('magicArrowWind', scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec4 color;
            uniform mat4 worldViewProjection;
            varying vec2 vUv;
            varying vec4 vColor;
            void main() {
                vUv = uv;
                vColor = color;
                gl_Position = worldViewProjection * vec4(position, 1.);
            }`,
        fragmentSource: `
            precision highp float;
            varying vec2 vUv;
            varying vec4 vColor;
            void main() {
                float across = abs(vUv.y * 2. - 1.);
                float tips = smoothstep(0., .22, vUv.x) * (1. - smoothstep(.68, 1., vUv.x));
                float feather = pow(1. - across, 1.8) * (1. - smoothstep(.84, 1., across));
                float filament = pow(max(0., 1. - abs(vUv.y * 2. - .73)), 12.);
                gl_FragColor = vec4(mix(vColor.rgb, vec3(.84, .97, 1.), filament * .62),
                    vColor.a * tips * (feather * .74 + filament * .26));
            }`,
    }, {attributes: ['position', 'uv', 'color'], uniforms: ['worldViewProjection'], needAlphaBlending: true})
    wind.alphaMode = Constants.ALPHA_ADD
    wind.backFaceCulling = false
    wind.disableDepthWrite = true

    const spark = new DynamicTexture('magicArrowSpark', 64, scene, false, Texture.BILINEAR_SAMPLINGMODE)
    const ctx = spark.getContext()
    const halo = ctx.createRadialGradient(32, 32, 0, 32, 32, 31)
    halo.addColorStop(0, 'rgba(235, 252, 255, 1)')
    halo.addColorStop(0.12, 'rgba(210, 249, 255, .8)')
    halo.addColorStop(0.35, 'rgba(139, 221, 255, .25)')
    halo.addColorStop(1, 'rgba(70, 150, 255, 0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = 'rgba(244, 255, 255, .9)'
    ctx.beginPath()
    ctx.moveTo(32, 8)
    ctx.lineTo(35, 29)
    ctx.lineTo(51, 32)
    ctx.lineTo(35, 35)
    ctx.lineTo(32, 56)
    ctx.lineTo(29, 35)
    ctx.lineTo(13, 32)
    ctx.lineTo(29, 29)
    ctx.closePath()
    ctx.fill()
    spark.hasAlpha = true
    spark.update()

    const core = new StandardMaterial('magicArrowPoint', scene)
    core.disableLighting = true
    core.emissiveColor = new Color3(0.62, 0.87, 0.96)
    core.backFaceCulling = false
    core.specularColor = Color3.Black()
    const flash = new StandardMaterial('magicArrowFlash', scene)
    flash.disableLighting = true
    flash.disableDepthWrite = true
    flash.alphaMode = Constants.ALPHA_ADD
    flash.diffuseTexture = spark
    flash.useAlphaFromDiffuseTexture = true
    flash.emissiveColor = FOAM
    flash.specularColor = Color3.Black()
    flash.backFaceCulling = false
    const plane = MeshBuilder.CreatePlane('magicArrowFlash', {size: 1}, scene)
    plane.material = flash
    plane.hasVertexAlpha = true
    const result = {
        wind, spark,
        point: new SpellMeshBatch(createArrowhead(scene, core)),
        flash: new SpellMeshBatch(plane, true),
    }
    resources.set(scene, result)
    return result
}

function createSpellInstance() {
    return {position: Vector3.Zero(), rotation: Quaternion.Identity(), scale: Vector3.One(), color: new Color4(1, 1, 1, 0)}
}

class SpellMeshBatch {
    readonly instances = new Set<ReturnType<typeof createSpellInstance>>()
    private matrices = new Float32Array(0)
    private colors = new Float32Array(0)
    private readonly matrix = Matrix.Identity()
    private readonly cameraRotation = Quaternion.Identity()

    constructor(private readonly mesh: Mesh, private readonly billboard = false) {
        mesh.isPickable = false
        mesh.alwaysSelectAsActiveMesh = true
        mesh.doNotSyncBoundingInfo = true
        mesh.setEnabled(false)
        const scene = mesh.getScene()
        scene.onBeforeRenderObservable.add(() => this.upload(scene))
    }

    private upload(scene: Scene) {
        if (!this.instances.size && !this.mesh.isEnabled()) return
        if (this.matrices.length < this.instances.size * 16) {
            const capacity = Math.max(4, this.instances.size * 2)
            this.matrices = new Float32Array(capacity * 16)
            this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false)
            if (this.billboard) {
                this.colors = new Float32Array(capacity * 4)
                this.mesh.thinInstanceSetBuffer(VertexBuffer.ColorInstanceKind, this.colors, 4, false)
            }
        }
        if (this.billboard) scene.activeCamera?.getWorldMatrix().decompose(undefined, this.cameraRotation)
        let count = 0
        for (const item of this.instances) {
            if (item.color.a <= 0.025) continue
            Matrix.ComposeToRef(item.scale, this.billboard ? this.cameraRotation : item.rotation, item.position, this.matrix)
            this.matrix.copyToArray(this.matrices, count * 16)
            if (this.billboard) item.color.toArray(this.colors, count * 4)
            count++
        }
        this.mesh.thinInstanceCount = count
        this.mesh.setEnabled(count > 0)
        if (!count) return
        this.mesh.thinInstanceBufferUpdated('matrix')
        if (this.billboard) this.mesh.thinInstanceBufferUpdated(VertexBuffer.ColorInstanceKind)
    }
}

class WindRibbons {
    readonly mesh: Mesh
    private readonly positions = new Float32Array(RIBBON_TINTS.length * (SEGMENTS + 1) * 6)
    private readonly colors = new Float32Array(RIBBON_TINTS.length * (SEGMENTS + 1) * 8)

    constructor(scene: Scene, material: ShaderMaterial) {
        this.mesh = new Mesh('magicArrowRibbon', scene)
        this.mesh.material = material
        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.isPickable = false
        this.mesh.doNotSyncBoundingInfo = true
        const uv: number[] = []
        const indices: number[] = []
        for (const [ribbon, tint] of RIBBON_TINTS.entries()) {
            for (let i = 0; i <= SEGMENTS; i++) {
                const vertex = ribbon * (SEGMENTS + 1) + i
                const edge = vertex * 2
                uv.push(i / SEGMENTS, 0, i / SEGMENTS, 1)
                this.colors.set([tint.r, tint.g, tint.b, 0, tint.r, tint.g, tint.b, 0], vertex * 8)
                if (i < SEGMENTS) indices.push(edge, edge + 1, edge + 2, edge + 1, edge + 3, edge + 2)
            }
        }
        this.mesh.setVerticesData(VertexBuffer.PositionKind, this.positions, true)
        this.mesh.setVerticesData(VertexBuffer.ColorKind, this.colors, true)
        this.mesh.setVerticesData(VertexBuffer.UVKind, uv)
        this.mesh.setIndices(indices)
        this.mesh.setEnabled(false)
    }

    update(ribbon: number, opacity: number, sample: (u: number, center: Vector3, across: Vector3) => void) {
        this.visible ||= opacity > 0.004
        const center = this.center
        const across = this.across
        for (let i = 0; i <= SEGMENTS; i++) {
            sample(i / SEGMENTS, center, across)
            const vertex = ribbon * (SEGMENTS + 1) + i
            const offset = vertex * 6
            this.positions[offset] = center.x - across.x
            this.positions[offset + 1] = center.y - across.y
            this.positions[offset + 2] = center.z - across.z
            this.positions[offset + 3] = center.x + across.x
            this.positions[offset + 4] = center.y + across.y
            this.positions[offset + 5] = center.z + across.z
            this.colors[vertex * 8 + 3] = opacity
            this.colors[vertex * 8 + 7] = opacity
        }
    }

    upload() {
        this.mesh.setEnabled(this.visible)
        if (this.visible) {
            this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions)
            this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colors)
        }
        this.visible = false
    }

    private visible = false
    private readonly center = Vector3.Zero()
    private readonly across = Vector3.Zero()
}

function createSparks(scene: Scene, texture: Texture, emitter: Vector3) {
    const sparks = new ParticleSystem('magicArrowSparks', 96, scene)
    sparks.particleTexture = texture
    sparks.emitter = emitter
    sparks.blendMode = ParticleSystem.BLENDMODE_ADD
    sparks.minEmitBox.setAll(-0.025)
    sparks.maxEmitBox.setAll(0.025)
    sparks.direction1.set(-1, -0.55, -1)
    sparks.direction2.set(1, 1.15, 1)
    sparks.minLifeTime = 0.12
    sparks.maxLifeTime = 0.38
    sparks.minEmitPower = 0.22
    sparks.maxEmitPower = 0.72
    sparks.minSize = 0.047
    sparks.maxSize = 0.173
    sparks.minAngularSpeed = -2
    sparks.maxAngularSpeed = 2
    sparks.color1 = new Color4(0.55, 0.9, 1, 0.86)
    sparks.color2 = new Color4(0.92, 1, 1, 0.9)
    sparks.colorDead = new Color4(0.17, 0.47, 0.75, 0)
    sparks.emitRate = 55
    sparks.start()
    return sparks
}

function createArrowhead(scene: Scene, material: StandardMaterial) {
    const point = new Mesh('magicArrowPoint', scene)
    const shape = new VertexData()
    // Tip, two barbs, and a raised midrib. +Z is the direction of flight.
    shape.positions = [
        0, 0, 0.23, -0.105, 0, -0.09, 0.105, 0, -0.09,
        0, 0.047, -0.055, 0, -0.047, -0.055, 0, 0, -0.033,
    ]
    shape.indices = [0, 1, 3, 0, 3, 2, 1, 5, 3, 3, 5, 2, 0, 4, 1, 0, 2, 4, 1, 4, 5, 4, 2, 5]
    shape.normals = []
    VertexData.ComputeNormals(shape.positions, shape.indices, shape.normals)
    shape.applyToMesh(point)
    point.material = material
    return point
}

/** The same charge, flight and impact are rendered in the game and in the spell preview. */
export class MagicArrowEffect {
    private readonly ribbons: WindRibbons
    private readonly sparks: ParticleSystem
    private readonly windMotes: ParticleSystem
    private readonly point = createSpellInstance()
    private readonly flash = createSpellInstance()
    private readonly feet = Vector3.Zero()
    private readonly crystal = Vector3.Zero()
    private readonly launch = Vector3.Zero()
    private readonly end = Vector3.Zero()
    private readonly forward = Vector3.Forward()
    private readonly side = Vector3.Right()
    private readonly up = Vector3.Up()
    private readonly tipCursor = Vector3.Zero()
    private readonly bornAt = performance.now()
    private releasedAt: number | null = null
    private flightMs: number = 0
    private trackTarget?: (position: Vector3) => void
    private observer: Observer<Scene>
    private impacted = false
    private disposed = false

    get isDisposed() { return this.disposed }
    get phase() { return this.impacted ? 'impact' : this.releasedAt === null ? 'charge' : 'flight' }

    constructor(private readonly scene: Scene, private readonly readOrigin: ReadOrigin, private readonly previewSpeed = 1) {
        const {wind, spark, point, flash} = getResources(scene)
        this.ribbons = new WindRibbons(scene, wind)
        this.readOrigin(this.feet, this.crystal)
        this.sparks = createSparks(scene, spark, this.crystal)
        this.windMotes = createSparks(scene, spark, this.feet)
        this.windMotes.minEmitBox.set(-0.7, 0.16, -0.7)
        this.windMotes.maxEmitBox.set(0.7, 1.02, 0.7)
        this.windMotes.direction1.set(-0.55, 0.35, -0.55)
        this.windMotes.direction2.set(0.55, 1.7, 0.55)
        this.windMotes.minSize = 0.024
        this.windMotes.maxSize = 0.10
        this.windMotes.emitRate = 42
        this.sparks.updateSpeed *= this.previewSpeed
        this.windMotes.updateSpeed *= this.previewSpeed
        point.instances.add(this.point)
        flash.instances.add(this.flash)
        // Publish each spell's transforms before the scene batches upload them.
        this.observer = scene.onBeforeRenderObservable.add(() => this.update(performance.now()), -1, true)
    }

    release(target: Vector3, flightMs?: number, trackTarget?: (position: Vector3) => void) {
        this.readOrigin(this.feet, this.crystal)
        this.launch.copyFrom(this.crystal)
        this.end.copyFrom(target)
        this.end.subtractToRef(this.launch, this.forward)
        const distance = this.forward.length()
        if (distance < 0.001) this.forward.copyFromFloats(0, 0, 1)
        this.forward.normalize()
        Vector3.CrossToRef(Math.abs(this.forward.y) > 0.95 ? Vector3.RightReadOnly : Vector3.UpReadOnly, this.forward, this.side)
        this.side.normalize()
        Vector3.CrossToRef(this.forward, this.side, this.up)
        Quaternion.RotationQuaternionFromAxisToRef(this.side, this.up, this.forward, this.point.rotation)
        this.flightMs = flightMs ?? getMagicArrowFlightDuration(distance)
        this.trackTarget = trackTarget
        this.releasedAt = performance.now()
        this.sparks.emitRate = 165
        this.sparks.minEmitPower = 0.65
        this.sparks.maxEmitPower = 1.65
        this.windMotes.stop()
    }

    dispose() {
        if (this.disposed) return
        this.disposed = true
        this.scene.onBeforeRenderObservable.remove(this.observer)
        this.ribbons.mesh.dispose()
        const {point, flash} = getResources(this.scene)
        point.instances.delete(this.point)
        flash.instances.delete(this.flash)
        this.sparks.dispose(false)
        this.windMotes.dispose(false)
    }

    private drawFlash(position: Vector3, scale: number, opacity: number) {
        this.flash.position.copyFrom(position)
        this.flash.scale.setAll(scale)
        this.flash.color.a = opacity
    }

    private update(time: number) {
        if (this.releasedAt === null) {
            const elapsed = (time - this.bornAt) * this.previewSpeed
            if (elapsed > MagicArrow.castDuration + 500) {
                this.dispose()
                return
            }
            this.updateCharge(elapsed)
            return
        }
        const elapsed = (time - this.releasedAt) * this.previewSpeed
        if (elapsed < this.flightMs) this.updateFlight(elapsed)
        else if (elapsed < this.flightMs + IMPACT_MS) this.updateImpact(elapsed - this.flightMs)
        else this.dispose()
    }

    private updateCharge(elapsed: number) {
        this.readOrigin(this.feet, this.crystal)
        const progress = clamp01(elapsed / MagicArrow.castDuration)
        const strength = clamp01(elapsed / 220) * (0.44 + 0.43 * progress)
        this.sparks.emitRate = 28 + 92 * progress * progress
        this.drawFlash(this.crystal, 0.19 + 0.35 * progress, progress ** 2 * (0.46 + 0.24 * Math.sin(elapsed * 0.037)))
        for (let index = 0; index < RIBBON_TINTS.length; index++) {
            const handSpiral = index === 2
            const phase = elapsed * (handSpiral ? -0.013 : 0.0044 + progress * 0.0025) + index * 2.35
            const base = handSpiral ? this.crystal : this.feet
            this.ribbons.update(index, strength * (handSpiral ? 0.76 : 1), (u, center, across) => {
                const theta = phase + u * (handSpiral ? 4.9 : 5.4)
                const radius = handSpiral ? 0.08 + 0.14 * (1 - u) :
                    (0.85 - progress * 0.21 - 0.33 * u) * (1 + 0.10 * Math.cos(theta * 2))
                const y = handSpiral ? (u - 0.5) * 0.27 :
                    0.14 + (index * 0.42) + u * (0.62 + progress * 0.42)
                center.set(base.x + Math.cos(theta) * radius, base.y + y, base.z + Math.sin(theta) * radius)
                const width = (handSpiral ? 0.036 : 0.105 - index * 0.021)
                    * (0.42 + Math.sin(Math.PI * u))
                across.set(Math.cos(theta) * width * 0.44, width, Math.sin(theta) * width * 0.44)
            })
        }
        this.ribbons.upload()
    }

    private updateFlight(elapsed: number) {
        this.trackTarget?.(this.end)
        const progress = clamp01(elapsed / this.flightMs)
        const distanceTraveled = Math.min(1.38, Vector3.Distance(this.launch, this.end) * progress + 0.12)
        Vector3.LerpToRef(this.launch, this.end, progress, this.tipCursor)
        this.crystal.copyFrom(this.tipCursor)
        this.point.position.copyFrom(this.tipCursor)
        this.point.color.a = 1
        this.drawFlash(this.tipCursor, 0.32, 0.45)
        for (let index = 0; index < RIBBON_TINTS.length; index++) {
            this.ribbons.update(index, index === 0 ? 0.92 : 0.76, (u, center, across) => {
                const theta = u * 6.4 + progress * TAU + index * TAU / 3
                const tail = (1 - u) * distanceTraveled
                const radius = index === 0 ? 0 : (1 - u) * 0.22
                this.tipCursor.subtractToRef(this.forward.scaleToRef(tail, center), center)
                center.addInPlaceFromFloats(
                    radius * (this.up.x * Math.cos(theta) + this.side.x * Math.sin(theta)),
                    radius * (this.up.y * Math.cos(theta) + this.side.y * Math.sin(theta)),
                    radius * (this.up.z * Math.cos(theta) + this.side.z * Math.sin(theta)),
                )
                const width = (index === 0 ? 0.15 : 0.087) * (0.25 + 0.75 * u)
                const edgeDirection = index === 2 ? this.side : this.up
                edgeDirection.scaleToRef(width, across)
            })
        }
        this.ribbons.upload()
    }

    private updateImpact(elapsed: number) {
        if (!this.impacted) {
            this.impacted = true
            this.trackTarget?.(this.end)
            this.trackTarget = undefined
            this.point.color.a = 0
            this.crystal.copyFrom(this.end)
            this.sparks.emitRate = 0
            this.sparks.minEmitPower = 1.35
            this.sparks.maxEmitPower = 2.7
            this.sparks.manualEmitCount = 42
        }
        const progress = clamp01(elapsed / IMPACT_MS)
        const radius = 0.12 + 0.98 * (1 - (1 - progress) ** 3)
        this.drawFlash(this.end, 0.38 + 0.8 * progress, (1 - progress) ** 4)
        for (let index = 0; index < RIBBON_TINTS.length; index++) {
            this.ribbons.update(index, (1 - progress) ** 2 * (0.94 - index * 0.16), (u, center, across) => {
                const theta = u * (index === 0 ? TAU + 0.45 : 5.1) + index * 2.25 + progress * 0.42
                const localRadius = radius * (1 - index * 0.23)
                const slant = index % 2 === 0 ? 0.88 : -0.75
                const horizontal = Math.cos(theta)
                const vertical = Math.sin(theta)
                across.set(
                    (this.side.x * 0.68 + this.forward.x * slant) * horizontal + this.up.x * vertical,
                    (this.side.y * 0.68 + this.forward.y * slant) * horizontal + this.up.y * vertical,
                    (this.side.z * 0.68 + this.forward.z * slant) * horizontal + this.up.z * vertical,
                )
                across.scaleToRef(localRadius, center)
                center.addInPlace(this.end)
                center.addInPlaceFromFloats(this.forward.x * index * -0.12, index * 0.14, this.forward.z * index * -0.12)
                across.scaleInPlace((0.14 - index * 0.03) * (1 - progress))
            })
        }
        this.ribbons.upload()
    }
}

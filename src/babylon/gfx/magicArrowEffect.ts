import {
    Color3, Color4, Constants, DynamicTexture, GlowLayer, Matrix, Mesh, MeshBuilder, Observer, ParticleSystem,
    Quaternion, Scene, ShaderMaterial, StandardMaterial, Texture, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core'
import { getMagicArrowFlightDuration, MagicArrow } from '@game/game/spells/magicArrow'

const TAU = 2 * Math.PI
const IMPACT_MS = 480
const CHARGE_FADE_MS = 260
const DEFAULT_IMPACT_DISTANCE_FROM_CENTER = 0.3
const SKY = new Color3(0.24, 0.82, 1)
const FOAM = new Color3(0.69, 0.97, 1)
const WHITE = new Color3(0.88, 0.99, 1)
const RIBBON_TINTS = [SKY, FOAM, WHITE, FOAM, SKY]
const CHARGE_RIBBON_COUNT = RIBBON_TINTS.length
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export const MAGIC_ARROW_DETAILS = ['LOW', 'MEDIUM', 'HIGH'] as const
type MagicArrowDetail = typeof MAGIC_ARROW_DETAILS[number]

const detailProfiles = {
    LOW: {ribbons: 1, segments: 16, sparkCapacity: 36, chargeSparks: 30, flightSparks: 55, impactSparks: 20, windMotes: 0},
    MEDIUM: {ribbons: 2, segments: 24, sparkCapacity: 64, chargeSparks: 76, flightSparks: 105, impactSparks: 28, windMotes: 0},
    HIGH: {ribbons: 3, segments: 32, sparkCapacity: 96, chargeSparks: 128, flightSparks: 170, impactSparks: 44, windMotes: 45},
} as const

type ReadOrigin = (feet: Vector3, crystal: Vector3) => void

const resources = new WeakMap<Scene, {
    wind: ShaderMaterial, spark: DynamicTexture, point: SpellMeshBatch, flash: SpellMeshBatch,
    ribbons: Set<Mesh>, glow: MagicArrowGlowLayer | null,
}>()
const glowEnabledScenes = new WeakSet<Scene>()
const transparentPreviewScenes = new WeakSet<Scene>()

function spellAlphaMode(scene: Scene) {
    // Additive blending leaves destination alpha unchanged on transparent canvases.
    return transparentPreviewScenes.has(scene) ? Constants.ALPHA_LAYER_ACCUMULATE : Constants.ALPHA_ADD
}

class MagicArrowGlowLayer extends GlowLayer {
    private declare spellMeshes: Mesh[]

    protected override _createMainTexture() {
        super._createMainTexture()
        // Babylon creates the texture during construction and recreates it on resize.
        this._mainTexture.renderList = this.spellMeshes ??= []
        this._mainTexture.forceLayerMaskCheck = true
    }

    track(mesh: Mesh) {
        this.spellMeshes.push(mesh)
        this.referenceMeshToUseItsOwnMaterial(mesh)
    }

    untrack(mesh: Mesh) {
        const index = this.spellMeshes.indexOf(mesh)
        if (index === -1) return
        this.spellMeshes.splice(index, 1)
        this.unReferenceMeshFromUsingItsOwnMaterial(mesh)
    }
}

export function setMagicArrowGlowEnabled(scene: Scene, enabled: boolean, transparentPreview = false) {
    if (transparentPreview !== transparentPreviewScenes.has(scene)) {
        if (transparentPreview) transparentPreviewScenes.add(scene)
        else transparentPreviewScenes.delete(scene)
        const spells = resources.get(scene)
        if (spells) {
            spells.wind.alphaMode = spellAlphaMode(scene)
            spells.flash.mesh.material!.alphaMode = spellAlphaMode(scene)
            spells.glow?.dispose()
            spells.glow = null
        }
    }
    if (enabled) glowEnabledScenes.add(scene)
    else glowEnabledScenes.delete(scene)
    updateMagicArrowGlow(scene)
}

function updateMagicArrowGlow(scene: Scene) {
    const spells = resources.get(scene)
    if (!spells || scene.isDisposed) return
    const enabled = glowEnabledScenes.has(scene) && spells.ribbons.size > 0
    if (enabled && !spells.glow) {
        const transparentPreview = transparentPreviewScenes.has(scene)
        const glow = new MagicArrowGlowLayer('magicArrowGlow', scene, {
            mainTextureRatio: 0.5, blurKernelSize: 32,
            alphaBlendingMode: transparentPreview ? Constants.ALPHA_PREMULTIPLIED_PORTERDUFF : Constants.ALPHA_ADD,
        })
        if (transparentPreview) glow.neutralColor.a = 0
        glow.intensity = 0.75
        glow.track(spells.point.mesh)
        glow.track(spells.flash.mesh)
        for (const ribbon of spells.ribbons) glow.track(ribbon)
        spells.glow = glow
    }
    if (spells.glow) spells.glow.isEnabled = enabled
}

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
    wind.alphaMode = spellAlphaMode(scene)
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
    flash.alphaMode = spellAlphaMode(scene)
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
        ribbons: new Set<Mesh>(),
        glow: null as MagicArrowGlowLayer | null,
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

    constructor(readonly mesh: Mesh, private readonly billboard = false) {
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
    private readonly positions: Float32Array
    private readonly colors: Float32Array

    constructor(scene: Scene, material: ShaderMaterial, ribbonCount: number, private readonly segments: number) {
        const vertices = ribbonCount * (segments + 1) * 2
        this.positions = new Float32Array(vertices * 3)
        this.colors = new Float32Array(vertices * 4)
        this.mesh = new Mesh('magicArrowRibbon', scene)
        this.mesh.material = material
        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.isPickable = false
        this.mesh.doNotSyncBoundingInfo = true
        const uv: number[] = []
        const indices: number[] = []
        for (let ribbon = 0; ribbon < ribbonCount; ribbon++) {
            const tint = RIBBON_TINTS[ribbon]
            for (let i = 0; i <= segments; i++) {
                const vertex = ribbon * (segments + 1) + i
                const edge = vertex * 2
                uv.push(i / segments, 0, i / segments, 1)
                this.colors.set([tint.r, tint.g, tint.b, 0, tint.r, tint.g, tint.b, 0], vertex * 8)
                if (i < segments) indices.push(edge, edge + 1, edge + 2, edge + 1, edge + 3, edge + 2)
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
        for (let i = 0; i <= this.segments; i++) {
            sample(i / this.segments, center, across)
            const vertex = ribbon * (this.segments + 1) + i
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

function createSparks(scene: Scene, texture: Texture, emitter: Vector3, capacity: number, playbackSpeed: number) {
    const sparks = new ParticleSystem('magicArrowSparks', capacity, scene)
    sparks.particleTexture = texture
    sparks.emitter = emitter
    sparks.blendMode = transparentPreviewScenes.has(scene) ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD
    sparks.minEmitBox.setAll(-0.025)
    sparks.maxEmitBox.setAll(0.025)
    sparks.direction1.set(-1, -0.55, -1)
    sparks.direction2.set(1, 1.15, 1)
    sparks.minLifeTime = 0.12
    sparks.maxLifeTime = 0.38
    sparks.minEmitPower = 0.22
    sparks.maxEmitPower = 0.72
    sparks.minSize = 0.054
    sparks.maxSize = 0.199
    sparks.minAngularSpeed = -2
    sparks.maxAngularSpeed = 2
    sparks.color1 = new Color4(0.55, 0.9, 1, 0.86)
    sparks.color2 = new Color4(0.92, 1, 1, 0.9)
    sparks.colorDead = new Color4(0.17, 0.47, 0.75, 0)
    sparks.emitRate = 0
    sparks.updateSpeed *= playbackSpeed
    sparks.start()
    return sparks
}

function createWindMotes(scene: Scene, texture: Texture, feet: Vector3, emitRate: number, playbackSpeed: number) {
    const motes = createSparks(scene, texture, feet, 32, playbackSpeed)
    motes.minEmitBox.set(-0.7, 0.16, -0.7)
    motes.maxEmitBox.set(0.7, 1.02, 0.7)
    motes.direction1.set(-0.55, 0.35, -0.55)
    motes.direction2.set(0.55, 1.7, 0.55)
    motes.minSize = 0.036
    motes.maxSize = 0.15
    motes.emitRate = emitRate
    return motes
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
    private chargeRibbons: WindRibbons | null
    private projectileRibbons: WindRibbons | null = null
    private readonly sparks: ParticleSystem
    private readonly windMotes: ParticleSystem | null
    private readonly profile: typeof detailProfiles[MagicArrowDetail]
    private readonly point = createSpellInstance()
    private readonly flash = createSpellInstance()
    private readonly feet = Vector3.Zero()
    private readonly crystal = Vector3.Zero()
    private readonly launch = Vector3.Zero()
    private readonly targetCenter = Vector3.Zero()
    private readonly end = Vector3.Zero()
    private readonly forward = Vector3.Forward()
    private readonly side = Vector3.Right()
    private readonly up = Vector3.Up()
    private readonly tipCursor = Vector3.Zero()
    private readonly flightTangent = Vector3.Zero()
    private readonly flightSide = Vector3.Zero()
    private readonly flightUp = Vector3.Zero()
    private readonly bornAt = performance.now()
    private releasedAt: number | null = null
    private chargeEndedAt: number | null = null
    private flightMs: number = 0
    private impactDistance = DEFAULT_IMPACT_DISTANCE_FROM_CENTER
    private trackTarget?: (position: Vector3) => void
    private observer: Observer<Scene>
    private impacted = false
    private disposed = false

    get isDisposed() { return this.disposed }
    get phase() { return this.impacted ? 'impact' : this.releasedAt === null ? 'charge' : 'flight' }

    constructor(private readonly scene: Scene, private readonly readOrigin: ReadOrigin,
                detail: MagicArrowDetail, private readonly previewSpeed = 1, private readonly layerMask?: number) {
        const spells = getResources(scene)
        const {spark, point, flash} = spells
        this.profile = detailProfiles[detail]
        this.chargeRibbons = this.createRibbons(CHARGE_RIBBON_COUNT)
        this.readOrigin(this.feet, this.crystal)
        this.sparks = createSparks(scene, spark, this.crystal, this.profile.sparkCapacity, previewSpeed)
        this.windMotes = this.profile.windMotes
            ? createWindMotes(scene, spark, this.feet, this.profile.windMotes, previewSpeed)
            : null
        if (layerMask !== undefined) {
            this.sparks.layerMask = layerMask
            // Draw larger particles above the character in the small preview card.
            this.sparks.renderingGroupId = 1
            this.sparks.minSize *= 1.5
            this.sparks.maxSize *= 1.5
            if (this.windMotes) {
                this.windMotes.layerMask = layerMask
                this.windMotes.renderingGroupId = 1
                this.windMotes.minSize *= 1.5
                this.windMotes.maxSize *= 1.5
                this.windMotes.emitRate *= 1.5
            }
            point.mesh.layerMask |= layerMask
            flash.mesh.layerMask |= layerMask
        }
        this.point.scale.set(1.13, 1.13, 1.18)
        point.instances.add(this.point)
        flash.instances.add(this.flash)
        updateMagicArrowGlow(scene)
        // Publish each spell's transforms before the scene batches upload them.
        this.observer = scene.onBeforeRenderObservable.add(() => this.update(performance.now()), -1, true)
    }

    finishCharge() {
        this.chargeEndedAt = performance.now()
        this.flash.color.a = 0
        this.sparks.stop()
        this.windMotes?.stop()
    }

    release(target: Vector3, flightMs?: number, trackTarget?: (position: Vector3) => void,
            impactDistance = DEFAULT_IMPACT_DISTANCE_FROM_CENTER) {
        this.readOrigin(this.feet, this.crystal)
        this.launch.copyFrom(this.crystal)
        this.targetCenter.copyFrom(target)
        this.targetCenter.subtractToRef(this.launch, this.forward)
        const distance = this.forward.length()
        if (distance < 0.001) this.forward.copyFromFloats(0, 0, 1)
        this.forward.normalize()
        Vector3.CrossToRef(Math.abs(this.forward.y) > 0.95 ? Vector3.RightReadOnly : Vector3.UpReadOnly, this.forward, this.side)
        this.side.normalize()
        Vector3.CrossToRef(this.forward, this.side, this.up)
        Quaternion.RotationQuaternionFromAxisToRef(this.side, this.up, this.forward, this.point.rotation)
        this.flightMs = flightMs ?? getMagicArrowFlightDuration(distance)
        this.trackTarget = trackTarget
        this.impactDistance = impactDistance
        this.updateContactPoint()
        this.releasedAt = performance.now()
        this.chargeEndedAt = this.releasedAt
        this.projectileRibbons = this.createRibbons(this.profile.ribbons)
        this.sparks.emitRate = this.profile.flightSparks
        this.sparks.minEmitPower = 0.65
        this.sparks.maxEmitPower = 1.65
        this.windMotes?.stop()
    }

    dispose() {
        if (this.disposed) return
        this.disposed = true
        this.scene.onBeforeRenderObservable.remove(this.observer)
        const {point, flash} = getResources(this.scene)
        this.disposeRibbons(this.chargeRibbons)
        this.disposeRibbons(this.projectileRibbons)
        updateMagicArrowGlow(this.scene)
        point.instances.delete(this.point)
        flash.instances.delete(this.flash)
        this.sparks.dispose(false)
        this.windMotes?.dispose(false)
    }

    private createRibbons(count: number) {
        const {wind, ribbons, glow} = getResources(this.scene)
        const strips = new WindRibbons(this.scene, wind, count, this.profile.segments)
        if (this.layerMask !== undefined) strips.mesh.layerMask = this.layerMask
        ribbons.add(strips.mesh)
        glow?.track(strips.mesh)
        return strips
    }

    private disposeRibbons(strips: WindRibbons | null) {
        if (!strips) return
        const {ribbons, glow} = getResources(this.scene)
        ribbons.delete(strips.mesh)
        if (!this.scene.isDisposed) glow?.untrack(strips.mesh)
        strips.mesh.dispose()
    }

    private drawFlash(position: Vector3, scale: number, opacity: number) {
        this.flash.position.copyFrom(position)
        this.flash.scale.setAll(scale)
        this.flash.color.a = opacity
    }

    private update(time: number) {
        if (this.chargeEndedAt !== null) {
            const fadeElapsed = (time - this.chargeEndedAt) * this.previewSpeed
            if (this.chargeRibbons) {
                if (fadeElapsed < CHARGE_FADE_MS) {
                    this.updateChargeRibbons((this.chargeEndedAt - this.bornAt) * this.previewSpeed, fadeElapsed)
                } else {
                    this.disposeRibbons(this.chargeRibbons)
                    this.chargeRibbons = null
                    updateMagicArrowGlow(this.scene)
                }
            }
            if (this.releasedAt === null) {
                if (fadeElapsed >= IMPACT_MS) this.dispose()
                return
            }
        }
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
        this.sparks.emitRate = this.profile.chargeSparks * (0.26 + 0.74 * progress * progress) * (this.layerMask === undefined ? 1 : 1.5)
        this.drawFlash(this.crystal, 0.22 + 0.41 * progress, progress ** 1.6 * (0.59 + 0.22 * Math.sin(elapsed * 0.037)))
        this.updateChargeRibbons(elapsed)
    }

    private updateChargeRibbons(elapsed: number, fadeElapsed = 0) {
        const ribbons = this.chargeRibbons!
        const progress = clamp01(elapsed / MagicArrow.castDuration)
        const fade = fadeElapsed / CHARGE_FADE_MS
        const strength = clamp01(elapsed / 180) * (0.55 + 0.45 * progress) * (1 - fade) ** 2
        const motionTime = elapsed + fadeElapsed * (1 - 0.5 * fade)
        const chargeOrigin = this.releasedAt === null ? this.crystal : this.launch
        for (let index = 0; index < CHARGE_RIBBON_COUNT; index++) {
            const handSpiral = index === 2
            const counterRotating = index >= 3
            const band = counterRotating ? index - 3 : index
            const direction = counterRotating ? -1 : 1
            const spin = handSpiral ? -0.016 : direction * (0.0061 + progress * 0.0033)
            const phase = motionTime * spin + band * 2.35 + (counterRotating ? Math.PI : 0)
            const base = handSpiral ? chargeOrigin : this.feet
            const opacity = counterRotating ? 0.62 : index === 0 ? 1 : handSpiral ? 0.56 : 0.72
            ribbons.update(index, strength * opacity, (u, center, across) => {
                const theta = phase + u * (handSpiral ? 4.9 : direction * (band === 0 ? 6.7 : 5.4))
                const cos = Math.cos(theta)
                const sin = Math.sin(theta)
                const radius = handSpiral ? 0.08 + 0.14 * (1 - u) :
                    (0.85 - progress * 0.21 - 0.33 * u + (counterRotating ? 0.07 : 0)) * (0.9 + 0.20 * cos * cos)
                const y = handSpiral ? (u - 0.5) * 0.27 :
                    0.14 + band * 0.42 + u * (0.62 + progress * 0.42) + (counterRotating ? 0.12 : 0)
                center.set(base.x + cos * radius, base.y + y, base.z + sin * radius)
                const width = (handSpiral ? 0.035 : (0.143 - band * 0.063) * (counterRotating ? 0.72 : 1))
                    * (0.42 + Math.sin(Math.PI * u))
                across.set(cos * width * 0.44, width, sin * width * 0.44)
            })
        }
        ribbons.upload()
    }

    private updateFlight(elapsed: number) {
        const ribbons = this.projectileRibbons!
        if (this.trackTarget) this.updateContactPoint()
        const progress = clamp01(elapsed / this.flightMs)
        const distance = Vector3.Distance(this.launch, this.end)
        const sway = Math.min(0.18, distance * 0.06)
        const trailProgress = Math.min(progress, 1.38 / Math.max(distance, 0.001))
        this.sampleFlightPath(progress, sway, this.tipCursor)
        if (distance > 0.001) {
            this.sampleFlightPath(clamp01(progress + 0.01), sway, this.flightTangent)
            this.sampleFlightPath(clamp01(progress - 0.01), sway, this.flightSide)
            this.flightTangent.subtractInPlace(this.flightSide).normalize()
            const upAxis = Math.abs(this.flightTangent.y) > 0.95 ? Vector3.RightReadOnly : Vector3.UpReadOnly
            Vector3.CrossToRef(upAxis, this.flightTangent, this.flightSide)
            Vector3.CrossToRef(this.flightTangent, this.flightSide, this.flightUp)
            Quaternion.RotationQuaternionFromAxisToRef(this.flightSide, this.flightUp, this.flightTangent, this.point.rotation)
        }
        this.crystal.copyFrom(this.tipCursor)
        this.point.position.copyFrom(this.tipCursor)
        this.point.color.a = 1
        this.drawFlash(this.tipCursor, 0.37, 0.58)
        for (let index = 0; index < this.profile.ribbons; index++) {
            ribbons.update(index, index === 0 ? 1 : 0.68, (u, center, across) => {
                const theta = u * 6.4 + progress * TAU + index * TAU / 3
                const radius = index === 0 ? 0 : (1 - u) * 0.22
                this.sampleFlightPath(progress - (1 - u) * trailProgress, sway, center)
                center.addInPlaceFromFloats(
                    radius * (this.up.x * Math.cos(theta) + this.side.x * Math.sin(theta)),
                    radius * (this.up.y * Math.cos(theta) + this.side.y * Math.sin(theta)),
                    radius * (this.up.z * Math.cos(theta) + this.side.z * Math.sin(theta)),
                )
                const width = (index === 0 ? 0.196 : 0.078) * (0.25 + 0.75 * u)
                const edgeDirection = index === 2 ? this.side : this.up
                edgeDirection.scaleToRef(width, across)
            })
        }
        ribbons.upload()
    }

    private sampleFlightPath(progress: number, sway: number, position: Vector3) {
        Vector3.LerpToRef(this.launch, this.end, progress, position)
        const offset = sway * Math.sin(TAU * progress) * Math.sin(Math.PI * progress)
        position.addInPlaceFromFloats(this.side.x * offset, this.side.y * offset, this.side.z * offset)
    }

    private updateContactPoint() {
        this.trackTarget?.(this.targetCenter)
        const distance = Vector3.Distance(this.launch, this.targetCenter)
        const offset = distance > 0 ? Math.min(0.6, this.impactDistance, distance * 0.5) / distance : 0
        // Stop at the near surface so the body does not hide the burst.
        Vector3.LerpToRef(this.targetCenter, this.launch, offset, this.end)
    }

    private updateImpact(elapsed: number) {
        const ribbons = this.projectileRibbons!
        if (!this.impacted) {
            this.impacted = true
            this.updateContactPoint()
            this.trackTarget = undefined
            this.point.color.a = 0
            this.crystal.copyFrom(this.end)
            this.crystal.addInPlaceFromFloats(-this.forward.x * 0.14, 0, -this.forward.z * 0.14)
            this.sparks.emitRate = 0
            this.sparks.minSize = 0.09
            this.sparks.maxSize = 0.29
            this.sparks.direction1.set(-1 - this.forward.x, -0.55, -1 - this.forward.z)
            this.sparks.direction2.set(1 - this.forward.x, 1.15, 1 - this.forward.z)
            this.sparks.minEmitPower = 1.8
            this.sparks.maxEmitPower = 3.5
            this.sparks.minLifeTime = 0.22
            this.sparks.maxLifeTime = 0.42
            this.sparks.manualEmitCount = this.profile.impactSparks
        }
        const progress = clamp01(elapsed / IMPACT_MS)
        const radius = 0.12 + 0.98 * (1 - (1 - progress) ** 3)
        this.drawFlash(this.end, 0.32 + 0.52 * progress, 0.6 * (1 - progress) ** 6)
        for (let index = 0; index < this.profile.ribbons; index++) {
            ribbons.update(index, (1 - progress) ** 1.7 * (1 - index * 0.24), (u, center, across) => {
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
                across.scaleInPlace((0.19 - index * 0.053) * (1 - progress))
            })
        }
        ribbons.upload()
    }
}

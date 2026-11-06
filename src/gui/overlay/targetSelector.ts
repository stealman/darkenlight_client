import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { Renderer } from '@/babylon/scene/renderer'
import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, VertexBuffer } from '@babylonjs/core'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterActions } from '@/data/actions/characterActions'
import { isPartyTarget, PARTY_TARGET_COLOR } from '@/gui/overlay/partyTarget'

const INTRO_DURATION = 350
const CELL_SIZE = 128
const ATLAS_COLUMNS = 8
const ATLAS_ROWS = 16
const FRAME_COUNT = 32
const FRAME_DURATION = 160
const MARKER_COLOURS = ['#56baff', '#f08f56', '#ff4444', PARTY_TARGET_COLOR]

// Precompute the UV sets; animating either marker only uploads eight floats.
const FRAME_UVS = Array.from({ length: FRAME_COUNT * MARKER_COLOURS.length }, (_, index) => {
    const insetU = 1 / (CELL_SIZE * ATLAS_COLUMNS)
    const insetV = 1 / (CELL_SIZE * ATLAS_ROWS)
    const left = (index % ATLAS_COLUMNS) / ATLAS_COLUMNS + insetU
    const right = (index % ATLAS_COLUMNS + 1) / ATLAS_COLUMNS - insetU
    const bottom = Math.floor(index / ATLAS_COLUMNS) / ATLAS_ROWS + insetV
    const top = (Math.floor(index / ATLAS_COLUMNS) + 1) / ATLAS_ROWS - insetV
    return new Float32Array([left, top, right, top, left, bottom, right, bottom])
})

// Shared 1024 × 2048 atlas: 32 looping glow frames per colour, created once per scene.
function createMarkerAtlas(): string {
    const canvas = document.createElement('canvas')
    canvas.width = CELL_SIZE * ATLAS_COLUMNS
    canvas.height = CELL_SIZE * ATLAS_ROWS
    const ctx = canvas.getContext('2d')!
    const colours = MARKER_COLOURS
    for (let colourIndex = 0; colourIndex < colours.length; colourIndex++) {
        const colour = colours[colourIndex]
        const rgb = [1, 3, 5].map(offset => Number.parseInt(colour.slice(offset, offset + 2), 16))
        const rgba = (alpha: number) => `rgba(${rgb.join(',')}, ${alpha})`
        const light = rgb.map(channel => Math.round(channel + (255 - channel) * .3))
        for (let frame = 0; frame < FRAME_COUNT; frame++) {
            const index = colourIndex * FRAME_COUNT + frame
            const phase = frame / FRAME_COUNT * Math.PI * 2
            ctx.save()
            ctx.translate((index % ATLAS_COLUMNS) * CELL_SIZE + CELL_SIZE / 2,
                Math.floor(index / ATLAS_COLUMNS) * CELL_SIZE + CELL_SIZE / 2)
            ctx.scale(CELL_SIZE / 256, CELL_SIZE / 256)
            const breathe = .96 + Math.sin(phase) * .04
            ctx.save()
            ctx.scale(breathe, breathe)
            const aura = ctx.createRadialGradient(0, 0, 52, 0, 0, 123)
            aura.addColorStop(0, rgba(0))
            aura.addColorStop(.25, rgba(.02))
            aura.addColorStop(.46, rgba(.12))
            aura.addColorStop(.68, rgba(.055))
            aura.addColorStop(1, rgba(0))
            ctx.fillStyle = aura
            ctx.fillRect(-124, -124, 248, 248)
            ctx.restore()

            // Broad, low-contrast wisps drift around the ring independently of its rotation.
            for (let wisp = 0; wisp < 3; wisp++) {
                const angle = phase + wisp * Math.PI * 2 / 3
                const x = Math.cos(angle) * 82
                const y = Math.sin(angle) * 82
                const glow = ctx.createRadialGradient(x, y, 0, x, y, 39)
                glow.addColorStop(0, rgba(.065))
                glow.addColorStop(.45, rgba(.03))
                glow.addColorStop(1, rgba(0))
                ctx.fillStyle = glow
                ctx.fillRect(x - 39, y - 39, 78, 78)
            }
            ctx.lineCap = 'round'
            const core = ctx.createRadialGradient(0, 0, 81, 0, 0, 89)
            core.addColorStop(0, rgba(.15))
            core.addColorStop(.35, rgba(.65))
            core.addColorStop(.5, `rgba(${light.join(',')}, .82)`)
            core.addColorStop(.7, rgba(.65))
            core.addColorStop(1, rgba(.15))
            for (let segment = 0; segment < 4; segment++) {
                const start = segment * Math.PI / 2 + .15
                ctx.beginPath()
                ctx.arc(0, 0, 85, start, start + 1.27)
                ctx.shadowColor = colour
                ctx.shadowBlur = 22 * CELL_SIZE / 256
                ctx.strokeStyle = rgba(.10 + .015 * Math.sin(phase - segment * Math.PI / 2))
                ctx.lineWidth = 20
                ctx.stroke()
                ctx.shadowBlur = 7 * CELL_SIZE / 256
                ctx.strokeStyle = core
                ctx.lineWidth = 7
                ctx.stroke()
            }
            ctx.restore()
        }
    }
    return canvas.toDataURL()
}

export const TargetSelector = {
    target: null as Targetable | null,
    selectedTime: 0,
    markerPopTime: 0,
    attackTargetActive: false,
    material: null as StandardMaterial | null,
    selectedMesh: null as Mesh | null,
    attackMesh: null as Mesh | null,

    initialize() {
        this.selectedMesh?.dispose()
        this.attackMesh?.dispose()
        this.material?.dispose(false, true)
        const scene = Renderer.scene
        const texture = new Texture(createMarkerAtlas(), scene, true, false)
        texture.hasAlpha = true
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        const material = new StandardMaterial('target-marker-material', scene)
        material.disableLighting = true
        material.fogEnabled = false
        material.diffuseColor = Color3.Black()
        material.specularColor = Color3.Black()
        material.emissiveColor = Color3.White()
        material.diffuseTexture = texture
        material.emissiveTexture = texture
        material.useAlphaFromDiffuseTexture = true
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        material.disableDepthWrite = true
        material.backFaceCulling = false
        this.material = material
        const createMarker = (name: string) => {
            const mesh = MeshBuilder.CreateGround(name, { width: 1.35, height: 1.35, updatable: true }, scene)
            mesh.material = material
            // Share the world's depth buffer so scenery can occlude the ring.
            mesh.renderingGroupId = 0
            mesh.isPickable = false
            mesh.alwaysSelectAsActiveMesh = true
            mesh.setEnabled(false)
            mesh.metadata = { markerCell: -1 }
            return mesh
        }
        this.selectedMesh = createMarker('selected-target')
        this.attackMesh = createMarker('attack-target')
        material.onDisposeObservable.add(() => {
            if (this.material === material) {
                this.material = null
                this.selectedMesh = null
                this.attackMesh = null
            }
        })
    },

    selectTarget(target: Targetable) {
        this.target = target
        this.selectedTime = Date.now()
        this.markerPopTime = this.selectedTime
        this.attackTargetActive = false
    },

    unselectTarget() {
        this.target = null
        this.attackTargetActive = false
        this.selectedMesh?.setEnabled(false)
        this.attackMesh?.setEnabled(false)
    },

    updateMarker(mesh: Mesh, target: Targetable, cell: number, time: number, scale: number, opacity: number) {
        const visible = TargetingManager.isTargetVisible(target)
        mesh.setEnabled(visible)
        if (!visible) return
        mesh.position.copyFrom(target.pos)
        mesh.position.y += .025
        const atlasFrame = cell * FRAME_COUNT + Math.floor(time / FRAME_DURATION) % FRAME_COUNT
        if (mesh.metadata.markerCell !== atlasFrame) {
            mesh.updateVerticesData(VertexBuffer.UVKind, FRAME_UVS[atlasFrame])
            mesh.metadata.markerCell = atlasFrame
        }
        mesh.scaling.setAll(scale)
        // Ground plane rotates around world-up, never towards the camera.
        mesh.rotation.y = (time % 45000) / 45000 * Math.PI * 2
        mesh.visibility = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1))
    },

    onFrame(time: number, opacity: number) {
        if (!this.selectedMesh || !this.attackMesh) return
        if (this.target) {
            const attacking = MyPlayer.activeAction === CharacterActions.AUTO_ATTACK
                && MyPlayer.myChar.autoAttackTarget === this.target
            if (attacking && !this.attackTargetActive) this.markerPopTime = time
            this.attackTargetActive = attacking
            const age = Math.max(0, time - this.markerPopTime)
            const scale = age < INTRO_DURATION
                ? 1 + .35 * Math.pow(1 - age / INTRO_DURATION, 3)
                : 1 + Math.sin(age / 650) * .025
            const cell = attacking ? 2 : isPartyTarget(this.target) ? 3
                : this.target.getRelationToMyPlayer() === 'ENEMY' ? 1 : 0
            this.updateMarker(this.selectedMesh, this.target, cell, time, scale, opacity)
        } else {
            this.selectedMesh.setEnabled(false)
        }
        const attackTarget = MyPlayer.myChar?.autoAttackTarget
        if (attackTarget && attackTarget !== this.target) {
            this.updateMarker(this.attackMesh, attackTarget, 2, time, 1, opacity)
        } else {
            this.attackMesh.setEnabled(false)
        }
    },
}

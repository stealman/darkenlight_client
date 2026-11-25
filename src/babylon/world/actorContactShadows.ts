import '@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js'
import '@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js'
import { Matrix, MeshBuilder, ShaderMaterial, Vector2, type Scene, type Vector3 } from '@babylonjs/core'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import { Lights } from '@/babylon/scene/lights'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { Utils } from '@/utils/utils'
import { BuildingManager } from './buildings/buildingManager'

const vertexSource = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 view;
    uniform mat4 viewProjection;
    #include<instancesDeclaration>
    varying vec2 shadowUV;
    varying vec3 viewPosition;
    void main() {
        #include<instancesVertex>
        vec4 worldPosition = finalWorld * vec4(position, 1.0);
        gl_Position = viewProjection * worldPosition;
        shadowUV = uv * 2.0 - 1.0;
        viewPosition = (view * worldPosition).xyz;
    }
`

const fragmentSource = `
    precision highp float;
    uniform vec2 fogRange;
    varying vec2 shadowUV;
    varying vec3 viewPosition;
    void main() {
        float opacity = 0.34 * (1.0 - smoothstep(0.15, 1.0, dot(shadowUV, shadowUV)));
        if (fogRange.y > fogRange.x) {
            opacity *= clamp((fogRange.y - length(viewPosition)) / (fogRange.y - fogRange.x), 0.0, 1.0);
        }
        gl_FragColor = vec4(0.0, 0.0, 0.0, opacity);
    }
`

type ShadowActor = {
    model?: {
        node: { position: Vector3 }
        isActive(): boolean
        getMasterNode(): { isEnabled(): boolean } | undefined
    } | null
    getBoxSize(): number
}

export class ActorContactShadows {
    private readonly mesh
    private readonly material
    private readonly matrix = Matrix.Identity()
    private readonly fogRange = new Vector2()
    private matrices = new Float32Array(16 * 16)
    private count = 0
    private offsetX = 0
    private offsetZ = 0

    constructor(private readonly scene: Scene) {
        this.material = new ShaderMaterial('actorContactShadow', scene, {vertexSource, fragmentSource}, {
            attributes: ['position', 'uv'],
            uniforms: ['world', 'view', 'viewProjection', 'fogRange'],
            needAlphaBlending: true,
        })
        this.material.disableDepthWrite = true
        this.mesh = MeshBuilder.CreateGround('actorContactShadows', {width: 2, height: 2}, scene)
        this.mesh.material = this.material
        this.mesh.isPickable = false
        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.doNotSyncBoundingInfo = true
        this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false)
        this.mesh.thinInstanceCount = 0
        this.mesh.setEnabled(false)
    }

    update() {
        const { direction } = Lights.sunLight
        // The light direction points from the sun toward the ground.
        const shift = Lights.indoor ? 0 : Lights.daylightFactor * 0.16 / Math.max(0.45, -direction.y)
        this.offsetX = direction.x * shift
        this.offsetZ = direction.z * shift
        this.count = 0

        const map = WorldDataManager.worldDataMap.get(MyPlayer.worldId)?.blockMap
        if (map) {
            if (MyPlayer.myChar) this.add(MyPlayer.myChar, map)
            for (const actor of CharacterManager.characters.values()) this.add(actor, map)
            for (const actor of NpcManager.npcs.values()) this.add(actor, map)
            for (const actor of NpcManager.guards.values()) this.add(actor, map)
            for (const actor of MonsterManager.monsters.values()) this.add(actor, map)
        }

        this.mesh.thinInstanceCount = this.count
        this.mesh.setEnabled(this.count > 0)
        if (this.count === 0) return

        this.mesh.thinInstanceBufferUpdated('matrix')
        const {fogEnabled, fogStart, fogEnd} = this.scene
        this.fogRange.set(fogEnabled ? fogStart : 0, fogEnabled ? fogEnd : 0)
        this.material.setVector2('fogRange', this.fogRange)
    }

    private add(actor: ShadowActor, map: ReturnType<typeof WorldDataManager.getBlockMap>) {
        const model = actor.model
        if (!model?.isActive() || !model.getMasterNode()?.isEnabled()) return

        const {x, z} = model.node.position
        const tileX = Math.round(x), tileZ = Math.round(z)
        if (!map[tileX]?.[tileZ]) return
        const floorY = Utils.getWalkHeightAtTile(tileX, tileZ, false)
        const radius = Math.max(0.36, actor.getBoxSize() * 0.65)
        let shadowX = x, shadowZ = z
        if ((this.offsetX || this.offsetZ) && !BuildingManager.hasFloorAtTile(tileX, tileZ)) {
            const shiftedX = x + this.offsetX, shiftedZ = z + this.offsetZ
            const shiftedTileX = Math.round(shiftedX), shiftedTileZ = Math.round(shiftedZ)
            if ((shiftedTileX === tileX && shiftedTileZ === tileZ)
                || (map[shiftedTileX]?.[shiftedTileZ] && Utils.getWalkHeightAtTile(shiftedTileX, shiftedTileZ, false) === floorY)) {
                shadowX = shiftedX
                shadowZ = shiftedZ
            }
        }

        if (this.count * 16 === this.matrices.length) {
            const grown = new Float32Array(this.matrices.length * 2)
            grown.set(this.matrices)
            this.matrices = grown
            this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false)
        }
        Matrix.ScalingToRef(radius, 1, radius, this.matrix)
        this.matrix.setTranslationFromFloats(shadowX, floorY + 0.02, shadowZ)
        this.matrix.copyToArray(this.matrices, this.count++ * 16)
    }
}

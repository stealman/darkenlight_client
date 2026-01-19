import {
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    TransformNode,
    Quaternion,
    TrailMesh,
} from '@babylonjs/core'
import { Renderer } from '@/babylon/scene/renderer'
import { Attackable } from '@/GameManager'
import { Materials } from '@/babylon/materials'

export const ArrowsManager = {
    arrows: new Array<Arrow>(),
    mesh: null as Mesh | null,

    initialize () {
        this.mesh = MeshBuilder.CreateBox("box", { width: 0.12, height: 3, depth: 0.12 }, Renderer.scene)
        this.mesh.isVisible = false
        this.mesh.rotationQuaternion = Quaternion.Identity()

        const mat = new StandardMaterial("arrowMat", Renderer.scene)
        mat.diffuseColor = new Color3(0.4, 0.29, 0.13)
        mat.emissiveColor = new Color3(0.1, 0.1, 0.1)

        this.mesh.material = mat
    },

    addArrow(attacker: Attackable, target: Attackable, flyStartTime: number, handNode: TransformNode) {
        const arrow = new Arrow(attacker, target, flyStartTime, handNode)
        this.arrows.push(arrow)
    },

    onFrame(timeRate: number, time: number) {
        for (const arrow of this.arrows) {
            arrow.onFrame(time, timeRate)
        }

        this.arrows = this.arrows.filter(arrow => !arrow.disposed)
    },
}

class Arrow {
    attacker: Attackable
    target: Attackable
    creationTime: number
    flyStartTime: number
    handNode: TransformNode

    meshClone: Mesh | null = null
    trail: TrailMesh | null = null
    trailTip: TransformNode
    disposed = false

    // flight state
    startedFlying = false
    startPos = Vector3.Zero()
    currentPos = Vector3.Zero()

    speed = 25 // units per second
    hitDistance = 0.05 // distance to target to register hit
    heightOffset = new Vector3(0, 0, 0)


    constructor(attacker: Attackable, target: Attackable, flyStartTime: number, handNode: TransformNode) {
        this.attacker = attacker
        this.target = target
        this.creationTime = Date.now()
        this.flyStartTime = flyStartTime
        this.handNode = handNode
        this.heightOffset.y = 0.75 + Math.random() * 0.5

        if (ArrowsManager.mesh) {
            this.meshClone = ArrowsManager.mesh.clone("arrowClone")
            this.meshClone!.isVisible = true
            this.meshClone!.parent = this.handNode
            this.meshClone!.position = Vector3.Zero()

            this.trailTip = new TransformNode('arrowTrailTip', Renderer.scene)
            this.trailTip.parent = this.meshClone
            this.trailTip.position.y = -2
        }
    }

    startFlying() {
        if (!this.meshClone) return

        this.trail = new TrailMesh('arrowTrail', this.trailTip, Renderer.scene, 0.35, 75, true)
        this.trail.material = Materials.weaponTrailMaterial

        // fix start position while still parented to hand
        this.startPos = this.meshClone.getAbsolutePosition().clone()
        this.currentPos = this.startPos.clone()

        // detach from hand
        this.meshClone.setParent(null, true)
        this.currentPos.copyFrom(this.meshClone.position)
        this.startedFlying = true
    }

    onFrame(time: number, timeRate: number) {
        if (!this.meshClone || this.disposed) return

        if (!this.startedFlying && time >= this.flyStartTime) {
            this.startFlying()
        }

        if (this.startedFlying) {
            const targetPos = this.target?.pos.add(this.heightOffset)
            if (!targetPos) {
                this.dispose()
                return
            }

            const toTarget = targetPos.subtract(this.currentPos)
            const dist = toTarget.length()

            // check for hit
            if (dist <= this.hitDistance) {
                this.dispose()
                return
            }

            // constant velocity movement
            const dt = timeRate
            const maxStep = this.speed * dt

            const dir = dist > 0.00001 ? toTarget.scale(1 / dist) : Vector3.Zero()
            const step = Math.min(maxStep, dist)
            this.currentPos.addInPlace(dir.scale(step))

            this.meshClone.position.copyFrom(this.currentPos)

            if (dir.lengthSquared() > 0.00001) {
                const lookQ = Quaternion.FromLookDirectionLH(dir, Vector3.Up())
                const fixQ = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2)
                this.meshClone.rotationQuaternion = lookQ.multiply(fixQ)
            }
        }

        // fallback: max lifetime 1s
        if (this.creationTime < time - 1000) {
            this.dispose()
        }
    }

    dispose() {
        if (this.disposed) return
        this.disposed = true

        if (this.trail) {
            this.trail.dispose()
            this.trail = null
        }

        if (this.meshClone) {
            this.meshClone.dispose()
            this.meshClone = null
        }
    }
}

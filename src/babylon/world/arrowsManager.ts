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
        this.mesh = MeshBuilder.CreateBox("box", { width: 0.1, height: 1.5, depth: 0.1 }, Renderer.scene)
        this.mesh.isVisible = false
        this.mesh.rotationQuaternion = Quaternion.Identity()

        const mat = new StandardMaterial("arrowMat", Renderer.scene)
        mat.diffuseColor = new Color3(0.4, 0.29, 0.13)
        mat.emissiveColor = new Color3(0.1, 0.1, 0.1)
        mat.alpha = 0.5

        this.mesh.material = mat
    },

    addArrow(attacker: Attackable, target: Attackable, flyStartTime: number): Arrow {
        const arrow = new Arrow(attacker, target, flyStartTime)
        this.arrows.push(arrow)
        return arrow
    },

    onFrame(timeRate: number, time: number) {
        for (const arrow of this.arrows) {
            arrow.onFrame(time, timeRate)
        }

        this.arrows = this.arrows.filter(arrow => !arrow.disposed)
    },
}

export class Arrow {
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

    speed = 22// units per second
    heightOffset = Vector3.Zero()

    arcHeight = 1
    flightTime = 0
    flightDuration = 0
    startPosFixed = Vector3.Zero()
    endPosFixed = Vector3.Zero()
    lastPos = Vector3.Zero()

    constructor(attacker: Attackable, target: Attackable, flyStartTime: number) {
        this.attacker = attacker
        this.target = target
        this.creationTime = Date.now()
        this.flyStartTime = flyStartTime
        this.heightOffset.y = (0.3 + Math.random() * 0.4) * target.getModelHeight()

        if (target.getObjectType() === 'C') {
            this.heightOffset.y -= 0.5
        }

        if (ArrowsManager.mesh) {
            this.meshClone = ArrowsManager.mesh.clone("arrowClone")
            this.meshClone!.isVisible = true
            this.meshClone!.position = Vector3.Zero()

            this.trailTip = new TransformNode('arrowTrailTip', Renderer.scene)
            this.trailTip.parent = this.meshClone
            this.trailTip.position.y = -1
        }

        // Arc height by distance
        const dist = Vector3.Distance(this.attacker.pos, this.target.pos)
        this.arcHeight = Math.min(2, Math.max(0.2, dist / 12))
    }

    assignHandNode(handNode: TransformNode, scale: number = 1) {
        this.handNode = handNode

        if (this.meshClone) {
            this.meshClone.parent = this.handNode
            this.meshClone.scaling.scaleInPlace(scale)
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

        const end = this.target?.pos.add(this.heightOffset)
        if (end) {
            this.startPosFixed = this.currentPos.clone()
            this.endPosFixed = end.clone()

            const dist = Vector3.Distance(this.startPosFixed, this.endPosFixed)
            this.flightDuration = Math.max(0.001, dist / this.speed) // konstantní rychlost
            this.flightTime = 0

            this.lastPos.copyFrom(this.currentPos)
        }
    }

    onFrame(time: number, timeRate: number) {
        if (!this.meshClone || this.disposed) return

        if (!this.startedFlying && time >= this.flyStartTime) {
            this.startFlying()
        }

        if (this.startedFlying) {
            const endNow = this.target?.pos.add(this.heightOffset)
            if (!endNow) {
                console.log("Arrow target missing, disposing arrow")
                this.dispose()
                return
            }

            this.flightTime += timeRate
            const t = Math.max(0, Math.min(1, this.flightTime / this.flightDuration))

            const basePos = Vector3.Lerp(this.startPosFixed, this.endPosFixed, t)
            const arc = 4 * t * (1 - t) // max 1 při t=0.5
            const newPos = basePos.add(Vector3.Up().scale(this.arcHeight * arc))

            this.meshClone.position.copyFrom(newPos)

            const dir = newPos.subtract(this.lastPos)
            if (dir.lengthSquared() > 0.0000001) {
                dir.normalize()
                const lookQ = Quaternion.FromLookDirectionLH(dir, Vector3.Up())
                const fixQ = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2)
                this.meshClone.rotationQuaternion = lookQ.multiply(fixQ)
            }

            this.currentPos.copyFrom(newPos)
            this.lastPos.copyFrom(newPos)

            if (t >= 1) {
                this.dispose()
            }
        }

        if (this.creationTime < time - 1500) {
            this.dispose()
        }
    }

    dispose() {
        if (this.disposed) return
        this.disposed = true

        if (this.trail) {
            this.trail.dispose()
            this.trail = null
            this.trailTip.dispose()
        }

        if (this.meshClone) {
            this.meshClone.dispose()
            this.meshClone = null
        }
    }
}

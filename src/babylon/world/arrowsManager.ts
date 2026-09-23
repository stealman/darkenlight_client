import {
    Color4,
    Mesh,
    MeshBuilder,
    ParticleSystem,
    StandardMaterial,
    Color3,
    Texture,
    Vector3,
    TransformNode,
    Quaternion,
    TrailMesh,
} from '@babylonjs/core'
import { Renderer } from '@/babylon/scene/renderer'
import { Attackable } from '@/GameManager'
import { Materials } from '@/babylon/materials'
import { Settings } from '@/settings/settings'

type ParticleGradient = {
    step: number,
    color: Color4,
}

type ArrowParticleConfig = {
    name: string,
    capacity: number,
    texturePath: string,
    blendMode: number,
    minEmitBox: Vector3,
    maxEmitBox: Vector3,
    minLifeTime: number,
    maxLifeTime: number,
    emitRate: number,
    direction1: Vector3,
    direction2: Vector3,
    minEmitPower: number,
    maxEmitPower: number,
    minSize: number,
    maxSize: number,
    gravity: Vector3,
    updateSpeed: number,
    gradients: ParticleGradient[],
    minAngularSpeed?: number,
    maxAngularSpeed?: number,
}

type ArrowEffectConfig = {
    main: ArrowParticleConfig,
    smoke?: ArrowParticleConfig,
}

function scaleArrowParticleConfig(config: ArrowParticleConfig, powerMultiplier: number): ArrowParticleConfig {
    return {
        ...config,
        emitRate: config.emitRate * powerMultiplier,
        minSize: config.minSize * powerMultiplier,
        maxSize: config.maxSize * powerMultiplier,
    }
}

function createArrowEffectConfig(baseConfig: ArrowEffectConfig, power: number): ArrowEffectConfig {
    const powerMultiplier = 1 + (power * 0.1)

    return {
        main: scaleArrowParticleConfig(baseConfig.main, powerMultiplier),
        smoke: baseConfig.smoke ? scaleArrowParticleConfig(baseConfig.smoke, powerMultiplier) : undefined,
    }
}

const defaultFireArrowEffect: ArrowEffectConfig = {
    main: {
        name: 'arrowFire',
        capacity: 100,
        texturePath: 'images/gfx/flare.png',
        blendMode: ParticleSystem.BLENDMODE_ONEONE,
        minEmitBox: new Vector3(-0.1, -0.25, -0.1),
        maxEmitBox: new Vector3(0.1, 0.25, 0.1),
        minLifeTime: 0.05,
        maxLifeTime: 0.1,
        emitRate: 500,
        direction1: new Vector3(-0.03, 0.9, -0.03),
        direction2: new Vector3(0.03, 1.3, 0.03),
        minEmitPower: 0.2,
        maxEmitPower: 0.35,
        minSize: 0.15,
        maxSize: 0.2,
        gravity: new Vector3(0, 0.8, 0),
        updateSpeed: 0.012,
        gradients: [
            { step: 0, color: new Color4(1, 0.85, 0.55, 0.9) },
            { step: 0.4, color: new Color4(1, 0.45, 0.1, 0.75) },
            { step: 0.85, color: new Color4(0.15, 0.05, 0.01, 0.15) },
            { step: 1, color: new Color4(0.15, 0.05, 0.01, 0) },
        ],
    },
    smoke: {
        name: 'arrowSmoke',
        capacity: 60,
        texturePath: 'images/gfx/dust.png',
        blendMode: ParticleSystem.BLENDMODE_STANDARD,
        minEmitBox: new Vector3(-0.03, -0.12, -0.03),
        maxEmitBox: new Vector3(0.03, 0.12, 0.03),
        minLifeTime: 2,
        maxLifeTime: 3,
        emitRate: 55,
        direction1: new Vector3(-0.35, -0.08, -0.35),
        direction2: new Vector3(0.35, 0.28, 0.35),
        minEmitPower: 2,
        maxEmitPower: 3,
        minSize: 0.6,
        maxSize: 0.8,
        gravity: new Vector3(0, 0.04, 0),
        updateSpeed: 0.01,
        minAngularSpeed: -0.3,
        maxAngularSpeed: 0.3,
        gradients: [
            { step: 0, color: new Color4(0.55, 0.55, 0.55, 0) },
            { step: 0.1, color: new Color4(0.68, 0.68, 0.68, 0.18) },
            { step: 0.65, color: new Color4(0.62, 0.62, 0.62, 0.12) },
            { step: 1, color: new Color4(0.5, 0.5, 0.5, 0) },
        ],
    },
}

const defaultFrostArrowEffect: ArrowEffectConfig = {
    main: {
        name: 'arrowFrost',
        capacity: 100,
        texturePath: 'images/gfx/flare.png',
        blendMode: ParticleSystem.BLENDMODE_ONEONE,
        minEmitBox: new Vector3(-0.025, -0.22, -0.025),
        maxEmitBox: new Vector3(0.025, 0.22, 0.025),
        minLifeTime: 0.06,
        maxLifeTime: 0.12,
        emitRate: 420,
        direction1: new Vector3(-0.025, 0.75, -0.025),
        direction2: new Vector3(0.025, 1.1, 0.025),
        minEmitPower: 0.16,
        maxEmitPower: 0.3,
        minSize: 0.15,
        maxSize: 0.2,
        gravity: new Vector3(0, 0.45, 0),
        updateSpeed: 0.012,
        gradients: [
            { step: 0, color: new Color4(0.75, 1, 1, 0.95) },
            { step: 0.35, color: new Color4(0.3, 0.95, 1, 0.8) },
            { step: 0.75, color: new Color4(0.08, 0.45, 0.7, 0.2) },
            { step: 1, color: new Color4(0.05, 0.18, 0.28, 0) },
        ],
    },
    smoke: {
        name: 'arrowFrostSmoke',
        capacity: 60,
        texturePath: 'images/gfx/dust.png',
        blendMode: ParticleSystem.BLENDMODE_STANDARD,
        minEmitBox: new Vector3(-0.03, -0.12, -0.03),
        maxEmitBox: new Vector3(0.03, 0.12, 0.03),
        minLifeTime: 2,
        maxLifeTime: 3,
        emitRate: 45,
        direction1: new Vector3(-0.3, -0.06, -0.3),
        direction2: new Vector3(0.3, 0.24, 0.3),
        minEmitPower: 0.4,
        maxEmitPower: 0.5,
        minSize: 0.55,
        maxSize: 0.75,
        gravity: new Vector3(0, 0.03, 0),
        updateSpeed: 0.02,
        minAngularSpeed: -0.25,
        maxAngularSpeed: 0.25,
        gradients: [
            { step: 0, color: new Color4(0.7, 0.82, 0.9, 0) },
            { step: 0.12, color: new Color4(0.78, 0.9, 1, 0.16) },
            { step: 0.65, color: new Color4(0.62, 0.74, 0.86, 0.1) },
            { step: 1, color: new Color4(0.52, 0.62, 0.72, 0) },
        ],
    },
}

function resolveArrowEffectConfig(effect: string): ArrowEffectConfig | null {
    if (!effect) {
        return null
    }

    const pwr = parseInt(effect.split(':')[1]) || 1
    if (effect.startsWith('FRA')) {
        return createArrowEffectConfig(defaultFrostArrowEffect, pwr)
    }

    return createArrowEffectConfig(defaultFireArrowEffect, pwr)
}

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

    addArrow(attacker: Attackable, target: Attackable, flyStartTime: number, effect: string): Arrow {
        const arrow = new Arrow(attacker, target, flyStartTime, effect)
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
    static readonly FIRE_EFFECT_LEAD_TIME_MS = 100

    attacker: Attackable
    target: Attackable
    creationTime: number
    flyStartTime: number
    handNode: TransformNode

    meshClone: Mesh | null = null
    trail: TrailMesh | null = null
    trailTip: TransformNode | null = null
    effectTip: TransformNode | null = null
    fireParticles: ParticleSystem | null = null
    smokeParticles: ParticleSystem | null = null
    fireEffectStarted = false
    pendingEffectSystems = 0
    disposed = false
    effectConfig: ArrowEffectConfig | null = null

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
    hasEffect = false

    constructor(attacker: Attackable, target: Attackable, flyStartTime: number, effect: string) {
        this.attacker = attacker
        this.target = target
        this.creationTime = Date.now()
        this.flyStartTime = flyStartTime
        this.effectConfig = resolveArrowEffectConfig(effect)
        this.hasEffect = this.effectConfig != null
        this.heightOffset.y = (0.3 + Math.random() * 0.4) * target.getModelHeight()

        if (ArrowsManager.mesh) {
            this.meshClone = ArrowsManager.mesh.clone("arrowClone")
            this.meshClone!.isVisible = true
            this.meshClone!.position = Vector3.Zero()

            this.trailTip = new TransformNode('arrowTrailTip', Renderer.scene)
            this.trailTip.parent = this.meshClone
            this.trailTip.position.y = -1

            if (this.hasEffect) {
                this.createArrowEffect()
            }
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

        if (!this.trailTip) return

        this.trail = new TrailMesh('arrowTrail', this.trailTip, Renderer.scene, 0.35, 75, true)
        this.trail.material = Materials.weaponTrailMaterial
        this.startArrowEffect()

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

        if (!this.startedFlying && time >= this.flyStartTime - Arrow.FIRE_EFFECT_LEAD_TIME_MS) {
            this.startArrowEffect()
        }

        if (!this.startedFlying && time >= this.flyStartTime) {
            this.startFlying()
        }

        if (this.startedFlying) {
            const endNow = this.target?.pos.add(this.heightOffset)
            if (!endNow) {
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

        this.releaseArrowEffect()

        if (this.trail) {
            this.trail.dispose()
            this.trail = null
        }

        if (this.trailTip) {
            this.trailTip.dispose()
            this.trailTip = null
        }

        if (this.meshClone) {
            this.meshClone.dispose()
            this.meshClone = null
        }
    }

    private createArrowEffect() {
        if (!this.meshClone || !Renderer.scene || !this.effectConfig || this.fireParticles || this.smokeParticles) return

        this.effectTip = new TransformNode('arrowEffectTip', Renderer.scene)
        this.effectTip.parent = this.meshClone
        this.effectTip.position.y = 0.7

        this.fireParticles = this.createParticleSystem(this.effectConfig.main)

        if (this.effectConfig.smoke && Settings.isDetalLevelHigh()) {
            this.smokeParticles = this.createParticleSystem(this.effectConfig.smoke)
        }
    }

    private startArrowEffect() {
        if (this.fireEffectStarted) return

        this.fireParticles?.start()
        this.smokeParticles?.start()
        this.fireEffectStarted = true
    }

    private releaseArrowEffect() {
        const detachedEffectTip = this.effectTip
        if (detachedEffectTip) {
            detachedEffectTip.setParent(null, true)
            if (this.fireParticles) {
                this.fireParticles.emitter = detachedEffectTip
            }
            if (this.smokeParticles) {
                this.smokeParticles.emitter = detachedEffectTip
            }
            this.effectTip = null
        }

        this.pendingEffectSystems = 0

        const releaseParticles = (particleSystem: ParticleSystem | null) => {
            if (!particleSystem) return

            this.pendingEffectSystems += 1
            particleSystem.disposeOnStop = true
            particleSystem.onDisposeObservable.addOnce(() => {
                this.pendingEffectSystems -= 1
                if (this.pendingEffectSystems <= 0 && detachedEffectTip && !detachedEffectTip.isDisposed()) {
                    detachedEffectTip.dispose()
                }
            })
            particleSystem.stop()
        }

        releaseParticles(this.fireParticles)
        releaseParticles(this.smokeParticles)

        this.fireParticles = null
        this.smokeParticles = null
        this.fireEffectStarted = false
    }

    private createParticleSystem(config: ArrowParticleConfig): ParticleSystem {
        const particleSystem = new ParticleSystem(`${config.name}_${this.creationTime}`, config.capacity, Renderer.scene)
        particleSystem.particleTexture = new Texture(config.texturePath, Renderer.scene)
        particleSystem.emitter = this.effectTip
        particleSystem.minEmitBox = config.minEmitBox
        particleSystem.maxEmitBox = config.maxEmitBox
        particleSystem.minLifeTime = config.minLifeTime
        particleSystem.maxLifeTime = config.maxLifeTime
        particleSystem.emitRate = config.emitRate
        particleSystem.blendMode = config.blendMode
        particleSystem.direction1 = config.direction1
        particleSystem.direction2 = config.direction2
        particleSystem.minEmitPower = config.minEmitPower
        particleSystem.maxEmitPower = config.maxEmitPower
        particleSystem.minSize = config.minSize
        particleSystem.maxSize = config.maxSize
        particleSystem.gravity = config.gravity
        particleSystem.updateSpeed = config.updateSpeed

        if (config.minAngularSpeed != null) {
            particleSystem.minAngularSpeed = config.minAngularSpeed
        }
        if (config.maxAngularSpeed != null) {
            particleSystem.maxAngularSpeed = config.maxAngularSpeed
        }

        for (const gradient of config.gradients) {
            particleSystem.addColorGradient(gradient.step, gradient.color)
        }

        return particleSystem
    }
}

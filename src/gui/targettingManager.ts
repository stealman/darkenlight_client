import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { Ray, Vector3 } from '@babylonjs/core'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { Connector } from '@/network/connector'
import { CombatApproachRequest, SelectAutoAttackTarget } from '@/network/messages'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterManager } from '@/babylon/character/characterManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { CharacterActions } from '@/data/actions/characterActions'
import { t } from '@/i18n'

export const TargetingManager = {
    selectedTarget: null as Targetable | null,
    targetSpriteEnemy: null as HTMLCanvasElement,
    targetSpriteEnemyAttackTarget: null as HTMLCanvasElement,
    targetSpriteAlly: null as HTMLCanvasElement,

    targetCycleIndex: -1,
    lastCycleTime: 0 as number,

    pointerDownTime: -1 as number,
    autoTargetingEnabled: false as boolean,
    lastAutoTargetTime: 0 as number,

    async initialize() {
        this.prepareTargetSprites()
        this.selectedTarget = null
        this.autoTargetingEnabled = Settings.autoTarget
    },

    onFrame(timeRate: number, actualTime: number) {
        if (actualTime - this.lastCycleTime > 1250) this.resetCycleIndex()

        if (this.pointerDownTime > -1 && Date.now() - this.pointerDownTime > 1000) {
            this.autoTargetingEnabled = !this.autoTargetingEnabled
            AudioManager.playGuiButtonToggle(this.autoTargetingEnabled)
            this.pointerDownTime = -1
            Settings.autoTarget = this.autoTargetingEnabled
            Settings.storeSettings()
            OnScreenMessageManager.addMessage(
                t('messages.autoTarget', {
                    state: this.autoTargetingEnabled ? t('messages.enabled') : t('messages.disabled'),
                }),
            )
        }

        if (this.autoTargetingEnabled && this.lastAutoTargetTime + 1000 < actualTime) {
            if (this.selectedTarget) {
                if (Vector3.Distance(MyPlayer.myChar.pos, this.selectedTarget.pos) > 15) {
                    this.unselectTarget()
                }
            }

            if (this.selectedTarget == null) {
                this.cycleThroughClosestTargets()
                this.lastAutoTargetTime = actualTime
            }
        }
    },

    cycleThroughClosestTargets() {
        const sortedMobs = MonsterManager.getVisibleMonstersSortedByDistance()

        const maxTargetsToCycle = 6
        const targetsToConsider = sortedMobs.slice(0, maxTargetsToCycle)
        if (targetsToConsider.length === 0) return

        this.targetCycleIndex = (this.targetCycleIndex + 1) % targetsToConsider.length
        let target = targetsToConsider[this.targetCycleIndex]

        if (target === this.selectedTarget) {
            this.targetCycleIndex = (this.targetCycleIndex + 1) % targetsToConsider.length
            target = targetsToConsider[this.targetCycleIndex]
        }

        if (target) {
            this.setSelectedTarget(target)
        }
        this.lastCycleTime = Date.now()
    },

    onPointerDown() {
        AudioManager.playGuiButtonClick()
        this.pointerDownTime = Date.now()
        this.cycleThroughClosestTargets()
    },

    onPointerUp() {
        this.pointerDownTime = -1
    },

    resolvePickRay(ray: Ray, useSphere: boolean = false) {
        let target: Targetable | null = null
        MonsterManager.monsters.forEach((monster) => {
            if (MonsterManager.visibleMonsters.has(monster.id)) {
                if (!monster.model?.mesh) return

                if (!useSphere) {
                    const bbox = monster.model.mesh.getBoundingInfo().boundingBox
                    const min = bbox.minimumWorld
                    const max = bbox.maximumWorld

                    if (ray.intersectsBoxMinMax(min, max)) {
                        target = monster
                    }
                } else {
                    const sphere = monster.model.mesh.getBoundingInfo().boundingSphere
                    if (ray.intersectsSphere({ center: sphere.centerWorld, radius: sphere.radiusWorld * 2 } as any)) {
                        target = monster
                    }
                }
            }
        })

        CharacterManager.characters.forEach((char) => {
            if (char == MyPlayer.myChar || !char.model?.model) return

            if (!useSphere) {
                const bbox = char.model.model.getChildMeshes()[0].getBoundingInfo().boundingBox
                const min = bbox.minimumWorld
                const max = bbox.maximumWorld
                if (ray.intersectsBoxMinMax(min, max)) {
                    target = char
                }
            } else {
                const sphere = char.model.model.getBoundingInfo().boundingSphere
                if (ray.intersectsSphere({ center: sphere.centerWorld, radius: sphere.radiusWorld * 2 } as any)) {
                    target = char
                }
            }
        })

        NpcManager.npcs.forEach((npc) => {
            if (!NpcManager.visibleNpcs.has(npc.id) || !npc.model?.model) return

            if (!useSphere) {
                const bbox = npc.model.model.getChildMeshes()[0].getBoundingInfo().boundingBox
                const min = bbox.minimumWorld
                const max = bbox.maximumWorld
                if (ray.intersectsBoxMinMax(min, max)) {
                    target = npc
                }
            } else {
                const sphere = npc.model.model.getBoundingInfo().boundingSphere
                if (ray.intersectsSphere({ center: sphere.centerWorld, radius: sphere.radiusWorld * 2 } as any)) {
                    target = npc
                }
            }
        })

        if (!useSphere && (target == null || target === this.selectedTarget)) {
            this.resolvePickRay(ray, true)
        } else if (target != null) {
            this.setSelectedTarget(target)
            AudioManager.playGuiButtonClick()
        }
    },

    setSelectedTarget(target: Targetable) {
        if (MyPlayer.isDead.value) {
            return
        }
        this.selectedTarget = target
        OverlayManager.targetSelected(target!)
        target.nameDisplayTime = Date.now() + 1000

        this.checkAutoAttackOnSelectedTarget()
    },

    checkAutoAttackOnSelectedTarget(overrideToggle: boolean = false, requestCombatApproach: boolean = false) {
        const targetIsDeadCharacter = this.selectedTarget?.getObjectType() === 'C' && (this.selectedTarget as any).dead === true
        if (
            !MyPlayer.isDead.value &&
            !targetIsDeadCharacter &&
            this.selectedTarget &&
            this.selectedTarget.getRelationToMyPlayer() === 'ENEMY' &&
            (overrideToggle || ActionButtonsManager.isButtonToggled(CharacterActions.AUTO_ATTACK))
        ) {
            MyPlayer.myChar.autoAttackTarget = this.selectedTarget
            Connector.sendMessage(new SelectAutoAttackTarget(this.selectedTarget!.id, this.selectedTarget!.getObjectType()))
            if (requestCombatApproach) {
                this.requestCombatApproach()
            }
        }
    },

    requestCombatApproach() {
        const target = this.selectedTarget
        const myChar = MyPlayer.myChar
        const weapon = myChar?.getWeapon()
        const weaponRange = Number((weapon?.atts as any)?.range ?? weapon?.atts?.get?.('range'))
        if (!target || !weapon || myChar.isWeaponRanged() || myChar.getMoveAngle() !== null || !Number.isFinite(weaponRange)) {
            return
        }

        const distanceOutsideRange = Vector3.Distance(myChar.pos, target.pos) - weaponRange
        if (distanceOutsideRange <= 0 || distanceOutsideRange >= 0.5) {
            return
        }

        Connector.sendMessage(new CombatApproachRequest(target.id, target.getObjectType()))
    },

    unselectTarget() {
        this.selectedTarget = null
        OverlayManager.unselectTarget()
    },

    getTargetSpriteEnemy(): HTMLCanvasElement | null {
        return this.targetSpriteEnemy
    },

    getTargetSpriteAlly(): HTMLCanvasElement | null {
        return this.targetSpriteAlly
    },

    getTargetSpriteEnemyAttackTarget(): HTMLCanvasElement | null {
        return this.targetSpriteEnemyAttackTarget
    },

    resetCycleIndex() {
        this.targetCycleIndex = -1
    },

    prepareTargetSprites(): HTMLCanvasElement {
        if (this.targetSpriteEnemy != null) {
            this.targetSpriteEnemy.remove()
        }
        this.targetSpriteEnemy = this.createTargetSprites('#f08f56')
        if (this.targetSpriteAlly != null) {
            this.targetSpriteAlly.remove()
        }
        this.targetSpriteAlly = this.createTargetSprites('#56baff')
        if (this.targetSpriteEnemyAttackTarget != null) {
            this.targetSpriteEnemyAttackTarget.remove()
        }
        this.targetSpriteEnemyAttackTarget = this.createTargetSprites('#ff4444')

        return this.targetSpriteEnemyAttackTarget
    },

    createTargetSprites(color: string): HTMLCanvasElement {
        const sprite = document.createElement('canvas')
        const dpr = window.devicePixelRatio || 1
        const size = 16 / dpr
        const gap = 40 / dpr
        const margin = 12 / dpr
        const visibleLineLength = margin / 2

        sprite.width = gap + size + margin
        sprite.height = size * 2 + margin

        const ctx = sprite.getContext('2d')!
        const rgb = [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)]
        const centerX = sprite.width / 2
        const centerY = sprite.height / 2
        const segments = [
            [margin / 2, centerY - size, 0, centerY - size + visibleLineLength],
            [0, centerY + size - visibleLineLength, margin / 2, centerY + size],
            [sprite.width - margin / 2, centerY - size, sprite.width, centerY - size + visibleLineLength],
            [sprite.width, centerY + size - visibleLineLength, sprite.width - margin / 2, centerY + size],
        ]

        const drawTriangle = ([startX, startY, endX, endY]: number[]) => {
            const baseCenterX = (startX + endX) / 2
            const baseCenterY = (startY + endY) / 2
            const segmentLength = Math.hypot(endX - startX, endY - startY)
            const triangleHeight = segmentLength * 2
            const directionX = centerX - baseCenterX
            const directionY = centerY - baseCenterY
            const directionLength = Math.hypot(directionX, directionY)
            const apexX = baseCenterX + (directionX / directionLength) * triangleHeight
            const apexY = baseCenterY + (directionY / directionLength) * triangleHeight
            const gradient = ctx.createLinearGradient(baseCenterX, baseCenterY, apexX, apexY)

            gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.65)`)
            gradient.addColorStop(0.58, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.2)`)
            gradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`)

            ctx.fillStyle = gradient
            ctx.beginPath()
            ctx.moveTo(startX, startY)
            ctx.lineTo(endX, endY)
            ctx.lineTo(apexX, apexY)
            ctx.closePath()
            ctx.fill()
        }

        segments.forEach(drawTriangle)

        ctx.strokeStyle = color
        ctx.lineWidth = 3
        segments.forEach(([startX, startY, endX, endY]) => {
            ctx.beginPath()
            ctx.moveTo(startX, startY)
            ctx.lineTo(endX, endY)
            ctx.stroke()
        })

        return sprite
    },
}

export interface Targetable {
    pos: Vector3
    id: number
    nameDisplayTime: number
    getPositionOnScreen(): { x: number; y: number } | null
    getBoxSize(): number
    getName(): string
    getModelHeight(): number
    getNameTextNodeScreenPosition(): { x: number; y: number } | null
    getObjectType(): string
    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL'
    getDistanceFromMyPlayer(): number
}

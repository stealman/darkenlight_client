import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { Ray, Vector3 } from '@babylonjs/core'
import { OverlayManager } from '@/gui/overlayManager'
import { Connector } from '@/network/connector'
import { SelectAutoAttackTarget } from '@/network/messages'
import { SplatType } from '@/babylon/world/fightSplatsRenderer'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterManager } from '@/babylon/character/characterManager'
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
            OnScreenMessageManager.addMessage(t('messages.autoTarget', {
                state: this.autoTargetingEnabled ? t('messages.enabled') : t('messages.disabled')
            }))
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

        if (!useSphere && (target == null || target === this.selectedTarget)) {
            this.resolvePickRay(ray, true)
        } else if (target != null) {
            this.setSelectedTarget(target)
            AudioManager.playGuiButtonClick()
        }
    },

    setSelectedTarget(target: Targetable) {
        this.selectedTarget = target
        OverlayManager.targetSelected(target!)
        target.nameDisplayTime = Date.now() + 1000

        this.checkAutoAttackOnSelectedTarget()
    },

    checkAutoAttackOnSelectedTarget(overrideToggle: boolean = false) {
        if (this.selectedTarget && this.selectedTarget.getRelationToMyPlayer() === 'ENEMY' && (overrideToggle || ActionButtonsManager.isButtonToggled(CharacterActions.AUTO_ATTACK))) {
            MyPlayer.myChar.autoAttackTarget = this.selectedTarget
            Connector.sendMessage(new SelectAutoAttackTarget(this.selectedTarget!.id, this.selectedTarget!.getObjectType()))
        }
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

        sprite.width = gap + size + margin
        sprite.height = size * 2 + margin

        const ctx = sprite.getContext('2d')!
        ctx.strokeStyle = color
        ctx.lineWidth = 3

        ctx.beginPath()
        ctx.moveTo(margin / 2, sprite.height / 2 - size)
        ctx.lineTo(margin / 2 - size, sprite.height / 2)
        ctx.lineTo(margin / 2, sprite.height / 2 + size)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(sprite.width - margin / 2, sprite.height / 2 - size)
        ctx.lineTo(sprite.width - margin / 2 + size, sprite.height / 2)
        ctx.lineTo(sprite.width - margin / 2, sprite.height / 2 + size)
        ctx.stroke()

        return sprite
    },
}

export interface Targetable {
    pos: Vector3
    id: number
    nameDisplayTime: number
    getPositionOnScreen(): { x: number, y: number } | null
    getBoxSize(): number
    getName(): string
    getModelHeight(): number
    getNameTextNodeScreenPosition(): { x: number, y: number } | null
    getObjectType(): string
    getSplatType(): SplatType
    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL'
    getDistanceFromMyPlayer(): number
}

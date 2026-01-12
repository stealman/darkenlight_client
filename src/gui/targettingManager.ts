import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { Ray, Vector3 } from '@babylonjs/core'
import { Monster } from '@/babylon/monsters/monster'
import { PlayerData } from '@/data/playerData'
import { OverlayManager } from '@/gui/overlayManager'
import { Data } from '@/data/globalData'
import { Connector } from '@/network/connector'
import { SelectAutoAttackTarget } from '@/network/messages'
import { SplatType } from '@/babylon/world/fightSplatsRenderer'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'

export const TargetingManager = {
    selectedTarget: null as Targetable | null,
    targetSprite: null as HTMLCanvasElement,

    targetCycleIndex: -1,
    lastCycleTime: 0 as number,

    pointerDownTime: -1 as number,
    autoTargetingEnabled: false as boolean,
    lastAutoTargetTime: 0 as number,

    async initialize() {
        this.prepareTargetSprite()
        this.selectedTarget = null
        this.autoTargetingEnabled = Settings.autoTarget
    },

    onFrame(timeRate: number, actualTime: number) {
        if (actualTime - this.lastCycleTime > 1250) this.resetCycleIndex()

        if (this.pointerDownTime > -1 && Date.now() - this.pointerDownTime > 1000) {
            this.autoTargetingEnabled = !this.autoTargetingEnabled
            this.pointerDownTime = -1
            Settings.autoTarget = this.autoTargetingEnabled
            Settings.storeSettings()
            OnScreenMessageManager.addMessage(`Auto-Zaměření ${this.autoTargetingEnabled ? 'Zapnuto' : 'Vypnuto'}`)
        }

        // Auto-targeting every second if enabled and no target selected
        if (this.autoTargetingEnabled && this.lastAutoTargetTime + 1000 < actualTime) {

            // If target is more than 15 tiles away, clear target
            if (this.selectedTarget) {
                if (Vector3.Distance(Data.myChar.pos, this.selectedTarget.pos) > 15) {
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

        // Cycle through first 6 closest targets
        const maxTargetsToCycle = 6
        const targetsToConsider = sortedMobs.slice(0, maxTargetsToCycle)
        if (targetsToConsider.length === 0) return


        this.targetCycleIndex = (this.targetCycleIndex + 1) % targetsToConsider.length
        let target = targetsToConsider[this.targetCycleIndex]

        // If target is the selected target, skip to next
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
        let target: Monster | PlayerData | null = null
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

        if (!useSphere && (target == null || target === this.selectedTarget)) {
            this.resolvePickRay(ray, true)
        } else if (target != null) {
            this.setSelectedTarget(target)
        }
    },

    setSelectedTarget(target: Targetable | null) {
        this.selectedTarget = target
        OverlayManager.targetSelected(target!)

        if (this.selectedTarget && Data.aaActive) {
            Connector.sendMessage(new SelectAutoAttackTarget(this.selectedTarget!.id, this.selectedTarget!.getObjectType()))
        }
    },

    unselectTarget() {
        this.selectedTarget = null
        OverlayManager.unselectTarget()
    },

    getTargetSprite(): HTMLCanvasElement | null {
        return this.targetSprite
    },

    resetCycleIndex() {
        this.targetCycleIndex = -1
    },

    prepareTargetSprite() {
        if (this.targetSprite != null) {
            this.targetSprite.remove()
        }

        const sprite = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        const size = 16 / dpr;
        const gap = 40/ dpr;
        const margin = 12/ dpr;

        sprite.width = gap + size + margin;
        sprite.height = size * 2 + margin;

        const ctx = sprite.getContext('2d')!;
        ctx.strokeStyle = '#FF2222';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(margin/2, sprite.height/2 - size);
        ctx.lineTo(margin/2 - size, sprite.height/2);
        ctx.lineTo(margin/2, sprite.height/2 + size);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sprite.width - margin/2, sprite.height/2 - size);
        ctx.lineTo(sprite.width - margin/2 + size, sprite.height/2);
        ctx.lineTo(sprite.width - margin/2, sprite.height/2 + size);
        ctx.stroke();

        this.targetSprite = sprite;
    },
}

export interface Targetable {
    pos: Vector3
    id: number
    getPositionOnScreen(): { x: number, y: number } | null
    getBoxSize() : number
    getName() : string
    getModelHeight() : number
    getNameTextNodeScreenPosition()
    getObjectType(): string
    getSplatType(): SplatType
}

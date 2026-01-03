import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { Ray, Vector3 } from '@babylonjs/core'
import { Monster } from '@/babylon/monsters/monster'
import { PlayerData } from '@/data/playerData'
import { OverlayManager } from '@/gui/overlayManager'
import { Data } from '@/data/globalData'
import { Connector } from '@/network/connector'
import { SelectAutoAttackTarget } from '@/network/messages'

export const TargetingManager = {
    selectedTarget: null as Targetable | null,
    targetSprite: null as HTMLCanvasElement,

    targetCycleIndex: -1,
    lastCycleTime: 0 as number,

    async initialize() {
        this.prepareTargetSprite()
    },

    onFrame(timeRate: number, actualTime: number) {
        if (actualTime - this.lastCycleTime > 3000) {
            this.targetCycleIndex = -1
        }
    },

    cycleThroughClosestTargets() {
        const sortedMobs = MonsterManager.getVisibleMonstersSortedByDistance()

        // Cycle through first 6 closest targets
        const maxTargetsToCycle = 6
        const targetsToConsider = sortedMobs.slice(0, maxTargetsToCycle)

        this.targetCycleIndex = (this.targetCycleIndex + 1) % targetsToConsider.length
        const target = targetsToConsider[this.targetCycleIndex]

        if (target) {
            this.setSelectedTarget(target)
        }
        this.lastCycleTime = Date.now()
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

    getTargetSprite(): HTMLCanvasElement | null {
        return this.targetSprite
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
}

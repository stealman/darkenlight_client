import { Vector3 } from '@babylonjs/core'
import { TreeManager } from '@/babylon/world/treeManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { StaticsManager } from '@/babylon/world/staticsManager'
import { Monster } from '@/babylon/monsters/monster'
import { Attackable } from '@/GameManager'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterManager } from '@/babylon/character/characterManager'

export const Utils = {

    getAttackTargetByTypeAndId(type: string, id: number): Attackable | null {
        if (type === 'M') {
            return MonsterManager.monsters.get(id) || null
        }
        if (type === 'C') {
            return id === MyPlayer.myChar.id ? MyPlayer.myChar : CharacterManager.characters.get(id) || null
        }
    },

    calculateYPos(x: number, z: number, boxSize: number): number {
        const map = WorldDataManager.getBlockMap()
        const coveredBlocks = Utils.getCoveredBlocks(x, z, boxSize)

        // From map get all blocks that are covered by the player and find the highest one
        let highest = 0
        coveredBlocks.forEach(block => {
            if (map[block.x][block.z].totalHeight > highest) {
                highest = map[block.x][block.z].totalHeight
            }
        })

        return highest
    },

    getCoveredBlocks(xPos: number, zPos: number, characterWidth: number, blockSize = 1) {
        const threshold = blockSize - (characterWidth / 2);

        const coveredBlocks = [];
        for (let x = Math.floor(xPos) -2; x <= Math.ceil(xPos) + 2; x++) {
            for (let z = Math.floor(zPos) -2; z <= Math.ceil(zPos) + 2; z++) {

                if (Math.abs(x - xPos) < threshold && Math.abs(z - zPos) < threshold) {
                    coveredBlocks.push( {x: x, z: z} )
                }

            }
        }

        return coveredBlocks;
    },

    isMovementCollision(charSize: number, charPos: Vector3, targetPos: Vector3): {x: number, z: number} | null {

        //  Check terrain height difference
        const actualY = Utils.calculateYPos(charPos.x, charPos.z, charSize)
        const targetY = Utils.calculateYPos(targetPos.x, targetPos.z, charSize)
        if (Math.abs(targetY - actualY) >= 1.8) {
            return {x: targetPos.x, z: targetPos.z}
        }

        const pointInTree = TreeManager.getPointInTree(targetPos.x, targetPos.z, charSize)
        if (pointInTree) {
            // Check if targetPos is further away from tree than charPos
            const tgtDist = Vector3.Distance(new Vector3(pointInTree.x, 0, pointInTree.z), new Vector3(targetPos.x, 0, targetPos.z))
            const origDist = Vector3.Distance(new Vector3(pointInTree.x, 0, pointInTree.z), new Vector3(charPos.x, 0, charPos.z))

            if (tgtDist < origDist) {
                return {x: pointInTree.x, z: pointInTree.z}
            }
        }

        const pointInStatic = StaticsManager.getPointInStatic(targetPos.x, targetPos.z, charSize)
        if (pointInStatic) {
            return {x: pointInStatic.x, z: pointInStatic.z}
        }

        const monsterInWay: Monster | null = MonsterManager.isPointInMonster(targetPos.x, targetPos.z, charSize)
        if (monsterInWay) {
            // Check if targetPos is further away from monster than charPos
            const tgtDist = Vector3.Distance(new Vector3(monsterInWay.pos.x, 0, monsterInWay.pos.z), new Vector3(targetPos.x, 0, targetPos.z))
            const origDist = Vector3.Distance(new Vector3(monsterInWay.pos.x, 0, monsterInWay.pos.z), new Vector3(charPos.x, 0, charPos.z))

            if (tgtDist < origDist) {
                return {x: monsterInWay.pos.x, z: monsterInWay.pos.z}
            }
        }
        return null
    },

    getAlternateMovementPos(charBoxSize: number, moveAngle: number, charX: number, charZ: number, tgtPosX: number, tgtPosZ: number, speed: number, timeRate: number): Vector3 | null {
        const plusTgtPosX = charX + Math.cos(moveAngle + Math.PI / 1.5) * speed * timeRate
        const plusTgtPosZ = charZ - Math.sin(moveAngle + Math.PI / 1.5) * speed * timeRate
        const plusTgtPointDistance = Vector3.Distance(new Vector3(plusTgtPosX, 0, plusTgtPosZ), new Vector3(tgtPosX, 0, tgtPosZ))

        const minusTgtPosX = charX + Math.cos(moveAngle - Math.PI / 1.5) * speed * timeRate
        const minusTgtPosZ = charZ - Math.sin(moveAngle - Math.PI / 1.5) * speed * timeRate
        const minusTgtPointDistance = Vector3.Distance(new Vector3(minusTgtPosX, 0, minusTgtPosZ), new Vector3(tgtPosX, 0, tgtPosZ))

        const plusMovePossible = !Utils.isMovementCollision(charBoxSize, new Vector3(charX, 0, charZ), new Vector3(plusTgtPosX, 0, plusTgtPosZ))
        const minusMovePossible = !Utils.isMovementCollision(charBoxSize, new Vector3(charX, 0, charZ), new Vector3(minusTgtPosX, 0, minusTgtPosZ))

        if (plusMovePossible && (plusTgtPointDistance <= minusTgtPointDistance || !minusMovePossible)) {
            return new Vector3(plusTgtPosX, 0, plusTgtPosZ)
        }

        if (minusMovePossible && (minusTgtPointDistance < plusTgtPointDistance || !plusMovePossible)) {
            return new Vector3(minusTgtPosX, 0, minusTgtPosZ)
        }

        if (!plusMovePossible && !minusMovePossible) {
            return null
        }
        return null
    },

    getAngleBetweenPoints(src: Vector3, tgt: Vector3): number {
        return Math.atan2(
            -(tgt.z - src.z), tgt.x - src.x
        )
    },

    normalizeAngle(angle: number): number {
        angle = angle % (2 * Math.PI)
        if (angle < 0) {
            angle += 2 * Math.PI
        }
        return angle
    },

    rollDice(sides: number, fromZero: boolean = false) {
        return Math.floor(Math.random() * sides) + (fromZero ? 0 : 1)
    },

    getRandomFromTo(min: number, max: number) {
        if (min === max) return min
        return this.rollDice((1 + max) - min, true) + min
    },

    roundToOneDecimal(value: number): number {
        return Math.round(value * 10) / 10
    },

    roundToTwoDecimals(value: number): number {
        return Math.round(value * 100) / 100
    }
}

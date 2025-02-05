import { Vector3 } from '@babylonjs/core'
import { TreeManager } from '@/babylon/world/treeManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'

export const Utils = {

    getCoveredBlocks(xPos: number, zPos: number, characterWidth, blockSize = 1) {
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
        const pointInTree = TreeManager.getPointInTree(targetPos.x, targetPos.z, charSize)
        if (pointInTree) {
            // Check if targetPos is further away from tree than charPos
            const tgtDist = Vector3.Distance(new Vector3(pointInTree.x, 0, pointInTree.z), new Vector3(targetPos.x, 0, targetPos.z))
            const origDist = Vector3.Distance(new Vector3(pointInTree.x, 0, pointInTree.z), new Vector3(charPos.x, 0, charPos.z))

            if (tgtDist < origDist) {
                return {x: pointInTree.x, z: pointInTree.z}
            }
        }

        const monsterInWay = MonsterManager.isPointInMonster(targetPos.x, targetPos.z, charSize)
        if (monsterInWay) {
            // Check if targetPos is further away from monster than charPos
            const tgtDist = Vector3.Distance(new Vector3(monsterInWay.xPos, 0, monsterInWay.zPos), new Vector3(targetPos.x, 0, targetPos.z))
            const origDist = Vector3.Distance(new Vector3(monsterInWay.xPos, 0, monsterInWay.zPos), new Vector3(charPos.x, 0, charPos.z))

            if (tgtDist < origDist) {
                return {x: monsterInWay.xPos, z: monsterInWay.zPos}
            }
        }
        return null
    },

    getAlternateMovementPos(charBoxSize, moveAngle, charX, charZ, tgtPosX, tgtPosZ, speed, timeRate): Vector3 | null {
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
    },

    rollDice(sides: number, fromZero: boolean = false) {
        return Math.floor(Math.random() * sides) + (fromZero ? 0 : 1)
    },

    getRandomFromTo(min, max) {
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

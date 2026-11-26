export type StonePathBounds = {minX: number, maxX: number, minZ: number, maxZ: number}
type Rectangle = {left: number, right: number, front: number, back: number}
type Surface = {height: number, beige: boolean}
export type PavingStone = Rectangle & Surface & {rise: number, variant: number, seed: number, edge: number}

function random(x: number, z: number, salt: number) {
    let hash = Math.imul(x ^ salt, 0x9e3779b1) ^ Math.imul(z + salt, 0x85ebca77)
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b)
    return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000
}

const CELL_SIZE = 0.3375
const MIN_PAVING_SIZE = 0.14
const MIN_VERGE_SIZE = 0.15
const VERGE_SKIP_CHANCE = 0.40

function visitFootprints(bounds: Rectangle,
    visit: (x0: number, x1: number, z0: number, z1: number, stoneX: number, stoneZ: number) => void) {
    const joint = (cell: number, salt: number) => cell * CELL_SIZE + (random(cell, 0, salt) - 0.5) * CELL_SIZE * 0.37
    const emitSingle = (x: number, z: number, alongX: boolean) => {
        const left = joint(x, 11), right = joint(x + (alongX ? 2 : 1), 11)
        const front = joint(z, 19), back = joint(z + (alongX ? 1 : 2), 19)
        const length = alongX ? right - left : back - front
        const width = alongX ? back - front : right - left
        if (length > width * (1.8 + random(x, z, 101) * 0.55)) {
            const fraction = 0.44 + random(x, z, 103) * 0.12
            if (alongX) {
                const middle = left + length * fraction
                visit(left, middle, front, back, x, z)
                visit(middle, right, front, back, x + 1, z)
            } else {
                const middle = front + length * fraction
                visit(left, right, front, middle, x, z)
                visit(left, right, middle, back, x, z + 1)
            }
        } else {
            visit(left, right, front, back, x, z)
        }
    }
    const emitBridge = (x: number, z: number, alongX: boolean) => {
        const left = joint(x, 11), right = joint(x + 2, 11)
        const front = joint(z, 19), back = joint(z + 2, 19)
        const length = alongX ? right - left : back - front
        const width = alongX ? back - front : right - left
        const wide = Math.min(CELL_SIZE * 1.24, width * (0.55 + random(x, z, 107) * 0.08))
        const wideFirst = random(x, z, 109) < 0.5
        const split = length * (0.43 + random(x, z, 113) * 0.14)
        // One broad stone still crosses the old seam. Two squarer stones fill the other side.
        if (alongX) {
            const middle = wideFirst ? front + wide : back - wide
            visit(left, right, wideFirst ? front : middle, wideFirst ? middle : back, x, z)
            const near = wideFirst ? middle : front, far = wideFirst ? back : middle
            visit(left, left + split, near, far, x, z + 1)
            visit(left + split, right, near, far, x + 1, z + 1)
        } else {
            const middle = wideFirst ? left + wide : right - wide
            visit(wideFirst ? left : middle, wideFirst ? middle : right, front, back, x, z)
            const near = wideFirst ? middle : left, far = wideFirst ? right : middle
            visit(near, far, front, front + split, x + 1, z)
            visit(near, far, front + split, back, x + 1, z + 1)
        }
    }
    const horizontalAt = (column: number, row: number) => {
        // Every four groups along either axis contain neighboring pairs of both
        // orientations. Vary their order without leaving an entire seam unbridged.
        const diagonal = column + row
        const run = Math.floor(diagonal / 4)
        return (diagonal - run * 4 < 2) === (random(run, 0, 73) < 0.5)
    }
    const groupSize = CELL_SIZE * 2
    // A group can place a stone one cell into its neighbor, so include one group outside the viewport.
    for (let row = Math.floor(bounds.front / groupSize) - 1; row * groupSize < bounds.back + groupSize; row++) {
        for (let column = Math.floor(bounds.left / groupSize) - 1; column * groupSize < bounds.right + groupSize; column++) {
            const x = column * 2, z = row * 2
            if (horizontalAt(column, row)) {
                if (!horizontalAt(column, row - 1)) emitSingle(x, z, true)
                if (horizontalAt(column, row + 1)) {
                    emitBridge(x, z + 1, false)
                } else {
                    emitSingle(x, z + 1, true)
                }
            } else {
                if (horizontalAt(column - 1, row)) emitSingle(x, z, false)
                if (!horizontalAt(column + 1, row)) {
                    emitBridge(x + 1, z, true)
                } else {
                    emitSingle(x + 1, z, false)
                }
            }
        }
    }
}

type PathTile = {type: number, stonePath: boolean, beigeStonePath: boolean}

export function visitBuildingFloorStones(room: Rectangle, porch: Pick<Rectangle, 'left' | 'right' | 'back'> | undefined, overhang: number, height: number,
    visit: (stone: PavingStone) => void) {
    const ledgeEnd = room.back + overhang
    const bounds = {left: room.left - overhang, right: room.right + overhang,
        front: room.front - overhang, back: porch?.back ?? ledgeEnd}
    visitFootprints(bounds, (x0, x1, z0, z1, stoneX, stoneZ) => {
        const front = Math.max(bounds.front, z0)
        const left = Math.max(bounds.left, x0), right = Math.min(bounds.right, x1)
        const emit = (left: number, right: number, end: number, salt: number) => {
            const seed = random(stoneX, stoneZ, salt)
            const gap = 0.0014 + seed * 0.0011
            const back = Math.min(end, z1)
            if (right - left < 0.09 || back - front < 0.09) return
            const x = (left + right) / 2, z = (front + back) / 2
            const edge = Math.max(0, Math.min(1, Math.min(x - room.left, room.right - x,
                z - room.front, room.back - z) / 0.55))
            visit({left: left + gap, right: right - gap, front: front + gap, back: back - gap,
                height, edge, seed, beige: false, rise: 0.033 + seed * 0.009,
                variant: Math.floor(random(stoneX, stoneZ, salt + 1) * 8)})
        }
        if (!porch || z1 <= ledgeEnd) emit(left, right, ledgeEnd, 157)
        else {
            emit(left, Math.min(right, porch.left), ledgeEnd, 157)
            emit(Math.max(left, porch.left), Math.min(right, porch.right), porch.back, 167)
            emit(Math.max(left, porch.right), right, ledgeEnd, 179)
        }
    })
}

export function visitPavingStones(tileAt: (x: number, z: number) => PathTile | undefined,
    heightAt: (x: number, z: number) => number | undefined, visit: (stone: PavingStone) => void,
    bounds: StonePathBounds) {
    const surfaceAt = (x: number, z: number): Surface | undefined => {
        const tile = tileAt(x, z)
        if (!tile || tile.type <= 0 || tile.type >= 50 || (!tile.stonePath && !tile.beigeStonePath)) return
        const height = heightAt(x, z)
        if (height !== undefined) return {height, beige: tile.beigeStonePath}
    }
    const matches = (a?: Surface, b?: Surface) => !!a && !!b && a.height === b.height && a.beige === b.beige
    const left = bounds.minX - 0.5, right = bounds.maxX + 0.5
    const front = bounds.minZ - 0.5, back = bounds.maxZ + 0.5
    // Clip after placing the world-space pattern so tile borders and viewport changes
    // cannot shift the joints.
    visitFootprints({left, right, front, back}, (x0, x1, z0, z1, stoneX, stoneZ) => {
        if (x1 <= left || x0 >= right || z1 <= front || z0 >= back) return
        const tx = Math.floor(x0 + 0.5), tz = Math.floor(z0 + 0.5)
        const middleX = Math.min(x1, tx + 0.5)
        const middleZ = Math.min(z1, tz + 0.5)
        const emit = (x0: number, x1: number, z0: number, z1: number, surface: Surface | undefined) => {
            if (!surface || x1 - x0 < MIN_PAVING_SIZE || z1 - z0 < MIN_PAVING_SIZE
                || x1 <= left || x0 >= right || z1 <= front || z0 >= back) return
            const x = (x0 + x1) / 2, z = (z0 + z1) / 2
            const tileX = Math.floor(x + 0.5), tileZ = Math.floor(z + 0.5)
            let edge = 1
            for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
                if (matches(surface, surfaceAt(tileX + dx, tileZ + dz))) continue
                edge = Math.min(edge, Math.hypot(Math.max(0, Math.abs(tileX + dx - x) - 0.5),
                    Math.max(0, Math.abs(tileZ + dz - z) - 0.5)) / 0.51)
            }
            const seed = random(stoneX, stoneZ, 39 + tileX * 3 + tileZ * 7)
            const baseGap = 0.0045 + seed * 0.0035
            const gap = baseGap * (2 / 3)
            // Recess individual exposed faces so the paving breaks up along the
            // verge while joints between stones stay tight.
            const exposed = (x: number, z: number) =>
                surfaceAt(Math.floor(x + 0.5), Math.floor(z + 0.5))?.height !== surface.height
            // A discarded sliver should leave the next stone's edge exposed.
            const probe = MIN_VERGE_SIZE + 2 * baseGap
            const openLeft = exposed(x0 - probe, z), openRight = exposed(x1 + probe, z)
            const openFront = exposed(x, z0 - probe), openBack = exposed(x, z1 + probe)
            const verge = (exterior: boolean, span: number, salt: number) => {
                if (!exterior) return 0
                const wear = random(stoneX, stoneZ, salt)
                return Math.min(span * 0.29, 0.004 + wear * wear * 0.086)
            }
            const footprint = {
                left: x0 + gap + verge(openLeft, x1 - x0, 61),
                right: x1 - gap - verge(openRight, x1 - x0, 67),
                front: z0 + gap + verge(openFront, z1 - z0, 71),
                back: z1 - gap - verge(openBack, z1 - z0, 73),
            }
            const width = footprint.right - footprint.left, depth = footprint.back - footprint.front
            const onVerge = openLeft || openRight || openFront || openBack
            const minimum = onVerge ? Math.max(MIN_VERGE_SIZE, Math.max(width, depth) * 0.28) : MIN_PAVING_SIZE
            if (Math.min(width, depth) < minimum) return
            if (onVerge) {
                if (random(stoneX, stoneZ, 127 + tileX * 17 + tileZ * 31) < VERGE_SKIP_CHANCE) return
                edge = Math.min(edge, 0.42)
            }
            const variant = Math.floor(random(stoneX, stoneZ, 47) * 8)
            const heightVariation = 0.031 * (0.5 + (seed - 0.5) * 1.5)
            const rise = (0.018 + edge * 0.020 + heightVariation) * (2 / 3)
            visit({...footprint, ...surface, seed, edge, rise, variant})
        }

        // A candidate overlaps at most four tiles. Merge matching pieces before
        // opening the joints so a tile boundary does not become a paving joint.
        const xCuts = middleX < x1 ? [x0, middleX, x1] : [x0, x1]
        const zCuts = middleZ < z1 ? [z0, middleZ, z1] : [z0, z1]
        const tileRows = zCuts.slice(1).map((_, dz) => xCuts.slice(1).map((_, dx) => surfaceAt(tx + dx, tz + dz)))
        for (let dz = 0; dz < tileRows.length; dz++) {
            for (let dx = 0; dx < tileRows[dz].length; dx++) {
                const surface = tileRows[dz][dx]
                if (!surface) continue
                const width = matches(surface, tileRows[dz][dx + 1]) ? 2 : 1
                const next = tileRows[dz + 1]
                const depth = next && matches(surface, next[dx]) && matches(surface, next[dx + width - 1]) ? 2 : 1
                emit(xCuts[dx], xCuts[dx + width], zCuts[dz], zCuts[dz + depth], surface)
                for (let i = dx; i < dx + width; i++) {
                    tileRows[dz][i] = undefined
                    if (depth === 2) next[i] = undefined
                }
            }
        }
    })
}

export interface WorldArea {
    id: number
    name: string
    parentId?: number
    safeSpot?: boolean
    navigationRegion?: boolean
    /** Alternating world X/Z coordinates; closing vertex is implicit. */
    points: number[]
}

const EPS = 1e-8
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx

export function pointInArea(points: readonly number[], x: number, z: number, boundary = true): boolean {
    let inside = false
    for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
        const ax = points[j], az = points[j + 1], bx = points[i], bz = points[i + 1]
        if (Math.abs(cross(bx - ax, bz - az, x - ax, z - az)) < EPS
            && x >= Math.min(ax, bx) - EPS && x <= Math.max(ax, bx) + EPS
            && z >= Math.min(az, bz) - EPS && z <= Math.max(az, bz) + EPS) return boundary
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside
    }
    return inside
}

function signedArea(p: readonly number[]): number {
    let value = 0
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) value += p[j] * p[i + 1] - p[i] * p[j + 1]
    return value / 2
}

// Include collinear overlaps: these cuts also detect excursions through a concave boundary vertex.
function segmentCuts(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number[] {
    const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz
    const denominator = cross(rx, rz, sx, sz)
    if (Math.abs(denominator) > EPS) {
        const t = cross(cx - ax, cz - az, sx, sz) / denominator
        const u = cross(cx - ax, cz - az, rx, rz) / denominator
        return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [Math.max(0, Math.min(1, t))] : []
    }
    if (Math.abs(cross(cx - ax, cz - az, rx, rz)) > EPS) return []
    const length = rx * rx + rz * rz
    if (length < EPS) return []
    return [((cx - ax) * rx + (cz - az) * rz) / length, ((dx - ax) * rx + (dz - az) * rz) / length]
        .filter(t => t >= -EPS && t <= 1 + EPS).map(t => Math.max(0, Math.min(1, t)))
}

function edgeIntervals(p: readonly number[], i: number, other: readonly number[]): number[] {
    const next = (i + 2) % p.length
    const cuts = [0, 1]
    for (let j = 0; j < other.length; j += 2) {
        const end = (j + 2) % other.length
        cuts.push(...segmentCuts(p[i], p[i + 1], p[next], p[next + 1], other[j], other[j + 1], other[end], other[end + 1]))
    }
    return cuts.sort((a, b) => a - b)
}

function containsPolygon(parent: readonly number[], child: readonly number[]): boolean {
    for (let i = 0; i < child.length; i += 2) {
        if (!pointInArea(parent, child[i], child[i + 1])) return false
        const next = (i + 2) % child.length, cuts = edgeIntervals(child, i, parent)
        for (let j = 1; j < cuts.length; j++) {
            const t = (cuts[j - 1] + cuts[j]) / 2
            if (!pointInArea(parent, child[i] + (child[next] - child[i]) * t, child[i + 1] + (child[next + 1] - child[i + 1]) * t)) return false
        }
    }
    return true
}

export function areaBounds(p: readonly number[]) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i])
        minZ = Math.min(minZ, p[i + 1]); maxZ = Math.max(maxZ, p[i + 1])
    }
    return {minX, minZ, maxX, maxZ}
}

function interiorsOverlap(a: readonly number[], b: readonly number[]): boolean {
    const aa = areaBounds(a), bb = areaBounds(b)
    if (aa.maxX <= bb.minX || bb.maxX <= aa.minX || aa.maxZ <= bb.minZ || bb.maxZ <= aa.minZ) return false
    for (const [p, other] of [[a, b], [b, a]]) {
        const winding = Math.sign(signedArea(p))
        for (let i = 0; i < p.length; i += 2) {
            if (pointInArea(other, p[i], p[i + 1], false)) return true
            const next = (i + 2) % p.length, cuts = edgeIntervals(p, i, other)
            const dx = p[next] - p[i], dz = p[next + 1] - p[i + 1], length = Math.hypot(dx, dz)
            for (let j = 1; j < cuts.length; j++) {
                if (cuts[j] - cuts[j - 1] < EPS) continue
                const t = (cuts[j] + cuts[j - 1]) / 2
                // A tiny inward offset also catches identical/shared edges with overlapping interiors.
                const x = p[i] + dx * t - dz / length * winding * 1e-5
                const z = p[i + 1] + dz * t + dx / length * winding * 1e-5
                if (pointInArea(p, x, z, false) && pointInArea(other, x, z, false)) return true
            }
        }
    }
    return false
}

export function validateWorldAreas(input: unknown, size: number): WorldArea[] {
    if (!Array.isArray(input) || input.length > 256) throw new Error('Maximum 256 areas per world.')
    let vertexCount = 0
    const ids = new Set<number>()
    const areas: WorldArea[] = input.map(value => {
        if (!value || !Number.isSafeInteger(value.id) || value.id <= 0 || ids.has(value.id)) throw new Error('Area IDs must be unique positive integers.')
        ids.add(value.id)
        if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80) throw new Error('Area name must contain 1–80 characters.')
        const name = value.name.trim(), points = value.points
        if (!Array.isArray(points) || points.length < 6 || points.length > 256 || points.length % 2) throw new Error(`${name}: use 3–128 vertices.`)
        vertexCount += points.length / 2
        if (vertexCount > 4096) throw new Error('Maximum 4096 vertices per world.')
        if (!points.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= size - 1 && Number.isInteger(n))) throw new Error(`${name}: vertices must be inside the world on the whole-tile grid.`)
        if (value.parentId !== undefined && (!Number.isSafeInteger(value.parentId) || value.parentId <= 0)) throw new Error(`${name}: invalid parent.`)
        const unique = new Set<string>()
        for (let i = 0; i < points.length; i += 2) {
            const key = `${points[i]},${points[i + 1]}`
            if (unique.has(key)) throw new Error(`${name}: duplicate vertex.`)
            unique.add(key)
            const next = (i + 2) % points.length, prev = (i + points.length - 2) % points.length
            const ax = points[i] - points[prev], az = points[i + 1] - points[prev + 1]
            const bx = points[next] - points[i], bz = points[next + 1] - points[i + 1]
            if (Math.abs(cross(ax, az, bx, bz)) < EPS && ax * bx + az * bz < 0) throw new Error(`${name}: an edge doubles back.`)
            for (let j = i + 2; j < points.length; j += 2) {
                if (j === next || (j + 2) % points.length === i) continue
                const end = (j + 2) % points.length
                if (segmentCuts(points[i], points[i + 1], points[next], points[next + 1], points[j], points[j + 1], points[end], points[end + 1]).length) throw new Error(`${name}: polygon crosses or touches itself.`)
            }
        }
        if (Math.abs(signedArea(points)) < 0.0625) throw new Error(`${name}: polygon has no usable area.`)
        if (value.safeSpot !== undefined && typeof value.safeSpot !== 'boolean') throw new Error(`${name}: safe spot must be a boolean.`)
        if (value.navigationRegion !== undefined && typeof value.navigationRegion !== 'boolean') throw new Error(`${name}: navigation region must be a boolean.`)
        return {id: value.id, name, ...(value.parentId === undefined ? {} : {parentId: value.parentId}),
            ...(value.safeSpot === true ? {safeSpot: true} : {}),
            ...(value.navigationRegion === true ? {navigationRegion: true} : {}), points: [...points]}
    })
    const byId = new Map(areas.map(a => [a.id, a]))
    for (const area of areas) {
        const visited = new Set([area.id])
        let parentId = area.parentId
        while (parentId !== undefined) {
            if (visited.has(parentId) || visited.size > 32) throw new Error(`${area.name}: cyclic or too deeply nested hierarchy.`)
            visited.add(parentId)
            const parent = byId.get(parentId)
            if (!parent) throw new Error(`${area.name}: parent does not exist.`)
            parentId = parent.parentId
        }
        if (area.parentId !== undefined && !containsPolygon(byId.get(area.parentId)!.points, area.points)) throw new Error(`${area.name}: the entire polygon must be inside its parent.`)
    }
    for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
        if (areas[i].parentId === areas[j].parentId && interiorsOverlap(areas[i].points, areas[j].points)) throw new Error(`${areas[i].name} / ${areas[j].name}: sibling areas overlap. Assign a parent for nested areas.`)
    }
    return areas
}

export class WorldAreaIndex {
    private readonly byId: Map<number, WorldArea>
    private readonly entries: Array<ReturnType<typeof areaBounds> & {area: WorldArea, depth: number}>
    constructor(public readonly areas: WorldArea[]) {
        this.byId = new Map(areas.map(area => [area.id, area]))
        this.entries = areas.map(area => {
            let depth = 0, parent = area.parentId
            while (parent !== undefined) { depth++; parent = this.byId.get(parent)?.parentId }
            return {...areaBounds(area.points), area, depth}
        }).sort((a, b) => b.depth - a.depth || a.area.id - b.area.id)
    }
    getAt(x: number, z: number): WorldArea | null {
        for (const entry of this.entries) {
            if (x >= entry.minX && x <= entry.maxX && z >= entry.minZ && z <= entry.maxZ && pointInArea(entry.area.points, x, z)) return entry.area
        }
        return null
    }
    getChainAt(x: number, z: number): WorldArea[] {
        const result: WorldArea[] = []
        let area = this.getAt(x, z)
        while (area) { result.push(area); area = this.byId.get(area.parentId!) ?? null }
        return result.reverse()
    }
    getNavigationRegionAt(x: number, z: number): number | null {
        return this.getChainAt(x, z).reverse().find(area => area.navigationRegion)?.id ?? null
    }
}

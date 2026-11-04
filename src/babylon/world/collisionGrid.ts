interface GridEntry<T> {
    value: T
    order: number
    visited: number
    minX: number
    minZ: number
    maxX: number
    maxZ: number
}

// Broad phase for stationary world objects. Exact collision tests stay with
// their managers; bounds must cover the object's entire collision footprint.
export class CollisionGrid<T> {
    private readonly cells = new Map<string, Set<GridEntry<T>>>()
    private readonly entries = new Map<T, GridEntry<T>>()
    private nextOrder = 0
    private queryId = 0

    constructor(private readonly cellSize = 4) {}

    add(value: T, minX: number, minZ: number, maxX: number, maxZ: number) {
        this.remove(value)
        const entry: GridEntry<T> = {
            value, order: this.nextOrder++, visited: 0,
            minX: Math.floor(minX / this.cellSize), minZ: Math.floor(minZ / this.cellSize),
            maxX: Math.floor(maxX / this.cellSize), maxZ: Math.floor(maxZ / this.cellSize),
        }
        this.entries.set(value, entry)
        for (let x = entry.minX; x <= entry.maxX; x++) {
            for (let z = entry.minZ; z <= entry.maxZ; z++) {
                const key = `${x};${z}`
                let cell = this.cells.get(key)
                if (!cell) {
                    cell = new Set()
                    this.cells.set(key, cell)
                }
                cell.add(entry)
            }
        }
    }

    remove(value: T) {
        const entry = this.entries.get(value)
        if (!entry) return
        for (let x = entry.minX; x <= entry.maxX; x++) {
            for (let z = entry.minZ; z <= entry.maxZ; z++) {
                const key = `${x};${z}`
                const cell = this.cells.get(key)!
                cell.delete(entry)
                if (cell.size === 0) this.cells.delete(key)
            }
        }
        this.entries.delete(value)
    }

    clear() {
        this.cells.clear()
        this.entries.clear()
        this.nextOrder = 0
        this.queryId = 0
    }

    findFirst(x: number, z: number, size: number, collides: (value: T) => boolean): T | null {
        const query = ++this.queryId
        const half = size / 2
        const minX = Math.floor((x - half) / this.cellSize)
        const maxX = Math.floor((x + half) / this.cellSize)
        const minZ = Math.floor((z - half) / this.cellSize)
        const maxZ = Math.floor((z + half) / this.cellSize)
        let first: GridEntry<T> | null = null
        for (let cellX = minX; cellX <= maxX; cellX++) {
            for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
                const cell = this.cells.get(`${cellX};${cellZ}`)
                if (!cell) continue
                for (const entry of cell) {
                    if (entry.visited === query) continue
                    entry.visited = query
                    // Preserve array insertion order even across cell borders.
                    if ((!first || entry.order < first.order) && collides(entry.value)) first = entry
                }
            }
        }
        return first?.value ?? null
    }
}

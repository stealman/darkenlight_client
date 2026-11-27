export const TREE_SPECIES = {
    twisted: {name: 'Twisted Winter Tree', height: 5.3, radius: 0.51, spread: 3.12, bark: 0, foliage: 0},
    birch: {name: 'Birch Winter Tree', height: 6.6, radius: 0.21, spread: 1.92, bark: 1, foliage: 0},
    autumn: {name: 'Sparse Leaf Tree', height: 5.8, radius: 0.36, spread: 2.86, bark: 0, foliage: 2},
    spruce: {name: 'Ragged Spruce', height: 6.8, radius: 0.29, spread: 2.13, bark: 3, foliage: 4},
    fir: {name: 'Dark Fir', height: 6.5, radius: 0.34, spread: 2.48, bark: 3, foliage: 5},
    evergreen: {name: 'Gnarly Evergreen', height: 5.3, radius: 0.41, spread: 2.30, bark: 0, foliage: 6},
} as const

export type TreeSpecies = keyof typeof TREE_SPECIES
export type TreeDetail = 'LOW' | 'MEDIUM' | 'HIGH' | 'SHADOW'
export type TreeSurfaceDetail = Exclude<TreeDetail, 'SHADOW'>
export const TREE_VARIANT_COUNT = 25
export const TREE_DEFAULT_SEED = 671439
export const TREE_FACE_BUDGET = {LOW: 1000, MEDIUM: 1900, HIGH: 2500, SHADOW: 240} as const
export const TREE_BUDGET_MULTIPLIER = {min: 0.5, default: 2, max: 4} as const

export function normalizeTreeBudgetMultiplier(multiplier: number) {
    return Number.isFinite(multiplier)
        ? Math.min(TREE_BUDGET_MULTIPLIER.max, Math.max(TREE_BUDGET_MULTIPLIER.min, multiplier))
        : TREE_BUDGET_MULTIPLIER.default
}

export const TREE_SHAPE_FACES = {wood3: 7, wood6: 16, wood12: 34, leaf: 8, needles: 28, needlesShadow: 12} as const
export type TreeShape = keyof typeof TREE_SHAPE_FACES

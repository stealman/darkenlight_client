import { Matrix, Quaternion, Vector3 } from '@babylonjs/core'
import { normalizeTreeBudgetMultiplier, TREE_BUDGET_MULTIPLIER, TREE_DEFAULT_SEED, TREE_FACE_BUDGET,
    TREE_PROTOTYPE_FACE_BUDGET, TREE_SHAPE_FACES, TREE_SPECIES, TREE_VARIANT_COUNT } from './treeSpecies'
import type { TreeDetail, TreeShape, TreeSpecies } from './treeSpecies'

const TAU = 2 * Math.PI
const SPIRAL = Math.PI * (3 - Math.sqrt(5))
const LEVEL = {LOW: 0, MEDIUM: 1, HIGH: 2}

export interface TreePiece {
    matrix: Matrix
    palette: number
    tint: number
    taper: number
    length: number
    grain: number
    shape: TreeShape
    startJoint?: Quaternion
    endJoint?: Quaternion
    radius: number
    trunk?: boolean
}

interface Piece extends Omit<TreePiece, 'shape'> {
    shape: 'wood' | 'leaf' | 'needles'
}

interface Growth {
    parent?: Growth
    pieces: Piece[]
    level: number
    shade: boolean
    birchLeaves?: boolean
}

export interface TreeModel {
    shapes: Map<TreeShape, TreePiece[]>
    triangles: number
}

export interface TreeVariant {
    models: Record<TreeDetail, TreeModel>
    height: number
    rootRadius: number
    yaw: number
    spread: number
}

function randomStream(seed: number) {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
    }
}

function spread(origin: Vector3, angle: number, distance: number, rise: number) {
    return new Vector3(origin.x + Math.cos(angle) * distance, origin.y + rise, origin.z + Math.sin(angle) * distance)
}

function makeWoodSpans(points: Vector3[], radii: number[], palette: number, tint: number,
    range: (a: number, b: number) => number,
): Piece[] {
    let grain = range(0, 37)
    const axes = points.slice(1).map((end, i) => end.subtract(points[i]).normalize())
    const fromUp = (axis: Vector3) => Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, axis, new Quaternion())
    // Adjacent spans share a cross section oriented along the bisector of their axes.
    const joints = points.map((_, i) => fromUp(i === 0 ? axes[0] : i === axes.length ? axes[i - 1]
        : axes[i - 1].add(axes[i]).normalize()))
    return points.slice(1).map((end, i) => {
        const radius = radii[i]
        const length = Vector3.Distance(points[i], end)
        const rotation = fromUp(axes[i])
        const inverse = rotation.conjugate()
        const matrix = Matrix.Compose(new Vector3(radius, length, radius), rotation, points[i])
        const piece: Piece = {matrix, palette, tint: tint * range(.94, 1.06),
            taper: radii[i + 1] / radius, length, grain, shape: 'wood', radius,
            startJoint: inverse.multiply(joints[i]), endJoint: inverse.multiply(joints[i + 1])}
        grain += length
        return piece
    })
}

function shapeFor(piece: Piece, detail: TreeDetail): TreeShape {
    if (piece.shape === 'leaf') return 'leaf'
    if (piece.shape === 'needles') return detail === 'SHADOW' ? 'needlesShadow' : 'needles'
    if (detail === 'SHADOW') return piece.radius > 0.22 ? 'wood6' : 'wood3'
    const level = LEVEL[detail]
    if (piece.radius >= [0.24, 0.17, 0.10][level]) return 'wood16'
    return piece.radius >= [0.055, 0.038, 0.024][level] ? 'wood6' : 'wood3'
}

function addModelPiece(model: TreeModel, piece: Omit<TreePiece, 'shape'>, shape: TreeShape) {
    let batch = model.shapes.get(shape)
    if (!batch) model.shapes.set(shape, batch = [])
    batch.push({...piece, shape})
    model.triangles += TREE_SHAPE_FACES[shape]
}

function addFineGrowth(model: TreeModel, budget: number, seed: number, behindCameraFacingSide?: (piece: TreePiece) => boolean) {
    if (budget - model.triangles < TREE_SHAPE_FACES.wood3) return
    const next = randomStream(seed)
    const range = (a: number, b: number) => a + (b - a) * next()
    const anchors = [...model.shapes.values()].flat().filter(piece => piece.radius === 0 || (
        piece.radius >= .013 && piece.radius <= .145 && piece.length >= .16 && piece.matrix.m[13] > .45
    ))
    // Spread new growth around the crown in a deterministic order, independently of the original skeleton.
    for (let i = anchors.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const anchor = anchors[i]
        anchors[i] = anchors[j]
        anchors[j] = anchor
    }
    for (let pass = 0; ; pass++) {
        const previous = model.triangles
        const shrink = .85 ** pass
        for (const anchor of anchors) {
            const remaining = budget - model.triangles
            if (remaining < TREE_SHAPE_FACES.wood3) return
            const birchCard = anchor.shape === 'birchCard'
            const card = anchor.shape === 'foliageCard' || birchCard
            const back = behindCameraFacingSide?.(anchor) ?? false
            if (back && (!card || pass > 0)) continue
            if (card || anchor.shape === 'leaf' || anchor.shape === 'needles') {
                if (card && pass >= (birchCard ? 2 : 4)) continue
                const shape = anchor.shape
                if (remaining < TREE_SHAPE_FACES[shape]) continue
                const scale = Vector3.One()
                const rotation = Quaternion.Identity()
                anchor.matrix.decompose(scale, rotation)
                const leaf = birchCard || shape === 'leaf' || (card && anchor.palette === TREE_SPECIES.autumn.foliage)
                const spreadSide = next() < .5 ? -1 : 1
                const position = Vector3.TransformCoordinates(new Vector3(
                    leaf ? range(-.49, .49) : spreadSide * (card ? range(.21, .48) : range(.29, .66)),
                    range(-.14, .16), leaf ? range(-.18, .34) : range(.26, .78),
                ), anchor.matrix)
                scale.scaleInPlace((card ? range(.57, .84) : leaf ? range(.38, .63) : range(.31, .53)) * shrink)
                const yaw = leaf ? range(-.9, .9) : spreadSide * range(.40, .95)
                rotation.multiplyInPlace(Quaternion.RotationYawPitchRoll(yaw, range(-.38, .34), range(-.42, .42)))
                addModelPiece(model, {
                    ...anchor, matrix: Matrix.Compose(scale, rotation, position), length: scale.z,
                    tint: anchor.tint * range(.87, 1.16), taper: range(.78, 1.08), grain: anchor.grain + range(0, 37),
                }, shape)
            } else {
                const along = range(.21, .88)
                const twist = next() * TAU
                const start = Vector3.TransformCoordinates(new Vector3(0, along, 0), anchor.matrix)
                const side = Vector3.TransformNormal(new Vector3(Math.cos(twist), 0, Math.sin(twist)), anchor.matrix).normalize()
                const axis = Vector3.TransformNormal(Vector3.UpReadOnly, anchor.matrix).normalize()
                const length = Math.min(.46, anchor.length * range(.44, .88)) * shrink
                const direction = side.scale(.91).addInPlace(axis.scale(.46)).addInPlaceFromFloats(0, range(.07, .48), 0).normalize()
                const bend = start.add(direction.scale(length * .61))
                const tip = bend.add(direction.scale(length * .39)).addInPlace(axis.scale(length * .17))
                const radius = Math.min(.030, anchor.radius * (1 - along * (1 - anchor.taper)) * .39) * shrink
                const twoSpans = remaining >= TREE_SHAPE_FACES.wood3 * 2
                for (const twig of makeWoodSpans(twoSpans ? [start, bend, tip] : [start, bend],
                    twoSpans ? [radius, radius * .54, radius * .067] : [radius, radius * .067],
                    anchor.palette, anchor.tint, range)) addModelPiece(model, twig, 'wood3')
            }
        }
        if (model.triangles === previous) return
    }
}

function makeModel(growth: Growth[], detail: TreeDetail, multiplier: number, seed: number, prototypeYaw?: number): TreeModel {
    const accepted = new Set<Growth>()
    const model: TreeModel = {shapes: new Map(), triangles: 0}
    const shadow = detail === 'SHADOW'
    const prototype = !shadow && prototypeYaw !== undefined
    const budget = prototype ? TREE_PROTOTYPE_FACE_BUDGET[detail] : Math.floor(TREE_FACE_BUDGET[detail] * (shadow ? 1 : multiplier))
    // The fixed game view looks from negative X and Z. Rotate that direction into this variant's local space.
    const backX = prototype ? Math.cos(prototypeYaw) - Math.sin(prototypeYaw) : 0
    const backZ = prototype ? Math.cos(prototypeYaw) + Math.sin(prototypeYaw) : 0
    const isBack = (piece: Omit<TreePiece, 'shape'>) => piece.matrix.m[12] * backX + piece.matrix.m[14] * backZ > .42
    const maxLevel = shadow ? LEVEL.MEDIUM : LEVEL.HIGH
    for (const group of growth) {
        if (group.level > maxLevel || (shadow && !group.shade) || (group.birchLeaves && prototypeYaw === undefined)
            || (group.parent && !accepted.has(group.parent))) continue
        if (prototype && group.level === 2 && group.pieces.every(piece => piece.radius > 0 && isBack(piece))) continue
        // One solid spray represents a birch leaf cluster in the shadow pass.
        const parts = shadow && group.birchLeaves ? [group.pieces[2]] : group.pieces
        const shapes = parts.map(piece => {
            if (shadow && group.birchLeaves) return 'needlesShadow'
            if (prototype && piece.radius === 0) return group.birchLeaves ? 'birchCard' : 'foliageCard'
            return shapeFor(piece, prototype && piece.radius < .26 && isBack(piece) ? 'LOW' : detail)
        })
        const faces = shapes.reduce((total, shape) => total + TREE_SHAPE_FACES[shape], 0)
        if (model.triangles + faces > budget) continue
        accepted.add(group)
        parts.forEach((piece, i) => {
            const shape = shapes[i]
            if (shape !== 'foliageCard') {
                addModelPiece(model, piece, shape)
                return
            }
            const width = piece.shape === 'leaf' ? 1.57 : 1.52
            const length = piece.shape === 'leaf' ? 1.62 : 1.40
            const matrix = Matrix.Scaling(width, 1, length).multiply(piece.matrix)
            addModelPiece(model, {...piece, matrix, length: piece.length * length}, shape)
        })
    }
    if (!shadow) addFineGrowth(model, budget, seed, prototype ? isBack : undefined)
    return model
}

export function generateTree(kind: TreeSpecies, seed: number, budgetMultiplier: number = TREE_BUDGET_MULTIPLIER.default,
    usePrototype = false): TreeVariant {
    const species = TREE_SPECIES[kind]
    const next = randomStream(seed)
    const range = (a: number, b: number) => a + (b - a) * next()
    const height = species.height * range(.87, 1.13)
    const width = species.spread * range(.82, 1.18)
    const rootRadius = species.radius * range(.86, 1.14)
    const yaw = next() * TAU
    const turn = range(-1, 1) < 0 ? -1 : 1
    const tint = range(.86, 1.16)
    const growth: Growth[] = []
    function add(pieces: Piece[], level = 0, shade = false, parent?: Growth): Growth {
        const group = {pieces, level, shade, parent}
        growth.push(group)
        return group
    }
    function path(points: Vector3[], radii: number[], level = 0, shade = false, parent?: Growth) {
        return add(makeWoodSpans(points, radii, species.bark, tint, range), level, shade, parent)
    }
    function foliage(at: Vector3, angle: number, scale: Vector3, tilt: number, leaf = false): Piece {
        return {
            matrix: Matrix.Compose(scale, Quaternion.RotationYawPitchRoll(Math.PI / 2 - angle, tilt, range(-.39, .39)), at),
            palette: species.foliage, tint: tint * range(.68, 1.24), taper: range(.76, 1.10),
            length: scale.z, grain: next() * 37, shape: leaf ? 'leaf' : 'needles', radius: 0,
        }
    }

    const leafyBirch = usePrototype && kind === 'birch'
    // A separate stream keeps the winter skeleton and its seeds identical with the prototype on or off.
    const leafRandom = randomStream(seed ^ 0x185c32af)
    const leafRange = (min: number, max: number) => min + (max - min) * leafRandom()
    function addBirchCluster(center: Vector3, angle: number, size: number, parent: Growth, shade = false) {
        const cards: Piece[] = []
        for (let i = 0; i < 6; i++) {
            const direction = angle + (i - 2.5) * .63 + leafRange(-.25, .25)
            const start = spread(center, direction + Math.PI, size * leafRange(.27, .51), size * leafRange(-.28, .34))
            const scale = new Vector3(size * leafRange(.65, .94), size * leafRange(.34, .63), size * leafRange(.98, 1.24))
            const rotation = Quaternion.RotationYawPitchRoll(Math.PI / 2 - direction, leafRange(-.48, .39), leafRange(-.55, .55))
            cards.push({matrix: Matrix.Compose(scale, rotation, start), palette: 0, tint: tint * leafRange(.85, 1.16),
                taper: leafRange(.87, 1.08), length: scale.z, grain: leafRandom() * 37, shape: 'leaf', radius: 0})
        }
        add(cards, shade ? 0 : 1, shade, parent).birchLeaves = true
    }

    const evergreen = kind === 'evergreen'
    const bent = kind === 'twisted' || evergreen
    const conical = kind === 'spruce' || kind === 'fir'
    const base = new Vector3(0, -.10, 0)
    const trunk = [base]
    const trunkRadii = [rootRadius * 1.25]
    const lean = next() * TAU
    const bend = range(.82, 1.24)
    const trunks = bent ? [
        [.105, .43, .54], [.24, 1.12, .22], [.39, .66, -.62], [.54, .54, -.18],
        [.68, 1.34, .5], [.80, 1.63, .68], [.91, 1.44, 1.03], [1, 2.02, 1.32],
    ] : [
        [.10, .03, .02], [.25, .07, .11], [.40, .10, .20], [.55, .19, .13],
        [.70, .20, .31], [.83, .33, .30], [.93, .41, .44], [1, .50, .39],
    ]
    for (const [fraction, forward, sideways] of trunks) {
        const leanScale = bent ? (evergreen ? .89 : .75) : (kind === 'spruce' ? 1.2 : .67)
        const at = spread(base, lean, (forward * bend + range(-.12, .12)) * leanScale, height * fraction + .10)
        trunk.push(spread(at, lean + turn * Math.PI / 2, (sideways + range(-.12, .12)) * leanScale, 0))
        trunkRadii.push(rootRadius * Math.max(.035, (1 - fraction) ** (conical ? 1.02 : .83)) * range(.91, 1.11))
    }
    const core = path(trunk, trunkRadii, 0, true)
    for (const piece of core.pieces) piece.trunk = true

    const rootCount = bent ? 6 : 5
    for (let i = 0; i < rootCount; i++) {
        const angle = lean + i * TAU / rootCount + range(-.32, .32)
        const length = rootRadius * range(1.65, 3.45)
        const a = spread(base, angle, rootRadius * .44, rootRadius * range(.69, 1.02))
        const b = spread(base, angle, length * .57, rootRadius * range(.26, .44))
        const c = spread(base, angle + range(-.26, .26), length, .04)
        const radius = rootRadius * range(.27, .54)
        path([a, b, c], [radius, radius * .63, radius * .06], i < 4 ? 0 : 1)
    }

    const bearing = next() * TAU
    if (leafyBirch) addBirchCluster(trunk[8], bearing, width * .35, core, true)
    if (!conical) {
        if (evergreen) {
            for (let i = 0; i < 3; i++) {
                const angle = bearing + i * TAU / 3
                const center = Vector3.Lerp(trunk[7], trunk[8], .55)
                add([foliage(center, angle, new Vector3(.58, .40, .71), -.08)], i < 2 ? 0 : 1, i === 0, core)
            }
        }
        const count = kind === 'birch' ? 9 : evergreen ? 7 : 8
        for (let i = 0; i < count; i++) {
            const fraction = (i + range(.12, .86)) / count
            const position = evergreen ? 2.28 + fraction * 4.46 : 1.45 + fraction * 5.85
            const index = Math.floor(position)
            const origin = Vector3.Lerp(trunk[index], trunk[index + 1], position - index)
            const angle = bearing + i * SPIRAL * turn + range(-.54, .54)
            const leader = kind === 'twisted' && i === 2
            const distance = width * range(.73, 1.22) * (1 - fraction * (kind === 'birch' ? .62 : .43))
            const rise = height * range(leader ? .44 : .17, leader ? .56 : .28)
                * (1 - fraction * .38) * (evergreen ? .63 : 1)
            const elbow = spread(origin, angle, distance * range(.39, .56),
                rise * range(kind === 'birch' || leader ? .40 : evergreen ? .23 : -.12, .59))
            const bend = spread(elbow, angle + range(-.86, .86), distance * .36, rise * range(.14, .65))
            const tip = spread(bend, angle + range(-.97, .97), distance * .33, rise * range(.02, .66))
            const radius = trunkRadii[index] * (leader ? range(.77, .90) : kind === 'twisted' ? range(.53, .80) : range(.42, .70))
            const limb = path([origin, elbow, bend, tip], [radius, radius * .61, radius * .30, Math.min(.012, radius * .13)],
                0, i % 2 === 0, core)
            if (leafyBirch && (i > 0 || leafRandom() > .36)) {
                addBirchCluster(tip, angle, .43 + distance * .24, limb, i % 4 === 2)
            }
            const forks = evergreen ? 2 : 4
            for (let j = 0; j < forks; j++) {
                const side = j % 2 === 0 ? -1 : 1
                const dir = angle + side * range(.42, 1.58)
                const start = j < 2 ? Vector3.Lerp(elbow, bend, range(.08, .52)) : Vector3.Lerp(bend, tip, range(.05, .65))
                const reach = width * range(.18, .37) * (1 - fraction * .38)
                const elbow2 = spread(start, dir, reach * range(.37, .60), rise * range(-.12, .51))
                const tip2 = spread(elbow2, dir + range(-.91, .91), reach * .63, rise * range(.06, .54))
                const twig = Math.max(.018, radius * (j < 2 ? range(.29, .42) : range(.13, .26)))
                const fork = path([start, elbow2, tip2], [twig, twig * .61, twig * .10],
                    j < (kind === 'autumn' ? 1 : 2) ? 0 : 1, !evergreen && i % 2 === 0 && j === 0, limb)
                if (leafyBirch && j < 2 && (i > 1 || j === 0)) addBirchCluster(tip2, dir, .29 + reach * .46, fork)
                if (evergreen) {
                    const array = [foliage(elbow2.add(new Vector3(0, .16, 0)), dir,
                        new Vector3(reach * .89, .47, reach * 1.34), -.05)]
                    add(array, 0, i % 2 === 0, limb)
                    add([foliage(tip2, dir + .57 * side, new Vector3(reach * .71, .41, reach * 1.13), -.05)], 1, false, fork)
                    continue
                }
                const leaves = kind === 'autumn' && (j === 0 ? i % 4 !== 1 : next() < .42)
                if (leaves) {
                    for (let n = 0; n < 16; n++) {
                        const size = range(.115, .24)
                        const at = spread(Vector3.Lerp(elbow2, tip2, range(.34, .99)), next() * TAU, range(.02, .43), range(-.18, .21))
                        add([foliage(at, next() * TAU, new Vector3(size, size, size * 1.55), range(-.76, .25), true)],
                            n < 7 ? 0 : n < 12 ? 1 : 2, n === 0 && j === 0 && i % 2 === 0, fork)
                    }
                }
                const fine = spread(elbow2, dir + side * range(.52, 1.17), reach * range(.33, .62), rise * range(-.07, .42))
                const twigEnd = spread(fine, dir + side * range(.24, .52), reach * .26, rise * range(.10, .36))
                const sprig = path([elbow2, fine, twigEnd], [twig * .52, twig * .32, .0018],
                    j === 0 && kind !== 'autumn' ? 0 : 1, false, fork)
                path([fine, spread(fine, dir - side * range(.21, .95), reach * .36, rise * .28)], [twig * .32, .0015], 2, false, sprig)
                path([tip2, spread(tip2, dir + side * range(.33, .84), reach * .42, rise * .30)], [twig * .26, .0015], 2, false, fork)
            }
            if (evergreen) {
                add([foliage(Vector3.Lerp(elbow, bend, .74).add(new Vector3(0, .23, 0)), angle,
                    new Vector3(distance * .38, .54, distance * .69), -.02)], 0, i % 2 === 0, limb)
                add([foliage(Vector3.Lerp(bend, tip, .6), angle + .54,
                    new Vector3(distance * .31, .40, distance * .57), -.06)], 2, false, limb)
            }
        }
    } else {
        const ragged = kind === 'spruce'
        const tiers = ragged ? 6 : 7
        for (let tier = 0; tier < tiers; tier++) {
            const fraction = tier / (tiers - 1)
            const position = (ragged ? 1.65 : 1.25) + fraction * (ragged ? 6.15 : 6.65)
            const i = Math.floor(position)
            const tierBase = Vector3.Lerp(trunk[i], trunk[i + 1], position - i)
            const count = tier === tiers - 1 ? 3 : ragged ? 4 : 5
            const phase = bearing + tier * SPIRAL + range(-.57, .57)
            const tierWidth = width * (1 - fraction * .92) ** (ragged ? .89 : .70)
            const gap = Math.floor(next() * count)
            for (let j = 0; j < count; j++) {
                const angle = phase + TAU * j / count + range(-.29, .29)
                const distance = tierWidth * range(ragged ? .65 : .86, 1.19) * (ragged && j === gap ? .76 : 1)
                const a = tierBase.add(new Vector3(0, range(-.14, .12), 0))
                const b = spread(a, angle, distance * .53, range(.02, .18) * tierWidth)
                const end = spread(b, angle + range(-.32, .32), distance * .46, -distance * range(.10, .29))
                const radius = Math.max(.018, trunkRadii[i] * range(.24, .42))
                const castsLimbShadow = tier % 2 === 0 && j === tier % count
                const limb = path([a, b, end], [radius, radius * .58, .005], ragged || j === gap ? 0 : 1, castsLimbShadow, core)
                if (ragged && (j === gap || (tier === 2 && j !== 0))) {
                    path([b, spread(b, angle + .68 * turn, distance * .44, distance * .16)], [radius * .45, .004], 0, false, limb)
                    continue
                }
                const primary = !ragged ? j !== (tier + 2) % count || tier === tiers - 1 : j !== (tier + 1) % count
                add([foliage(spread(a, angle, distance * .06, Math.max(.10, distance * .25)), angle,
                    new Vector3(distance * (ragged ? .49 : .62), distance * .53, distance * .99), range(.05, .28))],
                    primary ? 0 : 1, j === tier % count || j === (tier + 2) % count || (!ragged && primary && tier < 5), core)
                const flank = angle + range(.43, .73) * turn
                add([foliage(spread(b, flank, distance * .06, distance * .14), flank,
                    new Vector3(distance * .29, distance * .41, distance * .54), .11)], 1, false, limb)
                add([foliage(spread(b, angle - .48 * turn, distance * .15, distance * .14), angle - .48 * turn,
                    new Vector3(distance * .27, distance * .36, distance * .55), .16)], 2, false, limb)
            }
        }
    }

    // Spread detail across the height and around the crown when a tier hits its triangle budget.
    // Parents precede their children inside each detail tier, and ties keep the seeded order.
    const ordering = growth.map((group, i) => ({group, i, depth: 0, rank: group.birchLeaves ? leafRandom() : next()}))
    const byGroup = new Map(ordering.map(entry => [entry.group, entry]))
    for (const entry of ordering) {
        const parent = entry.group.parent && byGroup.get(entry.group.parent)
        entry.depth = parent && parent.group.level === entry.group.level ? parent.depth + 1 : 0
    }
    ordering.sort((a, b) => a.group.level - b.group.level || a.depth - b.depth || (a.group.level === 0 ? a.i - b.i : a.rank - b.rank))
    const ordered = ordering.map(entry => entry.group)
    const multiplier = normalizeTreeBudgetMultiplier(budgetMultiplier)
    const detailSeed = seed ^ 0xb79f5d2b
    const prototypeYaw = usePrototype ? yaw : undefined
    return {height, rootRadius, yaw, spread: width, models: {
        LOW: makeModel(ordered, 'LOW', multiplier, detailSeed, prototypeYaw),
        MEDIUM: makeModel(ordered, 'MEDIUM', multiplier, detailSeed, prototypeYaw),
        HIGH: makeModel(ordered, 'HIGH', multiplier, detailSeed, prototypeYaw),
        SHADOW: makeModel(ordered, 'SHADOW', multiplier, detailSeed, prototypeYaw),
    }}
}

export class TreeVariants {
    private readonly pool = new Map<TreeSpecies, TreeVariant[]>()

    constructor(private readonly seed = TREE_DEFAULT_SEED, private readonly budgetMultiplier: number = TREE_BUDGET_MULTIPLIER.default,
        private readonly usePrototype = false) {}

    get(kind: TreeSpecies, index: number): TreeVariant {
        const slot = ((index % TREE_VARIANT_COUNT) + TREE_VARIANT_COUNT) % TREE_VARIANT_COUNT
        let variants = this.pool.get(kind)
        if (!variants) this.pool.set(kind, variants = [])
        const salt = Object.keys(TREE_SPECIES).indexOf(kind) + 1
        const seed = this.seed ^ Math.imul(salt, 0x45d9f3b) ^ Math.imul(slot + 1, 0x27d4eb2d)
        return variants[slot] ??= generateTree(kind, seed, this.budgetMultiplier, this.usePrototype)
    }

    warmUp(prepare?: (variant: TreeVariant) => void) {
        for (const kind of Object.keys(TREE_SPECIES) as TreeSpecies[]) {
            for (let slot = 0; slot < TREE_VARIANT_COUNT; slot++) {
                const variant = this.get(kind, slot)
                prepare?.(variant)
            }
        }
    }
}

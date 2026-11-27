import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core'
import type { ArcRotateCamera } from '@babylonjs/core'
import { Lights } from '@/babylon/scene/lights'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import type { ContactShadowFootprint } from '@/babylon/world/terrainContactShadow'
import { TreeVariants } from '@/babylon/world/trees/treeGenerator'
import { TreeRenderer } from '@/babylon/world/trees/treeRenderer'
import type { TreePlacement } from '@/babylon/world/trees/treeRenderer'
import { normalizeTreeBudgetMultiplier, TREE_BUDGET_MULTIPLIER, TREE_DEFAULT_SEED, TREE_VARIANT_COUNT } from '@/babylon/world/trees/treeSpecies'
import type { TreeDetail, TreeSpecies, TreeSurfaceDetail } from '@/babylon/world/trees/treeSpecies'
import { WorldDataManager } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { TerrainEnum1 } from '@/babylon/materials'

const STORAGE_KEY = 'darkenlight.adminUtils.proceduralTrees'
type Parameters = {size: number, seed: number, variant: number, budgetMultiplier: number}
const DEFAULTS: Parameters = {size: 1, seed: TREE_DEFAULT_SEED, variant: 0, budgetMultiplier: TREE_BUDGET_MULTIPLIER.default}
type Plot = {x: number, z: number, view: ArcRotateCamera}

function createRevealMannequin(scene: Scene) {
    const body = MeshBuilder.CreateCylinder('treeRevealBody', {height: .66, diameterTop: .48, diameterBottom: .35, tessellation: 8}, scene)
    body.position.y = .99
    const head = MeshBuilder.CreateSphere('treeRevealHead', {diameter: .33, segments: 6}, scene)
    head.position.y = 1.5
    const parts = [body, head]
    for (const side of [-1, 1]) {
        const leg = MeshBuilder.CreateCylinder('treeRevealLeg', {height: .68, diameter: .17, tessellation: 6}, scene)
        leg.position.set(side * .106, .34, 0)
        const arm = MeshBuilder.CreateCylinder('treeRevealArm', {height: .56, diameter: .13, tessellation: 6}, scene)
        arm.position.set(side * .27, .95, 0)
        arm.rotation.z = side * .13
        parts.push(leg, arm)
    }
    const mannequin = Mesh.MergeMeshes(parts, true)!
    mannequin.name = 'treeRevealMannequin'
    mannequin.isPickable = false
    const material = new StandardMaterial('treeRevealMannequinMaterial', scene)
    material.diffuseColor = Color3.FromHexString('#f9bd62')
    material.emissiveColor = new Color3(.31, .16, .042)
    mannequin.material = material
    return mannequin
}

export function createProceduralTreePreview(scene: Scene, parent: TransformNode, parameters: HTMLTextAreaElement,
    refresh: () => void,
) {
    const controls = document.createElement('fieldset')
    controls.className = 'admin-utils__tree-controls'
    controls.hidden = true
    controls.innerHTML = `<legend>Procedurální strom</legend>
        <div class="admin-utils__tree-actions">
            <button type="button" id="treeNext">Další 4 varianty</button>
            <button type="button" id="treeSeed">Nový seed</button>
        </div>
        <label class="admin-utils__field">Náhled<select id="treePass">
            <option value="color">Strom a stín</option>
            <option value="proxy">Geometrie stínového LOD</option>
            <option value="shadow">Pouze stín z LOD</option>
        </select></label>
        <label class="admin-utils__field">Násobek rozpočtu trojúhelníků
            <input type="number" id="treeBudgetMultiplier" min="${TREE_BUDGET_MULTIPLIER.min}" max="${TREE_BUDGET_MULTIPLIER.max}" step="0.1">
        </label>
        <label class="admin-utils__field">Krytí levého horního stromu <output id="treeOpacityValue">100 %</output>
            <input type="range" id="treeOpacity" min="0" max="100" value="100">
        </label>
        <label><input type="checkbox" id="treeRevealEnabled"> Výřez kolem postavy</label>
        <label class="admin-utils__field">Poloha postavy kolem stromu
            <input type="range" id="treeRevealAngle" min="-180" max="180" value="0" disabled>
        </label>
        <output id="treeStats" role="status"></output>`
    const get = <T extends HTMLElement>(id: string) => controls.querySelector<T>('#' + id)!
    const pass = get<HTMLSelectElement>('treePass')
    const budget = get<HTMLInputElement>('treeBudgetMultiplier')
    const opacity = get<HTMLInputElement>('treeOpacity')
    const revealEnabled = get<HTMLInputElement>('treeRevealEnabled')
    const revealAngle = get<HTMLInputElement>('treeRevealAngle')
    const stats = get<HTMLOutputElement>('treeStats')
    let renderer: TreeRenderer | undefined
    let mannequin: Mesh | undefined
    let revealPlot: {position: Vector3, distance: number, view: ArcRotateCamera} | undefined
    const revealCenter = Vector3.Zero()
    let variants: TreeVariants | undefined
    let poolKey = ''
    let current = DEFAULTS
    let frameKey = ''
    let saved: Partial<Record<TreeSpecies, Parameters>> = {}
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') ?? {} } catch { /* Use defaults. */ }

    const write = (data: Parameters) => { parameters.value = JSON.stringify(data, null, 2) }
    get('treeNext').onclick = () => {
        write({...current, variant: (current.variant + 4) % TREE_VARIANT_COUNT})
        refresh()
    }
    get('treeSeed').onclick = () => {
        write({...current, seed: crypto.getRandomValues(new Uint32Array(1))[0], variant: 0})
        refresh()
    }
    pass.onchange = refresh
    budget.onchange = () => {
        write({...current, budgetMultiplier: normalizeTreeBudgetMultiplier(budget.valueAsNumber)})
        refresh()
    }
    opacity.oninput = () => {
        get<HTMLOutputElement>('treeOpacityValue').value = opacity.value + ' %'
        renderer?.setOpacity(0, Number(opacity.value) / 100)
    }
    const hideMannequin = () => {
        mannequin?.setEnabled(false)
        renderer?.setRevealTargets(null)
    }
    revealEnabled.onchange = () => {
        revealAngle.disabled = !revealEnabled.checked
        if (!revealEnabled.checked) hideMannequin()
    }
    scene.onBeforeRenderObservable.add(() => {
        if (!revealPlot || !revealEnabled.checked || !renderer) return
        const {position, distance, view} = revealPlot
        const angle = view.alpha + Math.PI + Number(revealAngle.value) * Math.PI / 180
        mannequin ??= createRevealMannequin(scene)
        mannequin.setEnabled(true)
        mannequin.position.set(position.x + Math.cos(angle) * distance, position.y, position.z + Math.sin(angle) * distance)
        mannequin.rotation.y = Math.PI / 2 - view.alpha
        revealCenter.copyFrom(mannequin.position).addInPlaceFromFloats(0, .87, 0)
        renderer.setRevealTargets(revealCenter, null, view)
    })
    scene.onDisposeObservable.addOnce(() => renderer?.dispose())

    return {
        controls,
        restore(kind: TreeSpecies) { write({...DEFAULTS, ...saved[kind]}) },
        clear() {
            revealPlot = undefined
            hideMannequin()
            renderer?.rebuild([])
        },
        render(kind: TreeSpecies, data: Partial<Parameters>, plots: readonly Plot[]) {
            const valid = (value: number | undefined, fallback: number, min: number, max: number) =>
                typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
            current = {
                size: valid(data.size, DEFAULTS.size, .25, 1.6),
                seed: Math.floor(valid(data.seed, DEFAULTS.seed, 0, 0xffffffff)),
                variant: Math.floor(valid(data.variant, DEFAULTS.variant, 0, TREE_VARIANT_COUNT - 1)),
                budgetMultiplier: normalizeTreeBudgetMultiplier(data.budgetMultiplier ?? DEFAULTS.budgetMultiplier),
            }
            budget.value = String(current.budgetMultiplier)
            if (data.budgetMultiplier !== current.budgetMultiplier) write(current)
            saved[kind] = current
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
            const nextFrameKey = `${kind}:${current.size}:${current.seed}:${current.variant}`
            const recenter = nextFrameKey !== frameKey
            frameKey = nextFrameKey
            const nextPoolKey = `${current.seed}:${current.budgetMultiplier}`
            if (!variants || nextPoolKey !== poolKey) {
                poolKey = nextPoolKey
                variants = new TreeVariants(current.seed, current.budgetMultiplier)
                if (current.seed === TREE_DEFAULT_SEED && current.budgetMultiplier === DEFAULTS.budgetMultiplier) variants.warmUp()
            }
            const pool = variants
            const shadowOnly = pass.value === 'shadow'
            const surfaceDetail = Settings.detailLevel.name as TreeSurfaceDetail
            const detail: TreeDetail = pass.value === 'color' ? surfaceDetail : 'SHADOW'
            const map = WorldDataManager.getBlockMap()
            const footprints: ContactShadowFootprint[] = []
            const placements: TreePlacement[] = plots.map(({x, z}, i) => {
                const block = map[x][z]
                const variant = pool.get(kind, current.variant + i)
                const snow = block.snowed ? 1 : block.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index ? .38 : 0
                for (const [type, dx, dz] of [[151, -1, 1], [154, 1, 0], [155, 0, -1]]) {
                    StaticsManager.addObject({tp: type, x: x + dx, z: z + dz, tmp: true}, false)
                }
                if (!shadowOnly) {
                    const radius = variant.rootRadius * current.size
                    footprints.push({minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius,
                        height: block.height, reach: Math.max(.22, radius * .75)})
                }
                return {id: i, variant, position: new Vector3(x, block.totalHeight, z), size: current.size,
                    snow, detail, shadowOnly, opacity: i === 0 ? Number(opacity.value) / 100 : 1}
            })
            renderer ??= new TreeRenderer(scene, parent, mesh => Lights.shadow?.addShadowCaster(mesh, false),
                mesh => Lights.shadow?.removeShadowCaster(mesh, false))
            renderer.setSurfaceDetail(surfaceDetail)
            renderer.rebuild(placements)
            revealEnabled.disabled = shadowOnly
            revealAngle.disabled = shadowOnly || !revealEnabled.checked
            const first = placements[0]
            if (!shadowOnly && first) {
                revealPlot = {position: first.position, distance: Math.max(1.1, first.variant.rootRadius * first.size * 1.8 + .38),
                    view: plots[0].view}
            }
            const {colorBatches, casterBatches, triangles} = renderer.getStats()
            const shadows = scene.shadowsEnabled ? `${casterBatches} pro stín` : 'stíny vypnuté'
            stats.value = `${triangles.toLocaleString('cs-CZ')} trojúhelníků ve 4 variantách · ${colorBatches} dávek pro obraz · ${shadows}`
            return {
                footprints,
                labels: placements.map(({variant}, i) =>
                    `#${(current.variant + i) % TREE_VARIANT_COUNT + 1} · ${variant.models[detail].triangles.toLocaleString('cs-CZ')} △`),
                height: Math.max(...placements.map(({variant}) => variant.height)) * current.size,
                width: Math.max(...placements.map(({variant}) => variant.spread)) * current.size,
                recenter,
            }
        },
    }
}

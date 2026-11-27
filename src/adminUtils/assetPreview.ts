import monsterNames from 'virtual:admin-monster-names'
import { createMonsterEquipmentEditor } from './monsterEquipmentEditor'
import { SpecimenPrefabs } from '@/babylon/world/statics/objects/specimens'
import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import type { Matrix } from '@babylonjs/core'
import type { CharacterModel } from '@/babylon/character/characterModel'
import type { Monster } from '@/babylon/monsters/monster'
import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterTypes } from '@/babylon/monsters/codebook/monsterCodebook'
import { MonsterTemplates } from '@/babylon/monsters/codebook/monsterTemplates'
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { WorldRenderer, SymmetricBlock } from '@/babylon/world/worldRenderer'
import { Builder } from '@/babylon/builder'
import { Materials, TerrainEnum1 } from '@/babylon/materials'
import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { StoneBatch } from '@/babylon/world/stoneBatch'
import { TaperedBlockBatch } from '@/babylon/world/taperedBlockBatch'
import { ArchedMasonryBatch, MasonryBatch } from '@/babylon/world/masonryBatch'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { StoneWall } from '@/babylon/world/statics/objects/stoneWall'
import { StaticObjectsCodebook } from '@/babylon/world/statics/staticsCodebook'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { StaticEquipPartsRenderer } from '@/babylon/world/statics/staticEquipPartsRenderer'
import { StaticLeafPlanes } from '@/babylon/world/statics/staticLeafPlanes'
import { EquipManager } from '@/babylon/item/equipManager'
import { WeaponModelsCb } from '@/babylon/item/codebook/weaponModelsCb'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import type { MeshAnimation } from '@/babylon/animations/animation'
import { createTerrainPreview } from './terrainPreview'
import { createStaticBiomePreview } from './staticBiomePreview'
import { createProceduralTreePreview } from './proceduralTreePreview'
import { TREE_SPECIES, TREE_SPECIES_BY_TYPE } from '@/babylon/world/trees/treeSpecies'
import type { TreeSpecies } from '@/babylon/world/trees/treeSpecies'
import { createSnowCoverMask } from '@/babylon/world/snowCoverMask'
import { Settings } from '@/settings/settings'

function countStaticPlotTriangles(
    plots: readonly {x: number, z: number}[],
    batches: Iterable<{mesh: Mesh, matrices: readonly Matrix[]}>,
) {
    const counts = plots.map(() => 0)
    for (const {mesh, matrices} of batches) {
        if (!mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0) continue
        const triangles = mesh.getTotalIndices() / 3
        for (const {m} of matrices) {
            // The plots are 35 tiles apart. A connected display belongs to the nearest plot.
            let closest = 0, closestDistance = Infinity
            for (const [i, {x, z}] of plots.entries()) {
                const distance = (m[12] - x) ** 2 + (m[14] - z) ** 2
                if (distance >= closestDistance) continue
                closestDistance = distance
                closest = i
            }
            counts[closest] += triangles
        }
    }
    return counts
}

// This sandbox deliberately calls geometry factories, never the world/network loop.
export async function installAssetPreview(
    root: HTMLElement,
    scene: Scene,
    camera: ArcRotateCamera,
    ground: Mesh,
    getCharacter: () => CharacterModel,
    setTerrainLighting: (active: boolean) => void,
    setStaticLighting: (phase?: number) => void,
) {
    const panel = root.querySelector<HTMLElement>('.admin-utils__panel')!
    const hint = root.querySelector<HTMLElement>('.admin-utils__hint')!
    const assetHint = hint.textContent
    const characterControls = document.createElement('div')
    while (panel.children.length > 1) characterControls.append(panel.children[1])
    panel.append(characterControls)
    const tabs = document.createElement('nav')
    tabs.className = 'admin-utils__tabs'
    tabs.setAttribute('aria-label', 'Náhledy')
    panel.insertBefore(tabs, characterControls)
    const rotationControl = document.createElement('label')
    rotationControl.className = 'admin-utils__field'
    rotationControl.innerHTML = '<span>Otočení Y: <output>0°</output></span><input type="range" min="0" max="360" step="1" value="0" aria-label="Otočení kolem osy Y">'
    panel.insertBefore(rotationControl, characterControls)
    const rotationSlider = rotationControl.querySelector('input')!
    const rotationOutput = rotationControl.querySelector('output')!
    const controls = document.createElement('section')
    controls.hidden = true
    controls.innerHTML = `<label class="admin-utils__field">Hledat<input type="search" id="assetSearch"></label>
        <label class="admin-utils__field">Objekt<select id="assetChoice" size="10"></select></label>
        <label class="admin-utils__field">Parametry (JSON)<textarea id="assetParameters" rows="9" spellcheck="false"></textarea></label>
        <button id="assetApply">Použít parametry</button>
        <label><input id="assetRoof" type="checkbox" checked> Zobrazit střechu</label>
        <div id="assetMotion"><label class="admin-utils__field">Animace<select id="assetAnimation"></select></label>
        <label><input id="assetLoop" type="checkbox" checked> Loop</label><button id="assetPlay">Přehrát znovu</button>
        <label class="admin-utils__field">Zbraň<select id="assetWeapon"></select></label></div>
        <p id="assetError" role="status"></p>`
    panel.append(controls)
    const equipmentEditor = createMonsterEquipmentEditor(controls.querySelector<HTMLElement>('#assetMotion')!)
    const get = <T extends HTMLElement>(id: string) => controls.querySelector<T>('#' + id)!
    const choice = get<HTMLSelectElement>('assetChoice')
    const search = get<HTMLInputElement>('assetSearch')
    const parameters = get<HTMLTextAreaElement>('assetParameters')
    const roof = get<HTMLInputElement>('assetRoof')
    const animation = get<HTMLSelectElement>('assetAnimation')
    const loop = get<HTMLInputElement>('assetLoop')
    const weapon = get<HTMLSelectElement>('assetWeapon')
    const error = get<HTMLParagraphElement>('assetError')
    let tab = 'Postava'
    const storageKey = 'darkenlight.adminUtils.preview'
    let saved: {tab?: string, choice?: string} = {}
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { /* Ignore old sandbox settings. */ }
    if (saved.choice?.startsWith('tree:')) {
        const species = TREE_SPECIES_BY_TYPE.get(Number(saved.choice.slice(5)))
        if (species) saved.choice = 'lowpoly:' + species
    }
    let monster: MonsterModel | null = null
    let clips: [string, MeshAnimation][] = []
    let generation = 0
    const parent = new TransformNode('assetPreview', scene)
    getCharacter().node.parent = parent
    const rotatePreview = () => {
        parent.rotation.y = Number(rotationSlider.value) * Math.PI / 180
        rotationOutput.value = rotationSlider.value + '°'
    }
    const centerRotation = (x = 0, z = 0) => {
        parent.setPivotPoint(new Vector3(x, 0, z))
        rotatePreview()
    }
    rotationSlider.addEventListener('input', rotatePreview)
    WorldRenderer.worldParentNode = parent
    const contactMaterial = WorldRenderer.createStaticBlockMaterial(scene, true)
    const staticContact = WorldRenderer.staticTerrainContact
    WorldRenderer.block1 = new SymmetricBlock(Builder.createWrappedBlock(scene, parent), contactMaterial)
    WorldRenderer.block1.mesh.receiveShadows = true
    Lights.addShadowCaster(WorldRenderer.block1.mesh, false)
    WorldRenderer.blockWithAlpha1 = new SymmetricBlock(Builder.createBlock(scene, parent), Materials.blockMatAlpha1!)
    WorldRenderer.translucentPlane = new SymmetricBlock(Builder.createHorizontalPlane(scene, parent, 1, 0), Materials.blockMatTrans!)
    StoneBatch.initialize(scene, parent)
    TaperedBlockBatch.initialize(scene, parent, true)
    MasonryBatch.initialize(scene, parent, true)
    ArchedMasonryBatch.initialize(scene, parent, true)
    // MyPlayer.worldId defaults to zero in the offline bootstrap.
    const { MyPlayer } = await import('@/data/myPlayer')
    WorldDataManager.replaceWorldData(MyPlayer.worldId, 64)
    const origin = new MapBlock(0, TerrainEnum1.TERRAIN_ROCK.index)
    origin.computeData()
    WorldDataManager.getBlockMap()[0][0] = origin
    StaticsManager.initialize(scene)
    BuildingManager.initialize(scene, parent)
    const buffers = () => [WorldRenderer.block1!, WorldRenderer.blockWithAlpha1!, WorldRenderer.translucentPlane!,
        StoneBatch.prefab!, StaticLeafPlanes.prefab!, ...StaticEquipPartsRenderer.prefabs.values(), ...SpecimenPrefabs.all]
    const terrain = createTerrainPreview(scene, parent, camera, ground, setTerrainLighting)
    panel.append(terrain.controls)
    const biomes = createStaticBiomePreview(scene, camera, ground, setStaticLighting, () => void show(false))
    controls.prepend(biomes.controls)
    const proceduralTrees = createProceduralTreePreview(scene, parent, parameters, () => void show(false))
    controls.insertBefore(proceduralTrees.controls, parameters.parentElement)
    biomes.setActive(false)
    for (const batch of [StoneBatch.prefab!, TaperedBlockBatch.prefab!, MasonryBatch.prefab!, ArchedMasonryBatch.prefab!]) {
        Lights.addShadowCaster(batch.mesh, false)
    }
    const refreshBuildingBatches = () => {
        BuildingManager.rebuildOpaqueBatch()
        // Babylon renders the source box/plane when a thin-instance batch is empty.
        for (const mesh of [BuildingManager.opaqueBatchMesh, BuildingManager.glassBatchMesh]) {
            mesh?.setEnabled(mesh.thinInstanceCount > 0)
        }
        const floor = BuildingManager.floorBatch?.mesh
        if (floor) {
            // The asset viewer uses its own fill and back lights.
            Lights.unregisterSharedLightMesh(floor)
            floor._resyncLightSources()
        }
    }
    const clear = () => {
        generation++
        proceduralTrees.clear()
        proceduralTrees.controls.hidden = true
        parent.rotation.y = 0
        if (monster) {
            clips.forEach(([, clip]) => clip.stop())
            monster.equipSet.forEach(item => EquipManager.removeEquippedItem(item))
            MonsterLoader.monsterTemplates.get(monster.type.templateId)?.freeClone(monster.template)
            monster.nameTextNode.dispose()
            monster.lhandNode.dispose()
            monster = null
        }
        clips = []
        equipmentEditor.refresh(null)
        staticContact?.clear()
        StoneBatch.clear()
        TaperedBlockBatch.clear()
        TaperedBlockBatch.flush()
        MasonryBatch.clear()
        MasonryBatch.flush()
        ArchedMasonryBatch.clear()
        ArchedMasonryBatch.flush()
        WorldRenderer.snowCoverMask.clear()
        StaticsManager.allStatics.forEach(obj => { obj.onHidden(); obj.prefab?.clearMatrices(); obj.dispose() })
        StaticsManager.allStatics = []
        StaticsManager.staticsByTile.clear()
        StaticsManager.dirtyStaticTiles.clear()
        StaticsManager.staticsByType.clear()
        StaticsManager.visibleStatics = []
        StaticsManager.collisionGrid.clear()
        StaticsManager.walkableObjectsByTile.clear()
        StaticsManager.benchesByTile.clear()
        StaticsManager.dungeonEntrances.clear()
        BuildingManager.buildings.forEach(b => b.dispose())
        BuildingManager.buildings.clear()
        BuildingManager.floorTiles.clear()
        BuildingManager.collisionTiles.clear()
        refreshBuildingBatches()
        buffers().forEach(b => { b.clearMatrices(); b.setThinInstanceBuffers(); b.mesh.setEnabled(false) })
    }
    const entries = () => tab === 'Statics'
        ? [...Object.entries(TREE_SPECIES).map(([kind, species]) => ({id: 'lowpoly:' + kind, name: species.name})),
            ...Array.from(StaticObjectsCodebook.values(), v => ({id: String(v.type), name: v.name}))]
        : tab === 'Buildings' ? ['House', 'Shed', 'Mausoleum', 'Cabin'].map((name, i) => ({id: String(i + 1), name}))
        : Object.entries(MonsterTypes).map(([key, type]) => ({
            id: String(type.id),
            name: monsterNames[type.id] ?? key.toLowerCase().replace(/(^|_)([a-z])/g, (_, prefix, letter) => (prefix ? ' ' : '') + letter.toUpperCase()),
        }))
    const play = () => {
        clips.forEach(([, clip]) => clip.stop())
        clips[Number(animation.value)]?.[1].start(false, 1, loop.checked)
    }
    const updateWeapon = () => {
        if (!monster?.rhandBone) return
        if (monster.weaponEquipItem) {
            EquipManager.removeEquippedItem(monster.weaponEquipItem)
            monster.equipSet.delete(monster.weaponEquipItem)
            monster.weaponEquipItem = null
        }
        if (weapon.value) monster.assignRhand(Number(weapon.value), 0, Vector3.One(), null, null)
        equipmentEditor.refresh(monster)
    }
    weapon.add(new Option('Bez zbraně', ''))
    Object.values(WeaponModelsCb).forEach(value => weapon.add(new Option(value.model, String(value.id))))
    const show = async (reset: boolean) => {
        clear()
        const current = generation
        localStorage.setItem(storageKey, JSON.stringify({tab, choice: choice.value}))
        error.textContent = ''
        if (tab === 'Statics') biomes.labelPlots()
        if (!choice.value) return
        try {
            const id = Number(choice.value)
            const isStoneWall = tab === 'Statics' && id === 210
            const species = tab === 'Statics' && choice.value.startsWith('lowpoly:') ? choice.value.slice(8) as TreeSpecies : undefined
            proceduralTrees.controls.hidden = !species
            if (reset && species) proceduralTrees.restore(species)
            else if (reset && isStoneWall) parameters.value = JSON.stringify({type: id, name: StaticObjectsCodebook.get(id)!.name, meta: {}}, null, 2)
            else if (reset) parameters.value = JSON.stringify(tab === 'Statics' ? { ...StaticObjectsCodebook.get(id), meta: id === 403 ? { bannerIndex: 0 } : { facing: '+Z' } } : tab === 'Buildings' ? { facing: '+Z', ...(id === 2 ? {width: 5, depth: 3} : {}), doorOpen: false } : { ...Object.values(MonsterTypes).find(v => v.id === id) }, null, 2)
            const data = JSON.parse(parameters.value)
            if (tab === 'Statics') {
                const useContact = !Settings.isDetalLevelLow()
                WorldRenderer.staticTerrainContact = useContact ? staticContact : null
                WorldRenderer.block1!.mesh.material = useContact ? contactMaterial : Materials.blockMat1!
                StoneBatch.setSnowContactEnabled(Settings.isDetalLevelHigh())
                TaperedBlockBatch.setTerrainContactEnabled(useContact)
                MasonryBatch.setTopWeatheringEnabled(Settings.isDetalLevelHigh())
                ArchedMasonryBatch.setTopWeatheringEnabled(Settings.isDetalLevelHigh())
                biomes.prepareTerrain()
                const wallAlongX = data.meta?.orientation === 'X'
                const specimen = species && proceduralTrees.render(species, data, biomes.slots)
                for (const {x, z} of species ? [] : biomes.slots) {
                    if (isStoneWall) {
                        // The last tile of the long arm becomes the corner through the normal wall resolver.
                        for (let offset = -2; offset <= 2; offset++) {
                            StaticsManager.addObject({tp: id, x: x + (wallAlongX ? offset : 0),
                                z: z + (wallAlongX ? 0 : offset), meta: data.meta, tmp: true}, false)
                        }
                        const corner = StaticsManager.allStatics.at(-1)
                        if (corner instanceof StoneWall) corner.previewHeightOffset = 0.5
                        for (let offset = 1; offset <= 2; offset++) {
                            StaticsManager.addObject({tp: id, x: x + (wallAlongX ? 2 : -offset),
                                z: z + (wallAlongX ? -offset : 2),
                                meta: {...data.meta, orientation: wallAlongX ? 'Z' : 'X'}, tmp: true}, false)
                        }
                        for (const [step, height] of [[3, 0.5], [4, 0.25]]) {
                            StaticsManager.addObject({tp: id, x: x - (wallAlongX ? step : 0),
                                z: z - (wallAlongX ? 0 : step), meta: {...data.meta, height}, tmp: true}, false)
                            StaticsManager.addObject({tp: id, x: x + (wallAlongX ? 2 : -step),
                                z: z + (wallAlongX ? -step : 2),
                                meta: {...data.meta, height, orientation: wallAlongX ? 'Z' : 'X'}, tmp: true}, false)
                        }
                    } else {
                        StaticsManager.addObject({tp: id, x, z, meta: data.meta, tmp: true}, false)
                    }
                }
                WorldRenderer.snowCoverMask = createSnowCoverMask(StaticsManager.allStatics, WorldDataManager.getBlockMap().length)
                StaticsManager.resolveStackedStaticPositions()
                StaticsManager.visibleStatics = StaticsManager.allStatics
                StaticsManager.renderObjects(true)
                const obj = StaticsManager.allStatics[0]
                if (reset && obj && 'status' in obj) {
                    data.meta = obj.status ?? data.meta
                    parameters.value = JSON.stringify(data, null, 2)
                }
                const batches = new Set(buffers())
                for (const staticObject of StaticsManager.allStatics) {
                    if (staticObject.prefab && staticObject.prefab !== TaperedBlockBatch.prefab && staticObject.prefab !== MasonryBatch.prefab) batches.add(staticObject.prefab)
                }
                batches.forEach(batch => {
                    batch.setThinInstanceBuffers()
                    batch.mesh.setEnabled(batch.matrices.length > 0)
                })
                WorldRenderer.staticTerrainContact?.upload(WorldRenderer.block1!.mesh, WorldRenderer.block1!.matrices.length)
                StoneBatch.flush()
                TaperedBlockBatch.flush()
                MasonryBatch.flush()
                ArchedMasonryBatch.flush()
                biomes.renderTerrain(specimen?.footprints, specimen?.snowFootprints)
                if (specimen) biomes.labelPlots(specimen.labels)
                else {
                    for (const {prefab} of [TaperedBlockBatch, MasonryBatch, ArchedMasonryBatch]) batches.add(prefab!)
                    const counts = countStaticPlotTriangles(biomes.slots, batches)
                    biomes.labelPlots(counts.map(count => (isStoneWall ? 'Sestava · ' : '') + count.toLocaleString('cs-CZ') + ' △'))
                }
                if (specimen) {
                    biomes.frame(specimen.height * .46, Math.min(18, Math.max(8, specimen.height * 1.87, specimen.width * 4.15)),
                        reset || specimen.recenter)
                } else if (obj?.type === 281) {
                    biomes.frame(1.6, 9, reset, obj.renderPosition.x - obj.position.x, obj.renderPosition.z - obj.position.z)
                } else if (isStoneWall) {
                    biomes.frame(0.65, 12, reset, wallAlongX ? -1 : -2, wallAlongX ? -2 : -1)
                } else {
                    biomes.frame(0.65, 7, reset)
                }
            } else if (tab === 'Buildings') {
                BuildingManager.addBuilding({...data, id: 1, tp: id, x: 0, z: 0})
                const b = BuildingManager.buildings.get(1)!
                b.shouldOcclusionFade = true
                b.setVisible(true)
                refreshBuildingBatches()
                b.roofMesh.setEnabled(roof.checked)
                camera.target.set(2, 1, 1); camera.radius = 12
            } else {
                const type = Object.values(MonsterTypes).find(v => v.id === id)!
                if (!MonsterLoader.monsterTemplates.has(type.templateId)) await MonsterLoader.loadMonsterMesh(Object.values(MonsterTemplates).find(v => v.id === type.templateId)!)
                if (current !== generation) return
                monster = new MonsterModel(type, {id: -1, pos: Vector3.Zero(), getModelHeight: () => type.boxHeight} as unknown as Monster)
                monster.initializeModel()
                monster.node.parent = parent
                monster.node.setEnabled(true)
                clips = [['Idle', monster.idleAnim], ['Walk', monster.walkAnim], ...monster.attackAnims.map((a, i) => ['Attack ' + (i + 1), a]), ['Bow', monster.attackBowAnim], ['Death', monster.deadAnim]].filter(v => v[1] != null) as [string, MeshAnimation][]
                animation.replaceChildren(...clips.map(([name], i) => new Option(name, String(i))))
                weapon.disabled = !monster.rhandBone
                weapon.value = String(monster.type.weapon?.ids[0] ?? '')
                equipmentEditor.refresh(monster)
                play()
                camera.target.set(0, 1, 0); camera.radius = 5
            }
            if (tab !== 'Statics') centerRotation(tab === 'Buildings' ? camera.target.x : 0, tab === 'Buildings' ? camera.target.z : 0)
        } catch (e) { error.textContent = String(e); console.error(e) }
    }
    const list = (restore = false) => {
        choice.replaceChildren(...entries().filter(v => (v.name + ' ' + v.id).toLowerCase().includes(search.value.toLowerCase()))
            .map(v => new Option(v.id.startsWith('lowpoly:') ? v.name : v.id + ' · ' + v.name, v.id)))
        if (restore && saved.tab === tab && Array.from(choice.options).some(o => o.value === saved.choice)) choice.value = saved.choice!
        void show(true)
    }
    for (const name of ['Postava', 'Statics', 'Buildings', 'Monsters', 'Terrain']) {
        const button = document.createElement('button')
        button.textContent = name
        button.onclick = () => {
            tab = name; clear()
            const character = getCharacter()
            character.node.setEnabled(name === 'Postava')
            character.equipSet.forEach(item => { if (name !== 'Postava') EquipManager.removeEquippedItem(item); else EquipManager.addEquippedItem(item) })
            characterControls.hidden = name !== 'Postava'; controls.hidden = name === 'Postava' || name === 'Terrain'
            tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)))
            roof.parentElement!.hidden = name !== 'Buildings'
            get('assetMotion').hidden = name !== 'Monsters'
            get('assetApply').hidden = name === 'Monsters'
            parameters.readOnly = name === 'Monsters'
            search.value = ''
            if (name !== 'Statics') biomes.setActive(false)
            terrain.setActive(name === 'Terrain')
            if (name === 'Statics') biomes.setActive(true)
            rotationControl.hidden = name === 'Terrain' || name === 'Statics'
            hint.textContent = name === 'Terrain' ? 'Pravým tlačítkem posouvej · kolečkem přibližuj' : assetHint
            if (controls.hidden) localStorage.setItem(storageKey, JSON.stringify({tab: name}))
            else list(true)
            if (name === 'Postava') {camera.target.set(0, 1.05, 0); camera.radius = 3.45; centerRotation()}
        }
        button.setAttribute('aria-pressed', String(name === tab))
        tabs.append(button)
    }
    clear()
    camera.upperRadiusLimit = 40
    search.oninput = () => list()
    choice.onchange = () => void show(true)
    get('assetApply').onclick = () => void show(false)
    roof.onchange = () => BuildingManager.buildings.forEach(b => b.roofMesh.setEnabled(roof.checked))
    animation.onchange = play; loop.onchange = play; get('assetPlay').onclick = play; weapon.onchange = updateWeapon
    const savedTab = Array.from(tabs.querySelectorAll('button')).find(b => b.textContent === saved.tab)
    savedTab?.click()
    scene.onBeforeRenderObservable.add(() => {
        if (!monster) return
        Renderer.animationSpeedRatio = Math.min(scene.getEngine().getDeltaTime(), 100) / (1000 / 60)
        clips.forEach(([, clip]) => clip.onAnimFrame())
        monster.mesh.computeWorldMatrix(true)
        monster.worldMatrix.copyFrom(monster.mesh.getWorldMatrix())
        monster.worldMatrix.decompose(undefined, monster.rotationQuaternion, undefined)
        monster.equipSet.forEach(item => item.onFrame())
    })
}

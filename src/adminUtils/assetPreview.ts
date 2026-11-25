import monsterNames from 'virtual:admin-monster-names'
import { createMonsterEquipmentEditor } from './monsterEquipmentEditor'
import { SpecimenPrefabs } from '@/babylon/world/statics/objects/specimens'
import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core'
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
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { StaticObjectsCodebook } from '@/babylon/world/statics/staticsCodebook'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { StaticEquipPartsRenderer } from '@/babylon/world/statics/staticEquipPartsRenderer'
import { StaticLeafPlanes } from '@/babylon/world/statics/staticLeafPlanes'
import { EquipManager } from '@/babylon/item/equipManager'
import { WeaponModelsCb } from '@/babylon/item/codebook/weaponModelsCb'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import type { MeshAnimation } from '@/babylon/animations/animation'
import { createTerrainPreview } from './terrainPreview'
import { createStaticBiomePreview } from './staticBiomePreview'
import { createSnowCoverMask } from '@/babylon/world/snowCoverMask'
import { Settings } from '@/settings/settings'

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
    // MyPlayer.worldId defaults to zero in the offline bootstrap.
    const { MyPlayer } = await import('@/data/myPlayer')
    WorldDataManager.replaceWorldData(MyPlayer.worldId, 64)
    const origin = new MapBlock(0, TerrainEnum1.TERRAIN_ROCK.index)
    origin.computeData()
    WorldDataManager.getBlockMap()[0][0] = origin
    TreeManager.initialize(scene)
    Object.values(TreeManager.prefabs).forEach(prefab => { if (prefab) prefab.mesh.parent = parent })
    StaticsManager.initialize(scene)
    BuildingManager.initialize(scene, parent)
    const buffers = () => [WorldRenderer.block1!, WorldRenderer.blockWithAlpha1!, WorldRenderer.translucentPlane!, StoneBatch.prefab!, StaticLeafPlanes.prefab!, ...Object.values(TreeManager.prefabs).filter(p => p != null), ...StaticEquipPartsRenderer.prefabs.values(), ...SpecimenPrefabs.all]
    const terrain = createTerrainPreview(scene, parent, camera, ground, setTerrainLighting)
    panel.append(terrain.controls)
    const biomes = createStaticBiomePreview(scene, camera, ground, setStaticLighting, () => void show(false))
    controls.prepend(biomes.controls)
    biomes.setActive(false)
    for (const batch of [StoneBatch.prefab!, ...Object.values(TreeManager.prefabs)]) {
        if (batch) Lights.addShadowCaster(batch.mesh, false)
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
        TreeManager.allTrees = []
        TreeManager.collisionGrid.clear()
        BuildingManager.buildings.forEach(b => b.dispose())
        BuildingManager.buildings.clear()
        BuildingManager.floorTiles.clear()
        BuildingManager.collisionTiles.clear()
        refreshBuildingBatches()
        buffers().forEach(b => { b.clearMatrices(); b.setThinInstanceBuffers(); b.mesh.setEnabled(false) })
    }
    const entries = () => tab === 'Statics'
        ? [...Array.from(StaticObjectsCodebook.values(), v => ({ id: String(v.type), name: v.name })), ...Array.from({length: 16}, (_, i) => ({id: 'tree:' + (i + 1), name: ['Oak', 'Pine', 'Birch', 'Willow'][Math.floor(i / 4)] + ' ' + (i % 4 + 1)}))]
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
        if (!choice.value) return
        try {
            const id = Number(choice.value)
            if (reset) parameters.value = JSON.stringify(tab === 'Statics' ? choice.value.startsWith('tree:') ? { size: 1 } : { ...StaticObjectsCodebook.get(id), meta: id === 403 ? { bannerIndex: 0 } : { facing: '+Z' } } : tab === 'Buildings' ? { facing: '+Z', ...(id === 2 ? {width: 5, depth: 3} : {}), doorOpen: false } : { ...Object.values(MonsterTypes).find(v => v.id === id) }, null, 2)
            const data = JSON.parse(parameters.value)
            if (tab === 'Statics') {
                const useContact = !Settings.isDetalLevelLow()
                WorldRenderer.staticTerrainContact = useContact ? staticContact : null
                WorldRenderer.block1!.mesh.material = useContact ? contactMaterial : Materials.blockMat1!
                StoneBatch.setSnowContactEnabled(Settings.isDetalLevelHigh())
                biomes.prepareTerrain()
                const isTree = choice.value.startsWith('tree:')
                for (const {x, z} of biomes.slots) {
                    if (isTree) {
                        TreeManager.addTree({type: Number(choice.value.split(':')[1]), x, z, size: Math.max(0.1, Number(data.size) || 1)})
                        const tree = TreeManager.allTrees.at(-1)!
                        tree.rotation = 0
                        tree.renderTrunk(false, TreeManager.getTrunkContact(tree.position))
                        tree.renderLeaves(false)
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
                    if (staticObject.prefab) batches.add(staticObject.prefab)
                }
                batches.forEach(batch => {
                    batch.setThinInstanceBuffers()
                    batch.mesh.setEnabled(batch.matrices.length > 0)
                })
                WorldRenderer.staticTerrainContact?.upload(WorldRenderer.block1!.mesh, WorldRenderer.block1!.matrices.length)
                StoneBatch.flush()
                biomes.renderTerrain()
                if (obj?.type === 281) {
                    biomes.frame(1.6, 9, reset, obj.renderPosition.x - obj.position.x, obj.renderPosition.z - obj.position.z)
                } else {
                    biomes.frame(isTree ? 2.4 : 0.65, isTree ? 13 : 7, reset)
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
        choice.replaceChildren(...entries().filter(v => (v.name + ' ' + v.id).toLowerCase().includes(search.value.toLowerCase())).map(v => new Option(v.id + ' · ' + v.name, v.id)))
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

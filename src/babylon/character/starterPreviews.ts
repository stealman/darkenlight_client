import {AbstractMesh, Color4, DirectionalLight, FreeCamera, HemisphericLight, Matrix, Quaternion, TransformNode, Vector3} from '@babylonjs/core'
import '@babylonjs/core/Engines/Extensions/engine.views'
import Character from './character'
import {HUMAN_ANIMATION_SPEED} from './humanModelRig'
import {Renderer} from '@/babylon/scene/renderer'
import {EquipManager} from '@/babylon/item/equipManager'
import {Builder} from '@/babylon/builder'
import {Materials, TerrainEnum1} from '@/babylon/materials'
import {FoliageManager} from '@/babylon/world/foliageManager'
import {updateWorldInstanceBuffers} from '@/babylon/world/worldInstanceBuffers'
import {getStarterEquipment} from '@game/character/starterEquipment'

/** Live Babylon views share the already loaded runtime models and equipment. */
export async function startStarterPreviews(canvases: HTMLCanvasElement[], signal: AbortSignal, activeClass: () => string | null): Promise<void> {
    if (signal.aborted) return
    const classKeys = ['FIGHTER', 'MYSTIC'] as const
    const scene = Renderer.scene
    Renderer.menuPreviewSceneUsed = true
    const engine = Renderer.engine!
    const originalCamera = scene.activeCamera
    const originalClear = scene.clearColor
    const originalAutoClear = scene.autoClear
    const originalDepthClear = scene.autoClearDepthAndStencil
    const originalSize = {width: engine.getRenderWidth(), height: engine.getRenderHeight()}
    const previewMask = 0x10000000
    const layers = new Map<AbstractMesh, number>()
    const characters: Character[] = []
    const cameras: FreeCamera[] = []
    const platformRoot = new TransformNode('starterPreviewPlatforms', scene)
    const platforms = Builder.createBlockWithFaces(scene, platformRoot)
    platforms.material = Materials.terrainMaterial
    platforms.layerMask = previewMask
    platforms.isPickable = false
    updateWorldInstanceBuffers(platforms, [Matrix.Identity(), Matrix.Translation(10, 0, 0)],
        [TerrainEnum1.TERRAIN_SNOW_GRASS.uv, TerrainEnum1.TERRAIN_SNOW_GRASS.uv])
    const foliage = FoliageManager.createFoliageMesh(scene, platformRoot)
    foliage.material = FoliageManager.foliageMaterial
    foliage.layerMask = previewMask
    foliage.isPickable = false
    const snowFoliage = FoliageManager.GENERATE_ON_TERRAINS.find(config => config.terrain === TerrainEnum1.TERRAIN_SNOW_GRASS)!
    const foliageMatrices: Matrix[] = []
    const foliageUvs = []
    const seed = Math.floor(Math.random() * 1000000)
    for (let block = 0; block < classKeys.length; block++) {
        for (let clump = 0; clump < 2; clump++) {
            const x = seed + block * 2 + clump
            const type = FoliageManager.getFoliageType(x, 0)
            const offset = FoliageManager.getOffset(x, 0, type)
            // Keep the clumps to either side of the character's feet.
            offset.x = block * 10 + (clump === 0 ? -0.33 : 0.33)
            foliageMatrices.push(Matrix.Compose(FoliageManager.getScale(x, 0, type),
                Quaternion.RotationYawPitchRoll(FoliageManager.getRotation(x, 0, type), 0, 0), offset))
            foliageUvs.push(FoliageManager.getAtlasOffset(x, 0, snowFoliage.rowIndex))
        }
    }
    updateWorldInstanceBuffers(foliage, foliageMatrices, foliageUvs)
    const originalLights = scene.lights.map(light => ({light, enabled: light.isEnabled()}))
    originalLights.forEach(({light}) => light.setEnabled(false))
    const fill = new HemisphericLight('starterPreviewFill', Vector3.Up(), scene)
    fill.intensity = 0.35
    const light = new DirectionalLight('starterPreviewKey', new Vector3(-0.4, -1, 0.6), scene)
    light.intensity = 0.95
    const include = (mesh: AbstractMesh) => {
        if (!layers.has(mesh)) layers.set(mesh, mesh.layerMask)
        mesh.layerMask = previewMask
    }
    let previousActive: string | null = null
    const render = () => {
        if (signal.aborted) return
        const active = activeClass()
        const enteredFighter = active === 'FIGHTER' && previousActive !== active
        previousActive = active
        const viewIndex = cameras.indexOf(scene.activeCamera as FreeCamera)
        light.intensity = active === classKeys[viewIndex] ? 1.65 : 0.95
        for (const [index, character] of characters.entries()) {
            const model = character.model!
            const highlighted = active === classKeys[index]
            const combatIdle = character.getWeapon()?.handsRequired === 2 ? model.combatIdleTwoHandedAnim : model.combatIdleAnim
            if (index === 0 && enteredFighter) {
                const attacks = [model.slashAnim, model.slashAnim2, model.rightSlashAnim, model.jabAnim, model.highJabAnim]
                    .filter(animation => animation != null)
                const attack = attacks[Math.floor(Math.random() * attacks.length)]
                if (attack) {
                    model.transitionToAnimation(attack, 0.15, false, 1)
                    model.actualAnim = attack
                }
            }
            const playingAttack = model.actualAnim !== model.idleAnim && model.actualAnim !== combatIdle
                && (model.actualAnim?.isPlaying || model.animTransition != null)
            if (index === 0 && highlighted && playingAttack) continue
            const animation = highlighted ? combatIdle : model.idleAnim
            if (animation && model.actualAnim !== animation) {
                model.transitionToAnimation(animation, 0.2, true,
                    highlighted ? HUMAN_ANIMATION_SPEED.combatIdle : HUMAN_ANIMATION_SPEED.idle)
                model.actualAnim = animation
            }
        }
        // Animate once per view; equipment matrices follow the animated bones.
        scene.onAfterAnimationsObservable.addOnce(() => {
            for (const character of characters) {
                character.model!.model!.computeWorldMatrix(true)
                character.model!.skeleton!.prepare()
                character.model!.onFrame(Math.min(engine.getDeltaTime(), 50) / 1000 / canvases.length)
            }
            EquipManager.onFrame()
        })
        scene.render()
    }
    const cleanup = () => {
        engine.stopRenderLoop(render)
        for (const canvas of canvases) engine.unRegisterView(canvas)
        for (const character of characters) character.model?.removeFromScene()
        EquipManager.onFrame()
        layers.forEach((mask, mesh) => { if (!mesh.isDisposed()) mesh.layerMask = mask })
        cameras.forEach(camera => camera.dispose())
        platformRoot.dispose()
        light.dispose()
        fill.dispose()
        originalLights.forEach(({light, enabled}) => light.setEnabled(enabled))
        scene.activeCamera = originalCamera
        scene.clearColor = originalClear
        scene.autoClear = originalAutoClear
        scene.autoClearDepthAndStencil = originalDepthClear
        engine.setSize(originalSize.width, originalSize.height)
    }
    signal.addEventListener('abort', cleanup, {once: true})
    try {
        for (const [index, classKey] of classKeys.entries()) {
            if (signal.aborted) return
            const equipSet: Record<string, unknown> = {}
            for (const {slot, cbType, cb} of getStarterEquipment(classKey)) {
                equipSet[slot] = {id: -1, cb: cb.id, tp: cbType, mId: cb.modelId, matId: cb.materialId,
                    img: cb.url, atts: new Map(), slot: cbType === 'W' ? 'R_HAND' : cb.slot}
            }
            const position = new Vector3(index * 10, 0, 0)
            const character = new Character({id: -9001-index, name: '', x: position.x, z: 0, bsz: 0.8, cls: classKey, equipSet}, false, position)
            characters.push(character)
            await character.createModel(true)
            if (signal.aborted) { character.model?.removeFromScene(); return }
            const model = character.model!
            await model.addToView()
            model.model!.getChildMeshes().forEach(include)
            model.equipSet.forEach(item => { if (item.type.mesh) include(item.type.mesh) })
            const camera = new FreeCamera('starterPreviewCamera'+index, position.add(new Vector3(3, 2.4, -5)), scene)
            camera.setTarget(position.add(new Vector3(0, 0.55, 0)))
            model.model!.rotation.y = Math.atan2(position.z - camera.position.z, camera.position.x - position.x)
            camera.fov = 0.6
            camera.layerMask = previewMask
            cameras.push(camera)
        }
        if (signal.aborted) return
        scene.clearColor = new Color4(0, 0, 0, 0)
        scene.autoClear = true
        scene.autoClearDepthAndStencil = true
        canvases.forEach((canvas, index) => engine.registerView(canvas, cameras[index], true))
        engine.runRenderLoop(render)
    } catch (error) {
        signal.removeEventListener('abort', cleanup)
        cleanup()
        throw error
    }
}

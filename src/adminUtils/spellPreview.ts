import '@babylonjs/loaders/glTF'
import {
    ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine, HemisphericLight,
    MeshBuilder, PBRMaterial, Scene, SceneLoader, StandardMaterial, Texture, TransformNode, Vector3,
} from '@babylonjs/core'
import { MagicArrow } from '@game/game/spells/magicArrow'
import { MAGIC_ARROW_DETAILS, MagicArrowEffect, setMagicArrowGlowEnabled } from '@/babylon/gfx/magicArrowEffect'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { createPreviewCharacter, getEquipmentPreviewGender } from './previewCharacter'
import './styles.css'

const STAGE_LABELS = {charge: 'Sesílání', flight: 'Let šípu', impact: 'Dopad'}
const SPELL_PREVIEW_STORAGE_KEY = 'darkenlight.adminUtils.spellPreview'

function createArena(scene: Scene) {
    const floor = MeshBuilder.CreateGround('spellArena', {width: 36, height: 30}, scene)
    const texture = new DynamicTexture('spellArenaSlate', 256, scene, true, Texture.TRILINEAR_SAMPLINGMODE)
    const ctx = texture.getContext()
    ctx.fillStyle = '#1c2428'
    ctx.fillRect(0, 0, 256, 256)
    const slate = ctx.createLinearGradient(0, 0, 210, 256)
    slate.addColorStop(0, '#525c5c')
    slate.addColorStop(0.5, '#414c4e')
    slate.addColorStop(1, '#313b41')
    ctx.fillStyle = slate
    ctx.fillRect(4, 4, 248, 248)
    ctx.fillStyle = 'rgba(178, 200, 199, .13)'
    ctx.fillRect(4, 4, 248, 2)
    ctx.fillRect(4, 4, 2, 248)
    for (let i = 0; i < 1600; i++) {
        const x = 4 + (i * 1723 % 248)
        const y = 4 + (i * i * 41 % 248)
        ctx.fillStyle = i % 3 === 0 ? 'rgba(157, 170, 163, .08)' : 'rgba(15, 26, 30, .1)'
        ctx.fillRect(x, y, 1 + i % 4, 1 + i % 3)
    }
    texture.update()
    texture.uScale = 36
    texture.vScale = 30
    texture.anisotropicFilteringLevel = 8
    const material = new StandardMaterial('spellArenaSlate', scene)
    material.diffuseTexture = texture
    material.specularColor.setAll(0.05)
    floor.material = material
    const joints: Vector3[][] = []
    for (let tile = -7; tile <= 7; tile++) {
        joints.push([new Vector3(tile, 0.005, -7), new Vector3(tile, 0.005, 7)])
        joints.push([new Vector3(-7, 0.005, tile), new Vector3(7, 0.005, tile)])
    }
    const seams = MeshBuilder.CreateLineSystem('spellArenaSeams', {lines: joints}, scene)
    seams.color = new Color3(0.44, 0.55, 0.56)
    seams.alpha = 0.14
    seams.isPickable = false

    const shadow = new DynamicTexture('spellArenaContact', 64, scene, false, Texture.BILINEAR_SAMPLINGMODE)
    const shadowContext = shadow.getContext()
    const fade = shadowContext.createRadialGradient(32, 32, 2, 32, 32, 31)
    fade.addColorStop(0, 'rgba(5, 10, 15, .72)')
    fade.addColorStop(0.48, 'rgba(5, 10, 15, .48)')
    fade.addColorStop(1, 'rgba(5, 10, 15, 0)')
    shadowContext.fillStyle = fade
    shadowContext.fillRect(0, 0, 64, 64)
    shadow.hasAlpha = true
    shadow.update()
    const contact = new StandardMaterial('spellArenaContact', scene)
    contact.diffuseTexture = shadow
    contact.useAlphaFromDiffuseTexture = true
    contact.disableLighting = true
    contact.emissiveColor.setAll(0.16)
    const casterShadow = MeshBuilder.CreateGround('casterContact', {width: 1.46, height: 1.22}, scene)
    const targetShadow = MeshBuilder.CreateGround('targetContact', {width: 1.29, height: 1.15}, scene)
    casterShadow.material = targetShadow.material = contact
    casterShadow.position.set(-2, 0.012, 0)
    targetShadow.position.set(2, 0.012, 0)
    return targetShadow
}

async function createSkeleton(scene: Scene) {
    const model = await SceneLoader.ImportMeshAsync('', '', modelAssetUrl('/models/monsters/skeleton.gltf'), scene)
    const skeleton = model.meshes[0]
    skeleton.scaling.setAll(0.4)
    skeleton.rotation.set(0, Math.PI, 0)
    skeleton.rotationQuaternion = null
    const material = new PBRMaterial('spellTargetBones', scene)
    material.albedoTexture = new Texture('/models/monsters/skeleton.png', scene, {invertY: false})
    material.metallic = 0
    material.roughness = 0.87
    skeleton.getChildMeshes().forEach(mesh => { mesh.material = material })
    const idle = model.animationGroups[0]
    idle?.start(true)
    idle?.pause()
    idle?.goToFrame(12)
    return skeleton
}

export async function mountSpellPreview() {
    const root = document.querySelector<HTMLElement>('#appWrapper')!
    root.innerHTML = `
        <main class="admin-utils admin-utils--spells">
            <section class="admin-utils__viewport">
                <canvas id="adminUtilsCanvas" aria-label="Náhled kouzla na kostlivci"></canvas>
                <div class="admin-utils__hint">Tažením otáčej · kolečkem přibližuj</div>
                <div id="spellPreviewStatus" class="admin-utils__status" role="status">Načítám modely…</div>
            </section>
            <aside class="admin-utils__panel">
                <header>
                    <p class="admin-utils__eyebrow">Darkenlight · Admin Utils</p>
                    <h1>Kouzla</h1>
                    <nav class="admin-utils__nav" aria-label="Admin Utils">
                        <a href="/adminUtils">Výbava</a>
                        <a href="/adminUtils/gui">GUI</a>
                        <a href="/adminUtils/spells" aria-current="page">Kouzla</a>
                    </nav>
                </header>
                <div class="spell-preview__spell">
                    <img src="/images/icons/buttons/btn_magic_arrow.png" alt="">
                    <div><h2>Magický šíp</h2><p>Magic Arrow</p></div>
                </div>
                <dl class="spell-preview__stats">
                    <div><dt>Mana</dt><dd>${MagicArrow.manaCost}</dd></div>
                    <div><dt>Poškození</dt><dd>${MagicArrow.damage}</dd></div>
                    <div><dt>Sesílání</dt><dd>${(MagicArrow.castDuration / 1000).toLocaleString('cs')} s</dd></div>
                    <div><dt>Cooldown</dt><dd>${(MagicArrow.cooldown / 1000).toLocaleString('cs')} s</dd></div>
                    <div><dt>Dosah</dt><dd>${MagicArrow.range} polí</dd></div>
                </dl>
                <div class="admin-utils__controls">
                    <label class="admin-utils__field">
                        <span>Grafické detaily</span>
                        <select id="spellPreviewDetail" disabled>
                            ${MAGIC_ARROW_DETAILS.map(detail => `<option${detail === 'MEDIUM' ? ' selected' : ''}>${detail}</option>`).join('')}
                        </select>
                    </label>
                    <label class="admin-utils__field">
                        <span>Vzdálenost cíle <output id="spellPreviewDistanceValue">4 pole</output></span>
                        <input id="spellPreviewDistance" type="range" min="2" max="${MagicArrow.range}" value="4" step="0.5" disabled>
                    </label>
                    <label class="admin-utils__field">
                        <span>Rychlost náhledu</span>
                        <select id="spellPreviewSpeed" disabled>
                            <option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option>
                        </select>
                    </label>
                    <label class="spell-preview__glow-toggle">
                        <input id="spellPreviewGlow" type="checkbox" checked> Glow
                    </label>
                    <button type="button" id="spellPreviewCast" disabled>Seslat kouzlo</button>
                </div>
                <a class="admin-utils__back" href="/">← Zpět do hry</a>
            </aside>
        </main>`

    const canvas = root.querySelector<HTMLCanvasElement>('canvas')!
    const status = root.querySelector<HTMLElement>('#spellPreviewStatus')!
    const cast = root.querySelector<HTMLButtonElement>('#spellPreviewCast')!
    const distance = root.querySelector<HTMLInputElement>('#spellPreviewDistance')!
    const distanceValue = root.querySelector<HTMLOutputElement>('#spellPreviewDistanceValue')!
    const speed = root.querySelector<HTMLSelectElement>('#spellPreviewSpeed')!
    const detail = root.querySelector<HTMLSelectElement>('#spellPreviewDetail')!
    const glowToggle = root.querySelector<HTMLInputElement>('#spellPreviewGlow')!
    try {
        const saved = JSON.parse(localStorage.getItem(SPELL_PREVIEW_STORAGE_KEY) ?? 'null')
        if (Number.isFinite(saved?.distance)) distance.valueAsNumber = saved.distance
        if (Array.from(speed.options).some(option => option.value === saved?.speed)) speed.value = saved.speed
        if (Array.from(detail.options).some(option => option.value === saved?.detail)) detail.value = saved.detail
        if (typeof saved?.glow === 'boolean') glowToggle.checked = saved.glow
    } catch {
        // Keep the preview usable if browser storage is unavailable.
    }
    const saveSettings = () => {
        try {
            localStorage.setItem(SPELL_PREVIEW_STORAGE_KEY, JSON.stringify({
                distance: distance.valueAsNumber, speed: speed.value, detail: detail.value, glow: glowToggle.checked,
            }))
        } catch {
            // The current controls still work without storage.
        }
    }
    distance.addEventListener('input', saveSettings)
    speed.addEventListener('change', saveSettings)
    detail.addEventListener('change', saveSettings)
    const engine = new Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true})
    const scene = new Scene(engine)
    setMagicArrowGlowEnabled(scene, glowToggle.checked)
    let effect: MagicArrowEffect | null = null
    glowToggle.addEventListener('change', () => {
        setMagicArrowGlowEnabled(scene, glowToggle.checked)
        saveSettings()
    })
    scene.clearColor = new Color4(0.029, 0.051, 0.07, 1)
    const resize = new ResizeObserver(() => engine.resize())
    resize.observe(canvas)
    window.addEventListener('pagehide', () => {
        resize.disconnect()
        engine.dispose()
    }, {once: true})

    // Set the scene before loading game model modules. The preview never starts a transport.
    const {Renderer} = await import('@/babylon/scene/renderer')
    Renderer.scene = scene
    const [{CharacterModel}, {EquipManager}, {WeaponsCbManager, WeaponModelsCb}, {ArmorModelsCb},
        {Lights}, {Materials}] = await Promise.all([
        import('@/babylon/character/characterModel'), import('@/babylon/item/equipManager'),
        import('@/babylon/item/codebook/weaponModelsCb'), import('@/babylon/item/codebook/armorsModelsCb'),
        import('@/babylon/scene/lights'), import('@/babylon/materials'),
    ])
    const camera = new ArcRotateCamera('spellPreviewCamera', -1.69, 1.21, 7.9, new Vector3(0, 0.93, 0), scene)
    camera.lowerRadiusLimit = 3.6
    camera.upperRadiusLimit = 14
    camera.lowerBetaLimit = 0.45
    camera.upperBetaLimit = 1.55
    camera.panningSensibility = 0
    camera.wheelPrecision = 55
    camera.fov = 0.68
    camera.attachControl(canvas, true)
    Lights.initialize(scene)
    Materials.initialize(scene)
    Lights.synchronizeDayNightCycle({phase: 0.5, day: 1, cycleDurationMs: Lights.dayNightCycleDurationMs, paused: true})
    Lights.sunLight.intensity = 1.45
    const fill = new HemisphericLight('spellPreviewFill', Vector3.Up(), scene)
    fill.diffuse = new Color3(0.72, 0.83, 1)
    fill.groundColor = new Color3(0.21, 0.26, 0.29)
    fill.intensity = 0.8
    const rim = new DirectionalLight('spellPreviewRim', new Vector3(0.25, -0.43, -0.8), scene)
    rim.diffuse = new Color3(0.5, 0.82, 1)
    rim.intensity = 1.3
    const targetContact = createArena(scene)
    const [, , skeleton] = await Promise.all([
        WeaponsCbManager.initCrystalWand(EquipManager.itemTypes, scene),
        EquipManager.initializeArmors(scene),
        createSkeleton(scene),
    ])
    const actor = createPreviewCharacter(getEquipmentPreviewGender())
    actor.pos.set(-2, 0, 0)
    actor.getLookAngle = () => -Math.PI / 4
    actor.isRecentlyInCombat = () => true
    const model = await CharacterModel.create(actor, true)
    model.resolveModelRotation(1)
    model.assignWeapon(WeaponModelsCb.CRYSTALWAND.id, 0)
    model.assignArmor(ArmorModelsCb.LEATHER_ARMOR_MALE.id, 0)
    model.assignLeftPauldron(ArmorModelsCb.LEATHER_PAULDRONS.id, 0)
    model.assignRightPauldron(ArmorModelsCb.LEATHER_PAULDRONS.id, 0)
    model.assignLeftLeg(ArmorModelsCb.LEATHER_GREAVES.id, 0)
    model.assignRightLeg(ArmorModelsCb.LEATHER_GREAVES.id, 0)
    model.stopAnimation()

    const target = new TransformNode('spellTarget', scene)
    skeleton.parent = target
    const impactAt = new Vector3(2, 1.18, 0)
    const updateDistance = () => {
        const tiles = distance.valueAsNumber
        target.position.x = actor.pos.x + tiles
        targetContact.position.x = impactAt.x = target.position.x
        distanceValue.value = `${tiles.toLocaleString('cs')} ${Number.isInteger(tiles) && tiles >= 5 ? 'polí' : 'pole'}`
    }
    updateDistance()
    distance.addEventListener('input', updateDistance)
    let releaseAt = 0
    let recoilStartedAt = 0
    let playbackSpeed = 1
    let lastPhase = ''
    cast.disabled = distance.disabled = speed.disabled = detail.disabled = false
    status.textContent = 'Připraveno'
    cast.addEventListener('click', () => {
        effect?.dispose()
        playbackSpeed = Number(speed.value)
        recoilStartedAt = 0
        lastPhase = ''
        model.finishSpellStance()
        model.updateSpellStance(0, playbackSpeed)
        effect = new MagicArrowEffect(scene, (feet, crystal) => {
            feet.copyFrom(actor.pos)
            model.getSpellOriginToRef(feet, crystal)
        }, MAGIC_ARROW_DETAILS[detail.selectedIndex], playbackSpeed)
        releaseAt = performance.now() + MagicArrow.castDuration / playbackSpeed
        distance.disabled = speed.disabled = detail.disabled = true
    })

    engine.runRenderLoop(() => {
        const now = performance.now()
        model.skeleton?.prepare()
        model.onFrame(Math.min(0.05, engine.getDeltaTime() / 1000))
        EquipManager.onFrame()
        if (effect?.phase === 'charge') {
            if (now >= releaseAt) {
                model.releaseSpellStance(playbackSpeed)
                effect.release(impactAt)
            } else {
                model.updateSpellStance(MagicArrow.castDuration - (releaseAt - now) * playbackSpeed, playbackSpeed)
            }
        } else {
            model.stopAnimation()
        }
        if (recoilStartedAt) {
            const recoil = Math.min(1, (now - recoilStartedAt) * playbackSpeed / 350)
            target.rotation.z = -0.13 * Math.sin(Math.PI * recoil)
        } else target.rotation.z = 0
        scene.render()
        if (!effect) return
        if (effect.isDisposed) {
            effect = null
            lastPhase = ''
            status.textContent = 'Připraveno'
            distance.disabled = speed.disabled = detail.disabled = false
        } else if (lastPhase !== effect.phase) {
            lastPhase = effect.phase
            status.textContent = STAGE_LABELS[effect.phase]
            if (effect.phase === 'impact') recoilStartedAt = now
        }
    })
}

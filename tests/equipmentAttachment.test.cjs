const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function loadEquipment(core) {
    const source = readFileSync(join(__dirname, '../src/babylon/item/equipManager.ts'), 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    const exports = {}
    new Function('exports', 'require', compiled)(exports, name => name === '@babylonjs/core' ? core : {})
    return exports
}

function near(actual, expected, message) {
    assert.ok(actual.subtract(expected).length() < 0.0001,
        `${message}: ${actual.asArray()} != ${expected.asArray()}`)
}

test('monster weapon offsets follow the animated hand while preserving rest-pose placement', async () => {
    const core = await import('@babylonjs/core/index.js')
    await import('@babylonjs/loaders/glTF/index.js')
    const {EquipItem} = loadEquipment(core)
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    try {
        for (const [name, scale, offsets] of [
            // Include the zero offset used by skeleton weapons.
            ['kobold', 0.46, [[-0.15, -0.12, -0.03], [-0.2, -0.05, -0.03], [0, 0, 0]]],
        ]) {
            const data = readFileSync(join(__dirname, `../public/models/monsters/${name}.gltf`), 'utf8')
            const container = await core.SceneLoader.LoadAssetContainerAsync('', `data:${data}`, scene, undefined, '.gltf')
            container.animationGroups[0].pause()
            const entries = container.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
            const root = entries.rootNodes[0]
            root.scaling.setAll(scale)
            root.rotation = core.Vector3.Zero()
            root.position.set(3, 2, -5)
            root.rotation.y = 0.7
            const skeleton = entries.skeletons[0]
            const mesh = root.getChildMeshes().find(mesh => mesh.skeleton === skeleton)
            const bone = skeleton.bones.find(bone => bone.id === 'Bone.009')
            const animation = entries.animationGroups[0]
            const parent = {worldMatrix: core.Matrix.Identity(), rotationQuaternion: core.Quaternion.Identity()}
            const update = () => {
                scene.incrementRenderId()
                mesh.computeWorldMatrix(true)
                skeleton.prepare()
                parent.worldMatrix.copyFrom(mesh.getWorldMatrix())
                parent.worldMatrix.decompose(undefined, parent.rotationQuaternion)
            }
            update()
            const type = {cbData: {matCols: 1, matRows: 1, resolveMaterialAtlasIndex: () => 0}}
            const makeItem = offset => new EquipItem(type, 0, parent, bone, core.Vector3.One(),
                new core.Vector3(Math.PI, 0, Math.PI), core.Vector3.FromArray(offset))
            const items = offsets.map(makeItem)
            const handWorld = () => bone.getFinalMatrix().multiply(parent.worldMatrix)
            const restWorld = handWorld()
            const localGrips = items.map(item => {
                item.onFrame()
                const origin = core.Vector3.TransformCoordinates(core.Vector3.Zero(), restWorld)
                const offset = core.Vector3.TransformNormal(item.itemPosition,
                    core.Matrix.Compose(core.Vector3.One(), parent.rotationQuaternion, core.Vector3.Zero()))
                near(item.position, origin.add(offset), `${name}: existing rest-pose offset`)
                return core.Vector3.TransformCoordinates(item.position, restWorld.clone().invert())
            })
            animation.start(true)
            animation.pause()
            for (const frame of [0, 226, 250, 275, 300, 350, 400]) {
                animation.goToFrame(frame)
                update()
                const currentWorld = handWorld()
                items.forEach((item, i) => {
                    item.onFrame()
                    near(core.Vector3.TransformCoordinates(item.position, currentWorld.clone().invert()),
                        localGrips[i], `${name}: grip relative to Bone.009 at frame ${frame}`)
                    // Reused monster clones may already be in an attack pose at attachment time.
                    const reattached = makeItem(offsets[i])
                    reattached.onFrame()
                    near(reattached.position, item.position, `${name}: attaching during animation`)
                })
            }
            animation.dispose()
            root.dispose()
            skeleton.dispose()
            container.dispose()
        }
    } finally {
        engine.dispose()
    }
})

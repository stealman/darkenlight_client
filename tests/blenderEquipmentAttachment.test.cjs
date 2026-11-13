const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

test('Blender chain mail thin instance matches exported geometry and placement throughout animations', async () => {
    const core = await import('@babylonjs/core/index.js')
    await import('@babylonjs/loaders/glTF/index.js')
    const compile = (file, requireModule) => {
        const exports = {}
        const compiled = ts.transpileModule(readFileSync(join(__dirname, '../' + file), 'utf8'), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
        }).outputText
        new Function('exports', 'require', compiled)(exports, requireModule)
        return exports
    }
    const {EquipItem, EquipItemType, EquipManager} = compile('src/babylon/item/equipManager.ts', name => name === '@babylonjs/core' ? core : {})
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const read = name => core.SceneLoader.LoadAssetContainerAsync('',
        `data:;base64,${readFileSync(join(__dirname, '../public/models/steve/' + name)).toString('base64')}`, scene, undefined, '.glb')
    try {
        const reference = await read('chain_mail_attachment_test.glb')
        const importContainer = await read('chain_mail_attachment_test.glb')
        const authored = compile('src/adminUtils/blenderEquipmentAttachment.ts', name => {
            if (name === '@babylonjs/core') return {...core, SceneLoader: {LoadAssetContainerAsync: async () => importContainer}}
            if (name === '@/babylon/modelAssetUrl') return {modelAssetUrl: url => url}
            return {}
        })
        const type = new EquipItemType({id: 2000, matCols: 4, matRows: 4, resolveMaterialAtlasIndex: () => 12})
        const target = core.MeshBuilder.CreateBox('existing-chain-source', {}, scene)
        const material = new core.StandardMaterial('existing-atlas', scene)
        target.material = material
        type.mesh = target
        const otherMesh = core.MeshBuilder.CreateBox('unrelated-equipment', {}, scene)
        const otherPositions = Array.from(otherMesh.getVerticesData('position'))
        await authored.loadBlenderEquipmentAttachment(scene, type, '/models/steve/chain_mail_attachment_test.glb', 'Body')
        assert.equal(type.mesh, target)
        assert.equal(target.material, material)
        assert.deepEqual(Array.from(otherMesh.getVerticesData('position')), otherPositions)
        const rigContainer = await read('human_male_new.glb')
        const entries = rigContainer.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
        const previewRoot = entries.rootNodes[0]
        const referenceRoot = reference.rootNodes[0]
        for (const root of [previewRoot, referenceRoot]) {
            root.scaling.multiplyInPlace(new core.Vector3(0.3, 0.28, 0.3))
            const node = new core.TransformNode('preview-orientation', scene)
            node.rotation.y = Math.PI / 2
            root.parent = node
            node.computeWorldMatrix(true)
        }
        const referenceBody = reference.skeletons[0].bones.find(bone => bone.name === 'Body').getTransformNode()
        const referenceMesh = reference.meshes.find(mesh => mesh.getTotalVertices() > 0 && !mesh.skeleton && mesh.isDescendantOf(referenceBody))
        const bone = entries.skeletons[0].bones.find(bone => bone.name === 'Body')
        const parent = {worldMatrix: core.Matrix.Identity(), rotationQuaternion: core.Quaternion.Identity()}
        const item = new EquipItem(type, 0, parent, bone, null, null, null)
        authored.bindBlenderEquipment(item)
        EquipManager.equippedItems.set(type, new Set([item]))
        type.updateCount(1)
        const previewAnimation = entries.animationGroups[0]
        const referenceAnimation = reference.animationGroups[0]
        for (const animation of [previewAnimation, referenceAnimation]) {
            animation.start(true)
            animation.pause()
        }
        const vertices = target.getVerticesData('position')
        assert.deepEqual(Array.from(vertices), Array.from(referenceMesh.getVerticesData('position')))
        assert.deepEqual(Array.from(target.getVerticesData('uv')), Array.from(referenceMesh.getVerticesData('uv')))
        for (const frame of [0, 30, 75, 100, 150, 200, 250, 275, 350, 425, 450, 480, 525]) {
            previewAnimation.goToFrame(frame)
            referenceAnimation.goToFrame(frame)
            scene.incrementRenderId()
            previewRoot.computeWorldMatrix(true)
            referenceRoot.computeWorldMatrix(true)
            entries.skeletons[0].prepare()
            parent.worldMatrix.copyFrom(previewRoot.getWorldMatrix())
            item.onFrame()
            EquipManager.onFrame()
            const actual = core.Matrix.FromArray(type.instanceBuffer)
            const expected = referenceMesh.computeWorldMatrix(true)
            for (let i = 0; i < vertices.length; i += 3) {
                const vertex = core.Vector3.FromArray(vertices, i)
                assert(core.Vector3.Distance(core.Vector3.TransformCoordinates(vertex, actual),
                    core.Vector3.TransformCoordinates(vertex, expected)) < 0.00001,
                    `Exported chain vertex ${i / 3} matches thin instance at frame ${frame}`)
            }
            assert.equal(target.thinInstanceCount, 1)
        }
        entries.dispose()
        rigContainer.dispose()
        reference.dispose()
    } finally {
        engine.dispose()
    }
})

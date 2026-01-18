import { Color3, Mesh, SceneLoader, StandardMaterial, Texture, Vector3 } from '@babylonjs/core'
import { Renderer } from '@/babylon/scene/renderer'

export const Tester = {
    testDone: false,

    async runTest() {
        if (this.testDone) {
            return
        }
        this.testDone = true
        /**

        const result = await SceneLoader.ImportMeshAsync("", "/models/equip/weapons/", "longsword.glb", Renderer.scene);
        const source = result.meshes[0] as Mesh

        source.position = new Vector3(88, 24, 106)
        source.setEnabled(true)
        source.alwaysSelectAsActiveMesh = true
        source.visibility = 1

        const m = source.getChildMeshes()[0]
        const mat = new StandardMaterial('testStd', Renderer.scene)
        mat.diffuseTexture = new Texture('/models/equip/weapons/longsowrd.png', Renderer.scene)
        mat.diffuseTexture.hasAlpha = false
        mat.diffuseColor = new Color3(1, 1, 1)
        mat.emissiveColor = new Color3(1, 1, 1)

        m.material = mat


        const tex = mat.diffuseTexture as Texture
        tex.vScale = -1      // 1 řádek, ale invertovaný*/

    }
}

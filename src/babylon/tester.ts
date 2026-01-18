
export const Tester = {
    testDone: false,

    async runTest() {
        if (this.testDone) {
            return
        }
        this.testDone = true

        /**
        const result = await SceneLoader.ImportMeshAsync("", "/models/equip/weapons/", "bow.glb", Renderer.scene);
        const source = result.meshes[0] as Mesh

        source.position = new Vector3(108, 8, 176)
        source.setEnabled(true)
        source.alwaysSelectAsActiveMesh = true
        source.visibility = 1

        const m = source.getChildMeshes()[0]
        const mat = new StandardMaterial('testStd', Renderer.scene)
        mat.diffuseTexture = new Texture('/models/equip/weapons/bow.png', Renderer.scene)
        mat.diffuseTexture.hasAlpha = false
        mat.diffuseColor = new Color3(1, 1, 1)
        mat.emissiveColor = new Color3(1, 1, 1)

        m.material = mat


        const tex = mat.diffuseTexture as Texture
        tex.uScale = 0.5      // 1 / 2 sloupce
        tex.vScale = -1      // 1 řádek, ale invertovaný

        tex.uOffset = 0.5    // druhý sloupec (index 1)
        tex.vOffset = 1*/

    }
}

import {
    AbstractMesh,
    Color3,
    DirectionalLight,
    Mesh,
    Scene,
    ShadowGenerator,
    Vector3,
} from '@babylonjs/core'
import { Settings } from '@/settings/settings'

export const Lights = {
    shadow: {} as ShadowGenerator,
    sunLight: {} as DirectionalLight,

    // glowLayer: null as GlowLayer,

    initialize(scene: Scene) {
        this.sunLight = new DirectionalLight("sunLight", new Vector3(-0.75, -0.75, 0.3), scene)
        this.sunLight.position = new Vector3(30, 30, 30);
        this.sunLight.intensity = 0.6
        this.sunLight.diffuse = new Color3(1, 0.91, 0.78)
        //this.sunLight.diffuse = new Color3(0.82, 0.91, 1)

        if (Settings.shadows) {

            this.shadow = new ShadowGenerator(4096, this.sunLight, false)
            this.shadow.bias = 0.00001
            this.shadow.setDarkness(0)
            this.shadow.usePoissonSampling = true
            this.shadow.forceBackFacesOnly = true
            //this.shadow.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
        }

        //this.glowLayer = new GlowLayer("hl", this.scene)
        //this.glowLayer.intensity = 0.3
        //this.glowLayer.blurKernelSize = 1
    },

    addShadowCaster(mesh: Mesh | AbstractMesh) {
        if (Settings.shadows) {
            Lights.shadow.addShadowCaster(mesh)
        }
    },
}

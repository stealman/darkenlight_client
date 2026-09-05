import {
    AbstractMesh,
    Color3,
    DirectionalLight,
    Material,
    Mesh,
    Scene,
    ShadowGenerator,
    SpotLight,
    TransformNode,
    Vector3,
} from '@babylonjs/core'
import { Settings } from '@/settings/settings'

export const Lights = {
    shadow: {} as ShadowGenerator,
    sunLight: {} as DirectionalLight,
    personalLight: {} as SpotLight,
    personalShadow: {} as ShadowGenerator,
    indoor: false,

    // glowLayer: null as GlowLayer,

    initialize(scene: Scene) {
        this.sunLight = new DirectionalLight("sunLight", new Vector3(-0.75, -0.75, 0.3), scene)
        this.sunLight.position = new Vector3(30, 30, 30);
        this.sunLight.diffuse = new Color3(1, 0.91, 0.78)
        //this.sunLight.diffuse = new Color3(0.82, 0.91, 1)

        this.personalLight = new SpotLight(
            "personalIndoorLight",
            new Vector3(0, 2.75, 0),
            new Vector3(0, -1, 0),
            Math.PI * 0.96,
            1,
            scene,
        )
        this.personalLight.diffuse = new Color3(1, 0.82, 0.58)
        this.personalLight.specular = new Color3(1, 0.82, 0.58)
        this.personalLight.intensity = 4
        this.personalLight.range = 18

        if (Settings.isShadowsEnabled()) {
            this.shadow = new ShadowGenerator(Settings.detailLevel.shadowQuality == 2 ? 4096 : 2048, this.sunLight, false)
            this.shadow.bias = 0.00001
            this.shadow.setDarkness(0)
            this.shadow.usePoissonSampling = true
            this.shadow.forceBackFacesOnly = true
            //this.shadow.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE

            this.personalShadow = new ShadowGenerator(Settings.detailLevel.shadowQuality == 2 ? 2048 : 1024, this.personalLight, false)
            this.personalShadow.bias = 0.005
            this.personalShadow.setDarkness(0)
            this.personalShadow.usePoissonSampling = true
            this.personalShadow.frustumEdgeFalloff = 0.3
            this.personalLight.shadowMinZ = 0.05
            this.personalLight.shadowMaxZ = 18
        }

        //this.glowLayer = new GlowLayer("hl", this.scene)
        //this.glowLayer.intensity = 0.3
        //this.glowLayer.blurKernelSize = 1

        this.sunLight.setEnabled(!this.indoor)
        this.personalLight.setEnabled(this.indoor)
        this.brightnessChanged()
    },

    attachPersonalLight(parent: TransformNode) {
        this.personalLight.parent = parent
        this.personalLight.position = new Vector3(0, 2.75, 0)
        this.personalLight.direction = new Vector3(0, -1, 0)
    },

    addShadowCaster(mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true) {
        if (Settings.isShadowsEnabled()) {
            Lights.shadow.addShadowCaster(mesh)
            if (castPersonalShadow) {
                Lights.personalShadow.addShadowCaster(mesh)
            }
        }
    },

    removeShadowCaster(mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true) {
        if (Settings.isShadowsEnabled()) {
            Lights.shadow.removeShadowCaster(mesh)
            if (castPersonalShadow) {
                Lights.personalShadow.removeShadowCaster(mesh)
            }
        }
    },

    brightnessChanged() {
        this.sunLight.intensity = this.indoor ? 0 : 0.5 + Settings.brightness * 0.05
    },

    setIndoor(indoor: boolean) {
        this.indoor = indoor
        this.sunLight.setEnabled?.(!indoor)
        this.personalLight.setEnabled?.(indoor)
        this.brightnessChanged()
        this.sunLight.getScene?.().markAllMaterialsAsDirty(Material.LightDirtyFlag)
    }
}

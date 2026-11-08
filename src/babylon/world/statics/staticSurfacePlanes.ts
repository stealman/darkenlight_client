import { Mesh, MeshBuilder, Scene, Vector2 } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Prefab, WorldRenderer } from '../worldRenderer'

// A variant is an atlas cell, never a new mesh or material.
export const StaticSurfaceAtlas = {
    columns: 16,
    rows: 4,
    inscriptions: [new Vector2(0, 2), new Vector2(1, 2), new Vector2(2, 2)],
    portal: new Vector2(0, 1),
    banner(index: number) { return new Vector2(Number.isInteger(index) && index >= 0 && index < 16 ? index : 0, 3) },
}
const scenes = new WeakMap<Scene, Map<boolean, Prefab>>()
export const StaticSurfacePlanes = {
    all: new Set<Prefab>(),
    getPrefab(portal = false): Prefab {
        const parent = WorldRenderer.worldParentNode!
        const scene = parent.getScene()
        let prefabs = scenes.get(scene)
        if (!prefabs) {
            prefabs = new Map()
            scenes.set(scene, prefabs)
            const owned = prefabs
            scene.onDisposeObservable.addOnce(() => owned.forEach(prefab => this.all.delete(prefab)))
        }
        const existing = prefabs.get(portal)
        if (existing) return existing
        const mesh = MeshBuilder.CreatePlane(portal ? 'staticPortalPlanes' : 'staticSurfacePlanes', {
            size: 1, sideOrientation: Mesh.DOUBLESIDE,
        }, scene)
        mesh.parent = parent
        mesh.material = portal ? Materials.entrancePortalMaterial : Materials.staticSurfaceMaterial
        mesh.isPickable = false
        mesh.alwaysSelectAsActiveMesh = true
        mesh.receiveShadows = !portal
        mesh.setEnabled(false)
        const prefab = new Prefab(mesh)
        prefabs.set(portal, prefab)
        this.all.add(prefab)
        if (!portal) Lights.addShadowCaster(mesh, true)
        return prefab
    },
    clear() { this.all.forEach(prefab => prefab.clearMatrices()) },
    flush() {
        this.all.forEach(prefab => {
            prefab.setThinInstanceBuffers()
            prefab.mesh.setEnabled(prefab.matrices.length > 0)
            Lights.registerSharedLightMesh(prefab.mesh)
        })
    },
}

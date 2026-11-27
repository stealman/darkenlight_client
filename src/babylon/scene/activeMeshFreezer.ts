import { Node, Observer, Scene, Skeleton } from '@babylonjs/core'

// Single A/B switch. Change this value and reload the client to compare the
// normal Babylon active-mesh evaluation with the managed frozen list.
export const ACTIVE_MESH_FREEZING_ENABLED = true
const FREEZE_IDLE_MS = 250

export const ActiveMeshFreezer = {
    scene: null as Scene | null,
    running: false,
    frozen: false,
    unfreezeCount: 0,
    dirty: true,
    lastChangeAt: 0,
    viewX: NaN,
    viewY: NaN,
    viewZ: NaN,
    nodeObservers: new Map<Node, Observer<boolean>>(),
    particleSystems: [] as any[],
    particleStartedStates: [] as boolean[],
    activeSkeletons: [] as Skeleton[],
    managedSkeletons: new Set<Skeleton>(),

    initialize(scene: Scene) {
        this.scene = scene
        this.running = false
        this.frozen = false
        this.unfreezeCount = 0
        this.dirty = true
        this.lastChangeAt = 0
        this.viewX = this.viewY = this.viewZ = NaN
        this.nodeObservers.clear()
        this.particleSystems = []
        this.particleStartedStates = []
        this.activeSkeletons = []
        this.managedSkeletons.clear()

        if (!ACTIVE_MESH_FREEZING_ENABLED) {
            return
        }

        scene.meshes.forEach((mesh) => this.observeNode(mesh))
        scene.transformNodes.forEach((node) => this.observeNode(node))

        scene.onNewMeshAddedObservable.add((mesh) => {
            this.observeNode(mesh)
            this.invalidate()
        })
        scene.onMeshRemovedObservable.add(() => this.invalidate())
        scene.onNewTransformNodeAddedObservable.add((node) => {
            this.observeNode(node)
            this.invalidate()
        })
        scene.onTransformNodeRemovedObservable.add(() => this.invalidate())
        scene.onBeforeRenderObservable.add(() => this.beforeRender())
        scene.onBeforeCameraRenderObservable.add(() => this.prepareActiveSkeletons())
        scene.onAfterRenderObservable.add(() => this.afterRender())
    },

    start() {
        if (!ACTIVE_MESH_FREEZING_ENABLED || !this.scene) {
            return
        }
        this.running = true
        this.invalidate()
    },

    invalidate() {
        if (!ACTIVE_MESH_FREEZING_ENABLED) {
            return
        }
        this.dirty = true
        this.lastChangeAt = performance.now()
    },

    updateViewPosition({x, y, z}: {x: number, y: number, z: number}) {
        if (x === this.viewX && y === this.viewY && z === this.viewZ) return
        this.viewX = x
        this.viewY = y
        this.viewZ = z
        this.invalidate()
    },

    setSkeletonActive(skeleton: Skeleton | undefined, active: boolean) {
        if (!ACTIVE_MESH_FREEZING_ENABLED || !skeleton) {
            return
        }
        if (active) {
            this.managedSkeletons.add(skeleton)
        } else {
            this.managedSkeletons.delete(skeleton)
        }
        this.invalidate()
    },

    observeNode(node: Node) {
        if (this.nodeObservers.has(node)) {
            return
        }
        const observer = node.onEnabledStateChangedObservable.add(() => this.invalidate())
        if (observer) {
            this.nodeObservers.set(node, observer)
            node.onDisposeObservable.addOnce(() => this.nodeObservers.delete(node))
        }
    },

    beforeRender() {
        const scene = this.scene
        if (!ACTIVE_MESH_FREEZING_ENABLED || !this.running || !scene) {
            return
        }

        this.detectParticleSystemChanges(scene)
        if (this.dirty && this.frozen) {
            scene.unfreezeActiveMeshes()
            this.unfreezeCount++
            this.frozen = false
        }
    },

    afterRender() {
        const scene = this.scene
        if (!ACTIVE_MESH_FREEZING_ENABLED || !this.running || !scene?.activeCamera || this.frozen
            || performance.now() - this.lastChangeAt < FREEZE_IDLE_MS || !scene.getActiveMeshes().length) return
        // Reuse the list Babylon already evaluated and rendered in this frame.
        // freezeActiveMeshes() would first check readiness for every enabled mesh.
        scene._activeMeshesFrozen = true
        this.frozen = true
        this.dirty = false
        this.refreshActiveSkeletons(scene)
    },

    detectParticleSystemChanges(scene: Scene) {
        const systems = scene.particleSystems
        if (systems.length !== this.particleSystems.length) {
            this.particleSystems.length = systems.length
            this.particleStartedStates.length = systems.length
            this.invalidate()
        }

        for (let index = 0; index < systems.length; index++) {
            const system = systems[index]
            const started = system.isStarted()
            if (this.particleSystems[index] !== system || this.particleStartedStates[index] !== started) {
                this.particleSystems[index] = system
                this.particleStartedStates[index] = started
                this.invalidate()
            }
        }
    },

    refreshActiveSkeletons(scene: Scene) {
        this.activeSkeletons.length = 0
        const skeletons = new Set<Skeleton>()
        const activeMeshes = scene.getActiveMeshes()
        for (let index = 0; index < activeMeshes.length; index++) {
            const skeleton = activeMeshes.data[index].skeleton
            if (skeleton && !skeletons.has(skeleton)) {
                skeletons.add(skeleton)
                this.activeSkeletons.push(skeleton)
            }
        }
    },

    prepareActiveSkeletons() {
        if (!ACTIVE_MESH_FREEZING_ENABLED || !this.running || !this.frozen) {
            return
        }

        // Babylon normally calls Skeleton.prepare() from active-mesh
        // evaluation. That evaluation is precisely what we freeze, so keep
        // bone matrices current only for skeletons in the frozen active list.
        for (const skeleton of this.activeSkeletons) {
            skeleton.prepare()
        }
        // Character/monster visibility is managed by our own viewport logic.
        // Keep those skeletons updating even when Babylon's frozen active list
        // briefly misses a hierarchy that has just been enabled again.
        for (const skeleton of this.managedSkeletons) {
            skeleton.prepare()
        }
    },
}

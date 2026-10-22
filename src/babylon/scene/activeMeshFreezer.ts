import { Node, Observer, Scene, Skeleton } from '@babylonjs/core'

// Single A/B switch. Change this value and reload the client to compare the
// normal Babylon active-mesh evaluation with the managed frozen list.
export const ACTIVE_MESH_FREEZING_ENABLED = true

export const ActiveMeshFreezer = {
    scene: null as Scene | null,
    running: false,
    frozen: false,
    freezePending: false,
    dirty: true,
    nodeObservers: new Map<Node, Observer<boolean>>(),
    particleSystems: [] as any[],
    particleStartedStates: [] as boolean[],
    activeSkeletons: [] as Skeleton[],
    managedSkeletons: new Set<Skeleton>(),

    initialize(scene: Scene) {
        this.scene = scene
        this.running = false
        this.frozen = false
        this.freezePending = false
        this.dirty = true
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
        if (!this.dirty || this.freezePending) {
            return
        }

        // Give Babylon one complete render with live active-mesh evaluation
        // after invalidation. Unfreezing and immediately freezing again in
        // this same callback could keep newly configured meshes out of the
        // rendered list until a later invalidation.
        if (this.frozen) {
            scene.unfreezeActiveMeshes()
            this.frozen = false
            return
        }

        if (!scene.isReady()) {
            return
        }

        this.dirty = false
        this.freezePending = true
        scene.freezeActiveMeshes(
            false,
            () => {
                this.freezePending = false
                this.frozen = true
                this.refreshActiveSkeletons(scene)

                // A mesh can be added by an async callback while Babylon is
                // rebuilding the list. Keep that invalidation for next frame.
                if (this.dirty) {
                    scene.unfreezeActiveMeshes()
                    this.frozen = false
                }
            },
            (message) => {
                this.freezePending = false
                this.frozen = false
                this.dirty = true
                console.warn(`Unable to freeze active meshes: ${message}`)
            },
            false,
            false,
        )
    },

    detectParticleSystemChanges(scene: Scene) {
        const systems = scene.particleSystems
        if (systems.length !== this.particleSystems.length) {
            this.particleSystems.length = systems.length
            this.particleStartedStates.length = systems.length
            this.dirty = true
        }

        for (let index = 0; index < systems.length; index++) {
            const system = systems[index]
            const started = system.isStarted()
            if (this.particleSystems[index] !== system || this.particleStartedStates[index] !== started) {
                this.particleSystems[index] = system
                this.particleStartedStates[index] = started
                this.dirty = true
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

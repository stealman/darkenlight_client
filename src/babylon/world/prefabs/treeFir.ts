import { Mesh, MeshBuilder, Scene, Vector3 } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { Materials } from '@/babylon/materials'

export const PrefabFir = {
    getPrefab(scene: Scene) {

        const box = MeshBuilder.CreateBox("box", {
            width: 0.5,
            height: 0.5,
            depth: 0.5
        }, scene);

        box.isVisible = false;

        const blocks: Mesh[] = [];
        let y = 0;

        const layers = [
            // spodní – nejširší
            [
                { x: -0.9, z: 0 }, { x: 0.9, z: 0 },
                { x: 0, z: -0.9 }, { x: 0, z: 0.9 },
                { x: -0.6, z: -0.6 }, { x: 0.6, z: -0.6 },
                { x: -0.6, z: 0.6 }, { x: 0.6, z: 0.6 }
            ],

            // 2
            [
                { x: -0.6, z: 0 }, { x: 0.6, z: 0 },
                { x: 0, z: -0.6 }, { x: 0, z: 0.6 },
                { x: -0.4, z: -0.4 }, { x: 0.4, z: -0.4 },
                { x: -0.4, z: 0.4 }, { x: 0.4, z: 0.4 }
            ],

            // 3
            [
                { x: -0.4, z: 0 }, { x: 0.4, z: 0 },
                { x: 0, z: -0.4 }, { x: 0, z: 0.4 }
            ],

            // 4
            [
                { x: -0.25, z: 0 }, { x: 0.25, z: 0 },
                { x: 0, z: -0.25 }, { x: 0, z: 0.25 }
            ],

            // 5
            [
                { x: 0, z: 0 },
                { x: 0.15, z: 0 }, { x: -0.15, z: 0 }
            ],

            // špička
            [
                { x: 0, z: 0 }
            ]
        ];

        layers.forEach(layer => {
            layer.forEach(pos => {
                const c = box.clone("clone");
                c.position = new Vector3(pos.x, y, pos.z);
                blocks.push(c);
            });
            y += 0.5;
        });

        const merged = Mesh.MergeMeshes(blocks, true) as Mesh;
        merged.material = Materials.blockMatAlpha1;
        merged.name = "prefab_pine_tall";
        merged.alwaysSelectAsActiveMesh = true;

        return new Prefab(merged);
    }
};

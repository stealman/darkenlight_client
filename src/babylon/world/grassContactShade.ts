import '@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js'
import '@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js'
import { MeshBuilder, RawTexture, ShaderMaterial, Texture } from '@babylonjs/core'
import type { Matrix, Scene, TransformNode, Vector2 } from '@babylonjs/core'
import { updateWorldInstanceBuffers } from './worldInstanceBuffers'

const CELL_SIZE = 48
const PATCH_SIZE = 1
const ROOT_RADIUS = 0.195
export const GRASS_CONTACT_TRIANGLES = 2

export function createGrassContactShade(scene: Scene, parent: TransformNode, variants: readonly Vector2[][], lift: number) {
    const width = CELL_SIZE * variants.length
    const pixels = new Uint8Array(width * CELL_SIZE)
    // One small mask per tuft shape. Its soft spots follow the exact roots used by all three LODs.
    for (let variant = 0; variant < variants.length; variant++) {
        for (let z = 0; z < CELL_SIZE; z++) {
            const localZ = (z / (CELL_SIZE - 1) - 0.5) * PATCH_SIZE
            for (let x = 0; x < CELL_SIZE; x++) {
                const localX = (x / (CELL_SIZE - 1) - 0.5) * PATCH_SIZE
                let opacity = 0
                for (const root of variants[variant]) {
                    const dx = localX - root.x, dz = localZ - root.y
                    const weight = Math.max(0, 1 - (dx * dx + dz * dz) / (ROOT_RADIUS * ROOT_RADIUS))
                    opacity = Math.max(opacity, weight * weight)
                }
                pixels[z * width + variant * CELL_SIZE + x] = Math.round(255 * opacity)
            }
        }
    }
    const texture = RawTexture.CreateLuminanceTexture(pixels, width, CELL_SIZE, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
    const material = new ShaderMaterial('grassContactShade', scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uvc;
            uniform mat4 view;
            uniform mat4 viewProjection;
            #include<instancesDeclaration>
            varying vec2 rootMaskUV;
            varying float opacity;
            void main() {
                #include<instancesVertex>
                vec4 worldPosition = finalWorld * vec4(position, 1.0);
                worldPosition.y += ${lift.toFixed(3)};
                gl_Position = viewProjection * worldPosition;
                vec2 patchUV = position.xz / ${PATCH_SIZE.toFixed(2)} + 0.5;
                vec2 maskPixel = patchUV * ${CELL_SIZE - 1}.0 + vec2(0.5 + uvc.x * ${CELL_SIZE}.0, 0.5);
                rootMaskUV = maskPixel / vec2(${width}.0, ${CELL_SIZE}.0);
                float depth = abs((view * worldPosition).z);
                opacity = uvc.y * (1.0 - smoothstep(21.0, 34.0, depth));
            }
        `,
        fragmentSource: `
            precision highp float;
            uniform sampler2D rootMask;
            varying vec2 rootMaskUV;
            varying float opacity;
            void main() {
                gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(rootMask, rootMaskUV).r * opacity);
            }
        `,
    }, {attributes: ['position', 'uvc'], uniforms: ['world', 'view', 'viewProjection'], samplers: ['rootMask'], needAlphaBlending: true})
    material.setTexture('rootMask', texture)
    material.disableDepthWrite = true
    const mesh = MeshBuilder.CreateGround('grassContactShade', {width: PATCH_SIZE, height: PATCH_SIZE}, scene)
    mesh.parent = parent
    mesh.material = material
    mesh.isPickable = false
    mesh.setEnabled(false)
    return {
        render(matrices: Matrix[], styles: Vector2[]) {
            updateWorldInstanceBuffers(mesh, matrices, styles)
            mesh.setEnabled(matrices.length > 0)
        },
        dispose() {
            mesh.dispose()
            material.dispose()
            texture.dispose()
        },
    }
}

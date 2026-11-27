import { Color3, Scene, ShadowDepthWrapper } from '@babylonjs/core'
import type { Vector4 } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { terrainNoiseShader } from '../terrainNoiseShader'
import { configureTerrainNoiseTexture, terrainContactMossShader } from '../terrainSurfaceShader'
import { woodPatinaShader } from '../woodPatina'
import type { TreeSurfaceDetail } from './treeSpecies'

const PALETTE = ['#695741', '#ded1b5', '#cc933a', '#71503a', '#626b46', '#566348', '#677148']

export function createTreeMaterial(scene: Scene, detail: TreeSurfaceDetail, reveal: Vector4, targetReveal: Vector4) {
    const weathering = detail !== 'LOW'
    const high = detail === 'HIGH'
    const material = new PBRCustomMaterial('proceduralTreeSurface:' + detail, scene)
    material.metallic = 0
    material.roughness = .94
    material.usePhysicalLightFalloff = false
    material.environmentIntensity = .92
    material.maxSimultaneousLights = 4
    material.AddUniform('treeReveal', 'vec4', reveal)
    material.AddUniform('treeTargetReveal', 'vec4', targetReveal)
    for (const attribute of ['treeSurface', 'treeStyle', 'treeShape', 'treeJointA', 'treeJointB', 'treeOpacity']) material.AddAttribute(attribute)
    const varying = `
        varying vec4 vTreeSurface;
        varying vec3 vTreeColor;
        varying vec3 vTreeWeather;
        varying float vTreeOpacity;
    `
    material.Vertex_Definitions(`
        attribute vec3 treeSurface;
        attribute vec4 treeStyle, treeShape, treeJointA, treeJointB;
        attribute float treeOpacity;
        ${varying}
        vec3 treeRotate(vec3 v, vec4 q) {
            return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
        }
        vec3 treePalette(float index) {
            ${PALETTE.map((hex, i) => {
                const rgb = Color3.FromHexString(hex).toLinearSpace()
                return `if (index < ${i + .5}) return vec3(${rgb.asArray().map(c => c.toFixed(5)).join(', ')});`
            }).join('\n')}
            return vec3(0.1);
        }
    `)
    material.Vertex_Before_PositionUpdated(`
        vec4 treeJoint = position.y < 0.5 ? treeJointA : treeJointB;
        if (treeSurface.z < 0.5) {
            vec3 ring = treeRotate(vec3(position.x, 0.0, position.z), treeJoint)
                * mix(1.0, treeShape.x, position.y);
            positionUpdated = vec3(ring.x, position.y + ring.y * treeShape.w, ring.z);
        } else {
            positionUpdated.x *= treeShape.x;
            positionUpdated.y += position.z * position.z * (treeShape.x - 1.0) * 0.6;
        }
        vTreeColor = treePalette(treeStyle.x) * treeStyle.y;
        vTreeOpacity = treeOpacity;
        vTreeSurface.xyz = vec3(treeSurface.x, treeSurface.y * treeShape.y + treeShape.z, treeSurface.z);
        vTreeWeather = vec3(treeStyle.zw, treeStyle.x);
    `)
    material.Vertex_Before_NormalUpdated(`
        #ifdef NORMAL
        if (treeSurface.z < 0.5) {
            if (treeSurface.y >= 0.0) normalUpdated.y = (1.0 - treeShape.x) * treeShape.w;
            normalUpdated = treeRotate(normalUpdated, treeJoint);
            normalUpdated.y /= treeShape.w;
        }
        #endif
    `)
    material.Vertex_MainEnd(`
        // The tube radius converts the relative relief to world units. Cut ends have no longitudinal grain.
        vTreeSurface.w = treeSurface.z < 0.5 && treeSurface.y >= 0.0
            ? length(finalWorld[0].xyz) * mix(1.0, treeShape.x, position.y) : 0.0;
    `)
    material.Fragment_Definitions(`
        ${varying}
        ${terrainNoiseShader}
        ${weathering ? woodPatinaShader + terrainContactMossShader : ''}
        float treeBayer2(vec2 cell) {
            return cell.y * 3.0 + cell.x * (2.0 - cell.y * 4.0);
        }
        float treeRevealCoverage(vec4 reveal) {
            if (reveal.z > 0.0 && gl_FragCoord.z * sign(reveal.w) < reveal.w) {
                vec2 pixelOffset = gl_FragCoord.xy - reveal.xy;
                float radiusSquared = dot(pixelOffset, pixelOffset) * reveal.z;
                if (radiusSquared < 1.0) {
                    return mix(0.30, 1.0, smoothstep(0.23, 1.0, sqrt(radiusSquared)));
                }
            }
            return 1.0;
        }
        vec2 treeGrainCoverage(vec2 phase) {
            return 1.0 - smoothstep(0.55, 1.8, fwidth(phase));
        }
        vec3 treeReliefNormal(vec3 normal, vec3 positionW, vec2 height, vec2 coverage) {
            vec3 dpX = dFdx(positionW), dpY = dFdy(positionW);
            vec3 alongX = cross(dpY, normal), alongY = cross(normal, dpX);
            float area = dot(dpX, alongX);
            vec3 gradient = alongX * dot(dFdx(height), coverage) + alongY * dot(dFdy(height), coverage);
            // Surface gradient in world space, independent of ring size and projection angle.
            return normalize(normal * max(abs(area), 1e-9) - gradient * sign(area));
        }
    `)
    material.Fragment_MainBegin(`
        #ifndef SM_NORMALBIAS
        // Overlapping cutouts and intersecting branches share the same screen-space holes.
        float treeCoverage = vTreeOpacity * min(treeRevealCoverage(treeReveal), treeRevealCoverage(treeTargetReveal));
        if (treeCoverage < 0.999) {
            vec2 cell = floor(gl_FragCoord.xy);
            float threshold = treeBayer2(mod(cell, 2.0)) * 4.0 + treeBayer2(mod(floor(cell * 0.5), 2.0));
            if (treeCoverage * 16.0 < threshold + 0.5) discard;
        }
        #endif
    `)
    material.Fragment_Before_Lights(`
        vec3 tint = vTreeColor;
        vec3 p = vPositionW;
        bool isBark = vTreeSurface.z < 0.5;
        float y = p.y - vTreeWeather.y;
        vec2 relief = vec2(0.0);
        vec2 grainCoverage = vec2(1.0);
        float snowWeight = 0.0;
        if (isBark) {
            bool birch = vTreeWeather.z > 0.5 && vTreeWeather.z < 1.5;
            float u = vTreeSurface.x;
            float axial = vTreeSurface.y;
            float ring = u * 6.283185;
            float fiber = sin(ring * 3.0 + axial * 1.1);
            float groove = 0.0;
            if (birch) {
                float row = floor(axial * 7.0);
                float h = terrainHash(vec2(row, 3.2));
                float mark = abs(fract(u + h) - 0.5);
                float width = 0.035 + h * 0.155;
                float line = abs(fract(axial * 7.0 + 0.12 * sin(ring)) - 0.48);
                float lenticel = (1.0 - smoothstep(width * 0.8, width, mark))
                    * (1.0 - smoothstep(0.07 + 0.12 * h, 0.13 + 0.15 * h, line));
                tint *= 0.99 + 0.055 * fiber;
                tint = mix(tint, vec3(0.052, 0.039, 0.027), lenticel * 0.93);
                relief.x = vTreeSurface.w * (0.009 * fiber - 0.040 * lenticel);
            } else {
                float split = sin(axial * 4.1 + ring * 5.0) * sin(axial * 2.7 - ring * 2.0);
                float grain = ring + 0.108 * sin(axial * 2.9 + ring) + 0.064 * split;
                float ridges = mix(11.0, 14.0, step(2.5, vTreeWeather.z));
                float broadPhase = grain * ridges + 0.78 * fiber;
                float finePhase = grain * 23.0 - 0.82 * sin(axial * 5.8 - ring * 3.0);
                grainCoverage = treeGrainCoverage(vec2(broadPhase, finePhase));
                float furrow = smoothstep(0.03, 0.88, sin(broadPhase));
                float fray = sin(finePhase);
                float broken = 0.72 + 0.21 * sin(axial * 8.8 + ring * 5.0) + 0.07 * sin(axial * 19.2 - ring * 7.0);
                groove = furrow * grainCoverage.x;
                tint *= 1.05 + 0.13 * fiber - 0.26 * groove * broken + 0.052 * fray * grainCoverage.y;
                relief = vTreeSurface.w * vec2(-0.16 * furrow * broken, 0.028 * fray);
            }
            float moss = (1.0 - smoothstep(0.10, 0.64, y + 0.17 * fiber)) * (0.73 - groove * 0.21);
            tint = mix(tint, vec3(0.091, 0.102, 0.039), moss);
            ${weathering ? `
                #ifndef SM_NORMALBIAS
                if (vTreeSurface.w > 0.028) {
                    // World space keeps weathering continuous across joins and on the same side when a tree rotates.
                    // The signposts define north as world +X.
                    float north = smoothstep(0.03, 0.82, geometricNormalW.x);
                    float barkWidth = smoothstep(0.028, 0.15, vTreeSurface.w);
                    vec2 patinaUV = vec2(p.y * 1.17 + p.x * 0.27, p.z * 0.94 + p.x * 0.61 - p.y * 0.20);
                    tint = applyWoodPatina(tint, patinaUV, ${high ? '1.38' : '0.92'} * mix(0.36, 1.0, barkWidth) * (birch ? 0.43 : 1.0));
                    float weatherSpots = terrainNoise(patinaUV * vec2(4.3, 7.6) + vec2(7.8, 2.7));
                    float reach = mix(0.47, ${high ? '1.78' : '1.40'}, north);
                    float damp = 1.0 - smoothstep(0.12, reach, y + 0.73 * (weatherSpots - 0.49));
                    tint *= 1.0 - damp * (0.10 + 0.22 * weatherSpots) * mix(0.40, 1.0, north);
                    ${high ? `
                        float flecks = terrainNoise(patinaUV * vec2(19.0, 24.0) + vec2(3.3, 11.5));
                        float grain = mix(weatherSpots, flecks, 0.27);
                        float lichen = smoothstep(0.64, 0.78, flecks * 0.54 + weatherSpots * 0.46) * barkWidth;
                        tint = mix(tint, terrainContactLichenColor(flecks), lichen * (birch ? 0.12 : 0.46));
                    ` : 'float grain = weatherSpots;'}
                    float colonies = smoothstep(0.34, 0.70, grain + 0.11 * north + 0.035 * fiber);
                    float northMoss = colonies * damp * mix(0.22, ${high ? '0.94' : '0.79'}, north)
                        * mix(0.46, 1.0, barkWidth) * (birch ? 0.66 : 1.0);
                    vec3 mossColor = terrainContactMossColor(grain) * mix(0.90, 1.36, north);
                    tint = mix(tint, mossColor, northMoss);
                    ${high ? 'relief.y += 0.021 * northMoss * (flecks - 0.5);' : ''}
                }
                #endif
            ` : ''}
        }
        if (vTreeWeather.x > 0.0) {
            vec2 snowUV = p.xz * 2.65 + vec2(p.y * 1.37, p.y * -0.79);
            float noise = (terrainProceduralNoise(snowUV) - 0.51) * 0.70;
            float threshold = mix(1.20, isBark ? 0.66 : 0.67, vTreeWeather.x);
            float cover = smoothstep(threshold - 0.05, threshold + 0.07, geometricNormalW.y + noise);
            float contact = isBark ? (1.0 - smoothstep(0.005, 0.22, y + noise * 0.67)) * vTreeWeather.x : 0.0;
            snowWeight = max(cover, contact) * (vTreeSurface.z > 0.5 && vTreeSurface.z < 1.5 ? 0.43 : 0.97);
            tint = mix(tint, vec3(0.70, 0.77, 0.84) * (0.93 + noise * 0.28), snowWeight);
        }
        #ifndef SM_NORMALBIAS
        if (isBark) normalW = treeReliefNormal(normalW, p, relief, grainCoverage * (1.0 - snowWeight));
        #endif
        surfaceAlbedo *= tint;
    `)
    if (weathering) configureTerrainNoiseTexture(material, 0)
    const shadowDepth = new ShadowDepthWrapper(material, scene, {standalone: true})
    material.shadowDepthWrapper = shadowDepth
    material.onDisposeObservable.addOnce(() => shadowDepth.dispose())
    return material
}

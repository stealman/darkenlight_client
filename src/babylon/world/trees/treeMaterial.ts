import { Color3, Material, PBRMaterialDefines, Scene, ShaderStore, ShadowDepthWrapper, Texture } from '@babylonjs/core'
import type { Vector2, Vector4 } from '@babylonjs/core'
import { CustomMaterial, PBRCustomMaterial } from '@babylonjs/materials'
import { terrainNoiseShader } from '../terrainNoiseShader'
import { configureTerrainNoiseTexture, terrainContactMossShader } from '../terrainSurfaceShader'
import { woodPatinaShader } from '../woodPatina'
import { getTreeGroundSurface, treeGroundContourShader, treeRootGroundShader } from './treeGroundSurface'
import { TREE_SHADER } from './treeSpecies'
import type { TreeSurfaceDetail } from './treeSpecies'

const PALETTE = ['#695741', '#ded1b5', '#cc933a', '#71503a', '#626b46', '#566348', '#677148']
type FoliageAtlas = 'standard' | 'birch'
const foliageAtlases = new WeakMap<Scene, Partial<Record<FoliageAtlas, Texture>>>()
export type TreeBarkMode = 'procedural' | 'textured'
const barkTextures = new WeakMap<Scene, {color: Texture, normal?: Texture}>()
const CARD_COLOR = 'clamp(treeFoliageSample.rgb * vTreeColor, 0.0, 1.0)'
const SHAPE_ATTRIBUTES = ['treeSurface', 'treeStyle', 'treeShape', 'treeJointA', 'treeJointB']
const SHAPE_DEFINITIONS = `
    attribute vec3 treeSurface;
    attribute vec4 treeStyle, treeShape, treeJointA, treeJointB;
    vec3 treeRotate(vec3 v, vec4 q) {
        return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
    }
    vec3 treeDeformNormal(vec3 n, vec4 joint, vec3 point) {
        if (treeSurface.z < 0.5) {
            if (treeSurface.y >= 0.0) {
                #ifdef TREE_MAPPED_BARK
                // The connected rings use the same radial normal at the joint.
                n = vec3(point.x, 0.0, point.z);
                #else
                n.y = (1.0 - treeShape.x) * treeShape.w;
                #endif
            }
            n = treeRotate(n, joint);
            n.y /= treeShape.w;
        }
        return n;
    }
`
const DEFORM_VERTEX = `
    vec4 treeJoint = position.y < 0.5 ? treeJointA : treeJointB;
    if (treeSurface.z < 0.5) {
        vec3 ring = treeRotate(vec3(position.x, 0.0, position.z), treeJoint)
            * mix(1.0, treeShape.x, position.y);
        positionUpdated = vec3(ring.x, position.y + ring.y * treeShape.w, ring.z);
    } else {
        positionUpdated.x *= treeShape.x;
        positionUpdated.y += position.z * position.z * (treeShape.x - 1.0) * 0.6;
    }
`
const DEFORM_NORMAL = `
    #ifdef NORMAL
    normalUpdated = treeDeformNormal(normalUpdated, treeJoint, position);
    #endif
`
const TREE_REVEAL_COVERAGE = `
    float treeRevealCoverage(vec3 screenPosition, vec4 reveal) {
        if (reveal.z > 0.0 && screenPosition.z * sign(reveal.w) < reveal.w) {
            vec2 pixelOffset = screenPosition.xy - reveal.xy;
            float radiusSquared = dot(pixelOffset, pixelOffset) * reveal.z;
            if (radiusSquared < 1.0) {
                return mix(0.30, 1.0, smoothstep(0.23, 1.0, sqrt(radiusSquared)));
            }
        }
        return 1.0;
    }
`

export interface TreeVertexMaskProjection { viewport: Vector4, depth: Vector2 }

function skipUnlitTreeSpotlights(material: PBRCustomMaterial) {
    // Shared light slots stay bound at zero intensity to avoid recompiling shaders during light fades.
    // Both PBR contributions use the intensity-scaled diffuse color. Keep Babylon's shadow
    // paths and its light counts, including the unshadowed slot in the average.
    const includes = ShaderStore.IncludesShadersStore
    includes.treePbrLightFragment ??= `
        #if defined(LIGHT{X}) && defined(SPOTLIGHT{X}) && !defined(SHADOW{X})
        if (any(notEqual(light{X}.vLightDiffuse.rgb, vec3(0.0)))) {
        #endif
        ${includes.lightFragment}
        #if defined(LIGHT{X}) && defined(SPOTLIGHT{X}) && !defined(SHADOW{X})
        } else {
            aggShadow += 1.0;
            numLights += 1.0;
        }
        #endif
    `
    material.FragmentShader = material.FragmentShader.replace('#include<lightFragment>[0..maxSimultaneousLights]',
        '#include<treePbrLightFragment>[0..maxSimultaneousLights]')
}

function paletteShader(linear: boolean) {
    return `vec3 treePalette(float index) {
        ${PALETTE.map((hex, i) => {
            const color = Color3.FromHexString(hex)
            const rgb = linear ? color.toLinearSpace() : color
            return `if (index < ${i + .5}) return vec3(${rgb.asArray().map(c => c.toFixed(5)).join(', ')});`
        }).join('\n')}
        return vec3(0.1);
    }`
}

function addShadowDepth(material: Material, scene: Scene) {
    const shadowDepth = new ShadowDepthWrapper(material, scene, {standalone: true})
    material.shadowDepthWrapper = shadowDepth
    material.onDisposeObservable.addOnce(() => shadowDepth.dispose())
}

function loadBarkTexture(scene: Scene, file: string) {
    const texture = new Texture('/textures/' + file, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE)
    texture.wrapU = texture.wrapV = Texture.MIRROR_ADDRESSMODE
    return texture
}

export function createTreeMaterial(scene: Scene, detail: TreeSurfaceDetail, features: number, reveal: Vector4, targetReveal: Vector4,
    vertexMask?: TreeVertexMaskProjection, skipInactiveLights = true, foliageAtlas?: FoliageAtlas, barkMode: TreeBarkMode = 'procedural',
    groundContact = false, nightFill?: Vector2) {
    const cards = foliageAtlas !== undefined
    const bark = !cards && (features & TREE_SHADER.bark) !== 0
    const relief = !cards && (features & TREE_SHADER.relief) !== 0
    const snow = groundContact && (features & TREE_SHADER.snow) !== 0
    const cutout = (features & TREE_SHADER.reveal) !== 0
    const weathering = !cards && detail !== 'LOW' && (features & TREE_SHADER.patina) !== 0
    const texturedBark = barkMode === 'textured'
    const mappedRelief = texturedBark && relief
    const proceduralGrain = (bark || relief) && !texturedBark
    const detailedGrain = detail !== 'LOW' && proceduralGrain
    const high = detail === 'HIGH'
    const hasSurface = texturedBark || bark || relief || groundContact || weathering
    const name = 'proceduralTreeSurface:' + (features ? `${detail}:${features}` : 'SIMPLE') + (vertexMask ? ':vertex-mask' : '')
        + (skipInactiveLights ? '' : ':all-light-slots')
        + (foliageAtlas ? ':' + foliageAtlas + '-card' : barkMode !== 'procedural' ? ':' + barkMode : '')
        + (groundContact ? ':ground' : '')
    const material = features & TREE_SHADER.lighting ? new PBRCustomMaterial(name, scene) : new CustomMaterial(name, scene)
    const unlitNormals = material instanceof CustomMaterial && (relief || snow || weathering)
    if (material instanceof PBRCustomMaterial) {
        material.metallic = 0
        material.roughness = texturedBark ? 1 : .94
        material.usePhysicalLightFalloff = false
        material.environmentIntensity = .92
        material.maxSimultaneousLights = 4
        if (skipInactiveLights) skipUnlitTreeSpotlights(material)
        if (cutout) {
            material.customShaderNameResolve = (...args) => {
                const defines = args[4]
                if (defines instanceof PBRMaterialDefines) {
                    // The cutout supplies alpha after the opaque PBR lighting calculation.
                    defines.ALPHABLEND = false
                }
                return material.Builder(...args)
            }
        }
    } else {
        material.disableLighting = true
        material.fogEnabled = false
        if (unlitNormals) material.AddAttribute('normal')
    }
    if (foliageAtlas) {
        let atlases = foliageAtlases.get(scene)
        if (!atlases) foliageAtlases.set(scene, atlases = {})
        let atlas = atlases[foliageAtlas]
        if (!atlas) {
            const file = foliageAtlas === 'birch' ? 'birch-foliage-atlas.png' : 'tree-foliage-atlas.png'
            atlas = new Texture('/textures/' + file, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE)
            atlas.wrapU = atlas.wrapV = Texture.CLAMP_ADDRESSMODE
            atlases[foliageAtlas] = atlas
        }
        material.backFaceCulling = false
        material.twoSidedLighting = true
        material.AddUniform('treeFoliageAtlas', 'sampler2D', atlas)
        material.Fragment_MainBegin(`
            vec4 treeFoliageSample = texture2D(treeFoliageAtlas, vTreeFoliageUV.xy);
            ${foliageAtlas === 'birch' ? 'if (treeFoliageSample.a < 0.51) discard;' : `
            float needleCard = vTreeFoliageUV.z;
            if (treeFoliageSample.a < mix(0.23, 0.31, needleCard)) discard;
            // Filtered pixels at the alpha edge can still contain the bright texture fringe.
            float needleCoverage = smoothstep(0.31, 0.68, treeFoliageSample.a);
            treeFoliageSample.rgb *= mix(1.0, 0.82 * mix(0.71, 1.0, needleCoverage), needleCard);
            `}
        `)
    }
    if (texturedBark) {
        let textures = barkTextures.get(scene)
        if (!textures) {
            textures = {color: loadBarkTexture(scene, 'tree-bark-fissures.jpg')}
            barkTextures.set(scene, textures)
        }
        material.AddUniform('treeBarkTexture', 'sampler2D', textures.color)
        if (mappedRelief) {
            textures.normal ??= loadBarkTexture(scene, 'tree-bark-normal.png')
            textures.normal.gammaSpace = false
            material.AddUniform('treeBarkNormal', 'sampler2D', textures.normal)
        }
    }
    const limitBark = texturedBark && (bark || relief || weathering)
    if (limitBark) material.AddAttribute('treeBarkLimit')
    if (cutout) {
        if (material instanceof PBRCustomMaterial) {
            // The cutout writes its own final alpha. Keep the lighting and RGB reflections.
            material.useSpecularOverAlpha = false
            material.useRadianceOverAlpha = false
        }
        material.transparencyMode = Material.MATERIAL_ALPHABLEND
        // Babylon uses alpha to dispatch this material to the transparent queue.
        // The shader supplies the actual alpha after the opaque scene has drawn.
        material.alpha = .999
        material.forceDepthWrite = true
        material.AddUniform('treeReveal', 'vec4', reveal)
        material.AddUniform('treeTargetReveal', 'vec4', targetReveal)
        if (vertexMask) {
            material.AddUniform('treeRevealViewport', 'vec4', vertexMask.viewport)
            material.AddUniform('treeRevealDepth', 'vec2', vertexMask.depth)
        }
        material.AddAttribute('treeOpacity')
    }
    for (const attribute of SHAPE_ATTRIBUTES) material.AddAttribute(attribute)
    const varying = `
        varying vec3 vTreeColor;
        ${cards ? 'varying vec3 vTreeFoliageUV;' : ''}
        ${limitBark ? 'varying float vTreeBarkLimit;' : ''}
        ${mappedRelief ? 'varying vec3 vTreeBarkTangent;' : ''}
        ${hasSurface ? 'varying vec4 vTreeSurface; varying vec3 vTreeWeather;' : ''}
        ${cutout ? 'varying float vTreeOpacity;' : ''}
        ${unlitNormals ? 'varying vec3 vTreeNormal;' : ''}
    `
    material.Vertex_Definitions(`
        ${mappedRelief ? '#define TREE_MAPPED_BARK' : ''}
        ${SHAPE_DEFINITIONS}
        ${limitBark ? 'attribute float treeBarkLimit;' : ''}
        ${cutout ? 'attribute float treeOpacity;' : ''}
        ${unlitNormals ? '#ifndef NORMAL\nattribute vec3 normal;\n#endif' : ''}
        ${varying}
        ${cards ? '' : paletteShader(material instanceof PBRCustomMaterial || hasSurface)}
        ${vertexMask ? TREE_REVEAL_COVERAGE : ''}
    `)
    material.Vertex_Before_PositionUpdated(`
        ${DEFORM_VERTEX}
        ${cards ? `
        vTreeColor = vec3(treeStyle.y);
        // The original atlas is oriented with the stem on the left of each cell.
        ${foliageAtlas === 'birch' ? `
        float tileIndex = floor(fract(treeShape.z * .37) * 4.0);
        vec2 tile = vec2(mod(tileIndex, 2.0), floor(tileIndex * .5));
        ` : `
        bool spruceFiller = treeStyle.x > 3.5 && treeStyle.x < 4.5 && fract(treeShape.z * .37) > .41;
        vec2 tile = vec2(treeStyle.x < 3.0 || (treeStyle.x > 4.5 && treeStyle.x < 5.5) || spruceFiller ? 1.0 : 0.0,
            treeStyle.x > 3.5 && treeStyle.x < 5.5 ? 1.0 : 0.0);
        `}
        vec2 uv = vec2(treeSurface.y * .8, treeSurface.x / 1.76 + .5);
        vTreeFoliageUV = vec3((tile + mix(vec2(.002), vec2(.998), uv)) * .5,
            ${foliageAtlas === 'birch' ? '0.0' : 'step(3.5, treeStyle.x)'});
        ` : 'vTreeColor = treePalette(treeStyle.x) * treeStyle.y;'}
        ${limitBark ? 'vTreeBarkLimit = treeBarkLimit;' : ''}
        ${cutout ? 'vTreeOpacity = treeOpacity;' : ''}
        ${hasSurface ? `
            vTreeSurface.xyz = treeSurface;
            if (treeSurface.z < 0.5) vTreeSurface.y = treeSurface.y * treeShape.y + treeShape.z;
            vTreeWeather = vec3(treeStyle.zw, treeStyle.x);
        ` : ''}
    `)
    material.Vertex_Before_NormalUpdated(DEFORM_NORMAL)
    material.Vertex_MainEnd(`
        ${vertexMask ? `
            #ifndef SM_NORMALBIAS
            if (gl_Position.w > 0.0) {
                vec3 treeNdc = gl_Position.xyz / gl_Position.w;
                vec3 treeScreen = vec3(treeNdc.xy * treeRevealViewport.zw + treeRevealViewport.xy,
                    treeNdc.z * treeRevealDepth.x + treeRevealDepth.y);
                vTreeOpacity *= min(treeRevealCoverage(treeScreen, treeReveal), treeRevealCoverage(treeScreen, treeTargetReveal));
            }
            #endif
        ` : ''}
        ${hasSurface ? `
            // The tube radius converts the relative relief to world units. Cut ends have no longitudinal grain.
            vTreeSurface.w = treeShape.z;
            if (treeSurface.z < 0.5) {
                vTreeSurface.w = treeSurface.y >= 0.0
                    ? length(finalWorld[0].xyz) * mix(1.0, treeShape.x, position.y) : 0.0;
            }
        ` : ''}
        ${mappedRelief ? `
            // The ring and its tangent share the same joint frame across neighbouring spans.
            vec3 barkTangent = treeRotate(vec3(-position.z, 0.0, position.x), treeJoint);
            barkTangent.y *= treeShape.w;
            vTreeBarkTangent = normalize(mat3(finalWorld) * barkTangent);
        ` : ''}
        ${unlitNormals ? `
            mat3 treeWorld = mat3(finalWorld);
            vec3 localNormal = treeDeformNormal(normal, treeJoint, position);
            vTreeNormal = normalize(treeWorld * (localNormal / vec3(dot(treeWorld[0], treeWorld[0]),
                dot(treeWorld[1], treeWorld[1]), dot(treeWorld[2], treeWorld[2]))));
        ` : ''}
    `)
    const fragmentDefinitions = `
        ${varying}
        ${hasSurface ? terrainNoiseShader : ''}
        ${snow ? treeGroundContourShader(terrainNoiseShader, detail === 'LOW') : ''}
        ${weathering ? woodPatinaShader + terrainContactMossShader : ''}
        ${cutout && !vertexMask ? TREE_REVEAL_COVERAGE : ''}
        ${proceduralGrain ? `
        vec2 treeGrainCoverage(vec2 phase) {
            return 1.0 - smoothstep(0.55, 1.8, fwidth(phase));
        }
        ` : ''}
        ${mappedRelief ? `
        vec3 treeBarkNormalW(vec3 normal, vec2 uv, float weight) {
            vec3 n = texture2D(treeBarkNormal, uv).xyz * 2.0 - 1.0;
            // Flip the tangent slopes in the mirrored half of each texture repeat.
            n.xy *= (1.0 - 2.0 * step(vec2(1.0), mod(uv, 2.0))) * weight;
            vec3 tangent = normalize(vTreeBarkTangent - normal * dot(normal, vTreeBarkTangent));
            vec3 bitangent = cross(tangent, normal);
            return normalize(normal * n.z + tangent * n.x + bitangent * n.y);
        }
        ` : relief ? `
        vec3 treeReliefNormal(vec3 normal, vec3 positionW, vec2 height, vec2 coverage) {
            vec3 dpX = dFdx(positionW), dpY = dFdy(positionW);
            vec3 alongX = cross(dpY, normal), alongY = cross(normal, dpX);
            float area = dot(dpX, alongX);
            vec3 gradient = alongX * dot(dFdx(height), coverage) + alongY * dot(dFdy(height), coverage);
            // Surface gradient in world space, independent of ring size and projection angle.
            return normalize(normal * max(abs(area), 1e-9) - gradient * sign(area));
        }
        ` : ''}
    `
    const blendAlpha = cutout ? `
        #ifndef SM_NORMALBIAS
        treeOutput.a = vTreeOpacity${vertexMask ? '' : ' * min(treeRevealCoverage(gl_FragCoord.xyz, treeReveal), treeRevealCoverage(gl_FragCoord.xyz, treeTargetReveal))'};
        #endif
    ` : ''
    const surfaceFunction = hasSurface ? `
        vec3 treeSurfaceColor(vec3 p, vec3 geometricNormalW, inout vec3 normalW, vec3 baseTint) {
        vec3 tint = baseTint;
        bool isBark = vTreeSurface.z < 0.5;
        float y = p.y - vTreeWeather.y;
        ${texturedBark ? 'vec2 barkUV = vTreeSurface.xy * vec2(2.0, 0.94);' : ''}
        ${limitBark ? `
        bool fullBarkDetail = vTreeBarkLimit < 0.0;
        bool detailedBarkHere = fullBarkDetail || (vTreeBarkLimit > 0.0 && y < vTreeBarkLimit);
        float barkDetailFade = fullBarkDetail ? 1.0 : detailedBarkHere
            ? 1.0 - smoothstep(vTreeBarkLimit * .81, vTreeBarkLimit, y) : 0.0;
        ` : ''}
        vec2 relief = vec2(0.0);
        vec2 grainCoverage = vec2(1.0);
        float snowWeight = 0.0;
        ${texturedBark || bark || relief || weathering ? `if (isBark) {
            bool birch = vTreeWeather.z > 0.5 && vTreeWeather.z < 1.5;
            float u = vTreeSurface.x;
            float axial = vTreeSurface.y;
            float ring = u * 6.283185;
            float fiber = sin(ring * 3.0 + axial * 1.1);
            float groove = 0.0;
            ${texturedBark ? `
            // Two mirrored half-wraps meet at the cylinder seam. Axial coordinates continue across spans.
            vec3 barkTexel = texture2D(treeBarkTexture, barkUV).rgb;
            float barkLuma = dot(barkTexel, vec3(.22, .71, .07));
            ` : ''}
            ${texturedBark || bark || relief ? `if (birch) {
                float row = floor(axial * 7.0);
                float h = terrainHash(vec2(row, 3.2));
                float mark = abs(fract(u + h) - 0.5);
                float width = 0.035 + h * 0.155;
                float line = abs(fract(axial * 7.0 + 0.12 * sin(ring)) - 0.48);
                float lenticel = (1.0 - smoothstep(width * 0.8, width, mark))
                    * (1.0 - smoothstep(0.07 + 0.12 * h, 0.13 + 0.15 * h, line));
                ${texturedBark || bark ? `tint *= 0.99 + 0.055 * fiber;
                ${texturedBark ? 'tint *= .89 + .22 * barkLuma;' : ''}
                ${detailedGrain ? `
                float peel = terrainNoise(vec2(13.0 * sin(ring) + axial * .51, 6.5 * cos(ring) + axial * 17.0));
                tint *= 0.94 + peel * 0.12;` : ''}
                tint = mix(tint, vec3(0.052, 0.039, 0.027), lenticel * 0.93);` : ''}
                ${relief && !mappedRelief ? 'relief.x = vTreeSurface.w * (0.009 * fiber - 0.040 * lenticel);' : ''}
            } else {
                ${texturedBark ? `
                groove = 1.0 - smoothstep(.17, .49, barkLuma);
                float treeTone = .72 + .64 * sqrt(dot(tint, vec3(.22, .71, .07)));
                vec3 barkColor = barkTexel * barkTexel * vec3(1.00, 1.08, 1.17);
                tint = mix(tint * (.65 + .5 * barkLuma), barkColor * treeTone, .86);
                ` : `
                float split = sin(axial * 4.1 + ring * 5.0) * sin(axial * 2.7 - ring * 2.0);
                float grain = ring + 0.108 * sin(axial * 2.9 + ring) + 0.064 * split;
                ${detailedGrain ? `
                vec2 meridian = vec2(cos(ring), sin(ring));
                float plates = terrainNoise(meridian * 6.5 + axial * vec2(1.9, .68));
                float chips = terrainNoise(meridian * ${high ? '27.0' : '18.0'} + axial * vec2(4.6, ${high ? '23.2' : '16.2'}));
                grain += 0.21 * (plates - 0.5);
                ` : ''}
                float ridges = mix(11.0, 14.0, step(2.5, vTreeWeather.z));
                float broadPhase = grain * ridges + 0.78 * fiber;
                float finePhase = grain * 23.0 - 0.82 * sin(axial * 5.8 - ring * 3.0);
                grainCoverage = treeGrainCoverage(vec2(broadPhase, finePhase));
                float furrow = smoothstep(0.03, 0.88, sin(broadPhase));
                float fray = sin(finePhase);
                float broken = 0.72 + 0.21 * sin(axial * 8.8 + ring * 5.0) + 0.07 * sin(axial * 19.2 - ring * 7.0);
                groove = furrow * grainCoverage.x;
                ${bark ? 'tint *= 1.05 + 0.13 * fiber - 0.26 * groove * broken + 0.052 * fray * grainCoverage.y;' : ''}
                relief = vTreeSurface.w * vec2(-0.16 * furrow * broken, 0.028 * fray);
                ${detailedGrain ? `
                float fissure = groove * smoothstep(0.36, 0.80, chips * 0.66 + plates * 0.34);
                float flake = chips * (1.0 - groove * 0.85);
                ${bark ? `tint = tint * mix(vec3(.84, .77, .69), vec3(1.22, 1.18, 1.09), plates);
                tint *= 0.94 + flake * 0.24 - fissure * 0.22;` : ''}
                relief.y += vTreeSurface.w * (flake * 0.046 - fissure * 0.059);
                ` : ''}
                `}
            }
            ` : ''}
            ${bark ? `${limitBark ? 'if (detailedBarkHere) {' : ''}
            float moss = (1.0 - smoothstep(0.10, 0.64, y + 0.17 * fiber)) * (0.73 - groove * 0.21);
            tint = mix(tint, vec3(0.091, 0.102, 0.039), moss);
            ${limitBark ? '}' : ''}` : ''}
            ${weathering ? `
                #ifndef SM_NORMALBIAS
                if (vTreeSurface.w > 0.028${limitBark ? ' && detailedBarkHere' : ''}) {
                    ${limitBark ? 'vec3 unweatheredTint = tint;' : ''}
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
                    ${limitBark ? 'tint = mix(unweatheredTint, tint, barkDetailFade);' : ''}
                    ${high && relief && !mappedRelief ? 'relief.y += 0.021 * northMoss * (flecks - 0.5);' : ''}
                }
                #endif
            ` : ''}
        }` : ''}
        ${proceduralGrain ? `
        if (!isBark) {
            bool leaf = vTreeSurface.z < 1.5;
            vec2 uv = vTreeSurface.xy;
            float seed = vTreeSurface.w;
            float across = abs(uv.x + 0.065 * sin(uv.y * 5.1 + seed));
            float rib = uv.y + across * (leaf ? .46 : .68);
            vec2 phase = leaf
                ? vec2(rib * 31.0, rib * 59.0 + across * 5.0)
                : vec2(rib * 57.0, rib * 112.0 + across * 9.0);
            phase += vec2(0.6, 1.2) * sin(uv.y * 7.3 + uv.x * 4.8 + seed);
            ${detailedGrain ? `
            float pigment = terrainNoise(vec2(uv.x * ${high ? '26.0' : '15.0'}, rib * ${high ? '38.0' : '22.0'}) + seed);
            phase += (pigment - .5) * (leaf ? vec2(.3, .7) : vec2(1.45, 2.9));
            ` : ''}
            grainCoverage = treeGrainCoverage(phase);
            vec2 strands = sin(phase);
            float stem = 1.0 - smoothstep(0.015, leaf ? .071 : .095, across);
            ${bark ? `float crownGrain = dot(strands * grainCoverage, vec2(.27, .15));
            ${detailedGrain ? `
            crownGrain += (pigment - .5) * .45;
            ` : ''}
            tint *= (leaf ? 1.04 : .92) + crownGrain * .58 + stem * .13;
            tint *= mix(vec3(.88, .92, .80), vec3(1.12, 1.07, 1.02), smoothstep(-.35, .65, crownGrain));
            ` : ''}
            relief = vec2(.007 * strands.x + .005 * stem, .004 * strands.y);
        }
        ` : ''}
        ${groundContact ? treeRootGroundShader(snow) : ''}
        ${mappedRelief ? `#ifndef SM_NORMALBIAS
        if (vTreeSurface.w > 0.0${limitBark ? ' && detailedBarkHere' : ''}) {
            float barkStrength = (vTreeWeather.z > .5 && vTreeWeather.z < 1.5 ? .48 : 1.12) * (1.0 - snowWeight);
            normalW = treeBarkNormalW(normalW, barkUV, barkStrength${limitBark ? ' * barkDetailFade' : ''});
        }
        #endif` : relief ? `#ifndef SM_NORMALBIAS
        ${limitBark ? 'if (detailedBarkHere) ' : ''}normalW = treeReliefNormal(normalW, p, relief,
            grainCoverage * (1.0 - snowWeight)${limitBark ? ' * barkDetailFade' : ''});
        #endif` : ''}
        return tint;
        }
    ` : ''
    material.Fragment_Definitions(fragmentDefinitions + surfaceFunction)
    if (groundContact) getTreeGroundSurface(scene).configure(material)
    const inputTint = cards ? `(${CARD_COLOR} * ${CARD_COLOR})` : 'vTreeColor'
    if (material instanceof PBRCustomMaterial) {
        if (nightFill) {
            material.AddUniform('treeNightFill', 'vec2', nightFill)
            material.Fragment_Before_Fog('finalColor.rgb += surfaceAlbedo * treeNightFill.x * treeNightFill.y;')
        }
        material.Fragment_Before_Lights(hasSurface
            ? `surfaceAlbedo *= treeSurfaceColor(vPositionW, geometricNormalW, normalW, ${inputTint});`
            : `surfaceAlbedo *= ${inputTint};`)
        if (cutout) material.Fragment_Before_FragColor(blendAlpha.replace('treeOutput', 'finalColor'))
    } else {
        const color = hasSurface ? `
            vec3 treeNormal = ${unlitNormals ? 'normalize(vTreeNormal)' : 'vec3(0.0, 1.0, 0.0)'};
            vec3 treeColor = treeSurfaceColor(vPositionW, treeNormal, treeNormal, ${inputTint});
            ${relief ? `
                // A fixed light makes the relief measurable even with PBR lighting disabled.
                treeColor *= 0.65 + 0.35 * max(0.0, dot(treeNormal, vec3(0.36, 0.8, 0.48)));
            ` : ''}
            result.rgb = sqrt(max(treeColor, vec3(0.0)));
        ` : `result.rgb = ${cards ? CARD_COLOR : 'vTreeColor'};`
        material.Fragment_Before_FragColor(color + blendAlpha.replace('treeOutput', 'color'))
    }
    const surfaceSamplers = Number(texturedBark) + Number(mappedRelief) + Number(groundContact)
    if (weathering || detailedGrain) configureTerrainNoiseTexture(material, surfaceSamplers)
    addShadowDepth(material, scene)
    return material
}

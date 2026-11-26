export const woodPatinaShader = `
    vec3 applyWoodPatina(vec3 woodColor, vec2 patinaUV, float exposure) {
        float weathering = terrainNoise(patinaUV * vec2(2.2, 1.8)) * 0.78
            + terrainNoise(patinaUV * vec2(9.0, 4.5) + vec2(4.1, 7.8)) * 0.22;
        float faded = smoothstep(0.36, 0.77, weathering) * exposure;
        float stain = (1.0 - smoothstep(0.19, 0.40, weathering)) * exposure;
        float woodLuma = dot(woodColor, vec3(0.2126, 0.7152, 0.0722));
        return mix(woodColor, vec3(woodLuma), faded * 0.30) * (1.0 + faded * 0.20 - stain * 0.21);
    }
`

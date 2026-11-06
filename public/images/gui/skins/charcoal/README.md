# Charcoal raster skin

Skin URLs are centralized in `public/styles/gui-skin.css`. Replace this directory
with a matching set or override its `--gui-*` variables to switch skins.

PNG assets retain transparent corners. CSS nine-slice uses 24 source pixels for
`panel.png` (painted at 8 CSS px) and 18 for the three button frames (5 CSS px).
Keep these corner/slice dimensions when replacing images; centers and straight
edges can vary in length. `*-surface.png` images supply the separate interior,
so the frame corners never stretch. Checkbox, thumb and track images scale to
the existing control dimensions. Labels and icons are never baked into textures.

Offline preview: `/adminUtils/gui` (no game/network initialization).
`tools/extract-gui-skin.ps1 -AtlasPath <atlas>` reproduces these crops from the
1254 × 1254 ImageGen atlas. Reference: supplied charcoal/bronze settings design.
Generation prompt: flat orthographic, text-free charcoal brushed metal panel,
thin rounded pewter frame, neutral/selected/pressed bronze buttons, square
checkboxes and slider thumb, recessed dark and filled gold tracks, subtle grain.

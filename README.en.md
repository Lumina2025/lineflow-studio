# Lineflow · Flow Studio

Animate connections in an existing flowchart, architecture diagram or mind map, then export a seamlessly looping GIF.

Try it online: [English](https://lineflow-studio-zilliz-oct22.shuhongwang2024.chatgpt.site/?lang=en) · [中文](https://lineflow-studio-zilliz-oct22.shuhongwang2024.chatgpt.site/)

## Use it

1. Import a PNG, JPG, WebP or SVG image, or drag one onto the editor.
2. Lineflow detects clear, dark arrowheads and connections and creates editable flow paths automatically.
3. Drag control points to refine a path. For missed connections, click along the line from start to end, including bends, then press Enter or double-click to finish.
4. Adjust the path style, color, width, direction and global motion settings.
5. Choose the output size, duration and frame rate, then export your GIF.

Use the **EN / 中文** button in the header to switch languages without resetting the current project. The shareable English URL ends with `?lang=en`.

Automatic detection works best with dark, high-contrast, horizontal or vertical connections and solid arrowheads on a light background. Pale or curved lines and busy backgrounds may need manual correction. **Detect arrows again** replaces only automatically generated paths; manually drawn paths remain.

All image processing and GIF encoding happen in your browser. Images are not uploaded. SVG files become raster backgrounds rather than editable SVG paths. Large images may exceed browser storage; use **Save project** to keep a `.lineflow.json` file.

## Offline use

Run `python3 local_server.py` in this folder. Python 3 is required. Open the local URL shown in your browser. The page needs a local HTTP server for its JavaScript modules and GIF Worker.

## Shortcuts

- **P** draw a path; **V** select; **Enter** or double-click finish; **Esc** cancel.
- While drawing, **Backspace** removes the last point.
- **Delete / Backspace** deletes the selected path.
- **⌘Z / Ctrl+Z** undoes; **⌘⇧Z / Ctrl+Shift+Z** redoes.
- **Space** plays or pauses the preview.

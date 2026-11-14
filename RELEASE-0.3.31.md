# BananaForge 0.3.31

## New animated startup scene

- Adds an original BTD6-inspired map scene to the startup screen, with balloons following a winding route and a small tower firing at a target.
- Keeps the startup status and progress visible while the workspace loads, then transitions into the app.
- Honors the operating system's reduced-motion preference with a composed still scene.
- Stops all scene animation when loading finishes or fails, including when the user retries.

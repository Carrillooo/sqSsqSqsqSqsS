# Origen — café de especialidad

Web de un tostador de café ficticio: taza de cristal 3D que se llena con el scroll,
configurador de capas (base, leche, espuma, sirope, topping, tamaño), complementos
y pedido con hora de recogida. **Pago de demostración: no se cobra nada.**

## Verla en local

```bash
python3 -m http.server 5173
```

Abre http://localhost:5173. No hay paso de build: `index.html` + `style.css` + `main.js` + `scene.js`
(three.js, GSAP, ScrollTrigger y Lenis alojados en `vendor/`; fuentes en `assets/fonts/`).

Decisiones de diseño en `brief.md`. Construida con el kit Everen (`CLAUDE.md`, `system/`).

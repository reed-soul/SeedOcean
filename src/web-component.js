// <water-canvas> — declarative mount point for SeedOcean.
//
// Usage:
//   <water-canvas preset="coastal" quality="quality" demo></water-canvas>
//   <script type="module">import 'seedocean/web-component.js';</script>
//
// Mirrors src/main.js's bootstrap: capability check → SeedOcean.create →
// setAnimationLoop(update → render). The host element becomes the canvas
// container. Disconnection disposes the renderer.

import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { SeedOcean } from './seedocean.js';

class SeedOceanCanvas extends HTMLElement {
  constructor() {
    super();
    this._seedOcean = null;
    this._onResize = this._onResize.bind(this);
  }

  static get observedAttributes() {
    return ['preset', 'quality', 'demo'];
  }

  /** @returns {Promise<SeedOcean>} */
  get seedOcean() {
    return Promise.resolve(this._seedOcean);
  }

  async connectedCallback() {
    if (this._seedOcean) return;
    if (!WebGPU.isAvailable()) {
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: 'WebGPU is required. Use Chrome 113+ or Edge 113+.' },
      }));
      return;
    }

    this._seedOcean = await SeedOcean.create({
      container: this,
      preset: this.getAttribute('preset') || undefined,
      quality: this.getAttribute('quality') === 'quality' ? 'quality' : 'perf',
      demoObjects: this.hasAttribute('demo'),
    });

    this._onResize();
    window.addEventListener('resize', this._onResize);

    const animate = () => {
      this._seedOcean.update();
      this._seedOcean.render();
    };
    this._seedOcean.renderer.setAnimationLoop(animate);

    this.dispatchEvent(new CustomEvent('ready', { detail: { seedOcean: this._seedOcean } }));
  }

  attributeChangedCallback(name, _old, value) {
    const so = this._seedOcean;
    if (!so) return;
    if (name === 'preset' && value) {
      so.applyPreset(value);
    }
  }

  _onResize() {
    if (!this._seedOcean) return;
    const w = this.clientWidth || window.innerWidth;
    const h = this.clientHeight || window.innerHeight;
    this._seedOcean.resize(w, h);
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this._onResize);
    if (this._seedOcean) {
      this._seedOcean.dispose();
      this._seedOcean = null;
    }
  }
}

const tagName = 'water-canvas';
if (!customElements.get(tagName)) {
  customElements.define(tagName, SeedOceanCanvas);
}

export { SeedOceanCanvas };

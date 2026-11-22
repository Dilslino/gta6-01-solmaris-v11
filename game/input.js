// SOLMARIS — keyboard input state.
export class Input {
  constructor() {
    this.keys = {};
    this.pressed = {};
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }
  down(k) { return !!this.keys[k]; }
  // True only on the frame the key went down.
  hit(k) { return !!this.pressed[k]; }
  get up() { return this.down('w') || this.down('arrowup'); }
  get downKey() { return this.down('s') || this.down('arrowdown'); }
  get left() { return this.down('a') || this.down('arrowleft'); }
  get right() { return this.down('d') || this.down('arrowright'); }
  get brake() { return this.down('shift'); }
  endFrame() { this.pressed = {}; }
}

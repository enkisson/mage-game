// Keyboard and trackpad input.
// Left hand: WASD, Space, Shift. Right hand moves between the trackpad (look, click to cast)
// and the arrow keys (speak sigils).

export type SigilSlot = 0 | 1 | 2 | 3;

/** Arrow keys in the order the HUD draws them: up, left, right, down. */
export const SIGIL_KEYS: Record<string, SigilSlot> = {
  ArrowUp: 0,
  ArrowLeft: 1,
  ArrowRight: 2,
  ArrowDown: 3,
};

const CAPTURED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'Enter']);

export class Input {
  private down = new Set<string>();
  private pressed: string[] = [];
  private lookX = 0;
  private lookY = 0;
  private clicks = 0;

  /** True while the pointer is captured by the game. */
  locked = false;
  /** Pointer lock can be refused (some embedded views). Then we look with plain mouse movement. */
  lockUnavailable = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.push(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.locked && !this.lockUnavailable) {
        this.requestLock();
        return;
      }
      this.clicks++;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.lockUnavailable) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockUnavailable = true;
      this.onLockChange(true);
    });
  }

  requestLock() {
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          this.lockUnavailable = true;
          this.onLockChange(true);
        });
      }
    } catch {
      this.lockUnavailable = true;
      this.onLockChange(true);
    }
  }

  /** The game counts as having the player's attention when the pointer is captured (or cannot be). */
  get active() {
    return this.locked || this.lockUnavailable;
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  /** Keys pressed since the last call, in order. */
  takePressed(): string[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  takeLook(): [number, number] {
    const out: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  takeClicks(): number {
    const c = this.clicks;
    this.clicks = 0;
    return c;
  }

  /** Test hook: feed input without a real device. */
  inject(kind: 'key' | 'click' | 'look', a?: string | number, b?: number) {
    if (kind === 'key' && typeof a === 'string') this.pressed.push(a);
    if (kind === 'click') this.clicks++;
    if (kind === 'look') {
      this.lookX += Number(a) || 0;
      this.lookY += b || 0;
    }
  }

  hold(code: string, on: boolean) {
    if (on) this.down.add(code);
    else this.down.delete(code);
  }
}

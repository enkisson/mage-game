// Speaking. Arrow keys add sigils to the sentence; a click (or Enter) casts it.
import type { Game } from '../game/game';
import type { SigilId } from './sigils';
import { resolve, type SpellDef } from './grammar';
import { saveKnowledge } from '../game/save';

/** Seconds each sigil takes to speak. */
const SPEAK_TIME = 0.16;

export class Caster {
  readonly sentence: SigilId[] = [];
  /** How many words can be held at once. Two, until the third is learned at the Cloud Bridge. */
  maxWords = 2;
  /** Seconds until the next sigil or cast is possible. */
  busy = 0;
  /** Counts up from each cast, for the hand animation. */
  sinceCast = 99;
  /** Counts up from each spoken sigil. */
  sinceSpoke = 99;

  constructor(private game: Game) {}

  /** The spell the current sentence would cast, if it is a sentence. */
  get pending(): SpellDef | null {
    const r = resolve(this.sentence, this.maxWords);
    return r.ok ? r.spell : null;
  }

  known(spell: SpellDef) {
    return this.game.knowledge.sentences.includes(spell.key);
  }

  speak(slot: number) {
    const { game } = this;
    if (this.busy > 0) return;
    const id = game.knowledge.bound[slot];
    if (!id) {
      game.hud.whisper(game.knowledge.sigils.length ? 'No word sits on that key yet.' : 'You know no words. Find the journal.');
      return;
    }
    if (this.sentence.length >= this.maxWords) {
      game.hud.whisper('You cannot hold a third word. Not yet.');
      game.hud.shakeSentence();
      return;
    }
    this.sentence.push(id);
    this.busy = SPEAK_TIME;
    this.sinceSpoke = 0;
    game.view.speak(id, this.sentence.length - 1);
    game.sound.speak(id, this.sentence.length > 1);
    game.hud.setSentence(this.sentence, this.pending, this.pending ? this.known(this.pending) : false);
  }

  drop() {
    if (!this.sentence.length) return;
    this.sentence.length = 0;
    this.game.view.release(false);
    this.game.sound.drop();
    this.game.hud.setSentence(this.sentence, null, false);
  }

  cast() {
    const { game } = this;
    if (this.busy > 0 || !this.sentence.length) return;
    const spell = this.pending;
    if (!spell) {
      game.hud.whisper('The words do not hold together.');
      this.drop();
      return;
    }
    if (game.player.focus < spell.cost) {
      game.hud.whisper('Not enough focus.');
      game.hud.shakeFocus();
      return;
    }
    const problem = game.spells.problem(spell);
    if (problem) {
      game.hud.whisper(problem);
      return;
    }
    // The hands wind up first; the spell itself is made on the strike, a moment later.
    const wait = game.view.release(true, spell);
    this.busy = wait + spell.recovery;
    this.sinceCast = 0;
    this.sentence.length = 0;
    game.hud.setSentence(this.sentence, null, false);
    this.winding = { spell, t: wait };
  }

  /** A cast that has begun but not yet left the hands. */
  private winding: { spell: SpellDef; t: number } | null = null;

  private strike(spell: SpellDef) {
    const { game } = this;
    const problem = game.player.focus < spell.cost ? 'Not enough focus.' : game.spells.cast(spell);
    if (problem) {
      game.view.strike(null, false);
      game.hud.whisper(problem);
      this.busy = Math.min(this.busy, 0.2);
      return;
    }
    game.player.spendFocus(spell.cost);
    game.view.strike(spell);
    game.sound.cast(spell);
    if (spell.cost >= 35) game.hitStop(0.045);
    if (!this.known(spell)) {
      game.knowledge.sentences.push(spell.key);
      saveKnowledge(game.knowledge);
      game.hud.discovery(spell);
      game.sound.discovery();
    } else {
      game.hud.named(spell);
    }
  }

  /** Abandon whatever is half said or half cast (on dying, on waking). */
  reset() {
    this.sentence.length = 0;
    if (this.winding) this.game.view.strike(null, false);
    else this.game.view.release(false);
    this.winding = null;
    this.busy = 0;
    this.game.hud.setSentence(this.sentence, null, false);
  }

  update(dt: number) {
    this.busy = Math.max(0, this.busy - dt);
    this.sinceCast += dt;
    this.sinceSpoke += dt;
    if (this.winding) {
      this.winding.t -= dt;
      if (this.winding.t <= 0) {
        const { spell } = this.winding;
        this.winding = null;
        this.strike(spell);
      }
    }
  }
}

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
    game.hud.setSentence(this.sentence, this.pending, this.pending ? this.known(this.pending) : false);
  }

  drop() {
    if (!this.sentence.length) return;
    this.sentence.length = 0;
    this.game.view.release(false);
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
    const problem = game.spells.cast(spell);
    if (problem) {
      game.hud.whisper(problem);
      return;
    }
    game.player.spendFocus(spell.cost);
    this.busy = spell.recovery;
    this.sinceCast = 0;
    game.view.release(true, spell);
    this.sentence.length = 0;
    game.hud.setSentence(this.sentence, null, false);

    if (!this.known(spell)) {
      game.knowledge.sentences.push(spell.key);
      saveKnowledge(game.knowledge);
      game.hud.discovery(spell);
    } else {
      game.hud.named(spell);
    }
  }

  update(dt: number) {
    this.busy = Math.max(0, this.busy - dt);
    this.sinceCast += dt;
    this.sinceSpoke += dt;
  }
}

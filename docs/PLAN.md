# Gloamtide: game plan

Status: **v0.2, direction agreed. The first playable slice (the Wreck Shore) is built and on its second pass.** Sections marked *provisional*
are my proposals and easy to change; everything else reflects decisions you have made.

## The pitch

You are a **ship hand**. Your ship breaks up on the rocks of an island that is on no chart, and you
wash ashore beside a robed body with a journal in its hand. The journal teaches you a single word of
magic. By the time night falls you need it.

Gloamtide is a **first-person roguelike** about crossing that island, one biome and one night at a
time, to reach the sanctum at its summit. Every biome is a journey with places where the way is
sealed and you must survive a wave to move on. Every biome also hides more of the dead mage's
journals, and each one teaches you another word.

When you die, the tide carries you back to the shore. **The only thing you keep is what you know:**
the sigils you have learned and the sentences you have discovered.

At the summit waits the mage who wrote the journals, corrupted by the thing he was trying to hold
back. He knows every spell he taught you. To beat him you have to show that your magic has gone
beyond his.

### Design pillars

1. **Every spell matters.** No spamming. A spell is a short sentence you compose on purpose, and
   each one is strong, distinct and useful for something.
2. **Knowledge is the progression.** Nothing numeric carries between runs. You get further because
   you know more words and more sentences, and because you have learned the island.
3. **Fights are about position.** Every biome has real height: cliffs, ledges, platforms, bridges.
   High ground, falls and chokepoints decide fights as much as damage does.
4. **A journey, not an arena.** Ten stops from the shore to the summit. It should feel like an
   expedition.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Engine | Web: TypeScript, three.js, Vite. An Unreal Engine version is a possible later project. |
| Players | Single-player. |
| Controls | Keyboard and trackpad (you play on a Mac). WASD to move, trackpad to look, arrow keys for sigils. |
| Casting | No staff. Bare hands and sigils combined into sentences. |
| Sigils | A pool of eight to start: Fire, Ice, Stone, Wind, Push, Pull, Bind, Break. You bind four to the arrow keys at the start of each run. |
| Persistence | Knowledge only: learned sigils and discovered sentences. |
| Structure | Each biome is one level and one night: a journey with wave stands. |
| Run length | Ten stops, about 75 minutes for a full successful run. |
| Art | More realistic. Free scanned assets (Poly Haven) for landscape, sky and light. |
| Name | Gloamtide. |

## Magic: sigils and sentences

### Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Trackpad | Look and aim |
| Space | Jump |
| Left Shift | Dodge: a short dash with a moment of invulnerability |
| Arrow keys | Speak a sigil. Up to three in a row make a sentence. |
| Click, or Enter | Cast the sentence where you are looking |
| Backspace | Drop the sentence without casting |
| E | Read a journal, use the camp |
| Tab | Open your own journal (sigils and sentences you know) |

Your right hand moves between the trackpad and the arrow keys. That is deliberate: you choose a
moment to speak, then you aim and release. You can keep moving with your left hand the whole time.

On screen, the first word of a sentence forms in your character's left hand and the second in the
right. Each sigil has its own hand sign (a cupped palm for Fire, a fist for Stone, two raised
fingers for Wind, a flat palm for Push), and each kind of spell has its own cast gesture. The
sigils you have bound are marked on the backs of your hands and flare when spoken.

### Why you cannot spam

- **Focus** is the resource (100). A one-sigil sentence costs 15, two cost 35, three cost 60. Focus
  comes back quickly, but only after a second of not casting.
- Each sigil takes a beat to speak, and each cast has a short recovery, longer for heavier spells.
- Enemies are **fewer and tougher** than in the first plan. A wave is 6 to 12 creatures that each
  need an answer, not 40 that need a hose.

### The eight sigils

Four are **matter** (what the spell is made of) and four are **intent** (what it does).

| Matter | Carries | Intent | Does |
| --- | --- | --- | --- |
| **Fire** | Burn: damage over time, spreads | **Push** | Throws things away from you |
| **Ice** | Chill, then Freeze | **Pull** | Drags things toward a point, or you toward it |
| **Stone** | Stagger; makes solid ground | **Bind** | Holds things in place |
| **Wind** | Lifts and scatters; fast | **Break** | Shatters: armour, the frozen, the bound, conjured ground |

### How a sentence is read

- **Matter alone** is thrown: Fire is a firebolt, Stone a boulder.
- **The same matter twice** is its great form, and three of the four reshape the battlefield:
  Fire Fire is a fireball; **Stone Stone raises a pillar you can stand on**; **Ice Ice** raises
  an ice wall; **Wind Wind is an updraft** that launches you (or them) upward.
- **Matter with intent** is that intent carried out in that matter: Fire Push is a wave of flame that
  hurls enemies back burning; Stone Bind is a cage of rock; Ice Break shatters everything frozen;
  Wind Pull is a vortex.
- **Two different matters** make a hybrid: Fire and Stone is a pool of magma, Fire and Ice a cloud of
  blinding steam, Wind and Stone a sandstorm.
- **Two intents** are pure force: Push Pull yanks a creature in and hurls it away; Bind Break
  executes something already held.
- **Three sigils** are great sentences: slow, costly and decisive. They are unlocked late (see the
  Cloud Bridge) and almost none of them are written in the journals.

With all eight sigils there are 8 one-word and 36 two-word sentences. Each is built from shared
parts (a delivery shape, a payload, a force), then tuned by hand so it earns its place. The first
slice implements four sigils and the fourteen sentences they make.

### Binding

At the start of each run, at the body on the shore, you choose which four of your known sigils sit
on the arrow keys. On your first run you know one. Choosing four out of eight is 70 different mages.

### Knowledge, and the ending

- **Journals teach sigils.** A sigil, once read, is yours on every future run.
- **Sentences are discovered by speaking them.** Any sentence you can form works the first time you
  try it. Your own journal records it, with what it did.
- The mage's journals describe some two-word sentences as worked examples. They describe **no**
  three-word sentences, and he left many pairs unwritten.
- **The final fight turns on this.** The Hollow Warden turns aside any sentence written in his
  journals: he wrote the counters. Sentences you found yourself land in full. Winning means arriving
  with magic that is yours.

## The journey

Ten stops. Each biome is one night: a path with **three wave stands**, journal pages along the way,
a guardian at the end, and a camp before the next biome. The island climbs from sea level to a
summit above the clouds. Journal teachings are what you learn the *first* time you reach them.

| # | Stop | What the ground does | First visit teaches |
| --- | --- | --- | --- |
| 1 | **The Wreck Shore** | Beach, sea stacks, the broken hull as platforms and ramps | Fire, your first word |
| 2 | **Salt Marsh** | Boardwalks and stilt towers over mud that slows and sinks | Push |
| 3 | **Storm Coast** | Cliff switchbacks, sea arches, narrow ledges, gusts that shove you | Wind |
| 4 | **Drowned Forest** | Giant roots and canopy walkways above a flooded floor | Pull |
| 5 | **Bone Canyon** | A narrow gorge crossed by rib bridges; rockfalls | Stone |
| 6 | **Frost Caverns** | Ice shelves, frozen falls, slopes you slide on | Ice |
| 7 | **Ashen Highlands** | Lava rivers, basalt columns as stepping stones, vents | Break |
| 8 | **Sunken Academy** | Flooded halls, broken stairs, drifting library stacks | Bind |
| 9 | **Cloud Bridge** | Shattered spans over the void, floating debris, crosswinds | The third word: three-sigil sentences |
| 10 | **The Sanctum** | The arena from the concept art | The Hollow Warden |

### A wave stand

The path is sealed by a ward. The Gloam come in two or three groups from marked places, some of
them above or below you. The ground always offers a choice: a ledge that is safe from chasers but
exposed to spitters, a bridge that is a chokepoint and a trap, a ramp that is the only way up.
Enemies that are knocked off heights take fall damage, and so do you, with one exception: you
always land safely after riding an updraft.

After a stand you find one **charm**: a small boost for this run only (more focus, a wider blast,
a second dodge). Charms are lost when you die.

### Dying

The tide takes you back to the body on the shore. The island resets; you keep your sigils and your
sentences. You may rebind your four sigils and set out again. A run in progress can be suspended at
a camp between biomes.

## The Gloam (enemies) — *provisional*

The Gloam is what the mage failed to hold back: a tide that hollows out whatever it touches. The
first creatures you meet are the **drowned crew of your own ship**.

| Enemy | Role | Answer |
| --- | --- | --- |
| **Drowned** | Chaser. Tough, relentless, must path around heights | High ground, Push off ledges, burn |
| **Spitter** | Ranged. Lobs slow bolts up onto your ledge | Close the distance or break line of sight |
| **Bloater** | Walking bomb that hurts other Gloam too | Detonate it in their midst |
| **Wraith** | Flyer that ignores terrain | Bind it, Pull it down |
| **Brute** | Armoured tank; charges | Break its armour, make it charge off a cliff |

Each biome adds one or two creatures of its own, and each ends with a **guardian**. The Tidecaller
from the concept art becomes the guardian of the Cloud Bridge. The final boss is the **Hollow
Warden**: the mage himself, casting your own sentences back at you.

## Art direction

- **Realistic, grounded dark fantasy.** Scanned rock, sand, bark and foliage; real HDR skies; fog,
  water and physically based light. Magic is the only saturated colour in the world.
- **Free assets first.** Landscape, textures, props and skies come from Poly Haven (CC0). Creatures
  and people are the weak spot of free libraries, so the current creature models are placeholders.
- **Colour language is unchanged:** toxic green belongs to the Gloam; each sigil has its own colour
  (Fire orange, Ice cyan, Stone ochre, Wind pale silver; intents in violet).
- **Night lighting:** each biome is one night with its own sky and weather.
- The stylised concept art in `art/concept/` stays as the record of the first direction. The HUD,
  icon set and typefaces (Grenze Gotisch, Barlow Semi Condensed) carry over.

**Getting to photoreal later.** The browser on a laptop tops out at "realistic and atmospheric".
Film-like characters need three things this route does not have: authored or scanned character
models, a renderer built for them, and a machine with a strong GPU. The practical path is Unreal
Engine 5 (with its scanned-world and digital-human libraries), built in the editor on your own Mac.
The design, the sentence system and all the tuning data from the web version would carry over;
the code and scenes would be rebuilt. We agreed to treat that as a later project.

## Technology

- **Stack:** TypeScript, three.js, Vite. Tests with Vitest. Playable from a link.
- **Collision:** the world is real 3D geometry. The player is a capsule tested against a bounding
  volume hierarchy of the level mesh (`three-mesh-bvh`), so cliffs, ramps, ledges and conjured
  pillars all just work.
- **Navigation:** a height grid sampled from the level, with a flow field toward the player.
  Creatures can drop down ledges but must find a ramp to climb, which is what makes high ground
  worth holding.
- **Magic:** sentences resolve through a data-driven grammar (pure code, unit-tested), then run as
  a small set of delivery shapes: bolt, blast, wave, ring, zone, pillar, updraft.
- **Data-driven content:** sigils, sentences, enemies, stands and biomes are tables.
- **Persistence:** known sigils and discovered sentences in local storage.
- **UI:** HTML over the canvas.
- **Target:** 60 fps on a recent MacBook in a browser.

## Milestones

| Milestone | Scope | Done when |
| --- | --- | --- |
| M0 Plan | Plan, concept art, look-dev kit | Done |
| **M1 First playable: the Wreck Shore** | Movement with real 3D collision, trackpad look, sigil sentences (Fire, Push, Stone, Wind), the Drowned and Spitters with height-aware pathing, one wave stand, a journal that teaches a sigil, death and return, a realistic first pass on the shore | Done, and a second pass: rigged hands with signs and cast gestures, the scanned ship and shore |
| M2 The loop | Binding screen, your own journal, charms, camps, guardian fight, the full Wreck Shore with three stands | One complete biome, start to camp |
| M3 The first act | Salt Marsh, Storm Coast, Drowned Forest; Pull and the remaining enemies | Four biomes in a row feel like a journey |
| M4 The second act | Bone Canyon to Sunken Academy; Ice, Break, Bind; all 44 sentences | Eight biomes, the whole pool of sigils |
| M5 The summit | Cloud Bridge, three-word sentences, the Sanctum, the Hollow Warden | A run can be won |
| M6 Polish and release | Audio, effects, tuning, performance, settings | Shareable build |

## Open questions

Settled so far: the controls feel right on a trackpad; Fire is the first word; the body on the
shore is what the mage shed when the Gloam took him.

For the next play-through:

1. Do the hand signs and cast gestures feel clean in motion? Which feel slow or wrong?
2. Does the beached galleon suit the wreck, or should it be more broken up?
3. Is the stand in the cove too easy, too hard, or about right?
4. Creatures are the last placeholders. Stay with code-built ones for now, or look at paid or
   generated models?

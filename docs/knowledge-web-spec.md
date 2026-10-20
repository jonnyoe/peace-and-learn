# Peace and Learn: Knowledge Web + Study Mode Spec

This spec describes the next feature for the Peace and Learn React Native app: a visual "knowledge web" for each subject, with flashcard study built into it. It replaces a plain flashcard list as the main screen.

Target: iPhone 16, built in Xcode. Keep commits small and under the GitHub account github.com/jonnyoe.

---

## 1. The idea in one paragraph

Each subject is a web of connected bubbles. The subject sits in the center; related topics surround it, joined by strands. Any bubble can contain its own web inside it (webs within webs). Each web has its own to-do list. Tapping the center bubble starts a flashcard session for that web. Cards use an Anki-style scheduler (FSRS) in the background, but the user never sees due dates. Instead, how well each topic is known shows up visually: bubbles fade when they need review, and a lace-like pattern around each bubble grows more intricate as the topic becomes well learned. The pattern is purely aesthetic, not a score.

---

## 2. Data model

```
Web
  id
  title              // e.g. "Memory"
  parentWebId?       // null for a top-level subject
  centerNodeId

Node (a bubble)
  id
  webId              // the web it appears in
  title              // e.g. "Chunking"
  childWebId?        // set if this bubble has its own web inside
  motif              // pattern style, e.g. "chunks" (see section 6)
  motifParams?       // optional tweaks (symmetry count, etc.)

Edge (a strand)
  id
  webId
  fromNodeId
  toNodeId

Card
  id
  nodeId             // every card belongs to exactly one bubble
  front
  back
  fsrs               // FSRS card state from ts-fsrs (stability, difficulty, due, last_review, state, ...)

ReviewLog
  id
  cardId
  rating             // Again | Hard | Good | Easy
  reviewedAt

Todo
  id
  webId
  nodeId?            // optional link to a bubble
  text
  done
```

A to-do linked to a bubble that is inside a child web should also appear in the parent web's list (example: "Read ch. 4" is tied to Working memory and shows in both Working memory and Memory).

Seed the app with one sample subject so the screens can be built before real content exists:

- Web "Memory" (center: Memory). Neighbors: Working memory, Long-term memory, Attention, Chunking.
- Working memory has a child web. Center: Working memory. Neighbors: Central executive, Capacity limit, Phonological loop, Visuospatial sketchpad.
- Central executive has a child web with 3 bubbles (placeholder titles are fine).
- Long-term memory has a child web with 6 bubbles (placeholder titles are fine).
- A few cards per bubble.

---

## 3. Scheduling (FSRS)

Use the `ts-fsrs` package (FSRS v6, TypeScript). Its README lists Node >= 20 and does not mention React Native, so do a quick test that it imports and runs in the app before building on it. It is plain TypeScript, so it should work.

Rating buttons map to FSRS ratings:

| Button | FSRS rating |
|---|---|
| Forgot | Again |
| Hard | Hard |
| Medium | Good |
| Easy | Easy |

Desired retention: 0.9 (the default).

**Never show due dates or intervals in the UI.**

### Derived values per bubble (computed, not stored)

- **Recall** = average retrievability of the bubble's cards right now (`scheduler.get_retrievability(card, now)`).
- **Strength** = average stability of the bubble's cards.

These drive everything visual:

- **Faded bubble:** recall < 0.85. Draw it dashed and grey. Faded bubbles are what study sessions practice first.
- **Lace level (0 to 5 layers):** from strength. Stability thresholds: 3 days, 7 days, 21 days, 60 days, 180 days. Passing each one adds a layer. Stability rarely drops much, so the lace almost never shrinks. That is intentional: the pattern should feel calm, not like a score that can be lost.
- **Satellite color** (see section 5): based on the inner bubble's recall. Recall >= 0.9 is solid black; 0.85 to 0.9 is white with a black outline; below 0.85 is dashed grey.

New bubbles with no reviewed cards have lace level 0 and are not faded.

---

## 4. Screens and behavior

### 4a. Web screen (the home of each subject)

Top to bottom:

1. **Header:** breadcrumb of parent webs (e.g. "Psychology › Memory"), tapping it zooms out. Below it, the web title in large serif type.
2. **The web:** the center bubble (filled black, white text, a little larger) with its neighbors around it, connected by straight strands. Show only this web's bubbles, not the whole graph. Aim for up to about 6 neighbors.
   - Strong strands are solid lines. A strand to a faded bubble is dashed grey.
   - When both ends of a strand have lace level >= 3, draw small paired beads along it.
   - The center bubble shows a small "TAP TO STUDY" label under its title.
3. **To-do panel:** a white panel along the bottom with "To-dos · <web title>", a "+ Add" button, and checkable items. Each item shows the bubble it is linked to under its text.

Interactions:

- Tap a bubble that has a child web: zoom into that web (same screen layout, new data).
- Tap the center bubble: start study mode (4b).

### 4b. Study mode

When study mode starts:

- The to-do panel goes away.
- The web shrinks (scale about 0.6, animated) and stays at the top of the screen.
- A flashcard area appears below it.
- An "End session" button appears in the header.

Each card:

- A dashed ring circles the bubble the card belongs to, and the card shows a small tag with that bubble's name.
- The card shows the question. Below: "Say or write your answer, then check it." and a "Show answer" button.
- After "Show answer": the answer appears under a dashed divider, with the prompt "How well did you know it?" and four buttons, left to right:
  - **Forgot:** light grey background, grey text, solid grey border
  - **Hard:** solid black, white text
  - **Medium:** white, black text, dashed black border
  - **Easy:** white, black text, solid black border
- After rating: update the card with FSRS. If that bubble's lace level went up, fade in the new layer (about 1 to 1.5 seconds) and update its strand and faded state. Then show the next card.

Card selection: take the cards in this web, plus any nested webs, with the lowest recall first, so faded bubbles get practiced first. A session is short (around 10 to 20 cards; 4 is fine for the sample data).

End of session: a simple card saying which bubbles' patterns grew, and a "Back to the web" button that restores the full web and the to-do panel.

---

## 5. Satellites (bubbles inside a bubble)

If a bubble has a child web, draw a short stem and a small circle (radius about 5) outside it for each bubble inside, fanned out on the side facing away from the center bubble. Color each small circle by that inner bubble's recall (see section 3). This replaces any other "has a web inside" marker.

---

## 6. The lace patterns

Each bubble is surrounded by a pattern drawn with thin black lines (about 1.1 px). Layers are added outward from the bubble edge as the lace level goes up. Each bubble's pattern style (motif) matches its topic. Eventually the AI will choose the motif and its parameters from a fixed library; for now, assign them in the seed data.

Motif library (each draws up to 5 layers; layer 1 is closest to the bubble):

- **neuron** (used for Memory): dot ring → short branches → forked branches → second forks with synapse dots → wavy membrane ring
- **orbit** (Working memory): dot ring → two crossed elliptical orbits → four balls on the orbits → second pair of orbits with balls → dashed outer ring
- **rings** (Long-term memory): wobbly concentric rings like tree rings, one per layer; radial cracks at layer 4; small knots at layer 5
- **rays** (Attention): dot ring → rays of alternating length → inward-pointing chevrons → fine dot ring → dashed outer ring
- **chunks** (Chunking): dots in groups of three → brackets around each group → small three-dot clusters between groups plus arcs joining pairs of groups → tick marks → small outer circles
- **hub** (Central executive): dot ring → six spokes with end dots → arcs between spoke ends → small diamonds → wavy outer ring
- **slots** (Capacity limit): dot ring → four small squares (slots) → four small "overflow" circles between them → broken arc ring → double dot ring
- **wave** (Phonological loop): dot ring → wavy ring → second wavy ring offset by half a wave → third wavy ring → outer ring of small circles
- **sketch** (Visuospatial sketchpad): small plus marks → dot ring (more layers can follow the same style)

Draw them with `react-native-svg` paths generated in code from simple geometry (rings, arcs, ellipses, radial lines, dots). A bubble's radius is about 38 px (46 px for the center), and the full pattern extends about 42 px beyond it, so leave enough spacing between bubbles.

---

## 7. Visual style

The app should feel like ink on paper, and should work in grayscale for an e-ink-style screen later.

- Background (paper): `#F4F1EA`
- Panels and cards: `#FFFDF8`
- Ink (text, lines, solid bubbles): `#1F1F1F`
- Secondary text: `#5E5A52`
- Faded lines: `#A9A59C`; faded borders: `#8C887F`
- Dividers: `#E3DFD5`
- Fonts: Literata (serif) for titles, bubble labels and card text; IBM Plex Sans for UI labels and buttons
- No color accents, no gradients. Touch targets at least 44 px.

---

## 8. Suggested build order

Do these as separate steps, each in its own commit or small set of commits:

1. Add the data model, local storage, and the "Memory" seed data.
2. Web screen: draw the center bubble, neighbors and strands with react-native-svg (no lace yet).
3. Navigation into child webs and back out through the breadcrumb.
4. To-do panel per web (add, check off, linked bubble shown).
5. Add `ts-fsrs` (confirm it runs in the app first), the card model and the study mode flow with the four rating buttons.
6. Derived visuals: faded bubbles, lace levels, satellites, strand beads.
7. The motif library and the fade-in animation when a layer grows.

Not in scope yet: the on-device AI, generating cards from notes, and AI-chosen motifs.

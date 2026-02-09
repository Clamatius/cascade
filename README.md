# Cascade

A word game where falling letter tiles fill an inverted pyramid. When the board is full, each row is read left-to-right as a word. Valid dictionary words score points; longer words score dramatically more. Tap tiles from your hand to drop them, or drag settled tiles to rearrange - if you're fast enough.

Originally written as a Java applet for PlaySite in the early 2000s. Players still search for it 20 years later. This is a ground-up rebuild as a static web game, playable on phone or desktop.

## How to play

1. **Tap** a tile in your hand (top row) to drop it onto the board
2. **Drag** uncovered tiles to rearrange them - they'll fall from wherever you place them
3. When the board fills, rows are evaluated as words against the dictionary
4. Valid words score: letter values x length multiplier (7-letter words = 6x!)
5. Board clears and you keep going. Rounds are 2 minutes.

The trick is speed. Tiles cascade into the leftmost empty position, so clicking quickly in the right letter order lets you spell words without dragging.

## Development

```
npm install
npm run dev
```

Builds to a static site with `npm run build` (output in `dist/`).

## Tech

- Vite + TypeScript, zero runtime dependencies
- Canvas rendering with pointer events for unified mouse/touch input
- All audio synthesized via Web Audio API - no sound files
- ENABLE word list (~172k words) for dictionary lookup
- Seedable PRNG (xoshiro128**) for letter generation

## History

See `docs/description.txt` for the full story and `docs/2007_post.txt` for the original blog post. There's a [player video from 2006](https://www.youtube.com/watch?v=1TAe_tCPCoo) showing the original PlaySite version.

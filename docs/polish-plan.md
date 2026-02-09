# Cascade - Polish Plan

## Current State
- 3 commits: initial impl, hand-based gravity rework, HUD fix + high scores
- Core gameplay working: hand-based drop, leftmost-empty gravity, staggered clicks
- Scoring, dictionary, 2-min timer, high score table all functional
- Scrabble-tile canvas rendering, synthesized tile-click audio

## Polish Tasks

### 1. Audio - Word Clear Arpeggio
Ascending arpeggio on valid word clear, notes scale with word length:
- 2-letter word: 2 quick notes (C5, E5)
- 3-letter: 3 notes (C5, E5, G5)
- 4-letter: 4 notes (C5, E5, G5, C6)
- 5-letter: 5 notes ascending
- 6-letter: 6 notes
- 7-letter (row 0): full octave arpeggio, slightly longer sustain
Each note is a sine wave ~80ms apart. Higher multiplier rows = more dopamine.
Add a deeper "board clear whoosh" after all rows evaluated.

### 2. Full-Board Bonus Celebration
When ALL rows contain valid words (incredibly rare/difficult):
- Extra score multiplier (2x total board score?)
- Extended celebration: rapid ascending arpeggio, then sustained chord
- Canvas flash effect (brief white overlay that fades)
- Floating "PERFECT BOARD!" text
- This is the Peggle moment - go over the top

### 3. Clear Animation
During the 1.2s clearing phase:
- Show the actual word text overlaid on each row (so player sees what they spelled)
- Valid words: text in gold, pulsing glow
- Invalid rows: text in dim red, no glow
- Tiles scale up slightly (1.05x) then shrink to 0 as they clear
- Stagger the clear per-row top-to-bottom with slight delay

### 4. Tile Settle Bounce
When a tile settles (gravity stops), brief elastic overshoot:
- Tile lerps past target by ~3px, then bounces back
- Gives physicality to the landing

### 5. Hand Row Visual Distinction
Subtle separator between hand (row 0) and the board:
- Thin dashed line or slight gap increase
- Hand slots slightly different shade
- Gentle pulse on hand tiles when board is waiting for input

### 6. Mobile Testing Sizes
Test and verify at:
- 375x667 (iPhone SE) - smallest common phone
- 390x844 (iPhone 14)
- 412x915 (Pixel 7)
Ensure tiles are large enough to tap, HUD readable, no overflow.

### 7. Start Screen
More polished start screen:
- CASCADE title with tile-style letters
- Brief instruction text: "Tap tiles to drop. Make words!"
- High score shown if exists

### 8. PWA Meta Tags
Add to index.html for "add to home screen":
- apple-mobile-web-app-capable
- theme-color matching board green
- Basic manifest.json

## Implementation Order
1 (arpeggio) → 2 (full board) → 3 (clear animation) → 4 (bounce) → 5 (hand visual) → 7 (start screen) → 6 (mobile test) → 8 (PWA)

Items 1-3 are highest impact for the Pavlov/dopamine factor.

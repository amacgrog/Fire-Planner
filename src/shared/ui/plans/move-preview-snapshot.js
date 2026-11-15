// The held move preview's snapshot (the real settings while a move is previewed)

  // { real, label } exactly while a move is previewed, else null: the UI's single "is a move previewed" test.
  // Imports nothing, so autosave can read it with no cycle.
  export let movePreview = null;
  export function assignMovePreview(p) {
    movePreview = p;
  }

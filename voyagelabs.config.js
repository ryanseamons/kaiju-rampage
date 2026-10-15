// Voyage Labs hosting (https://voyage.io/labs): the static build plus a small game server (labs/backend.ts)
// that keeps the high-score board. "compatible" startup means the platform shows the game once the page
// loads, with no VoyageLabs.ready() handshake.
export default {
  game: 'kaiju-rampage',
  client: {
    directory: 'dist',
    entrypoint: 'index.html',
    engine: { name: 'web' },
    capabilities: { threads: false },
    startup: { mode: 'compatible' },
  },
  backend: { entry: 'labs/backend.ts' },
};

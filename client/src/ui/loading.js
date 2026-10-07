// Loading screen (index.html #loading). main.js reports each real start-up step here, then
// finishLoading() removes the screen and the player is in the lobby.
const root = document.getElementById('loading');
const statusText = document.getElementById('loading-status');

export function loadingStatus(text) {
  if (statusText) statusText.textContent = text;
}

// The loading screen is static: it is removed in one step once the game is ready (no fade).
export function finishLoading() {
  root?.remove();
}

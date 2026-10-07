// Loading screen (index.html #loading). main.js reports each real start-up step here, then
// finishLoading() fades the screen out and the player is in the lobby.
const root = document.getElementById('loading');
const statusText = document.getElementById('loading-status');

export function loadingStatus(text) {
  if (statusText) statusText.textContent = text;
}

export function finishLoading() {
  if (!root || root.classList.contains('is-done')) return;
  root.classList.add('is-done');
  setTimeout(() => root.remove(), 600);
}

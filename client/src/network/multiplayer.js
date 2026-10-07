import * as THREE from 'three';
import { LegionCharacter } from '../bloxity/legion-avatar.js';

function newClientId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createMultiplayer(onMessage) {
  const clientId = newClientId();
  let socket = null;
  let closed = false;
  let retryDelay = 1000;
  let reconnectTimer = null;
  let retries = 0;                          // reconnect attempts since the last successful connection

  function connect() {
    if (closed) return;
    if (socket) window.dispatchEvent(new CustomEvent('cc:network-retry', { detail: { attempt: ++retries } }));
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const endpoint = import.meta.env.VITE_REALTIME_URL || `${protocol}//${location.host}/api/realtime`;
    const url = new URL(endpoint, location.href);
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.protocol === 'http:') url.protocol = 'ws:';
    url.searchParams.set('id', clientId);
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener('open', () => {
      retryDelay = 1000; retries = 0;
      window.dispatchEvent(new CustomEvent('cc:network', { detail: { connected: true } }));
      window.dispatchEvent(new CustomEvent('cc:identify-request'));
    });
    ws.addEventListener('message', (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch (error) {
        console.error('[multiplayer] invalid server message:', error);
      }
    });
    ws.addEventListener('error', () => {
      console.warn('[multiplayer] connection failed; reconnecting when the server is available.');
      window.dispatchEvent(new CustomEvent('cc:network', { detail: { connected: false } }));
    });
    ws.addEventListener('close', () => {
      if (socket !== ws) return;
      window.dispatchEvent(new CustomEvent('cc:network', { detail: { connected: false } }));
      if (!closed) {
        reconnectTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      }
    });
  }

  function send(type, data = {}) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, ...data }));
    return true;
  }

  connect();
  return {
    send,
    clientId,
    get connected() { return socket?.readyState === WebSocket.OPEN; },
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    }
  };
}

function makeNameTag(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  context.font = "700 36px 'Montserrat', 'Fredoka'";
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(0,0,0,.75)';
  context.fillStyle = '#ffffff';
  context.strokeText(name.slice(0, 24), 160, 36, 300);
  context.fillText(name.slice(0, 24), 160, 36, 300);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  tag.scale.set(5.6, 1.26, 1);
  tag.position.y = 7.4;
  return tag;
}

export function createRemotePlayers(scene) {
  const remotePlayers = new Map();
  const stations = new Map();

  function updatePlayer(data) {
    if (!data?.id) return;
    let remote = remotePlayers.get(data.id);
    if (!remote) {
      const character = new LegionCharacter({
        skinUrl: data.skinUrl,
        equipped: data.equipped,
        castShadow: false
      });
      character.root.add(makeNameTag(data.name || 'Player'));
      scene.add(character.root);
      remote = {
        character,
        target: new THREE.Vector3(),
        initialized: false,
        heading: 0,
        state: 'idle',
        name: data.name || 'Player',
        skinUrl: data.skinUrl,
        equipped: JSON.stringify(data.equipped || {}),
        proportions: JSON.stringify(data.proportions || {})
      };
      remotePlayers.set(data.id, remote);
    } else {
      if (remote.name !== data.name) {
        remote.character.root.children.find((child) => child.isSprite)?.material.map.dispose();
        const oldTag = remote.character.root.children.find((child) => child.isSprite);
        if (oldTag) remote.character.root.remove(oldTag);
        remote.character.root.add(makeNameTag(data.name || 'Player'));
        remote.name = data.name || 'Player';
      }
      if (remote.skinUrl !== data.skinUrl && data.skinUrl) {
        remote.character.setSkin(data.skinUrl);
        remote.skinUrl = data.skinUrl;
      }
      const equipped = JSON.stringify(data.equipped || {});
      if (remote.equipped !== equipped) {
        remote.character.applyEquipped(data.equipped || {});
        remote.equipped = equipped;
      }
      const proportions = JSON.stringify(data.proportions || {});
      if (remote.proportions !== proportions) {
        const height = Number(data.proportions?.height);
        remote.character.root.scale.set(1, Number.isFinite(height) ? height : 1, 1);
        remote.proportions = proportions;
      }
    }
    if (data.position && [data.position.x, data.position.y, data.position.z].every(Number.isFinite)) {
      remote.target.set(data.position.x, data.position.y, data.position.z);
      if (!remote.initialized) {
        remote.character.root.position.copy(remote.target);
        remote.initialized = true;
      }
    }
    if (Number.isFinite(data.heading)) remote.heading = data.heading;
    if (['idle', 'walk', 'airborne'].includes(data.state)) remote.state = data.state;
  }

  function handleMessage(message) {
    if (message.type === 'snapshot') {
      for (const player of message.players || []) updatePlayer(player);
      for (const station of message.stations || []) {
        stations.set(station.stationId, station);
        window.dispatchEvent(new CustomEvent('cc:multiplayer-message', {
          detail: { type: 'station-updated', ...station }
        }));
      }
      window.dispatchEvent(new CustomEvent('cc:stations', { detail: [...stations.values()] }));
    } else if (message.type === 'player-joined' || message.type === 'player-updated') {
      updatePlayer(message.player);
    } else if (message.type === 'player-left') {
      const remote = remotePlayers.get(message.id);
      if (remote) {
        scene.remove(remote.character.root);
        remote.character.root.traverse((child) => {
          if (child.isSprite) child.material.map?.dispose();
        });
        remotePlayers.delete(message.id);
      }
    } else if (message.type === 'station-updated') {
      stations.set(message.stationId, message);
      window.dispatchEvent(new CustomEvent('cc:stations', { detail: [...stations.values()] }));
    }
    window.dispatchEvent(new CustomEvent('cc:multiplayer-message', { detail: message }));
  }

  // players whose avatar another system animates (your match opponent on the booth deck)
  let isControlled = () => false;

  function update(dt) {
    for (const [id, remote] of remotePlayers) {
      if (!remote.initialized || isControlled(id)) continue;
      const root = remote.character.root;
      const distance = root.position.distanceTo(remote.target);
      root.position.lerp(remote.target, 1 - Math.exp(-dt * 12));
      const difference = Math.atan2(Math.sin(remote.heading - root.rotation.y), Math.cos(remote.heading - root.rotation.y));
      root.rotation.y += difference * (1 - Math.exp(-dt * 14));
      remote.character.setState(remote.state === 'airborne' ? 'airborne' : 'idle');
      remote.character.update(dt, remote.state === 'walk' ? Math.min(19, distance / Math.max(dt, 0.001)) : 0);
    }
  }

  return {
    handleMessage,
    update,
    getCharacter: (id) => remotePlayers.get(id)?.character || null,
    setControlFilter(filter) { isControlled = filter; }
  };
}

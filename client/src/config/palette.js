// 3D world colours, pixel-sampled from the reference video and the in-game
// screenshots (client/docs/DESIGN.md "Colour tokens"). Sky colours: scene/sky.js.
// HUD colours live in index.css :root; keep the two in sync.
export const C = {
  // ground
  grassA: '#3bd366', grassB: '#45db73', islandSide: '#5c6468', islandSideDark: '#535b5f', islandRim: '#6b7478',
  lane: '#2a5163', chevron: '#349d7b', curb: '#e8ecee',
  // booths
  boothWhite: '#f2f3ee', boothShade: '#d2d9d4', boothPinkA: '#f6e3e1', boothPinkB: '#ecd3d1', boothIceA: '#e4eff5', boothIceB: '#d3e3ec',
  trimRed: '#ff1f32', trimCyan: '#00dcff', codeBar: '#141d24',
  padRed: '#fa4848', padBlue: '#16b0e5', padFrame: '#f1f4f4', padCyan: '#1fc4c4',
  // castle island
  castleWall: '#b9c4c9', castleWallShade: '#a2adb2', castleRoof: '#244a9b', castleWindow: '#1c2d5c', cliff: '#a7b4bb', cliffDark: '#9eabb2',
  carpet: '#2050c8',
  // nature / props
  tree: '#31d25b', treeB: '#3bd866', treeAlt: '#2bc254', treeAltB: '#34ca5d', treeDark: '#1aa54a', treeDeep: '#118b44', trunk: '#3f322b',
  crate: '#aa9275', crateEdge: '#776259', wood: '#7c6854', woodDark: '#4e4136', awningRed: '#e3201f',
  // plaza landmarks
  wheelPurple: '#8a24f2', wheelRed: '#ea1f33', wheelOrange: '#f29a1a', wheelYellow: '#e9e81c', wheelGreen: '#14d24a', wheelBlue: '#0a84f2',
  boardRed: '#db1221', boardFrame: '#6d68a0',
  lbPanel: '#1a202e', lbRow: '#262d3d', lbFrameA: '#9baab9', lbFrameB: '#b8c3cf', lbNeon: '#86f05e', lbBase: '#556170',
  lbTime: '#3fb0ff', lbWins: '#ffc93a', lbStreak: '#ff6a2a',
  pedestal: '#556170', statueGold: '#f5d23a',
  // obby
  obbyGlass: '#5fe3ea', obbyBall: '#f8e21a', obbyPlatform: '#6fdc84', obbyRim: '#3a4150', laser: '#ff1020', obbyRed: '#f00f1f',
  // tokens (placeholders, no faces)
  tokenYellow: '#f8e21a', tokenBlue: '#1f3fe0', tokenPink: '#e52bd0', tokenWhite: '#f4f6f8', tokenGem: '#3fb6ff', tokenCyan: '#5fe3ea',
  // billboard text
  textAvailable: '#38e318', textInProgress: '#ff1a1a', textPacks: '#ff2020', textPacksSub: '#7dff2e',
  textNextUpdate: '#ff1a1a', textWheel: '#1e8fff', textSpins: '#2ed65d', textObby: '#1b6dff', textMythic: '#ff2a3c'
};

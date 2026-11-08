// Panel focus views: the pilot leans towards a panel and the field of view narrows,
// like the panel zoom of a flight simulator. Positions are in cockpit coordinates
// (pilot eye at the origin, -Z forward).
export const VIEWS = {
  front: { key: 'Digit1', label: 'Vorne', fov: 70 },
  overhead: { key: 'Digit2', label: 'Overhead', pos: [0, -0.06, 0.1], target: [0, 0.6, -0.62], fov: 44 },
  left: { key: 'Digit3', label: 'Linke Konsole', pos: [-0.3, -0.06, -0.02], target: [-0.8, -0.48, 0.05], fov: 42 },
  right: { key: 'Digit4', label: 'Rechte Konsole', pos: [0.26, -0.08, 0.02], target: [0.76, -0.6, -0.06], fov: 48 },
  center: { key: 'Digit5', label: 'Mittelkonsole', pos: [0, -0.16, -0.22], target: [0, -0.76, -0.72], fov: 52 },
  displays: { key: 'Digit6', label: 'Displays', pos: [0, -0.06, 0.0], target: [0, -0.48, -0.8], fov: 50 },
};

export const VIEW_ORDER = ['front', 'overhead', 'left', 'right', 'center', 'displays'];

/** which view shows a given control best (used by the tutorial hints) */
export const CONTROL_VIEW = {
  batt: 'left',
  apu: 'left',
  gen1: 'left',
  gen2: 'left',
  hydp: 'overhead',
  pump: 'overhead',
  wpnArm: 'overhead',
  gun: 'overhead',
  missile: 'overhead',
  mg: 'overhead',
  ecm: 'overhead',
  reactor: 'center',
  stab: 'center',
  coolant: 'center',
  firesup: 'center',
  lights: 'center',
  optics: 'center',
  hud: 'center',
  nv: 'center',
  ir: 'center',
  radar: 'center',
  legLock: 'center',
  lock: 'displays',
};

export const ZOOM_FOV = 28;

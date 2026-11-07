// Electrical, hydraulic, cooling and reactor model of BB-07. Pure logic, no three.js,
// so the cold-and-dark start-up order can be unit tested.
//
// Start-up chain:
//   BATT -> battery bus (emergency lights, annunciators)
//   APU (needs BATT) spools up in ~9 s -> APU READY
//   GEN 1 / GEN 2 (need APU READY or a running reactor) -> main bus (displays, pumps, lights)
//   HYD PRESS pump (main bus) -> hydraulic pressure
//   COOLANT PUMP (main bus) -> coolant flow
//   REACTOR (main bus + coolant flow + hydraulic pressure) -> 7 s ignition -> running
//   STAB ASSIST gyro (main bus) aligns in ~6 s
//   LEG LOCK off (reactor running + pressure + gyro aligned) -> legs free, the mech can walk

export const SYS = {
  apuSpool: 9, // s to full rpm
  ignition: 7, // s reactor ignition
  gyroAlign: 6, // s gyro alignment
  hydRate: 0.24, // pressure units per second while pumping
  hydMin: 0.6, // pressure needed for reactor start and leg release
  idleReactor: 0.35,
};

/** All switches off except the leg lock: a parked, cold machine. */
export function coldSwitches() {
  return {
    batt: false,
    apu: false,
    gen1: false,
    gen2: false,
    hydp: false,
    pump: false,
    coolant: false, // coolant bypass
    reactor: false,
    stab: false,
    legLock: true,
    lights: false,
    hud: false,
    optics: false,
    nv: false,
  };
}

/** Everything running (quick start). */
export function hotSwitches() {
  return { ...coldSwitches(), batt: true, gen1: true, gen2: true, hydp: true, pump: true, reactor: true, stab: true, legLock: false, lights: true, hud: true, optics: true };
}

export function createSystems(hot = false) {
  return {
    apuRpm: 0,
    reactor: hot ? SYS.idleReactor : 0,
    reactorState: hot ? 'running' : 'off', // off | igniting | running
    ignT: 0,
    hyd: hot ? 0.85 : 0,
    heat: hot ? 0.3 : 0.12,
    coolant: 0.82,
    gyro: hot ? 1 : 0,
    battBus: hot,
    mainBus: hot,
    legsLocked: !hot,
    warnings: [],
    prev: hot ? hotSwitches() : coldSwitches(),
  };
}

const toward = (v, t, r) => (v < t ? Math.min(t, v + r) : Math.max(t, v - r));

/**
 * Advances the systems. `sw` is a snapshot of the switch positions.
 * Returns events: apuReady, mainPower, mainPowerLost, reactorIgnite, reactorRunning,
 * reactorFail, scram, gyroAligned, legsReleased, legsLocked, legDenied.
 * reactorFail / legDenied mean the game should flip the switch back.
 */
export function stepSystems(s, sw, dt, throttle = 0) {
  const ev = [];
  const prev = s.prev;
  s.battBus = sw.batt;

  // APU
  const wasReady = s.apuRpm >= 0.98;
  s.apuRpm = s.battBus && sw.apu ? Math.min(1, s.apuRpm + dt / SYS.apuSpool) : Math.max(0, s.apuRpm - dt / 4);
  const apuReady = s.apuRpm >= 0.98;
  if (apuReady && !wasReady) ev.push('apuReady');
  s.apuReady = apuReady;

  // main bus
  const hadMain = s.mainBus;
  const source = apuReady || s.reactorState === 'running';
  s.mainBus = s.battBus && (sw.gen1 || sw.gen2) && source;
  if (s.mainBus && !hadMain) ev.push('mainPower');
  if (!s.mainBus && hadMain) ev.push('mainPowerLost');

  // hydraulics and cooling
  s.hyd = s.mainBus && sw.hydp ? toward(s.hyd, 0.85, SYS.hydRate * dt) : Math.max(0, s.hyd - 0.06 * dt);
  s.coolantFlow = s.mainBus && sw.pump;

  // reactor
  if (sw.reactor && !prev.reactor) {
    if (s.mainBus && s.coolantFlow && s.hyd >= SYS.hydMin) {
      s.reactorState = 'igniting';
      s.ignT = 0;
      ev.push('reactorIgnite');
    } else ev.push('reactorFail');
  }
  if (!sw.reactor && s.reactorState !== 'off') s.reactorState = 'off';
  if (s.reactorState === 'igniting') {
    s.ignT += dt;
    const t = Math.min(1, s.ignT / SYS.ignition);
    s.reactor = SYS.idleReactor * t * t * (3 - 2 * t);
    if (s.ignT >= SYS.ignition) {
      s.reactorState = 'running';
      ev.push('reactorRunning');
    }
  } else if (s.reactorState === 'running') {
    s.reactor = toward(s.reactor, SYS.idleReactor + Math.abs(throttle) * 0.6, dt * 0.4);
  } else s.reactor = Math.max(0, s.reactor - dt * 0.1);

  // heat: the reactor heats, the coolant pump (and the bypass) cools
  if (s.reactorState === 'running') {
    const cooling = (s.coolantFlow ? 0.3 : -0.72) + (sw.coolant && s.coolantFlow ? 0.12 : 0);
    s.heat += (s.reactor * 0.8 - cooling + 0.05 - s.heat) * dt * 0.08;
    if (s.heat >= 0.99) {
      s.reactorState = 'off';
      ev.push('scram');
    }
  } else s.heat = toward(s.heat, 0.12, dt * 0.01);
  s.heat = Math.min(1, Math.max(0.05, s.heat));

  // gyro
  const wasAligned = s.gyro >= 1;
  s.gyro = s.mainBus && sw.stab ? Math.min(1, s.gyro + dt / SYS.gyroAlign) : Math.max(0, s.gyro - dt / 3);
  if (s.gyro >= 1 && !wasAligned) ev.push('gyroAligned');

  // leg lock
  if (!sw.legLock && prev.legLock) {
    if (s.reactorState === 'running' && s.hyd >= SYS.hydMin && s.gyro >= 1) {
      s.legsLocked = false;
      ev.push('legsReleased');
    } else ev.push('legDenied');
  }
  if (sw.legLock && !prev.legLock) {
    s.legsLocked = true;
    ev.push('legsLocked');
  }

  // warnings only matter once the machine is alive
  const w = [];
  if (s.reactorState === 'running') {
    if (s.heat > 0.78) w.push('HEAT CRITICAL');
    if (s.hyd < 0.4) w.push('HYD PRESS LOW');
    if (!s.coolantFlow) w.push('COOLANT FLOW LOW');
    if (!s.mainBus) w.push('GEN OFFLINE');
  }
  s.warnings = w;
  // the gyro is needed to unlock the legs; afterwards it only steadies the walk
  s.canWalk = !s.legsLocked && s.reactorState === 'running' && s.hyd > 0.4;
  s.prev = { ...sw };
  return ev;
}

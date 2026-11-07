import * as THREE from 'three';

// Boarding sequence: walk across the forward base to the parked BB-07, climb the
// ladder on its left leg, open the crew hatch on its back, climb in, sit down and
// shut the hatch. Outside the camera is a free world camera, inside it is the
// cockpit camera (cockpit coordinates, pilot eye at the origin).

const smooth = (t) => t * t * (3 - 2 * t);

export class EntrySequence {
  constructor(game) {
    this.g = game;
    const b = game.world.boarding;
    const lx = b.ladderX;
    const lz = b.ladderZ;
    const top = b.hatchY + 0.25;
    // outside keyframes: time, eye position, look target, motion (walk|climb|still)
    // segment k -> k+1 uses the motion of key k
    this.outside = [
      [0, [-7.5, 1.72, 27], [-1.5, 3.2, 0], 'walk'],
      [6.5, [-3.2, 1.72, 14.5], [0, 3.6, 0], 'walk'],
      [8.5, [-2.6, 1.72, 12.2], [0, 4.0, 0], 'still'],
      [11.0, [-2.6, 1.72, 12.2], [0, 5.2, -0.5], 'walk'], // stop and look up at the 5 m machine
      [15.0, [lx - 0.05, 1.72, lz + 1.15], [lx, 2.2, lz - 1], 'still'],
      [16.2, [lx - 0.05, 1.75, lz + 0.8], [lx, 3.8, lz - 1], 'climb'],
      [21.5, [lx - 0.02, top, b.backZ + 0.5], [0.3, b.hatchY, b.backZ - 1], 'still'],
      [26.0, [lx + 0.15, top, b.backZ + 0.55], [0, b.hatchY - 0.1, b.backZ - 2], 'walk'],
      [28.0, [0, b.hatchY + 0.05, b.backZ + 0.05], [0, b.hatchY - 0.15, b.backZ - 3], 'walk'],
    ];
    this.outsideEnd = 28.0;
    // inside keyframes (cockpit coordinates)
    this.inside = [
      [28.6, [0, 0.32, 1.6], [0, -0.05, -0.5]],
      [30.4, [0.02, 0.3, 0.9], [0, -0.15, -1]],
      [32.4, [0.0, 0.22, 0.28], [0, -0.2, -1]],
      [33.8, [0, 0, 0], [0, -0.16, -1]],
    ];
    this.end = 37.5;
    this.t = 0;
    this.phase = 'outside';
    this.cues = [
      [0.2, () => game.sound.setMix({ base: 0.9, battle: 0.55, walk: 0.55 })],
      [2.0, () => game.radio.say('v00', game.voiceText.v00)],
      [8.3, () => game.sound.setMix({ base: 0.9, battle: 0.55, walk: 0 })],
      [11.0, () => game.sound.setMix({ base: 0.9, battle: 0.55, walk: 0.55 })],
      [14.8, () => game.sound.setMix({ base: 0.9, battle: 0.55, walk: 0 })],
      [16.4, () => game.sound.one('stairs_metal', 0.7, 0.85)],
      [19.0, () => game.sound.one('stairs_metal', 0.6, 0.8)],
      [23.6, () => game.sound.one('hatch_open', 0.9)],
      [27.4, () => this.fade(1, 0.5)],
      [28.6, () => this.enterCockpit()],
      [28.7, () => this.fade(0, 0.8)],
      [33.9, () => game.sound.one('harness', 0.8)],
      [34.4, () => game.sound.one('hatch_close', 1.0)],
      [35.5, () => game.sound.setMix({ base: 0.0, battle: 0.85, walk: 0 })],
    ];
    this.cueIndex = 0;
    this.lookOff = { yaw: 0, pitch: 0 };
    this.done = false;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
  }

  fade(to, dur) {
    this.g.ui.fade(to, dur);
  }

  enterCockpit() {
    this.phase = 'inside';
    this.g.post.cockpitPass.enabled = true;
  }

  skip() {
    this.t = this.end;
    this.cueIndex = this.cues.length;
    this.g.world.setMechHatch(0);
    this.g.cockpit.setHatch(0);
    this.g.post.cockpitPass.enabled = true;
    this.phase = 'inside';
    this.g.sound.setMix({ base: 0, battle: 0.85, walk: 0 });
    this.g.sound.one('hatch_close', 0.8);
    this.g.ui.fade(0, 0.3);
    this.done = true;
  }

  /** evaluates a keyframe track at time t */
  sample(track, t, outPos, outLook) {
    let i = 0;
    while (i < track.length - 2 && t > track[i + 1][0]) i++;
    const a = track[i];
    const b = track[i + 1];
    const k = THREE.MathUtils.clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    // ease only where the kind of motion changes, so a long walk does not stop at every key
    const easeIn = i === 0 || track[i - 1][3] !== a[3];
    const easeOut = i + 2 >= track.length || b[3] !== a[3];
    const e = easeIn && easeOut ? smooth(k) : easeIn ? k * k * (2 - k) * 0.5 + k * 0.5 * k : easeOut ? 1 - (1 - k) * (1 - k) * 0.5 - (1 - k) * 0.5 * (1 - k) : k;
    outPos.fromArray(a[1]).lerp(new THREE.Vector3().fromArray(b[1]), e);
    outLook.fromArray(a[2]).lerp(new THREE.Vector3().fromArray(b[2]), e);
    return { motion: a[3], k };
  }

  update(dt, inp) {
    const g = this.g;
    this.t += dt;
    while (this.cueIndex < this.cues.length && this.t >= this.cues[this.cueIndex][0]) this.cues[this.cueIndex++][1]();

    // hatches
    g.world.setMechHatch(smooth(THREE.MathUtils.clamp((this.t - 23.8) / 2.2, 0, 1)));
    const inOpen = this.t < 34.4 ? 1 : 1 - smooth(THREE.MathUtils.clamp((this.t - 34.4) / 0.9, 0, 1));
    g.cockpit.setHatch(this.phase === 'inside' ? inOpen : 1);

    // a little free look on top of the scripted camera
    this.lookOff.yaw = THREE.MathUtils.clamp(this.lookOff.yaw - inp.dx * 0.0016, -0.6, 0.6) * (1 - dt * 0.8);
    this.lookOff.pitch = THREE.MathUtils.clamp(this.lookOff.pitch - inp.dy * 0.0016, -0.4, 0.4) * (1 - dt * 0.8);

    if (this.phase === 'outside') {
      const { motion } = this.sample(this.outside, this.t, this.camPos, this.camLook);
      // head bob: walking steps, rung-by-rung climbing
      if (motion === 'walk') {
        this.camPos.y += Math.abs(Math.sin(this.t * 5.6)) * 0.045 - 0.02;
        this.camPos.x += Math.sin(this.t * 2.8) * 0.02;
      } else if (motion === 'climb') {
        this.camPos.y += Math.sin(this.t * 7) * 0.035;
        this.camPos.z += Math.abs(Math.sin(this.t * 3.5)) * 0.04;
      }
      const cam = g.worldCam;
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      cam.rotateY(this.lookOff.yaw);
      cam.rotateX(this.lookOff.pitch);
      cam.updateMatrixWorld(true);
      return null;
    }
    // inside: return a cockpit-local camera pose for the game's camera rig
    this.sample(this.inside, this.t, this.camPos, this.camLook);
    if (this.t >= this.end) this.done = true;
    return { pos: this.camPos, look: this.camLook, lookOff: this.lookOff };
  }
}

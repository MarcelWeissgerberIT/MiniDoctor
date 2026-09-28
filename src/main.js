import './style.css';
import * as THREE from 'three';
import { World } from './world.js';
import { Ship, Input } from './ship.js';
import { ToolRig, TOOL_KEYS } from './tools.js';
import { Cockpit } from './cockpit.js';
import { Hud } from './hud.js';
import { Comm } from './comm.js';
import { Audio } from './audio.js';
import { t, getLang, setLang } from './i18n.js';
import { beatPhase, toRealMetersPerSecond, vmaxGame } from './physics.js';
import { DiagnosisMission } from './missions/diag.js';
import { StentMission } from './missions/stent.js';
import { VirusMission } from './missions/virus.js';
import { ClotMission } from './missions/clot.js';
import { StrokeMission } from './missions/stroke.js';
import { DISEASES, TREATMENT } from './missions/diagLogic.js';
import { Journey, MAP_POINTS, MISSION_SITE, stationName, stationFact } from './journey.js';

const MISSIONS = { diag: DiagnosisMission, stent: StentMission, virus: VirusMission, clot: ClotMission, stroke: StrokeMission };
const BRIEF_IMG = { diag: 'ship_concept', stent: 'brief_stent', virus: 'brief_virus', clot: 'brief_clot', stroke: 'brief_stroke' };
const NAME = { diag: 'm0', stent: 'm1', virus: 'm2', clot: 'm3', stroke: 'm4' };
const HANDOVER = 5; // seconds of autopilot before the pilot takes over

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const world = new World(canvas);
const ship = new Ship();
const input = new Input(canvas);
const tools = new ToolRig(world.camera, world.renderer);
const cockpit = new Cockpit($('#cockpit'));
const hud = new Hud(cockpit, world);
const audio = new Audio();

const settings = {
  comfort: loadBool('md_comfort', false),
  sound: loadBool('md_sound', true),
  music: loadBool('md_music', true),
  voice: loadBool('md_voice', true),
  light: true,
  hud: true,
};
audio.setEnabled(settings.sound);
audio.setMusic(settings.music);
const comm = new Comm(cockpit, audio);
comm.voice = settings.voice;

function loadBool(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v === '1';
  } catch {
    return d;
  }
}
function saveBool(k, v) {
  try {
    localStorage.setItem(k, v ? '1' : '0');
  } catch {}
}

const game = {
  state: 'menu',
  condition: 85,
  disease: null,
  plan: [],
  step: 0,
  training: false,
  history: [],
};

let mission = null;
let journey = null;
let journeyTarget = null;
let time = 0;
let handover = 0;
let fadeT = 0;
let lastBeat = 0;
const lookVel = { x: 0, y: 0 };

const ctx = {
  world,
  ship,
  tools,
  hud,
  audio,
  input,
  game,
  time: 0,
  controls: false,
  scanning: false,
  warning: false,
  mapTarget: null,
  requestAnchor: (on = true) => setAnchor(on, true),
  radio: (key, vars, opts) => comm.say(key, vars, opts),
  fade: () => (fadeT = 1),
};

// ---------------------------------------------------------------- screens
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('visible', s.id === id));
  const inGame = id === null;
  cockpit.show(inGame);
  hud.show(inGame);
  canvas.style.visibility = inGame || id === 'videoscreen' ? 'visible' : 'hidden';
}

function renderMenu() {
  audio.stopScene();
  const lang = getLang();
  $('#menu').style.backgroundImage = 'url(assets/keyart.webp)';
  $('#menu').innerHTML = `
    <div class="menu-inner">
      <h1>MiniDoctor</h1>
      <p class="tagline">${t('tagline')}</p>
      <div class="menu-actions">
        <button class="btn primary big" id="m-start">${t('start')}</button>
        <details class="training"><summary>${t('training')}</summary>
          <div class="choices">${Object.keys(MISSIONS)
            .map((k) => `<button class="btn sm" data-train="${k}">${t(NAME[k] + '_name')}</button>`)
            .join('')}</div>
        </details>
      </div>
      <div class="settings">
        <label>${t('language')}:
          <button class="btn sm ${lang === 'de' ? 'sel' : ''}" data-lang="de">Deutsch</button>
          <button class="btn sm ${lang === 'en' ? 'sel' : ''}" data-lang="en">English</button></label>
        <label><input type="checkbox" id="m-comfort" ${settings.comfort ? 'checked' : ''}> ${t('comfort')}</label>
        <label><input type="checkbox" id="m-sound" ${settings.sound ? 'checked' : ''}> ${t('sound')}</label>
        <label><input type="checkbox" id="m-music" ${settings.music ? 'checked' : ''}> ${t('music')}</label>
        <label><input type="checkbox" id="m-voice" ${settings.voice ? 'checked' : ''}> ${t('voiceOpt')}</label>
      </div>
      <p class="scale">${t('scaleInfo')}</p>
      <p class="controls"><b>${t('controlsTitle')}:</b> ${t('controls')}</p>
      <p class="credit">${t('credit')}</p>
    </div>`;
  $('#m-start').onclick = () => newCampaign();
  document.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => (setLang(b.dataset.lang), renderMenu())));
  document.querySelectorAll('[data-train]').forEach((b) => (b.onclick = () => newTraining(b.dataset.train)));
  $('#m-comfort').onchange = (e) => saveBool('md_comfort', (settings.comfort = e.target.checked));
  $('#m-voice').onchange = (e) => {
    saveBool('md_voice', (settings.voice = e.target.checked));
    comm.voice = settings.voice;
  };
  $('#m-music').onchange = (e) => {
    saveBool('md_music', (settings.music = e.target.checked));
    audio.setMusic(settings.music);
  };
  $('#m-sound').onchange = (e) => {
    saveBool('md_sound', (settings.sound = e.target.checked));
    audio.setEnabled(settings.sound);
  };
  showScreen('menu');
  game.state = 'menu';
}

function newCampaign() {
  audio.ensure();
  game.training = false;
  game.condition = 85;
  game.disease = DISEASES[Math.floor(Math.random() * DISEASES.length)];
  game.plan = ['diag', null]; // treatment decided by the diagnosis
  game.step = 0;
  game.history = [];
  game.diagnosed = null;
  briefing();
}
function newTraining(id) {
  audio.ensure();
  game.training = true;
  game.condition = 85;
  game.disease = { stent: 'stenosis', virus: 'virus', clot: 'dvt', stroke: 'stroke' }[id] ?? DISEASES[Math.floor(Math.random() * DISEASES.length)];
  game.plan = [id];
  game.step = 0;
  game.history = [];
  briefing();
}

function currentMissionId() {
  let id = game.plan[game.step];
  if (id === null) id = TREATMENT[game.diagnosed ?? game.disease];
  return id;
}

function briefing() {
  const id = currentMissionId();
  const n = NAME[id];
  game.state = 'briefing';
  $('#briefing').innerHTML = `
    <div class="brief-card">
      <img src="assets/${BRIEF_IMG[id]}.webp" alt="">
      <div class="brief-text">
        <div class="kicker">${t('drop')} ${game.step + 1} ${t('of')} ${game.plan.length} · ${t('patientName')} · ${t('condition')} ${Math.round(game.condition)} %</div>
        <h2>${t(n + '_name')}</h2>
        <div class="place">${t(n + '_place')}</div>
        <div class="brief-map"><img src="assets/bodymap.webp" alt=""><div class="dot" style="left:${MAP_POINTS[MISSION_SITE[id]][0] * 100}%;top:${MAP_POINTS[MISSION_SITE[id]][1] * 100}%"></div><div class="cap">${t('location')}</div></div>
        <p>${t(n + '_brief')}</p>
        <h3>${t('howto')}</h3>
        <ol class="brief-steps">${t(n + '_steps').map((x) => `<li>${x}</li>`).join('')}</ol>
        <p class="muted">${t('controls')}</p>
        <button class="btn primary big" id="b-go">${t('launch')}</button>
      </div>
    </div>`;
  $('#b-go').onclick = () => playDropVideos(id);
  showScreen('briefing');
}

// ---------------------------------------------------------------- drop videos
function playDropVideos(id) {
  game.state = 'video';
  const v = $('#dropvideo');
  const layer = $('#video-layer');
  const seq = ['assets/drop_intro.mp4', 'assets/transition.mp4'];
  let k = 0;
  // prepare the journey underneath so the last video frame blends into it
  startJourney(id);
  showScreen('videoscreen');
  cockpit.show(true);
  layer.style.opacity = 1;
  layer.style.display = 'block';
  const cap = $('#video-caption');
  const lines = t('drop_seq');
  const next = () => {
    if (k >= seq.length) return finishVideos();
    v.src = seq[k];
    cap.textContent = lines[Math.min(lines.length - 1, k * 2)];
    k++;
    v.play().catch(() => next());
  };
  v.onended = next;
  v.onerror = next;
  v.ontimeupdate = () => {
    if (k === 2 && v.duration) cap.textContent = lines[Math.min(3, 2 + Math.floor((v.currentTime / v.duration) * 2))];
  };
  $('#video-skip').textContent = t('skip');
  $('#video-skip').onclick = finishVideos;
  next();
}

function finishVideos() {
  const v = $('#dropvideo');
  const layer = $('#video-layer');
  v.onended = v.onerror = v.ontimeupdate = null;
  if (game.state !== 'video') return;
  game.state = 'journey';
  showScreen(null);
  hud.showJourney(journey.stations, MAP_POINTS, { kicker: `${t('j_title')} · ${t('j_scale')}`, hint: t('j_skip') });
  audioScene = '';
  cockpit.boot();
  comm.say('r_j_start', null, { priority: 2 });
  layer.style.transition = 'opacity 1.2s ease';
  layer.style.opacity = 0;
  setTimeout(() => {
    layer.style.display = 'none';
    layer.style.transition = '';
    v.pause();
  }, 1250);
  ship.controlsEnabled = false;
  ctx.controls = false;
}

function startJourney(id) {
  mission?.dispose?.(ctx);
  mission = null;
  journey?.dispose();
  journeyTarget = id;
  journey = new Journey(world, id, { comfort: settings.comfort });
  tools.setAvailable([]);
  tools.select(null);
  hud.closePanel();
  hud.hideHelp();
  hud.setBar('');
  hud.setCenter('');
}

function endJourney() {
  fadeT = 1;
  audio.sfx('arrive');
  audio.stopScene();
  journey.dispose();
  journey = null;
  hud.hideJourney();
  startMission(journeyTarget);
  game.state = 'play';
  cockpit.boot();
  comm.say('r_m_' + journeyTarget, null, { priority: 2 });
  handover = HANDOVER;
  ship.controlsEnabled = false;
  ctx.controls = false;
}

// ---------------------------------------------------------------- journey sound
let audioScene = '';
function journeyAudio(r, beat, dt) {
  const st = r.station;
  // music: dark venous theme until the lungs, bright arterial theme after the gas exchange
  const nearHeart = ['svc', 'pa', 'pv', 'aorta'].includes(st.key);
  const scene = {
    music: r.oxy > 0.5 ? 'arterial' : 'venous',
    heart: st.kind === 'heart' ? 0.9 : nearHeart ? 0.35 : 0,
    lung: st.kind === 'lung' ? 0.9 : 0,
  };
  const key = JSON.stringify(scene);
  if (key !== audioScene) {
    audioScene = key;
    audio.setScene(scene);
  }
  for (const e of r.events) audio.sfx(e);
  // heartbeat: loud inside the heart, a pressure surge in the arteries
  if (beat < lastBeat) {
    audio.heartbeat(st.kind === 'heart' ? 1.3 : st.kind === 'artery' ? 0.7 : 0.4);
    if (st.kind === 'artery') audio.sfx('surge');
  }
  if (st.kind === 'lung' && Math.random() < dt * 1.2) audio.sfx('oxygen');
  if (Math.random() < dt * 0.7) audio.sfx('swish');
  // flow noise whistles higher in narrow vessels
  audio.setFlow(Math.min(1, 0.3 + st.v), Math.max(0, Math.min(1, (8 - r.radius) / 6)));
}

function journeyFrame(dt) {
  time += dt;
  const hr = patientBpm();
  const beat = beatPhase(time, hr);
  const r = journey.update(dt, input, beat);
  const st = r.station;
  const frac = (journey.s - st.s0) / st.len;
  if (game.state === 'journey') {
    hud.updateJourney(r.index, Math.min(1, frac), stationName(st), stationFact(st), `Ø ${st.d} · ${st.v >= 0.01 ? st.v.toFixed(2) + ' m/s' : (st.v * 1000).toFixed(1) + ' mm/s'} ${t('j_real')}`, r.changed);
    if (r.changed) {
      audio.sfx('station');
      const line = { ra: 'r_j_heart', rv: 'r_j_rv', lungcap: 'r_j_lung', lv: 'r_j_lv', aorta: 'r_j_aorta' }[st.key];
      if (line) comm.say(line, null, { cooldown: 5 });
      if (r.index === journey.stations.length - 1) comm.say('r_j_arrive', null, { cooldown: 5 });
    }
    if (r.events.includes('valve')) cockpit.shake(settings.comfort);
    journeyAudio(r, beat, dt);
  }
  tools.update(dt);
  hud.clearMarkers();
  hud.hereText = t('here');
  if (game.state === 'journey')
    for (const l of journey.visibleLabels()) hud.marker(l.pos, { size: 14, color: '#ffd27f', label: t(l.key) });
  hud.update(dt);
  cockpit.updateSticks(dt, {}, settings.comfort);
  cockpit.draw(
    {
      bpm: hr,
      beat,
      condition: game.condition,
      flowReal: st.v,
      timeScale: 10000,
      wallDist: 999,
      wallText: `Ø ${st.d}`,
      dist: 0,
      distText: `${Math.round(r.progress * 100)} %`,
      diamText: `Ø ${st.d}`,
      R: 1,
      shipX: 0,
      shipY: 0,
      target: null,
      autopilot: true,
      anchored: false,
      toolActive: false,
      sound: settings.sound,
      warning: game.condition < 30,
      scanning: false,
      labels: { flow: 'FLOW', wall: 'VES', dist: 'ROUTE' },
    },
    dt,
  );
  lastBeat = beat;
  if (fadeT > 0) fadeT = Math.max(0, fadeT - dt * 0.8);
  $('#fade').style.opacity = fadeT;
  updateCockpitControls(dt);
  world.render(tools.scene);
  if (game.state === 'journey' && (journey.done || input.pressed.has('Space') || input.pressed.has('Enter'))) endJourney();
}

// ---------------------------------------------------------------- mission lifecycle
function startMission(id) {
  mission?.dispose?.(ctx);
  ship.reset();
  ship.autopilot = loadBool('md_autopilot', true);
  time = 0;
  mission = new MISSIONS[id](game);
  // the flow pulses with the patient's actual heart rate
  mission.vessel = { ...mission.vessel, heartRate: Math.round(patientBpm()) };
  tools.setAvailable(mission.tools);
  tools.anchorGoal = tools.anchorState = 0;
  hud.closePanel();
  hud.hideHelp();
  hud.setBar('');
  hud.setCenter('');
  mission.start(ctx);
  hud.showLocation(MAP_POINTS[MISSION_SITE[id]], `${t('here')}: ${t(NAME[id] + '_place').split(',')[0]}`);
  ctx.mapTarget = null;
  ctx.distToTarget = null;
  ctx.timeWarp = 1;
  // music keeps playing quietly during the mission
  audio.setScene({ music: id === 'clot' ? 'venous' : 'arterial', musicLevel: 0.35, heart: 0, lung: 0 });
}

function setAnchor(on, auto = false) {
  if (on === ship.anchored) return;
  if (on) {
    if (mission?.tryAnchor) {
      if (!mission.tryAnchor(ctx)) return;
    } else if (!auto && ship.wallDistance(mission.vessel.radius) > 8) {
      hud.toast(t('anchorNoWall'), 'warn');
      return;
    }
    ship.anchored = true;
    tools.setAnchor(true);
    audio.sfx('anchor');
    cockpit.shake(settings.comfort);
  } else {
    if (!auto && mission?.canRelease && !mission.canRelease()) return;
    ship.anchored = false;
    tools.setAnchor(false);
  }
}

function endMission(res) {
  game.state = 'result';
  input.unlock();
  mission?.dispose?.(ctx);
  hud.showLocation(null);
  game.condition = Math.max(0, game.condition - res.damage);
  game.history.push({ id: mission.id, ...res });
  const dead = game.condition <= 0;
  const last = game.step >= game.plan.length - 1;
  $('#result').innerHTML = `
    <div class="result-card">
      <div class="kicker">${t('res_title')} · ${t(NAME[mission.id] + '_name')}</div>
      <div class="kpis">
        <div><span>${t('res_quality')}</span><b>${Math.round(res.quality * 100)} %</b></div>
        <div><span>${t('res_damage')}</span><b class="${res.damage ? 'bad' : 'ok'}">−${res.damage}</b></div>
        <div><span>${t('condition')}</span><b>${Math.round(game.condition)} %</b></div>
      </div>
      <ul>${res.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      <p class="muted">${t('res_extract')}</p>
      <button class="btn primary big" id="r-next">${dead || last ? t('continue') : t('res_next')}</button>
    </div>`;
  $('#r-next').onclick = () => {
    if (dead || last) return outcome();
    game.step++;
    briefing();
  };
  showScreen('result');
  audio.setFlow(0);
  comm.say(res.damage <= 10 ? 'r_good' : res.damage <= 30 ? 'r_ok' : 'r_bad', null, { priority: 2 });
}

function outcome() {
  audio.stopScene();
  const survived = game.condition > 0;
  game.state = 'outcome';
  $('#outcome').style.backgroundImage = `url(assets/outcome_${survived ? 'survived' : 'died'}.webp)`;
  $('#outcome').innerHTML = `
    <div class="outcome-card">
      <h1>${t(survived ? 'out_survived' : 'out_died')}</h1>
      <p>${t(survived ? 'out_survived_text' : 'out_died_text')}</p>
      <p>${t('out_final')}: <b>${Math.round(game.condition)} %</b></p>
      <ul>${game.history.map((h) => `<li>${t(NAME[h.id] + '_name')}: ${Math.round(h.quality * 100)} % · −${h.damage}</li>`).join('')}</ul>
      <button class="btn primary big" id="o-again">${t('retry')}</button>
      <button class="btn" id="o-menu">${t('menu')}</button>
    </div>`;
  $('#o-again').onclick = () => (game.training ? newTraining(game.plan[0]) : newCampaign());
  $('#o-menu').onclick = renderMenu;
  showScreen('outcome');
  audio.sfx(survived ? 'ok' : 'bad');
}

// ---------------------------------------------------------------- input handling
function handleKeys() {
  if (input.pressed.has('KeyM')) {
    settings.sound = !settings.sound;
    saveBool('md_sound', settings.sound);
    audio.setEnabled(settings.sound);
  }
  if (game.state === 'play' || game.state === 'journey') {
    if (input.pressed.has('KeyR')) callDoctor();
    if (input.pressed.has('KeyL')) flip(0);
    if (input.pressed.has('KeyT')) flip(1);
  }
  if (game.state !== 'play') return;
  if (input.pressed.has('KeyP') && ctx.controls) toggleAutopilot();
  if (input.pressed.has('KeyH') && mission) {
    const n = NAME[mission.id];
    hud.toggleHelp(`<h3>${t(n + '_name')} — ${t('howto')}</h3><ol>${t(n + '_steps').map((x) => `<li>${x}</li>`).join('')}</ol>`);
  }
  if (!ctx.controls) return;
  for (const [code, name] of Object.entries(TOOL_KEYS)) if (input.pressed.has(code) && tools.select(name)) toolChanged();
  if (input.wheel) {
    tools.cycle(input.wheel);
    toolChanged();
  }
  if (input.pressed.has('Space')) {
    tools.select('anchor');
    setAnchor(!ship.anchored);
  }
}
// ---------------------------------------------------------------- cockpit controls
function callDoctor() {
  // the doctor reads out what to do right now (the live objective)
  const now = (hud.objective.innerText || '').split('\n').filter(Boolean);
  const cur = hud.objective.querySelector('li.now')?.innerText ?? now.slice(1, 3).join(' ');
  if (game.state === 'journey') comm.say('r_hint_journey', null, { priority: 2, cooldown: 0 });
  else comm.say(cur ? { text: t('r_hint', { text: cur.replace(/^[✓✗]\s*/, '') }) } : 'r_hint_none', null, { priority: 2, cooldown: 0 });
}
function flip(i) {
  audio.sfx('click');
  if (i === 0) {
    settings.light = !settings.light;
    audio.sfx('light');
  } else if (i === 1) {
    cockpit.ping();
    audio.sfx('sonar');
    sonarFlash = 1.5;
  } else if (i === 2) {
    settings.hud = !settings.hud;
    for (const e of [hud.objective, hud.stats]) e.style.opacity = settings.hud ? '' : '0';
  } else if (i === 3) {
    saveBool('md_comfort', (settings.comfort = !settings.comfort));
  }
}
cockpit.buttonHandlers.flip = flip;
cockpit.buttonHandlers.press = (i) => {
  audio.sfx('button');
  if (i === 0 && ctx.controls) toggleAutopilot();
  else if (i === 1 && ctx.controls) {
    tools.select('anchor');
    setAnchor(!ship.anchored);
  } else if (i === 2 && ctx.controls) {
    tools.cycle(1);
    toolChanged();
  } else if (i === 3) {
    saveBool('md_sound', (settings.sound = !settings.sound));
    audio.setEnabled(settings.sound);
  } else if (i === 4) callDoctor();
};
let sonarFlash = 0;
let switchKey = '';
function updateCockpitControls(dt) {
  const L = t('lampLabels');
  const S = t('switchLabels');
  const key = [settings.light, sonarFlash > 0, settings.hud, settings.comfort, getLang()].join();
  if (key !== switchKey) {
    switchKey = key;
    cockpit.setSwitches([settings.light, sonarFlash > 0, settings.hud, settings.comfort], S);
    cockpit.setLabels(L);
  }
  sonarFlash = Math.max(0, sonarFlash - dt);
  // headlight switch
  const want = settings.light ? 1 : 0.08;
  lightLevel += (want - lightLevel) * Math.min(1, dt * 6);
  world.headlight.intensity = baseHeadlight() * lightLevel;
  comm.update(dt);
  // sonar: targets around the ship (x = right, z = ahead)
  const targets = [];
  const list = game.state === 'play' ? (mission?.sonarTargets?.(ctx) ?? []) : [];
  for (const p of list) targets.push({ x: p.x - ship.x, z: -p.z, color: p.color, size: p.size });
  cockpit.drawSonar(dt, targets, mission?.sonarRange ?? 200);
  // highlight sonar contacts in the canopy for a moment after a ping
  if (sonarFlash > 0) for (const p of list) hud.marker(new THREE.Vector3(p.x, p.y ?? 0, p.z), { size: 22, color: '#ffd27f' });
  cockpit.alarm(game.state === 'play' && (ctx.warning || game.condition < 30));
}
let lightLevel = 1;
let journeyLight = null;
function baseHeadlight() {
  return journey ? (journeyLight ?? world.headlight.intensity) : 60;
}

function toolChanged() {
  audio.sfx('tool');
  mission?.onToolChange?.();
}
function toggleAutopilot() {
  ship.autopilot = !ship.autopilot;
  saveBool('md_autopilot', ship.autopilot);
  hud.toast(`${t('autopilot')}: ${ship.autopilot ? t('on') : t('off')}`, 'info', 1.5);
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  handleKeys();
  if ((game.state === 'journey' || game.state === 'video') && journey) journeyFrame(dt);
  const playing = game.state === 'play';
  if (playing && mission) {
    time += dt;
    ctx.time = time;
    ctx.scanning = false;
    ctx.warning = false;
    // hand-over: autopilot flies the first seconds, then the pilot takes over
    if (game.state === 'play' && handover > 0) {
      handover -= dt;
      hud.setCenter(`<div class="handover">${t('handover')} <b>${Math.ceil(handover)}</b></div><div class="sys">${t('systems')}</div>`);
      if (handover <= 0) {
        ship.controlsEnabled = true;
        ctx.controls = true;
        hud.setCenter('');
        hud.toast(t('youfly'), 'ok', 4);
        audio.sfx('ok');
      }
    }
    // control sticks: keyboard/mouse move the grips, dragging a grip steers
    const kx = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const ky = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    lookVel.x += (Math.max(-1, Math.min(1, input.mdx / 25)) - lookVel.x) * Math.min(1, dt * 12);
    lookVel.y += (Math.max(-1, Math.min(1, -input.mdy / 25)) - lookVel.y) * Math.min(1, dt * 12);
    const drag = cockpit.updateSticks(
      dt,
      {
        left: ctx.controls ? { x: kx || ship.vx / (mission.lateralSpeed || 1) * 0.5, y: ky } : { x: 0, y: 0 },
        right: ctx.controls ? { x: lookVel.x, y: -lookVel.y } : { x: 0, y: 0 },
      },
      settings.comfort,
    );
    ship.stick.lx = drag.left.x;
    ship.stick.ly = drag.left.y;
    ship.stick.rx = drag.right.x;
    ship.stick.ry = drag.right.y;
    const wasAuto = ship.autopilot;
    if (!ctx.controls) ship.autopilot = true;
    ship.update(dt, input, world, time, mission, settings);
    ship.autopilot = ctx.controls ? ship.autopilot : wasAuto;
    ship.applyCamera(world.camera, time, settings.comfort);
    world.camera.updateMatrixWorld();
    world.update(dt, ship, time, mission.flowMod?.(ship) ?? 1);
    hud.clearMarkers();
    const res = game.state === 'play' ? mission.update(dt, ctx) : null;
    tools.update(dt);
    hud.update(dt);
    hud.setTools(mission.tools, tools.target, (k) => {
      if (ctx.controls && tools.select(k)) toolChanged();
    });
    hud.setAutopilot(ship.autopilot, ctx.controls, toggleAutopilot);
    updateDashboard(dt);
    if (game.condition < 40) comm.say('r_low', null, { priority: 0, cooldown: 90 });
    // heartbeat sound + flow noise
    const beat = beatPhase(time, mission.vessel.heartRate);
    if (beat < lastBeat && game.state === 'play') audio.heartbeat();
    lastBeat = beat;
    audio.setFlow(Math.min(1, ship.speed / vmaxGame(mission.vessel)));
    if (fadeT > 0) fadeT = Math.max(0, fadeT - dt * 0.8);
    $('#fade').style.opacity = fadeT;
    updateCockpitControls(dt);
    world.render(tools.scene);
    if (res) endMission(res);
  }
  if (game.state === 'play' && !input.locked && ctx.controls && hud.panel.style.display === 'none' && mission && !mission.wantsCursor?.()) {
    $('#lockhint').textContent = t('clickToFocus');
    $('#lockhint').style.display = 'block';
  } else $('#lockhint').style.display = 'none';
  input.endFrame();
  requestAnimationFrame(frame);
}

function updateDashboard(dt) {
  const v = mission.vessel;
  const bpm = game.condition > 0 ? v.heartRate : 0;
  cockpit.draw(
    {
      bpm,
      beat: beatPhase(time, v.heartRate),
      condition: game.condition,
      flowReal: toRealMetersPerSecond(ship.speed, v),
      timeScale: Math.round(v.timeScale * (ctx.timeWarp ?? 1)),
      wallDist: ship.wallDistance(v.radius),
      dist: ctx.distToTarget ?? ship.dist,
      R: v.radius,
      shipX: ship.x,
      shipY: ship.y,
      target: ctx.mapTarget,
      autopilot: ship.autopilot,
      anchored: ship.anchored,
      toolActive: tools.current && tools.tools[tools.current].action > 0,
      sound: settings.sound,
      warning: ctx.warning || game.condition < 30,
      scanning: ctx.scanning,
      labels: { flow: 'FLOW', wall: 'WALL', dist: ctx.distToTarget != null ? 'TGT' : 'DIST' },
    },
    dt,
  );
}
function patientBpm() {
  // a failing heart runs faster (compensatory tachycardia)
  return 68 + (100 - game.condition) * 0.45;
}

renderMenu();
requestAnimationFrame(frame);

// debug/testing hook (used by the automated browser test)
window.__md = {
  game, ship, tools, ctx, input, world, audio, comm, cockpit,
  get mission() { return mission; },
  get journey() { return journey; },
  skipJourney: () => journey && endJourney(),
  newTraining,
  finishVideos,
  skipHandover: () => (handover = 0.01),
};

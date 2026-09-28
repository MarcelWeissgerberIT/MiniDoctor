import './style.css';
import { World } from './world.js';
import { Ship, Input } from './ship.js';
import { ToolRig, TOOL_KEYS } from './tools.js';
import { Cockpit } from './cockpit.js';
import { Hud } from './hud.js';
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

const settings = { comfort: loadBool('md_comfort', false), sound: loadBool('md_sound', true) };
audio.setEnabled(settings.sound);

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
      </div>
      <p class="scale">${t('scaleInfo')}</p>
      <p class="controls"><b>${t('controlsTitle')}:</b> ${t('controls')}</p>
      <p class="credit">${t('credit')}</p>
    </div>`;
  $('#m-start').onclick = () => newCampaign();
  document.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => (setLang(b.dataset.lang), renderMenu())));
  document.querySelectorAll('[data-train]').forEach((b) => (b.onclick = () => newTraining(b.dataset.train)));
  $('#m-comfort').onchange = (e) => saveBool('md_comfort', (settings.comfort = e.target.checked));
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
  journey.dispose();
  journey = null;
  hud.hideJourney();
  startMission(journeyTarget);
  game.state = 'play';
  handover = HANDOVER;
  ship.controlsEnabled = false;
  ctx.controls = false;
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
    if (r.changed) audio.sfx('tool');
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
  if (beat < lastBeat && game.state === 'journey') audio.heartbeat();
  lastBeat = beat;
  audio.setFlow(Math.min(1, st.v));
  if (fadeT > 0) fadeT = Math.max(0, fadeT - dt * 0.8);
  $('#fade').style.opacity = fadeT;
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
}

function outcome() {
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
    // heartbeat sound + flow noise
    const beat = beatPhase(time, mission.vessel.heartRate);
    if (beat < lastBeat && game.state === 'play') audio.heartbeat();
    lastBeat = beat;
    audio.setFlow(Math.min(1, ship.speed / vmaxGame(mission.vessel)));
    if (fadeT > 0) fadeT = Math.max(0, fadeT - dt * 0.8);
    $('#fade').style.opacity = fadeT;
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
      timeScale: v.timeScale,
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
  game, ship, tools, ctx, input, world,
  get mission() { return mission; },
  get journey() { return journey; },
  skipJourney: () => journey && endJourney(),
  newTraining,
  finishVideos,
  skipHandover: () => (handover = 0.01),
};

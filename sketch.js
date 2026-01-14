let panels = [];
const numPanels = 6;

let pad = 14;      // responsive
let labelH = 84;   // responsive

const numAgents = 30;

const influenceRadius = 20;
const clashRadius = 18;

// HUD layout tuning
const HUD_PAD_X = 10;
const HUD_PAD_Y = 8;
const HUD_TITLE_H = 18;     // metrics line area height
const HUD_AXIS_H = 14;      // x-axis label area at bottom
const HUD_YAXIS_W = 18;     // space for y-axis label + ticks

function setup() {
  const holder = document.getElementById("sketch-holder");
  const w = holder.clientWidth;
  const h = holder.clientHeight;

  const c = createCanvas(w, h);
  c.parent(holder);

  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  colorMode(HSB, 360, 100, 100, 100);

  // Create 6 panels with requested starting distributions
  panels = [];
  panels.push(new Panel("Scenario 1: 100% Triangles", distTwo(numAgents, 1.0, 0.0)));
  panels.push(new Panel("Scenario 2: 25% Triangles, 75% Octagons", distTwo(numAgents, 0.25, 0.75)));
  panels.push(new Panel("Scenario 3: 50% Triangles, 50% Octangons", distTwo(numAgents, 0.5, 0.5)));
  panels.push(new Panel("Scenario 4: 75% Triangles, 25% Octagons", distTwo(numAgents, 0.75, 0.25)));
  panels.push(new Panel("Scenario 5: 100%  Octagons", distTwo(numAgents, 0.0, 1.0)));
  panels.push(new Panel("Scenario 6: Equal distribution of 3 - 8 sided shapes", distAllEqual(numAgents)));

  // Layout + spawn
  layoutPanels(false);
  for (let p of panels) p.spawnInitial();
}

function windowResized() {
  const holder = document.getElementById("sketch-holder");
  resizeCanvas(holder.clientWidth, holder.clientHeight);
  layoutPanels(true);
}

// Restart simulations: re-spawn initial agents for each panel
function restartSimulations() {
  if (!panels || panels.length === 0) return;
  for (let p of panels) p.spawnInitial();
}

function draw() {
  background(0, 0, 10);

  for (let p of panels) {
    p.step();
    p.render();
  }
}

function mousePressed() {
  for (let p of panels) {
    if (p.contains(mouseX, mouseY)) {
      p.addRandomAgent(mouseX, mouseY);
      break;
    }
  }
}

/* -------------------- RESPONSIVE GRID -------------------- */

function gridDimsForWidth(w) {
  // 3x2 wide, 2x3 medium, 1x6 narrow
  if (w < 620) return { cols: 1, rows: 6 };
  if (w < 980) return { cols: 2, rows: 3 };
  return { cols: 3, rows: 2 };
}

function layoutPanels(rescaleAgents) {
  const { cols, rows } = gridDimsForWidth(width);

  pad = max(10, min(18, width * 0.015));
  labelH = max(64, min(92, height * 0.14));

  const availW = width - pad * (cols + 1);
  const availH = height - pad * (rows + 1) - labelH * rows;

  const panelW = availW / cols;
  const panelH = availH / rows;

  for (let i = 0; i < panels.length; i++) {
    const col = i % cols;
    const row = floor(i / cols);

    const x = pad + col * (panelW + pad);
    const y = pad + row * (panelH + labelH + pad);

    panels[i].setRect(x, y, panelW, panelH, labelH, rescaleAgents);
  }
}

/* -------------------- DISTRIBUTIONS -------------------- */

function distTwo(n, triFrac, octFrac) {
  const triCount = round(n * triFrac);
  const octCount = n - triCount;
  let arr = [];
  for (let i = 0; i < triCount; i++) arr.push(3);
  for (let i = 0; i < octCount; i++) arr.push(8);
  return arr;
}

function distAllEqual(n) {
  const types = [3, 4, 5, 6, 7, 8];
  const base = floor(n / types.length);
  let rem = n - base * types.length;

  let arr = [];
  for (let t of types) for (let i = 0; i < base; i++) arr.push(t);
  while (rem-- > 0) arr.push(types[floor(random(types.length))]);
  return arr;
}

/* -------------------- PANEL -------------------- */

class Panel {
  constructor(title, sidesList) {
    this.title = title;
    this.sidesList = sidesList.slice();
    this.agents = [];
    this.nextId = 0;

    this.x = 0; this.y = 0; this.w = 0; this.h = 0; this.lh = 0;

    this.history = [];
    this.historyLen = 90; // a bit shorter for tighter HUD
  }

  setRect(x, y, w, h, labelH, rescaleAgents = false) {
    const oldW = this.w;
    const oldH = this.h;

    this.x = x; this.y = y; this.w = w; this.h = h; this.lh = labelH;

    if (rescaleAgents && oldW > 0 && oldH > 0 && this.agents.length > 0) {
      const sx = this.w / oldW;
      const sy = this.h / oldH;
      for (let a of this.agents) {
        a.pos.x *= sx;
        a.pos.y *= sy;
        a.pos.x = constrain(a.pos.x, 0, this.w);
        a.pos.y = constrain(a.pos.y, 0, this.h);
      }
    }
  }

  contains(mx, my) {
    return (
      mx >= this.x && mx <= this.x + this.w &&
      my >= this.y && my <= this.y + this.h
    );
  }

  spawnInitial() {
    this.agents = [];
    this.nextId = 0;
    this.history = [];

    let sidesList = this.sidesList.slice();
    shuffle(sidesList, true);

    for (let i = 0; i < sidesList.length; i++) {
      let sides = sidesList[i];

      let placed = false;
      for (let attempts = 0; attempts < 1200 && !placed; attempts++) {
        let lx = random(this.w);
        let ly = random(this.h);
        let pos = createVector(lx, ly);

        if (isTooCloseLocal(pos, this.agents, clashRadius * 0.9)) continue;

        let hue = pickHueDifferentFromNeighborsLocal(
          pos, this.agents, influenceRadius, 8
        );

        let speed = random(0.25, 1.4);
        this.agents.push(new Agent(pos, hue, sides, speed, this.nextId++));
        placed = true;
      }
    }
  }

  addRandomAgent(globalX, globalY) {
    let lx = constrain(globalX - this.x, 0, this.w);
    let ly = constrain(globalY - this.y, 0, this.h);

    let sides = int(random(3, 9)); // 3..8
    let hue = random(360);
    let speed = random(0.2, 1.8);

    this.agents.push(new Agent(createVector(lx, ly), hue, sides, speed, this.nextId++));
  }

  step() {
    for (let a of this.agents) a.update(this.w, this.h);
    this.handleClashes();

    const counts = countBySides(this.agents);
    const H = entropyFromCounts(counts, this.agents.length);
    const A = alignmentMetric(this.agents);

    this.history.push({ H, A, counts });
    if (this.history.length > this.historyLen) this.history.shift();
  }

  handleClashes() {
    for (let i = 0; i < this.agents.length; i++) {
      for (let j = i + 1; j < this.agents.length; j++) {
        let a = this.agents[i];
        let b = this.agents[j];

        if (a.cooldown > 0 || b.cooldown > 0) continue;

        let d = p5.Vector.dist(a.pos, b.pos);
        if (d >= clashRadius) continue;

        let mid = p5.Vector.add(a.pos, b.pos).mult(0.5);

        // equal sides
        if (a.sides === b.sides) {
          let dirA = a.vel.copy().normalize();
          let dirB = b.vel.copy().normalize();
          let dp = dirA.dot(dirB);

          let shared = dp >= 0 ? dirA.copy().add(dirB) : dirA.copy().sub(dirB);
          if (shared.mag() < 1e-6) shared = dirA.copy();
          shared.normalize();

          a.setDirectionKeepingSpeed(shared);
          b.setDirectionKeepingSpeed(shared);

          let avgHue = averageHueInInfluenceLocal(mid, this.agents, influenceRadius);
          a.hue = avgHue;
          b.hue = avgHue;

          separateLocal(a, b);
          a.cooldown = 10;
          b.cooldown = 10;
          continue;
        }

        // different sides
        let more = a.sides > b.sides ? a : b;
        let less = a.sides > b.sides ? b : a;

        more.sides = constrain(more.sides - 1, 3, 8);
        less.sides = constrain(less.sides + 1, 3, 8);

        // less takes more's hue
        less.hue = more.hue;

        // redirect along adjacent edge
        let impactAngleWorld = atan2(
          more.pos.y - less.pos.y,
          more.pos.x - less.pos.x
        );
        less.kickAlongAdjacentEdge(impactAngleWorld);

        separateLocal(a, b);

        a.cooldown = 10;
        b.cooldown = 10;
      }
    }
  }

  render() {
    // panel background
    noStroke();
    fill(0, 0, 12, 100);
    rect(this.x, this.y, this.w, this.h, 12);

    // agents
    push();
    translate(this.x, this.y);
    for (let a of this.agents) a.display();
    pop();

    // border
    noFill();
    stroke(0, 0, 35, 40);
    rect(this.x, this.y, this.w, this.h, 12);

    // title
    noStroke();
    fill(0, 0, 90, 80);
    textAlign(LEFT, BASELINE);
    textSize(max(10, min(12, this.w * 0.05)));
    text(this.title, this.x + 8, this.y + this.h + 16);

    // HUD
    this.renderHud();
  }

  renderHud() {
  const counts = countBySides(this.agents);
  const total = max(1, this.agents.length);

  const H = entropyFromCounts(counts, total);
  const A = alignmentMetric(this.agents);

  const left = this.x + 8;
  const top = this.y + this.h + 22;
  const hudW = this.w - 16;
  const hudH = this.lh - 10;

  // HUD background
  noStroke();
  fill(0, 0, 8, 65);
  rect(left, top, hudW, hudH, 10);

  // --- Metrics line (kept clear of chart) ---
  fill(0, 0, 92, 78);
  textAlign(LEFT, TOP);
  textSize(max(9, min(11, hudW * 0.05)));
  text(`Entropy (chaos): ${H.toFixed(2)}   Alignment (movement): ${A.toFixed(2)}`, left + 8, top + 6);

  // --- Define a chart region BELOW the metrics line ---
  const chartX = left + HUD_PAD_X + HUD_YAXIS_W;
  const chartY = top + HUD_PAD_Y + HUD_TITLE_H;   // start below text
  const chartW = hudW - (HUD_PAD_X * 2) - HUD_YAXIS_W;
  const chartH = hudH - (HUD_PAD_Y * 2) - HUD_TITLE_H - HUD_AXIS_H;

  // Guard for very small panels
  if (chartW < 40 || chartH < 20) return;

  // --- Axes / guide line ---
  stroke(0, 0, 90, 25);
  line(chartX, chartY + chartH, chartX + chartW, chartY + chartH); // x-axis baseline

  // --- Y scale (count) ---
  const maxC = max(1, ...[3, 4, 5, 6, 7, 8].map((s) => counts[s] || 0));

  // Optional: 2 tick marks (0 and max)
  noStroke();
  fill(0, 0, 90, 45);
  textSize(max(8, min(10, hudW * 0.04)));
  textAlign(RIGHT, CENTER);
  text(`${maxC}`, chartX - 6, chartY);                 // top tick label
  text(`0`, chartX - 6, chartY + chartH);              // bottom tick label

  // --- Y-axis label ("Count") rotated ---
  push();
  // position Y-axis label in the reserved Y-axis area with extra padding
  translate(chartX - HUD_YAXIS_W / 2 - 4, chartY + chartH / 2);
  rotate(-HALF_PI);
  textAlign(CENTER, CENTER);
  fill(0, 0, 90, 50);
  textSize(max(8, min(10, hudW * 0.04)));
  text("Count", 0, 0);
  pop();

  // --- Bars (3..8) ---
  const binCount = 6;
  const binW = chartW / binCount;

  for (let i = 0; i < binCount; i++) {
    const s = 3 + i;
    const c = counts[s] || 0;
    const barH = chartH * (c / maxC);

    noStroke();
    fill(sideHue(s), 60, 95, 85);
    rect(
      chartX + i * binW + 4,
      chartY + (chartH - barH),
      binW - 8,
      barH,
      6
    );

    // x tick value (3..8)
    fill(0, 0, 90, 70);
    textAlign(CENTER, TOP);
    textSize(max(8, min(10, binW * 0.45)));
    text(`${s}`, chartX + i * binW + binW / 2, chartY + chartH + 2);
  }

  // --- X-axis label (positioned below the chart baseline to avoid overlap) ---
  fill(0, 0, 90, 50);
  textAlign(CENTER, TOP);
  textSize(max(8, min(10, hudW * 0.04)));
  text("Sides (3–8)", chartX + chartW / 2, chartY + chartH + HUD_AXIS_H / 2);

  // --- Sparkline (entropy trend) drawn ABOVE chart, under metrics (optional) ---
  if (this.history.length > 2) {
    const sx = left + HUD_PAD_X;
    const sy = top + HUD_PAD_Y + 2;         // near top, under metrics baseline
    const sw = hudW - HUD_PAD_X * 2;
    const sh = 10;

    noFill();
    stroke(0, 0, 90, 35);
    beginShape();
    for (let i = 0; i < this.history.length; i++) {
      const x = sx + (i / (this.historyLen - 1)) * sw;
      const y = sy + (1 - this.history[i].H) * sh;
      vertex(x, y);
    }
    endShape();
  }
}
}

/* -------------------- AGENT -------------------- */

class Agent {
  constructor(pos, hue, sides, speed, id) {
    this.id = id;
    this.pos = pos.copy();
    this.hue = hue;
    this.sides = sides;

    this.speed = speed; // fixed
    this.vel = p5.Vector.random2D().mult(this.speed);

    this.angle = random(TWO_PI);
    this.cooldown = 0;
  }

  update(w, h) {
    this.angle += 0.002 * this.sides;
    this.pos.add(this.vel);

    // wrap
    if (this.pos.x < 0) this.pos.x = w;
    if (this.pos.x > w) this.pos.x = 0;
    if (this.pos.y < 0) this.pos.y = h;
    if (this.pos.y > h) this.pos.y = 0;

    if (this.cooldown > 0) this.cooldown--;
  }

  setDirectionKeepingSpeed(dirUnit) {
    let d = dirUnit.copy();
    if (d.mag() < 1e-6) d = p5.Vector.random2D();
    d.normalize();
    this.vel = d.mult(this.speed);
  }

  kickAlongAdjacentEdge(impactAngleWorld) {
    let n = this.sides;

    let local = normalizeAngle(impactAngleWorld - this.angle);
    let sectorSize = TWO_PI / n;
    let hitSector = floor(local / sectorSize);

    let adjacent = (hitSector + 1) % n;
    let edgeRadial = this.angle + (adjacent + 0.5) * sectorSize;

    let moveAngle = edgeRadial + HALF_PI;
    let dir = p5.Vector.fromAngle(moveAngle).normalize();

    this.setDirectionKeepingSpeed(dir);
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);

    stroke(this.hue, 30, 100, 15);
    noFill();
    circle(0, 0, influenceRadius * 2);

    noStroke();
    fill(this.hue, 80, 100, 100);
    drawPolygon(0, 0, 10, this.sides);

    pop();
  }
}

/* -------------------- METRIC HELPERS -------------------- */

function sideHue(s) {
  return map(s, 3, 8, 30, 330);
}

function entropyFromCounts(counts, total) {
  let H = 0;
  for (let s = 3; s <= 8; s++) {
    const p = (counts[s] || 0) / total;
    if (p > 0) H -= p * Math.log(p);
  }
  return H / Math.log(6); // normalized 0..1
}

function alignmentMetric(agents) {
  if (agents.length === 0) return 0;
  let sum = createVector(0, 0);
  for (let a of agents) sum.add(a.vel.copy().normalize());
  sum.div(agents.length);
  return constrain(sum.mag(), 0, 1);
}

/* -------------------- GENERAL HELPERS -------------------- */

function drawPolygon(x, y, r, n) {
  beginShape();
  for (let i = 0; i < n; i++) {
    let a = (TWO_PI * i) / n;
    vertex(x + cos(a) * r, y + sin(a) * r);
  }
  endShape(CLOSE);
}

function countBySides(agents) {
  let out = {};
  for (let a of agents) out[a.sides] = (out[a.sides] || 0) + 1;
  return out;
}

function separateLocal(a, b) {
  let delta = p5.Vector.sub(a.pos, b.pos);
  let mag = delta.mag();
  if (mag < 1e-6) delta = p5.Vector.random2D();
  delta.normalize();

  let push = (clashRadius - mag) * 0.6 + 0.5;
  a.pos.add(p5.Vector.mult(delta, push));
  b.pos.add(p5.Vector.mult(delta, -push));
}

function isTooCloseLocal(pos, agents, minD) {
  for (let a of agents) {
    if (p5.Vector.dist(pos, a.pos) < minD) return true;
  }
  return false;
}

function pickHueDifferentFromNeighborsLocal(pos, agents, radius, threshold) {
  for (let tries = 0; tries < 500; tries++) {
    let h = random(360);
    let ok = true;

    for (let a of agents) {
      if (p5.Vector.dist(pos, a.pos) <= radius) {
        if (hueDistance(h, a.hue) < threshold) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return h;
  }
  return random(360);
}

function hueDistance(a, b) {
  let d = abs(a - b) % 360;
  return min(d, 360 - d);
}

function averageHueInInfluenceLocal(pos, agents, radius) {
  let sumSin = 0;
  let sumCos = 0;
  let count = 0;

  for (let a of agents) {
    if (p5.Vector.dist(pos, a.pos) <= radius) {
      let rad = radians(a.hue);
      sumCos += cos(rad);
      sumSin += sin(rad);
      count++;
    }
  }
  if (count === 0) return random(360);

  let mean = atan2(sumSin / count, sumCos / count);
  if (mean < 0) mean += TWO_PI;
  return degrees(mean);
}

function normalizeAngle(a) {
  a = a % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

let panels = [];
const panelCols = 3;
const panelRows = 2;

const panelW = 260;
const panelH = 260;
const labelH = 90;
const pad = 16;

const numAgents = 30;

const influenceRadius = 20; // 3D influence radius
const clashRadius = 18;     // 3D clash radius

const trailLifetimeMs = 500; // 0.5 seconds
const trailAlphaMax = 22;    // low opacity trail (0..100)

const cuboidDepth = 220;

// Collision visuals
const impactLifetimeMs = 260;
const impactAlphaMax = 75;
const hitFlashFrames = 10;

function setup() {
  createCanvas(
    pad + panelCols * (panelW + pad),
    pad + panelRows * (panelH + labelH + pad)
  );
  colorMode(HSB, 360, 100, 100, 100);

  panels = [];

  panels.push(new Panel("1) 100% 3, 0% 8", distTwo(numAgents, 1.00, 0.00)));
  panels.push(new Panel("2) 25% 3, 75% 8", distTwo(numAgents, 0.25, 0.75)));
  panels.push(new Panel("3) 50% 3, 50% 8", distTwo(numAgents, 0.50, 0.50)));
  panels.push(new Panel("4) 75% 3, 25% 8", distTwo(numAgents, 0.75, 0.25)));
  panels.push(new Panel("5) 0% 3, 100% 8", distTwo(numAgents, 0.00, 1.00)));
  panels.push(new Panel("6) Equal 3..8", distAllEqual(numAgents)));

  for (let i = 0; i < panels.length; i++) {
    let col = i % panelCols;
    let row = floor(i / panelCols);

    let x = pad + col * (panelW + pad);
    let y = pad + row * (panelH + labelH + pad);

    panels[i].setRect(x, y, panelW, panelH, labelH);
    panels[i].spawnInitial();
  }
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

    // collision effects
    this.impacts = []; // {pos:{x,y,z}, hue, t, kind}
  }

  setRect(x, y, w, h, labelH_) {
    this.x = x; this.y = y; this.w = w; this.h = h; this.lh = labelH_;
  }

  contains(mx, my) {
    return (mx >= this.x && mx <= this.x + this.w &&
            my >= this.y && my <= this.y + this.h);
  }

  // Perspective projection from local 3D -> local 2D
  project(pos3) {
    let zn = constrain(pos3.z / cuboidDepth, 0, 1);
    let s = lerp(1.25, 0.60, zn);

    let cx = this.w * 0.5;
    let cy = this.h * 0.5;

    let px = (pos3.x - cx) * s + cx;
    let py = (pos3.y - cy) * s + cy;

    return { x: px, y: py, scale: s, zn };
  }

  spawnInitial() {
    this.agents = [];
    this.impacts = [];
    this.nextId = 0;

    let sidesList = this.sidesList.slice();
    shuffle(sidesList, true);

    for (let i = 0; i < sidesList.length; i++) {
      let sides = sidesList[i];

      let placed = false;
      for (let attempts = 0; attempts < 1400 && !placed; attempts++) {
        let x = random(this.w);
        let y = random(this.h);
        let z = random(cuboidDepth);
        let pos = createVector(x, y, z);

        if (isTooCloseLocal3D(pos, this.agents, clashRadius * 0.9)) continue;

        let hue = pickHueDifferentFromNeighborsLocal3D(pos, this.agents, influenceRadius, 8);
        let speed = random(0.25, 1.4);

        this.agents.push(new Agent(pos, hue, sides, speed, this.nextId++));
        placed = true;
      }
    }
  }

  addRandomAgent(globalX, globalY) {
    let lx = constrain(globalX - this.x, 0, this.w);
    let ly = constrain(globalY - this.y, 0, this.h);

    let z = random(cuboidDepth);
    let sides = int(random(3, 9));
    let hue = random(360);
    let speed = random(0.2, 1.8);

    this.agents.push(new Agent(createVector(lx, ly, z), hue, sides, speed, this.nextId++));
  }

  step() {
    for (let a of this.agents) a.update(this.w, this.h);
    this.handleClashes();
    this.trimImpacts();
  }

  addImpact(pos3, hue, kind) {
    this.impacts.push({
      pos: { x: pos3.x, y: pos3.y, z: pos3.z },
      hue,
      t: millis(),
      kind // "sync" or "trade"
    });
  }

  trimImpacts() {
    let now = millis();
    while (this.impacts.length > 0 && (now - this.impacts[0].t) > impactLifetimeMs) {
      this.impacts.shift();
    }
  }

  handleClashes() {
    for (let i = 0; i < this.agents.length; i++) {
      for (let j = i + 1; j < this.agents.length; j++) {
        let a = this.agents[i];
        let b = this.agents[j];

        if (a.cooldown > 0 || b.cooldown > 0) continue;

        let d = dist3(a.pos, b.pos);
        if (d >= clashRadius) continue;

        // midpoint (3D) for impact ring
        let mid = p5.Vector.add(a.pos, b.pos).mult(0.5);

        if (a.sides === b.sides) {
          // Rule 5
          let dirA = a.vel.copy().normalize();
          let dirB = b.vel.copy().normalize();
          let dp = dirA.dot(dirB);

          let shared = (dp >= 0) ? dirA.copy().add(dirB) : dirA.copy().sub(dirB);
          if (shared.mag() < 1e-6) shared = dirA.copy();
          shared.normalize();

          a.setDirectionKeepingSpeed(shared);
          b.setDirectionKeepingSpeed(shared);

          let avgHue = averageHueInInfluenceLocal3D(mid, this.agents, influenceRadius);
          a.hue = avgHue;
          b.hue = avgHue;

          // collision visuals
          a.hitFlash = hitFlashFrames;
          b.hitFlash = hitFlashFrames;
          this.addImpact(mid, avgHue, "sync");

          separateLocal3D(a, b);

          a.cooldown = 10;
          b.cooldown = 10;
          continue;
        }

        // Rule 3/4
        let more = (a.sides > b.sides) ? a : b;
        let less = (a.sides > b.sides) ? b : a;

        more.sides = constrain(more.sides - 1, 3, 8);
        less.sides = constrain(less.sides + 1, 3, 8);

        // adder takes collided color
        less.hue = more.hue;

        // adjacent-edge direction change (speed preserved)
        let impactAngle2D = atan2(more.pos.y - less.pos.y, more.pos.x - less.pos.x);
        less.kickAlongAdjacentEdge2D(impactAngle2D);

        // visuals
        more.hitFlash = hitFlashFrames;
        less.hitFlash = hitFlashFrames;
        this.addImpact(mid, less.hue, "trade");

        separateLocal3D(a, b);

        a.cooldown = 10;
        b.cooldown = 10;
      }
    }
  }

  drawImpacts() {
    let now = millis();

    for (let imp of this.impacts) {
      let age = now - imp.t;
      let k = constrain(age / impactLifetimeMs, 0, 1);

      let pos3 = createVector(imp.pos.x, imp.pos.y, imp.pos.z);
      let pr = this.project(pos3);

      // expanding ring
      let r = lerp(8, 52, k) * pr.scale;

      let a = lerp(impactAlphaMax, 0, k);
      let sat = (imp.kind === "sync") ? 40 : 80;    // sync is softer
      let bri = (imp.kind === "sync") ? 100 : 100;

      stroke(imp.hue, sat, bri, a);
      strokeWeight(2);
      noFill();
      circle(pr.x, pr.y, r);

      // small "spark" cross
      strokeWeight(1.5);
      let s = lerp(4, 16, k) * pr.scale;
      line(pr.x - s, pr.y, pr.x + s, pr.y);
      line(pr.x, pr.y - s, pr.x, pr.y + s);
    }
  }

  render() {
    // panel background
    noStroke();
    fill(0, 0, 12, 100);
    rect(this.x, this.y, this.w, this.h, 12);

    push();
    translate(this.x, this.y);

    // trails first
    for (let a of this.agents) a.drawTrail((pos3) => this.project(pos3));

    // impacts between trails and shapes
    this.drawImpacts();

    // depth sort far->near so nearer shapes draw on top
    let sorted = this.agents.slice().sort((a, b) => b.pos.z - a.pos.z);
    for (let a of sorted) a.display((pos3) => this.project(pos3));

    pop();

    // border
    noFill();
    stroke(0, 0, 35, 40);
    rect(this.x, this.y, this.w, this.h, 12);

    // title + counts
    noStroke();
    fill(0, 0, 90, 80);
    textSize(12);
    text(this.title, this.x + 8, this.y + this.h + 18);

    let counts = countBySides(this.agents);
    let lines = [];
    for (let s = 3; s <= 8; s++) lines.push(`${s}-sided: ${counts[s] || 0}`);

    fill(0, 0, 85, 70);
    text(lines.join("\n"), this.x + 8, this.y + this.h + 36);
  }
}

/* -------------------- AGENT -------------------- */

class Agent {
  constructor(pos3, hue, sides, speed, id) {
    this.id = id;

    this.pos = pos3.copy(); // local (x,y,z)
    this.hue = hue;
    this.sides = sides;

    this.speed = speed; // fixed forever
    this.vel = randomUnit3D().mult(this.speed);

    this.angle = random(TWO_PI); // visual only
    this.cooldown = 0;

    // collision flash
    this.hitFlash = 0;

    // trail
    this.trail = [];
  }

  update(w, h) {
    // trail point
    this.trail.push({ x: this.pos.x, y: this.pos.y, z: this.pos.z, t: millis() });
    this.trimTrail();

    // visual rotation only
    this.angle += 0.002 * this.sides;

    // move (speed unchanged)
    this.pos.add(this.vel);

    // wrap cuboid
    if (this.pos.x < 0) this.pos.x = w;
    if (this.pos.x > w) this.pos.x = 0;

    if (this.pos.y < 0) this.pos.y = h;
    if (this.pos.y > h) this.pos.y = 0;

    if (this.pos.z < 0) this.pos.z = cuboidDepth;
    if (this.pos.z > cuboidDepth) this.pos.z = 0;

    if (this.cooldown > 0) this.cooldown--;
    if (this.hitFlash > 0) this.hitFlash--;
  }

  trimTrail() {
    let now = millis();
    while (this.trail.length > 0 && (now - this.trail[0].t) > trailLifetimeMs) {
      this.trail.shift();
    }
  }

  setDirectionKeepingSpeed(dirUnit3) {
    let d = dirUnit3.copy();
    if (d.mag() < 1e-6) d = randomUnit3D();
    d.normalize();
    this.vel = d.mult(this.speed);
  }

  kickAlongAdjacentEdge2D(impactAngle2D) {
    let n = this.sides;

    let local = normalizeAngle(impactAngle2D - this.angle);
    let sectorSize = TWO_PI / n;
    let hitSector = floor(local / sectorSize);

    let adjacent = (hitSector + 1) % n;
    let edgeRadial = this.angle + (adjacent + 0.5) * sectorSize;

    // tangent direction in XY
    let moveAngle = edgeRadial + HALF_PI;
    let desiredXY = createVector(cos(moveAngle), sin(moveAngle), 0).normalize();

    // preserve z tendency (but do not change speed)
    let currentDir = this.vel.copy().normalize();
    let newDir = createVector(desiredXY.x, desiredXY.y, currentDir.z);
    if (newDir.mag() < 1e-6) newDir = createVector(desiredXY.x, desiredXY.y, 0);
    newDir.normalize();

    this.setDirectionKeepingSpeed(newDir);
  }

  drawTrail(projector) {
    if (this.trail.length < 2) return;

    let now = millis();
    strokeWeight(1);
    noFill();

    for (let i = 1; i < this.trail.length; i++) {
      let a = this.trail[i - 1];
      let b = this.trail[i];

      let age = now - b.t;
      let alpha = map(age, 0, trailLifetimeMs, trailAlphaMax, 0, true);

      let pa = projector(createVector(a.x, a.y, a.z));
      let pb = projector(createVector(b.x, b.y, b.z));

      stroke(this.hue, 80, 100, alpha);
      line(pa.x, pa.y, pb.x, pb.y);
    }
  }

  display(projector) {
    let pr = projector(this.pos);
    let s = pr.scale;

    push();
    translate(pr.x, pr.y);
    rotate(this.angle);

    let bright = lerp(100, 70, pr.zn);

    // brief collision "flash" (visual only)
    let flash = this.hitFlash / hitFlashFrames; // 0..1
    let scaleBoost = 1 + 0.35 * flash;

    // influence ring
    stroke(this.hue, 30, 100, 12 + 18 * flash);
    strokeWeight(1.2 + 1.2 * flash);
    noFill();
    circle(0, 0, influenceRadius * 2 * s);

    // shape fill
    noStroke();
    fill(this.hue, 80, bright, 100);
    drawPolygon(0, 0, 10 * s * scaleBoost, this.sides);

    // outline pop on collision
    if (flash > 0.001) {
      noFill();
      stroke(this.hue, 15, 100, 55 * flash);
      strokeWeight(2.2 * flash + 0.6);
      drawPolygon(0, 0, 12 * s * scaleBoost, this.sides);
    }

    pop();
  }
}

/* -------------------- HELPERS -------------------- */

function drawPolygon(x, y, r, n) {
  beginShape();
  for (let i = 0; i < n; i++) {
    let a = TWO_PI * i / n;
    vertex(x + cos(a) * r, y + sin(a) * r);
  }
  endShape(CLOSE);
}

function countBySides(agents) {
  let out = {};
  for (let a of agents) out[a.sides] = (out[a.sides] || 0) + 1;
  return out;
}

function dist3(a, b) {
  let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return sqrt(dx * dx + dy * dy + dz * dz);
}

function separateLocal3D(a, b) {
  let delta = p5.Vector.sub(a.pos, b.pos);
  let mag = delta.mag();
  if (mag < 1e-6) delta = randomUnit3D();
  delta.normalize();

  // stronger separation (position-only; speeds unchanged)
  let push = (clashRadius - mag) * 1.1 + 1.4;

  a.pos.add(p5.Vector.mult(delta, push));
  b.pos.add(p5.Vector.mult(delta, -push));
}

function isTooCloseLocal3D(pos, agents, minD) {
  for (let a of agents) {
    if (dist3(pos, a.pos) < minD) return true;
  }
  return false;
}

function pickHueDifferentFromNeighborsLocal3D(pos, agents, radius, threshold) {
  for (let tries = 0; tries < 600; tries++) {
    let h = random(360);
    let ok = true;

    for (let a of agents) {
      if (dist3(pos, a.pos) <= radius) {
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

function averageHueInInfluenceLocal3D(pos, agents, radius) {
  let sumSin = 0;
  let sumCos = 0;
  let count = 0;

  for (let a of agents) {
    if (dist3(pos, a.pos) <= radius) {
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

function randomUnit3D() {
  let u = random(-1, 1);
  let t = random(TWO_PI);
  let s = sqrt(1 - u * u);
  return createVector(s * cos(t), s * sin(t), u);
}

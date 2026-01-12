let panels = [];
const numPanels = 6;

const panelCols = 3;
const panelHorizontals = 2;

const panelW = 260;
const panelH = 260;
const labelH = 85; // space under each panel for counts
const pad = 16;

const numAgents = 30;

const influenceRadius = 20;
const clashRadius = 18;

function setup() {
  createCanvas(
    pad + panelCols * (panelW + pad),
    pad + panelHorizontals * (panelH + labelH + pad)
  );

  colorMode(HSB, 360, 100, 100, 100);
  background(0, 0, 10);

  // Create 6 panels with requested starting distributions
  // 1) 100% tri, 0% oct
  panels.push(new Panel("1) 100% 3, 0% 8", distTwo(numAgents, 1.0, 0.0)));
  // 2) 25% tri, 75% oct
  panels.push(new Panel("2) 25% 3, 75% 8", distTwo(numAgents, 0.25, 0.75)));
  // 3) 50/50
  panels.push(new Panel("3) 50% 3, 50% 8", distTwo(numAgents, 0.5, 0.5)));
  // 4) 75/25
  panels.push(new Panel("4) 75% 3, 25% 8", distTwo(numAgents, 0.75, 0.25)));
  // 5) 0/100
  panels.push(new Panel("5) 0% 3, 100% 8", distTwo(numAgents, 0.0, 1.0)));
  // 6) equal 3..8
  panels.push(new Panel("6) Equal 3..8", distAllEqual(numAgents)));

  // Layout panels
  for (let i = 0; i < panels.length; i++) {
    let col = i % panelCols;
    let horizontal = floor(i / panelCols);

    let x = pad + col * (panelW + pad);
    let y = pad + horizontal * (panelH + labelH + pad);

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
  // Rule 6: clicking adds a random 3..8 sided shape in that panel
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

    // panel rectangle
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 0;
    this.lh = 0;
  }

  setRect(x, y, w, h, labelH) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.lh = labelH;
  }

  contains(mx, my) {
    return (
      mx >= this.x &&
      mx <= this.x + this.w &&
      my >= this.y &&
      my <= this.y + this.h
    );
  }

  // Convert global <-> local coords
  toLocal(v) {
    return createVector(v.x - this.x, v.y - this.y);
  }
  toGlobal(v) {
    return createVector(v.x + this.x, v.y + this.y);
  }

  spawnInitial() {
    this.agents = [];
    this.nextId = 0;

    let sidesList = this.sidesList.slice();
    shuffle(sidesList, true);

    for (let i = 0; i < sidesList.length; i++) {
      let sides = sidesList[i];

      let placed = false;
      for (let attempts = 0; attempts < 1200 && !placed; attempts++) {
        let lx = random(this.w);
        let ly = random(this.h);
        let pos = createVector(lx, ly);

        // avoid spawn overlaps
        if (isTooCloseLocal(pos, this.agents, clashRadius * 0.9)) continue;

        // Rule 2: initial colors random, no adjacent same color
        let hue = pickHueDifferentFromNeighborsLocal(
          pos,
          this.agents,
          influenceRadius,
          8
        );

        // speed fixed forever
        let speed = random(0.25, 1.4);

        this.agents.push(new Agent(pos, hue, sides, speed, this.nextId++));
        placed = true;
      }
    }
  }

  addRandomAgent(globalX, globalY) {
    // position inside panel local coords
    let lx = constrain(globalX - this.x, 0, this.w);
    let ly = constrain(globalY - this.y, 0, this.h);

    let sides = int(random(3, 9)); // 3..8
    let hue = random(360);
    let speed = random(0.2, 1.8);

    this.agents.push(
      new Agent(createVector(lx, ly), hue, sides, speed, this.nextId++)
    );
  }

  step() {
    // Move (no speed updates)
    for (let a of this.agents) a.update(this.w, this.h);

    // Clashes (rules 3/4/5)
    this.handleClashes();
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

        // Rule 5: if equal sides
        if (a.sides === b.sides) {
          let dirA = a.vel.copy().normalize();
          let dirB = b.vel.copy().normalize();
          let dp = dirA.dot(dirB);

          // Use dp to resolve how we combine directions (still "same direction")
          let shared = dp >= 0 ? dirA.copy().add(dirB) : dirA.copy().sub(dirB);
          if (shared.mag() < 1e-6) shared = dirA.copy();
          shared.normalize();

          a.setDirectionKeepingSpeed(shared);
          b.setDirectionKeepingSpeed(shared);

          let avgHue = averageHueInInfluenceLocal(
            mid,
            this.agents,
            influenceRadius
          );
          a.hue = avgHue;
          b.hue = avgHue;

          separateLocal(a, b);
          a.cooldown = 10;
          b.cooldown = 10;
          continue;
        }

        // Rule 3: less +1, more -1
        let more = a.sides > b.sides ? a : b;
        let less = a.sides > b.sides ? b : a;

        more.sides = constrain(more.sides - 1, 3, 8);
        less.sides = constrain(less.sides + 1, 3, 8);

        // Rule 4: adder takes collided color (less takes more's)
        less.hue = more.hue;

        // Rule 4: adder moves along adjacent edge to the one it hit (direction only)
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

    // draw agents clipped to panel rect visually (simple: just translate)
    push();
    translate(this.x, this.y);

    for (let a of this.agents) a.display();

    pop();

    // border
    noFill();
    stroke(0, 0, 35, 40);
    rect(this.x, this.y, this.w, this.h, 12);

    // title + counts under
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
  constructor(pos, hue, sides, speed, id) {
    this.id = id;

    this.pos = pos.copy(); // LOCAL coords within panel
    this.hue = hue;
    this.sides = sides;

    this.speed = speed; // fixed forever
    this.vel = p5.Vector.random2D().mult(this.speed);

    this.angle = random(TWO_PI); // visual orientation
    this.cooldown = 0;
  }

  update(w, h) {
    // visual only
    this.angle += 0.002 * this.sides;

    // speed is not updated
    this.pos.add(this.vel);

    // wrap inside panel
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

  // Edge-adjacent direction rule (direction only; speed preserved)
  kickAlongAdjacentEdge(impactAngleWorld) {
    let n = this.sides;

    let local = normalizeAngle(impactAngleWorld - this.angle);
    let sectorSize = TWO_PI / n;
    let hitSector = floor(local / sectorSize);

    let adjacent = (hitSector + 1) % n;
    let edgeRadial = this.angle + (adjacent + 0.5) * sectorSize;

    // tangent direction along that edge
    let moveAngle = edgeRadial + HALF_PI;
    let dir = p5.Vector.fromAngle(moveAngle).normalize();

    this.setDirectionKeepingSpeed(dir);
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);

    // influence ring
    stroke(this.hue, 30, 100, 15);
    noFill();
    circle(0, 0, influenceRadius * 2);

    noStroke();
    fill(this.hue, 80, 100, 100);
    drawPolygon(0, 0, 10, this.sides);

    pop();
  }
}

/* -------------------- HELPERS -------------------- */

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

// circular mean (handles wrap-around)
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

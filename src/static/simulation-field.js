const stages = {
  "Mạ non": {height: .57, density: .68, leaves: [105, 154, 67], tips: [178, 200, 96]},
  "Đẻ nhánh": {height: .92, density: .93, leaves: [67, 133, 69], tips: [150, 184, 83]},
  "Làm đòng": {height: 1.15, density: 1, leaves: [66, 134, 61], tips: [157, 188, 83]},
  "Trổ bông": {height: 1.22, density: 1, leaves: [101, 141, 65], tips: [173, 183, 87], grain: "#d9cd82"},
  "Chín vàng": {height: 1.25, density: 1, leaves: [155, 147, 65], tips: [216, 184, 93], grain: "#f0cf79"},
};

const pointText = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
const clamp = (value) => Math.max(0, Math.min(1, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const blend = (from, to, amount) =>
  `rgb(${from.map((channel, index) => Math.round(lerp(channel, to[index], amount))).join(" ")})`;
const neutralSignals = {leaf_roll: 0, leaf_droop: 0, tip_burn: 0, water_cover: 0, soil: "moist"};

function leafShape(x, y, height, side, rise, signals) {
  const {leaf_roll: roll, leaf_droop: droop} = signals;
  const tipX = x + height * (side * (.68 - roll * .27) + droop * .51);
  const tipY = y - height * (rise - droop * (.38 + Math.abs(side) * .57));
  const bendX = x + (tipX - x) * .22;
  const bendY = y - height * (.66 - droop * .08);
  const width = height * (.15 - roll * .11);
  const end = pointText(tipX, tipY);
  const base = pointText(x, y);
  const returnBend = pointText(bendX + width, bendY + width * .7);
  const vein = `M${base}Q${pointText(bendX, bendY)} ${end}`;
  const cutoffX = lerp(lerp(x, bendX, .8), lerp(bendX, tipX, .8), .8);
  const cutoffY = lerp(lerp(y, bendY, .8), lerp(bendY, tipY, .8), .8);
  const tipBend = pointText(lerp(bendX, tipX, .8), lerp(bendY, tipY, .8));
  return {
    blade: `${vein}Q${returnBend} ${base}Z`,
    vein,
    burn: `M${pointText(cutoffX, cutoffY)}Q${tipBend} ${end}`,
  };
}

function project([farLeft, farRight, nearRight, nearLeft], across, depth) {
  const perspective = depth ** 1.65;
  const leftX = lerp(farLeft.x, nearLeft.x, perspective);
  const leftY = lerp(farLeft.y, nearLeft.y, perspective);
  const rightX = lerp(farRight.x, nearRight.x, perspective);
  const rightY = lerp(farRight.y, nearRight.y, perspective);
  return [lerp(leftX, rightX, across), lerp(leftY, rightY, across)];
}

export function connectFieldScene(scene, study) {
  const nodes = Object.fromEntries(
    ["rows", "ripples", "shadows", "leaves", "tips", "grain", "burn"]
      .map((name) => [name, scene.querySelector(`#field-${name}`)]),
  );
  const studyNodes = Object.fromEntries(
    ["leaves", "tips", "burn", "grain", "water-body", "water-line"]
      .map((name) => [name, study.querySelector(`#study-${name}`)]),
  );
  const plot = Array.from(scene.querySelector("#field-parcel").points);
  let stage = "Làm đòng";
  let signals = neutralSignals;
  let salinity = 2.8;
  let evidenceOnly = false;
  let seed = 2048;

  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const furrows = [];
  const ripples = [];
  const plants = [];
  for (let column = 0; column < 23; column += 1) {
    const across = (column + .5) / 23;
    const [farX, farY] = project(plot, across, .025);
    const [nearX, nearY] = project(plot, across, .985);
    furrows.push(`M${pointText(farX, farY)}L${pointText(nearX, nearY)}`);
    for (let row = 0; row < 19; row += 1) {
      const depth = (row + .42 + random() * .34) / 19;
      const [x, y] = project(plot, across + (random() - .5) * .018, depth);
      plants.push({x, y, depth, variety: random()});
      if ((row + column) % 4 === 0) {
        const length = 3 + depth * 15;
        ripples.push(`M${pointText(x + 2, y + 4)}q${pointText(length * .48, -2)} ${pointText(length, -1)}`);
      }
    }
  }
  plants.sort((a, b) => a.y - b.y);
  nodes.rows.setAttribute("d", furrows.join(""));
  nodes.ripples.setAttribute("d", ripples.join(""));
  for (const side of ["east", "west"]) {
    const neighbor = Array.from(scene.querySelector(`#field-neighbor-${side}`).points);
    const grass = [];
    for (let row = 0; row < 17; row += 1) {
      const depth = (row + .58) / 17;
      for (let column = 0; column < 21; column += 1) {
        const [x, y] = project(neighbor, (column + .38 + random() * .25) / 21, depth);
        if (x < -12 || x > 1012) continue;
        const height = 2 + 10 * depth ** 1.3;
        grass.push(
          `M${pointText(x - height * .45, y - height * .65)}q${pointText(height * .5, 1)} ${pointText(height * .45, height * .65)}`
          + `q${pointText(height * .03, -height * .74)} ${pointText(height * .46, -height)}`,
        );
      }
    }
    scene.querySelector(`#field-neighbor-crops-${side}`).setAttribute("d", grass.join(""));
  }

  function colorCanopy() {
    const style = stages[stage];
    const stress = evidenceOnly ? signals.tip_burn : clamp((salinity - 1.5) / 4.5) * .7;
    for (const svg of [scene, study]) {
      svg.style.setProperty("--field-leaves", blend(style.leaves, [171, 127, 65], stress));
      svg.style.setProperty("--field-tips", blend(style.tips, [214, 157, 82], stress));
      svg.style.setProperty("--field-stem", blend(style.leaves, [34, 74, 41], .61));
      svg.style.setProperty("--field-grain", style.grain || "#d9cd82");
      svg.style.setProperty("--field-burn-opacity", signals.tip_burn);
    }
  }

  function drawStudy(style) {
    const base = 181;
    const height = 97 * style.height;
    const blades = [];
    const veins = [];
    const burns = [];
    const heads = [];
    const stems = style.density < .8 ? [-6, 8] : [-14, -6, 3, 12, 18];
    for (const [index, offset] of stems.entries()) {
      const x = 160 + offset;
      const stemHeight = height * (1 - Math.abs(offset) / 72);
      for (const [side, rise] of [[-.95, .64], [.93, .77], [.12 + offset / 38, 1.05]]) {
        const leaf = leafShape(x, base, stemHeight, side + offset / 44, rise, signals);
        blades.push(leaf.blade);
        veins.push(leaf.vein);
        if ((index + (side < 0 ? 1 : 0)) % 3 !== 0) burns.push(leaf.burn);
      }
      if (style.grain && index % 2 === 0) {
        const topX = x + offset * 1.42 + height * signals.leaf_droop * .4;
        const topY = base - stemHeight;
        heads.push(`M${pointText(x, base)}Q${pointText(topX, topY + 30)} ${pointText(topX + 9, topY - 14)}`);
        for (let grain = 0; grain < 5; grain += 1) {
          const y = topY - 12 + grain * 5;
          heads.push(`M${pointText(topX + 8 - grain, y)}l-8 -4m8 4 7 -2`);
        }
      }
    }
    studyNodes.leaves.setAttribute("d", blades.join(""));
    studyNodes.tips.setAttribute("d", veins.join(""));
    studyNodes.burn.setAttribute("d", burns.join(""));
    studyNodes.grain.setAttribute("d", heads.join(""));
    study.dataset.soil = signals.soil;
    const waterHeight = signals.water_cover * height * 1.04;
    const surface = base - waterHeight;
    studyNodes["water-body"].setAttribute("y", surface.toFixed(1));
    studyNodes["water-body"].setAttribute("height", waterHeight.toFixed(1));
    studyNodes["water-line"].setAttribute("d", waterHeight > 0.1 ? `M0 ${surface}q40 -4 80 0t80 0t80 0t80 0` : "");
  }

  function drawCanopy() {
    const style = stages[stage];
    const blades = [];
    const tips = [];
    const heads = [];
    const shadows = [];
    const burns = [];
    for (const {x, y, depth, variety} of plants) {
      if (variety > style.density) continue;
      const height = (3 + 21 * depth ** 1.8) * style.height * (.87 + variety * .32);
      const base = pointText(x, y);
      shadows.push(`M${base}l${pointText(height * .7, height * .18)}`);
      const shapes = [[-.88, .88], [1.06, .8], [.28 + (variety - .5) * .52, 1.23]];
      if (depth > .52 && style.density > .9) shapes.push([-1.16, .48]);
      for (const [side, rise] of shapes) {
        const leaf = leafShape(x, y, height, side, rise, signals);
        blades.push(leaf.blade);
        if (rise > 1) tips.push(leaf.vein);
        if (signals.tip_burn && variety < signals.tip_burn && depth > .23) burns.push(leaf.burn);
      }
      if (style.grain && variety > .26) {
        const topX = x + height * (.46 + signals.leaf_droop * .37);
        const topY = y - height * 1.08;
        heads.push(
          `M${base}q${pointText(0, -height * 1.16)} ${pointText(topX - x, topY - y)}`,
          `M${pointText(topX - height * .2, topY - height * .1)}l${pointText(height * .36, height * .23)}`,
        );
      }
    }
    nodes.leaves.setAttribute("d", blades.join(""));
    nodes.tips.setAttribute("d", tips.join(""));
    nodes.grain.setAttribute("d", heads.join(""));
    nodes.burn.setAttribute("d", burns.join(""));
    nodes.shadows.setAttribute("d", shadows.join(""));
    drawStudy(style);
    colorCanopy();
  }

  drawCanopy();
  return {
    setResult(nextStage, nextSignals) {
      if (Object.hasOwn(stages, nextStage) && (nextStage !== stage
          || Object.keys(signals).some((key) => signals[key] !== nextSignals[key]))) {
        stage = nextStage;
        signals = nextSignals;
        drawCanopy();
      }
    },
    setConditions(input) {
      evidenceOnly = input.evidenceOnly === true;
      salinity = input.salinity_gl;
      const depth = input.water_depth_cm;
      scene.style.setProperty("--field-water", clamp(.24 + depth / 40));
      scene.style.setProperty("--field-submerged", evidenceOnly ? signals.water_cover : clamp((depth - 14) / 60));
      scene.style.setProperty("--field-dry", clamp((1 - depth) / 10));
      scene.style.setProperty("--field-salt", evidenceOnly ? signals.tip_burn : clamp((salinity - .5) / 9));
      scene.style.setProperty("--field-heat", .18 + clamp((input.temp_c - 28) / 14) * .48);
      colorCanopy();
    },
  };
}

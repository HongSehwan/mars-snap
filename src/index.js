'use strict';

const reglib = require('regl');
const saveAs = require('filesaver.js').saveAs;
const renderer = require('./render.js');

const status = document.getElementById('status');
const statusBar = status.querySelector('.bar');
const next = document.getElementById('next');
const download = document.getElementById('download');
const canvas = document.getElementById('render-canvas');

let regl;
let baseParams;
let targetOffset = { x: 0, y: 0 };
let currentOffset = { x: 0, y: 0 };
let panAnimating = false;
let stageProgress = {};

const overscanScale = 1.2;
const progressStages = [
  { name: 'Compiling shaders...', weight: 0.5 },
  { name: 'Creating framebuffers...', weight: 0.5 },
  { name: 'Creating AO sampling vectors...', weight: 0.5 },
  { name: 'Creating noise...', weight: 0.5 },
  { name: 'Generating chunk mesh...', weight: 0.5 },
  { name: 'Calculating terrain positions', weight: 1.5 },
  { name: 'Generating height map', weight: 2.0 },
  { name: 'Generating sky cubemap', weight: 1.0 },
  { name: 'Generating shadow volume', weight: 1.5 },
  { name: 'Generating normal map', weight: 1.0 },
  { name: 'Calculating participating media', weight: 1.5 },
  { name: 'Determining diffuse colors', weight: 1.0 },
  { name: 'Calculating ambient occlusion', weight: 1.5 },
  { name: 'Calculating direct lighting', weight: 1.5 },
  { name: 'Composing image', weight: 1.0 },
];


document.addEventListener('DOMContentLoaded', main, false);
window.addEventListener('resize', reflow, false);
next.addEventListener('click', render);
download.addEventListener('click', downloadImage);
window.addEventListener('mousemove', updateParallax, false);
window.addEventListener('error', handleError);


function main() {
  regl = reglib({
    canvas: canvas,
    extensions: ['OES_texture_float', 'OES_texture_float_linear', 'OES_element_index_uint'],
    attributes: {
      preserveDrawingBuffer: true,
    }
  });
  reflow();
  baseParams = createBaseParams();
  render();
}

async function render() {
  baseParams = createBaseParams();
  await renderScene();
}


function createBaseParams() {
  return {
    seed: Math.floor(Math.random() * 1e9),
    fov: Math.random() * 50 + 20,
    dir: Math.random() * 360,
    alt: Math.random() * 1024 * 2 + 1,
    tod: 6 + Math.random(),
    colors: {
      high: {
        steep: [[0.7,0.28,0.12], [0.7,0.28,0.12]],
        flat: [[1.05,0.93,0.86], [1.05,0.93,0.86]],
      },
      low: {
        steep: [[0.6,0.24,0.1], [0.6,0.24,0.1]],
        flat: [[1.0,0.88,0.8], [1.0,0.88,0.8]],
      }
    },
    fog: Math.random() * 0.0001,
    groundFog: Math.random() * 0.01,
    groundFogAlt: Math.random() * 1024 * 2,
  };
}


function buildParams() {
  return Object.assign({}, baseParams, {
    callback: updateStatus,
    canvas: canvas,
  });
}
async function renderScene() {
  status.style.display = 'block';
  statusBar.style.width = '0%';
  stageProgress = {};
  status.style.lineHeight = window.innerHeight + 'px';
  await renderer.render(regl, buildParams());
  status.style.display = 'none';
}


function updateParallax(e) {
  const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
  const ny = 1 - (e.clientY / Math.max(1, window.innerHeight)) * 2;
  const maxOffsetX = Math.max(0, canvas.width - window.innerWidth);
  const maxOffsetY = Math.max(0, canvas.height - window.innerHeight);
  targetOffset.x = nx * (maxOffsetX * 0.5);
  targetOffset.y = ny * (maxOffsetY * 0.5);
  startPanAnimation();
}


function updateStatus(task, fraction, done) {
  if (task) {
    if (fraction !== undefined) {
      stageProgress[task] = Math.max(0, Math.min(1, fraction));
    } else if (stageProgress[task] === undefined) {
      stageProgress[task] = 0;
    }
    updateOverallProgress();
  }
  if (done) {
    status.style.display = 'none';
  }
}


function updateOverallProgress() {
  let totalWeight = 0;
  let total = 0;
  for (let i = 0; i < progressStages.length; i++) {
    const stage = progressStages[i];
    const value = stageProgress[stage.name];
    const progress = value === undefined ? 0 : value;
    total += progress * stage.weight;
    totalWeight += stage.weight;
  }
  const overall = totalWeight > 0 ? total / totalWeight : 0;
  statusBar.style.width = `${Math.round(overall * 100)}%`;
}


function reflow() {
  canvas.width = Math.ceil(window.innerWidth * overscanScale);
  canvas.height = Math.ceil(window.innerHeight * overscanScale);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  centerCanvas();
  if (baseParams) {
    renderScene();
  }
}


function downloadImage() {
  canvas.toBlob(function(blob) {
      saveAs(blob, 'badlands.png');
  });
}


function centerCanvas() {
  const x = Math.floor((window.innerWidth - canvas.width) / 2);
  const y = Math.floor((window.innerHeight - canvas.height) / 2);
  canvas.style.transform = `translate(${x}px, ${y}px)`;
}


function startPanAnimation() {
  if (panAnimating) return;
  panAnimating = true;
  requestAnimationFrame(panTick);
}


function panTick() {
  const lerpRate = 0.12;
  currentOffset.x += (targetOffset.x - currentOffset.x) * lerpRate;
  currentOffset.y += (targetOffset.y - currentOffset.y) * lerpRate;

  const baseX = Math.floor((window.innerWidth - canvas.width) / 2);
  const baseY = Math.floor((window.innerHeight - canvas.height) / 2);
  const x = baseX - currentOffset.x;
  const y = baseY - currentOffset.y;
  canvas.style.transform = `translate(${x}px, ${y}px)`;

  if (Math.abs(targetOffset.x - currentOffset.x) > 0.5 ||
      Math.abs(targetOffset.y - currentOffset.y) > 0.5) {
    requestAnimationFrame(panTick);
  } else {
    panAnimating = false;
  }
}


function handleError(e, url, line) {
  status.style.display = 'block';
  status.style.lineHeight = '128px';
  status.innerHTML = `<div>Sorry, couldn't render the badlands because of the following error:</div> <div style='color:red'>${e.message}</div>`;
}

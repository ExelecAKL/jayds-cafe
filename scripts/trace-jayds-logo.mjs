// Deterministic vector tracing of the existing, uncropped one-colour logo.
// Uses subpixel contours and fitted Bezier paths; no bitmap is embedded.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const source = "screenshots/welcome logo.png";
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const background = [251, 245, 238], ink = [62, 25, 15];
const difference = background.map((value, index) => value - ink[index]);
const norm = difference.reduce((sum, value) => sum + value * value, 0);
const coverage = new Float64Array(info.width * info.height);
let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  const index = (y * info.width + x) * 4;
  const value = Math.min(1, Math.max(0, difference.reduce((sum, delta, channel) => sum + (background[channel] - data[index + channel]) * delta, 0) / norm)) * data[index + 3] / 255;
  coverage[y * info.width + x] = value;
  if (value >= 0.15) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}
const padding = 3, originX = minX - padding, originY = minY - padding;
const width = maxX - minX + 1 + padding * 2, height = maxY - minY + 1 + padding * 2;
const sample = (x, y) => coverage[(y + originY) * info.width + x + originX] ?? 0;
const nodes = new Map(), adjacent = new Map();
function edge(x, y, number) {
  const horizontal = number === 0 || number === 2;
  const ex = x + (number === 1 ? 1 : 0), ey = y + (number === 2 ? 1 : 0);
  const key = `${horizontal ? "h" : "v"}:${ex}:${ey}`;
  if (!nodes.has(key)) {
    const a = sample(ex, ey), b = sample(ex + Number(horizontal), ey + Number(!horizontal));
    const t = (0.5 - a) / (b - a);
    nodes.set(key, [ex + 0.5 + (horizontal ? t : 0), ey + 0.5 + (horizontal ? 0 : t)]);
    adjacent.set(key, []);
  }
  return key;
}
for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
  const values = [sample(x, y), sample(x + 1, y), sample(x + 1, y + 1), sample(x, y + 1)];
  const code = values.reduce((bits, value, index) => bits | (value >= 0.5 ? 1 << index : 0), 0);
  const center = values.reduce((sum, value) => sum + value, 0) >= 2;
  const cases = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: center ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: center ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[3, 1]], 13: [[0, 1]], 14: [[3, 0]] };
  for (const [a, b] of cases[code] ?? []) {
    const first = edge(x, y, a), second = edge(x, y, b);
    adjacent.get(first).push(second); adjacent.get(second).push(first);
  }
}
const visited = new Set(), contours = [];
for (const start of nodes.keys()) {
  if (visited.has(start)) continue;
  const points = [];
  let key = start, previous = null;
  do {
    if (visited.has(key)) throw Error("Unexpected open contour");
    visited.add(key); points.push(nodes.get(key));
    const links = adjacent.get(key);
    if (links.length !== 2) throw Error("Unclosed logo contour");
    const next = links.find(value => value !== previous);
    previous = key; key = next;
  } while (key !== start);
  const area = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p[0] * next[1] - next[0] * p[1]; }, 0) / 2;
  if (Math.abs(area) > 0.08) contours.push(points);
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const multiply = (p, n) => [p[0] * n, p[1] * n];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const length = p => Math.hypot(...p);
const unit = p => multiply(p, 1 / (length(p) || 1));
function evaluate(points, t) {
  let work = points;
  while (work.length > 1) work = work.slice(0, -1).map((p, i) => add(multiply(p, 1 - t), multiply(work[i + 1], t)));
  return work[0];
}
function generate(points, parameters, left, right) {
  const first = points[0], last = points.at(-1);
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  points.forEach((point, i) => {
    const u = parameters[i], v = 1 - u;
    const b = [v ** 3, 3 * u * v ** 2, 3 * u ** 2 * v, u ** 3];
    const a1 = multiply(left, b[1]), a2 = multiply(right, b[2]);
    const residual = subtract(point, add(multiply(first, b[0] + b[1]), multiply(last, b[2] + b[3])));
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2); x0 += dot(a1, residual); x1 += dot(a2, residual);
  });
  const determinant = c00 * c11 - c01 * c01;
  let alphaL = determinant ? (x0 * c11 - x1 * c01) / determinant : 0;
  let alphaR = determinant ? (c00 * x1 - c01 * x0) / determinant : 0;
  const distance = length(subtract(last, first));
  if (alphaL < 1e-6 * distance || alphaR < 1e-6 * distance) alphaL = alphaR = distance / 3;
  return [first, add(first, multiply(left, alphaL)), add(last, multiply(right, alphaR)), last];
}
function errorFor(points, curve, parameters) {
  let error = 0, split = Math.floor(points.length / 2);
  for (let i = 1; i < points.length - 1; i++) {
    const delta = subtract(evaluate(curve, parameters[i]), points[i]), distance = dot(delta, delta);
    if (distance > error) { error = distance; split = i; }
  }
  return { error, split };
}
function fit(points, left, right, tolerance = 0.18 ** 2) {
  if (points.length === 2) {
    const distance = length(subtract(points[1], points[0])) / 3;
    return [[points[0], add(points[0], multiply(left, distance)), add(points[1], multiply(right, distance)), points[1]]];
  }
  let parameters = [0];
  for (let i = 1; i < points.length; i++) parameters.push(parameters.at(-1) + length(subtract(points[i], points[i - 1])));
  const total = parameters.at(-1);
  parameters = parameters.map(value => value / total);
  let curve = generate(points, parameters, left, right), result = errorFor(points, curve, parameters);
  if (result.error <= tolerance) return [curve];
  if (result.error <= tolerance * 4) for (let attempt = 0; attempt < 4; attempt++) {
    const derivative = curve.slice(0, -1).map((p, i) => multiply(subtract(curve[i + 1], p), 3));
    const second = derivative.slice(0, -1).map((p, i) => multiply(subtract(derivative[i + 1], p), 2));
    const refined = parameters.map((u, i) => {
      const delta = subtract(evaluate(curve, u), points[i]), slope = evaluate(derivative, u);
      const denominator = dot(slope, slope) + dot(delta, evaluate(second, u));
      return Math.min(1, Math.max(0, denominator ? u - dot(delta, slope) / denominator : u));
    });
    if (refined.some((u, i) => i && u <= refined[i - 1])) break;
    parameters = refined; curve = generate(points, parameters, left, right); result = errorFor(points, curve, parameters);
    if (result.error <= tolerance) return [curve];
  }
  const split = Math.max(1, Math.min(points.length - 2, result.split));
  const center = unit(subtract(points[split - 1], points[split + 1]));
  return [...fit(points.slice(0, split + 1), left, center, tolerance), ...fit(points.slice(split), multiply(center, -1), right, tolerance)];
}
const number = n => String(Number(n.toFixed(3)));
const pair = p => p.map(number).join(" ");
let segmentCount = 0;
const paths = contours.map(points => {
  let corner = 0, strongest = -Infinity;
  points.forEach((point, i) => {
    const before = unit(subtract(point, points[(i - 1 + points.length) % points.length]));
    const after = unit(subtract(points[(i + 1) % points.length], point));
    const bend = 1 - dot(before, after);
    if (bend > strongest) { strongest = bend; corner = i; }
  });
  const rotated = [...points.slice(corner), ...points.slice(0, corner)];
  rotated.push(rotated[0]);
  const curves = fit(rotated, unit(subtract(rotated[1], rotated[0])), unit(subtract(rotated.at(-2), rotated.at(-1))));
  segmentCount += curves.length;
  return `M${pair(curves[0][0])}${curves.map(curve => `C${pair(curve[1])} ${pair(curve[2])} ${pair(curve[3])}`).join("")}Z`;
});
const markup = `<title id="title">Jayds Café</title><desc id="description">Original Jayds Café mascot and lettering, traced as scalable vector paths on a transparent background.</desc><path fill="#3e190f" fill-rule="evenodd" d="${paths.join("")}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">${markup}</svg>\n`;
const output = "assets/jayds-logo-transparent.svg";
writeFileSync(output, svg);
await sharp(Buffer.from(svg), { density: 288 }).png().toFile("assets/jayds-logo-transparent.png");
mkdirSync(".codex-logs/logo", { recursive: true });
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 3}" height="${height * 3}" viewBox="-12 -12 ${width + 24} ${height + 24}"><defs><pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#ffffff"/><path d="M0 0h8v8H0zm8 8h8v8H8z" fill="#ece8e3"/></pattern></defs><rect x="-12" y="-12" width="${width + 24}" height="${height + 24}" fill="url(#checker)"/>${markup}</svg>`;
await sharp(Buffer.from(preview)).png().toFile(".codex-logs/logo/transparent-preview.png");
const { data: raster, info: rasterInfo } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let intersection = 0, union = 0;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const original = sample(x, y) >= 0.5, rendered = raster[(y * width + x) * 4 + 3] >= 128;
  intersection += Number(original && rendered); union += Number(original || rendered);
}
const report = { source, output, width, height, contours: contours.length, bezierSegments: segmentCount, rasterEmbedded: false, backgroundRectangle: false, transparentCorner: raster[3] === 0, referenceMaskOverlap: intersection / union, renderSize: [rasterInfo.width, rasterInfo.height] };
writeFileSync(".codex-logs/logo/vector-verification.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (intersection / union < 0.97 || raster[3] !== 0) throw Error("Logo trace failed fidelity/transparency check");

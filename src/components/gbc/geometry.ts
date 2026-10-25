/**
 * Geometry builders for the shell.
 *
 * The GBC body is not a uniform rounded box: the bottom corners are much more
 * rounded than the top two, and the front face is softly bevelled. So the
 * shell is an extruded rounded-rect with per-corner radii plus a bevel,
 * rather than a RoundedBox.
 */

import * as THREE from 'three';

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/**
 * Rounded rectangle centred on the origin in the XY plane.
 * Each corner gets its own radius, clamped so arcs can't overlap.
 */
export function roundedRectShape(
  width: number,
  height: number,
  radii: CornerRadii,
): THREE.Shape {
  const hw = width / 2;
  const hh = height / 2;
  const limit = Math.min(hw, hh);
  const r = {
    topLeft: Math.min(radii.topLeft, limit),
    topRight: Math.min(radii.topRight, limit),
    bottomRight: Math.min(radii.bottomRight, limit),
    bottomLeft: Math.min(radii.bottomLeft, limit),
  };

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r.bottomLeft, -hh);
  shape.lineTo(hw - r.bottomRight, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r.bottomRight);
  shape.lineTo(hw, hh - r.topRight);
  shape.quadraticCurveTo(hw, hh, hw - r.topRight, hh);
  shape.lineTo(-hw + r.topLeft, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r.topLeft);
  shape.lineTo(-hw, -hh + r.bottomLeft);
  shape.quadraticCurveTo(-hw, -hh, -hw + r.bottomLeft, -hh);
  shape.closePath();
  return shape;
}

export interface ShellOptions {
  width: number;
  height: number;
  depth: number;
  radii: CornerRadii;
  /** Bevel size on the front and back faces. */
  bevel?: number;
  curveSegments?: number;
  bevelSegments?: number;
  /** Cutouts punched through the slab (screen window, button holes). */
  holes?: THREE.Path[];
}

/**
 * Extrudes a rounded rect into a bevelled slab, centred on the origin in
 * all three axes. Bevel is inset from `depth` so the total depth is exact.
 */
export function shellGeometry({
  width,
  height,
  depth,
  radii,
  bevel = 0.12,
  curveSegments = 16,
  bevelSegments = 4,
  holes,
}: ShellOptions): THREE.ExtrudeGeometry {
  const shape = roundedRectShape(width, height, radii);
  if (holes?.length) shape.holes.push(...holes);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments,
    curveSegments,
  });
  // ExtrudeGeometry grows along +z from 0; recentre it.
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** Circular cutout, for button and speaker holes. */
export function circlePath(cx: number, cy: number, radius: number): THREE.Path {
  const path = new THREE.Path();
  // Clockwise, so it subtracts from the counter-clockwise outline.
  path.absarc(cx, cy, radius, 0, Math.PI * 2, true);
  return path;
}

/** Rounded-rect cutout, for the screen window. */
export function roundedRectPath(
  cx: number,
  cy: number,
  width: number,
  height: number,
  radius: number,
): THREE.Path {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  const path = new THREE.Path();
  // Wound clockwise so it subtracts from the counter-clockwise outline.
  path.moveTo(cx - hw + r, cy - hh);
  path.quadraticCurveTo(cx - hw, cy - hh, cx - hw, cy - hh + r);
  path.lineTo(cx - hw, cy + hh - r);
  path.quadraticCurveTo(cx - hw, cy + hh, cx - hw + r, cy + hh);
  path.lineTo(cx + hw - r, cy + hh);
  path.quadraticCurveTo(cx + hw, cy + hh, cx + hw, cy + hh - r);
  path.lineTo(cx + hw, cy - hh + r);
  path.quadraticCurveTo(cx + hw, cy - hh, cx + hw - r, cy - hh);
  path.closePath();
  return path;
}

/** Capsule-shaped cutout for the START / SELECT pills. */
export function pillPath(
  cx: number,
  cy: number,
  width: number,
  thickness: number,
  rotation: number,
): THREE.Path {
  const r = thickness / 2;
  const half = Math.max(width / 2 - r, 0.001);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const at = (x: number, y: number): [number, number] => [
    cx + x * cos - y * sin,
    cy + x * sin + y * cos,
  ];

  const path = new THREE.Path();
  const steps = 10;
  const points: [number, number][] = [];
  // Right cap, sweeping from -90 to +90 degrees.
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    points.push(at(half + Math.cos(a) * r, Math.sin(a) * r));
  }
  // Left cap, sweeping from +90 to +270.
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI / 2 + (i / steps) * Math.PI;
    points.push(at(-half + Math.cos(a) * r, Math.sin(a) * r));
  }
  path.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) path.lineTo(x, y);
  path.closePath();
  return path;
}

/**
 * Cross-shaped D-pad outline, centred on the origin.
 * `arm` is the half-length from centre to tip, `thickness` the arm width.
 */
export function dpadShape(arm: number, thickness: number, fillet = 0.08): THREE.Shape {
  const t = thickness / 2;
  const shape = new THREE.Shape();
  // Walk the 12 corners of a plus sign, rounding each junction slightly.
  const points: [number, number][] = [
    [-t, -arm],
    [t, -arm],
    [t, -t],
    [arm, -t],
    [arm, t],
    [t, t],
    [t, arm],
    [-t, arm],
    [-t, t],
    [-arm, t],
    [-arm, -t],
    [-t, -t],
  ];
  shape.moveTo(points[0][0] + fillet, points[0][1]);
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const after = points[(i + 2) % points.length];
    // Line to just before the corner, then round into the next edge.
    const toNext = new THREE.Vector2(next[0] - current[0], next[1] - current[1]);
    const toAfter = new THREE.Vector2(after[0] - next[0], after[1] - next[1]);
    const inLen = Math.min(fillet, toNext.length() / 2);
    const outLen = Math.min(fillet, toAfter.length() / 2);
    toNext.normalize();
    toAfter.normalize();
    shape.lineTo(next[0] - toNext.x * inLen, next[1] - toNext.y * inLen);
    shape.quadraticCurveTo(
      next[0],
      next[1],
      next[0] + toAfter.x * outLen,
      next[1] + toAfter.y * outLen,
    );
  }
  shape.closePath();
  return shape;
}

/** Bevelled extrusion of an arbitrary shape, centred in z. */
export function extrudeCentered(
  shape: THREE.Shape,
  depth: number,
  bevel = 0.05,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - bevel * 2, 0.001),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

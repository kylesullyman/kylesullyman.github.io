/**
 * The translucent shell, the LCD assembly, and the internals you can see
 * through the clear red plastic.
 *
 * The "clear berry red" look comes from meshPhysicalMaterial with
 * transmission + attenuation tinted red: light picks up colour as it travels
 * through the thickness, which is what makes real transparent plastic read as
 * deep at the edges and bright across the flats.
 *
 * The front half has real cutouts for the screen window, the D-pad, A/B and
 * the two pills. Without them the controls sit *behind* transmissive plastic,
 * which fogs them badly and reads as a sticker under glass rather than a
 * moulded shell.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import {
  BEZEL,
  BODY,
  DPAD,
  FACE_BUTTONS,
  PALETTE,
  PILL_BUTTONS,
  SCREEN,
  SPEAKER,
  WORDMARK,
} from '../spec';
import {
  circlePath,
  pillPath,
  roundedRectPath,
  shellGeometry,
} from '../geometry';
import { drawText } from '../font';

/** Real CGB-001 corners: gently rounded top, much rounder bottom. */
const RADII = {
  topLeft: BODY.radius * 0.75,
  topRight: BODY.radius * 0.75,
  bottomRight: BODY.radius * 2.4,
  bottomLeft: BODY.radius * 2.4,
};

/** Shared plastic material settings for both shell halves. */
const PLASTIC = {
  color: PALETTE.shell,
  roughness: 0.16,
  metalness: 0,
  transmission: 0.55,
  thickness: 1.1,
  ior: 1.52,
  attenuationColor: PALETTE.shellAttenuation,
  attenuationDistance: 3.2,
  clearcoat: 1,
  clearcoatRoughness: 0.09,
  transparent: true,
  side: THREE.DoubleSide as THREE.Side,
};

/** Front and back halves of the shell, split at the seam. */
export function Shell() {
  const frontDepth = BODY.front - BODY.seam;
  const backDepth = BODY.seam - BODY.back;

  const front = useMemo(() => {
    // Openings in the front face. Each is slightly larger than the part that
    // sits in it so there is a visible moulding gap, like the real shell.
    const holes = [
      roundedRectPath(BEZEL.x, BEZEL.y, BEZEL.width, BEZEL.height, 0.45),
      circlePath(DPAD.x, DPAD.y, DPAD.arm * 1.12),
      circlePath(FACE_BUTTONS.a.x, FACE_BUTTONS.a.y, FACE_BUTTONS.radius * 1.2),
      circlePath(FACE_BUTTONS.b.x, FACE_BUTTONS.b.y, FACE_BUTTONS.radius * 1.2),
      pillPath(
        PILL_BUTTONS.select.x,
        PILL_BUTTONS.select.y,
        PILL_BUTTONS.width * 1.12,
        PILL_BUTTONS.depth * 1.3,
        PILL_BUTTONS.rotation,
      ),
      pillPath(
        PILL_BUTTONS.start.x,
        PILL_BUTTONS.start.y,
        PILL_BUTTONS.width * 1.12,
        PILL_BUTTONS.depth * 1.3,
        PILL_BUTTONS.rotation,
      ),
    ];
    return shellGeometry({
      width: BODY.width,
      height: BODY.height,
      depth: frontDepth,
      radii: RADII,
      bevel: 0.14,
      holes,
    });
  }, [frontDepth]);

  const back = useMemo(
    () =>
      shellGeometry({
        width: BODY.width,
        height: BODY.height,
        depth: backDepth,
        radii: RADII,
        bevel: 0.2,
      }),
    [backDepth],
  );

  useEffect(() => () => {
    front.dispose();
    back.dispose();
  }, [front, back]);

  return (
    <group>
      <mesh geometry={front} position={[0, 0, BODY.seam + frontDepth / 2]}>
        <meshPhysicalMaterial {...PLASTIC} />
      </mesh>
      <mesh geometry={back} position={[0, 0, BODY.back + backDepth / 2]}>
        <meshPhysicalMaterial {...PLASTIC} />
      </mesh>
    </group>
  );
}

/**
 * Internals, visible through the transmissive shell: PCB, a couple of chips,
 * the speaker cone and the AA battery pair.
 *
 * Everything here must stay inside the shell walls. The plastic is
 * transmissive, so a part that overhangs does not hide -- it renders outside
 * the silhouette as a dark sliver, and a cylinder cap breaking the edge reads
 * as a pinwheel of shaded triangles.
 */
export function Internals() {
  const z = BODY.seam - 1.1;
  // Keep internals clear of the wall, which is bevelled and so curves inward
  // before it reaches the nominal half-width.
  const innerX = BODY.width / 2 - 0.45;
  return (
    <group>
      {/* Main board */}
      <mesh position={[0, BODY.height * 0.04, z]}>
        <boxGeometry args={[BODY.width * 0.8, BODY.height * 0.5, 0.16]} />
        <meshStandardMaterial color={PALETTE.pcb} roughness={0.78} />
      </mesh>
      {/* CPU + a support chip */}
      <mesh position={[-BODY.width * 0.14, -BODY.height * 0.04, z - 0.2]}>
        <boxGeometry args={[2.0, 2.0, 0.22]} />
        <meshStandardMaterial color={PALETTE.chip} roughness={0.5} />
      </mesh>
      <mesh position={[BODY.width * 0.16, BODY.height * 0.08, z - 0.2]}>
        <boxGeometry args={[1.3, 1.0, 0.2]} />
        <meshStandardMaterial color={PALETTE.chip} roughness={0.5} />
      </mesh>
      {/* Speaker cone, sized to the grille it sits behind rather than
          overhanging the shell edge. */}
      <mesh position={[SPEAKER.x, SPEAKER.y, z - 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.5, 24]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.85} />
      </mesh>
      {/* Two AAs in the lower back. A 50mm cell is most of the 78mm body
          width, so the pair stacks vertically -- side by side they would need
          100mm and burst through both walls. Seated low enough to clear the
          board above them. */}
      {[-0.78, 0.78].map((offset) => (
        <mesh
          key={offset}
          position={[0, -BODY.height * 0.34 + offset, BODY.back + 1.1]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.72, 0.72, Math.min(5.0, innerX * 2), 20]} />
          <meshStandardMaterial color={PALETTE.battery} roughness={0.45} metalness={0.5} />
        </mesh>
      ))}
      {/* Cartridge slot shroud at the top back */}
      <mesh position={[0, BODY.height * 0.41, BODY.back + 0.9]}>
        <boxGeometry args={[BODY.width * 0.64, 1.6, 1.4]} />
        <meshStandardMaterial color="#1b1b20" roughness={0.8} />
      </mesh>
    </group>
  );
}

/**
 * The LCD assembly, seated in the shell's screen cutout: dark bezel plate,
 * the live texture, and a glass pane with a faint sheen.
 */
export function ScreenAssembly({ texture }: { texture: THREE.Texture }) {
  // The bezel plate fills the cutout and sits just below the shell surface.
  const plateZ = BODY.front - 0.55;

  const plate = useMemo(
    () =>
      shellGeometry({
        width: BEZEL.width + 0.5,
        height: BEZEL.height + 0.5,
        depth: 0.5,
        radii: { topLeft: 0.5, topRight: 0.5, bottomRight: 0.5, bottomLeft: 0.5 },
        bevel: 0.05,
      }),
    [],
  );

  useEffect(() => () => plate.dispose(), [plate]);

  return (
    <group>
      {/* Bezel plate behind the cutout */}
      <mesh geometry={plate} position={[BEZEL.x, BEZEL.y, plateZ]}>
        <meshStandardMaterial color={PALETTE.bezel} roughness={0.5} metalness={0.06} />
      </mesh>

      {/* Black surround immediately around the active area */}
      <mesh position={[SCREEN.x, SCREEN.y, plateZ + 0.26]}>
        <planeGeometry args={[SCREEN.width + 1.1, SCREEN.height + 1.1]} />
        <meshBasicMaterial color={PALETTE.bezelInner} />
      </mesh>

      {/* Live LCD. Unlit + toneMapped off so pixels keep their exact colour. */}
      <mesh position={[SCREEN.x, SCREEN.y, plateZ + 0.28]}>
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* Glass sheen over the screen. */}
      <mesh position={[SCREEN.x, SCREEN.y, plateZ + 0.33]}>
        <planeGeometry args={[SCREEN.width + 0.9, SCREEN.height + 0.9]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.05}
          roughness={0.05}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.02}
        />
      </mesh>
    </group>
  );
}

/**
 * Printed labels, drawn with the same pixel font as the screen so the
 * silkscreen matches the typography instead of pulling in a webfont.
 */
export function Labels() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawText(ctx, 'GAME BOY', 6, 10, '#f7e9ec', { scale: 5 });
      drawText(ctx, 'COLOR', 258, 12, '#ffd200', { scale: 5, tracking: 1 });
      drawText(ctx, 'NINTENDO', 8, 62, '#f0d7de', { scale: 3 });
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  const width = BODY.width * 0.66;
  return (
    <mesh position={[WORDMARK.x, WORDMARK.y, BODY.front + 0.015]}>
      <planeGeometry args={[width, width * (96 / 512)]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/**
 * Assembles the full console: shell, internals, LCD and all controls.
 */

import { useCallback, useState } from 'react';
import type * as THREE from 'three';

import { BODY, FACE_BUTTONS, PALETTE, PILL_BUTTONS } from './spec';
import type { GbcInput } from './input';
import { Internals, Labels, ScreenAssembly, Shell } from './parts/Shell';
import { Dpad } from './parts/Dpad';
import {
  IrPort,
  PillButton,
  PowerLed,
  PowerSwitch,
  RoundButton,
  Speaker,
  VolumeWheel,
} from './parts/Controls';

export interface ConsoleProps {
  input: GbcInput;
  texture: THREE.Texture;
  /** Powers the LED and sets the switch position. */
  on?: boolean;
}

export function Console({ input, texture, on = true }: ConsoleProps) {
  const [hoverCount, setHoverCount] = useState(0);

  // Each control reports hover; any > 0 means show the pointer cursor.
  const onHoverChange = useCallback((hovered: boolean) => {
    setHoverCount((count) => Math.max(0, count + (hovered ? 1 : -1)));
  }, []);

  const hovering = hoverCount > 0;
  if (typeof document !== 'undefined') {
    document.body.style.cursor = hovering ? 'pointer' : '';
  }

  // Controls seat inside their cutouts, with the caps just proud of the face.
  const faceZ = BODY.front - 0.35;

  return (
    <group>
      <Shell />
      <Internals />
      <ScreenAssembly texture={texture} />
      <Labels />

      <Dpad input={input} z={faceZ + 0.2} onHoverChange={onHoverChange} />

      <RoundButton
        input={input}
        button="b"
        x={FACE_BUTTONS.b.x}
        y={FACE_BUTTONS.b.y}
        z={faceZ}
        onHoverChange={onHoverChange}
      />
      <RoundButton
        input={input}
        button="a"
        x={FACE_BUTTONS.a.x}
        y={FACE_BUTTONS.a.y}
        z={faceZ}
        onHoverChange={onHoverChange}
      />

      <PillButton
        input={input}
        button="select"
        x={PILL_BUTTONS.select.x}
        y={PILL_BUTTONS.select.y}
        z={faceZ}
        onHoverChange={onHoverChange}
      />
      <PillButton
        input={input}
        button="start"
        x={PILL_BUTTONS.start.x}
        y={PILL_BUTTONS.start.y}
        z={faceZ}
        onHoverChange={onHoverChange}
      />

      <Speaker z={faceZ} />
      <PowerLed z={faceZ} on={on} />
      <PowerSwitch on={on} />
      <VolumeWheel />
      <IrPort />

      {/* Soft red bounce under the unit, selling the translucency. */}
      <pointLight
        position={[0, -BODY.height * 0.3, BODY.front + 6]}
        color={PALETTE.shellAttenuation}
        intensity={0.5}
        distance={28}
      />
    </group>
  );
}

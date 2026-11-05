import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Mesh } from "three";
import { alwaysOn } from "caav";
import { useAttachAttention, useAttentionSession, useAttentionView, useHeadTrackedViewer } from "caav/react";
import type { PresentationKind } from "caav/three";

const trigger = alwaysOn();

function AttentionScene({ presentation, overlay }: { presentation: PresentationKind; overlay: HTMLElement }) {
  const mesh = useRef<Mesh>(null);
  const session = useAttentionSession({ influenceRadius: 1.8 });
  const attached = useAttachAttention(session, mesh, { voxelSize: 0.08 });
  useHeadTrackedViewer(session, { id: "you", colour: "#3d8bff" });
  useAttentionView(session, attached, "you", { presentation, trigger, overlay });

  // Stands in for a person's head: orbit the object, looking at it slightly off centre.
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime * 0.4;
    camera.position.set(Math.sin(t) * 3.4, 1.6, Math.cos(t) * 3.4);
    camera.lookAt(Math.sin(t * 2.3) * 0.6, Math.sin(t * 1.7) * 0.5, Math.cos(t * 3.1) * 0.6);
  });

  return (
    <>
      <hemisphereLight args={[0xffffff, 0x8a8a8a, 1.8]} />
      <mesh ref={mesh}>
        <torusKnotGeometry args={[0.7, 0.24, 120, 16]} />
        <meshStandardMaterial color="#6c7078" roughness={0.9} />
      </mesh>
    </>
  );
}

function App() {
  const [presentation, setPresentation] = useState<PresentationKind>("world-embedded");
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const select = document.querySelector<HTMLSelectElement>("#presentation")!;
  select.onchange = () => setPresentation(select.value as PresentationKind);
  return (
    <div ref={setOverlay} style={{ position: "absolute", inset: 0 }}>
      {overlay && (
        <Canvas camera={{ position: [0, 1.6, 3.4], fov: 50 }} style={{ position: "absolute", inset: 0 }}>
          <AttentionScene presentation={presentation} overlay={overlay} />
        </Canvas>
      )}
    </div>
  );
}

createRoot(document.querySelector("#root")!).render(<App />);

export function AbstractBackground() {
  return (
    <div className="visual-field" aria-hidden="true">
      <div className="pointer-light" />
      <div className="ambient-field ambient-silver" />
      <div className="ambient-field ambient-lime" />
      <div className="wordmark-light" />

      <div className="metallic-arc">
        <span className="arc-highlight" />
        <span className="signal-point signal-point-one" />
        <span className="signal-point signal-point-two" />
      </div>

      <div className="glass-disc">
        <span className="glass-disc-inner" />
        <span className="surface-reflection disc-reflection" />
      </div>

      <div className="metal-slab">
        <span className="surface-reflection slab-reflection" />
      </div>

      <div className="metal-capsule">
        <span className="surface-reflection capsule-reflection" />
      </div>

      <div className="metal-ribbon">
        <span className="surface-reflection ribbon-reflection" />
      </div>

      <div className="reflection-line reflection-line-one" />
      <div className="reflection-line reflection-line-two" />
      <div className="lime-signal" />
      <div className="grain" />
    </div>
  );
}

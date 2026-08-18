import './Playhead.css';

interface PlayheadProps {
  frame: number;
  pxPerFrame: number;
}

export function Playhead({ frame, pxPerFrame }: PlayheadProps) {
  return (
    <div
      className="playhead"
      style={{ left: frame * pxPerFrame }}
    >
      <div className="playhead-head" />
      <div className="playhead-line" />
    </div>
  );
}

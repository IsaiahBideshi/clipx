import {useState, useEffect, useRef} from 'react'

export default function EditorTimeline({duration, currentTime, inPoint, outPoint, onSeek, onSetIn, onSetOut}) {
  if (!duration) return null;

  const MINIMUM_CLIP_LENGTH = 3; // seconds


  const timelineRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'in' | 'out' | null

  const inPct = (inPoint / duration) * 100;
  const outPct = (outPoint / duration) * 100;
  const playheadPct = (currentTime / duration) * 100;

  function handleClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    let pct = (e.clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));


    const clickedPct = pct * 100;

    const minPct = Math.min(inPct, outPct);
    const maxPct = Math.max(inPct, outPct);

    let clampedPct = clickedPct;
    if (clampedPct < minPct) clampedPct = minPct;
    if (clampedPct > maxPct) clampedPct = maxPct; // if more than outPct, becomes outPct

    onSeek((clampedPct / 100) * duration);
  }

  function startDrag(e, type) {
    e.stopPropagation(); // don’t trigger timeline seek
    setDragging(type);
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragging) return;

      const rect = timelineRef.current.getBoundingClientRect();
      let pct = (e.clientX - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));

      const time = pct * duration;

      if (dragging === "in") {
        const safe = Math.min(time, outPoint - MINIMUM_CLIP_LENGTH); // don’t cross OUT
        onSetIn(safe);
        onSeek(safe);
      }

      if (dragging === "out") {
        const safe = Math.max(time, inPoint + MINIMUM_CLIP_LENGTH); // don’t cross IN
        onSetOut(safe);
      }

      if (dragging === "playhead") {
        onSeek(time);
      }
    }

    function onUp() {
      setDragging(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, duration, inPoint, outPoint]);

  useEffect(() => {
    if (currentTime >= outPoint) {
      onSeek(inPoint);
    }
  }, [currentTime]);



  return (
    <div
      ref={timelineRef}
      onClick={handleClick}
      onMouseDown={(e) => startDrag(e, "playhead")}
      className="timeline"
      style={{
        position: "relative",
        height: "20px",
        background: "#333",
        marginTop: "10px"
      }}
    >
      {/* keep region */}
      {/*In Pointer*/}
      <div
        onMouseDown={(e) => startDrag(e, "in")}
        style={{
          position: "absolute",
          left: `${inPct}%`,
          top: "-5px",
          width: "5px",
          height: "30px",
          background: "black",
          opacity: 1,
          zIndex: 2,
          cursor: "ew-resize"
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `${inPct}%`,
          width: `${outPct - inPct}%`,
          height: "100%",
          background: "#4ade80"
        }}
      />

      {/* playhead */}
      <div
        style={{
          position: "absolute",
          left: `${playheadPct}%`,
          width: "2px",
          height: "100%",
          background: "red"
        }}
      />
      {/*Out Point*/}
      <div
        onMouseDown={(e) => startDrag(e, "out")}
        style={{
          position: "absolute",
          left: `${outPct}%`,
          top: "-5px",
          width: "5px",
          height: "30px",
          background: "black",
          opacity: 1,
          zIndex: 2,
          cursor: "ew-resize"
        }}
      />
    </div>
  );
}

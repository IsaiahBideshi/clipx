export default function VideoPreview({videoRef, clip, onLoadedMetadata,onClick, onTimeUpdate}) {
  const src = clip?.path
    ? `clipx://video?path=${encodeURIComponent(clip.path)}`
    : "";
  if (src === "") {
    console.error("VideoPreview: No clip path provided");
  }

  return (
    <video
      ref={videoRef}
      src={src}
      // controls
      onLoadedMetadata={onLoadedMetadata}
      onTimeUpdate={onTimeUpdate}
      onClick={onClick}
      style={{ width: "80%" }}
    />
  );
}

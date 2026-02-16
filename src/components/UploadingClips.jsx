import "./uploadingclips.css";

export default function UploadingClips({clips}) {


  return (
    <div className={"uploading-clips-container"}>
      <h2>Uploading Clips</h2>
      <div className={"uploading-clips-grid"}>
        {clips.map((clip) => (
          <div key={clip.id} className={"uploading-clip-card"}>
            <p>{clip.name}</p>
            <p>{Math.round(clip.progress * 100)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { UploadMenu } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

const clip = { id: 7, name: "Valorant 2026.09.26 - ace on Ascent.mp4", path: "C:/Clips/Valorant/ace.mp4", createdAt: "2026-09-26T21:14:00.000Z" };


export const SignedIn = () => (
  <Surface width={460}>
    <div className="upload-container" style={{ width: 360 }}>
      <UploadMenu clip={clip} start={4} end={22} session={{ user: { id: "preview-user" } }} onDelete={() => {}} uploading={false} setUploading={() => {}} saving={false} setSaving={() => {}} />
    </div>
  </Surface>
);

export const SignedOut = () => (
  <Surface width={460}>
    <div className="upload-container" style={{ width: 360 }}>
      <UploadMenu clip={clip} start={4} end={22} session={null} onDelete={() => {}} uploading={false} setUploading={() => {}} saving={false} setSaving={() => {}} />
    </div>
  </Surface>
);

export const Busy = () => (
  <Surface width={460}>
    <div className="upload-container" style={{ width: 360 }}>
      <UploadMenu clip={clip} start={4} end={22} session={{ user: { id: "preview-user" } }} onDelete={() => {}} uploading setUploading={() => {}} saving={false} setSaving={() => {}} />
    </div>
  </Surface>
);

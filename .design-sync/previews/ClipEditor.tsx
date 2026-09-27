import { ClipEditor } from "clipx";

const clip = { id: 7, name: "Valorant 2026.09.26 - ace on Ascent.mp4", path: "C:/Clips/Valorant/ace.mp4", createdAt: "2026-09-26T21:14:00.000Z" };

function Page({ children }) {
  return (
    <div style={{ width: 1400, height: 860, position: "relative", transform: "translateZ(0)", background: "var(--page-surface)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

export const SignedIn = () => (
  <Page>
    <ClipEditor
      clip={clip}
      onClose={() => {}}
      onDelete={() => {}}
      authSession={{ user: { id: "preview-user" } }}
      uploading={false}
      setUploading={() => {}}
      saving={false}
      setSaving={() => {}}
    />
  </Page>
);

export const SignedOut = () => (
  <Page>
    <ClipEditor
      clip={clip}
      onClose={() => {}}
      onDelete={() => {}}
      authSession={null}
      uploading={false}
      setUploading={() => {}}
      saving={false}
      setSaving={() => {}}
    />
  </Page>
);

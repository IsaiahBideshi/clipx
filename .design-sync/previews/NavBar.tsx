import { NavBar } from "clipx";

function Frame({ children }) {
  return <div style={{ width: 640, fontFamily: "var(--app-font)" }}>{children}</div>;
}

export const UpdateAvailable = () => <Frame><NavBar updateStatus="available" onUpdateClick={() => {}} /></Frame>;
export const Downloading = () => <Frame><NavBar updateStatus="downloading" onUpdateClick={() => {}} /></Frame>;
export const UpdateReady = () => <Frame><NavBar updateStatus="downloaded" onUpdateClick={() => {}} /></Frame>;
export const UpdateFailed = () => <Frame><NavBar updateStatus="error" updateErrorMessage="Could not reach the update server" onUpdateClick={() => {}} /></Frame>;
export const NoUpdate = () => <Frame><NavBar showUpdateButton={false} /></Frame>;

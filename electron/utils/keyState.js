import koffi from "koffi";

let GetAsyncKeyState = null;

export function isKeyDown(virtualKey) {
  GetAsyncKeyState ??= koffi.load("user32.dll").func("int16 GetAsyncKeyState(int key)");
  return GetAsyncKeyState(virtualKey) < 0;
}

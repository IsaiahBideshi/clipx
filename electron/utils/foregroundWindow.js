import koffi from "koffi";

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const TH32CS_SNAPPROCESS = 0x2;
let api = null;

function getApi() {
  if (api) {
    return api;
  }

  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const RECT = koffi.struct("RECT", { left: "long", top: "long", right: "long", bottom: "long" });
  const PROCESSENTRY32W = koffi.struct("PROCESSENTRY32W", {
    dwSize: "uint32",
    cntUsage: "uint32",
    th32ProcessID: "uint32",
    th32DefaultHeapID: "uintptr_t",
    th32ModuleID: "uint32",
    cntThreads: "uint32",
    th32ParentProcessID: "uint32",
    pcPriClassBase: "int32",
    dwFlags: "uint32",
    szExeFile: koffi.array("char16", 260, "String"),
  });
  api = {
    processEntrySize: koffi.sizeof(PROCESSENTRY32W),
    CreateToolhelp32Snapshot: kernel32.func("void *CreateToolhelp32Snapshot(uint32 flags, uint32 pid)"),
    Process32FirstW: kernel32.func("bool Process32FirstW(void *snapshot, _Inout_ PROCESSENTRY32W *entry)"),
    Process32NextW: kernel32.func("bool Process32NextW(void *snapshot, _Inout_ PROCESSENTRY32W *entry)"),
    GetForegroundWindow: user32.func("void *GetForegroundWindow()"),
    GetWindowThreadProcessId: user32.func("uint32 GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)"),
    GetWindowRect: user32.func("bool GetWindowRect(void *hwnd, _Out_ RECT *rect)"),
    GetWindowTextW: user32.func("int GetWindowTextW(void *hwnd, _Out_ uint16 *text, int maxLength)"),
    OpenProcess: kernel32.func("void *OpenProcess(uint32 access, bool inherit, uint32 pid)"),
    QueryFullProcessImageNameW: kernel32.func("bool QueryFullProcessImageNameW(void *process, uint32 flags, _Out_ uint16 *name, _Inout_ uint32 *size)"),
    CloseHandle: kernel32.func("bool CloseHandle(void *handle)"),
  };
  return api;
}

function readUtf16(buffer, length) {
  return String.fromCharCode(...buffer.subarray(0, Math.max(0, length)));
}

export function listProcesses() {
  const { processEntrySize, CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, CloseHandle } = getApi();
  const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (!snapshot || koffi.address(snapshot) === 0xffffffffffffffffn) {
    return [];
  }

  try {
    const processes = [];
    const entry = { dwSize: processEntrySize };
    for (let found = Process32FirstW(snapshot, entry); found; found = Process32NextW(snapshot, entry)) {
      processes.push({ pid: entry.th32ProcessID, exeName: entry.szExeFile });
    }
    return processes;
  } finally {
    CloseHandle(snapshot);
  }
}

function getProcessExeName(pid) {
  return listProcesses().find((process) => process.pid === pid)?.exeName || null;
}

function getProcessPath(pid) {
  const { OpenProcess, QueryFullProcessImageNameW, CloseHandle } = getApi();
  const processHandle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!processHandle) {
    return getProcessExeName(pid);
  }

  try {
    const name = new Uint16Array(1024);
    const size = [name.length];
    return QueryFullProcessImageNameW(processHandle, 0, name, size) ? readUtf16(name, size[0]) : null;
  } finally {
    CloseHandle(processHandle);
  }
}

export function getForegroundWindow() {
  const { GetForegroundWindow, GetWindowThreadProcessId, GetWindowRect, GetWindowTextW } = getApi();
  const hwnd = GetForegroundWindow();
  if (!hwnd) {
    return null;
  }

  const pid = [0];
  GetWindowThreadProcessId(hwnd, pid);
  const rect = {};
  GetWindowRect(hwnd, rect);
  const title = new Uint16Array(512);
  const titleLength = GetWindowTextW(hwnd, title, title.length);

  return {
    pid: pid[0],
    exePath: getProcessPath(pid[0]),
    title: readUtf16(title, titleLength),
    rect: { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top },
  };
}

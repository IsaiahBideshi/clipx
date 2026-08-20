import { createTheme } from "@mui/material/styles";

const ACCENT = "#90caf9";
const ACCENT_RGB = "144, 202, 249";

const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: ACCENT },
    background: { default: "#0f1015", paper: "#1a1d27" },
    text: { primary: "#f7f8ff", secondary: "rgba(255, 255, 255, 0.62)" },
    divider: "rgba(255, 255, 255, 0.12)",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Sora", "Segoe UI", "Trebuchet MS", sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 999,
        },
        sizeSmall: { padding: "6px 14px", fontSize: "0.8rem" },
        sizeMedium: { padding: "8px 18px", fontSize: "0.9rem" },
        contained: {
          color: "#eef7ff",
          background: "rgba(25, 118, 210, 0.28)",
          border: `1px solid rgba(${ACCENT_RGB}, 0.5)`,
          boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
          "&:hover": {
            background: "rgba(25, 118, 210, 0.4)",
            borderColor: `rgba(${ACCENT_RGB}, 0.72)`,
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
          },
        },
        containedError: {
          color: "#ffd7d7",
          background: "rgba(255, 76, 76, 0.22)",
          border: "1px solid rgba(255, 125, 125, 0.65)",
          boxShadow: "none",
          "&:hover": {
            background: "rgba(255, 76, 76, 0.34)",
            borderColor: "rgba(255, 130, 130, 0.85)",
          },
        },
        outlined: {
          color: "#cfe6ff",
          background: "transparent",
          border: `1px solid rgba(${ACCENT_RGB}, 0.5)`,
          "&:hover": {
            background: `rgba(${ACCENT_RGB}, 0.14)`,
            borderColor: `rgba(${ACCENT_RGB}, 0.72)`,
          },
        },
        text: {
          color: "rgba(255, 255, 255, 0.85)",
          "&:hover": { background: "rgba(255, 255, 255, 0.08)" },
        },
        disabled: {
          color: "rgba(255, 255, 255, 0.4)",
          borderColor: "rgba(255, 255, 255, 0.14)",
          background: "rgba(255, 255, 255, 0.06)",
          boxShadow: "none",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: "rgba(255, 255, 255, 0.85)",
          "&:hover": { background: "rgba(255, 255, 255, 0.08)" },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#e5e7eb",
          "&.Mui-focused": { color: ACCENT },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: { color: "#ffffff" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.35)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.6)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: ACCENT,
          },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: "#1a1d27",
          backgroundImage: "none",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          borderRadius: 12,
          boxShadow: "0 18px 42px rgba(0, 0, 0, 0.42)",
          marginTop: 6,
        },
        listbox: { padding: 6 },
        option: {
          color: "#f0f3ff",
          padding: "8px 12px",
          borderRadius: 8,
          margin: "2px 6px",
          "&:hover": { backgroundColor: "rgba(144, 202, 249, 0.12)" },
          "&.Mui-focused": { backgroundColor: "rgba(144, 202, 249, 0.14)" },
          "&[aria-selected='true']": { backgroundColor: "rgba(144, 202, 249, 0.1)" },
        },
        popupIndicator: { color: "rgba(255, 255, 255, 0.6)" },
        clearIndicator: { color: "rgba(255, 255, 255, 0.6)" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          color: "#ffffff",
        },
        label: { color: "#ffffff" },
        deleteIcon: {
          color: "rgba(255, 255, 255, 0.6)",
          "&:hover": { color: "#ffffff" },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: "#1a1d27",
          backgroundImage: "none",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          color: "#f0f3ff",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: 12, marginTop: 6 },
        list: { padding: 6 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: "2px 6px",
          "&.Mui-selected": { backgroundColor: "rgba(144, 202, 249, 0.12)" },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1e1f22",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          color: "#ffffff",
          borderRadius: 8,
          fontSize: "0.78rem",
          padding: "6px 10px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
        },
        arrow: { color: "#1e1f22" },
      },
    },
  },
});

export default appTheme;
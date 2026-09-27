import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import appTheme from "../src/lib/theme.js";

export default function ClipXProvider({ children }) {
  return (
    <ThemeProvider theme={appTheme}>
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </ThemeProvider>
  );
}

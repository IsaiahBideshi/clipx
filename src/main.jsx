import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "@mui/material/styles";
import './index.css'
import App from './App.jsx'
import appTheme from "./lib/theme.js";
import { QUERY_CACHE_MAX_AGE_MS, queryClient, queryPersister } from "./lib/queryClient.js";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={appTheme}>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: QUERY_CACHE_MAX_AGE_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const [scope, resource, , , cursor] = query.queryKey;
            if (scope === "localFiles" && resource === "clips" && cursor !== null) {
              return false;
            }

            return query.state.status === "success";
          },
        },
      }}
    >
      <HashRouter>
        <App/>
      </HashRouter>
    </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)

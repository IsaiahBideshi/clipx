import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from "react-router-dom";
import './index.css'
import App from './App.jsx'
import NavBar from "./components/NavBar.jsx";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <NavBar/>
      <App/>
    </HashRouter>
  </StrictMode>,
)

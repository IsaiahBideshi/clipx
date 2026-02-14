import "./auth.css";
import { useState } from "react";
import GoogleIcon from "@mui/icons-material/Google";
import { TextField, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { loginWithEmail } from "../lib/auth";

function getAuthMessage(error) {
  if (!error?.code) return "Something went wrong. Please try again.";

  const messages = {
    "auth/invalid-email": "Invalid email address.",
    "auth/user-not-found": "No account exists for this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/popup-closed-by-user": "Google sign-in was canceled.",
  };

  return messages[error.code] || "Authentication failed. Please try again.";
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleEmailLogin(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      await loginWithEmail(email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(getAuthMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <h2>Log In</h2>
      <form className="login-form" onSubmit={handleEmailLogin}>
        <TextField
          placeholder="Email"
          type="email"
          className="tf-sx"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          placeholder="Password"
          type="password"
          className="tf-sx"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginTop: "20px" }}>
          <Button fullWidth variant="contained" type="submit" disabled={loading}>
            {loading ? "Logging In..." : "Log In"}
          </Button>
          <Button fullWidth variant="outlined" onClick={() => navigate("/signup")} disabled={loading}>
            Sign Up
          </Button>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </form>
    </div>
  );
}

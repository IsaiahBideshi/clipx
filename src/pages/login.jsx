import "./auth.css";
import { useState } from "react";
import { TextField, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { loginWithEmail } from "../lib/supabase";

function getAuthMessage(error) {
  if (error?.message) return error.message;

  const messages = {
    invalid_credentials: "Invalid email or password.",
    email_not_confirmed: "Please confirm your email before logging in.",
    over_request_rate_limit: "Too many attempts. Try again later.",
  };

  return messages[error?.code] || "Authentication failed. Please try again.";
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
      const user = await loginWithEmail(email.trim(), password);
      console.log("User logged in:", user);
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

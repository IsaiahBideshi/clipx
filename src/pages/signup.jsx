import "./auth.css";
import { useState } from "react";
import { Button, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { signUpWithEmail } from "../lib/supabase";

function getAuthMessage(error) {
  if (error?.message) return error.message;

  const messages = {
    user_already_exists: "This email is already registered.",
    weak_password: "Password should be at least 6 characters.",
    over_request_rate_limit: "Too many attempts. Try again later.",
  };

  return messages[error?.code] || "Sign up failed. Please try again.";
}

export default function Signup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignup(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      await signUpWithEmail(username, email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(getAuthMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <h2>Sign Up</h2>
      <form className="login-form" onSubmit={handleSignup}>
        <TextField
          placeholder="Username"
          type="text"
          className="tf-sx"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
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
            {loading ? "Signing Up..." : "Sign Up"}
          </Button>
          <Button fullWidth variant="outlined" onClick={() => navigate("/login")} disabled={loading}>
            Log In
          </Button>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </form>
    </div>
  );
}

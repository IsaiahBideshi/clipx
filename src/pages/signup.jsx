import "./auth.css";
import { useState } from "react";
import GoogleIcon from "@mui/icons-material/Google";
import { Button, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { signupWithEmail } from "../lib/auth";

function getAuthMessage(error) {
  if (!error?.code) return "Something went wrong. Please try again.";

  const messages = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Invalid email address.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/popup-closed-by-user": "Google sign-in was canceled.",
  };

  return messages[error.code] || "Sign up failed. Please try again.";
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
      await signupWithEmail(email.trim(), password, username);
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

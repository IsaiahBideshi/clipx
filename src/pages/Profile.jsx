import "./profile.css";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {useState, useEffect} from "react";
import {useNavigate} from "react-router-dom";

import {auth, logout, updateDisplayName} from '../lib/supabase.js';
import SearchIcon from '@mui/icons-material/Search';
import CircularProgress from '@mui/material/CircularProgress';
import {FormControl, FormHelperText, Input, InputLabel} from "@mui/material";

function addFriend(name) {
  if (!name) return;
  console.log(name);
}

export default function Profile() {
  const [friendName, setFriendName] = useState("");
  const [user, setUser] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [session, setSession] = useState(null);
  const tfSx = {
    "& .MuiInputLabel-root": { color: "#e5e7eb" }, // label
    "& .MuiInputBase-input": { color: "#ffffff" }, // typed text
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.35)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.6)" },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#90caf9" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#90caf9" },
    marginBottom: '10px',
    textColor: 'white',
    width: "90%",
  }
  const navigate = useNavigate();

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data, error } = await auth.getSession();

        if (error) {
          console.error("Error getting session:", error);
        } else {
          setSession(data.session);
          setLoadingAuth(false);
        }
      } catch (err) {
        console.error("Unexpected error getting session:", err);
      }
    };

    getSession();
  }, [auth]);

  if (loadingAuth) {
    return (
      <div className={"settings-container"}>
        <h2>Profile</h2>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={"settings-container"}>
        <h2>Profile</h2>
        <p>Please log in or sign up to view your profile.</p>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "20px" }}>
          <Button variant="contained" onClick={() => navigate("/login")}>
            Log In
          </Button>
          <Button variant="outlined" onClick={() => navigate("/signup")}>
            Sign Up
          </Button>
        </div>
      </div>
    );
  }


    return (
      <div className={"settings-container"}>
        <h2>Profile</h2>
        <h4>Friends</h4>
        <div className={"friends"}>
          <div className={"add-friend"}>
            <TextField
              sx={tfSx}
              placeholder={"Add a friend"}
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFriend(friendName);
                }
              }}
            />
            <div><SearchIcon sx={{'&:hover': {cursor: 'pointer'}}} fontSize={"large"} onClick={() => {addFriend(friendName); setLoadingUsers(true)}}/></div>
          </div>

          <div className={"friends-list"}>
            Friends list:
          </div>

          <div className={"requests"}>
            Incoming requests:
          </div>

          <div className={"requests"}>
            Outgoing requests:
          </div>
          <Button sx={{marginTop: "20px"}} onClick={async () => {await logout();navigate("/")}} variant={"contained"} >Log Out</Button>
        </div>
      </div>
    );
}
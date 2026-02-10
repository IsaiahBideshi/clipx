import "./profile.css";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {useState, useEffect} from "react";

import SearchIcon from '@mui/icons-material/Search';
import {FormControl, FormHelperText, Input, InputLabel} from "@mui/material";

function addFriend(name) {
  if (!name) return;
  console.log(name);

}

export default function Profile() {
  const [friendName, setFriendName] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
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
        </div>
      </div>
    );
}

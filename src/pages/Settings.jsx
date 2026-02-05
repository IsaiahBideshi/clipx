import { useState, useEffect } from "react";
import DeleteIcon from '@mui/icons-material/Delete';
import TextField from "@mui/material/TextField";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';

const tfSx = {
  "& .MuiInputLabel-root": { color: "#e5e7eb" }, // label
  "& .MuiInputBase-input": { color: "#ffffff" }, // typed text
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.35)" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.6)" },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#90caf9" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#90caf9" },
  marginBottom: '10px',
  textColor: 'white',
  marginTop: '10px',
};


export function getFriends() {
  return ['Aidan', 'Bideshi', 'Bradley', 'Cing', 'fella_guy'];
}

export default function Settings() {
  const [friends, setFriends] = useState(getFriends());
  const [friend, setFriend] = useState("");
  const [aliasCount, setAliasCount] = useState(1);
  console.log(friend);

  return (
    <>
      <div className={"settings-container"}>
        <h2>Settings</h2>
        <div className={"friends"}>
          Your Friends: <br/>
          <form action="" onSubmit={() => {setFriends([...friends, friend]); setFriend("")}}>
            {Array.from({ length: aliasCount }, (_, index) => (
              <TextField
                key={index}
                label={`Friend Alias ${index + 1}`}
                variant="outlined"
                value={friend}
                onChange={(e) => setFriend(e.target.value)}
                sx={tfSx}
              />
            ))}

            <div className={""} >
              <AddCircleIcon onClick={() => setAliasCount(aliasCount + 1)}
                                style={{cursor: 'pointer', verticalAlign: 'middle', marginLeft: '10px'}}/>
              <RemoveCircleIcon onClick={() => {
                if (aliasCount > 1) setAliasCount(aliasCount - 1)
              }} style={{cursor: 'pointer', verticalAlign: 'middle', marginLeft: '10px'}}/>
            </div>
            <br/>
            <button type="submit" style={{marginTop: '10px'}}>Add Friend</button>
          </form>


          <div className={"friends-list"}>
            {friends.map((friend, index) => (
            <div key={index} className={"friend-item"}>
              {friend} <DeleteIcon onClick={() => {
                const newFriends = friends.filter((_, i) => i !== index);
                setFriends(newFriends);
            }} />
            </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

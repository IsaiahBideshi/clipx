import "./profile.css";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {useState, useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";

import {auth, logout, supabase} from '../lib/supabase.js';
import SearchIcon from '@mui/icons-material/Search';
import CircularProgress from '@mui/material/CircularProgress';


export default function Profile() {
  const [friendName, setFriendName] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [session, setSession] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [confirmingAction, setConfirmingAction] = useState(false);

  const displayResults = useRef(null);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [profileHandle, setProfileHandle] = useState("");
  const [loadingFriendships, setLoadingFriendships] = useState(true);



  const [friendships, setFriendships] = useState();

  const tfSx = {
    "& .MuiInputLabel-root": { color: "#e5e7eb" }, // label
    "& .MuiInputBase-input": { color: "#ffffff" }, // typed text
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.35)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.6)" },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#90caf9" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#90caf9" },
    marginBottom: '10px',
    textColor: 'white',
    width: "100%",
  }
  const navigate = useNavigate();

  async function searchFriends(name) {
    if (!name) return;
    console.log("Searching for: ", name);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .ilike("username", `%${name}%`);

    console.log(data);

    if (error) {
      console.error("Error searching for friends:", error);
      setLoadingUsers(false);
    } else {
      const id = (await auth.getUser()).data.user.id;
      let filteredResults = data.filter(user => user.id !== id);
      
      setSearchResults(filteredResults);
      setShowResults(true);
      setLoadingUsers(false);
    }
  }

  async function getFriendships() {
    const userId = (await auth.getUser()).data.user.id;
    const { data, error } = await supabase
      .from("friendships")
      .select("*")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    if (error) {
      console.error("Error fetching friendship:", error);
      setFriendships([]);
      return "error";
    }
    let friendshipsData = [];
    for (let f of data) {
      const friendId = f.user_id === userId ? f.friend_id : f.user_id;
      const { data: friendData, error: friendError } = await supabase
        .from("users")
        .select("username")
        .eq("id", friendId)
        .single();
      friendshipsData.push({ ...f, friendName: friendData ? friendData.username : "Unknown User" });
    }
    setFriendships(friendshipsData);
    setLoadingFriendships(false);
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (displayResults.current && !displayResults.current.contains(event.target)) {
        setShowResults(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {document.removeEventListener("mousedown", handleClickOutside)};
  }, []);


  useEffect(() => {
    const channel = supabase
      .channel("friendships")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        (payload) => {
          getFriendships(); // refetch on any change
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel); // cleanup
  }, [getFriendships]);


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

    const getUsername = async () => {
      const userId = (await auth.getUser()).data.user.id;
      const { data, error } = await supabase
        .from("users")
        .select("username")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching username:", error);
        setProfileHandle("User");
      } else {
        setProfileHandle(data.username);
      }
      setLoadingAuth(false);
    };

    getSession();
    getFriendships();
    getUsername();
  }, [auth]);

  if (loadingAuth) {
    return (
      <div className={"settings-container profile-page profile-state"}>
        <h2>Profile</h2>
        <div className="state-loader">
          <CircularProgress />
        </div>
      </div>
    );
  }

  if (!profileHandle && loadingAuth) {
    return (
          <div className={"settings-container profile-page profile-state"}>
            <h2>Profile</h2>
            <div className="state-loader">
              <CircularProgress />
            </div>
          </div>
        );
  }

  if (!session) {
    return (
      <div className={"settings-container profile-page profile-state"}>
        <h2>Profile</h2>
        <p className="auth-copy">Please log in or sign up to view your profile.</p>
        <div className="auth-actions">
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

  const acceptedFriends = friendships?.filter((f) => f.status === "accepted") ?? [];
  const incomingRequests = friendships?.filter((f) => f.status === "pending" && f.friend_id === session.user.id) ?? [];
  const outgoingRequests = friendships?.filter((f) => f.status === "pending" && f.user_id === session.user.id) ?? [];



  async function handleSendRequest(friendId) {
    const userId = session.user.id;
    console.log("Sending friend request from", userId, "to", friendId);
    const { data, error } = await supabase
    .from("friendships")
    .insert({
      user_id: userId,
      friend_id: friendId,
      status: "pending"
    });

    if (error) {
      console.error("Error sending friend request:", error);
    } else {
      console.log("Friend request sent:", data);
      getFriendships();
    }
  }

  function handleOpenRemoveConfirm(friendshipId, friendDisplayName) {
    setRemoveTarget({
      id: friendshipId,
      name: friendDisplayName || "this friend",
      type: "remove-friend"
    });
  }

  function handleOpenCancelOutgoingConfirm(friendshipId, friendDisplayName) {
    setRemoveTarget({
      id: friendshipId,
      name: friendDisplayName || "this friend",
      type: "cancel-outgoing"
    });
  }

  async function handleConfirmAction() {
    if (!removeTarget?.id || !removeTarget?.type) {
      return;
    }

    setConfirmingAction(true);
    let response;

    if (removeTarget.type === "remove-friend") {
      response = await supabase
        .from("friendships")
        .delete()
        .or(`and(user_id.eq.${session.user.id},friend_id.eq.${removeTarget.id}),and(user_id.eq.${removeTarget.id},friend_id.eq.${session.user.id})`);
    } else {
      response = await supabase
        .from("friendships")
        .delete()
        .eq("user_id", session.user.id)
        .eq("friend_id", removeTarget.id)
        .eq("status", "pending");
    }
    
    console.log("Confirm response:", response);
    setConfirmingAction(false);
    if (response.error) {
      console.error("Error handling friendship action:", response.error);
      return;
    }

    setRemoveTarget(null);
    getFriendships();
  }

  return (
    <div className={"settings-container profile-page"}>
      <div className="profile-hero">
        <div>
          <p className="eyebrow">Your account</p>
          <h2>Welcome back, {profileHandle}</h2>
          <p className="hero-copy">Manage your connections and keep your clip sharing circle active.</p>
        </div>
        <Button onClick={async () => {await logout();navigate("/")}} variant={"contained"}>
          Log Out
        </Button>
      </div>

      <div className={"profile-grid"}>
        <section className="profile-card friend-search-card">
          <h4>Add Friends</h4>
          <p className="card-copy">Search by username and send requests instantly.</p>
          <div className="friend-search-shell" ref={displayResults}>
            <div className={"add-friend"}>
              <TextField
                sx={tfSx}
                placeholder={"Add a friend"}
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setLoadingUsers(true);
                    searchFriends(friendName);
                  }
                }}
              />
              <div><SearchIcon sx={{'&:hover': {cursor: 'pointer'}}} fontSize={"large"} onClick={() => {setLoadingUsers(true);searchFriends(friendName)}}/></div>
            </div>
            <div className="display-results">
              {showResults && ( (loadingUsers) ? (
                <div className="result search-loading result-row">
                  <CircularProgress />
                </div>
              ) : (
                <div>
                  {searchResults.length > 0 ? (
                    searchResults.map((result) => {
                      const isAccepted = friendships?.some(
                        ({ user_id, friend_id, status }) =>
                          (user_id === result.id || friend_id === result.id) && status === "accepted"
                      );
                      const isPending = friendships?.some(
                        ({ user_id, friend_id, status }) =>
                          (user_id === result.id || friend_id === result.id) && status === "pending"
                      );

                      return (
                        <div className="result result-row" key={result.id}>
                          <p>{result.username}</p>
                          {isAccepted ? (
                            <button className="add-friend-btn add-friend-btn--friends" disabled>
                              Friends
                            </button>
                          ) : isPending ? (
                            <button className="add-friend-btn add-friend-btn--sent" disabled>
                              Sent!
                            </button>
                          ) : (
                            <button className="add-friend-btn add-friend-btn--add" onClick={() => handleSendRequest(result.id)}>
                              Add Friend
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="result-row empty-inline">No users found.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={"profile-card"}>
          <h4>Friends List</h4>
          <p className="card-copy">People currently connected to your account.</p>
          <div className="stacked-list">
            {loadingFriendships ? (
              <div className="result search-loading result-row">
                <CircularProgress />
              </div>
            ) : (
            acceptedFriends.length ? acceptedFriends.map((f) => {
              return (
                <div className="friend friend-row" key={f.user_id === session.user.id ? f.friend_id : f.user_id}>
                  <p>{f.friendName ? f.friendName : "Unknown User"}</p>
                  <button
                    className="add-friend-btn add-friend-btn--remove"
                    aria-label={`Remove ${f.friendName ? f.friendName : "friend"}`}
                    onClick={() => handleOpenRemoveConfirm(
                      f.user_id === session.user.id ? f.friend_id : f.user_id,
                      f.friendName
                    )}
                    title="Remove friend"
                  >
                    X
                  </button>
                </div>
              );
            }) : <p className="empty-state">No friends yet. Try sending your first request.</p>)}
          </div>
        </section>

        <section className={"profile-card"}>
          <h4>Incoming Requests</h4>
          <p className="card-copy">Approve requests from people who want to connect.</p>
          <div className="stacked-list">
            {loadingFriendships ? (
              <div className="result search-loading result-row">
                <CircularProgress />
              </div>
            ) : (
            incomingRequests.length ? incomingRequests.map((f) => {
              return (
                <div className="friend friend-row" key={f.user_id === session.user.id ? f.friend_id : f.user_id}>
                  <p>{f.friendName ? f.friendName : "Unknown User"}</p>
                  <div>
                    <button className="add-friend-btn add-friend-btn--accept" onClick={async () => {
                        await supabase
                          .from("friendships")
                          .update({ status: "accepted" })
                          .eq("friend_id", session.user.id)
                          .eq("user_id", f.user_id);
                      }}>
                      Accept
                    </button>
                  </div>
                </div>
              );
            }) : <p className="empty-state">No incoming requests right now.</p>)}
          </div>
        </section>

        <section className={"profile-card"}>
          <h4>Outgoing Requests</h4>
          <p className="card-copy">Pending invites you have already sent.</p>
          <div className="stacked-list">
            {loadingFriendships ? (
              <div className="result search-loading result-row">
                <CircularProgress />
              </div>
            ) : (
            outgoingRequests.length ? outgoingRequests.map((f) => {
              return (
                <div className="friend friend-row" key={f.user_id === session.user.id ? f.friend_id : f.user_id}>
                  <p>{f.friendName ? f.friendName : "Unknown User"}</p>
                  <div>
                    <button
                      className="add-friend-btn add-friend-btn--cancel-request"
                      onClick={() => handleOpenCancelOutgoingConfirm(
                        f.user_id === session.user.id ? f.friend_id : f.user_id,
                        f.friendName
                      )}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }) : <p className="empty-state">No pending requests sent.</p>
            )}
          </div>
        </section>
      </div>

      {removeTarget && (
        <div className="confirm-overlay" onClick={() => !confirmingAction && setRemoveTarget(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-eyebrow">
              {removeTarget.type === "cancel-outgoing" ? "Cancel Request" : "Remove Friend"}
            </p>
            <h3>
              {removeTarget.type === "cancel-outgoing"
                ? `Cancel request to ${removeTarget.name}?`
                : `Unadd ${removeTarget.name}?`}
            </h3>
            <p>
              {removeTarget.type === "cancel-outgoing"
                ? "This pending request will be deleted. You can send a new request any time."
                : "This will remove them from your friends list. You can always send another request later."}
            </p>
            <div className="confirm-actions">
              <button
                className="add-friend-btn confirm-cancel"
                onClick={() => setRemoveTarget(null)}
                disabled={confirmingAction}
              >
                Cancel
              </button>
              <button
                className="add-friend-btn confirm-remove"
                onClick={handleConfirmAction}
                disabled={confirmingAction}
              >
                {confirmingAction
                  ? "Working..."
                  : removeTarget.type === "cancel-outgoing"
                    ? "Cancel Request"
                    : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
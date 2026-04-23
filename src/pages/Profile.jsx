import "./profile.css";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {useState, useEffect, useRef, useCallback} from "react";
import {useNavigate} from "react-router-dom";

import {auth, logout, supabase} from '../lib/supabase.js';
import SearchIcon from '@mui/icons-material/Search';
import CircularProgress from '@mui/material/CircularProgress';

const baseUrl = (import.meta.env.VITE_DATABASE_URL || "").replace(/\/$/, "");


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
  const [sendingFriendIds, setSendingFriendIds] = useState(new Set());
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

  const getFriendships = useCallback(async () => {
    const userId = (await auth.getUser()).data.user.id;
    let data = null;
    let error = null;

    try {
      const response = await fetch(`${baseUrl}/api/friendships?userId=${userId}`);
      const payload = await response.json();
      data = payload?.data ?? null;
      error = payload?.error ?? null;

      if (!response.ok) {
        error = error || `Request failed with status ${response.status}`;
      }
    } catch (networkError) {
      console.error("Network error fetching friendships:", networkError);
      setFriendships([]);
      setLoadingFriendships(false);
      return "error";
    }

    if (error) {
      console.error("Error fetching friendship:", error);
      setFriendships([]);
      setLoadingFriendships(false);
      return "error";
    }

    const friendIds = [...new Set((data || []).map((f) => (f.user_id === userId ? f.friend_id : f.user_id)).filter(Boolean))];
    let usernameById = new Map();

    if (friendIds.length > 0) {
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("id, username")
        .in("id", friendIds);

      if (usersError) {
        console.error("Error fetching friend usernames:", usersError);
      } else {
        usernameById = new Map((usersData || []).map((user) => [user.id, user.username]));
      }
    }

    const friendshipsData = (data || []).map((f) => {
      const friendId = f.user_id === userId ? f.friend_id : f.user_id;
      return {
        ...f,
        friendName: usernameById.get(friendId) || "Unknown User",
      };
    });

    setFriendships(friendshipsData);
    setLoadingFriendships(false);
  }, []);

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
  }, [getFriendships]);

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
    if (sendingFriendIds.has(friendId)) {
      return;
    }

    const userId = session.user.id;
    const friendName = searchResults.find((entry) => entry.id === friendId)?.username || "Unknown User";
    const optimisticId = `optimistic-${userId}-${friendId}`;
    const previousFriendships = friendships || [];

    setSendingFriendIds((prev) => {
      const next = new Set(prev);
      next.add(friendId);
      return next;
    });

    setFriendships((prev) => {
      const current = prev || [];
      const alreadyExists = current.some(
        (item) =>
          ((item.user_id === userId && item.friend_id === friendId) ||
            (item.user_id === friendId && item.friend_id === userId)) &&
          (item.status === "pending" || item.status === "accepted")
      );

      if (alreadyExists) {
        return current;
      }

      return [
        ...current,
        {
          id: optimisticId,
          user_id: userId,
          friend_id: friendId,
          status: "pending",
          friendName,
        },
      ];
    });

    console.log("Sending friend request from", userId, "to", friendId);
    const response = await fetch(`${baseUrl}/api/friendships`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ user_id: userId, friend_id: friendId })
    });
    const { data, error } = await response.json();

    if (!response.ok || error) {
      console.error("Error sending friend request:", error || response.statusText);
      setFriendships(previousFriendships);
    } else {
      console.log("Friend request sent:", data);
      getFriendships();
    }

    setSendingFriendIds((prev) => {
      const next = new Set(prev);
      next.delete(friendId);
      return next;
    });
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

    const actionTarget = removeTarget;
    setRemoveTarget(null);
    setConfirmingAction(true);
    let response;
    let payload;

    if (actionTarget.type === "remove-friend") {
      response = await fetch(`${baseUrl}/api/friendships`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "remove-friend",
          user_id: session.user.id,
          friend_id: actionTarget.id
        })
      });
    } else {
      response = await fetch(`${baseUrl}/api/friendships`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "cancel-request",
          user_id: session.user.id,
          friend_id: actionTarget.id
        })
      });
    }

    payload = await response.json();

    console.log("Confirm response:", payload);
    if (!response.ok || payload?.error) {
      console.error("Error handling friendship action:", payload?.error || response.statusText);
      return;
    }
    getFriendships();
    setConfirmingAction(false);
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
                      const isSending = sendingFriendIds.has(result.id);
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
                          ) : isSending ? (
                            <button className="add-friend-btn add-friend-btn--sent" disabled>
                              Sending...
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
                        setFriendships((prev) =>
                          (prev || []).map((item) =>
                            item.user_id === f.user_id && item.friend_id === session.user.id
                              ? { ...item, status: "accepted" }
                              : item
                          )
                        );

                        const response = await fetch(`${baseUrl}/api/friendships`, {
                          method: "PUT",
                          headers: {
                            "Content-Type": "application/json"
                          },
                          body: JSON.stringify({
                            friend_id: f.user_id,
                            user_id: session.user.id,
                          })
                        });
                        const payload = await response.json();
                        if (!response.ok || payload?.error) {
                          console.error("Error accepting request:", payload?.error || response.statusText);
                          getFriendships();
                          return;
                        }
                      }}>
                      Accept
                    </button>
                    <button className="add-friend-btn add-friend-btn--decline" onClick={async () => {
                        setFriendships((prev) =>
                          (prev || []).filter(
                            (item) => !(item.user_id === f.user_id && item.friend_id === session.user.id && item.status === "pending")
                          )
                        );

                        const response = await fetch(`${baseUrl}/api/friendships`, {
                            method: "DELETE",
                            headers: {
                              "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                              type: "decline-request",
                              friend_id: f.user_id,
                              user_id: session.user.id,
                            })
                        });
                        const payload = await response.json();
                        if (!response.ok || payload?.error) {
                          console.error("Error declining request:", payload?.error || response.statusText);
                          getFriendships();
                          return;
                        }
                      }}>
                      Decline
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
import "./profile.css";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {useState, useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";

import {auth, logout, supabase} from '../lib/supabase.js';
import { VideoPreview, ClipCard, ClipCardSkeleton } from "./Library.jsx";

import SearchIcon from '@mui/icons-material/Search';
import CircularProgress from '@mui/material/CircularProgress';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import GoogleIcon from '@mui/icons-material/Google';
import CloseIcon from '@mui/icons-material/Close';

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";


export default function Profile() {
  const [friendName, setFriendName] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [session, setSession] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [tab, setTab] = useState(0);
  const [confirmingAction, setConfirmingAction] = useState(false);

  const displayResults = useRef(null);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [profileHandle, setProfileHandle] = useState("");
  const [email, setEmail] = useState("");
  const [loadingFriendships, setLoadingFriendships] = useState(true);

  const [loadingGoogleSignIn, setLoadingGoogleSignIn] = useState(false);
  const [loadingClips, setLoadingClips] = useState(true);
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [error, setError] = useState("");

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

  async function googleSignIn() {
    setLoadingGoogleSignIn(true);
    setError("");

    const result = await signInWithGoogle();
    if (!result?.ok) {
      setError(result.error || "Google Sign-In failed.");
    }
    setLoadingGoogleSignIn(false);
    await new Promise(res => setTimeout(res, 500))
    window.location.reload();
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
    function moveSelectedClip(direction) {
      if (!clips.length) return;

      setSelectedClip((currentClip) => {
        if (!currentClip) {
          return direction > 0 ? clips[0] : clips[clips.length - 1];
        }

        const currentIndex = clips.findIndex((item) => item.id === currentClip.id);
        if (currentIndex < 0) {
          return direction > 0 ? clips[0] : clips[clips.length - 1];
        }

        const nextIndex = Math.max(0, Math.min(clips.length - 1, currentIndex + direction));
        return clips[nextIndex];
      });
    }

    function onKeyDown(e) {
      if (e.code === "Escape") {
        setSelectedClip(null);
      }

      if (e.code === "ArrowUp") {
        e.preventDefault();
        moveSelectedClip(-1);
      }

      if (e.code === "ArrowDown") {
        e.preventDefault();
        moveSelectedClip(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clips]);

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
        setEmail((await auth.getUser()).data.user.email);
      }
      setLoadingAuth(false);
    };

    const fetchClips = async () => {
      const userId = (await auth.getUser()).data.user.id;
      const response = await fetch(`${baseUrl}/api/clips?userId=${userId}`);
      if (!response.ok) {
        console.error("Error fetching clips:", response.statusText);
        setClips([]);
        setLoadingClips(false);
        return;
      }
      const { data, error } = await response.json();
      if (error) {
        console.error("Error in clips response:", error);
        setClips([]);
      } else {
        setClips(data);
      }
      setLoadingClips(false);
    }

    getSession();
    getFriendships();
    getUsername();
    fetchClips();
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
        <div style={{width: "300px", margin: "20px auto"}}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginTop: "20px" }}>
            <Button fullWidth variant="contained" onClick={() => navigate("/login")}>
              Log in
            </Button>
            <Button fullWidth variant="outlined" onClick={() => navigate("/signup")}>
              Sign Up
            </Button>
          </div>
          {error && <p className="auth-error">{error}</p>}
          <Button fullWidth variant="outlined" style={{ marginTop: "20px" }} onClick={googleSignIn}>
            <GoogleIcon style={{ marginRight: "8px" }} />
            Sign In with Google
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
    <div className="settings-container profile-page">
      <div className="profile-header">
        <div className="profile-user-block">
          <Avatar
            className="profile-avatar"
            alt={profileHandle}
            src="https://i.pravatar.cc/240?img=12"
            sx={{ width: 84, height: 84 }}
          >
            YU
          </Avatar>
          <div>
            <p className="eyebrow">Profile</p>
            <h2>{profileHandle}</h2>
            <p className="profile-email">{email}</p>
          </div>
        </div>
      </div>

      <Box className="profile-tabs-shell">
        <Tabs
          value={tab}
          onChange={(_event, nextTab) => setTab(nextTab)}
          variant="scrollable"
          scrollButtons="auto"
          className="profile-tabs"
          aria-label="Profile tabs"
        >
          <Tab label="My Clips" />
          <Tab label="Friends" />
          <Tab label="Account Settings" />
        </Tabs>

        <div className="profile-tab-panel">
          {tab === 0 && (
            <section className="profile-tab-section">
              <div className="section-header">
                <h3 style={{marginBottom: "30px"}} >My Clips</h3>
                <div className="clip-grid library-grid">
                    {loadingClips
                      ? Array.from({ length: 16 }).map((_, index) => (
                          <ClipCardSkeleton key={`clip-skeleton-${index}`} />
                        ))
                      : clips.map((clip) => (
                          <ClipCard
                            key={clip.id}
                            clip={clip}
                            onSelect={setSelectedClip}
                          />
                        ))}
                  </div>
              </div>
              {selectedClip && <VideoPreview clip={selectedClip} onClose={() => setSelectedClip(null)} />}
            </section>
          )}

          {tab === 1 && (
            <section className="profile-tab-section">
              <div className="section-header">
                <h3>Friends</h3>
                <p>Three sections with placeholder items and action buttons.</p>
              </div>

              <div className="friends-layout">
                <div className="friends-column">
                  <h4>Icoming</h4>
                  <div className="placeholder-friend-list">
                    <article className="placeholder-friend-row">
                      <div className="placeholder-avatar" />
                      <div className="placeholder-friend-copy">
                        <strong>Friend Request 1</strong>
                        <span>Incoming request placeholder</span>
                      </div>
                      <div className="placeholder-actions">
                        <Button size="small" variant="contained">Accept</Button>
                        <Button size="small" variant="outlined">Decline</Button>
                      </div>
                    </article>
                    <article className="placeholder-friend-row">
                      <div className="placeholder-avatar" />
                      <div className="placeholder-friend-copy">
                        <strong>Friend Request 2</strong>
                        <span>Incoming request placeholder</span>
                      </div>
                      <div className="placeholder-actions">
                        <Button size="small" variant="contained">Accept</Button>
                        <Button size="small" variant="outlined">Decline</Button>
                      </div>
                    </article>
                  </div>
                </div>

                <div className="friends-column">
                  <h4>Outgoing</h4>
                  <div className="placeholder-friend-list">
                    <article className="placeholder-friend-row">
                      <div className="placeholder-avatar" />
                      <div className="placeholder-friend-copy">
                        <strong>Outgoing 1</strong>
                        <span>Outgoing request placeholder</span>
                      </div>
                      <div className="placeholder-actions">
                        <Button size="small" variant="outlined">Cancel</Button>
                      </div>
                    </article>
                    <article className="placeholder-friend-row">
                      <div className="placeholder-avatar" />
                      <div className="placeholder-friend-copy">
                        <strong>Outgoing 2</strong>
                        <span>Outgoing request placeholder</span>
                      </div>
                      <div className="placeholder-actions">
                        <Button size="small" variant="outlined">Cancel</Button>
                      </div>
                    </article>
                  </div>
                </div>

                <div className="friends-column">
                  <h4>Friends</h4>
                  <div className="placeholder-friend-list">
                    <article className="placeholder-friend-row">
                      <div className="placeholder-avatar" />
                      <div className="placeholder-friend-copy">
                        <strong>Friend 1</strong>
                        <span>Accepted friend placeholder</span>
                      </div>
                      <div className="placeholder-actions">
                        <Button size="small" variant="outlined">Unadd</Button>
                      </div>
                    </article>
                    <article className="placeholder-friend-row">
                      <div className="placeholder-avatar" />
                      <div className="placeholder-friend-copy">
                        <strong>Friend 2</strong>
                        <span>Accepted friend placeholder</span>
                      </div>
                      <div className="placeholder-actions">
                        <Button size="small" variant="outlined">Unadd</Button>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === 2 && (
            <section className="profile-tab-section">
              <div className="section-header">
                <h3>Account Settings</h3>
                <p>Layout only for now.</p>
              </div>

              <div className="account-settings-grid">
                <div className="account-settings-card">
                  <h4>Change Username</h4>
                  <div className="settings-placeholder-line" />
                  <Button variant="contained">Save Username</Button>
                </div>

                <div className="account-settings-card">
                  <h4>Reset Password</h4>
                  <div className="settings-placeholder-line" />
                  <Button variant="contained">Send Reset Link</Button>
                </div>

                <div className="account-settings-card">
                  <h4>Log out</h4>
                  <p className="settings-copy">Placeholder action card for logout.</p>
                  <Button onClick={async () => {await logout(); navigate("/")}} variant="outlined">Log Out</Button>
                </div>
              </div>
            </section>
          )}
        </div>
      </Box>
    </div>
  );
}
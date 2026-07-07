import "./profile.css";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {useState, useEffect, useRef, useCallback} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {useNavigate} from "react-router-dom";

import {logout, supabase, signInWithGoogle} from '../lib/supabase.js';
import { useAuthSession } from "../lib/authSession.js";
import { getAccount, updateAccountEmail, updateAccountPassword, updateAccountProfile } from "../lib/accountApi.js";
import SearchIcon from '@mui/icons-material/Search';
import CircularProgress from '@mui/material/CircularProgress';
import GoogleIcon from '@mui/icons-material/Google';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';

const EMPTY_ACCOUNT_FORM = {
  username: "",
  avatarUrl: "",
  email: "",
  currentPassword: "",
  password: "",
  confirmPassword: "",
};

const AVATAR_FILE_LIMIT_BYTES = 1500 * 1024;

function getAccountInitials(account) {
  const source = account?.username || account?.email || "User";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";
}

async function loadAccountData(session, userId) {
  try {
    return await getAccount(session);
  } catch (err) {
    console.error("Error fetching account:", err);
    const fallbackAccount = {
      id: session.user.id,
      username: session.user.user_metadata?.displayName || session.user.user_metadata?.name || "User",
      email: session.user.email || "",
      emailConfirmed: Boolean(session.user.email_confirmed_at),
      avatarUrl: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || "",
      hasCustomAvatar: Boolean(session.user.user_metadata?.avatar_url),
      providers: session.user.app_metadata?.providers || [],
      hasPassword: session.user.app_metadata?.providers?.includes("email") || false,
    };

    const { data, error } = await supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();

    if (!error && data?.username) {
      fallbackAccount.username = data.username;
    }

    return fallbackAccount;
  }
}

async function fetchFriendships(userId) {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error) {
    throw error;
  }

  const friendships = data || [];
  const friendIds = [...new Set(friendships.map((friendship) => (
    friendship.user_id === userId ? friendship.friend_id : friendship.user_id
  )))];

  if (friendIds.length === 0) {
    return [];
  }

  const { data: friendsData, error: friendsError } = await supabase
    .from("users")
    .select("id, username")
    .in("id", friendIds);

  if (friendsError) {
    throw friendsError;
  }

  const usernamesById = new Map((friendsData || []).map((friend) => [friend.id, friend.username]));
  return friendships.map((friendship) => {
    const friendId = friendship.user_id === userId ? friendship.friend_id : friendship.user_id;
    return {
      ...friendship,
      friendName: usernamesById.get(friendId) || "Unknown User",
    };
  });
}

export default function Profile() {
  const [friendName, setFriendName] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const { session, loading: loadingAuth } = useAuthSession();
  const [removeTarget, setRemoveTarget] = useState(null);
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountTab, setAccountTab] = useState("profile");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");

  const displayResults = useRef(null);
  const avatarInputRef = useRef(null);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const [loadingGoogleSignIn, setLoadingGoogleSignIn] = useState(false);
  const [error, setError] = useState("");

  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    queryKey: ["profile", "account", userId],
    queryFn: () => loadAccountData(session, userId),
    enabled: Boolean(session && userId),
  });
  const friendshipsQuery = useQuery({
    queryKey: ["profile", "friendships", userId],
    queryFn: () => fetchFriendships(userId),
    enabled: Boolean(userId),
    placeholderData: [],
  });
  const account = accountQuery.data || null;
  const friendships = friendshipsQuery.data || [];
  const loadingProfile = accountQuery.isLoading && !account;
  const loadingFriendships = friendshipsQuery.isLoading && friendships.length === 0;
  const profileHandle = account?.username || session?.user?.user_metadata?.displayName || session?.user?.user_metadata?.name || "User";

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
    if (!name || !userId) return;
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
      let filteredResults = data.filter(user => user.id !== userId);
      
      setSearchResults(filteredResults);
      setShowResults(true);
      setLoadingUsers(false);
    }
  }

  const getFriendships = useCallback(() => {
    if (!userId) {
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["profile", "friendships", userId] });
  }, [queryClient, userId]);

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

  function syncAccountForm(nextAccount) {
    setAccountForm({
      ...EMPTY_ACCOUNT_FORM,
      username: nextAccount?.username || "",
      avatarUrl: nextAccount?.avatarUrl || "",
      email: nextAccount?.email || "",
    });
  }

  function openAccountModal(tab = "profile") {
    syncAccountForm(account);
    setAccountTab(account?.providers?.includes("google") ? "profile" : tab);
    setAccountError("");
    setAccountSuccess("");
    setAccountModalOpen(true);
  }

  function updateAccountFormField(field, value) {
    setAccountForm((prevForm) => ({
      ...prevForm,
      [field]: value,
    }));
    setAccountError("");
    setAccountSuccess("");
  }

  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!["image/png", "image/jpg", "image/jpeg", "image/webp"].includes(file.type)) {
      setAccountError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > AVATAR_FILE_LIMIT_BYTES) {
      setAccountError("Choose an image 1500 KB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateAccountFormField("avatarUrl", String(reader.result || ""));
    };
    reader.onerror = () => {
      setAccountError("Could not read that image.");
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setAccountSaving(true);
    setAccountError("");
    setAccountSuccess("");

    try {
      const updatedAccount = await updateAccountProfile(session, {
        username: accountForm.username,
        avatarUrl: accountForm.avatarUrl,
      });
      queryClient.setQueryData(["profile", "account", userId], updatedAccount);
      syncAccountForm(updatedAccount);
      setAccountSuccess("Profile updated.");
    } catch (err) {
      setAccountError(err.message || "Failed to update profile.");
    } finally {
      setAccountSaving(false);
    }
  }

  async function handleSaveEmail(event) {
    event.preventDefault();
    setAccountSaving(true);
    setAccountError("");
    setAccountSuccess("");

    try {
      const updatedAccount = await updateAccountEmail(session, accountForm.email);
      queryClient.setQueryData(["profile", "account", userId], updatedAccount);
      syncAccountForm(updatedAccount);
      setAccountSuccess("Email updated.");
    } catch (err) {
      setAccountError(err.message || "Failed to update email.");
    } finally {
      setAccountSaving(false);
    }
  }

  async function handleSavePassword(event) {
    event.preventDefault();
    setAccountSaving(true);
    setAccountError("");
    setAccountSuccess("");

    if (accountForm.password !== accountForm.confirmPassword) {
      setAccountSaving(false);
      setAccountError("New passwords do not match.");
      return;
    }

    try {
      const updatedAccount = await updateAccountPassword(session, {
        currentPassword: accountForm.currentPassword,
        password: accountForm.password,
      });
      queryClient.setQueryData(["profile", "account", userId], updatedAccount);
      setAccountForm((prevForm) => ({
        ...prevForm,
        currentPassword: "",
        password: "",
        confirmPassword: "",
      }));
      setAccountSuccess(updatedAccount.hasPassword ? "Password updated." : "Password added.");
    } catch (err) {
      setAccountError(err.message || "Failed to update password.");
    } finally {
      setAccountSaving(false);
    }
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
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`friendships:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          getFriendships();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [getFriendships, userId]);

  if (loadingAuth || (session && loadingProfile)) {
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
  const accountInitials = getAccountInitials(account);
  const accountAvatar = account?.avatarUrl;
  const isGoogleConnected = account?.providers?.includes("google");
  const modalAvatarPreview = accountForm.avatarUrl;



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
        </div>
        <Button onClick={async () => {await logout();navigate("/")}} variant={"contained"}>
          Log Out
        </Button>
      </div>

      <div className={"profile-grid"}>
        <section className="profile-card account-card">
          <div className="account-card-main">
            <div className="account-avatar" aria-hidden="true">
              {accountAvatar ? (
                <img src={accountAvatar} alt="" />
              ) : (
                <span>{accountInitials}</span>
              )}
            </div>
            <div className="account-card-copy">
              <div className="account-card-heading">
                <h4>{account?.username || profileHandle || "User"}</h4>
              </div>
              <p className="account-email">{account?.email || "No email on file"}</p>
              {isGoogleConnected && (
                <div className="account-status-row" aria-label="Account status">
                  <span>
                    <GoogleIcon fontSize="small" />
                    Google connected
                  </span>
                </div>
              )}
            </div>
          </div>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => openAccountModal("profile")}
          >
            Edit account
          </Button>
        </section>

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
                    <button className="add-friend-btn add-friend-btn--decline" onClick={async () => {
                        await supabase
                          .from("friendships")
                          .delete()
                          .eq("friend_id", session.user.id)
                          .eq("user_id", f.user_id);
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

      {accountModalOpen && (
        <div className="account-overlay" onClick={() => !accountSaving && setAccountModalOpen(false)}>
          <section
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="account-modal-header">
              <div>
                <p className="confirm-eyebrow">Account settings</p>
                <h3 id="account-modal-title">Edit account</h3>
              </div>
              <button
                type="button"
                className="account-icon-button"
                aria-label="Close account settings"
                onClick={() => setAccountModalOpen(false)}
                disabled={accountSaving}
              >
                <CloseIcon fontSize="small" />
              </button>
            </div>

            <div className="account-modal-tabs" role="tablist" aria-label="Account settings sections">
              <button
                type="button"
                className={`account-tab${accountTab === "profile" ? " is-active" : ""}`}
                role="tab"
                aria-selected={accountTab === "profile"}
                onClick={() => {
                  setAccountTab("profile");
                  setAccountError("");
                  setAccountSuccess("");
                }}
              >
                <PersonOutlineIcon fontSize="small" />
                Profile
              </button>
              {!isGoogleConnected && (
                <>
                  <button
                    type="button"
                    className={`account-tab${accountTab === "email" ? " is-active" : ""}`}
                    role="tab"
                    aria-selected={accountTab === "email"}
                    onClick={() => {
                      setAccountTab("email");
                      setAccountError("");
                      setAccountSuccess("");
                    }}
                  >
                    <EmailOutlinedIcon fontSize="small" />
                    Email
                  </button>
                  <button
                    type="button"
                    className={`account-tab${accountTab === "password" ? " is-active" : ""}`}
                    role="tab"
                    aria-selected={accountTab === "password"}
                    onClick={() => {
                      setAccountTab("password");
                      setAccountError("");
                      setAccountSuccess("");
                    }}
                  >
                    <LockOutlinedIcon fontSize="small" />
                    Password
                  </button>
                </>
              )}
            </div>

            <div className="account-modal-body">
              {accountTab === "profile" && (
                <form className="account-form" onSubmit={handleSaveProfile}>
                  <div className="account-avatar-editor">
                    <div className="account-avatar account-avatar--large" aria-hidden="true">
                      {modalAvatarPreview ? (
                        <img src={modalAvatarPreview} alt="" />
                      ) : (
                        <span>{accountInitials}</span>
                      )}
                    </div>
                    <div className="account-avatar-copy">
                      <h4>Profile photo</h4>
                      <p>PNG, JPG, or WebP up to 1500 KB.</p>
                      <div className="account-avatar-actions">
                        <Button
                          type="button"
                          variant="outlined"
                          size="small"
                          startIcon={<PhotoCameraIcon />}
                          onClick={() => avatarInputRef.current?.click()}
                        >
                          Choose photo
                        </Button>
                        <Button
                          type="button"
                          variant="text"
                          size="small"
                          onClick={() => updateAccountFormField("avatarUrl", "")}
                          disabled={!accountForm.avatarUrl || (!account?.hasCustomAvatar && accountForm.avatarUrl === account?.avatarUrl)}
                        >
                          Remove
                        </Button>
                      </div>
                      <input
                        ref={avatarInputRef}
                        className="account-file-input"
                        type="file"
                        accept="image/png,image/jpg,image/jpeg,image/webp"
                        onChange={handleAvatarFileChange}
                      />
                    </div>
                  </div>

                  <TextField
                    sx={tfSx}
                    label="Username"
                    value={accountForm.username}
                    onChange={(e) => updateAccountFormField("username", e.target.value)}
                    inputProps={{ maxLength: 32 }}
                    required
                  />

                  {accountError && <p className="account-message account-message--error">{accountError}</p>}
                  {accountSuccess && <p className="account-message account-message--success">{accountSuccess}</p>}

                  <div className="account-modal-actions">
                    <Button type="button" variant="text" onClick={() => setAccountModalOpen(false)} disabled={accountSaving}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" disabled={accountSaving}>
                      {accountSaving ? "Saving..." : "Save profile"}
                    </Button>
                  </div>
                </form>
              )}

              {!isGoogleConnected && accountTab === "email" && (
                <form className="account-form" onSubmit={handleSaveEmail}>
                  <TextField
                    sx={tfSx}
                    label="Email"
                    type="email"
                    value={accountForm.email}
                    onChange={(e) => updateAccountFormField("email", e.target.value)}
                    required
                  />
                  <p className="account-muted-copy">
                    Use the email you want tied to sign-in, password recovery, and account notices.
                  </p>

                  {accountError && <p className="account-message account-message--error">{accountError}</p>}
                  {accountSuccess && <p className="account-message account-message--success">{accountSuccess}</p>}

                  <div className="account-modal-actions">
                    <Button type="button" variant="text" onClick={() => setAccountModalOpen(false)} disabled={accountSaving}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" disabled={accountSaving || accountForm.email === account?.email}>
                      {accountSaving ? "Saving..." : "Save email"}
                    </Button>
                  </div>
                </form>
              )}

              {!isGoogleConnected && accountTab === "password" && (
                <form className="account-form" onSubmit={handleSavePassword}>
                  {!account?.hasPassword && (
                    <div className="account-inline-note">
                      <LockOutlinedIcon fontSize="small" />
                      <span>Add a password to sign in with email as well as connected providers.</span>
                    </div>
                  )}
                  {account?.hasPassword && (
                    <TextField
                      sx={tfSx}
                      label="Current password"
                      type="password"
                      value={accountForm.currentPassword}
                      onChange={(e) => updateAccountFormField("currentPassword", e.target.value)}
                      required
                    />
                  )}
                  <TextField
                    sx={tfSx}
                    label="New password"
                    type="password"
                    value={accountForm.password}
                    onChange={(e) => updateAccountFormField("password", e.target.value)}
                    inputProps={{ minLength: 6 }}
                    required
                  />
                  <TextField
                    sx={tfSx}
                    label="Confirm new password"
                    type="password"
                    value={accountForm.confirmPassword}
                    onChange={(e) => updateAccountFormField("confirmPassword", e.target.value)}
                    inputProps={{ minLength: 6 }}
                    required
                  />
                  <p className="account-muted-copy">Use at least 6 characters.</p>

                  {accountError && <p className="account-message account-message--error">{accountError}</p>}
                  {accountSuccess && <p className="account-message account-message--success">{accountSuccess}</p>}

                  <div className="account-modal-actions">
                    <Button type="button" variant="text" onClick={() => setAccountModalOpen(false)} disabled={accountSaving}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" disabled={accountSaving}>
                      {accountSaving ? "Saving..." : account?.hasPassword ? "Update password" : "Add password"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      )}

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

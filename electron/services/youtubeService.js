import fs from "fs";
import http from "http";
import keytar from "keytar";
import { google } from "googleapis";
import url from "url";
import { supabaseAdmin } from "../main.js";

const SERVICE = "ClipX";
const ACCOUNT = "youtube_refresh_token";
const clientId = "170688170367-cesbl36crdh2qk3up02egjduffq4nepe.apps.googleusercontent.com";
const clientSecret = "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";
const redirectPort = 51723;
const redirectUri = `http://127.0.0.1:${redirectPort}`;
const OAUTH_TIMEOUT_MS = 90_000;

function normalizeUserId(userId) {
  const normalized = String(userId || "").trim();
  return normalized || null;
}

async function storeRefreshToken(token, userId) {
  const user_id = normalizeUserId(userId);
  if (!user_id) {
    console.error("No user ID provided to storeRefreshToken");
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("google_accounts")
    .upsert({ user_id: user_id, refresh_token: token }, { onConflict: "user_id" })
    .select()
    .single();
  
  if (error) {
    console.error("Error storing refresh token in Supabase:", error);
    return;
  }

  await keytar.setPassword(SERVICE, ACCOUNT, token);
}

export async function getRefreshToken(userId) {
  const user_id = normalizeUserId(userId);
  if (!user_id) {
    console.error("No user ID provided to getRefreshToken");
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("google_accounts")
    .select("refresh_token")
    .eq("user_id", user_id)
    .single();

  if (error) {
    console.error("Error fetching refresh token from Supabase:", error);
    return null;
  }
  if (!data.refresh_token) {
    return null;
  }

  const token = data.refresh_token;
  await storeRefreshToken(token, userId);
  return token;
}

export async function deleteRefreshToken(userId) {
  const response = await supabaseAdmin
    .from("google_accounts")
    .delete()
    .eq("user_id", userId);
  if (response.error) {
    console.error("Error deleting refresh token from Supabase:", response.error);
    return;
  }
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

async function exchangeCodeForTokens(code, userId) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Failed OAuth token exchange: ${data.error_description || data.error}`);
  }
  if (!data.refresh_token) {
    throw new Error("Failed to get refresh token from Google OAuth response");
  }
  await storeRefreshToken(data.refresh_token, userId);
}

export async function getAccessToken(userId) {
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) {
    throw new Error("No refresh token found");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (data.error) {
    if (data.error === "invalid_grant") {
      await deleteRefreshToken(userId);
      throw new Error("Stored YouTube login expired or was revoked. Please link your YouTube account again.");
    }
    throw new Error(`Failed to refresh access token: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

export async function getGoogleUserInfo(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return await response.json();
}

export async function linkYoutube(shell, userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new Error("Missing user_id for linkYoutube");
  }

  const refreshToken = await getRefreshToken(normalizedUserId);
  if (refreshToken) {
    try {
      const accessToken = await getAccessToken(normalizedUserId);
      const userInfo = await getGoogleUserInfo(accessToken);
      return userInfo;
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.includes("expired or was revoked")) {
        throw error;
      }
    }
  }


  return await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const queryObject = url.parse(req.url, true).query;
      try {
        if (queryObject.code) {
          res.end("You can close this window now.");
          server.removeAllListeners("request");
          server.close();

          await exchangeCodeForTokens(queryObject.code, normalizedUserId);
          const accessToken = await getAccessToken(normalizedUserId);
          const userInfo = await getGoogleUserInfo(accessToken);
          console.log("Linked YouTube account:", userInfo);
          resolve(userInfo);
        } else if (queryObject.error) {
          res.end("Authorization failed.");
          server.removeAllListeners("request");
          server.close();
          resolve(null);
        }
      } catch (error) {
        server.removeAllListeners("request");
        server.close();
        console.error(error);
        reject(error);
      }
    });

    const timeoutId = setTimeout(() => {
      server.close();
      resolve(null); // treat as cancelled
    }, OAUTH_TIMEOUT_MS);

    server.on("error", (err) => {
      clearTimeout(timeoutId);
      if (err?.code === "EADDRINUSE") {
        resolve(null); // another flow still running
        return;
      }
      reject(err);
    });

    server.listen(redirectPort);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    shell.openExternal(authUrl).catch((err) => {
      clearTimeout(timeoutId);
      server.close();
      console.error("Failed to open browser for YouTube linking:", err);
      reject(err);
    });
  });

}

export async function unlinkYoutube(userId) {
  const normalizedUserId = normalizeUserId(userId);
  const refreshToken = await getRefreshToken(normalizedUserId);
  if (!refreshToken) {
    console.error("No refresh token found in keytar for user");
    return null;
  }

  if (!normalizedUserId) {
    console.error("No user ID provided to unlinkYoutube");
    return null;
  }

  const response = await supabaseAdmin
    .from("google_accounts")
    .delete()
    .eq("user_id", normalizedUserId);

  if (response.error) {
    console.error("Error deleting refresh token from Supabase:", response.error);
  }

  await deleteRefreshToken(userId);
}

export async function getGoogleInfo(userId) {
  try {
    const accessToken = await getAccessToken(userId);
    return await getGoogleUserInfo(accessToken);
  } catch (error) {
    console.error("Failed to get Google info:", error);
    return null;
  }
}

export async function uploadClipToYoutube({ videoPath, title, tags, game, userId }) {
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) {
    throw new Error("No linked YouTube account. Link your account in settings first.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const normalizedTags = Array.isArray(tags)
    ? tags.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (game?.label) {
    normalizedTags.push(String(game.label).trim());
  }

  const uploadResponse = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: title || videoPath,
        tags: normalizedTags,
      },
      status: {
        privacyStatus: "unlisted",
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = uploadResponse?.data?.id;
  if (!videoId) {
    throw new Error("YouTube upload completed without a video ID");
  }

  return {
    videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

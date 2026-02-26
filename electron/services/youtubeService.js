import fs from "fs";
import http from "http";
import keytar from "keytar";
import { google } from "googleapis";
import url from "url";

const SERVICE = "ClipX";
const ACCOUNT = "youtube_refresh_token";
const clientId = "170688170367-cesbl36crdh2qk3up02egjduffq4nepe.apps.googleusercontent.com";
const clientSecret = "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";
const redirectPort = 51723;
const redirectUri = `http://127.0.0.1:${redirectPort}`;

async function storeRefreshToken(token) {
  await keytar.setPassword(SERVICE, ACCOUNT, token);
}

export async function getRefreshToken() {
  return await keytar.getPassword(SERVICE, ACCOUNT);
}

export async function deleteRefreshToken() {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

async function exchangeCodeForTokens(code) {
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
  await storeRefreshToken(data.refresh_token);
}

export async function getAccessToken() {
  const refreshToken = await getRefreshToken();
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
      await deleteRefreshToken();
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

export async function linkYoutube(shell) {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      const accessToken = await getAccessToken();
      const userInfo = await getGoogleUserInfo(accessToken);
      console.log("Linked YouTube account:", userInfo);
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

          await exchangeCodeForTokens(queryObject.code);
          const accessToken = await getAccessToken();
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
    shell.openExternal(authUrl).catch(reject);
  });
}

export async function unlinkYoutube() {
  await deleteRefreshToken();
}

export async function getGoogleInfo() {
  try {
    const accessToken = await getAccessToken();
    return await getGoogleUserInfo(accessToken);
  } catch (error) {
    console.error("Failed to get Google info:", error);
    return null;
  }
}

export async function uploadClipToYoutube({ videoPath, title, tags, game }) {
  const refreshToken = await getRefreshToken();
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

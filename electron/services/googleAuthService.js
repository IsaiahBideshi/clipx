import http from "http";
import dotenv from "dotenv";
import path from "path";
import url from "url";

import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { generatePKCE } from "../utils/PKCE.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config();

const supabase = createClient(
  "https://vymaqpjhajwpbzmnoadk.supabase.co",
  "sb_publishable_2wc5OZpO54DVJ7HUGwkWXQ_UP9zVSgv"
);

const SERVICE = "ClipX";
let clientId = null;
let clientSecret = null;
const redirectPort = 51723;
const redirectUri = `http://127.0.0.1:${redirectPort}`;
const OAUTH_TIMEOUT_MS = 90_000;

const baseUrl = (process.env.VITE_DATABASE_URL || "https://clipx.bideshi.tech").replace(/\/+$/, "");

async function fetchKeys() {
  const response = await fetch(`${baseUrl}/api/keys`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch API keys: ${response.error}`);
  }
  const { data, error } = await response.json();
  if (error) {
    throw new Error(`Error in API keys response: ${error}`);
  }
  if (data) {
    clientId = data.googleClientId;
    clientSecret = data.googleClientSecret;
  }
}

(await fetchKeys().catch((err) => {
  throw new Error(`Failed to load Google OAuth credentials on startup: ${err.message}`);
  console.error("Failed to load Google OAuth credentials on startup:", err);
  clientId = null;
  clientSecret = null;
}));

const { verifier, challenge } = generatePKCE();

export async function signInWithGoogle(shell) {
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google sign-in is not configured in this build. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the packaged app environment, or point CLIPX_ENV_PATH to a file that contains them."
    );
  }

  return await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const queryObject = url.parse(req.url, true).query;
      try {
        if (queryObject.code) {
          res.end("You can close this window now.");
          server.removeAllListeners("request");
          server.close();

          console.log("Received auth code from Google:", queryObject.code);

          const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
          const { tokens } = await oauth2Client.getToken({code: queryObject.code, codeVerifier: verifier});
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: tokens.id_token,
            access_token: tokens.access_token,
          });


          clearTimeout(timeoutId);
          resolve({ ok: true, session: data.session });
        } else if (queryObject.error) {
          res.end("Authorization failed.");
          server.removeAllListeners("request");
          server.close();
          clearTimeout(timeoutId);
          resolve(null);
        }
      } catch (error) {
        server.removeAllListeners("request");
        server.close();
        clearTimeout(timeoutId);
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

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
      scope: [
        "openid",
        "email",
        "profile"
      ],
      access_type: "offline",
      prompt: "consent",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    shell.openExternal(authUrl);

  });
}
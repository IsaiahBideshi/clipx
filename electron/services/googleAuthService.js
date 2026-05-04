import http from "http";
import dotenv from "dotenv";
import path from "path";
import url from "url";

import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config();

const supabase = createClient(
  "https://vymaqpjhajwpbzmnoadk.supabase.co",
  "sb_publishable_2wc5OZpO54DVJ7HUGwkWXQ_UP9zVSgv"
);

const SERVICE = "ClipX";
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectPort = 51723;
const redirectUri = `http://127.0.0.1:${redirectPort}`;
const OAUTH_TIMEOUT_MS = 90_000;

export async function signInWithGoogle(shell) {

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
          const { tokens } = await oauth2Client.getToken(queryObject.code);
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
    });

    shell.openExternal(authUrl);

  });
}
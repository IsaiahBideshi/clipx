import latestVersion from "../api-handlers/latest-version.js";
import users from "../api-handlers/users.js";
import friendships from "../api-handlers/friendships.js";
import keys from "../api-handlers/keys.js";
import clips from "../api-handlers/clips/clips.js";
import clipsFiles from "../api-handlers/clips/files.js";
import clipsStream from "../api-handlers/clips/stream.js";
import google from "../api-handlers/account/google.js";
import googleToken from "../api-handlers/google/token.js";
import account from "../api-handlers/account/account.js";

const routes = {
  "/api/latest-version": latestVersion,
  "/api/users": users,
  "/api/friendships": friendships,
  "/api/keys": keys,
  "/api/clips": clips,
  "/api/clips/files": clipsFiles,
  "/api/clips/stream": clipsStream,
  "/api/account": account,
  "/api/google_accounts": google,
  "/api/google/token": googleToken,
};

export default function handler(req, res) {
  const path = req.url.split("?")[0];
  const route = routes[path];

  if (route) {
    return route(req, res);
  }

  if (path === "/api") {
    return res.status(200).json({ message: "Hello from the API!" });
  }

  return res.status(404).json({ error: "Endpoint not found" });
}

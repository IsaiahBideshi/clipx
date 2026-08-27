import latestVersion from "./latest-version/latest-version.js";
import users from "./users/users.js";
import friendships from "./friendships/friendships.js";
import keys from "./keys/keys.js";
import clips from "./clips/clips.js";
import clipsFiles from "./clips/files.js";
import clipsStream from "./clips/stream.js";
import google from "./account/google.js";
import googleToken from "./google/token.js";
import account from "./account/account.js";

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

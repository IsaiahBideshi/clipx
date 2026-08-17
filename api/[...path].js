import { handlers } from "./handler.js";

export default function handler(req, res) {
  const path = req.url.split("?")[0];

  console.log("Request path:", path);

  switch (path) {
    case "/api/latest-version":
      return handlers.latestVersion(req, res);
    
    case "/api/users":
      return handlers.users(req, res);

    case "/api/friendships":
      return handlers.friendships(req, res);

    case "/api/keys":
      return handlers.keys(req, res);

    case "/api/clips":
      return handlers.clips(req, res);

    case "/api/account":
      return handlers.account(req, res);

    case "/api/google_accounts":
      return handlers.google(req, res);

    case "/api/google/token":
      return handlers.googleToken(req, res);

    case "/api":
      return res.status(200).json({
        message: "Hello from the API!"
      });

    default:
      return res.status(404).json({
        error: "Endpoint not found"
      });
  }
}
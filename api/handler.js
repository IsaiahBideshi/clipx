import versionHandler from "./latest-version/latest-version.js";
import usersHandler from "./users/users.js";
import friendshipsHandler from "./friendships/friendships.js";
import keysHandler from "./keys/keys.js";
import clipsHandler from "./clips/clips.js";
import googleHandler from "./account/google.js";
import googleTokenHandler from "./google/token.js";
import accountHandler from "./account/account.js";

export const handlers = {
  latestVersion: versionHandler,
  users: usersHandler,
  friendships: friendshipsHandler,
  keys: keysHandler,
  clips: clipsHandler,
  google: googleHandler,
  googleToken: googleTokenHandler,
  account: accountHandler,
};
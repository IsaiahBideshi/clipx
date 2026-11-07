import Fuse from "fuse.js";
import STOREDGAMES from "../data/games.json";

const storedGames = new Fuse(STOREDGAMES, { threshold: 0.3, keys: ["name"] });

async function findGames(gameName) {
  const localGames = storedGames.search(gameName).map((result) => result.item);
  if (localGames.length > 5) return localGames;

  const api = window?.clipx?.searchGames;
  if (typeof api !== "function") return localGames;

  try {
    return [...localGames, ...await api(gameName)];
  } catch (e) {
    console.error("searchGames failed:", e);
    return localGames;
  }
}

export async function searchGames(gameName) {
  return (await findGames(gameName)).map(toGameOption);
}

export function toGameOption(game) {
  return {
    id: game.id,
    label: game.name + (game.first_release_date ? ` (${new Date(game.first_release_date * 1000).getFullYear()})` : ""),
    image: game?.cover?.url,
  };
}

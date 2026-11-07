import { useEffect, useState } from "react";
import Fuse from "fuse.js";
import STOREDGAMES from "../data/games.json";

const storedGames = new Fuse(STOREDGAMES, { threshold: 0.3, keys: ["name"] });

async function searchGames(gameName) {
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

export function toGameOption(game) {
  return {
    id: game.id,
    label: game.name + (game.first_release_date ? ` (${new Date(game.first_release_date * 1000).getFullYear()})` : ""),
    image: game?.cover?.url,
  };
}

export function useGameSearch(input) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    const query = input.trim();
    if (query.length < 3) {
      setOptions([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const games = await searchGames(query);
      if (!cancelled) {
        setOptions(games.map(toGameOption));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  return options;
}

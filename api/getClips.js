import supabase from "./supabase.js"

export async function getClips() {
  const { data, error } = await supabase
    .from("clips")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return res.status(500).json({ error })
    
  return res.status(200).json(data);
}
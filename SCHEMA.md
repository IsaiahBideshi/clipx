## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `username` | `text` |  Nullable |
| `avatar_url` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `email` | `text` |  Nullable Unique |

## Table `clips`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `thumbnail_blob_name` | `text` |  Nullable |
| `owner_id` | `uuid` |  Nullable |
| `youtube_video_id` | `text` |  |
| `title` | `text` |  Nullable |
| `description` | `text` |  Nullable |
| `visibility` | `text` |  Nullable |
| `id` | `uuid` | Primary |
| `created_at` | `timestamptz` |  Nullable |
| `game_id` | `int8` |  Nullable |
| `blob_name` | `text` |  Nullable |

## Table `clip_tags`

Each row tags either a ClipX account (`user_id`) or custom text (`label`), never both. Unique per clip on `user_id` and on `lower(label)`. Rows are deleted with their clip or tagged user. Rows are only inserted by the `create_clip_with_tags` and `update_clip_with_tags` functions, so there is no client INSERT policy.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `clip_id` | `uuid` |  |
| `user_id` | `uuid` |  Nullable |
| `label` | `text` |  Nullable |

## Table `friendships`

Clients (`authenticated`) can only update `status`; `user_id` and `friend_id` can't be changed after a request is sent.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `friend_id` | `uuid` | Primary |
| `status` | `text` |  Nullable |

## Table `google_accounts`

Stores google account refresh tokens for users.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `created_at` | `timestamptz` |  |
| `refresh_token` | `text` |  |
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  Nullable Unique |

## RLS Policies

### `users`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can insert their own profile` | INSERT | public | PERMISSIVE | — | `(auth.uid() = id)` |
| `Users can update themselves` | UPDATE | public | PERMISSIVE | `(auth.uid() = id)` | — |
| `Users can view all users` | SELECT | public | PERMISSIVE | `true` | — |

### `clip_tags`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can view clip tags` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM clips   WHERE (clips.id = clip_tags.clip_id)))` | — |

### `clips`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can delete their own clips` | DELETE | public | PERMISSIVE | `(auth.uid() = owner_id)` | — |
| `Users can edit their own clips` | UPDATE | public | PERMISSIVE | `(auth.uid() = owner_id)` | — |
| `Users can upload their own clips` | INSERT | public | PERMISSIVE | — | `(auth.uid() = owner_id)` |
| `Users can view clips based on visibility` | SELECT | public | PERMISSIVE | `((visibility = 'public'::text) OR (owner_id = auth.uid()) OR ((visibility = 'friends'::text) AND (EXISTS ( SELECT 1    FROM friendships   WHERE ((friendships.status = 'accepted'::text) AND (((friendships.user_id = auth.uid()) AND (friendships.friend_id = clips.owner_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = clips.owner_id))))))))` | — |

### `friendships`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can accept friend request` | UPDATE | public | PERMISSIVE | `(auth.uid() = friend_id)` | `((auth.uid() = friend_id) AND (status = 'accepted'::text))` |
| `Users can delete their own friendships` | DELETE | public | PERMISSIVE | `((auth.uid() = user_id) OR (auth.uid() = friend_id))` | — |
| `Users can send friend request` | INSERT | public | PERMISSIVE | — | `((auth.uid() = user_id) AND (status = 'pending'::text))` |
| `Users can view their friendships` | SELECT | public | PERMISSIVE | `((auth.uid() = user_id) OR (auth.uid() = friend_id))` | — |

### `google_accounts`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can link google account` | INSERT | public | PERMISSIVE | — | `(auth.uid() = user_id)` |
| `Users can unlink google account` | DELETE | public | PERMISSIVE | `(auth.uid() = user_id)` | — |
| `Users can update own google account` | UPDATE | public | PERMISSIVE | `(auth.uid() = user_id)` | — |
| `Users can view own google account` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |

## Functions

### `create_clip_with_tags`

Called by the upload flow (`supabase.rpc`). Inserts a clip owned by the caller and its tags in one transaction, so any error leaves neither behind. Tagged users must be accepted friends, labels are trimmed and at most 50 characters, duplicate tags are skipped, and a clip can have at most 20 tags. The renderer checks the same limits before uploading (`getClipTagsError` in `src/lib/clipsApi.js`).

```sql
create or replace function public.create_clip_with_tags(
  title text,
  visibility text,
  game_id bigint,
  blob_name text,
  thumbnail_blob_name text,
  youtube_video_id text,
  user_ids uuid[],
  labels text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_clip_id uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from unnest(labels) as l(label) where char_length(btrim(l.label)) > 50) then
    raise exception 'Tags must be 50 characters or fewer';
  end if;

  if exists (
    select 1 from unnest(user_ids) as t(user_id)
    where not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.user_id = caller_id and f.friend_id = t.user_id)
          or (f.friend_id = caller_id and f.user_id = t.user_id))
    )
  ) then
    raise exception 'You can only tag your friends';
  end if;

  insert into public.clips (owner_id, title, description, visibility, game_id, blob_name, thumbnail_blob_name, youtube_video_id, created_at)
  values (caller_id, title, '', visibility, game_id, blob_name, thumbnail_blob_name, youtube_video_id, now())
  returning id into new_clip_id;

  insert into public.clip_tags (clip_id, user_id)
  select new_clip_id, t.user_id from unnest(user_ids) as t(user_id)
  on conflict do nothing;

  insert into public.clip_tags (clip_id, label)
  select new_clip_id, btrim(l.label) from unnest(labels) as l(label)
  where btrim(l.label) <> ''
  on conflict do nothing;

  if (select count(*) from public.clip_tags ct where ct.clip_id = new_clip_id) > 20 then
    raise exception 'A clip can have at most 20 tags';
  end if;

  return new_clip_id;
end;
$$;

revoke execute on function public.create_clip_with_tags(text, text, bigint, text, text, text, uuid[], text[]) from public, anon;
grant execute on function public.create_clip_with_tags(text, text, bigint, text, text, text, uuid[], text[]) to authenticated;
```

### `update_clip_with_tags`

Called by the Library's edit dialog (`supabase.rpc`). Updates the title, visibility and game of a clip the caller owns and replaces its tags in one transaction. It locks the clip row first, so two saves of the same clip run one after the other and the last one wins. It checks the same rules as `create_clip_with_tags`, except users who are already tagged stay allowed after they stop being friends. Returns the clip's new `clip_tags` rows.

```sql
create or replace function public.update_clip_with_tags(
  clip_id uuid,
  title text,
  visibility text,
  game_id bigint,
  user_ids uuid[],
  labels text[]
)
returns setof public.clip_tags
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  perform 1 from public.clips c
  where c.id = update_clip_with_tags.clip_id and c.owner_id = caller_id
  for update;
  if not found then
    raise exception 'Clip not found';
  end if;

  if btrim(coalesce(update_clip_with_tags.title, '')) = '' then
    raise exception 'Enter a title';
  end if;

  if update_clip_with_tags.visibility is null or update_clip_with_tags.visibility not in ('public', 'private', 'friends') then
    raise exception 'Invalid visibility';
  end if;

  if exists (select 1 from unnest(labels) as l(label) where char_length(btrim(l.label)) > 50) then
    raise exception 'Tags must be 50 characters or fewer';
  end if;

  if exists (
    select 1 from unnest(user_ids) as t(user_id)
    where not exists (
      select 1 from public.clip_tags ct
      where ct.clip_id = update_clip_with_tags.clip_id and ct.user_id = t.user_id
    )
    and not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.user_id = caller_id and f.friend_id = t.user_id)
          or (f.friend_id = caller_id and f.user_id = t.user_id))
    )
  ) then
    raise exception 'You can only tag your friends';
  end if;

  update public.clips c
  set title = btrim(update_clip_with_tags.title),
      visibility = update_clip_with_tags.visibility,
      game_id = update_clip_with_tags.game_id
  where c.id = update_clip_with_tags.clip_id;

  delete from public.clip_tags ct where ct.clip_id = update_clip_with_tags.clip_id;

  insert into public.clip_tags (clip_id, user_id)
  select update_clip_with_tags.clip_id, t.user_id from unnest(user_ids) as t(user_id)
  on conflict do nothing;

  insert into public.clip_tags (clip_id, label)
  select update_clip_with_tags.clip_id, btrim(l.label) from unnest(labels) as l(label)
  where btrim(l.label) <> ''
  on conflict do nothing;

  if (select count(*) from public.clip_tags ct where ct.clip_id = update_clip_with_tags.clip_id) > 20 then
    raise exception 'A clip can have at most 20 tags';
  end if;

  return query select * from public.clip_tags ct where ct.clip_id = update_clip_with_tags.clip_id;
end;
$$;

revoke execute on function public.update_clip_with_tags(uuid, text, text, bigint, uuid[], text[]) from public, anon;
grant execute on function public.update_clip_with_tags(uuid, text, text, bigint, uuid[], text[]) to authenticated;
```

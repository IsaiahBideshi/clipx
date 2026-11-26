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

There's at most one row per pair of users, in either direction (unique index `friendships_pair_key` on `least(user_id, friend_id), greatest(user_id, friend_id)`), so sending a request to someone who already sent you one fails instead of creating a second row.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `friend_id` | `uuid` | Primary |
| `status` | `text` |  Nullable |

## Table `notifications`

What the navbar's notifications popup lists. Rows are only inserted and changed by database functions (`notify_friendship_change`, `create_clip_with_tags`, `update_clip_with_tags`), so clients can only read and delete their own. `type` has no check constraint: adding a type is a change to the functions that write it, and the app skips types it doesn't know, so older versions ignore new ones.

| `type` | Sent to | `actor_id` | Shown as |
|--------|---------|------------|----------|
| `friend_request` | The person a request was sent to | The sender | "Alex sent you a friend request", with Accept and Decline |
| `friend_accepted` | Both people, when a request is accepted | The other person | "You are now friends with Alex". The accepter's `friend_request` row is changed into this one. |
| `friend_removed` | The person who was removed | The person who removed them | "Alex removed you as a friend" |
| `clip_tag` | Each user tagged in a clip that isn't private (when it's uploaded, when they're added to it, or when it stops being private) | The clip's owner | "Alex tagged you in Clutch", opens the clip |
| `friend_clip` | The owner's other friends, when a clip that isn't private is uploaded or stops being private | The clip's owner | "Alex uploaded Clutch", opens the clip |

The `clip_tag` and `friend_clip` rows have a `clip_id` and are deleted with their clip, when the clip is made private, when a friends-only clip's owner and the recipient stop being friends, and (for `clip_tag`) when that user is untagged. A user tagged after the upload gets a `clip_tag` that replaces their `friend_clip`.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` | Recipient, references `users` (cascade) |
| `actor_id` | `uuid` | Nullable, references `users` (cascade) |
| `clip_id` | `uuid` | Nullable, references `clips` (cascade) |
| `type` | `text` |  |
| `created_at` | `timestamptz` |  |

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

### `notifications`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can delete their notifications` | DELETE | public | PERMISSIVE | `(auth.uid() = user_id)` | — |
| `Users can view their notifications` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |

## Functions

### `create_clip_with_tags`

Called by the upload flow (`supabase.rpc`). Inserts a clip owned by the caller and its tags in one transaction, so any error leaves neither behind. Tagged users must be accepted friends, labels are trimmed and at most 50 characters, duplicate tags are skipped, and a clip can have at most 20 tags. The renderer checks the same limits before uploading (`getClipTagsError` in `src/lib/clipsApi.js`). A clip that isn't private sends notifications through `notify_clip_shared`.

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

  if create_clip_with_tags.visibility <> 'private' then
    perform public.notify_clip_shared(new_clip_id, caller_id, user_ids);
  end if;

  return new_clip_id;
end;
$$;

revoke execute on function public.create_clip_with_tags(text, text, bigint, text, text, text, uuid[], text[]) from public, anon;
grant execute on function public.create_clip_with_tags(text, text, bigint, text, text, text, uuid[], text[]) to authenticated;
```

### `update_clip_with_tags`

Called by the Library's edit dialog (`supabase.rpc`). Updates the title, visibility and game of a clip the caller owns and replaces its tags in one transaction. It locks the clip row first, so two saves of the same clip run one after the other and the last one wins. It checks the same rules as `create_clip_with_tags`, except users who are already tagged stay allowed after they stop being friends. Returns the clip's new `clip_tags` rows.

Its notifications compare the clip before and after the save: making it private deletes all of the clip's notifications, making a private clip shared sends them like a new upload (`notify_clip_shared`), and otherwise only newly tagged users get a `clip_tag` (replacing their `friend_clip` for it) and untagged users lose theirs. Tags are deleted and reinserted on every save, so this can't be a trigger on `clip_tags`.

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
  old_visibility text;
  old_user_ids uuid[];
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.visibility into old_visibility from public.clips c
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

  select coalesce(array_agg(ct.user_id), '{}') into old_user_ids from public.clip_tags ct
  where ct.clip_id = update_clip_with_tags.clip_id and ct.user_id is not null;

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

  if update_clip_with_tags.visibility = 'private' then
    delete from public.notifications n where n.clip_id = update_clip_with_tags.clip_id;
  elsif old_visibility = 'private' then
    perform public.notify_clip_shared(update_clip_with_tags.clip_id, caller_id, user_ids);
  else
    delete from public.notifications n
    where n.clip_id = update_clip_with_tags.clip_id
      and ((n.type = 'clip_tag' and not (n.user_id = any(coalesce(user_ids, '{}'))))
        or (n.type = 'friend_clip' and n.user_id = any(coalesce(user_ids, '{}'))));

    insert into public.notifications (user_id, actor_id, type, clip_id)
    select distinct t.user_id, caller_id, 'clip_tag', update_clip_with_tags.clip_id
    from unnest(user_ids) as t(user_id)
    where not (t.user_id = any(old_user_ids));
  end if;

  return query select * from public.clip_tags ct where ct.clip_id = update_clip_with_tags.clip_id;
end;
$$;

revoke execute on function public.update_clip_with_tags(uuid, text, text, bigint, uuid[], text[]) from public, anon;
grant execute on function public.update_clip_with_tags(uuid, text, text, bigint, uuid[], text[]) to authenticated;
```

### `notify_clip_shared`

Called by `create_clip_with_tags` and `update_clip_with_tags` when a clip is shared (uploaded or made not private). Sends each tagged user a `clip_tag` and the owner's other accepted friends a `friend_clip`, so nobody gets both for the same clip. Clients can't call it.

```sql
create or replace function public.notify_clip_shared(shared_clip_id uuid, owner_id uuid, tagged_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, type, clip_id)
  select distinct t.user_id, owner_id, 'clip_tag', shared_clip_id
  from unnest(tagged_ids) as t(user_id);

  insert into public.notifications (user_id, actor_id, type, clip_id)
  select f.friend, owner_id, 'friend_clip', shared_clip_id
  from (
    select case when fs.user_id = owner_id then fs.friend_id else fs.user_id end as friend
    from public.friendships fs
    where fs.status = 'accepted' and (fs.user_id = owner_id or fs.friend_id = owner_id)
  ) as f
  where not (f.friend = any(coalesce(tagged_ids, '{}')));
end;
$$;

revoke execute on function public.notify_clip_shared(uuid, uuid, uuid[]) from public, anon, authenticated;
```

### `notify_friendship_change`

Trigger on `friendships` (after insert, update or delete, for each row) that writes the friend notifications:

- A new pending request sends the recipient a `friend_request`.
- Accepting changes the accepter's `friend_request` into a `friend_accepted` (so accepting on the Profile page or in the popup updates the same card) and sends the sender a `friend_accepted`.
- Deleting a friendship (declined, cancelled or removed) deletes the pair's `friend_request` and `friend_accepted` rows. Ending an accepted friendship also deletes each person's `clip_tag` and `friend_clip` rows for the other's friends-only clips, which they can't see anymore. Removing an accepted friend also sends the other person a `friend_removed`, with the remover from `auth.uid()`. Deletes without a signed-in caller (service role, account deletion) send nothing.

```sql
create or replace function public.notify_friendship_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.notifications (user_id, actor_id, type)
      values (new.friend_id, new.user_id, 'friend_request');
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then
      update public.notifications n
      set type = 'friend_accepted'
      where n.user_id = new.friend_id and n.actor_id = new.user_id and n.type = 'friend_request';

      insert into public.notifications (user_id, actor_id, type)
      values (new.user_id, new.friend_id, 'friend_accepted');
    end if;
  else
    delete from public.notifications n
    where n.type in ('friend_request', 'friend_accepted')
      and ((n.user_id = old.user_id and n.actor_id = old.friend_id)
        or (n.user_id = old.friend_id and n.actor_id = old.user_id));

    if old.status = 'accepted' then
      delete from public.notifications n
      using public.clips c
      where n.clip_id = c.id and c.visibility = 'friends'
        and ((n.user_id = old.user_id and c.owner_id = old.friend_id)
          or (n.user_id = old.friend_id and c.owner_id = old.user_id));

      if caller_id in (old.user_id, old.friend_id) then
        insert into public.notifications (user_id, actor_id, type)
        values (case when caller_id = old.user_id then old.friend_id else old.user_id end, caller_id, 'friend_removed');
      end if;
    end if;
  end if;

  return null;
end;
$$;

create trigger notify_friendship_change
after insert or update or delete on public.friendships
for each row execute function public.notify_friendship_change();
```

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

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `clip_id` | `uuid` | Primary |
| `user_id` | `uuid` | Primary |

## Table `friendships`

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
| `Owner can tag users in their clip` | INSERT | public | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM clips   WHERE ((clips.id = clip_tags.clip_id) AND (clips.owner_id = auth.uid()))))` |
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
| `Users can accept friend request` | UPDATE | public | PERMISSIVE | `(auth.uid() = friend_id)` | `(status = 'accepted'::text)` |
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


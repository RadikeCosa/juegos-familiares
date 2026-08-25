-- Incremento 12.1 — persistencia de finished e historial minimo.
--
-- Prepara estructura para end_session() autoritativa futura. No implementa
-- RPC de cierre, read model finished, UI final, estadisticas ni Realtime.

alter table public.game_sessions
  add column finished_at timestamptz;

alter table public.game_sessions
  drop constraint game_sessions_state_check;

alter table public.game_sessions
  add constraint game_sessions_state_check
  check (
    state in (
      'role_reveal',
      'discussion',
      'voting_first',
      'tie_discussion',
      'voting_second',
      'impostor_guess',
      'round_result',
      'scoreboard',
      'finished'
    )
  );

alter table public.game_sessions
  add constraint game_sessions_finished_at_requires_finished_check
  check (finished_at is null or state = 'finished');

create table public.game_session_history (
  id uuid primary key default extensions.gen_random_uuid(),
  game_session_id uuid not null,
  room_id uuid not null,
  group_id uuid not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  closed_by_player_id uuid not null,
  round_count integer not null,
  roster jsonb not null,
  final_scores jsonb not null,
  winner_player_ids uuid[] not null,
  winners jsonb not null,
  created_at timestamptz not null default now(),
  constraint game_session_history_game_session_id_key
    unique (game_session_id),
  constraint game_session_history_id_game_session_key
    unique (id, game_session_id),
  constraint game_session_history_round_count_check
    check (round_count >= 1),
  constraint game_session_history_roster_array_check
    check (jsonb_typeof(roster) = 'array'),
  constraint game_session_history_final_scores_array_check
    check (jsonb_typeof(final_scores) = 'array'),
  constraint game_session_history_winner_player_ids_check
    check (coalesce(array_length(winner_player_ids, 1), 0) >= 1),
  constraint game_session_history_winners_array_check
    check (
      jsonb_typeof(winners) = 'array'
      and jsonb_array_length(winners) >= 1
    ),
  constraint game_session_history_game_session_group_fkey
    foreign key (game_session_id, group_id)
    references public.game_sessions (id, group_id),
  constraint game_session_history_room_group_fkey
    foreign key (group_id, room_id)
    references public.rooms (group_id, id),
  constraint game_session_history_closed_by_session_player_fkey
    foreign key (game_session_id, closed_by_player_id)
    references public.session_players (game_session_id, player_id)
);

alter table public.game_session_history enable row level security;

create table public.round_history (
  id uuid primary key default extensions.gen_random_uuid(),
  game_session_history_id uuid not null,
  game_session_id uuid not null,
  round_id uuid not null,
  group_id uuid not null,
  number integer not null,
  impostor_player_id uuid not null,
  round_winner text not null,
  discovered_by_vote boolean not null,
  impostor_guess_text text,
  impostor_guess_correct boolean,
  scored_at timestamptz not null,
  scoring_summary jsonb not null,
  created_at timestamptz not null default now(),
  constraint round_history_round_id_key
    unique (round_id),
  constraint round_history_game_session_number_key
    unique (game_session_id, number),
  constraint round_history_number_check
    check (number >= 1),
  constraint round_history_round_winner_check
    check (round_winner in ('impostor', 'group')),
  constraint round_history_guess_consistency_check
    check (
      (
        impostor_guess_text is null
        and impostor_guess_correct is null
      )
      or (
        impostor_guess_text is not null
        and impostor_guess_correct is not null
      )
    ),
  constraint round_history_scoring_summary_object_check
    check (
      jsonb_typeof(scoring_summary) = 'object'
      and scoring_summary ? 'rule'
      and scoring_summary ? 'awarded'
    ),
  constraint round_history_game_session_history_fkey
    foreign key (game_session_history_id, game_session_id)
    references public.game_session_history (id, game_session_id)
    on delete cascade,
  constraint round_history_round_fkey
    foreign key (round_id, game_session_id, group_id)
    references public.rounds (id, game_session_id, group_id),
  constraint round_history_impostor_session_player_fkey
    foreign key (game_session_id, impostor_player_id)
    references public.session_players (game_session_id, player_id)
);

alter table public.round_history enable row level security;

create index game_session_history_group_finished_at_idx
  on public.game_session_history (group_id, finished_at desc);

create index round_history_game_session_number_idx
  on public.round_history (game_session_id, number);

revoke all on table public.game_session_history from anon, authenticated, public;
revoke all on table public.round_history from anon, authenticated, public;

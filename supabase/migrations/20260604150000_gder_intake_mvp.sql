create extension if not exists pgcrypto;
create schema if not exists gder_intake;

comment on schema gder_intake is 'Private intake workflow data for GDER. Public web pages must never expose these tables directly.';

create or replace function gder_intake.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function gder_intake.log_event(
  p_case_id uuid,
  p_event_type text,
  p_actor_scope text,
  p_payload jsonb default '{}'::jsonb,
  p_actor_identifier text default null
)
returns uuid
language plpgsql
security definer
set search_path = gder_intake, public
as $$
declare
  v_event_id uuid;
begin
  insert into gder_intake.intake_events (
    case_id,
    event_type,
    actor_scope,
    actor_identifier,
    payload
  )
  values (
    p_case_id,
    p_event_type,
    p_actor_scope,
    p_actor_identifier,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create table if not exists gder_intake.intake_cases (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique,
  draft_token uuid not null unique default gen_random_uuid(),
  applicant_status_token uuid not null unique default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'email_pending', 'submitted', 'in_review', 'needs_more_info', 'closed', 'rejected', 'archived')),
  submission_type text not null default 'review' check (submission_type in ('review', 'correction')),
  is_private boolean not null default true,
  public_record_path text,
  entity_slug text,
  entity_name text,
  legal_name text,
  entity_type text,
  legal_wrapper_type text,
  jurisdiction text,
  official_website text,
  request_summary text,
  governance text,
  operating_control text,
  notes text,
  representative_name text,
  representative_role text,
  official_email text,
  official_email_normalized text,
  email_verified_at timestamptz,
  submit_requested_at timestamptz,
  submitted_at timestamptz,
  triaged_at timestamptz,
  closed_at timestamptz,
  wallet_claimed_chain_id text,
  wallet_claimed_address text,
  wallet_proof_status text not null default 'not_started' check (wallet_proof_status in ('not_started', 'challenge_issued', 'proof_submitted', 'verified', 'manual_review_pending', 'rejected')),
  draft_payload jsonb not null default '{}'::jsonb,
  submission_snapshot jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_client_seen_at timestamptz not null default timezone('utc', now()),
  constraint intake_cases_private_only_mvp check (is_private = true and public_record_path is null)
);

comment on table gder_intake.intake_cases is 'Private intake case files. RLS intentionally has no anon/authenticated read policies; use edge functions with explicit logic.';
comment on column gder_intake.intake_cases.case_reference is 'Applicant-safe case reference for status checks and support.';
comment on column gder_intake.intake_cases.draft_token is 'Private browser-held token used for create/update draft operations.';
comment on column gder_intake.intake_cases.applicant_status_token is 'Applicant-safe token required together with case_reference for public status lookups.';
comment on column gder_intake.intake_cases.public_record_path is 'Reserved internal field. Must stay null in the MVP because submission does not publish anything automatically.';
comment on column gder_intake.intake_cases.wallet_proof_status is 'Wallet breadcrumb only proves control of a claimed wallet, not legal authority or registry standing.';

create table if not exists gder_intake.intake_evidence_urls (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references gder_intake.intake_cases(id) on delete cascade,
  position integer not null check (position > 0),
  url text not null,
  hostname text,
  evidence_kind text not null default 'supporting_url' check (evidence_kind in ('supporting_url', 'official_source', 'explorer', 'other')),
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table gder_intake.intake_evidence_urls is 'Normalized public evidence URLs attached to a private intake case.';

create table if not exists gder_intake.intake_attachment_metadata (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references gder_intake.intake_cases(id) on delete cascade,
  client_file_name text not null,
  mime_type text,
  byte_size bigint,
  sha256_hex text,
  storage_bucket text,
  storage_object_path text,
  upload_status text not null default 'not_uploaded' check (upload_status in ('not_uploaded', 'pending_upload', 'uploaded', 'quarantined', 'rejected', 'deleted')),
  upload_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table gder_intake.intake_attachment_metadata is 'Attachment manifest only. Upload plumbing can be added later without changing case identity.';

create table if not exists gder_intake.intake_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references gder_intake.intake_cases(id) on delete cascade,
  event_type text not null,
  actor_scope text not null check (actor_scope in ('public_applicant', 'system', 'internal_triage')),
  actor_identifier text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table gder_intake.intake_events is 'Append-only event log for auditability and applicant/support continuity.';

create table if not exists gder_intake.email_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references gder_intake.intake_cases(id) on delete cascade,
  email_address text not null,
  token_hash text not null unique,
  challenge_url text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'used', 'expired', 'canceled')),
  send_provider text,
  provider_message_id text,
  expires_at timestamptz not null,
  sent_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table gder_intake.email_verification_challenges is 'Submitting a case is not enough: the representative email must confirm before the intake becomes fully submitted.';

create table if not exists gder_intake.wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references gder_intake.intake_cases(id) on delete cascade,
  challenge_reference text not null unique,
  challenge_nonce text not null unique,
  chain_id text not null,
  wallet_address text not null,
  breadcrumb_address text not null,
  exact_amount_wei numeric(78,0) not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'canceled', 'manual_review')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table gder_intake.wallet_challenges is 'Challenge instructions for optional breadcrumb wallet proof.';

create table if not exists gder_intake.wallet_proofs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references gder_intake.intake_cases(id) on delete cascade,
  wallet_challenge_id uuid not null references gder_intake.wallet_challenges(id) on delete cascade,
  transaction_hash text not null unique,
  chain_id text not null,
  claimed_wallet_address text not null,
  from_address text,
  to_address text,
  value_wei numeric(78,0),
  verification_state text not null default 'pending_lookup' check (verification_state in ('pending_lookup', 'verified', 'manual_review_pending', 'rejected')),
  verification_detail jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default timezone('utc', now()),
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table gder_intake.wallet_proofs is 'Proof artefacts for claimed wallet control. Verification outcome does not imply legal authority.';

create index if not exists intake_cases_status_created_at_idx
  on gder_intake.intake_cases (status, created_at desc);
create index if not exists intake_cases_entity_slug_idx
  on gder_intake.intake_cases (entity_slug);
create index if not exists intake_cases_official_email_normalized_idx
  on gder_intake.intake_cases (official_email_normalized);
create index if not exists intake_cases_updated_at_idx
  on gder_intake.intake_cases (updated_at desc);
create index if not exists intake_evidence_urls_case_position_idx
  on gder_intake.intake_evidence_urls (case_id, position);
create index if not exists intake_attachment_case_created_idx
  on gder_intake.intake_attachment_metadata (case_id, created_at desc);
create index if not exists intake_events_case_created_idx
  on gder_intake.intake_events (case_id, created_at desc);
create index if not exists email_verification_case_status_idx
  on gder_intake.email_verification_challenges (case_id, status, created_at desc);
create index if not exists email_verification_expires_idx
  on gder_intake.email_verification_challenges (expires_at);
create index if not exists wallet_challenges_case_status_idx
  on gder_intake.wallet_challenges (case_id, status, created_at desc);
create index if not exists wallet_challenges_expires_idx
  on gder_intake.wallet_challenges (expires_at);
create index if not exists wallet_proofs_case_created_idx
  on gder_intake.wallet_proofs (case_id, created_at desc);
create index if not exists wallet_proofs_challenge_created_idx
  on gder_intake.wallet_proofs (wallet_challenge_id, created_at desc);

create trigger intake_cases_set_updated_at
before update on gder_intake.intake_cases
for each row execute function gder_intake.set_updated_at();

create trigger intake_attachment_metadata_set_updated_at
before update on gder_intake.intake_attachment_metadata
for each row execute function gder_intake.set_updated_at();

create trigger wallet_proofs_set_updated_at
before update on gder_intake.wallet_proofs
for each row execute function gder_intake.set_updated_at();

alter table gder_intake.intake_cases enable row level security;
alter table gder_intake.intake_evidence_urls enable row level security;
alter table gder_intake.intake_attachment_metadata enable row level security;
alter table gder_intake.intake_events enable row level security;
alter table gder_intake.email_verification_challenges enable row level security;
alter table gder_intake.wallet_challenges enable row level security;
alter table gder_intake.wallet_proofs enable row level security;

revoke all on schema gder_intake from anon, authenticated;
revoke all on all tables in schema gder_intake from anon, authenticated;
revoke all on all functions in schema gder_intake from anon, authenticated;

-- Optional future storage scaffold (manual enable when file uploads are wired end-to-end):
-- insert into storage.buckets (id, name, public)
-- values ('gder-intake-attachments', 'gder-intake-attachments', false)
-- on conflict (id) do nothing;

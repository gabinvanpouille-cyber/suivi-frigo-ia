-- =====================================================================
--  SUIVI FRIGO — Schéma Supabase complet
--  Traçabilité des températures de frigo (HACCP) — multi-fermes
--  À exécuter dans : Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- 1.1 Fermes (les « locataires » de l'application)
create table if not exists public.fermes (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,             -- saisi à la connexion, ex : "bellevue"
  nom                text not null,
  adresse            text,
  timezone           text not null default 'Europe/Paris',
  rappel_matin       time not null default '08:00',    -- doit tomber sur :00 ou :30
  rappel_apresmidi   time not null default '13:30',    -- doit tomber sur :00 ou :30
  alerte_admin       time not null default '18:00',    -- doit tomber sur :00 ou :30
  actif              boolean not null default true,
  created_at         timestamptz not null default now(),
  constraint fermes_code_format check (code ~ '^[a-z0-9][a-z0-9-]{1,30}$')
);

-- 1.2 Profils (1 ligne par compte, liée à auth.users)
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  ferme_id     uuid references public.fermes(id) on delete cascade,
  identifiant  text not null,
  nom_complet  text,
  role         text not null default 'salarie'
                 check (role in ('super_admin','admin','salarie')),
  telephone    text,                                   -- format E.164 pour les SMS : +33612345678
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint profiles_identifiant_format check (identifiant ~ '^[a-z0-9][a-z0-9._-]{1,30}$'),
  unique (ferme_id, identifiant)
);

-- 1.3 Frigos / équipements froids
create table if not exists public.frigos (
  id           uuid primary key default gen_random_uuid(),
  ferme_id     uuid not null references public.fermes(id) on delete cascade,
  nom          text not null,
  emplacement  text,
  temp_min     numeric(5,2) not null default 0,
  temp_max     numeric(5,2) not null default 4,
  ordre        integer not null default 0,
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint frigos_seuils check (temp_min < temp_max)
);
create index if not exists frigos_ferme_idx on public.frigos(ferme_id, actif, ordre);

-- 1.4 Relevés (une session de relevé, à une heure donnée)
create table if not exists public.releves (
  id                uuid primary key default gen_random_uuid(),
  ferme_id          uuid not null references public.fermes(id) on delete cascade,
  auteur_id         uuid references public.profiles(id) on delete set null,
  -- Nom figé au moment du relevé : la traçabilité survit à la suppression du compte.
  auteur_nom        text,
  date_releve       date not null default (now() at time zone 'Europe/Paris')::date,
  heure_releve      time not null,
  statut            text not null default 'brouillon' check (statut in ('brouillon','valide')),
  remarque          text,
  photo_url         text,
  valide_at         timestamptz,
  modifie_at        timestamptz,
  nb_modifications  integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists releves_ferme_date_idx on public.releves(ferme_id, date_releve desc);
create index if not exists releves_auteur_idx on public.releves(auteur_id, date_releve desc);

-- 1.5 Mesures (une ligne par frigo dans un relevé)
create table if not exists public.mesures (
  id           uuid primary key default gen_random_uuid(),
  releve_id    uuid not null references public.releves(id) on delete cascade,
  frigo_id     uuid not null references public.frigos(id) on delete cascade,
  temperature  numeric(5,2),
  seuil_min    numeric(5,2) not null,   -- figé au moment du relevé (traçabilité)
  seuil_max    numeric(5,2) not null,
  remarque     text,
  photo_url    text,
  created_at   timestamptz not null default now(),
  conforme     boolean generated always as (
                 temperature is not null
                 and temperature >= seuil_min
                 and temperature <= seuil_max
               ) stored,
  unique (releve_id, frigo_id)
);
create index if not exists mesures_releve_idx on public.mesures(releve_id);
create index if not exists mesures_frigo_idx on public.mesures(frigo_id, created_at desc);

-- 1.6 Historique (qui a créé / validé / modifié quoi)
create table if not exists public.releve_historique (
  id          uuid primary key default gen_random_uuid(),
  releve_id   uuid not null references public.releves(id) on delete cascade,
  ferme_id    uuid not null references public.fermes(id) on delete cascade,
  auteur_id   uuid references public.profiles(id) on delete set null,
  auteur_nom  text,
  action      text not null check (action in ('creation','validation','modification','suppression')),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists historique_releve_idx on public.releve_historique(releve_id, created_at desc);
create index if not exists historique_ferme_idx on public.releve_historique(ferme_id, created_at desc);

-- 1.7 Abonnements push (1 ligne par appareil)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  ferme_id    uuid references public.fermes(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_user_idx on public.push_subscriptions(user_id);
create index if not exists push_ferme_idx on public.push_subscriptions(ferme_id);

-- 1.8 Journal des notifications (centre de notifications dans l'app)
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  ferme_id        uuid references public.fermes(id) on delete cascade,
  destinataire_id uuid references public.profiles(id) on delete cascade,
  type            text not null check (type in ('rappel','recap','modification','alerte_temp','alerte_manquant')),
  titre           text not null,
  corps           text,
  lien            text,
  lu              boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists notif_dest_idx on public.notifications(destinataire_id, lu, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Fonctions utilitaires (SECURITY DEFINER : évitent la récursion RLS)
-- ---------------------------------------------------------------------

create or replace function public.my_ferme_id()
returns uuid language sql stable security definer set search_path = public as $$
  select ferme_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('admin','super_admin') and actif
     from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'super_admin' and actif
     from public.profiles where id = auth.uid()), false)
$$;

grant execute on function public.my_ferme_id, public.my_role,
                         public.is_admin, public.is_super_admin to authenticated;

-- ---------------------------------------------------------------------
-- 3. Déclencheurs métier
-- ---------------------------------------------------------------------

-- 3.1 Empêche un utilisateur de s'auto-promouvoir ou de changer de ferme.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() est NULL quand la clé service_role agit (Netlify Functions) : on laisse passer.
  if auth.uid() is not null and not public.is_super_admin() then
    new.role     := old.role;
    new.ferme_id := old.ferme_id;
    new.actif    := old.actif;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3.2 Colonnes dérivées du relevé (AVANT écriture : on modifie NEW).
create or replace function public.avant_releve()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Nom figé : la traçabilité survit à la suppression du compte.
    if new.auteur_nom is null then
      select coalesce(nom_complet, identifiant) into new.auteur_nom
      from public.profiles where id = new.auteur_id;
    end if;
    if new.statut = 'valide' and new.valide_at is null then
      new.valide_at := now();
    end if;
    return new;
  end if;

  -- UPDATE
  if old.statut = 'brouillon' and new.statut = 'valide' then
    new.valide_at := now();
  elsif old.statut = 'valide' then
    new.modifie_at := now();
    new.nb_modifications := old.nb_modifications + 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_avant_releve on public.releves;
create trigger trg_avant_releve
  before insert or update on public.releves
  for each row execute function public.avant_releve();

-- 3.3 Journal de traçabilité (APRÈS écriture : la ligne relevé existe,
--     la clé étrangère de releve_historique est donc satisfaite).
create or replace function public.apres_releve()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_auteur uuid;
  v_nom    text;
begin
  -- L'auteur de l'action (connecté), s'il possède bien un profil.
  select id, coalesce(nom_complet, identifiant)
    into v_auteur, v_nom
  from public.profiles
  where id = coalesce(auth.uid(), new.auteur_id);
  v_nom := coalesce(v_nom, new.auteur_nom);

  if tg_op = 'INSERT' then
    insert into public.releve_historique(releve_id, ferme_id, auteur_id, auteur_nom, action, details)
    values (new.id, new.ferme_id, v_auteur, v_nom, 'creation',
            jsonb_build_object('heure', new.heure_releve, 'statut', new.statut));

    if new.statut = 'valide' then
      insert into public.releve_historique(releve_id, ferme_id, auteur_id, auteur_nom, action, details)
      values (new.id, new.ferme_id, v_auteur, v_nom, 'validation',
              jsonb_build_object('heure', new.heure_releve, 'revision', 0));
    end if;
    return null;
  end if;

  -- UPDATE
  if old.statut = 'brouillon' and new.statut = 'valide' then
    insert into public.releve_historique(releve_id, ferme_id, auteur_id, auteur_nom, action, details)
    values (new.id, new.ferme_id, v_auteur, v_nom, 'validation',
            jsonb_build_object('heure', new.heure_releve, 'revision', new.nb_modifications));
  elsif old.statut = 'valide' then
    insert into public.releve_historique(releve_id, ferme_id, auteur_id, auteur_nom, action, details)
    values (new.id, new.ferme_id, v_auteur, v_nom, 'modification',
            jsonb_build_object(
              'heure_avant', old.heure_releve, 'heure_apres', new.heure_releve,
              'remarque_avant', old.remarque,  'remarque_apres', new.remarque,
              'revision', new.nb_modifications));
  end if;
  return null;
end $$;

drop trigger if exists trg_apres_releve on public.releves;
create trigger trg_apres_releve
  after insert or update on public.releves
  for each row execute function public.apres_releve();

-- Nettoyage d'une version antérieure du déclencheur, si elle existe.
drop trigger if exists trg_log_releve on public.releves;
drop function if exists public.log_releve_change();

-- 3.4 Fige les seuils du frigo au moment de la mesure.
create or replace function public.snapshot_seuils()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seuil_min is null or new.seuil_max is null then
    select temp_min, temp_max into new.seuil_min, new.seuil_max
    from public.frigos where id = new.frigo_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_snapshot_seuils on public.mesures;
create trigger trg_snapshot_seuils
  before insert on public.mesures
  for each row execute function public.snapshot_seuils();

-- ---------------------------------------------------------------------
-- 4. Vues de restitution
-- ---------------------------------------------------------------------

create or replace view public.v_mesures_completes
with (security_invoker = true) as
select
  m.id                as mesure_id,
  r.id                as releve_id,
  r.ferme_id,
  f.nom               as ferme_nom,
  f.code              as ferme_code,
  r.date_releve,
  r.heure_releve,
  r.statut,
  r.nb_modifications,
  r.modifie_at,
  r.remarque          as remarque_releve,
  coalesce(p.identifiant, r.auteur_nom, 'compte supprimé') as auteur_identifiant,
  coalesce(p.nom_complet, p.identifiant, r.auteur_nom, 'compte supprimé') as auteur_nom,
  fr.id               as frigo_id,
  fr.nom              as frigo_nom,
  fr.emplacement      as frigo_emplacement,
  m.temperature,
  m.seuil_min,
  m.seuil_max,
  m.conforme,
  m.remarque          as remarque_mesure,
  m.photo_url,
  (r.date_releve + r.heure_releve) as horodatage
from public.mesures m
join public.releves r on r.id = m.releve_id
join public.frigos  fr on fr.id = m.frigo_id
join public.fermes  f  on f.id = r.ferme_id
left join public.profiles p on p.id = r.auteur_id;

-- Journées sans aucun relevé validé (utilisé par le tableau de bord admin)
create or replace function public.jours_sans_releve(p_ferme uuid, p_depuis date, p_jusqu date)
returns table(jour date)
language sql stable security definer set search_path = public as $$
  select d::date
  from generate_series(p_depuis, p_jusqu, interval '1 day') d
  where not exists (
    select 1 from public.releves r
    where r.ferme_id = p_ferme
      and r.date_releve = d::date
      and r.statut = 'valide')
$$;
grant execute on function public.jours_sans_releve to authenticated;

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.fermes             enable row level security;
alter table public.profiles           enable row level security;
alter table public.frigos             enable row level security;
alter table public.releves            enable row level security;
alter table public.mesures            enable row level security;
alter table public.releve_historique  enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications      enable row level security;

-- 5.1 Fermes
drop policy if exists fermes_select on public.fermes;
create policy fermes_select on public.fermes for select to authenticated
  using (id = public.my_ferme_id() or public.is_super_admin());

drop policy if exists fermes_update on public.fermes;
create policy fermes_update on public.fermes for update to authenticated
  using (public.is_super_admin() or (public.is_admin() and id = public.my_ferme_id()))
  with check (public.is_super_admin() or (public.is_admin() and id = public.my_ferme_id()));

drop policy if exists fermes_insert on public.fermes;
create policy fermes_insert on public.fermes for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists fermes_delete on public.fermes;
create policy fermes_delete on public.fermes for delete to authenticated
  using (public.is_super_admin());

-- 5.2 Profils
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or ferme_id = public.my_ferme_id() or public.is_super_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()
         or public.is_super_admin()
         or (public.is_admin() and ferme_id = public.my_ferme_id()))
  with check (id = auth.uid()
         or public.is_super_admin()
         or (public.is_admin() and ferme_id = public.my_ferme_id()));

-- (création / suppression de comptes : uniquement via Netlify Function + service_role)

-- 5.3 Frigos
drop policy if exists frigos_select on public.frigos;
create policy frigos_select on public.frigos for select to authenticated
  using (ferme_id = public.my_ferme_id() or public.is_super_admin());

drop policy if exists frigos_write on public.frigos;
create policy frigos_write on public.frigos for all to authenticated
  using (public.is_super_admin() or (public.is_admin() and ferme_id = public.my_ferme_id()))
  with check (public.is_super_admin() or (public.is_admin() and ferme_id = public.my_ferme_id()));

-- 5.4 Relevés
drop policy if exists releves_select on public.releves;
create policy releves_select on public.releves for select to authenticated
  using (ferme_id = public.my_ferme_id() or public.is_super_admin());

drop policy if exists releves_insert on public.releves;
create policy releves_insert on public.releves for insert to authenticated
  with check (ferme_id = public.my_ferme_id() and auteur_id = auth.uid());

drop policy if exists releves_update on public.releves;
create policy releves_update on public.releves for update to authenticated
  using (public.is_super_admin()
         or (public.is_admin() and ferme_id = public.my_ferme_id())
         or (auteur_id = auth.uid() and ferme_id = public.my_ferme_id()))
  with check (ferme_id = public.my_ferme_id() or public.is_super_admin());

drop policy if exists releves_delete on public.releves;
create policy releves_delete on public.releves for delete to authenticated
  using (public.is_super_admin() or (public.is_admin() and ferme_id = public.my_ferme_id()));

-- 5.5 Mesures (héritent du relevé parent)
drop policy if exists mesures_select on public.mesures;
create policy mesures_select on public.mesures for select to authenticated
  using (exists (select 1 from public.releves r
                 where r.id = mesures.releve_id
                   and (r.ferme_id = public.my_ferme_id() or public.is_super_admin())));

drop policy if exists mesures_write on public.mesures;
create policy mesures_write on public.mesures for all to authenticated
  using (exists (select 1 from public.releves r
                 where r.id = mesures.releve_id
                   and (r.ferme_id = public.my_ferme_id() or public.is_super_admin())
                   and (r.auteur_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.releves r
                 where r.id = mesures.releve_id
                   and (r.ferme_id = public.my_ferme_id() or public.is_super_admin())));

-- 5.6 Historique (lecture seule côté client, écriture par les triggers)
drop policy if exists historique_select on public.releve_historique;
create policy historique_select on public.releve_historique for select to authenticated
  using (ferme_id = public.my_ferme_id() or public.is_super_admin());

-- 5.7 Abonnements push
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_admin_read on public.push_subscriptions;
create policy push_admin_read on public.push_subscriptions for select to authenticated
  using (public.is_super_admin() or (public.is_admin() and ferme_id = public.my_ferme_id()));

-- 5.8 Notifications
drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for select to authenticated
  using (destinataire_id = auth.uid() or public.is_super_admin());

drop policy if exists notif_own_update on public.notifications;
create policy notif_own_update on public.notifications for update to authenticated
  using (destinataire_id = auth.uid())
  with check (destinataire_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Stockage des photos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos-releves', 'photos-releves', false)
on conflict (id) do nothing;

-- Chemin imposé : <ferme_id>/<releve_id>/<fichier>
drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos-releves'
         and ((storage.foldername(name))[1] = public.my_ferme_id()::text
              or public.is_super_admin()));

drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos-releves'
              and (storage.foldername(name))[1] = public.my_ferme_id()::text);

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos-releves'
         and ((storage.foldername(name))[1] = public.my_ferme_id()::text)
         and public.is_admin());

-- ---------------------------------------------------------------------
-- 7. Realtime (l'admin voit les modifications en direct)
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.releves;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null; end;
end $$;

-- =====================================================================
--  FIN DU SCHÉMA
-- =====================================================================

-- =====================================================================
--  SUIVI FRIGO — Amorçage : création du tout premier compte
--  À exécuter APRÈS schema.sql
-- =====================================================================
--
--  ÉTAPE 1 — Créer l'utilisateur dans l'interface Supabase
--  ------------------------------------------------------
--  Authentication > Users > "Add user" > "Create new user"
--    Email    : gerant.siege@suivifrigo.app
--    Password : (choisissez un mot de passe solide)
--    Cochez   : "Auto Confirm User"
--
--  Le format de l'email est imposé :  <identifiant>.<code_ferme>@suivifrigo.app
--  Ici l'identifiant est "gerant" et le code ferme "siege".
--
--  ÉTAPE 2 — Exécuter le script ci-dessous dans le SQL Editor
--  ----------------------------------------------------------

do $$
declare
  v_email       text := 'gerant.siege@suivifrigo.app';  -- <= identique à l'étape 1
  v_identifiant text := 'gerant';
  v_code_ferme  text := 'siege';
  v_nom_ferme   text := 'Siège';
  v_nom_complet text := 'Administrateur général';
  v_user_id     uuid;
  v_ferme_id    uuid;
begin
  select id into v_user_id from auth.users where email = v_email;
  if v_user_id is null then
    raise exception 'Utilisateur % introuvable. Créez-le d''abord dans Authentication > Users.', v_email;
  end if;

  insert into public.fermes (code, nom)
  values (v_code_ferme, v_nom_ferme)
  on conflict (code) do update set nom = excluded.nom
  returning id into v_ferme_id;

  if v_ferme_id is null then
    select id into v_ferme_id from public.fermes where code = v_code_ferme;
  end if;

  insert into public.profiles (id, ferme_id, identifiant, nom_complet, role)
  values (v_user_id, v_ferme_id, v_identifiant, v_nom_complet, 'super_admin')
  on conflict (id) do update
    set role = 'super_admin', ferme_id = v_ferme_id, identifiant = v_identifiant;

  raise notice 'Super-administrateur prêt. Connexion : ferme "%" / identifiant "%".',
    v_code_ferme, v_identifiant;
end $$;

-- ---------------------------------------------------------------------
--  Optionnel : jeu de données de démonstration
--  Décommentez le bloc pour créer une ferme d'exemple avec 3 frigos.
-- ---------------------------------------------------------------------
-- do $$
-- declare v_ferme uuid;
-- begin
--   insert into public.fermes (code, nom, adresse)
--   values ('bellevue', 'Ferme de Bellevue', '12 route des Prés, 14000 Caen')
--   on conflict (code) do nothing;
--   select id into v_ferme from public.fermes where code = 'bellevue';
--
--   insert into public.frigos (ferme_id, nom, emplacement, temp_min, temp_max, ordre) values
--     (v_ferme, 'Chambre froide positive', 'Laiterie',   0, 4, 1),
--     (v_ferme, 'Congélateur',             'Réserve', -22, -18, 2),
--     (v_ferme, 'Vitrine réfrigérée',      'Magasin',    2, 6, 3)
--   on conflict do nothing;
-- end $$;

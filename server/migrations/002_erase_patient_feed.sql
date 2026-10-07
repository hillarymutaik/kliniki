-- Erasing a patient must reach the change feed as well as the patients table.
--
-- The feed (`changes`) is append-only for the API role, by design, but every earlier entry for a patient
-- holds a full snapshot of their details, and a device syncing from scratch would download those before
-- reaching the blanked version. This function is the one sanctioned way to rewrite them: it runs with the
-- owner's rights, can only touch the calling clinic's own patient and appointment entries, and does nothing
-- else. Entries are rewritten in place, not deleted, so change numbering is untouched.

CREATE FUNCTION scrub_patient_feed(p_patient text) RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    UPDATE changes
       SET data = jsonb_build_object(
             'id', entity_id, 'name', '[erased]', 'phone', '', 'dob', '1900-01-01',
             'sex', data -> 'sex', 'sha', '', 'allergies', '', 'erased', true)
     WHERE clinic_id = app_clinic_id() AND entity = 'patient' AND entity_id = p_patient;

    -- A visit's reason is clinical information about the person.
    UPDATE changes
       SET data = jsonb_set(data, '{reason}', '"[erased]"')
     WHERE clinic_id = app_clinic_id() AND entity = 'appointment' AND data ->> 'patientId' = p_patient;
  $$;

REVOKE ALL ON FUNCTION scrub_patient_feed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scrub_patient_feed(text) TO {{APP_ROLE}};

-- Sites can now be created in the app, so a site added by mistake needs to be
-- removable. Same stance as practice arms (0007): the app only deletes a site
-- with no records against it; anything with data stays.
create policy anon_delete on sites for delete to anon using (true);

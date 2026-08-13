-- Covers the connector installation foreign key for deletes and joins.
create index if not exists native_projections_installation_id_idx
  on native_projections (installation_id);

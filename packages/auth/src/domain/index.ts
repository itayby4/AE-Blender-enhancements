// Auth domain — stub.
//
// Structural placeholder for the domain layer. The phase-03 package shape
// reserves domain/ for pure auth logic (session state machine, token
// validator) with no Supabase SDK coupling. Migration is deferred to a later
// behavioral phase; this file exists so the layer-tag + deep-import
// enforcement rules have a concrete target.
//
// Not exported from package.json — internal to @pipefx/auth.
export {};

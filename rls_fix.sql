-- One-time manual RLS fix for existing Supabase projects.
-- database/schema.sql is the canonical source; on new deploys it enables RLS
-- and creates these policies automatically on API startup. Run this file in the
-- Supabase SQL Editor only if you need to fix a project whose schema was
-- applied before the automatic RLS setup was added.

ALTER TABLE IF EXISTS public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultation_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clinic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pregnancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pregnancy_tracking_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App full access" ON public.patients;
CREATE POLICY "App full access" ON public.patients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.users;
CREATE POLICY "App full access" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.consultations;
CREATE POLICY "App full access" ON public.consultations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.consultation_transactions;
CREATE POLICY "App full access" ON public.consultation_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.clinic_reports;
CREATE POLICY "App full access" ON public.clinic_reports FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.pregnancies;
CREATE POLICY "App full access" ON public.pregnancies FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.pregnancy_tracking_forms;
CREATE POLICY "App full access" ON public.pregnancy_tracking_forms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.queue_entries;
CREATE POLICY "App full access" ON public.queue_entries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.audit_logs;
CREATE POLICY "App full access" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

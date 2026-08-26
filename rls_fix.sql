-- Enable RLS on existing tables
ALTER TABLE public.clinic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pregnancies ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for the backend's DB role
-- Your Express app handles auth; the DB just allows the app role access
CREATE POLICY "App full access" ON public.clinic_reports FOR ALL USING (true);
CREATE POLICY "App full access" ON public.consultations FOR ALL USING (true);
CREATE POLICY "App full access" ON public.patients FOR ALL USING (true);
CREATE POLICY "App full access" ON public.users FOR ALL USING (true);
CREATE POLICY "App full access" ON public.pregnancies FOR ALL USING (true);

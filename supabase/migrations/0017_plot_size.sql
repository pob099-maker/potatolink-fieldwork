-- Plot size, so a weight can become a yield.
--
-- A form that asks for "yield (t/ha)" asks somebody standing in a paddock to
-- convert kilograms off a plot, and nothing checks that arithmetic — a
-- misplaced decimal is invisible for the rest of the trial. With the size
-- recorded once, the field question becomes the weight on the scales.
--
-- Two typed numbers rather than anything satellite-derived. A research plot is
-- a few tens of square metres and a phone fixes a corner to within several
-- metres, so a walked boundary would carry an error larger than the plot it
-- described. That trade reverses at hectare scale, which is why a record can
-- also carry its own area through an ordinary form field measured in ha or m² —
-- strips across an irregular field or a pivot circle are different lengths, and
-- a trial-wide size would be wrong for every one of them.
--
-- Nullable: a trial that records yield directly, or does not measure weight at
-- all, needs neither.
begin;

alter table trials
  add column if not exists plot_length_m numeric check (plot_length_m > 0);

alter table trials
  add column if not exists plot_width_m numeric check (plot_width_m > 0);

commit;

-- What a trial calls the things it compares.
--
-- Two audiences, one concept. A research trial has treatments — that is what
-- the protocol says and what an analyst expects. An extension trial has
-- practices: the grower is not applying a treatment, they are doing something
-- differently from last season. Fieldwork serves both, so the word follows the
-- trial rather than being chosen once for the whole app.
--
-- Nullable on purpose, and not backfilled. Null means "follow the design" —
-- replicated reads as treatment, observational as practice — so every trial
-- that already exists gets the sensible word without anyone editing it, and
-- keeps tracking the design until somebody overrides it here.
--
-- Nothing in the data changes: the table is still practice_arms and the export
-- still writes one fixed column name, because a column that renamed itself per
-- trial would break the first script that pooled two of them.
alter table trials
  add column if not exists vocabulary text
    check (vocabulary in ('treatment', 'practice'));

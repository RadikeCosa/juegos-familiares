-- Administrative activation authorized by the user for auytacgoahmqpgrkcdga.
-- Apply after the release gates recorded in dictionary/validation.md pass.
-- Internal function verifies at least 300 valid reviewed entries transactionally.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select dictionary_private.set_enabled(true);

-- perf DB の全データを消す(スキーマ・Flyway 履歴は残す)。perf DB 以外では実行できない。
\set ON_ERROR_STOP on
DO $$
BEGIN
    IF current_database() <> 'raisetimeline_perf' THEN
        RAISE EXCEPTION 'perf DB(raisetimeline_perf)以外では実行できません: %', current_database();
    END IF;
END $$;

TRUNCATE users RESTART IDENTITY CASCADE;
